---
phase: 05-wasgau-leaflet-source
plan: 03
subsystem: scraper
tags: [wasgau, 1kcloud, run, merge, kill-switch, probation, tracer, node-test]

requires:
  - phase: 05-wasgau-leaflet-source
    provides: "Plan 05-01 pure extraction core (parseLeafletLink, coordsUrl, parseIndex, colaPageNumbers, reconstructPage, leafletWindowFromIndex, extractCandidates, buildCandidatesDoc, parseCandidatesDoc, evaluateCandidates)"
  - phase: 02-scraper
    provides: "run() orchestrator, mergeWithPrior three paths, withRetry, writeAtomic"
provides:
  - scraper/wasgau/config.mjs (WASGAU_CONFIG = frozen { enabled: true, probation: true })
  - scraper/wasgau/source.mjs (createFetchText, WASGAU_DEADLINE_MS)
  - scraper/wasgau/build.mjs (CANDIDATES_FILE, readCandidates, fetchCandidates)
  - "run({ ..., wasgau: { fetchText, config } }) with an independent Wasgau try/catch"
  - "mergeWithPrior(..., { wasgauEnabled }) over all 5 contract STORES"
  - "writeErrorStatus(dataDir, now, wasgauEnabled)"
  - "export const UA from scraper/fetch.mjs"
  - "runtime output data/wasgau-candidates.json"
affects: [05-04 window precedence + cache/review gating, 05-05 network hardening + fault-isolation proofs]

actuals:
  tokens: 8200
  tasks: 1
  commits: 1
plan_head_before: 8203d2e4c6a4805bbb33483eb5adc2beb835f3b8
plan_head_after: 045969167f588a26bd83b784e411502eab5a9953

tech-stack:
  added: []
  patterns:
    - "Per-source try/catch after the marktguru loop; only statusOverrides.Wasgau is touched on failure"
    - "Kill switch as a committed frozen constant, overridable per run via the run({ wasgau: { config } }) seam"
    - "One shared AbortSignal deadline per Wasgau run, combined with withRetry's fresh per-attempt signals"
    - "Every run() in tests injects an explicit Wasgau seam (WASGAU_OFF or a URL-recording fixture stub)"

key-files:
  created:
    - scraper/wasgau/config.mjs
    - scraper/wasgau/source.mjs
    - scraper/wasgau/build.mjs
  modified:
    - scraper/fetch.mjs
    - scraper/filter.mjs
    - scraper/index.mjs
    - scraper/merge.mjs
    - test/scraper.run.test.mjs
    - test/scraper.merge.test.mjs

key-decisions:
  - "Wasgau kill switch and probation live in a committed frozen constant (scraper/wasgau/config.mjs), not GitHub repository variables: versioned, visible in history, no hidden state"
  - "mergeWithPrior treats a prior entry with status 'unavailable' as no prior, so the first post-deploy Wasgau error goes down the cold-start path (no_offer + error) instead of carrying 'unavailable' forward"
  - "wasgau-candidates.json is written only when a leaflet doc exists (after status.json, before the history append); an evaluation throw still writes the parsed doc, a fetch/parse throw leaves the old cache"

patterns-established:
  - "Wasgau network modules never log; scraper/index.mjs logs 'WASGAU FAILED: <err.message>' only"
  - "Network error texts carry HTTP status + host only, never the response body"

requirements-completed: [P5-SC1, P5-SC3, P5-SC4]

