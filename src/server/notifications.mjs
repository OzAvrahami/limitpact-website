import 'server-only';
import { randomUUID } from 'node:crypto';

const RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
const LEASE_MS = 60 * 1000;

export function notificationConfig() {
  return {
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.FORM_NOTIFICATION_FROM,
    to: process.env.FORM_NOTIFICATION_TO,
  };
}

function emailPayload(row, config) {
  const form = row.form_type === 'contact' ? 'Contact' : 'Private Beta';
  return {
    from: config.from,
    to: [config.to],
    reply_to: row.email,
    subject: `LimitPact ${form} submission [${row.id}]`,
    text: [
      `Form: ${form}`, `Submission: ${row.id}`, `Accepted: ${new Date(row.created_at).toISOString()}`,
      `Name: ${row.name}`, `Email: ${row.email}`,
      row.form_type === 'contact' ? `Message:\n${row.message}` : `Trading platform: ${row.platform}`,
    ].join('\n\n'),
  };
}

export async function sendNotification(store, id, { config = notificationConfig(), fetchImpl = fetch, now = () => Date.now() } = {}) {
  const db = store.database;
  if (!config.apiKey || !config.from || !config.to) {
    await db.query(`UPDATE limitpact_web.submissions SET last_error_code = 'notification_not_configured'
      WHERE id = $1 AND notification_status IN ('pending', 'failed')`, [id]);
    return 'not_configured';
  }
  const row = await db.transaction(async (tx) => {
    const row = (await tx.query('SELECT * FROM limitpact_web.submissions WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!row) return 'not_found';
    if (row.notification_status === 'provider_accepted') return 'already_accepted';
    if (row.notification_status === 'manual_review') return 'manual_review';
    if (row.notification_status === 'sending' && now() - new Date(row.last_attempt_at).getTime() < LEASE_MS) return null;
    // Resend only retains idempotency keys for 24h. Never blindly replay an
    // ambiguous request beyond that window, including a crash after sending.
    if (row.first_attempt_at && now() - new Date(row.first_attempt_at).getTime() >= RETRY_WINDOW_MS) {
      await tx.query(`UPDATE limitpact_web.submissions SET notification_status = 'manual_review',
        last_error_code = 'retry_window_expired' WHERE id = $1`, [id]);
      return 'manual_review';
    }
    const payload = row.notification_payload ?? emailPayload(row, config);
    const attempt = randomUUID();
    const updated = await tx.query(`UPDATE limitpact_web.submissions SET notification_status = 'sending',
      notification_payload = $2::jsonb, notification_attempt = $3,
      notification_attempts = notification_attempts + 1,
      first_attempt_at = COALESCE(first_attempt_at, clock_timestamp()),
      last_attempt_at = clock_timestamp(), last_error_code = NULL WHERE id = $1 RETURNING notification_payload`, [id, JSON.stringify(payload), attempt]);
    return { ...row, notification_payload: updated.rows[0].notification_payload, notification_attempt: attempt };
  });
  if (!row) return 'skipped';
  if (typeof row === 'string') return row;

  let providerId;
  let failure;
  try {
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `limitpact/${id}/${row.notification_generation}`,
      },
      body: JSON.stringify(row.notification_payload),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) failure = `resend_http_${response.status}`;
    else {
      const body = await response.json();
      if (typeof body.id === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(body.id)) providerId = body.id;
      else failure = 'resend_invalid_response';
    }
  } catch {
    failure = 'resend_network_or_timeout';
  }
  // A failure here leaves the durable sending lease/payload in place. The same
  // provider key is reused after lease expiry; acceptance is never rolled back.
  if (providerId) {
    await db.query(`UPDATE limitpact_web.submissions SET notification_status = 'provider_accepted',
      resend_id = $3, provider_accepted_at = clock_timestamp(), last_error_code = NULL
      WHERE id = $1 AND notification_attempt = $2`, [id, row.notification_attempt, providerId]);
    return 'provider_accepted';
  }
  await db.query(`UPDATE limitpact_web.submissions SET notification_status = 'failed', last_error_code = $3
    WHERE id = $1 AND notification_attempt = $2`, [id, row.notification_attempt, failure]);
  return 'failed';
}

export async function retryNotifications(store, options = {}, id) {
  const rows = id ? [{ id }] : (await store.database.query(`SELECT id FROM limitpact_web.submissions
    WHERE notification_status IN ('pending', 'failed')
      OR (notification_status = 'sending' AND last_attempt_at < clock_timestamp() - interval '1 minute')
    ORDER BY created_at LIMIT 50`)).rows;
  const results = [];
  for (const row of rows) {
    results.push({ id: row.id, result: await sendNotification(store, row.id, options) });
  }
  return results;
}

export async function reconcileNotification(store, id, { providerId, apiKey = process.env.RESEND_READ_API_KEY, fetchImpl = fetch } = {}) {
  if (!apiKey) throw new Error('resend_read_key_required');
  const row = await store.get(id);
  const remoteId = providerId ?? row?.resend_id;
  if (!row?.notification_payload || !remoteId || !/^[a-zA-Z0-9-]{1,100}$/.test(remoteId)) throw new Error('provider_id_required');
  const response = await fetchImpl(`https://api.resend.com/emails/${remoteId}`, {
    headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('provider_lookup_failed');
  const email = await response.json();
  const payload = row.notification_payload;
  // Reconciliation of an ambiguous attempt must identify the original message.
  if (email.id !== remoteId || email.subject !== payload.subject || email.from !== payload.from ||
    JSON.stringify(email.to) !== JSON.stringify(payload.to) || email.text !== payload.text) {
    throw new Error('provider_message_mismatch');
  }
  const status = { delivered: 'delivered', bounced: 'bounced', complained: 'complained', failed: 'failed' }[email.last_event] ?? row.delivery_status;
  const knownEvents = ['sent', 'delivered', 'delivery_delayed', 'bounced', 'complained', 'failed', 'opened', 'clicked', 'scheduled', 'suppressed'];
  const event = knownEvents.includes(email.last_event) ? email.last_event : 'unknown';
  await store.database.query(`UPDATE limitpact_web.submissions SET notification_status = 'provider_accepted',
    resend_id = $2, provider_accepted_at = COALESCE(provider_accepted_at, clock_timestamp()),
    delivery_status = $3, provider_last_event = $4, delivery_checked_at = clock_timestamp(), last_error_code = NULL
    WHERE id = $1`, [id, remoteId, status, event]);
  return { id, providerId: remoteId, deliveryStatus: status, providerEvent: event };
}

export async function resetUnsentNotification(store, id) {
  // Operator-only recovery after checking provider logs, never a public endpoint.
  const result = await store.database.query(`UPDATE limitpact_web.submissions SET
    notification_status = 'pending', notification_payload = NULL,
    notification_generation = notification_generation + 1, notification_attempt = NULL,
    first_attempt_at = NULL, last_attempt_at = NULL, last_error_code = NULL
    WHERE id = $1 AND notification_status = 'manual_review' AND resend_id IS NULL RETURNING id`, [id]);
  if (!result.rows.length) throw new Error('manual_review_record_required');
}
