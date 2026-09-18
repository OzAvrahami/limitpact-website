import { test, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { scheduledNotificationsEnabled } from '../src/server/notification-job-config.mjs';

const revision = 'a'.repeat(40);
const config = { NOTIFICATION_JOB_ENABLED: 'true', WEBSITE_RELEASE_COMMIT: revision,
  RAILWAY_GIT_COMMIT_SHA: revision, DATABASE_URL: 'postgresql://unused.invalid/test',
  RESEND_API_KEY: 'mock-only', FORM_NOTIFICATION_FROM: 'forms@example.test', FORM_NOTIFICATION_TO: 'owner@example.test' };

test('disabled scheduled CLI never opens a database or sends email', () => {
  const output = execFileSync(process.execPath,
    ['--conditions=react-server', 'scripts/notifications.mjs', 'scheduled-retry'],
    { env: { ...process.env, ...config, NODE_OPTIONS: '', NOTIFICATION_JOB_ENABLED: 'false' }, windowsHide: true });
  expect(output.toString()).toContain('no database or email operation performed');
});

test.each([undefined, '', 'b'.repeat(40), 'main', revision.slice(0, 7)])('rejects missing or mismatched worker revision %s before access', (actual) => {
  expect(() => scheduledNotificationsEnabled({ ...config, RAILWAY_GIT_COMMIT_SHA: actual })).toThrow('notification_job_revision_mismatch');
});

test.each(['DATABASE_URL', 'RESEND_API_KEY', 'FORM_NOTIFICATION_FROM', 'FORM_NOTIFICATION_TO'])('requires %s before scheduled processing', (name) => {
  expect(() => scheduledNotificationsEnabled({ ...config, [name]: ' ' })).toThrow('notification_job_configuration_missing');
});

test('accepts configured opt-in only for the full approved website revision', () => {
  expect(scheduledNotificationsEnabled(config)).toBe(true);
  expect(() => scheduledNotificationsEnabled({ ...config, WEBSITE_RELEASE_COMMIT: 'main' })).toThrow('notification_job_revision_mismatch');
  expect(scheduledNotificationsEnabled({})).toBe(false);
});