coverage:
  - id: D1
    description: "End-to-end tracer offline: fixture homepage -> 1kcloud index -> Cola pages 17 + 26 -> needsReview Wasgau offer (899 cents, 75 c/l, 2026-10-12..17) in current-offers.json via the unchanged matcher, status 'offer', no Wasgau history line (P5-SC1, D-12, D-14, D-17)"
    requirement: "P5-SC1"
    verification:
      - kind: unit
        ref: "test/scraper.run.test.mjs#Wasgau leaflet end-to-end: 4 sequential requests -> needsReview offer + candidates file (P5-SC1, SC4, D-12)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A new leaflet costs exactly 4 sequential requests (homepage, index, page_17.xml, page_26.xml); only Cola pages are fetched (P5-SC4, D-09)"
    requirement: "P5-SC4"
    verification:
      - kind: unit
        ref: "test/scraper.run.test.mjs#Wasgau leaflet end-to-end: 4 sequential requests -> needsReview offer + candidates file (P5-SC1, SC4, D-12)"
        status: pass
    human_judgment: false
  - id: D3
    description: "data/wasgau-candidates.json is schema-valid with trailing newline, leafletId ep1rP1V0, window 2026-10-12..17, colaPages [17, 26] and 3 candidates (accepts and rejects); p17 box 14 accept/clean/899/75/12 (D-10, D-11)"
    requirement: "P5-SC1"
    verification:
      - kind: unit
        ref: "test/scraper.run.test.mjs#Wasgau leaflet end-to-end: 4 sequential requests -> needsReview offer + candidates file (P5-SC1, SC4, D-12)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Kill switch (enabled=false) keeps Wasgau fixed 'unavailable' in both files with no leaflet request; cases A-G run through the kill-switch path; merge refresh path for an enabled Wasgau offer (P5-SC3 groundwork, D-01, D-03, D-04)"
    requirement: "P5-SC3"
    verification:
      - kind: unit
        ref: "test/scraper.merge.test.mjs#kill switch: Wasgau stays unavailable under a total-failure override map (D-04)"
        status: pass
      - kind: unit
        ref: "test/scraper.merge.test.mjs#Wasgau enabled with a built offer takes the refresh path (D-01/D-03)"
        status: pass
      - kind: unit
        ref: "test/scraper.run.test.mjs (cases A-G with WASGAU_OFF)"
        status: pass
    human_judgment: false

duration: 3min
completed: 2026-10-12
status: complete
---

# Phase 5 Plan 03: Wasgau Leaflet Source Wired End-to-End Summary

**Plan 05-01's pure leaflet core now sits behind a real fetch seam (shared 60 s deadline, project UA, withRetry), an independent Wasgau try/catch in run(), and a 5-store merge with a committed kill switch. Offline, the fixture leaflet becomes a needsReview Wasgau offer (8.99 EUR, 0.75 EUR/l, 2026-10-12..17) in current-offers.json, plus a schema-valid data/wasgau-candidates.json, in exactly 4 sequential requests.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-10-12T18:08:16Z
- **Completed:** 2026-10-12T18:11:11Z
- **Tasks:** 1 (tracer)
- **Files modified:** 3 created, 6 modified

## Accomplishments
- Case H (tracer end-to-end) passes. The stub records exactly homepage, index, page_17.xml, page_26.xml in order. Wasgau in current-offers.json deep-equals `{ store, displayName "Wasgau", status "offer", needsReview true, price 899, EUR, pricePerLitre 75, 2026-10-12..2026-10-17 }`, status is `offer` at the run clock, and no history line has store Wasgau. Probation is ON by default (no config override in Case H).
- `data/wasgau-candidates.json` is written after status.json and before the history append, only when a doc exists. It passes `parseCandidatesDoc`, ends in `\n`, and lists 3 candidates (p17 box 14 accept, plus the rejects).
- `fetchCandidates` fetches only `HOMEPAGE_URL`, the URL rebuilt by `parseLeafletLink` and `coordsUrl(id, page)` results, one awaited request at a time. An unchanged leaflet id returns the prior doc after the homepage request. `readCandidates` treats any failure as a cache miss.
- `mergeWithPrior` loops over the frozen contract `STORES`. With `wasgauEnabled: false` Wasgau takes the old fixed-unavailable branch verbatim. With it enabled Wasgau uses the warm-error / cold-error / refresh paths, and a prior `unavailable` counts as no prior.
- `writeErrorStatus` marks Wasgau `error` when enabled and `unavailable` when disabled.
- Every `run()` in test/scraper.run.test.mjs (9 calls) injects a Wasgau seam; cases A-G use `WASGAU_OFF`, so the suite never touches wasgau.de or 1kcloud.
- Full root suite green: 209/209 (200 before this plan). `git diff -- contract/ .github/` is empty.

## Task Commits

1. **Task 1: Tracer (completion) - wasgau.de leaflet to a Wasgau entry in current-offers.json** - `0459691` (feat)

