# LimitPact GitHub Development Standard

LimitPact uses Oz GitHub Development Standard v1 across two repositories:

- **Desktop:** `OzAvrahami/limitpact-desktop`
- **Website:** `OzAvrahami/limitpact-website` (this repository)

Both components share the user-owned GitHub Project **LimitPact Development**. The Project represents the product; repository identity identifies the component responsible for each Issue.

## Workflow

Status is maintained in the shared GitHub Project:

```text
Backlog → Ready → In Progress → Verify → Done
```

- **Backlog:** Captured work that is not currently planned for active implementation.
- **Ready:** Defined, prioritized, and ready to be started.
- **In Progress:** Currently being implemented.
- **Verify:** Implementation is complete and awaiting verification.
- **Done:** Completed and verified.

New Issues enter Backlog and closed Issues move to Done. Moving work through Ready, In Progress, and Verify is a deliberate manual decision.

## Priority

Priority is a shared Project field and may remain unset until work is deliberately prioritized:

- **P0 — Critical:** Requires immediate intervention because of an outage, data-loss or corruption risk, or equivalent impact.
- **P1 — High:** Important work that should be among the next items addressed.
- **P2 — Medium:** Normal planned development work.
- **P3 — Low:** Nice-to-have work that can reasonably wait.

Priority and Status must not be represented by repository labels.

## Labels

Use at most one primary type label per Issue:

- `bug`
- `feature`
- `enhancement`
- `chore`
- `documentation`

Meta labels are `duplicate`, `invalid`, and `wontfix`.

Component labels provide optional context for cross-component work:

- `desktop`
- `website`

The repository remains the authoritative component identity. Multiple scope labels may apply when work genuinely crosses components.

## Project views

- **Development:** Board for daily flow, grouped by Status.
- **All work:** Table for inspection and editing.

Additional views should be added only when real work volume demonstrates a need.

## Issue lifecycle

Choose the Issue Form that matches the primary work type, add component context when useful, and set Priority deliberately in the shared Project. Closing an Issue means the work is completed and verified; intermediate workflow transitions remain manual.

## Releases and versions

Each component follows Semantic Versioning with a leading `v` for tags and GitHub Releases:

- `vMAJOR.MINOR.PATCH`
- `vMAJOR.MINOR.PATCH-alpha.N`
- `vMAJOR.MINOR.PATCH-beta.N`

A GitHub Release represents a meaningful published component version. A tag or application manifest alone is not a published release.

Desktop and Website may have independent released versions. LimitPact has no product-wide version unless the product explicitly adopts one in the future.

