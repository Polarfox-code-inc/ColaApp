---
phase: 05-wasgau-leaflet-source
verified: 2026-10-12T21:00:00Z
status: human_needed
score: 13/13 must-haves verified
covered_files: [".github/workflows/diagnose.yml", ".planning/REQUIREMENTS.md", ".planning/phases/05-wasgau-leaflet-source/05-01-PLAN.md", ".planning/phases/05-wasgau-leaflet-source/05-01-SUMMARY.md", ".planning/phases/05-wasgau-leaflet-source/05-02-PLAN.md", ".planning/phases/05-wasgau-leaflet-source/05-02-SUMMARY.md", ".planning/phases/05-wasgau-leaflet-source/05-03-PLAN.md", ".planning/phases/05-wasgau-leaflet-source/05-03-SUMMARY.md", ".planning/phases/05-wasgau-leaflet-source/05-04-PLAN.md", ".planning/phases/05-wasgau-leaflet-source/05-04-SUMMARY.md", ".planning/phases/05-wasgau-leaflet-source/05-05-PLAN.md", ".planning/phases/05-wasgau-leaflet-source/05-05-SUMMARY.md", "scraper/fetch.mjs", "scraper/filter.mjs", "scraper/index.mjs", "scraper/merge.mjs", "scraper/wasgau/build.mjs", "scraper/wasgau/candidates.mjs", "scraper/wasgau/config.mjs", "scraper/wasgau/dates.mjs", "scraper/wasgau/leaflet.mjs", "scraper/wasgau/pair.mjs", "scraper/wasgau/source.mjs", "test/fixtures/wasgau/homepage.html", "test/fixtures/wasgau/index.html", "test/fixtures/wasgau/page_1.xml", "test/fixtures/wasgau/page_17.positive.xml", "test/fixtures/wasgau/page_17.xml", "test/fixtures/wasgau/page_24.xml", "test/fixtures/wasgau/page_26.xml", "test/scraper.merge.test.mjs", "test/scraper.run.test.mjs", "test/scraper.wasgau.candidates.test.mjs", "test/scraper.wasgau.dates.test.mjs", "test/scraper.wasgau.leaflet.test.mjs", "test/scraper.wasgau.pair.test.mjs", "test/scraper.wasgau.source.test.mjs", "web/src/chart/history.js", "web/src/main.js", "web/test/chart.test.mjs"]
covered_digest: "v3:sha256:b99e70a0c61f9c16220925b64286fa88fd64e34fd3bc3da3067b269529fa643e"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Visual: open the rendered price-history chart (uPlot) once a clean Wasgau offer exists in history, or inspect the legend/line rendering, and confirm the teal #00838F Wasgau line/legend swatch is visually distinguishable from REWE/Edeka/Lidl/Kaufland and from the amber #9a5b00 warning colour on an actual phone screen"
    expected: "Wasgau's line and legend swatch read as a distinct colour, and the solid-filled markers are visibly different from the other stores' hollow/open markers"
    why_human: "Colour legibility and marker distinguishability on a real screen are visual judgments; RESEARCH assumption A7 and the Wave-1 UI safety gate both flagged this as an unconfirmed visual assumption (no UI-SPEC existed for this phase) — unit tests only prove the 5 colours are programmatically distinct hex values, not that they read well visually"
  - test: "After pushing this phase to master: (1) GitHub → Actions → 'diagnose' → Run workflow (or `gh workflow run diagnose.yml` then `gh run watch`) and open the 'Run scraper (with new matcher) and show output' step log; (2) once the push-triggered 'pipeline' run is green, `git pull` and inspect data/wasgau-candidates.json and data/status.json; (3) open the live PWA on a phone"
    expected: "(1) no 'WASGAU FAILED:' line, and wasgau-candidates.json has a leafletId matching wasgau.de's current leaflet, colaPages listing real Coca-Cola pages, and candidates with paired prices; (2) status.json Wasgau status is 'offer' or 'no_offer', not 'error'; (3) the Wasgau card no longer reads 'nicht automatisch verfügbar' and the chart legend lists Wasgau with a teal swatch. If (1)/(2) show an error, flip WASGAU_CONFIG.enabled to false (kill switch) and report the logged message"
    why_human: "GitHub-hosted runner reachability of wasgau.de / wasgau-dlog.1kcloud.com (RESEARCH Assumption A1) is only observable on a real runner after the code is pushed, and pushing master is the user's decision — explicitly deferred as an end-of-phase <human-check> in 05-05-PLAN.md Task 2, not yet performed"
