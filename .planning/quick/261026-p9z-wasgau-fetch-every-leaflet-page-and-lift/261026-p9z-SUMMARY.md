---
phase: quick-261026-p9z
plan: 01
quick_id: 261026-p9z
subsystem: scraper/wasgau
status: complete
tags: [wasgau, leaflet, 1kcloud, discovery, cache, probation]
requires: [Phase 05 Wasgau leaflet source]
provides:
  - all-pages Wasgau leaflet discovery (leafletPageNumbers, MAX_LEAFLET_PAGES = 60)
  - CANDIDATES_DOC_VERSION = 2 cache-buster in the candidates doc schema
  - WASGAU_DEADLINE_MS = 120_000
  - WASGAU_CONFIG.probation = false
affects: [data/wasgau-candidates.json (rewritten by the next CI scrape), current-offers.json Wasgau entry, price-history.jsonl]
tech-stack:
  added: []
  patterns: [schema version literal as cache-buster, sequential full-page scan with page-count cap]
key-files:
  created: []
  modified:
    - scraper/wasgau/leaflet.mjs
    - scraper/wasgau/build.mjs
    - scraper/wasgau/candidates.mjs
    - scraper/wasgau/source.mjs
    - scraper/wasgau/config.mjs
    - test/scraper.wasgau.candidates.test.mjs
    - test/scraper.wasgau.leaflet.test.mjs
    - test/scraper.wasgau.source.test.mjs
    - test/scraper.run.test.mjs
decisions:
  - "Wasgau discovery fetches the coords XML of EVERY index page (sequential, capped at 60), because the 1kcloud index text is truncated on some pages (2026-10-26 page 1 hid the 12x1 l case)"
  - "Candidates doc carries a required version literal (2) as its first key; any doc from an older discovery rule is a cache miss"
  - "WASGAU_DEADLINE_MS raised 60 s -> 120 s for ~30 sequential requests per new leaflet"
  - "Wasgau probation lifted 2026-10-26 after checking the page-1 accept (10.99 EUR, 12 x 1 l, 26.-31.10.) against the leaflet image"
metrics:
  duration: ~7 min
  completed: 2026-10-26
  tasks: 3
  files: 9
estimate:
  tokens: 80000
  tasks: 3
actuals:
  tokens: 24000
  tasks: 3
  commits: 3
plan_head_before: 68c257f3e53ff0be4df2c1cd16a71645770577dd
plan_head_after: 10d03a894bc7cf3342b391c9544f2f11c8bd4a46
---

# Quick 261026-p9z: Wasgau scans every leaflet page and probation is lifted

Wasgau now downloads the coords XML of every page in the 1kcloud index instead of only the pages whose index text mentions Coca-Cola. A version literal in the candidates doc schema makes the stale cached doc a cache miss, and probation is off, so the page-1 Coca-Cola 12x1 l case at 10.99 EUR (26.-31.10.) will be found and shown as a normal offer.

## What changed

| Task | Commit | Summary |
|------|--------|---------|
| 1 (tracer) | 5b04102 | `leafletPageNumbers` + `MAX_LEAFLET_PAGES = 60` replace the index-text Cola page picker; `fetchCandidates` loops over every index page one request at a time; `colaPages` = pages that actually yielded candidates; `CANDIDATES_DOC_VERSION = 2` is the first `.strict()` key (cache-buster); `colaPages` cap raised to 60, `candidates .max(50)` documented as the implausibility guard; regression, old-rule cache-miss and version unit tests added |
| 2 | 5e11aa2 | `WASGAU_DEADLINE_MS` raised to 120_000, with the measured rationale in a comment; leaflet/source/run tests now expect homepage, index, pages 1, 2, 17, 26; new `leafletPageNumbers` dedupe/sort/60-cap test |
| 3 | 10d03a8 | `WASGAU_CONFIG.probation = false`, with a dated note on what was checked; Case H now asserts `needsReview: false` and exactly one Wasgau history line under the default config; the marktguru-total-failure test expects `needsReview: false` |

## Verification

- RED -> GREEN observed: both new run()-level tests (index-truncation regression, old-rule cache miss) failed against the old code and pass after Task 1. In Task 3, Case H and the marktguru-failure test failed before the config flip and pass after it.
- `npm test`: **281 tests, 281 pass, 0 fail**.
- Offline check against the real committed file: `OK: committed old-rule doc is a cache miss`.
- `grep -rnE "colaPageNumbers|MAX_COLA_PAGES" scraper test`: no matches.
- `git status --porcelain -- data/`: empty (data/*.json untouched).
- Live smoke check (real seam, about 30 sequential requests, writes nothing), run 2026-10-26:

  ```
  LIVE OK [1,20,21] 2 2026-10-26 2026-10-31
  ```

  This is exactly the expected output (before the fix the same command printed `FAIL: live page-1 12x1 l case not found [20,21]`).

## Note for the user

Nothing was pushed. Pushing to master starts the CI scrape. That run treats the committed `data/wasgau-candidates.json` (leaflet ep1rP1V0, built by the old rule, no `version`) as a cache miss, downloads all 28 pages again, and rewrites the file with `version: 2` and `colaPages [1, 20, 21]`. Wasgau then shows 10.99 EUR, valid 26.-31.10., as a normal offer, and the offer gets a price-history line.

## Deviations from Plan

None in the code. The plan was followed as written.

Process notes:
- The orchestrator told me to commit directly on `master`. The project uses `git.branching_strategy: none`, and earlier quick tasks also committed to master. So I did not apply the generic protected-branch refusal. Commits are local only.
- File edits used small Python replacement scripts (exact single-match replacements). Files were written with LF; git autocrlf normalizes them, and the diffs contain only the intended lines.

## Known Stubs

None.

## Threat Flags

None. No new endpoints or hosts were added. Every coords URL is still built by `coordsUrl(validated id, integer page)`, and the allow-list in source.mjs is unchanged. T-p9z-01..05 are mitigated as the plan describes: the 60-page cap throws before any coords request, requests stay sequential, the 120 s shared deadline applies, the version literal gates the cache, and only clean accepts become normal offers.

## Self-Check: PASSED

- FOUND: scraper/wasgau/leaflet.mjs, build.mjs, candidates.mjs, source.mjs, config.mjs; all four test files
- FOUND commits: 5b04102, 5e11aa2, 10d03a8 (ancestors of HEAD; `git rev-list --count 68c257f..HEAD` = 3)
