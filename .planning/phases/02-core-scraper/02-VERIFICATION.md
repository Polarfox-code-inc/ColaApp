---
phase: 02-core-scraper
verified: 2026-06-15T00:00:00Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Confirm WR-01 (fault-isolation hole) is acceptable for v1"
    expected: "Team acknowledges that a single offer with malformed validityDates (undefined from/to) throws RangeError out of selectForStore, which the per-store try/catch in index.mjs catches and marks the WHOLE store as error — even if other valid offers exist in that store's bucket. This is weaker isolation than intended by the phase goal."
    why_human: "berlinDay(undefined) throws RangeError (confirmed empirically). The fix (safeBerlinDay + filter) is straightforward and described in WR-01 of 02-REVIEW.md. Whether this is a blocking defect or an acceptable v1 limitation is a human judgment call."
  - test: "Confirm WR-02 (validation drift leaves zero files written) is acceptable for v1"
    expected: "Team acknowledges that parseCurrentOffers/parseStatusFile run before any write at index.mjs:133-134. If a schema drift causes either to throw, the run exits non-zero and writes NOTHING — breaking the 'always writes all 3 files' invariant for that specific failure path. The prior data/ files remain untouched, which is safe, but status.json is NOT updated to reflect the failure."
    why_human: "This is a deliberate 'fail loud rather than corrupt' tradeoff documented in WR-02 of 02-REVIEW.md. The REVIEW suggests writing a minimal error status.json or at least adding an explicit comment. The decision of whether to fix this now or defer it is a human call."
---

# Phase 2: Core Scraper Verification Report

**Phase Goal:** A scheduled, fault-isolated ETL produces real data files on the frozen schema — fetching the 12x1L case automatically, normalizing it, and maintaining a clean append-only price history.
**Verified:** 2026-06-15
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                                                                                 | Status     | Evidence                                                                                                     |
|----|-------------------------------------------------------------------------------------------------------------------------------------------------------|------------|--------------------------------------------------------------------------------------------------------------|
| 1  | Running the scraper auto-fetches the 12x1L case and writes current-offers.json conforming to the frozen schema                                       | VERIFIED   | `run() OK` spot-check; e2e test Case A passes; `npm test` 84/84 green                                       |
| 2  | Each offer is normalized to price (excluding Pfand), EUR/litre, store, and valid-from/valid-to dates                                                 | VERIFIED   | scraper/normalize.mjs: `Math.round(price*100)`, `Math.round(price/12)`, `Intl.DateTimeFormat Europe/Berlin`; 8 normalize assertions pass |
| 3  | Re-running the scraper appends new prices without creating duplicate entries                                                                          | VERIFIED   | scraper/dedup.mjs: `keyOf` frozen key; e2e test Case C (cross-run dedup); 6 dedup assertions pass          |
| 4  | A failed or unavailable store fetch is isolated: run completes, last-known data preserved, store marked stale (with caveat — see WR-01/WR-02)        | VERIFIED   | index.mjs wraps fetch+per-store build in try/catch; e2e test Cases D and E pass; merge.mjs carry-forward confirmed |
| 5  | Every run records per-store fetch status and a last-updated timestamp                                                                                 | VERIFIED   | merge.mjs: file-level `lastUpdated` always bumps; per-store `lastUpdated` frozen on error, bumped on success; e2e test Case F passes |

**Score:** 5/5 truths verified

### Fault-Isolation Caveats (from 02-REVIEW.md Warnings)

Truth #4 is VERIFIED with two unresolved warnings from the code review that affect the completeness of the fault-isolation guarantee:

**WR-01 (Warning):** `berlinDay(undefined)` throws `RangeError: Invalid time value` — confirmed empirically. In `select.mjs:berlinRanges`, if a marktguru offer has a `validityDates` entry with `from` or `to` as `undefined`, `berlinDay(r?.from)` throws. This throw propagates out of `selectForStore` and is caught by the per-store try/catch in `index.mjs:118`, marking the **entire store** as `error` — even if other valid offers exist in that store's bucket. One drifted offer suppresses a real available offer.

**WR-02 (Warning):** `parseCurrentOffers`/`parseStatusFile` run at `index.mjs:133-134` BEFORE any `writeAtomic`. If a schema drift causes either to throw, the run exits non-zero and writes zero files. The prior `data/` files remain (safe), but `status.json` is never updated to signal the failure. This breaks the "always writes all 3 files" invariant for the schema-drift path specifically.

Both were identified by the code reviewer and are documented in `02-REVIEW.md`. Neither is a data-loss path. They require a human decision on whether to fix before closing this phase.

### Deferred Items

None. All phase-2 requirements are fully addressed in this phase.

### Required Artifacts

