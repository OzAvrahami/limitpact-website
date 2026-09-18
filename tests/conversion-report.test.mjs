import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { migrate } from '../scripts/migrations.mjs';
import { createSubmissionStore } from '../src/server/submission-store.mjs';
import { createSubmissionHandler } from '../src/server/submission-handler.mjs';
import { validateSubmission } from '../src/server/validation.mjs';
import { sendNotification, retryNotifications } from '../src/server/notifications.mjs';
import { parseReportOptions, getConversionReport, formatConversionReport, OWNER_TEST_IDS } from '../src/server/conversion-report.mjs';
import { runReport } from '../scripts/conversions.mjs';

const now = new Date('2026-09-18T12:34:56Z');
const options = (...args) => parseReportOptions(args, now);
const range = ['--from', '2026-09-17', '--to', '2026-09-19'];
const input = (type = 'contact') => ({ idempotencyKey: randomUUID(), name: 'Private fixture name',
  email: `${randomUUID()}@example.test`, website: '',
  ...(type === 'contact' ? { message: 'Private fixture message' } : { platform: 'Tradovate' }) });
let db, store;
beforeAll(async () => { db = new PGlite(); await migrate(db); store = createSubmissionStore(db); });
beforeEach(async () => { await db.query('TRUNCATE limitpact_web.submissions'); });
afterAll(async () => { await db.close(); });

async function save(type, at, extra = {}) {
  const accepted = await store.accept(validateSubmission(type, input(type)));
  await db.query('UPDATE limitpact_web.submissions SET created_at=$2, notification_status=$3, id=$4 WHERE id=$1',
    [accepted.id, at, extra.status ?? 'pending', extra.id ?? accepted.id]);
  return extra.id ?? accepted.id;
}

describe('report dates and CLI validation', () => {
  test('defaults to seven completed UTC days, including across year boundaries', () => {
    expect(options()).toMatchObject({ from: '2026-09-11T00:00:00.000Z', to: '2026-09-18T00:00:00.000Z', timezone: 'UTC', format: 'table', excludeIds: [] });
    expect(parseReportOptions([], new Date('2026-01-02T00:00:00Z')).from).toBe('2025-12-26T00:00:00.000Z');
    expect(options('--from', '2024-02-29', '--to', '2024-03-01').from).toBe('2024-02-29T00:00:00.000Z');
  });
  test.each([
    ['--from', '2026-09-01'], ['--to', '2026-09-02'],
    ['--from', '2026-02-29', '--to', '2026-03-01'], ['--from', '2026-13-01', '--to', '2027-01-01'],
    ['--from', '2026-09-18T00:00:00Z', '--to', '2026-09-19'],
    ['--from', '2026-09-18', '--to', '2026-09-18'], ['--from', '2026-09-19', '--to', '2026-09-18'],
    ['--from', '2024-01-01', '--to', '2026-01-01'], ['--from', '0000-01-01', '--to', '2026-01-01'],
    ['--timezone', 'Asia/Jerusalem'], ['--format', 'xml'], ['--exclude-id', 'bad'],
    ['--format'], ['--format', 'json', '--format', 'table'], ['--help', '--format', 'json'], ['--unknown'],
  ])('rejects invalid options without connecting: %j', async (...args) => {
    const connect = vi.fn(), error = vi.fn(), write = vi.fn();
    expect(await runReport(args, { connect, error, write, now })).toBe(1);
    expect(connect).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled();
  });
  test('explicit exclusions are normalized/deduplicated and never implicit', () => {
    expect(options('--exclude-owner-tests', '--exclude-id', OWNER_TEST_IDS[0].toUpperCase()).excludeIds).toEqual(OWNER_TEST_IDS);
    expect(options().excludeIds).toEqual([]);
  });
  test('real CLI help runs without loading credentials or opening a connection', async () => {
    const { stdout, stderr } = await promisify(execFile)(process.execPath,
      ['--conditions=react-server', 'scripts/conversions.mjs', '--help'],
      { env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot }, windowsHide: true });
    expect(stdout).toContain('seven completed UTC'); expect(stderr).toBe('');
  });
});

