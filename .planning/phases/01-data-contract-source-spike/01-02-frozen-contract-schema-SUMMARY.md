---
phase: 01-data-contract-source-spike
plan: 02
subsystem: database
tags: [zod, json-schema, jsonl, contract, node-test, esm]

# Dependency graph
requires:
  - phase: 01-01-scaffold-live-probe
    provides: "Live marktguru probe facts (results key, slugs rewe/edeka/kaufland, validityDates day-granular Berlin, decimal-euro price, Wasgau unavailable)"
provides:
  - "Frozen zod data contract (contract/schema.mjs) encoding D-01..D-14 — the single scraper<->PWA interface"
  - "Shared TypeScript types (contract/types.d.ts) for Phase 2/3 editor types, zod-free at runtime"
  - "Seeded data/current-offers.json, data/status.json, data/price-history.jsonl on the frozen contract"
  - "Six UI-state mock fixtures (offer, no_offer, upcoming, error, stale, unavailable) + status.stale.json"
  - "node:test suite (23 tests) proving every mock + data file validates and float/unknown-status are rejected"
affects: [02-core-scraper, 03-pwa-frontend, 04-live-integration]

# Tech tracking
tech-stack:
  added: [zod@3.25.76]
  patterns:
    - "zod schema module as the single source of truth both downstream phases import"
    - "strict() schemas + superRefine for cross-field invariants (status:offer requires offer fields; 5 stores exactly once)"
    - "JSONL append-only history (one JSON object per line, never an array)"
    - "node:test fixture-driven validation (loop over mock files, assert parse does not throw)"

key-files:
  created:
    - contract/schema.mjs
    - contract/types.d.ts
    - data/current-offers.json
    - data/status.json
    - data/price-history.jsonl
    - test/schema.test.mjs
    - mocks/current-offers.offer.json
    - mocks/current-offers.no_offer.json
    - mocks/current-offers.upcoming.json
    - mocks/current-offers.error.json
    - mocks/current-offers.stale.json
    - mocks/current-offers.unavailable.json
    - mocks/status.stale.json
  modified: []

key-decisions:
  - "Consolidated the Task-1 TDD RED gate and the Task-3 acceptance suite into one test/schema.test.mjs (single test file; node --test discovers it once)"
  - "StoreOffer uses .strict() so a stray pfand/deposit key is rejected, not silently stripped (hard-enforces D-10)"
  - "status:offer offer-field requirement enforced via superRefine rather than a discriminated union, keeping null/absent offer fields legal for the other 3 states"
  - "CurrentOffers superRefine asserts each of the 5 fixed StoreKeys appears exactly once (D-05)"

patterns-established:
  - "Contract-first: schema.mjs is imported by tests, scraper (Phase 2), and PWA (Phase 3); types.d.ts mirrors it for editor types"
  - "Anchored linear date regex ^\\d{4}-\\d{2}-\\d{2}$ to avoid ReDoS (threat T-02-02)"

requirements-completed: [DATA-02]

# Metrics
duration: 5min
completed: 2026-06-15
---

# Phase 01 Plan 02: Frozen Contract Schema Summary

**Frozen zod scraper<->PWA data contract (current-offers / price-history / status) encoding decisions D-01..D-14, with six UI-state mocks and a 23-test node:test suite proving every state validates and float prices / unknown statuses are rejected.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-15T14:01:49Z
- **Completed:** 2026-06-15T14:06:14Z
- **Tasks:** 3
- **Files modified:** 13 created

## Accomplishments
- `contract/schema.mjs` — zod schemas (`StoreOfferSchema`, `CurrentOffersSchema`, `HistoryLineSchema`, `StoreStatusSchema`, `StatusFileSchema`) plus `STORES`, `STATUS_VALUES`, and `parseCurrentOffers/parseHistoryLine/parseStatusFile` helpers; integer-cents enforcement (D-09), no Pfand field (D-10), computed pricePerLitre cents/litre (D-11), 4-value status enum (D-12), YYYY-MM-DD Berlin dates + ISO-UTC lastUpdated (D-13), exactly-5-stores invariant (D-05).
- `contract/types.d.ts` — matching TS types so the PWA gets editor types without a runtime zod import.
- Three seeded data files on the frozen contract, including `data/price-history.jsonl` as line-delimited JSONL (D-02/D-14), never a JSON array.
- Six realistic mock fixtures covering every ROADMAP UI state (offer, no_offer, upcoming via future validFrom, error, stale via old lastUpdated, Wasgau unavailable) plus `status.stale.json`; at least one entry carries `needsReview:true` (D-08).
- `npm test` green: 23 tests, including negative regression guards for float price (D-09) and unknown status (D-12).

