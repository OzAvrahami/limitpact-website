# Contact and Private Beta submissions

Issue: [#1](https://github.com/OzAvrahami/limitpact-website/issues/1). Production acceptance remains pending. This work does not implement analytics or issue #2.

Release preparation, dependency advisory fixes, read-only Railway findings, and the ordered release gate are recorded in [release-readiness.md](release-readiness.md). The prepared, disabled scheduler configuration is in [deploy/notifications.md](../deploy/notifications.md).

## Infrastructure and design

Read-only inspection on September 17, 2026 found Railway project **LimitPact website**, services **Postgres** and **tradeguard-website**, and an existing `DATABASE_URL` variable on the web service. No database or email code existed in this repository; the desktop app uses local JSON state, which is unsuitable for website inquiries. Reuse that Railway Postgres service, with the isolated `limitpact_web` schema. No production connection, migration, deployment, credential change, or email was performed during implementation.

The two Node.js Route Handlers, `POST /api/contact` and `POST /api/private-beta`, normalize and validate their fields, commit a submission and pending notification in the same record, then return `{ accepted: true, submissionId, duplicate }`. New acceptance returns 201; a replay returns 200. Neither response means email delivery. Next.js `after()` makes a best-effort notification attempt after the response. A small operator/scheduled command drains pending work if that attempt fails or the process exits. No extra queue service, public admin endpoint, or ORM is needed.

`DATABASE_URL` is evaluated on first use, so building does not require database access. SQL is parameterized; runtime modules have `server-only` boundaries. Submitted fields and raw database/provider errors are not logged. Database backups, operator access, and email inboxes still contain personal data and need appropriate access controls.

## Exact server configuration

Use Node.js **24 LTS** and `npm ci`. Configure these on the server, never as `NEXT_PUBLIC_*` variables or in `next.config.mjs`:

| Variable | Value / purpose |
| --- | --- |
| `DATABASE_URL` | Existing Railway Postgres connection reference for the same project/environment. Reuse the current reference after checking it points to the intended database. Local testing must use a separate database. |
| `APP_ORIGIN` | `https://limitpact.com` in production. Exact scheme/host/port used by the forms; alternate hosts should redirect to this canonical origin. Development defaults to `http://localhost:3000`. Missing production origin fails closed. |
| `RESEND_API_KEY` | Resend sending key restricted to the verified sending domain where possible. Required to attempt a notification. |
| `FORM_NOTIFICATION_FROM` | A sender on the verified domain, e.g. `LimitPact <forms@notify.limitpact.com>` **only after** that domain is verified. No invented/unverified sender is used as a default. |
| `FORM_NOTIFICATION_TO` | Intended owner recipient: `ozavrahami7@gmail.com`. One recipient address; configurable independently of sender. |
| `RESEND_READ_API_KEY` | Full-access Resend key for operator-only retrieval/reconciliation. Not required by the web process or sending worker. Keep it in the protected operator environment. |

The existing `DATABASE_URL` was present; the other submission-specific variables were absent in the inspected Railway web service. Their values and Resend account readiness remain to be configured/verified. Missing email configuration leaves a saved `pending` notification with `notification_not_configured`; it never fakes delivery or rejects already accepted data.

For local manual work, copy `.env.example` to ignored `.env.local` and point it to a dedicated local database. Leave the Resend variables empty to prevent real sends. Commands below load `.env.local` if present; existing shell environment values take precedence. The automated tests ignore these files and do not use production credentials.

## Database setup and migration

1. Confirm the intended Railway Postgres service, database backup policy, and connection reference. Use a release/operator environment with private-network access; do not expose the database publicly for this feature.
2. Use a migration role with permission to create the `limitpact_web` schema/tables. In a reviewed release window, run `npm ci` and `npm run db:migrate` from this source checkout with the intended `DATABASE_URL`. **This command writes to the configured database; it has not been run against production.** It is intentionally not part of install, build, start, or automatic deployment.
3. The runner applies `db/migrations/001_submissions.sql` transactionally, records a checksum in `limitpact_web.migrations`, and safely skips an unchanged applied migration. Do not edit a migration after applying it; add a new numbered migration. A checksum mismatch fails without altering records.
4. Prefer a separate runtime role. Grant `USAGE` on schema `limitpact_web`, and `SELECT, INSERT, UPDATE` on `limitpact_web.submissions`; no sequence grants are needed (UUIDs). Migration/retention work uses the protected operator role. Example, substituting an existing chosen role: `GRANT USAGE ON SCHEMA limitpact_web TO website_runtime; GRANT SELECT, INSERT, UPDATE ON limitpact_web.submissions TO website_runtime;`.
5. Use the provider's TLS connection settings on external connections and never disable certificate verification. Railway private-network connections can use the service's supplied internal URL. Do not log connection strings. Pool size is five, with connection and statement timeouts.
6. Deploy only through a separately authorized release. Rollback the app without dropping the schema or saved data. No destructive down migration is supplied.

The source checkout and dependencies are needed for migration/retry commands; Next.js standalone output alone is not an operations bundle. A scheduled job should run from the same reviewed source revision with its own server environment.

## Resend setup and delivery meaning

1. Add the intended sending domain/subdomain in the owner's Resend account. Prefer a dedicated notification subdomain. Publish the exact DNS records Resend supplies for DKIM and its SPF/return-path setup (including any required MX); do not overwrite existing unrelated mail records. Wait until the sending domain is verified. Review DMARC alignment for the chosen sender. See [Resend domain setup](https://resend.com/docs/dashboard/domains/introduction).
2. Create a domain-scoped sending API key, put it only in the server secret store, and set `FORM_NOTIFICATION_FROM` and `FORM_NOTIFICATION_TO`. The submission email is used as Reply-To, never as From. Notifications use plain text and identify the form, submission UUID, acceptance timestamp, name, email, and message or trading platform.
3. Disable open/click tracking for these owner notifications unless separately justified. No analytics or tracking is added by this code.
4. When production testing is separately authorized, verify actual owner receipt for each form. The API response from Resend means **provider acceptance**, not delivery to the recipient and not an inbox/read confirmation. [Resend's send API](https://resend.com/docs/api-reference/emails/send-email) supplies the provider ID used for reconciliation.

Persisted states:

| Field/state | Meaning |
| --- | --- |
| Submission row + `created_at` | Database accepted; visitor success is permitted. |
| `notification_status=pending` | Saved; notification not attempted yet (possibly missing configuration). |
| `sending` | Worker owns a 60-second lease; request may be in flight or its outcome may be uncertain. |
| `failed` | Provider/network attempt failed or its response was lost. Safe retry uses the original payload/key. |
| `provider_accepted` + `resend_id` | Provider accepted this email. Do not send again merely because delivery is unknown. |
| `manual_review` | Retry window expired; operator must reconcile before any further send. |
| `delivery_status=unknown` | No confirmed delivery event; also used for unrecognized/non-delivery provider events. |
| `delivered`, `bounced`, `complained`, `failed` | Status obtained by an authenticated provider retrieval, with `delivery_checked_at` and `provider_last_event`. Delivered means the recipient mail server accepted it; the owner must still confirm actual receipt. |

## Notification operations

These commands can send real email when real credentials are configured. Run only in the intended authorized environment. No public retry endpoint exists.

```sh
# Process up to 50 pending/failed/stale-leased notifications, in acceptance order.
npm run notifications -- retry
# Retry just one saved submission; never creates a new submission.
npm run notifications -- retry SUBMISSION_UUID
# Show metadata/status only (no submitted personal fields).
npm run notifications -- inspect SUBMISSION_UUID
# Retrieve the known provider message and record its current delivery status.
# Requires RESEND_READ_API_KEY; does not send email.
npm run notifications -- reconcile SUBMISSION_UUID
```

Arrange a protected scheduler using the [prepared configuration](../deploy/notifications.md) to run the guarded `scheduled-retry` command every five minutes from the website's exact deployed source revision. Monitor its exit status plus the query below. A manual operator can use `retry` at this site's initial volume. The scheduler is **not provisioned by this change**. Ensure someone reviews failures well within 23 hours. Monitor oldest pending work, manual-review rows, provider bounces, and provider rate limits; after fixing a failure, rerun the command.

```sql
SELECT notification_status, delivery_status, last_error_code,
       count(*), min(created_at) AS oldest
FROM limitpact_web.submissions
GROUP BY notification_status, delivery_status, last_error_code;
```

The first send saves a frozen payload, including sender/recipient, plus an idempotency key based on submission UUID/generation. Subsequent retries send identical bytes with that key even if environment configuration changes. A database outage after provider acceptance retains the sending lease and key, allowing reconciliation/retry without re-inserting the submission. [Resend retains idempotency keys for 24 hours](https://resend.com/docs/dashboard/emails/idempotency-keys); this code stops blind retries after 23 hours from the first attempt, leaving a safety margin. Claims use database row locks, so multiple workers cannot claim the same live attempt.

For `manual_review`, locate the submission UUID in Resend email logs (the subject contains it):

```sh
# If a provider message exists, supply its ID; verifies message identity before updating.
npm run notifications -- reconcile SUBMISSION_UUID PROVIDER_EMAIL_ID
# ONLY after the operator confirms no message exists/was sent:
npm run notifications -- reset-confirmed-unsent SUBMISSION_UUID
npm run notifications -- retry SUBMISSION_UUID
```

Reset is allowed only for manual-review rows without a recorded provider ID; it increments the notification generation and allows corrected sender/recipient configuration. It does not create a new submission. Never reset an ambiguous record merely to clear an error. Accepted/bounced messages require operator handling, not automatic resend. Reconciliation deliberately refuses a provider message whose subject, sender, recipients, or plain text do not match the frozen payload.

## Abuse protection, duplicates, and privacy

Only same-origin JSON requests are accepted, with a streamed 24,000-byte bound, honeypot, server field limits, and database-backed rolling one-hour limits of **3 accepted submissions per normalized email** and **100 total across both forms**. Exact accepted retries are exempt from those quotas. A short transaction lock makes checks atomic across web instances. No claimed client IP or proxy header is trusted, and no new IP/fingerprint collection is introduced.

This is a low-volume baseline, not a bot-proof challenge. Origin headers can be forged outside browsers, honeypots can be bypassed, and attackers rotating email addresses can exhaust the global quota. Apply a perimeter per-IP rate rule for the two POST paths at the existing trusted ingress if abuse appears; do not trust arbitrary forwarded-IP headers in application code. Revisit limits/challenge protection if legitimate volume grows.

A browser submission attempt uses a UUID and retains it for unchanged retries while the form is open. A repeated key with changed normalized data returns 409. Editing fields or starting a new form creates a new intentional attempt; this is not permanent email-address deduplication (a trader can send another inquiry). The app disables concurrent clicks. Closing/reloading an ambiguous attempt discards the in-memory attempt; use the retry button in the still-open form when a response is lost. Entered fields are not written to browser storage.

Restrict database and mailbox access and manage submission retention in accordance with the existing Privacy Policy (up to 24 months after last meaningful interaction, subject to ongoing relationships/legal requirements). Include the frozen notification payload in deletion/export requests; it contains a copy of the submitted fields. Deleting a row also removes its idempotency record. Establish an operator retention review; do not automatically purge unresolved notifications. Analytics policy changes remain in #2.

## Local verification

```sh
npm ci
npm test
npm run lint
npm run build
# Install the test browser once, or use an installed Chrome via PLAYWRIGHT_CHANNEL=chrome.
npx playwright install chromium
npm run test:browser
```

`npm test` uses isolated embedded PostgreSQL (PGlite), applies the real migration, and mocks email HTTP calls. It covers normalized acceptance of both forms, validation/spam checks, rollback, concurrent duplicates, quotas, scheduling failure, email failures, frozen provider retries, a database failure after provider acceptance, expired retry windows, reconciliation, and UI loading/errors/retained values. No environment file or production service is used.

`test:browser` starts the built standalone app on local port 3141 with a temporary PostgreSQL socket/database and **empty Resend settings**, exercises actual HTTP requests and both rendered forms, simulates a real persistence failure, checks focus restoration and mobile errors, and restarts the database to verify records survive. It cleans up the temporary database and app. PGlite's socket multiplexer is not a substitute for production Postgres load/concurrency testing. Screenshots go to ignored `test-results/`.

Production-only dependencies still pending: migration/role permissions on the intended service, server variables, Resend sender-domain verification, an operator/retry schedule, actual delivery evidence, and owner acceptance. Local tests cannot establish these.

## Owner acceptance checklist (pending; after separately authorized release)

- [ ] Send a Contact message clearly marked `OWNER ACCEPTANCE TEST` with a unique timestamp; confirm exactly one database record with the correct normalized name/email/message.
- [ ] Send a Private Beta registration with a clearly marked test name and timestamp; confirm exactly one record with the correct name/email/platform.
- [ ] For each, record the submission UUID, provider ID/status, and separately confirm the owner actually received the corresponding email with the correct form/fields. Check spam if needed; API acceptance alone is insufficient.
- [ ] Confirm invalid input and a controlled failed save do not show success, and a retry preserves entered values. Perform failure injection only in an isolated/staging environment.
- [ ] Verify email failure/retry preserves the row and does not duplicate it or an already accepted notification; validate the operator retry process in staging with mocked delivery.
- [ ] Attach sanitized dates/results to #1, leaving it open in Verify until production checks and owner acceptance are complete. Keep #2 in Backlog; conversion tracking is not implemented.