---

# Phase 5: Wasgau leaflet source Verification Report

**Phase Goal:** Wasgau shows real 12×1L offers instead of the fixed `unavailable` status, sourced from Wasgau's own weekly leaflet text layer (no OCR — marktguru still has zero Wasgau offers as of 2026-10-12).
**Verified:** 2026-10-12T21:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Roadmap Phase 5 Success Criteria (authoritative, SC3's literal "unavailable" wording is amended by context decision D-01 — see row 4) merged with plan-level must-haves.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | P5-SC1 (pure): a reconstructed real-derived leaflet box becomes a `needsReview` Wasgau StoreOffer (899 cents, 75 c/l, 2026-10-12..2026-10-17) via the **unchanged** `contract/matcher.mjs` | ✓ VERIFIED | `node --test test/scraper.wasgau.leaflet.test.mjs` passes "pure leaflet slice (tracer)…"; `scraper/wasgau/candidates.mjs` `extractCandidates`/`evaluateCandidates` call `classify()` from `contract/matcher.mjs` unmodified (git log shows no Phase-5 commit touching `contract/`) |
| 2 | P5-SC1 (end-to-end): `run()` writes a Wasgau entry into `current-offers.json` from the network seam through merge | ✓ VERIFIED | Ran `node --test test/scraper.run.test.mjs` directly — "Wasgau leaflet end-to-end: 4 sequential requests -> needsReview offer + candidates file" passes; `scraper/index.mjs` lines 167-194 wire `createFetchText`→`fetchCandidates`→`evaluateCandidates`→`mergeWithPrior` |
| 3 | P5-SC2: real 2026-10-12 fixtures (6×1L glass, 0.33 can, 2L PET, Sinalco, multi-variant) prove reconstruction + pairing; all 4 pairing classes (clean/ambiguous/mismatch/unpaired) exist and are tested | ✓ VERIFIED | `test/fixtures/wasgau/{page_1,page_17,page_24,page_26}.xml` present (real); `node --test test/scraper.wasgau.pair.test.mjs test/scraper.wasgau.leaflet.test.mjs` — 31 tests, 0 fail, incl. the Pitfall-4 nearest-box trap and p24 left/right layouts |
| 4 | P5-SC3 (fault isolation): any Wasgau-source failure degrades Wasgau alone; marktguru failures never touch Wasgau; a pre-Phase-5 `unavailable` prior is treated as no prior | ✓ VERIFIED (amended) | Context decision D-01 explicitly supersedes SC3's literal "degrades to `unavailable`" with "degrades to `error` + carry-forward" (SC3's *intent* — isolation — is kept, documented rationale in `05-CONTEXT.md` D-01). Ran `node --test test/scraper.run.test.mjs test/scraper.merge.test.mjs` directly: all 9 isolation-specific cases (warm/cold failure, pre-Phase-5 prior, 4 shape changes, marktguru-sweep-with-Wasgau-success) pass |
| 5 | P5-SC4: good-citizen fetching — sequential, descriptive UA, Cola-pages-only, stop early via the leaflet-id cache | ✓ VERIFIED | `node --test test/scraper.wasgau.source.test.mjs` — "fetchCandidates fetches strictly one at a time and only Cola pages" and the UA test pass; Case H in `scraper.run.test.mjs` asserts exactly 4 URLs in order; `scraper/wasgau/build.mjs:66` short-circuits to 1 request on an unchanged leaflet id |
| 6 | D-08: validity precedence — candidate's own box text > page top-band header (y0 ≥ 0.8×height) > leaflet window; coupon/monthly windows never leak | ✓ VERIFIED | `node --test test/scraper.wasgau.dates.test.mjs` passes, incl. the real p26 letter-spaced weekend header (source "page", 2026-10-15..17) and the p1 coupon-exclusion test; `scraper/wasgau/dates.mjs:204-222` implements the 3-level `resolveWindow` |
| 7 | D-05/D-06: unchanged leaflet id → exactly 1 request (homepage only); cached candidates are re-evaluated against `now` and the current matcher every run (never a stale stored verdict) | ✓ VERIFIED | `scraper/wasgau/build.mjs:66` `if (priorDoc?.leafletId === id) return refreshVerdicts(priorDoc);`; `node --test test/scraper.wasgau.candidates.test.mjs` includes the two-run cache test asserting the second run's URL list is exactly the homepage |
| 8 | D-11: `data/wasgau-candidates.json` is deterministic (byte-identical across reruns), zod-`.strict()`-validated before any write, and a failed download leaves the prior file untouched | ✓ VERIFIED | `scraper/wasgau/candidates.mjs` `CandidatesDocSchema` (`.strict()`) + `buildCandidatesDoc` sorts/rounds before `.parse()`; `scraper/wasgau/build.mjs` only returns a doc after every Cola page is parsed; determinism + partial-failure-survival tests in `test/scraper.wasgau.candidates.test.mjs` pass |
| 9 | D-12/D-13: probation forces `needsReview` on every offer by default; once off, only clean pairings become normal offers, ambiguous/mismatch stay `needsReview`, and an accept/review candidate with no paired price marks Wasgau `error` for review | ✓ VERIFIED | `scraper/wasgau/candidates.mjs:185-206` `evaluateCandidates` implements exactly this gating; `WASGAU_CONFIG = Object.freeze({ enabled: true, probation: true })` confirmed frozen and `probation: true` by default in `scraper/wasgau/config.mjs`; behaviors asserted in `test/scraper.wasgau.candidates.test.mjs` |
| 10 | D-16/D-17: the PWA gains a 5th Wasgau chart line (teal `#00838F`, solid-filled markers) that stays empty until a clean offer lands; card label stays plain "Wasgau"; kill-switch on → 4 lines + greyed legend item derived purely from data | ✓ VERIFIED (visual confirmation pending — see Human Verification) | `web/src/chart/history.js`: `STORES_WITH_LINES` = 5 stores incl. `"Wasgau"`, `LINE_COLORS.Wasgau = "#00838F"`, `legendModel`/`lineStores` implement the kill-switch fallback; `web/src/main.js:106` derives `wasgauUnavailable` from `current-offers` status and passes it through; `npm --prefix web test` → passing (part of the 278/278 root total) |
| 11 | HIST-03 (REQUIREMENTS.md) is amended so its text no longer contradicts the shipped 5-line chart | ✓ VERIFIED | `.planning/REQUIREMENTS.md` line 32 now reads "...REWE, Edeka, Lidl, Kaufland, Wasgau...amended Phase 5 (D-16/D-04)"; footer line added 2026-10-12 |
| 12 | Every `run()` call in the test suite injects an explicit Wasgau seam; the suite never touches the real network | ✓ VERIFIED | Network tripwire is the last test in `test/scraper.run.test.mjs` ("network tripwire: no test in this file made a real fetch call") — ran directly and passes; acceptance one-liner (18 `run({` calls, all carrying `wasgau`) matches SUMMARY's self-check |
| 13 | No frozen contract (`contract/`) or deploy pipeline (`.github/workflows/pipeline.yml`) file was touched by this phase | ✓ VERIFIED | `git log --oneline -- contract/` shows the last contract commit predates Phase 5 (pre-existing matcher-scope commit); `grep "cp data/current-offers.json data/status.json data/price-history.jsonl"` and `"git add data/"` in `pipeline.yml` both still present unchanged |

