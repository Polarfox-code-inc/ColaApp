---
status: testing
phase: 02-core-scraper
source: [02-VERIFICATION.md, 02-REVIEW.md]
started: 2026-06-15T16:59:13Z
updated: 2026-06-15T16:59:13Z
---

## Current Test

number: 1
name: WR-01 — Decide fault-isolation granularity for malformed validityDates
expected: |
  A single malformed `validityDates` entry (e.g. `from: undefined`) on ONE offer
  must NOT downgrade the entire store to `error`. Other valid offers for that store
  should still be selectable. Today `berlinDay(undefined)` throws `RangeError`, the
  throw propagates through `selectForStore`, and the per-store catch in
  `index.mjs:118` marks the whole store `error`.
  DECISION NEEDED: accept as a known v1 limitation (document it), or apply the
  ~5-line `safeBerlinDay` guard described in 02-REVIEW.md WR-01.
awaiting: user response

## Tests

### 1. WR-01 — Fault-isolation hole in select.mjs / normalize.mjs
expected: |
  Per-offer isolation, not per-store: one offer with malformed validityDates is
  skipped/needs-review, the store still surfaces its other valid offers.
  CONFIRMED empirically by verifier: berlinDay(undefined) throws RangeError.
  Not a data-loss path. Decision: accept (comment) OR apply safeBerlinDay guard.
status: pending

### 2. WR-02 — Schema-drift path writes zero files (index.mjs:132-134)
expected: |
  The phase invariant is "the run ALWAYS completes and writes all three files."
  On a schema-validation throw at index.mjs:133-134 (parseCurrentOffers /
  parseStatusFile), zero files are written and status.json is never updated to
  signal the failure. CONFIRMED from source. Not a data-loss path.
  Decision: accept current fail-loud behavior (add a comment) OR write a minimal
  error status.json before re-throwing so the invariant holds on this path too.
status: pending

## Notes

- All 5 roadmap success criteria for Phase 2 are met; suite is 84/84 green.
- Full code-review detail (0 Critical, 4 Warning, 5 Info) in 02-REVIEW.md.
- These two items are decisions, not behavior bugs blocking the build. Once decided
  (accept or fix), re-run verification until status is `passed`.
