---
phase: 05-wasgau-leaflet-source
plan: 04
subsystem: scraper
tags: [wasgau, validity-window, cache, review-gating, probation, zod, node-test, tdd]

requires:
  - phase: 05-wasgau-leaflet-source
    provides: "Plan 05-01 pure core (parseWindow/resolveWindow signatures, extractCandidates, buildCandidatesDoc, parseCandidatesDoc, evaluateCandidates); Plan 05-03 fetchCandidates leaflet-id cache + run({ wasgau }) seam"
  - phase: 02-scraper
    provides: "selectForStore (active > upcoming, expiry), toStoreOffer, dedup history filter on needsReview"
provides:
  - "scraper/wasgau/dates.mjs: TOP_BAND_RATIO (0.8); parseWindow with word-month + numeric families, VOM/VON, letter-spaced headers, refDate year inference incl. Dec/Jan rollover; resolveWindow box > page top band > leaflet (D-08)"
  - "scraper/wasgau/candidates.mjs: refreshVerdicts(doc); evaluateCandidates with clean-first gating, D-13 needsReview, unpaired-case error"
  - "scraper/wasgau/build.mjs: cache hit returns refreshVerdicts(priorDoc) after the single homepage request"
  - "Error contract: 'wasgau: Cola case candidate without a paired price (page P box B)'"
affects: [05-05 hardening + fault-isolation proofs, phase verification]

actuals:
  tokens: 9940
  tasks: 2
  commits: 4
plan_head_before: 4ea29ce45568211134325b1a8239c632c83a77e9
plan_head_after: 62d0de74c74f5fa525a8837ecdbb03d329ec695b

tech-stack:
  added: []
  patterns:
    - "Window parsing in two passes (whitespace-collapsed, then whitespace-free) so letter-spaced PDF headers match the same bounded regexes"
    - "Two-tier selection: selectForStore over clean accepts, then over the rest with needsReview forced"
    - "Cache hit = refreshed prior doc: only the verdict field is recomputed, so bytes stay identical under an unchanged matcher"

key-files:
  created:
    - test/scraper.wasgau.dates.test.mjs
    - test/scraper.wasgau.candidates.test.mjs
  modified:
    - scraper/wasgau/dates.mjs
    - scraper/wasgau/candidates.mjs
    - scraper/wasgau/build.mjs

key-decisions:
  - "TOP_BAND_RATIO is 0.8, not RESEARCH's 0.9: real headers sit at 0.966/0.967/0.844 and the boxes that must stay out at 0.706 (p1 coupon) and 0.642 (p8 monthly)"
  - "A window phrase without any year resolves against refDate = leafletWindow.from, picking the from-year in {Y-1, Y, Y+1} closest to it; the to-year follows (+1 when the from-month is later than the to-month). Without refDate such a phrase is null"
  - "Any accept/review candidate with pairing unpaired (or null price) throws, even if its window has expired, so a broken pairing is never silently hidden"

patterns-established:
  - "Wasgau run()-level tests go through one runW(dir, now, wasgau) helper with an explicit seam; fixture variants are in-memory string edits"

requirements-completed: [P5-SC1, P5-SC2, P5-SC3, P5-SC4]

