---
phase: 02-core-scraper
verified: 2026-06-15T17:30:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 5/5
  gaps_closed:
    - "WR-01: per-offer fault-isolation hole — safeBerlinDay + filter now skips malformed ranges per-offer, never poisons the whole store"
    - "WR-02: schema-drift writes zero files — writeErrorStatus now atomically writes a minimal valid status.json on drift before rethrowing"
    - "WR-03: bootstrap-key island regex over-tight — loosened to tolerate extra attributes and whitespace, ReDoS-safe"
    - "WR-04: no total wall-clock cap on fetchOffers — shared 20s AbortSignal.timeout(TOTAL_DEADLINE_MS) spans both chained calls"
  gaps_remaining: []
  regressions: []
---

# Phase 2: Core Scraper Verification Report

**Phase Goal:** A scheduled, fault-isolated ETL produces real data files on the frozen schema — fetching the 12x1L case automatically, normalizing it, and maintaining a clean append-only price history.
**Verified:** 2026-06-15T17:30:00Z
**Status:** passed
**Re-verification:** Yes — after WR-01/WR-02/WR-03/WR-04 gap closure (commits ddd9711, 7d878c5, b69714c, 9943d22)

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                                                          | Status     | Evidence                                                                                                     |
|----|--------------------------------------------------------------------------------------------------------------------------------|------------|--------------------------------------------------------------------------------------------------------------|
| 1  | Running the scraper auto-fetches the 12x1L case and writes current-offers.json conforming to the frozen schema                | VERIFIED   | `run()` e2e test Case A passes; 96/96 green                                                                 |
| 2  | Each offer is normalized to price (excluding Pfand), EUR/litre, store, and valid-from/valid-to dates                          | VERIFIED   | scraper/normalize.mjs: integer cents, pricePerLitre, Intl Berlin dates, no pfand key; 8 normalize assertions pass |
| 3  | Re-running the scraper appends new prices without creating duplicate entries                                                   | VERIFIED   | scraper/dedup.mjs: frozen `store\|price\|validFrom` key; e2e Case C cross-run dedup passes                 |
| 4  | A failed or unavailable store fetch is isolated: run completes, last-known data preserved, store marked stale                 | VERIFIED   | WR-01 fixed: per-offer isolation confirmed by 3 new tests; WR-02 fixed: error status.json written on drift; e2e Cases D/E pass |
| 5  | Every run records per-store fetch status and a last-updated timestamp                                                          | VERIFIED   | merge.mjs two-timestamp semantics; e2e Case F (file-level lastUpdated = injected now) passes                |

**Score:** 5/5 truths verified

### Deferred Items

None. All phase-2 requirements are fully addressed in this phase.

### Required Artifacts

| Artifact              | Expected                                                                    | Status     | Details                                                      |
|-----------------------|-----------------------------------------------------------------------------|------------|--------------------------------------------------------------|
| `scraper/clock.mjs`   | Injectable now() seam (systemNow/makeClock)                                 | VERIFIED   | exports `systemNow`; used in index.mjs                       |
| `scraper/normalize.mjs` | toStoreOffer + berlinDay (Intl Berlin, no slice, no pfand)                | VERIFIED   | Intl.DateTimeFormat present; no UTC slice; exports both      |
| `scraper/filter.mjs`  | filterToAllowList -> Map<store, rawOffer[]> 5-slug allow-list               | VERIFIED   | exports `filterToAllowList`; pre-seeds all 4 keys            |
| `scraper/select.mjs`  | selectForStore active-first/upcoming/lowest-price ladder + WR-01 fix       | VERIFIED   | 119 lines; `safeBerlinDay` (lines 17-20) + `berlinRanges` filter (line 34) present; 3 new WR-01 tests pass |
| `scraper/dedup.mjs`   | historyLinesToAppend + keyOf, frozen-key dedup, needsReview excluded        | VERIFIED   | exports both; imports `parseHistoryLine` for pre-emit validation |
| `scraper/fetch.mjs`   | withRetry + getKeys + searchOffers + fetchOffers; WR-03 loosened regex; WR-04 shared deadline | VERIFIED | 183 lines; island regex loosened at line 106; `TOTAL_DEADLINE_MS = 20_000` + shared `deadline` signal at lines 178-180; 8 new WR-03/WR-04 tests pass |
| `scraper/io.mjs`      | readPrior, writeAtomic, appendLines (temp+rename, ENOENT-tolerant)          | VERIFIED   | exports all 3; same-dir temp; uses `appendFile` for history  |
| `scraper/merge.mjs`   | mergeWithPrior carry-forward/cold-start/two-timestamp/Wasgau                | VERIFIED   | exports `mergeWithPrior`; 8 merge assertions pass            |
| `scraper/index.mjs`   | run() orchestrator; fault-isolated per-store loop; writeErrorStatus on drift (WR-02) | VERIFIED | 224 lines; `writeErrorStatus()` function at lines 86-99; try/catch wraps parseCurrentOffers/parseStatusFile at lines 168-180; 1 new WR-02 test passes |
| `package.json`        | npm run scrape -> node scraper/index.mjs                                    | VERIFIED   | `"scrape": "node scraper/index.mjs"` confirmed               |