**Score:** 13/13 truths verified (0 present, behavior-unverified)

### Required Artifacts

All artifact checks run via `verify.artifacts` against each plan's `must_haves.artifacts` frontmatter.

| Plan | Result | Details |
|------|--------|---------|
| 05-01 | ✓ 7/7 passed | `leaflet.mjs`, `pair.mjs`, `dates.mjs`, `candidates.mjs`, `page_17.positive.xml`, `scraper.wasgau.leaflet.test.mjs`, `scraper.wasgau.pair.test.mjs` all exist, substantive |
| 05-02 | ✓ 3/3 passed | `history.js`, `main.js`, `chart.test.mjs` |
| 05-03 | ✓ 6/6 passed | `config.mjs`, `build.mjs`, `source.mjs`, `index.mjs`, `merge.mjs`, `scraper.run.test.mjs` |
| 05-04 | ✓ 5/5 passed | `dates.mjs`, `candidates.mjs`, `build.mjs`, `scraper.wasgau.dates.test.mjs`, `scraper.wasgau.candidates.test.mjs` |
| 05-05 | ✓ 4/4 passed | `source.mjs`, `scraper.wasgau.source.test.mjs`, `scraper.run.test.mjs`, `diagnose.yml` |

No MISSING or STUB artifacts found across all 5 plans.

### Key Link Verification