coverage:
  - id: D1
    description: "D-08 window precedence on real geometry: p26 2 L Coca Cola gets the letter-spaced weekend header 2026-10-15..17 (source page), p24 box 3 the page header, p1 box 28 the leaflet header and never the 0.706 app coupon, p17 box 14 the leaflet window; a window in the box itself wins (P5-SC1)"
    requirement: "P5-SC1"
    verification:
      - kind: unit
        ref: "test/scraper.wasgau.dates.test.mjs#resolveWindow: p26 box 36 (2 L Coca Cola) takes the letter-spaced weekend header"
        status: pass
      - kind: unit
        ref: "test/scraper.wasgau.dates.test.mjs#resolveWindow: p1 box 28 gets the leaflet header, never the mid-page app coupon (Pitfall 6)"
        status: pass
      - kind: unit
        ref: "test/scraper.wasgau.candidates.test.mjs#run: the p26 2 L Coca Cola candidate carries the page weekend window (Task 1 integrated)"
        status: pass
    human_judgment: false
  - id: D2
    description: "German window parsing: word-month and numeric, VOM/VON, letter-spacing, inherited month, refDate year incl. Dec/Jan rollover, MÄRZ/MAERZ; null for non-windows, month 0, to<from and spans over 31 days (P5-SC2)"
    requirement: "P5-SC2"
    verification:
      - kind: unit
        ref: "test/scraper.wasgau.dates.test.mjs (parseWindow cases)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Review gating: probation forces needsReview; with probation off only a clean pairing becomes a normal offer and enters history once; ambiguous/mismatch stay needsReview with the best-guess price; an unpaired Cola case turns only Wasgau 'error' while the candidates file is still written (P5-SC3)"
    requirement: "P5-SC3"
    verification:
      - kind: unit
        ref: "test/scraper.wasgau.candidates.test.mjs (evaluate cases)"
        status: pass
      - kind: integration
        ref: "test/scraper.wasgau.candidates.test.mjs#run: an unpaired Cola case candidate -> Wasgau error, near-miss still written for review (P5-SC3, D-10/D-11)"
        status: pass
      - kind: integration
        ref: "test/scraper.wasgau.candidates.test.mjs#run: probation OFF turns the clean leaflet offer into a normal offer with one history line (D-12)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Leaflet-id cache: an unchanged id costs exactly one request (homepage), the candidates file is byte-identical, Wasgau lastUpdated bumps; a new id or corrupt file re-downloads; a failed new-leaflet page keeps the old file; expired -> no_offer without re-download; future window -> upcoming (P5-SC4)"
    requirement: "P5-SC4"
    verification:
      - kind: integration
        ref: "test/scraper.wasgau.candidates.test.mjs#run: unchanged leaflet id costs ONE request, byte-identical candidates file, lastUpdated bumps (D-05/D-06/D-11)"
        status: pass
      - kind: integration
        ref: "test/scraper.wasgau.candidates.test.mjs#run: a failed new-leaflet page download keeps the previous candidates file (Pitfall 10)"
        status: pass
      - kind: integration
        ref: "test/scraper.wasgau.candidates.test.mjs#run: an expired cached leaflet yields no_offer without any re-download (D-06)"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-10-12
status: complete
---

# Phase 5 Plan 04: Wasgau Validity Windows and Review Gating Summary

**Each Wasgau candidate now takes its validity window from its own box, then from a page top-band header (y0 >= 0.8 x height), then from the leaflet. That gives the real p26 2 L Coca Cola the letter-spaced weekend window 2026-10-15..17 and keeps the p1 app coupon out. Cached candidates are re-evaluated every run at the cost of one homepage request: clean pairings rank first, ambiguous or mismatched ones stay needsReview, probation forces review, and an unpaired Cola case turns only Wasgau into "error" while the near-miss is still written.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-10-12T18:14:45Z
- **Completed:** 2026-10-12T18:20:17Z
- **Tasks:** 2 (both TDD: RED then GREEN commits)
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments
- `parseWindow` handles every format listed in the plan. It tries word-month, then numeric, first on whitespace-collapsed text and then on whitespace-free text, so the real p26 header "VO N D O N N E R STAG 1 5. O KTO B E R ..." parses. Missing months and years are inferred, including across New Year. All quantifiers are bounded (T-05-11).
- `resolveWindow` implements D-08 on real geometry. p24 box 3 and p26 box 36 resolve to 2026-10-15..17 with source "page". p1 box 28 gets 2026-10-12..17 from the top-band header, never the 0.706 coupon. p17 box 14 falls back to the leaflet window. A synthetic box with its own window wins over a different page window.
- `evaluateCandidates` gating follows the plan's five steps. Its message contract is `wasgau: Cola case candidate without a paired price (page P box B)`.
- `refreshVerdicts(doc)` recomputes only `verdict`. `fetchCandidates` returns `refreshVerdicts(priorDoc)` on a cache hit, so an unchanged week costs exactly `["https://www.wasgau.de/"]` and leaves the file byte-identical.
- run()-level proofs cover:
  - new id (4 URLs, file id `ep2NEW99`)
  - corrupt file (cache miss, rewritten valid)
  - failed page_26 on a new id (Wasgau error, old file byte-identical; cold dir: no file)
  - unpaired box 14 (Wasgau error, file written with `unpaired` / `null`)
  - probation off (one history line 899 / 75 / 2026-10-12..17)
  - Sinalco-only index (2 URLs, `colaPages: []`, no_offer)
  - expiry (no_offer, 1 URL) and an upcoming leaflet
- Full root suite is green at 250/250, up from 209. `git diff 4ea29ce -- scraper/index.mjs scraper/merge.mjs contract/` is empty.

## Task Commits

1. **Task 1: Validity-window precedence (D-08)**: `0115ea2` (test, RED) and `fdefa99` (feat, GREEN)
2. **Task 2: Candidate cache, re-evaluation and review gating**: `7ee1b6a` (test, RED) and `62d0de7` (feat, GREEN)