| Artifact              | Expected                                                                    | Status     | Details                                                      |
|-----------------------|-----------------------------------------------------------------------------|------------|--------------------------------------------------------------|
| `scraper/clock.mjs`   | Injectable now() seam (systemNow/makeClock)                                 | VERIFIED   | 10 lines; exports `systemNow`; used in index.mjs             |
| `scraper/normalize.mjs` | toStoreOffer + berlinDay (Intl Berlin, no slice, no pfand)                | VERIFIED   | 55 lines; Intl.DateTimeFormat present; no UTC slice; exports both |
| `scraper/filter.mjs`  | filterToAllowList -> Map<store, rawOffer[]> 5-slug allow-list               | VERIFIED   | 35 lines; exports `filterToAllowList`; pre-seeds all 4 keys  |
| `scraper/select.mjs`  | selectForStore active-first/upcoming/lowest-price/needsReview ladder        | VERIFIED   | 104 lines; exports `selectForStore`; imports `classify` from contract/matcher.mjs; no `new Date()` call |
| `scraper/dedup.mjs`   | historyLinesToAppend + keyOf, frozen-key dedup, needsReview excluded        | VERIFIED   | 52 lines; exports both; imports `parseHistoryLine` for pre-emit validation |
| `scraper/fetch.mjs`   | withRetry + getKeys + searchOffers + fetchOffers (native fetch, AbortSignal.timeout) | VERIFIED | 147 lines; exports `withRetry`, `fetchOffers`; `AbortSignal.timeout(10_000)` inside the retry loop (line 46); no axios/node-fetch |
| `scraper/io.mjs`      | readPrior, writeAtomic, appendLines (temp+rename, ENOENT-tolerant)          | VERIFIED   | 90 lines; exports all 3; same-dir temp (`grep -c tmpdir == 0`); uses `appendFile` for history; `io.mjs OK` spot-check passes |
| `scraper/merge.mjs`   | mergeWithPrior carry-forward/cold-start/two-timestamp/Wasgau                | VERIFIED   | 105 lines; exports `mergeWithPrior`; 8 merge assertions pass  |
| `scraper/index.mjs`   | run() orchestrator + CLI entry; fault-isolated per-store loop; always writes all 3 files (with WR-02 caveat) | VERIFIED | 178 lines; exports `run`; imports and wires all 7 scraper modules + both contract modules |
| `package.json`        | npm run scrape -> node scraper/index.mjs                                    | VERIFIED   | `"scrape": "node scraper/index.mjs"` confirmed               |

### Key Link Verification

| From                  | To                       | Via                                          | Status   | Details                                                      |
|-----------------------|--------------------------|----------------------------------------------|----------|--------------------------------------------------------------|
| `scraper/index.mjs`   | `scraper/fetch.mjs`      | injected `fetchOffers` (default real)        | WIRED    | `import { fetchOffers as realFetchOffers }` + used as default |
| `scraper/index.mjs`   | `contract/schema.mjs`    | parse* validation before every write         | WIRED    | `parseCurrentOffers`/`parseStatusFile` at lines 133-134     |
| `scraper/merge.mjs`   | prior current-offers.json | verbatim carry-forward on error             | WIRED    | `{ ...priorOffer }` spread at merge.mjs:64; confirmed by e2e Case D |
| `scraper/select.mjs`  | `contract/matcher.mjs`   | `classify()` gate over candidates            | WIRED    | `import { classify } from "../contract/matcher.mjs"` line 9; used at line 58 |
| `scraper/dedup.mjs`   | `scraper/normalize.mjs`  | `berlinDay` for observation date             | WIRED    | `import { berlinDay }` at dedup.mjs:16; used at line 33     |
| `scraper/fetch.mjs`   | `AbortSignal.timeout`    | fresh per-attempt timeout signal             | WIRED    | `AbortSignal.timeout(10_000)` at fetch.mjs:46 inside the loop; confirmed distinct-signal test passes |
| `scraper/io.mjs`      | `node:fs/promises rename` | atomic temp+rename write                   | WIRED    | `rename` imported line 17; used at io.mjs:70; `io.mjs OK` spot-check passes |

### Data-Flow Trace (Level 4)

| Artifact             | Data Variable       | Source                              | Produces Real Data | Status    |
|----------------------|---------------------|-------------------------------------|--------------------|-----------|
| `scraper/index.mjs`  | `results`           | `fetchOffers()` -> marktguru API    | Yes (or [] on failure, fault-isolated) | FLOWING |
| `scraper/index.mjs`  | `currentOffers`     | `mergeWithPrior(storeResults, ...)` | Yes — built from normalized results or verbatim prior | FLOWING |
| `scraper/index.mjs`  | `lines`             | `historyLinesToAppend(currentOffers.stores, existingKeys, now)` | Yes — deduped JSONL lines | FLOWING |
| Written files        | all 3 data files    | `writeAtomic` + `appendLines`       | Yes — validated before write (T-02-08) | FLOWING |

### Behavioral Spot-Checks

