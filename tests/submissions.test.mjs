import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { migrate } from '../scripts/migrations.mjs';
import { createSubmissionStore } from '../src/server/submission-store.mjs';
import { createSubmissionHandler } from '../src/server/submission-handler.mjs';
import { validateSubmission } from '../src/server/validation.mjs';
import { sendNotification, retryNotifications, reconcileNotification, resetUnsentNotification } from '../src/server/notifications.mjs';

let db, store, handler;
const scheduled = [];
const config = { apiKey: 'mock-only-not-a-key', from: 'LimitPact <forms@example.test>', to: 'owner@example.test' };
const input = (type = 'contact', extra = {}) => ({ idempotencyKey: randomUUID(), name: '  Test Trader  ',
  email: ' TEST@example.test ', website: '', ...(type === 'contact' ? { message: '  Test inquiry\r\nSecond line  ' } : { platform: 'Tradovate' }), ...extra });
function request(data, type = 'contact', headers = {}) {
  return new Request(`https://example.test/api/${type === 'beta' ? 'private-beta' : 'contact'}`, {
    method: 'POST', headers: { origin: 'https://example.test', 'content-type': 'application/json', ...headers }, body: JSON.stringify(data),
  });
}
const mockSend = () => vi.fn(async () => Response.json({ id: 'mock-provider-id' }));

beforeAll(async () => {
  // Embedded PostgreSQL, not a SQL mock. No remote URLs or environment files.
  db = new PGlite();
  await migrate(db);
  store = createSubmissionStore(db);
});
beforeEach(async () => {
  await db.query('TRUNCATE limitpact_web.submissions');
  scheduled.length = 0;
  handler = createSubmissionHandler({ getStore: () => store, getOrigin: () => 'https://example.test', scheduleNotification: (id) => scheduled.push(id) });
});
afterAll(async () => { await db.close(); });

