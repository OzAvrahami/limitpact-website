import 'server-only';

// The scheduler is opt-in and must use the exact deployed website revision.
// Check before opening a database connection or attempting any notification.
export function scheduledNotificationsEnabled(env = process.env) {
  if (env.NOTIFICATION_JOB_ENABLED !== 'true') return false;
  const expected = env.WEBSITE_RELEASE_COMMIT;
  if (!/^[a-f0-9]{40}$/.test(expected ?? '') || env.RAILWAY_GIT_COMMIT_SHA !== expected) {
    throw new Error('notification_job_revision_mismatch');
  }
  for (const name of ['DATABASE_URL', 'RESEND_API_KEY', 'FORM_NOTIFICATION_FROM', 'FORM_NOTIFICATION_TO']) {
    if (!env[name]?.trim()) throw new Error('notification_job_configuration_missing');
  }
  return true;
}