The automated `verify.key-links` tool reported several false negatives because plan frontmatter's `from:` field includes a function name appended to the file path (e.g. `"scraper/wasgau/candidates.mjs extractCandidates"`), which the tool's file-path resolver rejects. Each was manually re-verified by grep/read against the actual source.

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `scraper/wasgau/candidates.mjs extractCandidates` | `pair.mjs pairPrice` + `dates.mjs resolveWindow` | each Cola box paired + windowed | ✓ WIRED (manual) | `candidates.mjs:69-70` calls `pairPrice(box, page.priceTokens)` and `resolveWindow(box, page, leafletWindow)` |
| `scraper/wasgau/candidates.mjs evaluateCandidates` | `scraper/select.mjs selectForStore` | ranked selection | ✓ WIRED (manual) | `candidates.mjs:197,199` calls `selectForStore(clean, now)` / `selectForStore(rest, now)` |
| `scraper/wasgau/build.mjs fetchCandidates` | `candidates.mjs refreshVerdicts` | cache-hit refresh | ✓ WIRED (manual) | `build.mjs:66` `return refreshVerdicts(priorDoc);` |
| `scraper/wasgau/source.mjs createFetchText` | `scraper/fetch.mjs withRetry` + `UA` | retry + header | ✓ WIRED (manual) | `source.mjs:38,88,90` imports and calls both |
| `web/src/chart/history.js renderHistory` | `legendModel` / `prepareChartData` | shared `wasgauUnavailable` flag | ✓ WIRED (manual) | `history.js:294,323` calls both with the same flag |
| `scraper/index.mjs` | `scraper/wasgau/build.mjs fetchCandidates` | Wasgau-only try/catch | ✓ WIRED (automated) | `verify.key-links` on 05-03 passed 6/6 including this link |
| `scraper/merge.mjs` | `contract/schema.mjs STORES` | 5-store loop | ✓ WIRED (automated) | `verify.key-links` on 05-03 passed 6/6 including this link |
| `web/src/main.js` | `web/src/chart/history.js renderHistory` | `{ wasgauUnavailable }` | ✓ WIRED (automated) | confirmed by `grep -c "renderHistory(graph, data.history ?? \[\], { wasgauUnavailable })" web/src/main.js` = 1 |

### Behavioral Spot-Checks / Test Execution

Ran directly rather than trusting SUMMARY claims:

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full root suite | `npm test` | 278/278 pass, 0 fail | ✓ PASS |
| Wasgau unit suites (leaflet/pair/dates/candidates/source) | `node --test test/scraper.wasgau.*.test.mjs` | 83/83 pass | ✓ PASS |
| run()-level tracer + fault isolation | `node --test test/scraper.run.test.mjs` | 20/20 pass, incl. Case H, warm/cold/pre-Phase-5/shape-change/kill-switch/tripwire | ✓ PASS |
| merge unit tests | `node --test test/scraper.merge.test.mjs` | 14/14 pass | ✓ PASS |
| Contract untouched | `git log --oneline -- contract/` | last commit predates Phase 5 | ✓ PASS |
| Live data files reflect Wasgau "unavailable" still | `cat data/current-offers.json`, `data/status.json` | Wasgau still "unavailable" (pre-push state; `data/wasgau-candidates.json` not yet created) | ℹ️ Expected — the real scraper run against production network has not occurred yet; this is the pending human-check below |

### Requirements Coverage

Phase 5's plans declare `requirements: [P5-SC1 … P5-SC4]` — ROADMAP Phase 5 success-criteria labels, not `REQUIREMENTS.md` IDs (the phase's `REQUIREMENTS.md` field is "TBD" in ROADMAP.md, a recorded choice). Cross-referenced against ROADMAP Phase 5's 4 success criteria:

| Roadmap SC | Covered by | Status | Evidence |
|------------|-----------|--------|----------|
| SC1 (offer in current-offers.json, correct price/dates, existing matcher) | 05-01, 05-02, 05-03, 05-04 | ✓ SATISFIED | Truths 1, 2 above |
| SC2 (real-fixture coverage: reconstruction, pairing, dates, negatives) | 05-01 | ✓ SATISFIED | Truth 3 above |
| SC3 (Wasgau-only failure isolation) | 05-03, 05-04, 05-05 | ✓ SATISFIED (wording amended by D-01, intent preserved) | Truth 4 above |
| SC4 (good-citizen fetching) | 05-01, 05-03, 05-04, 05-05 | ✓ SATISFIED | Truth 5 above |