### Key Link Verification

| From                  | To                       | Via                                          | Status   | Details                                                      |
|-----------------------|--------------------------|----------------------------------------------|----------|--------------------------------------------------------------|
| `scraper/index.mjs`   | `scraper/fetch.mjs`      | injected `fetchOffers` (default real)        | WIRED    | `import { fetchOffers as realFetchOffers }` + used as default |
| `scraper/index.mjs`   | `contract/schema.mjs`    | parse* validation before every write         | WIRED    | `parseCurrentOffers`/`parseStatusFile` at lines 169-170; drift path calls `writeErrorStatus` before rethrowing |
| `scraper/index.mjs`   | `writeErrorStatus`       | drift catch block (WR-02)                    | WIRED    | lines 171-179: catch block calls `writeErrorStatus(dataDir, now)`, best-effort wraps its own await, then rethrows original drift error |
| `scraper/merge.mjs`   | prior current-offers.json | verbatim carry-forward on error             | WIRED    | `{ ...priorOffer }` spread at merge.mjs confirmed; e2e Case D |
| `scraper/select.mjs`  | `contract/matcher.mjs`   | `classify()` gate over candidates            | WIRED    | `import { classify }` line 9; used in selectForStore loop    |
| `scraper/select.mjs`  | `safeBerlinDay` (WR-01)  | `berlinRanges` filter drops null from/to     | WIRED    | `safeBerlinDay` defined lines 17-20; called inside `berlinRanges` map (lines 30-33); `.filter((r) => r.from && r.to)` at line 34 |
| `scraper/dedup.mjs`   | `scraper/normalize.mjs`  | `berlinDay` for observation date             | WIRED    | `import { berlinDay }` at dedup.mjs line 16; used at line 33 |
| `scraper/fetch.mjs`   | `AbortSignal.timeout` (per-attempt) | fresh per-attempt signal inside withRetry | WIRED | `AbortSignal.timeout(PER_ATTEMPT_TIMEOUT_MS)` at fetch.mjs line 64; distinct-signal test passes |
| `scraper/fetch.mjs`   | `AbortSignal.timeout` (shared deadline, WR-04) | `TOTAL_DEADLINE_MS` shared across both chained calls | WIRED | `const deadline = AbortSignal.timeout(TOTAL_DEADLINE_MS)` at line 178; passed to `withRetry(getKeys, { deadline })` and `withRetry((signal) => searchOffers(keys, signal), { deadline })`; 3 new WR-04 tests pass |
| `scraper/io.mjs`      | `node:fs/promises rename` | atomic temp+rename write                   | WIRED    | `rename` imported line 17; used at io.mjs:70                 |

### Data-Flow Trace (Level 4)

