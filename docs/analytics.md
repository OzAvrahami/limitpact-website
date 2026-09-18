# Traffic measurement and accepted submission reports

Issue [#2](https://github.com/OzAvrahami/limitpact-website/issues/2) uses the owner's approved split: existing Cloudflare Web Analytics for traffic, and a protected read-only CLI for submission counts. Campaign attribution and custom events inside Cloudflare are outside this implementation. No analytics SDK, new provider, public reporting endpoint, admin app, migration, or scheduled reporting job is added.

## Protected report

Use Node 24 and the existing operator source checkout with `npm ci`. Run from the repository root in an authorized environment with private access to the intended Postgres database. The standalone website artifact and notification worker image do not include this CLI: use a protected checkout of the reviewed report revision. Do not deploy the website or repurpose the active worker just to obtain a report.

Only server-side `DATABASE_URL` is required. The npm command follows the existing operator convention of optionally loading ignored `.env.local`; an existing environment variable takes precedence. Use a separate isolated database locally. Production access must use the intended internal Railway Postgres reference in a protected environment; never expose Postgres publicly, print its URL, pass it on the command line, or commit it. Resend keys are not needed; no notification code is imported.

Access is protected by the operator environment/database role, not a web login. Prefer a role with schema USAGE and SELECT only on `limitpact_web.submissions`, without write/migration privileges. Each report uses `SET TRANSACTION READ ONLY` and one parameterized aggregate SELECT, giving totals and daily counts from the same snapshot. This change provisions no role, schema, or production configuration.

```sh
# Help: no database connection
npm run conversions -- --help

# Seven completed UTC days; no implicit exclusions
npm run conversions

# Business counts excluding the two documented acceptance tests
npm run conversions -- --exclude-owner-tests

# September 18 UTC only; --to is EXCLUSIVE
npm run conversions -- --from 2026-09-18 --to 2026-09-19 --timezone UTC --exclude-owner-tests

# Clean JSON without the npm banner
npm run --silent conversions -- --from 2026-09-18 --to 2026-09-19 --format json --exclude-owner-tests

# Arbitrary known test IDs; repeat --exclude-id as needed
npm run conversions -- --from 2026-09-18 --to 2026-09-19 --exclude-id 3de83c33-545f-4f32-8f5c-c906d2dc19b3
```

Dates must be real `YYYY-MM-DD` dates (four-digit years 1000-9999). Supply both bounds or neither, with a positive interval of at most 366 days. Only UTC is supported; the machine/database timezone does not change grouping. Unknown/missing/repeated scalar options, unsupported formats/timezones, and invalid UUIDs fail before connecting. At most 1,000 exclusion arguments are accepted, normalized and deduplicated. Exit status is 0 for success, 1 for failure. Errors omit database messages, input values, credentials, and record data; failure never prints a zero-count success report.

At any time on September 18 UTC, the default interval is **September 11 00:00:00Z inclusive through September 18 00:00:00Z exclusive**. Today is excluded to avoid a partial day. To include today's partial data, use an explicit next-day upper bound. Output includes both ISO boundaries and `timezone: UTC`. This is not the owner's Cloudflare rolling "Last 7 days" window in GMT+3; do not treat those periods as identical.

Both formats contain totals and one row per UTC day, including zeros. Counts are `contact`, `privateBeta`, combined `total`, and `excluded`. JSON identifies the metric as `committed_submissions`. Included totals omit exclusions; `excluded` counts matching source rows inside the period, not arguments supplied. Absent/out-of-period IDs do not increase it. No individual rows, exclusion IDs, names, emails, messages, platform fields, hashes, notification data, or provider identifiers appear in the SQL result or output.

### Conversion boundary and exclusions

Each committed `limitpact_web.submissions.id` is one acceptance; `created_at` determines its day. The unique idempotency key makes client replays return the same record. Notification retries update that record rather than inserting another. All notification/delivery states count, including failed/pending email. Invalid requests and rolled-back saves have no accepted row. There is no event callback, external analytics call, or crash window between acceptance and reporting.

The report runs outside the submission path, so report failure cannot delay or reject a form submission. Counts are **accepted submissions**, not unique leads/people, bot-free leads, campaigns, or a matched visitor-to-submission conversion rate. Two intentional submissions with different IDs count twice even from the same person. Source-record deletion/retention changes historical counts; no separate analytics retention store is introduced. Restrict aggregate exports as operational information, especially at low volumes.

`--exclude-owner-tests` explicitly excludes these retained September 18, 2026 records:

| Form | Submission ID |
| --- | --- |
| Contact | `3de83c33-545f-4f32-8f5c-c906d2dc19b3` |
| Private Beta | `dd7d135c-7b48-402a-b7ac-0ce814834273` |

No record is deleted or marked as test data; no exclusion applies by default. Add future known tests using `--exclude-id`, not name/email/message/browser/country heuristics. For September 18 UTC these two retained IDs should contribute two to `excluded`; real rows may also exist, so do not assume business totals are zero.

## Cloudflare evidence and access

The owner supplied screenshots dated **September 18, 2026**, showing **Last 7 days, GMT+3**:

| Display | Owner-provided value |
| --- | --- |
| Visits / page views | 23 / 35 |
| Country | United States 18; Israel 5 |
| Referrer | None (direct) 22; bing.com 1 |
| Entry paths | `/` 20; `/cdn-cgi/rum` 3 |
| Browser | ChromeHeadless 5 visits |

These observations do not establish authenticated access in this implementation session. Exact capture time, filters, bot setting, and account plan were not independently verified. Visits are not unique people. Technical-path and headless categories may overlap: do not subtract them as disjoint groups.

Earlier direct inspection at 08:02 UTC observed a Cloudflare beacon and a POST accepted with HTTP 204. Its **page location was `https://limitpact.com/`**, although its **transport endpoint was `/cdn-cgi/rum`**. The payload contained timing, navigation, browser/OS, heap, and transfer-size fields, not submitted form values. This establishes one measurement, not full dashboard ingestion or SPA coverage. The ignored local artifact is `test-results/cloudflare-public-assessment.json`; its result is preserved in the [assessment handoff](https://github.com/OzAvrahami/limitpact-website/issues/2#issuecomment-5727092659).

For authorized access, sign in to the account owning `limitpact.com`, select **Web Analytics -> limitpact.com**, and record time range/timezone and filters. The zone's separate **Analytics & Logs** describes edge traffic and must not be confused with browser beacon measurements. Settings and filtered counts remain pending authenticated read access. No Cloudflare credential is required for the CLI; never put credentials in the client, documentation, or an issue.

Cloudflare documents visits/page views, performance, path, country, browser/device, and referrer dimensions. Missing referrers do not prove typed URLs: privacy policies/applications can omit them. Referrer reports are not campaigns. Web Analytics documents no custom-event or UTM support; neither is in approved scope. Blocking, sampling, bot classification, and missing signals limit coverage. Web Analytics omits query strings, but URLs/paths/referrers still require care: never put submitted personal information in application URLs.

## Technical traffic investigation

Confirmed from source/artifacts:

- Routine `tests/http-browser-smoke.mjs` uses `http://localhost:3141`, isolated Postgres, and empty Resend settings. No Cloudflare beacon is embedded in repository source. These local checks do not establish a cause of production counts.
- Earlier production verification used headless Chrome. Ignored `production-navigation.cjs`, `production-form-inspect.cjs`, `production-acceptance.cjs`, and `cloudflare-public-assessment.cjs` record such visits. The last has a captured successful telemetry POST. Our earlier checks can therefore contribute traffic, but the evidence does **not** identify which/how many of the five reported ChromeHeadless visits were ours.
- No application page or link routes to `/cdn-cgi/rum`. The observed ordinary beacon POST identifies `/` as its page location. A telemetry transport request is not itself evidence of a visit to its endpoint. Cloudflare documents POST/OPTIONS on that endpoint and GET rejection with 405; unsupported requests can originate from automated tooling.

Unconfirmed explanations for the three technical-path entries include direct browser/crawler navigation and measurement of an error/challenge document. Also verify the exact dashboard surface to rule out interpreting an edge-request breakdown as browser entry paths. None of these causes is established by the artifacts/screenshots. No production endpoint request, failure injection, or setting change was made to test them.

Next read-only investigation: inspect report title, date/timezone, path/browser/bot/navigation filters, then correlate the technical-path timestamps with available request method/status and page-location evidence. Request-level evidence/retention depends on the account. Without correlation, leave cause/identity unknown; a user-agent label does not identify an operator or person.

### Filtering and future test traffic

Cloudflare's **Add filter** UI supports dimensions including Path, Browser, and **Exclude Bots**. Compare raw figures with `Exclude Bots = Yes`, a Path selection restricted to public pages (`/`, `/privacy`, `/terms`), and a Browser breakdown separating ChromeHeadless. If the account UI offers negative/multiple-value operators, exclude technical paths/headless categories for a business view; otherwise use supported positive filters/separate breakdowns. Record exact filters alongside raw counts. Available operators and resulting counts are unverified here. Report filters do not block telemetry, and bot exclusion does not guarantee human-only traffic.

Keep routine suites on localhost or staging outside production measurement. For separately authorized production smoke checks **not** measuring analytics, suppress the beacon script **only inside the isolated test browser context before navigation**, for example with a Playwright route aborting `https://static.cloudflareinsights.com/**`. Do not change site CSP, DNS, firewall rules, or `/cdn-cgi/rum`. Do not claim analytics verification when its script was suppressed. This does not remove Cloudflare edge-request logs. Explicit analytics verification must allow the beacon and record expected test visits, timestamps, and browser; do not disguise tests by changing user agents. Crawlers/link checkers should not navigate to the telemetry endpoint as a page. This implementation applies no filtering or suppression to real visitors.

Official sources checked September 18, 2026: [filters](https://developers.cloudflare.com/web-analytics/configuration-options/filters/), [dimensions/bot exclusion](https://developers.cloudflare.com/web-analytics/data-metrics/dimensions/), [FAQ/endpoint methods/limitations](https://developers.cloudflare.com/web-analytics/faq/), [data collection](https://developers.cloudflare.com/web-analytics/data-metrics/data-origin-and-collection/), and [analytics privacy description](https://www.cloudflare.com/web-analytics/).

## Verification and release gates

Run isolated `npm test`, `npm run lint`, `npm run build`, then `npm run test:browser`. The new tests use embedded PostgreSQL, UTC/microsecond boundaries, empty days, exclusions/data preservation, client replay, rollback, all notification states, mocked email failure/retry, aggregate-only output, and sanitized CLI errors. The HTTP/browser harness also runs the CLI against an isolated PostgreSQL socket. These checks do not establish production report results.

Pending:

- Review the draft PR and Privacy Policy; retain #2 in Verify until owner acceptance.
- Separately authorize a read-only production report from the reviewed source with private-network access. Compare September 18 UTC with/without explicit owner-test exclusions: expect two excluded retained records and correct aggregate fields. Reuse those records; no new submissions, emails, or data changes are needed.
- Verify Cloudflare settings, report surface, filter operators/counts with authenticated read access; retain uncertainty where technical-path attribution lacks evidence.
- Verify initial/client/history navigation without duplicates in a small explicitly identified analytics check when authorized. Test blocked analytics and URL/referrer privacy using non-personal staging fixtures, never production failure injection.
- An eventual website deployment for the Privacy Policy needs separate approval. Keep website/worker auto-deploy disabled and follow the same-revision scheduler promotion runbook for that future release. No report migration, notification activation, production mutation, or backup operation is needed; preserve the recorded backup waiver.