| Behavior                                     | Command                                        | Result                | Status |
|----------------------------------------------|------------------------------------------------|-----------------------|--------|
| `run()` with empty fetch writes 5-store valid docs | `node --input-type=module` inline verify   | `run() OK`            | PASS   |
| `io.mjs` atomic write + append + cold-start null | `node --input-type=module` inline verify   | `io.mjs OK`           | PASS   |
| `berlinDay(undefined)` throws (WR-01 probe)  | empirical node eval                            | `RangeError: Invalid time value` | CONFIRMED (WARNING) |
| Full test suite 84/84                        | `npm test`                                     | 84 pass, 0 fail       | PASS   |

### Probe Execution

No conventional `scripts/*/tests/probe-*.sh` probes declared for this phase. Phase verification uses inline node checks and `npm test`.

### Requirements Coverage

| Requirement | Source Plan | Description                                                                | Status    | Evidence                                                     |
|-------------|-------------|----------------------------------------------------------------------------|-----------|--------------------------------------------------------------|
| DATA-01     | 02-01, 02-02, 02-03 | Auto-fetch 12x1L offers for 5 stores, write current-offers.json conforming to schema | SATISFIED | scraper/index.mjs wires fetch->filter->select->normalize->merge->validate->write; e2e test Case A (84 tests pass) |
| DATA-03     | 02-01       | Normalize each offer to price (ex-Pfand), EUR/litre, store, valid dates    | SATISFIED | scraper/normalize.mjs: integer cents, pricePerLitre, Intl Berlin dates, no pfand key; 6 normalize assertions |
| DATA-04     | 02-01, 02-03 | Append price history deduplicated on re-run                               | SATISFIED | scraper/dedup.mjs: frozen `store\|price\|validFrom` key; e2e Case C cross-run dedup passes |
| DATA-05     | 02-02, 02-03 | Failed store fetch isolated; run completes; last-known data preserved      | SATISFIED (with WR-01/WR-02 caveats) | index.mjs per-store + total-fetch try/catch; merge.mjs carry-forward; e2e Cases D and E pass |
| DATA-06     | 02-03       | Per-store fetch status and last-updated timestamp on every run             | SATISFIED | merge.mjs two-timestamp semantics; e2e Case F (file-level lastUpdated = injected now) passes |

**Coverage:** 5/5 Phase-2 requirements satisfied. No orphaned requirements found — DATA-01, DATA-03, DATA-04, DATA-05, DATA-06 all claimed and verified.

### Anti-Patterns Found

| File                  | Line | Pattern         | Severity    | Impact                                                       |
|-----------------------|------|-----------------|-------------|--------------------------------------------------------------|
| No TBD/FIXME/XXX/TODO markers found in any modified scraper module | — | — | — | Clean |

No debt markers, no hardcoded empty returns masquerading as implementations, no stubs found. The `return null` in `io.mjs:34` (cold-start ENOENT) and `return null` at `select.mjs:67,86` (no usable range for an offer) are intentional logic gates, not stubs — both are backed by data-fetching paths that populate the variable or tested fallback behaviors.

### Human Verification Required

#### 1. WR-01: Accept or fix the per-offer fault-isolation hole in select.mjs

**Test:** Confirm whether a malformed `validityDates` entry (e.g. `{from: undefined, to: "2026-06-21T00:00:00Z"}`) from marktguru is acceptable to silently suppress a whole store's offers in v1, or whether the `safeBerlinDay` fix from 02-REVIEW.md should be applied before closing this phase.

**Expected:** Either (a) team accepts WR-01 as a known v1 limitation — marktguru data quality is generally good and the per-store try/catch still prevents a crash — or (b) apply the fix: guard `berlinRanges` with `safeBerlinDay` that returns `null` on Invalid Date and filter out ranges with null from/to.

**Why human:** The empirical probe confirms the throw is real (`RangeError: Invalid time value` from `berlinDay(undefined)`). Whether it blocks v1 depends on risk tolerance and expected marktguru data quality — not determinable from a static code check.

#### 2. WR-02: Accept or fix the validation-drift / zero-files path in index.mjs

**Test:** Confirm whether the schema-validation-throws-before-write path (index.mjs:132-134) is acceptable as a "hard stop on drift" or whether a minimal error `status.json` should be written so the operator gets a machine-readable failure signal.

**Expected:** Either (a) team accepts the current behavior (prior data files remain untouched; only the log shows a failure) with an explicit comment at line 132 documenting "no files written on drift" — OR (b) apply the REVIEW suggestion: catch validation errors separately and write a minimal error `status.json` before re-throwing.

**Why human:** This is a deliberate "fail loud rather than corrupt" tradeoff. Both options are defensible. The decision affects operational observability but not data correctness.

### Gaps Summary

No BLOCKER gaps found. The pipeline is fully wired and the test suite is 84/84 green. Two WARNING-level findings from the code review (WR-01, WR-02) touch the "fault-isolated" and "always writes all 3 files" claims in the phase goal but do not constitute data loss or corruption. Human decision required before closing.

---

_Verified: 2026-06-15_
_Verifier: Claude (gsd-verifier)_