| Artifact             | Data Variable       | Source                              | Produces Real Data | Status    |
|----------------------|---------------------|-------------------------------------|--------------------|-----------|
| `scraper/index.mjs`  | `results`           | `fetchOffers()` -> marktguru API    | Yes (or [] on total failure, fault-isolated) | FLOWING |
| `scraper/index.mjs`  | `currentOffers`     | `mergeWithPrior(storeResults, ...)` | Yes — built from normalized results or verbatim prior | FLOWING |
| `scraper/index.mjs`  | `lines`             | `historyLinesToAppend(currentOffers.stores, existingKeys, now)` | Yes — deduped JSONL lines | FLOWING |
| Written files        | all 3 data files    | `writeAtomic` + `appendLines`       | Yes — validated before write (T-02-08); error status.json written on drift (WR-02) | FLOWING |

### Behavioral Spot-Checks

| Behavior                                            | Command                  | Result                | Status |
|-----------------------------------------------------|--------------------------|-----------------------|--------|
| Full test suite including all 12 new WR fix tests   | `npm test`               | 96 pass, 0 fail       | PASS   |
| WR-01: malformed range skipped, not store-poisoning | test enumerated (3 tests) | all 3 pass           | PASS   |
| WR-02: drift writes valid error status.json         | test enumerated (1 test)  | passes                | PASS   |
| WR-03: loosened island regex matches Next.js shape  | test enumerated (4 tests) | all 4 pass           | PASS   |
| WR-04: shared deadline bounds total fetch           | test enumerated (3 tests) | all 3 pass           | PASS   |

### Probe Execution

No conventional `scripts/*/tests/probe-*.sh` probes declared for this phase. Phase verification uses inline node checks and `npm test`.

### Requirements Coverage

| Requirement | Source Plan | Description                                                                | Status    | Evidence                                                     |
|-------------|-------------|----------------------------------------------------------------------------|-----------|--------------------------------------------------------------|
| DATA-01     | 02-01, 02-02, 02-03 | Auto-fetch 12x1L offers for 5 stores, write current-offers.json conforming to schema | SATISFIED | Full scraper pipeline wired; 96 tests pass |
| DATA-03     | 02-01       | Normalize each offer to price (ex-Pfand), EUR/litre, store, valid dates    | SATISFIED | scraper/normalize.mjs: integer cents, pricePerLitre, Intl Berlin dates, no pfand key |
| DATA-04     | 02-01, 02-03 | Append price history deduplicated on re-run                               | SATISFIED | scraper/dedup.mjs: frozen `store\|price\|validFrom` key; e2e Case C cross-run dedup passes |
| DATA-05     | 02-02, 02-03 | Failed store fetch isolated; run completes; last-known data preserved      | SATISFIED | WR-01 now isolates per-offer (not just per-store); WR-02 writes error status.json on drift; e2e Cases D/E pass |
| DATA-06     | 02-03       | Per-store fetch status and last-updated timestamp on every run             | SATISFIED | merge.mjs two-timestamp semantics; e2e Case F passes         |

**Coverage:** 5/5 Phase-2 requirements satisfied. No orphaned requirements found.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| No TBD/FIXME/XXX/TODO markers found in any modified scraper module | — | — | — | Clean |

No debt markers, no hardcoded empty returns masquerading as implementations, no stubs found. All WR fixes include explanatory comments (WR-01 comment block at select.mjs lines 12-16 and 22-26; WR-02 doc-comment at index.mjs lines 74-99; WR-03 comment at fetch.mjs lines 99-103; WR-04 comment at fetch.mjs lines 173-177).

### Human Verification Required

None. All previously deferred human decisions (WR-01, WR-02) were resolved by code fixes. All 4 warnings are now closed with tests.

### Gaps Summary

No gaps. All 4 WR warnings from the initial code review are fixed and verified by the expanded test suite (96/96 green, up from 84/84). The phase goal is fully achieved: the ETL is scheduled-capable, fault-isolated at per-offer granularity, produces valid data files on the frozen schema, and maintains a clean append-only price history with deduplication.

---

_Verified: 2026-06-15T17:30:00Z_
_Verifier: Claude (gsd-verifier)_
_Re-verification after: /gsd-code-review 02 --fix (commits ddd9711, 7d878c5, b69714c, 9943d22)_
