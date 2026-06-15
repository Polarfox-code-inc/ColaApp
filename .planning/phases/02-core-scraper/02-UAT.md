---
status: complete
phase: 02-core-scraper
source: [02-VERIFICATION.md, 02-REVIEW.md]
started: 2026-06-15T16:59:13Z
updated: 2026-06-15T17:25:00Z
resolution: Both items fixed in code via /gsd-code-review 02 --fix (WR-01 ddd9711, WR-02 7d878c5). Suite 96/96 green; re-verification status passed.
---

## Current Test

[testing complete]

## Tests

### 1. WR-01 — Fault-isolation hole in select.mjs / normalize.mjs
expected: |
  Per-offer isolation, not per-store: one offer with malformed validityDates is
  skipped/needs-review, the store still surfaces its other valid offers.
  CONFIRMED empirically by verifier: berlinDay(undefined) threw RangeError.
result: pass
note: Fixed in commit ddd9711 — safeBerlinDay returns null on Invalid Date; berlinRanges filters unparseable ranges. 3 new tests assert per-offer isolation. Re-verified live.

### 2. WR-02 — Schema-drift path writes zero files (index.mjs:132-134)
expected: |
  The phase invariant is "the run ALWAYS completes and writes all three files."
  On a schema-validation throw, status.json must still signal the failure.
result: pass
note: Fixed in commit 7d878c5 — writeErrorStatus() writes a schema-valid error status.json on drift before rethrowing, preserving current-offers.json carry-forward. 1 new test asserts it. Re-verified live.

## Summary

total: 2
passed: 2
issues: 0
pending: 0
skipped: 0

## Gaps

[none — both items resolved in code]

## Notes

- All 5 roadmap success criteria for Phase 2 are met; suite is 96/96 green (was 84/84, +12 tests from the fixes).
- Full code-review detail (0 Critical, 4 Warning, 5 Info) in 02-REVIEW.md; all 4 Warnings fixed, 5 Info deferred to Phase 4 hardening.
- 02-VERIFICATION.md re-verification status: passed. Phase already marked complete in ROADMAP/STATE.