Tracer feedback gate: auto mode off, `human_verify_mode: end-of-phase`, verify is automated-only, so the verify was re-run (`node --test test/scraper.run.test.mjs test/scraper.merge.test.mjs`: 17/17; `npm test`: 209/209) and passed. No checkpoint was synthesized.

## Files Created/Modified
- `scraper/wasgau/config.mjs` - frozen `WASGAU_CONFIG` with the maintainer manual (kill switch, probation, why a committed constant)
- `scraper/wasgau/source.mjs` - `createFetchText` (shared deadline, UA header, withRetry, status+host-only errors), `WASGAU_DEADLINE_MS`; D-09/D-18 Dudenhofen note and Mapbox-token warning
- `scraper/wasgau/build.mjs` - `CANDIDATES_FILE`, `readCandidates`, `fetchCandidates` (homepage -> index -> Cola pages, leaflet-id cache)
- `scraper/index.mjs` - `wasgau` seam, Wasgau try/catch ("WASGAU FAILED:"), kill-switch-aware `writeErrorStatus`, candidates-file write
- `scraper/merge.mjs` - 5-store `STORES` loop, `wasgauEnabled` branch, prior-unavailable guard, rewritten header
- `scraper/fetch.mjs` - `export const UA`
- `scraper/filter.mjs` - header comment only (Wasgau has its own leaflet source)
- `test/scraper.run.test.mjs` - `WASGAU_OFF`, `wasgauStub`, `WASGAU_NOW`, Case H
- `test/scraper.merge.test.mjs` - two Wasgau tests now pass `{ wasgauEnabled: false }` (D-04 titles); new enabled-refresh test

## Decisions Made
- The kill switch and probation are a committed frozen constant, per the plan and RESEARCH A3.
- In the Case H `run()` call the `wasgau` seam is placed before `fetchOffers`. The acceptance-criteria grep scans each `run({` segment up to the first `})`, and Case D/E/G's inline throwing `fetchOffers` closes with `} })`, so placement after it would hide the seam from the check. The same placement is used in every call.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- One `Edit` on test/scraper.merge.test.mjs initially missed because the real comment reads "total-failure override (D-03)" rather than "override map". It was re-applied against the exact text; no partial change.
- The GSD protected-branch guard would flag `master`. The project uses `branching_strategy: none` and the orchestrator dispatched a sequential main-tree executor, so the commit is on master as instructed.
- Git prints LF->CRLF warnings on commit (repo autocrlf setting); pre-existing, no effect on content.

## Known Stubs
- None introduced by this plan. The Plan 05-01 stub stays: `scraper/wasgau/dates.mjs` `resolveWindow` returns the leaflet window only; Plan 05-04 adds the box and page levels.

## Threat Flags

None. The new outbound surface (wasgau.de, wasgau-dlog.1kcloud.com) is in the plan's threat model (T-05-04, T-05-05, T-05-18). The host allow-list, redirect re-check and body cap are deferred to Plan 05-05 as planned.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 05-04 can extend `resolveWindow` and the cache/review gating on top of `fetchCandidates({ fetchText, priorDoc })` and the `run({ wasgau })` seam. `wasgauStub(pages)` accepts a page map for alternative fixtures.
- Plan 05-05 can harden `createFetchText({ deadlineMs, fetchImpl, baseMs })` (allow-list, redirect re-check, body cap) and add the run-level fault-isolation proofs. The `WASGAU FAILED:` and `wasgau fetch failed: HTTP <status> (<host>)` contracts are in place.
- The first live run will see the committed prior Wasgau `unavailable`. On success it refreshes to the leaflet result; on failure it takes the cold-start path (no_offer + error).

## Self-Check: PASSED
- Created files present: scraper/wasgau/config.mjs, scraper/wasgau/source.mjs, scraper/wasgau/build.mjs.
- Commit 0459691 is an ancestor of HEAD.
- Acceptance criteria re-run: config check exit 0; `export const UA` count 1; 9 run() calls inject wasgau; STORES import 1; `wasgauEnabled` in merge.mjs 4; `CANDIDATES_FILE` in index.mjs 2; contract/ and .github/ diff empty; `npm test` 209/209.
