import { getDatabase } from '../src/server/database.mjs';
import { createSubmissionStore } from '../src/server/submission-store.mjs';
import { retryNotifications, reconcileNotification, resetUnsentNotification } from '../src/server/notifications.mjs';
import { UUID } from '../src/server/validation.mjs';
import { scheduledNotificationsEnabled } from '../src/server/notification-job-config.mjs';

let db;
async function run() {
  let [action, id, providerId] = process.argv.slice(2);
  if (action === 'scheduled-retry') {
    if (!scheduledNotificationsEnabled()) {
      console.log('Scheduled notifications disabled; no database or email operation performed.');
      return;
    }
    if (id || providerId) throw new Error('scheduled_retry_takes_no_arguments');
    action = 'retry';
  }
  if (id && !UUID.test(id)) throw new Error('invalid_id');
  if (!['retry', 'inspect', 'reconcile', 'reset-confirmed-unsent'].includes(action)) throw new Error('invalid_action');
  if (action !== 'retry' && !id) throw new Error('id_required');
  db = getDatabase();
  const store = createSubmissionStore(db);
  if (action === 'retry') {
    const results = await retryNotifications(store, {}, id);
    console.log(JSON.stringify(results));
    if (results.some(({ result }) => ['failed', 'not_configured', 'manual_review', 'not_found'].includes(result))) process.exitCode = 1;
  } else if (action === 'inspect') {
    const row = await store.get(id);
    if (!row) throw new Error('not_found');
    console.log(JSON.stringify({ id: row.id, form: row.form_type, acceptedAt: row.created_at,
      notification: row.notification_status, attempts: row.notification_attempts,
      providerId: row.resend_id, delivery: row.delivery_status, lastError: row.last_error_code,
      deliveryCheckedAt: row.delivery_checked_at }));
  } else if (action === 'reconcile') {
    console.log(JSON.stringify(await reconcileNotification(store, id, { providerId })));
  } else {
    await resetUnsentNotification(store, id);
    console.log('Marked pending after operator confirmation that no provider message exists. Run retry separately.');
  }
}

try {
  await run();
} catch {
  console.error('Notification operation failed. Check the command, configuration, scheduled release revision, database access, and provider message match. No credentials, submitted fields, or provider error bodies are logged.');
  process.exitCode = 1;
} finally {
  await db?.close();
}