## Task Commits

Each task was committed atomically (Task 1 followed TDD RED -> GREEN):

1. **Task 1 (RED): failing contract schema tests** - `645e5e1` (test)
2. **Task 1 (GREEN): freeze zod contract + shared types** - `3508a9a` (feat)
3. **Task 2: seed data files + author every UI-state mock** - `6691055` (feat)
4. **Task 3: prove every mock + data file validates against contract** - `2ebc2e5` (test)

_Task 1 was TDD: RED (test) then GREEN (feat); no refactor commit needed._

## Files Created/Modified
- `contract/schema.mjs` - zod contract: schemas, STORES/STATUS_VALUES, parse helpers (D-01..D-14)
- `contract/types.d.ts` - TS types mirroring the schema (StoreOffer/CurrentOffers/HistoryLine/StoreStatus/StatusFile/StoreKey)
- `data/current-offers.json` - seeded 5-store snapshot (REWE offer; Edeka/Lidl/Kaufland no_offer; Wasgau unavailable)
- `data/status.json` - per-store fetch state + fresh lastUpdated
- `data/price-history.jsonl` - 3 D-14-shaped append-only lines (JSONL, not array)
- `mocks/current-offers.offer.json` - offer state; Edeka entry carries needsReview:true (D-08)
- `mocks/current-offers.no_offer.json` - all stores no_offer (Wasgau unavailable)
- `mocks/current-offers.upcoming.json` - REWE offer with future validFrom 2026-06-22 (PWA-derived "upcoming")
- `mocks/current-offers.error.json` - Edeka/Kaufland error, distinct from no_offer
- `mocks/current-offers.stale.json` - old file-level lastUpdated 2026-06-05 (PWA-derived "stale")
- `mocks/current-offers.unavailable.json` - Wasgau unavailable focus state
- `mocks/status.stale.json` - status file with old lastUpdated
- `test/schema.test.mjs` - 23-test node:test suite (schema behavior + fixture validation + negative guards)

## Decisions Made
- Merged the TDD RED gate (Task 1) and the acceptance suite (Task 3) into a single `test/schema.test.mjs`. The plan listed the file under Task 3, but TDD on Task 1 needed a failing test first; one file is cleaner and `node --test` discovers it once. Net effect identical to the plan's intent — all Task-3 acceptance assertions are present.
- Used `.strict()` on object schemas so an unexpected `pfand`/`deposit` key is rejected rather than silently stripped — turns D-10 ("no Pfand field") into an enforced, drift-catching guarantee.
- Enforced "status:offer requires offer fields" with `superRefine` (not a discriminated union) so the other three states cleanly allow null/absent offer fields.

## Deviations from Plan

None requiring deviation rules. The only adjustment was the documented consolidation of the test file into a single `test/schema.test.mjs` (the plan's per-task file list implied it under Task 3; building it RED-first under Task 1 and extending it in Task 3 yields the same deliverable). No bugs, missing-critical, blocking, or architectural deviations occurred.

## Issues Encountered
None. Zod 3.25.76 was already installed (from Plan 01-01 scaffold); `z.string().datetime()` and `z.enum` behaved as expected on Node 24.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The contract is frozen and provably sufficient: Phase 2 (scraper) and Phase 3 (PWA) can now build in parallel, both importing `contract/schema.mjs` (runtime validation) and `contract/types.d.ts` (editor types).
- Phase 2 inherits: the active-range selection + `validityDates` -> YYYY-MM-DD Berlin trim rule, `Math.round(price*100)` cents conversion, the 5-slug allow-list `{rewe,edeka,lidl,kaufland,wasgau}`, and the dedup key (store+price+validFrom) record shape — logic lives in Phase 2; only the shape is frozen here.
- Phase 3 inherits: the six mock fixtures as its build-time data source, and the PWA-derived "upcoming"/"stale" derivations (intentionally not frozen at scrape time).
- No blockers. Open Phase-1 item (no real 12x1L case on sale this week) is handled by Plan 01-03's synthesized positive fixture, not this plan.

## Threat Surface Scan
No new security-relevant surface introduced beyond the plan's threat_model. The date regexes are anchored/linear (T-02-02 mitigated); zod validation guards payload-shape drift (T-02-01 mitigated); mock fixtures contain only synthetic offer data, no keys/PII (T-02-03 accepted).

## Self-Check: PASSED

All 6 contract/data/test files + SUMMARY.md exist on disk; all 4 task commits (`645e5e1`, `3508a9a`, `6691055`, `2ebc2e5`) present in git history.

---
*Phase: 01-data-contract-source-spike*
*Completed: 2026-06-15*