describe('durable acceptance', () => {
  test.each(['contact', 'beta'])('%s persists normalized fields before success', async (type) => {
    const response = await handler(request(input(type), type), type);
    expect(response.status).toBe(201);
    const result = await response.json();
    expect(result.accepted).toBe(true);
    const row = await store.get(result.submissionId);
    expect(row).toMatchObject({ form_type: type, name: 'Test Trader', email: 'test@example.test', notification_status: 'pending', delivery_status: 'unknown' });
    expect(row.created_at).toBeTruthy();
    expect(type === 'contact' ? row.message : row.platform).toBe(type === 'contact' ? 'Test inquiry\nSecond line' : 'Tradovate');
    expect(scheduled).toEqual([row.id]);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  test('migration can be reapplied without deleting saved data', async () => {
    const saved = await store.accept(validateSubmission('contact', input()));
    await migrate(db);
    expect(await store.get(saved.id)).toBeTruthy();
  });
  test.each([
    ['contact', { name: ' ' }], ['contact', { email: 'bad' }], ['contact', { message: '' }],
    ['contact', { message: 'x'.repeat(5001) }], ['contact', { name: 'x\r\nInjected' }],
    ['contact', { message: 'bad\u0000data' }], ['beta', { platform: 'Unknown' }], ['beta', { email: null }],
  ])('rejects invalid %s fields %j without a record', async (type, invalid) => {
    const response = await handler(request(input(type, invalid), type), type);
    expect(response.status).toBe(422);
    expect((await response.json()).accepted).toBe(false);
    expect((await db.query('SELECT count(*)::int AS n FROM limitpact_web.submissions')).rows[0].n).toBe(0);
    expect(scheduled).toHaveLength(0);
  });
  test('rejects spam, cross-origin, malformed JSON, and oversized streaming bodies', async () => {
    expect((await handler(request(input('contact', { website: 'bot.test' })), 'contact')).status).toBe(400);
    expect((await handler(request(input(), 'contact', { origin: 'https://evil.test' }), 'contact')).status).toBe(403);
    expect((await handler(request(input(), 'contact', { 'content-type': 'text/plain' }), 'contact')).status).toBe(415);
    const malformed = new Request('https://example.test/api/contact', { method: 'POST', headers: { origin: 'https://example.test', 'content-type': 'application/json' }, body: '{' });
    expect((await handler(malformed, 'contact')).status).toBe(400);
    expect((await handler(request(input('contact', { message: 'x'.repeat(25000) })), 'contact')).status).toBe(413);
    expect(scheduled).toHaveLength(0);
  });
  test('database failure and transaction rollback never return success or schedule email', async () => {
    const failStore = createSubmissionStore({ transaction: (work) => db.transaction(async (tx) => {
      await work(tx);
      throw new Error('simulated commit failure with sensitive details');
    }) });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failHandler = createSubmissionHandler({ getStore: () => failStore, getOrigin: () => 'https://example.test', scheduleNotification: vi.fn() });
    const response = await failHandler(request(input()), 'contact');
    expect(response.status).toBe(503);
    expect((await response.json()).accepted).toBe(false);
    expect((await db.query('SELECT count(*)::int AS n FROM limitpact_web.submissions')).rows[0].n).toBe(0);
    expect(log).toHaveBeenCalledWith('submission_persistence_unavailable');
    log.mockRestore();
  });
  test('post-commit scheduling failure still reports durable acceptance', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failHandler = createSubmissionHandler({ getStore: () => store, getOrigin: () => 'https://example.test', scheduleNotification: () => { throw new Error('unavailable'); } });
    const response = await failHandler(request(input()), 'contact');
    expect(response.status).toBe(201);
    expect((await store.get((await response.json()).submissionId)).notification_status).toBe('pending');
    log.mockRestore();
  });
  test('concurrent retries create one record; changed details with the same key conflict', async () => {
    const data = input();
    const responses = await Promise.all(Array.from({ length: 5 }, () => handler(request(data), 'contact')));
    expect(responses.map((r) => r.status).sort()).toEqual([200, 200, 200, 200, 201]);
    const results = await Promise.all(responses.map((r) => r.json()));
    expect(new Set(results.map((r) => r.submissionId)).size).toBe(1);
    expect((await handler(request({ ...data, message: 'changed' }), 'contact')).status).toBe(409);
    expect((await db.query('SELECT count(*)::int AS n FROM limitpact_web.submissions')).rows[0].n).toBe(1);
  });
  test('new intentional submissions use new keys; quotas are shared across forms and exempt exact retries', async () => {
    const data = input();
    await handler(request(data), 'contact');
    await handler(request(input('beta'), 'beta'), 'beta');
    await handler(request(input()), 'contact');
    const blocked = await handler(request(input()), 'contact');
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBe('3600');
    expect((await handler(request(data), 'contact')).status).toBe(200);
  });
  test('malformed retry keys are validation errors, not server errors', async () => {
    for (const idempotencyKey of [null, 'not-a-uuid', { toString: 'bad' }]) {
      expect((await handler(request(input('contact', { idempotencyKey })), 'contact')).status).toBe(400);
    }
    expect(scheduled).toHaveLength(0);
  });
  test('rotating addresses cannot bypass the site-wide quota', async () => {
    await db.query(`INSERT INTO limitpact_web.submissions
      (id, idempotency_key, request_hash, form_type, name, email, message)
      SELECT md5('id' || i)::uuid, md5('key' || i)::uuid, 'seed', 'contact', 'Quota test',
      'quota' || i || '@example.test', 'Synthetic quota fixture' FROM generate_series(1, 100) i`);
    expect((await handler(request(input()), 'contact')).status).toBe(429);
    expect(scheduled).toHaveLength(0);
  });
});

describe('notification outbox and recovery', () => {
  test.each(['contact', 'beta'])('%s notification contains relevant fields but does not claim delivery', async (type) => {
    const row = await store.accept(validateSubmission(type, input(type)));
    const fetchImpl = mockSend();
    await sendNotification(store, row.id, { config, fetchImpl });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    const payload = JSON.parse(options.body);
    expect(payload.to).toEqual([config.to]);
    expect(payload.from).toBe(config.from);
    expect(payload.reply_to).toBe('test@example.test');
    expect(payload.subject).toContain(type === 'contact' ? 'Contact' : 'Private Beta');
    expect(payload.text).toContain(type === 'contact' ? 'Test inquiry\nSecond line' : 'Tradovate');
    expect(payload.text).toContain('Test Trader');
    expect(await store.get(row.id)).toMatchObject({ notification_status: 'provider_accepted', resend_id: 'mock-provider-id', delivery_status: 'unknown' });
  });
  test('email failure preserves acceptance; a submission retry and notification retry never duplicate records', async () => {
    const data = input();
    const accepted = await (await handler(request(data), 'contact')).json();
    const fail = vi.fn(async () => new Response('provider error might contain secrets', { status: 503 }));
    expect(await sendNotification(store, accepted.submissionId, { config, fetchImpl: fail })).toBe('failed');
    expect(await store.get(accepted.submissionId)).toMatchObject({ notification_status: 'failed', last_error_code: 'resend_http_503', delivery_status: 'unknown' });
    const retry = await (await handler(request(data), 'contact')).json();
    expect(retry.submissionId).toBe(accepted.submissionId);
    const success = mockSend();
    await retryNotifications(store, { config, fetchImpl: success });
    expect(success.mock.calls[0][1].headers['Idempotency-Key']).toBe(fail.mock.calls[0][1].headers['Idempotency-Key']);
    expect(success.mock.calls[0][1].body).toBe(fail.mock.calls[0][1].body);
    await retryNotifications(store, { config, fetchImpl: success });
    expect(success).toHaveBeenCalledTimes(1);
    expect((await db.query('SELECT count(*)::int AS n FROM limitpact_web.submissions')).rows[0].n).toBe(1);
  });
  test('missing credentials leave a recoverable saved record without starting the provider retry clock', async () => {
    const { id } = await store.accept(validateSubmission('beta', input('beta')));
    const fetchImpl = mockSend();
    expect(await sendNotification(store, id, { config: {}, fetchImpl })).toBe('not_configured');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await store.get(id)).toMatchObject({ notification_status: 'pending', first_attempt_at: null, last_error_code: 'notification_not_configured' });
    await sendNotification(store, id, { config, fetchImpl });
    expect((await store.get(id)).notification_status).toBe('provider_accepted');
  });
  test('concurrent notification workers claim only one send', async () => {
    const { id } = await store.accept(validateSubmission('contact', input()));
    const fetchImpl = mockSend();
    await Promise.all([sendNotification(store, id, { config, fetchImpl }), sendNotification(store, id, { config, fetchImpl })]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  test('network ambiguity retries with the frozen payload even if sender config changes', async () => {
    const { id } = await store.accept(validateSubmission('contact', input()));
    const lost = vi.fn(async () => { throw new Error('response lost'); });
    await sendNotification(store, id, { config, fetchImpl: lost });
    const success = mockSend();
    await sendNotification(store, id, { config: { ...config, to: 'changed@example.test' }, fetchImpl: success });
    expect(success.mock.calls[0][1].body).toBe(lost.mock.calls[0][1].body);
    expect(success.mock.calls[0][1].headers['Idempotency-Key']).toBe(lost.mock.calls[0][1].headers['Idempotency-Key']);
  });
  test('provider acceptance followed by a database outage recovers with the same key after lease expiry', async () => {
    const { id } = await store.accept(validateSubmission('contact', input()));
    const failingStore = { ...store, database: { transaction: db.transaction.bind(db), query: () => { throw new Error('db unavailable after send'); } } };
    const fetchImpl = mockSend();
    await expect(sendNotification(failingStore, id, { config, fetchImpl })).rejects.toThrow();
    expect((await store.get(id)).notification_status).toBe('sending');
    await db.query("UPDATE limitpact_web.submissions SET last_attempt_at = clock_timestamp() - interval '2 minutes' WHERE id = $1", [id]);
    await sendNotification(store, id, { config, fetchImpl });
    expect(fetchImpl.mock.calls[0][1].body).toBe(fetchImpl.mock.calls[1][1].body);
    expect(fetchImpl.mock.calls[0][1].headers['Idempotency-Key']).toBe(fetchImpl.mock.calls[1][1].headers['Idempotency-Key']);
    expect((await store.get(id)).notification_status).toBe('provider_accepted');
  });
  test('expired ambiguous sends require review; operator recovery reuses the record', async () => {
    const { id } = await store.accept(validateSubmission('contact', input()));
    await sendNotification(store, id, { config, fetchImpl: async () => { throw new Error('timeout'); } });
    await db.query("UPDATE limitpact_web.submissions SET first_attempt_at = clock_timestamp() - interval '24 hours' WHERE id = $1", [id]);
    const fetchImpl = mockSend();
    await sendNotification(store, id, { config, fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((await store.get(id)).notification_status).toBe('manual_review');
    await resetUnsentNotification(store, id);
    await sendNotification(store, id, { config, fetchImpl });
    expect(fetchImpl.mock.calls[0][1].headers['Idempotency-Key']).toBe(`limitpact/${id}/2`);
    expect((await db.query('SELECT count(*)::int AS n FROM limitpact_web.submissions')).rows[0].n).toBe(1);
  });
  test.each([['sent', 'unknown'], ['delivered', 'delivered'], ['bounced', 'bounced']])('provider event %s records delivery status %s', async (event, expected) => {
    const { id } = await store.accept(validateSubmission('contact', input()));
    await sendNotification(store, id, { config, fetchImpl: mockSend() });
    const payload = (await store.get(id)).notification_payload;
    await reconcileNotification(store, id, { apiKey: 'mock-only', fetchImpl: async () => Response.json({ ...payload, id: 'mock-provider-id', last_event: event }) });
    expect((await store.get(id)).delivery_status).toBe(expected);
  });
  test('reconciliation rejects an unrelated provider message', async () => {
    const { id } = await store.accept(validateSubmission('contact', input()));
    await sendNotification(store, id, { config, fetchImpl: mockSend() });
    await expect(reconcileNotification(store, id, { apiKey: 'mock-only', fetchImpl: async () => Response.json({ id: 'mock-provider-id', subject: 'unrelated' }) })).rejects.toThrow('provider_message_mismatch');
    expect((await store.get(id)).delivery_status).toBe('unknown');
  });
  test('later non-delivery events do not erase previously verified delivery evidence', async () => {
    const { id } = await store.accept(validateSubmission('contact', input()));
    await sendNotification(store, id, { config, fetchImpl: mockSend() });
    const payload = (await store.get(id)).notification_payload;
    for (const event of ['delivered', 'opened']) {
      await reconcileNotification(store, id, { apiKey: 'mock-only', fetchImpl: async () => Response.json({ ...payload, id: 'mock-provider-id', last_event: event }) });
    }
    expect(await store.get(id)).toMatchObject({ delivery_status: 'delivered', provider_last_event: 'opened' });
  });
});