**REQUIREMENTS.md cross-reference:** `HIST-03` (the only `REQUIREMENTS.md` ID touched by this phase, via plan 05-02) is amended and its traceability-table row is unchanged ("Phase 3 | Complete" — Phase 3 remains the owning phase; Phase 5 only amended the text). No `REQUIREMENTS.md` row maps to "Phase 5" in the traceability table, so there are no orphaned requirement IDs to reconcile.

**Note (not a gap):** `OFFR-04` ("A store whose data cannot be fetched automatically (e.g. Wasgau without coverage) shows a clear 'not automatically available' state") still holds structurally — the kill-switch path in `merge.mjs` reproduces it verbatim — but its parenthetical Wasgau example is now stale now that Wasgau has automatic coverage by default. Cosmetic; not required by this phase's scope.

### Anti-Patterns Found

Scanned every file this phase created or modified (`scraper/wasgau/*.mjs`, `scraper/index.mjs`, `scraper/merge.mjs`, `scraper/fetch.mjs`, `scraper/filter.mjs`, `web/src/chart/history.js`, `web/src/main.js`, all new/modified test files, `diagnose.yml`) for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER` and stub-shaped patterns.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | none found | — | No debt markers, no empty-implementation stubs, no hardcoded-empty data flowing to render in any Phase 5 file |

**Pre-existing, already-surfaced findings (not new, not blockers):** The phase's own code review (`05-REVIEW.md` / `05-REVIEW-DISPOSITION.md`, run 2026-10-12T18:34:36Z) found 0 critical, 7 warning, 4 info issues, all still `disposition: open`. Notably:
- **WR-03** (`litresOf` disagrees with the matcher on `×`/`je`/spelled-out `Liter`) and **WR-04** (date parser misses abbreviated weekdays like `Do., 15.10.`) are latent robustness gaps that would only manifest on leaflet phrasings not present in the current real 2026-10-12 fixtures — they do not falsify any of the 13 truths above, which were verified against the actual fixtures and actual tests, but they are real risk for a *future* leaflet once `probation` is switched off.
- **WR-05** (one unpaired Cola box turns Wasgau `error` for the whole week, potentially hiding a correct clean offer) is a real usefulness risk under P5-SC3's fail-loud design, already flagged by the phase's own review.
- These are documented, open, advisory items — not reproduced as new findings here, and not required to be closed for this phase's goal (showing real, needsReview offers via the fixtures committed) to be verified as achieved.

### Human Verification Required

1. **Wasgau chart colour/marker visual distinguishability**
   **Test:** Once a clean Wasgau offer exists (or by rendering the chart with Wasgau data present), visually inspect the teal `#00838F` 5th line and legend swatch.
   **Expected:** Visually distinct from the other 4 store colours and from the amber warning token on a real phone screen; filled markers read as different from the other stores' markers.
   **Why human:** Colour legibility is a visual judgment; RESEARCH assumption A7 and the Wave-1 UI safety gate both flagged this as an unconfirmed assumption (no UI-SPEC existed for this phase's chart change — the user explicitly chose to proceed without one).

2. **Live GitHub-runner reachability check (RESEARCH Assumption A1)**
   **Test:** Push this phase to master, run the `diagnose` workflow, and inspect the resulting `wasgau-candidates.json` / `status.json` / live PWA, per the `<human-check>` block in `05-05-PLAN.md` Task 2.
   **Expected:** No `WASGAU FAILED:` line; a plausible `wasgau-candidates.json`; `status.json` Wasgau status `offer` or `no_offer` (not `error`); the live Wasgau card no longer reads "nicht automatisch verfügbar".
   **Why human:** Only observable on a real GitHub-hosted runner after a push, which is the user's decision to make — this was explicitly deferred as an end-of-phase check and has not been performed yet (confirmed: `data/current-offers.json` and `data/status.json` still show Wasgau "unavailable" locally, and no `data/wasgau-candidates.json` exists yet).

### Gaps Summary

No gaps. All 13 merged must-have truths (4 ROADMAP success criteria + 9 plan-level details) are verified against the actual codebase — not just claimed in SUMMARY.md — by reading the implementation and by re-running the test suites directly (278/278 root, including the Wasgau-specific suites and the run()-level fault-isolation/tracer tests). The two outstanding items are genuine human-verification needs (a visual judgment and a live-network check requiring a push to master), both already anticipated and documented by the phase's own plans, not newly discovered deficiencies.

---

_Verified: 2026-10-12T21:00:00Z_
_Verifier: Claude (gsd-verifier)_