describe('isolated PostgreSQL aggregate report', () => {
  test('uses UTC, inclusive start/exclusive end at microsecond boundaries; fills empty days', async () => {
    await db.query("SET TIME ZONE 'Pacific/Honolulu'");
    await save('contact', '2026-09-16T23:59:59.999999Z');
    await save('contact', '2026-09-17T00:00:00Z');
    await save('beta', '2026-09-17T23:59:59.999999Z');
    await save('beta', '2026-09-19T00:00:00Z');
    const report = await getConversionReport(db, options(...range));
    expect(report.daily).toEqual([
      { date: '2026-09-17', contact: 1, privateBeta: 1, total: 2, excluded: 0 },
      { date: '2026-09-18', contact: 0, privateBeta: 0, total: 0, excluded: 0 },
    ]);
    expect(report.totals).toEqual({ contact: 1, privateBeta: 1, total: 2, excluded: 0 });
    await db.query("SET TIME ZONE 'UTC'");
  });
  test('empty period produces explicit zero totals and seven daily rows', async () => {
    const report = await getConversionReport(db, options());
    expect(report.daily).toHaveLength(7);
    expect(report.totals).toEqual({ contact: 0, privateBeta: 0, total: 0, excluded: 0 });
  });
  test('counts all notification states and distinct submissions from the same person', async () => {
    const data = input();
    for (const status of ['pending', 'sending', 'failed', 'provider_accepted', 'manual_review']) {
      const { id } = await store.accept(validateSubmission('contact', { ...data, idempotencyKey: randomUUID() }));
      await db.query('UPDATE limitpact_web.submissions SET created_at=$2, notification_status=$3 WHERE id=$1', [id, '2026-09-17T12:00:00Z', status]);
    }
    expect((await getConversionReport(db, options(...range))).totals.contact).toBe(5);
  });
  test('explicit test exclusions count only matching rows in the period and preserve records', async () => {
    await save('contact', '2026-09-18T07:30:04Z', { id: OWNER_TEST_IDS[0] });
    await save('beta', '2026-09-18T07:30:05Z', { id: OWNER_TEST_IDS[1] });
    await save('beta', '2026-09-17T12:00:00Z');
    const outside = await save('contact', '2026-09-16T12:00:00Z');
    const before = await db.query('SELECT * FROM limitpact_web.submissions ORDER BY id');
    const report = await getConversionReport(db, options(...range, '--exclude-owner-tests', '--exclude-id', OWNER_TEST_IDS[0], '--exclude-id', outside, '--exclude-id', randomUUID()));
    expect(report.totals).toEqual({ contact: 0, privateBeta: 1, total: 1, excluded: 2 });
    expect(report.daily[1].excluded).toBe(2);
    expect((await getConversionReport(db, options(...range))).totals.total).toBe(3);
    expect(await db.query('SELECT * FROM limitpact_web.submissions ORDER BY id')).toEqual(before);
  });
  test.each(['contact', 'beta'])('%s client replays and mocked failed/successful email retries count once', async (type) => {
    const data = validateSubmission(type, input(type));
    const { id } = await store.accept(data);
    for (let i = 0; i < 3; i++) expect(await store.accept(data)).toEqual({ id, duplicate: true });
    const config = { apiKey: 'mock-only', from: 'forms@example.test', to: 'owner@example.test' };
    await sendNotification(store, id, { config, fetchImpl: async () => new Response('', { status: 503 }) });
    await db.query('UPDATE limitpact_web.submissions SET created_at=$2 WHERE id=$1', [id, '2026-09-17T12:00:00Z']);
    expect((await getConversionReport(db, options(...range))).totals.total).toBe(1);
    const fetchImpl = vi.fn(async () => Response.json({ id: 'mock-provider-id' }));
    await retryNotifications(store, { config, fetchImpl }, id);
    await retryNotifications(store, { config, fetchImpl }, id);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect((await getConversionReport(db, options(...range))).totals.total).toBe(1);
  });
  test('invalid submissions and rolled-back inserts contribute nothing', async () => {
    expect(() => validateSubmission('beta', { ...input('beta'), platform: 'Invalid' })).toThrow();
    const failingStore = createSubmissionStore({ transaction: (work) => db.transaction(async (tx) => {
      await work(tx); throw new Error('simulated commit failure');
    }) });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handler = createSubmissionHandler({ getStore: () => failingStore, scheduleNotification: vi.fn(), getOrigin: () => 'https://example.test' });
    const response = await handler(new Request('https://example.test/api/contact', { method: 'POST',
      headers: { origin: 'https://example.test', 'content-type': 'application/json' }, body: JSON.stringify(input()) }), 'contact');
    log.mockRestore();
    expect(response.status).toBe(503);
    expect((await getConversionReport(db, options(...range))).totals.total).toBe(0);
  });
  test('SQL result, JSON, and table contain only aggregates; read-only transaction enforced', async () => {
    const id = await save('contact', '2026-09-17T12:00:00Z');
    const safeDb = { transaction: (work) => db.transaction(async (tx) => work({ query: async (sql, params) => {
      const result = await tx.query(sql, params);
      if (sql.startsWith('SELECT')) {
        expect((await tx.query('SHOW transaction_read_only')).rows[0].transaction_read_only).toBe('on');
        expect(Object.keys(result.rows[0]).sort()).toEqual(['day', 'excluded', 'form_type', 'included']);
      }
      return result;
    } })) };
    const report = await getConversionReport(safeDb, options(...range));
    expect(Object.keys(report).sort()).toEqual(['daily', 'fromInclusive', 'metric', 'timezone', 'toExclusive', 'totals']);
    for (const format of ['table', 'json']) {
      const output = formatConversionReport(report, format);
      for (const sensitive of [id, 'Private fixture', '@example.test', 'idempotency', 'notification', 'request_hash']) expect(output).not.toContain(sensitive);
    }
    expect(formatConversionReport(report, 'table')).toContain('Private Beta');
    expect(JSON.parse(formatConversionReport(report, 'json'))).toEqual(report);
  });
  test('CLI writes clean JSON once, closes connection, and sanitizes failures', async () => {
    const write = vi.fn(), error = vi.fn(), close = vi.fn();
    expect(await runReport([...range, '--format', 'json'], { connect: () => ({ transaction: db.transaction.bind(db), close }), write, error, now })).toBe(0);
    expect(JSON.parse(write.mock.calls[0][0]).totals.total).toBe(0); expect(close).toHaveBeenCalledOnce();
    write.mockClear();
    const secret = 'postgres://private:user@internal/secret';
    expect(await runReport([], { connect: () => ({ transaction: async () => { throw new Error(secret); }, close }), write, error, now })).toBe(1);
    expect(write).not.toHaveBeenCalled(); expect(error.mock.calls.flat().join('')).not.toContain(secret);
  });
});
