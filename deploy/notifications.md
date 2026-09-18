# Prepared notification retry service (not provisioned)

This is a settings recipe and operations image for the same source revision as the website. It does not create a Railway service, enable a schedule, or change the website's build. Apply only during the separately approved [release sequence](../docs/release-readiness.md#ordered-release-sequence).

Use the Railway dashboard settings below. A new project-wide IaC dependency would be disproportionate for one small worker; new services cannot opt into the deprecated `railway.toml`/`railway.json` workflow ([current Railway guidance](https://docs.railway.com/infrastructure-as-code)). No auto-discovered Railway configuration is added.

| Setting | Prepared value |
| --- | --- |
| Project / environment | Existing **LimitPact website / production** |
| New service name | `form-notification-retries` |
| Source | `OzAvrahami/limitpact-website`, repository root `/`, same approved commit as the deployed website |
| Automatic deployments | Disabled on this worker; promote it explicitly with each website release |
| Build | Dockerfile, `RAILWAY_DOCKERFILE_PATH=deploy/notifications.Dockerfile`; no build command override |
| Start | `node --conditions=react-server scripts/notifications.mjs scheduled-retry` (also the image CMD) |
| Schedule | `*/5 * * * *` UTC, only when activation is authorized |
| Restart policy / replicas | `NEVER` / one replica, one region with database private-network access |
| Public networking / volume / healthcheck / pre-deploy | None; no migration hook |
| `DATABASE_URL` | Same intended internal Postgres connection reference; runtime role with schema USAGE and submissions SELECT/UPDATE |
| `RESEND_API_KEY`, `FORM_NOTIFICATION_FROM`, `FORM_NOTIFICATION_TO` | Same server-only sending configuration as the website |
| `WEBSITE_RELEASE_COMMIT` | Full 40-character commit SHA from the website's **successful deployment**, not a branch name or an old PR-head SHA |
| `NOTIFICATION_JOB_ENABLED` | `false` during setup; `true` only after revision/configuration/schema checks and release authorization |

Railway provides `RAILWAY_GIT_COMMIT_SHA` for GitHub-originated deployments ([variables reference](https://docs.railway.com/variables/reference)). The guard rejects an absent/different SHA or incomplete sending configuration before opening the database. Do not override that system variable to make a mismatched deployment pass. If a manual deployment path does not provide it, use the GitHub-backed deployment of the reviewed revision; inspect the resulting metadata before activation. The expected SHA is an operator assertion, not a live query of the web service: update it only after verifying the actual deployed website revision. Disable the worker before subsequent website upgrades/rollbacks, then promote both together.

Create/configure the worker without sending credentials and with the opt-in false. Service creation can build/start immediately; that initial start must remain disabled. After the website is deployed, select the exact same revision for the worker (a merge/squash may create a different SHA from this PR), verify both deployment SHAs, set the expected SHA and shared server variables, then authorize activation. Never blindly deploy the latest `main` if it has advanced beyond the approved release.

The image installs the existing production lockfile and copies only server code and the operator CLI. It runs as the unprivileged `node` user, without `.env` files or build-time secrets. The Dockerfile-specific ignore file excludes all other build context. No web build, migration, or email runs during image build. No `RESEND_READ_API_KEY` is needed by this job; keep that full-access key with the protected operator.

Local image check, when Docker is available (no credentials/network to production required):

```sh
docker build -f deploy/notifications.Dockerfile -t limitpact-notification-retries:review .
docker run --rm --network none limitpact-notification-retries:review
# Expected: disabled; no database or email operation performed; exit 0.
```

The image built successfully in local Linux Docker, and the network-disabled run exited 0 without accessing a database or sending email. Its Node 24 base is pinned to the tested image digest. The scheduled CLI and its fail-closed guard were also tested locally. Railway build/network/scheduling behavior remains pending; do not interpret local image verification as a deployed/verified scheduler.

Each run processes at most 50 existing records and closes its pool. Railway skips a scheduled run if the previous run is still active ([cron behavior](https://docs.railway.com/cron-jobs)). Review failure exits and the status/age query in [the operations guide](../docs/form-submissions.md#notification-operations); a successful empty batch does not establish inbox delivery. In particular, expired `manual_review` rows are excluded from normal batches and need the operator query even when the last job exited successfully.

Resend's current default is 10 requests/second per team; account limits and quotas may differ ([provider limits](https://resend.com/docs/api-reference/rate-limit)). This sequential low-volume job records HTTP 429 as failed and retries on the next scheduled run with the same provider key; it does not have a team-wide rate limiter. Monitor repeated 429s/oldest pending work and verify account headroom, especially when other services share the team. Resolve/reconcile ambiguous attempts before the 23-hour cutoff. Keep a responsible operator and an alert for failed runs or aging work; a schedule alone is insufficient.
