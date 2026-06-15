---
phase: 02-core-scraper
plan: 03
subsystem: scraper-orchestrator
tags: [scraper, orchestrator, merge, carry-forward, fault-isolation, cli, tdd]
requires:
  - "scraper/select.mjs (selectForStore), scraper/filter.mjs (filterToAllowList), scraper/dedup.mjs (keyOf, historyLinesToAppend), scraper/normalize.mjs (Plan 01)"
  - "scraper/fetch.mjs (fetchOffers), scraper/io.mjs (readPrior, writeAtomic, appendLines) (Plan 02)"
  - "contract/matcher.mjs (classify), contract/schema.mjs (parseCurrentOffers, parseStatusFile, parseHistoryLine)"
provides:
  - "scraper/merge.mjs :: mergeWithPrior(storeResults, statusOverrides, prior, now) -> { currentOffers, status }"
  - "scraper/index.mjs :: run({ now, dataDir, fetchOffers }) — fault-isolated orchestrator + CLI entry"
  - "package.json :: npm run scrape -> node scraper/index.mjs"
affects:
  - "data/current-offers.json, data/status.json, data/price-history.jsonl (the three files a run writes)"
  - "Phase 4 (GitHub Actions schedule will invoke `npm run scrape`)"
tech-stack:
  added: []
  patterns:
    - "Per-store fault isolation: total fetch failure AND each per-store build wrapped in try/catch; run always reaches the write step (D-02)"
    - "Verbatim carry-forward of the prior store entry on error; two-timestamp semantics (file bumps, per-store frozen) (D-04/D-05)"
    - "Honest cold-start serialization: errored never-seen store is no_offer in snapshot + error in status (D-06)"
    - "Validate-before-write: parse* helpers run before every writeAtomic/appendLines (T-02-08)"
    - "CLI entry guarded by `import.meta.url === process.argv[1]` so importing the module in tests never runs main()"
key-files:
  created:
    - scraper/merge.mjs
    - scraper/index.mjs
    - test/scraper.merge.test.mjs
    - test/scraper.run.test.mjs
  modified:
    - package.json
decisions:
  - "index.mjs stamps `store` onto each filtered candidate (`{ ...o, store }`) before selectForStore — the filter buckets by advertiser slug but leaves the offer untouched, and normalize/select read `offer.store` for identity"
  - "readHistoryKeys lives in index.mjs (orchestrator owns the JSONL read for the dedup key-set); ENOENT -> empty set, an unparseable legacy line is skipped not thrown so one bad line can't abort the run"
  - "CLI main() exits 0 even with per-store errors (last-known data preserved); only a schema-validation throw or unexpected error sets exitCode 1 — a failed fetch is a designed outcome, not a crash"
metrics:
  duration: ~12 min
  completed: 2026-06-15
  tasks: 3
  files: 5
  tests: "84/84 green (8 new merge assertions + 6 new e2e cases; full suite incl. frozen Phase 1)"
---

# Phase 2 Plan 03: Scraper Orchestrator Summary

Wired the scraper together: `merge.mjs` assembles the two whole-file documents from the per-store build results — verbatim carry-forward on error, honest cold-start serialization, two-timestamp semantics, and a pinned Wasgau — and `index.mjs` is the fault-isolated orchestrator + `npm run scrape` CLI entry that captures one clock, reads the prior snapshot, makes the single fetch, runs the per-store build loop, validates all three documents through the frozen schema, and writes them atomically so the run ALWAYS completes and writes all three files. An end-to-end test drives the whole pipeline offline against the captured fixture.

## What Was Built

### Task 1 — `scraper/merge.mjs` (+ `test/scraper.merge.test.mjs`, TDD)
- `mergeWithPrior(storeResults, statusOverrides, prior, now)` -> `{ currentOffers, status }`, pure + clock-free (never fetches, validates, or writes — index.mjs owns those).
- For each of the four marktguru stores (REWE/Edeka/Lidl/Kaufland):
  - **warm error** (`statusOverrides[store] === "error"` AND a prior offer entry exists): copies the prior current-offers entry **verbatim** (last-known data survives, D-04/Pitfall 2); status is `"error"` with the **frozen** prior per-store `lastUpdated` (D-05).
  - **cold-start error** (override but no prior entry): current-offers entry is an honest `{ store, displayName, status:"no_offer" }` (schema-valid — the contract requires offer fields only when `status==="offer"`, D-06); status is `{ status:"error", lastUpdated: now }` (synthetic first value, Open Q1).
  - **successful refresh** (no override): uses the built `storeResults[store]`; per-store `lastUpdated` bumps to `now` (D-05). An absent-from-results store with no override degrades to `no_offer`, never `error` (Pitfall 6).
- **Wasgau** is appended separately and never routed through `statusOverrides`: always `unavailable` in both files, carrying its prior per-store timestamp when present else `now` (D-03).
- Both files' top-level `lastUpdated` always bumps to the run clock (D-05).