## TDD Gate Compliance
- **Task 1 RED:** `node --test --test-reporter=tap test/scraper.wasgau.dates.test.mjs` exited 1 with 9 of 17 tests failing. The classifier returned `RED_EVIDENCE_OK` for target "resolveWindow: p26 box 36 (2 L Coca Cola) takes the letter-spaced weekend header" (expected source page 10-15..17, actual leaflet 10-12..17). Semantic assessment: every failure is an `ERR_ASSERTION` on planned behaviour. The 8 passing tests cover pre-existing behaviour and rejection guards. The first RED attempt was a module-load failure (missing named export `TOP_BAND_RATIO`), which does not count as RED. The test was switched to a namespace import and re-run before commit.
- **Task 2 RED:** 6 of 24 tests failed, all `ERR_ASSERTION`: D-13 ambiguous/mismatch, clean-over-ambiguous, the unpaired throw ("Missing expected exception"), refreshVerdicts not exported, and the run-level unpaired error. The classifier returned `RED_EVIDENCE_OK` for target "evaluate: an ambiguous accept stays needsReview with its best-guess price (D-13)". The cache and determinism run-level tests were already green at RED because Plan 05-03 built the id cache. They are kept as regression proofs for the refreshVerdicts change.
- **GREEN:** both feat commits follow their test commits, and the suite passed after each one. No refactor commit was needed.

## Files Created/Modified
- `scraper/wasgau/dates.mjs`: TOP_BAND_RATIO, two-family two-pass parseWindow, year inference, three-level resolveWindow
- `scraper/wasgau/candidates.mjs`: refreshVerdicts, `shape` helper, gated evaluateCandidates
- `scraper/wasgau/build.mjs`: cache hit returns `refreshVerdicts(priorDoc)`
- `test/scraper.wasgau.dates.test.mjs`: 17 tests (parseWindow cases, real-fixture resolveWindow cases)
- `test/scraper.wasgau.candidates.test.mjs`: 24 tests (13 unit, 11 run()-level)

## Decisions Made
- The top band is set to 0.8 from the measured real ratios (see key-decisions).
- Year inference anchors on the from-date, and the to-year follows by month order.
- The numeric family accepts `bis`, en dash, em dash or hyphen. Two-digit years mean 20xx. A `(?<!\d)` guard stops "115.10." from matching as "15.10.".

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test expectation] "Extra key throws" asserted against the schema buildCandidatesDoc validates with**
- **Found during:** Task 2 (writing the T-05-08 test)
- **Issue:** `buildCandidatesDoc` (Plan 05-01 contract) rebuilds the doc and each candidate from fixed keys. An extra input key is therefore dropped, not rejected, and "buildCandidatesDoc throws on an extra key" cannot be true without changing that contract.
- **Fix:** The test asserts that `CandidatesDocSchema.parse` (the schema `buildCandidatesDoc` uses) throws on an extra doc key, and that `parseCandidatesDoc` returns null for an extra doc key and an extra candidate key. Bad `leafletId` and bad dates are asserted to throw through `buildCandidatesDoc` itself, as planned. No production change.
- **Files modified:** test/scraper.wasgau.candidates.test.mjs
- **Committed in:** 7ee1b6a

---

**Total deviations:** 1 auto-fixed (test expectation aligned with the existing fixed-key contract)
**Impact on plan:** None on behaviour. T-05-08 (poisoned cache) is still covered on the read path.

## Issues Encountered
- Task 1's first RED run failed at module load, not on assertions (see TDD Gate Compliance). It was fixed before the RED commit.
- The project uses `branching_strategy: none` and this was dispatched as a sequential main-tree executor, so commits are on master, as with Plans 05-01 and 05-03.
- Git prints LF->CRLF warnings on commit (repo autocrlf). This is pre-existing and does not change content.

## Known Stubs
None. The Plan 05-01 stub (`resolveWindow` leaflet-only, `parseWindow` ignoring `refDate`) is resolved by this plan.

## Threat Flags
None. No new network, file or auth surface. T-05-08, T-05-09, T-05-10 and T-05-11 are each mitigated and tested as registered.

## User Setup Required
None. No external service configuration required.

## Next Phase Readiness
- Plan 05-05 (source.mjs hardening, run/merge fault-isolation proofs) shares no files with this plan.
- Probation stays ON by default (`WASGAU_CONFIG`). Once live candidates look right, turning it off is a one-line config change. Only clean pairings would then reach history.

## Self-Check: PASSED
- Files present: scraper/wasgau/dates.mjs, scraper/wasgau/candidates.mjs, scraper/wasgau/build.mjs, test/scraper.wasgau.dates.test.mjs, test/scraper.wasgau.candidates.test.mjs.
- Commits 0115ea2, fdefa99, 7ee1b6a, 62d0de7 are ancestors of HEAD (4 measured from 4ea29ce).
- Acceptance re-run: TOP_BAND_RATIO/parseWindow node check exit 0; `refreshVerdicts(priorDoc)` count 1; run() seam check exit 0; index/merge/contract diff empty; `npm test` 250/250.
