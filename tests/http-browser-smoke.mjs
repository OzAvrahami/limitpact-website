// Built-app verification with an isolated PostgreSQL engine. No production URLs,
// credentials, or real emails. Run after npm run build.
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { chromium } from 'playwright';

const directory = await mkdtemp(join(tmpdir(), 'limitpact-smoke-'));
let db = new PGlite(directory);
let socket, app, browser;
const origin = 'http://localhost:3141';
const errors = [];
try {
  socket = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 0, maxConnections: 5 });
  await socket.start();
  const fixtureEnv = { ...process.env, NODE_OPTIONS: '', NODE_ENV: 'production',
      PORT: '3141', HOSTNAME: '127.0.0.1', APP_ORIGIN: origin,
      DATABASE_URL: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres`, RESEND_API_KEY: '', RESEND_READ_API_KEY: '',
      FORM_NOTIFICATION_FROM: '', FORM_NOTIFICATION_TO: '',
  };
  const runScript = (script, ...args) => promisify(execFile)(process.execPath,
    ['--conditions=react-server', script, ...args], { env: fixtureEnv, windowsHide: true });
  await runScript('scripts/migrate.mjs');
  await runScript('scripts/migrate.mjs');
  app = spawn(process.execPath, ['.next/standalone/server.js'], {
    env: fixtureEnv, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  app.stdout.on('data', () => {});
  app.stderr.on('data', (data) => errors.push(data.toString()));
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (app.exitCode !== null) throw new Error('test_server_exited');
    try { if ((await fetch(origin)).ok) { ready = true; break; } } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(ready, 'Isolated app starts');
  const post = (path, data) => fetch(`${origin}${path}`, { method: 'POST',
    headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const data = { idempotencyKey: randomUUID(), name: 'HTTP Test', email: 'http@example.test', message: 'Isolated HTTP test', website: '' };
  const contact = await post('/api/contact', data);
  assert.equal(contact.status, 201);
  const accepted = await contact.json();
  assert.equal((await post('/api/contact', data)).status, 200);
  assert.equal((await post('/api/private-beta', { ...data, idempotencyKey: randomUUID(), platform: 'Other' })).status, 201);
  assert.equal((await post('/api/private-beta', { ...data, platform: 'Invalid' })).status, 422);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM limitpact_web.submissions')).rows[0].n, 2);
  assert.equal((await db.query('SELECT message FROM limitpact_web.submissions WHERE id = $1', [accepted.submissionId])).rows[0].message, data.message);
  const inspection = JSON.parse((await runScript('scripts/notifications.mjs', 'inspect', accepted.submissionId)).stdout);
  assert.equal(inspection.notification, 'pending');
  assert.equal(inspection.delivery, 'unknown');
  const from = new Date(inspection.acceptedAt).toISOString().slice(0, 10);
  const to = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const report = JSON.parse((await runScript('scripts/conversions.mjs', '--from', from, '--to', to,
    '--format', 'json', '--exclude-id', accepted.submissionId)).stdout);
  assert.deepEqual(report.totals, { contact: 0, privateBeta: 1, total: 1, excluded: 1 });

  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(origin);
  await mkdir('test-results', { recursive: true });
  for (const type of ['contact', 'beta']) {
    const trigger = type === 'contact' ? page.getByRole('button', { name: 'Contact', exact: true }).first()
      : page.getByRole('button', { name: /Join.*beta/i }).first();
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name', { exact: true }).fill('Browser Test');
    await dialog.getByLabel('Email', { exact: true }).fill('browser@example.test');
    if (type === 'contact') await dialog.getByLabel('Message', { exact: true }).fill('Local browser test only');
    else await dialog.getByLabel('Trading platform').selectOption('NinjaTrader');
    await page.screenshot({ path: `test-results/${type}-form.png` });
    await dialog.getByRole('button', { name: type === 'contact' ? 'Send message' : 'Request beta access' }).click();
    const heading = dialog.getByRole('heading', { name: type === 'contact' ? 'Message received' : "You're on the list" });
    await heading.waitFor();
    assert.equal(await heading.evaluate((element) => element === document.activeElement), true);
    await page.keyboard.press('Tab');
    assert.equal(await dialog.getByRole('button', { name: 'Close dialog' }).evaluate((element) => element === document.activeElement), true);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await dialog.getByRole('button', { name: 'Close dialog' }).evaluate((element) => element === document.activeElement), true);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await trigger.evaluate((element) => element === document.activeElement), true);
  }
  // A real persistence failure, not an intercepted successful response.
  // Let post-response notification work finish before temporarily hiding the table.
  for (let attempt = 0; attempt < 60; attempt++) {
    const pending = (await db.query("SELECT count(*)::int AS n FROM limitpact_web.submissions WHERE last_error_code IS NULL")).rows[0].n;
    if (pending === 0) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await db.query('ALTER TABLE limitpact_web.submissions RENAME TO submissions_unavailable');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Contact form', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: true }).fill('Retained Test');
  await dialog.getByLabel('Email', { exact: true }).fill('retained@example.test');
  await dialog.getByLabel('Message', { exact: true }).fill('Keep these values after failure');
  await dialog.getByRole('button', { name: 'Send message' }).click();
  await dialog.getByRole('alert').waitFor();
  assert.equal(await dialog.getByLabel('Message', { exact: true }).inputValue(), 'Keep these values after failure');
  assert.equal(await dialog.getByRole('alert').evaluate((element) => element === document.activeElement), true);
  assert.equal(await page.getByRole('heading', { name: 'Message received' }).count(), 0);
  await page.screenshot({ path: 'test-results/contact-error-mobile.png' });
  await db.query('ALTER TABLE limitpact_web.submissions_unavailable RENAME TO submissions');
  await dialog.getByRole('button', { name: 'Send message' }).click();
  await dialog.getByRole('heading', { name: 'Message received' }).waitFor();
  assert.equal((await db.query('SELECT count(*)::int AS n FROM limitpact_web.submissions')).rows[0].n, 5);
  await browser.close(); browser = null;
  app.kill(); await once(app, 'exit'); app = null;
  await socket.stop(); socket = null;
  await db.close();
  db = new PGlite(directory);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM limitpact_web.submissions')).rows[0].n, 5, 'Accepted records survive database restart');
  console.log('PASS: built HTTP endpoints, PostgreSQL protocol, aggregate report CLI, both browser forms, focus/escape, mobile database failure/retry, and persistence across restart. No real email sent.');
} catch (error) {
  console.error(error);
  // This fixture only handles synthetic data; still omit child/provider details.
  console.error(`Local application stderr entries: ${errors.length}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (app && app.exitCode === null) { app.kill(); await once(app, 'exit'); }
  await socket?.stop();
  await db.close();
  assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep + 'limitpact-smoke-'));
  await rm(directory, { recursive: true, force: true });
}