### Task 2 — `scraper/index.mjs` + `package.json`
- `run({ now = systemNow(), dataDir = <data/ via fileURLToPath>, fetchOffers = realFetchOffers })` flow: capture `now` once -> `readPrior(dataDir)` -> single `fetchOffers()` (a total failure sweeps all four marktguru stores to `statusOverrides["error"]` and logs `err.message` only, NEVER aborting — D-02c) -> `filterToAllowList(results)` -> per-store fault-isolated build loop (`classify` gate then `selectForStore`; one store throwing marks only that store, D-02b) -> `mergeWithPrior(...)` -> **validate** `parseCurrentOffers`/`parseStatusFile` BEFORE any write (T-02-08) -> compute deduped history lines against the prior JSONL key-set (DATA-04) -> **write order**: `writeAtomic(current-offers.json)`, `writeAtomic(status.json)`, `appendLines(price-history.jsonl)` LAST.
- CLI entry mirrors `spike/probe.mjs` (`main()` + top-level `.catch` setting `exitCode = 1`), guarded by `import.meta.url === process.argv[1]` so importing the module in tests never triggers a run. A per-store/total fetch failure exits 0 (writes error states, preserves last-known data); only a schema-validation or unexpected throw is a non-zero exit.
- `package.json`: added `"scrape": "node scraper/index.mjs"` mirroring the `probe` line — **no new dependency**.

### Task 3 — `test/scraper.run.test.mjs`
- Six offline end-to-end cases, each in a fresh `mkdtemp` dataDir, `fetchOffers` always injected (no network): baseline raw fixture -> valid 5-store docs + Wasgau unavailable (DATA-01); synthesized accept -> `status:"offer"` integer cents + one history line (DATA-01/04); cross-run dedup -> identical re-run appends once (DATA-04); total-failure warm path -> verbatim carry-forward + frozen per-store ts (DATA-05/D-06); total-failure cold path -> `no_offer` + `error`, both files schema-valid (DATA-05/D-06); file-level `lastUpdated === injected now` on every run (DATA-06).

## How to Verify

- `node --test test/scraper.merge.test.mjs` — 8 tests, exits 0.
- `node --test test/scraper.run.test.mjs` — 6 tests, exits 0 (the `FETCH FAILED (total): boom` log lines are the expected message-only error-path logging).
- Inline orchestrator verify (empty-fetch -> 5-store valid `current-offers.json`, Wasgau unavailable, file-level `lastUpdated` = injected now) prints `run() OK`.
- `npm test` (full suite incl. frozen Phase 1 `test/schema.test.mjs` + `test/matcher.test.mjs` + Plan 01/02 scraper units): **84/84 green** — no regression.
- Key-leak grep gate: `grep -E 'console\.(log|error).*(apiKey|clientKey)' scraper/index.mjs` returns no match.

## Deviations from Plan

None — plan executed as written. One implementation detail worth recording (not a deviation from intent): the orchestrator stamps the resolved `store` identity onto each filtered candidate (`{ ...o, store }`) before `selectForStore`, because `filterToAllowList` buckets by advertiser slug but does not mutate the offer, and `normalize`/`select` read `offer.store` for identity. This matches the convention the Plan 01 `select.test.mjs` fixtures already use (each offer carries an explicit `store`).

## TDD Gate Compliance

Task 1 (`tdd="true"`) followed RED -> GREEN:
- RED: `test(02-03): add failing test for mergeWithPrior...` (commit `ce906ca`) — failed with module-not-found, confirming the test exercises the real module.
- GREEN: `feat(02-03): merge.mjs...` (commit `55eecfa`) — 8/8 pass.
- REFACTOR: none needed (clean on first GREEN).

## Authentication Gates

None.

## Threat Surface

No new surface beyond the plan's `<threat_model>`. All registered threats are mitigated by the shipped code:
- T-02-08 (pre-write validation) — `parseCurrentOffers`/`parseStatusFile` run before every `writeAtomic`; `parseHistoryLine` runs inside `historyLinesToAppend` before any line is emitted. A drifted payload throws and no corrupt file is written.
- T-02-09 (fault isolation / availability) — both the fetch and each per-store build are wrapped in try/catch; the run always reaches the write step and `mergeWithPrior` preserves last-known data (verified by the warm-carry-forward e2e case). A failed run can never wipe `data/`.
- T-02-10 (info disclosure) — errors log `err.message` only; bootstrap keys never logged (grep gate clean).
- T-02-SC (npm installs) — zero new dependencies added; no install surface.

## Known Stubs

None. The pipeline is fully wired: real `fetchOffers`/`readPrior`/`writeAtomic`/`appendLines` defaults flow end to end; the only injection seams are for offline testing.

## Commits

- `ce906ca` `test(02-03): add failing test for mergeWithPrior carry-forward/cold-start/two-timestamp/Wasgau`
- `55eecfa` `feat(02-03): merge.mjs — carry-forward, cold-start, two timestamps, pinned Wasgau`
- `bd9ec62` `feat(02-03): index.mjs orchestrator + npm run scrape`
- `baa7bd2` `test(02-03): end-to-end run() against the captured fixture (offline)`

## Self-Check: PASSED

Created files (all FOUND): scraper/merge.mjs, scraper/index.mjs, test/scraper.merge.test.mjs, test/scraper.run.test.mjs. Modified: package.json (scrape script).
Commits (all present in git log): ce906ca, 55eecfa, bd9ec62, baa7bd2.
