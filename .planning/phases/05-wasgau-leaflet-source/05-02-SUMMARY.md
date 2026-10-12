---
phase: 05-wasgau-leaflet-source
plan: 02
subsystem: ui
tags: [pwa, uplot, chart, wasgau, kill-switch]

requires:
  - phase: 03
    provides: price-history chart (prepareChartData/renderHistory, greyed Wasgau legend item)
provides:
  - Five chart line-stores (Wasgau = 5th line, teal #00838F, solid-filled markers)
  - lineStores(wasgauUnavailable) and legendModel({ wasgauUnavailable }) exports
  - Kill-switch detection in the PWA derived purely from current-offers Wasgau status "unavailable"
  - HIST-03 requirement text amended to match
affects: [05-03, 05-04, 05-05, verify-work]

actuals:
  tokens: 5100
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Series and legend share one wasgauUnavailable flag (prepareChartData + legendModel) so they never disagree"
    - "Kill-switch state read from data the PWA already loads, no PWA-side config"

key-files:
  created: []
  modified:
    - web/src/chart/history.js
    - web/src/main.js
    - web/test/chart.test.mjs
    - .planning/REQUIREMENTS.md

key-decisions:
  - "Wasgau line colour #00838F (teal) with solid-filled markers, distinct from the 4 store colours and amber #9a5b00"
  - "Under the kill switch, Wasgau rows are excluded before the x-axis is built, so Wasgau-only dates never widen the axis"
  - "Test file uses a namespace import so RED fails on assertions, not on a missing-export link error"

patterns-established:
  - "legendModel(): pure legend description; renderLegend only draws it (createElement/textContent only)"

requirements-completed: [P5-SC1]

coverage:
  - id: D1
    description: "Chart model has five line-stores; Wasgau series is all-null until a clean offer, then a flat segment over its window"
    requirement: "P5-SC1"
    verification:
      - kind: unit
        ref: "web/test/chart.test.mjs#prepareChartData lines up five line-stores; Wasgau's line is empty without a clean offer"
        status: pass
      - kind: unit
        ref: "web/test/chart.test.mjs#prepareChartData paints a clean Wasgau offer as a flat segment over its window"
        status: pass
    human_judgment: false
  - id: D2
    description: "Kill switch on -> four lines, no Wasgau dates on the axis, legend greys Wasgau with 'nicht automatisch verfügbar'"
    requirement: "P5-SC1"
    verification:
      - kind: unit
        ref: "web/test/chart.test.mjs#prepareChartData with wasgauUnavailable falls back to four lines and no Wasgau dates"
        status: pass
      - kind: unit
        ref: "web/test/chart.test.mjs#legendModel under the kill switch drops the Wasgau swatch and greys Wasgau"
        status: pass
    human_judgment: false
  - id: D3
    description: "Wasgau line visually distinguishable (teal + filled markers) on the rendered uPlot chart"
    verification:
      - kind: unit
        ref: "web/test/chart.test.mjs#the five line colours are pairwise distinct and differ from the amber warning token"
        status: pass
    human_judgment: true
    rationale: "Colour legibility and marker distinguishability on a real phone screen are visual judgments; RESEARCH A7 marks the teal as an assumption for the user to confirm. Live data still has Wasgau 'unavailable', so the 5th line only appears once 05-03..05-05 emit a clean Wasgau offer."
  - id: D4
    description: "main.js passes { wasgauUnavailable } derived from current-offers; production build succeeds with /ColaApp/ base"
    verification:
      - kind: other
        ref: "npm --prefix web run build (built in 416ms, /ColaApp/ asset paths)"
        status: pass
      - kind: other
        ref: "grep renderHistory(graph, data.history ?? [], { wasgauUnavailable }) web/src/main.js == 1"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-10-12
status: complete
plan_head_before: da002c2441016a75d0e11265ca6c2bb7ad7c1840
plan_head_after: b0a483417b0729d51756cf1be799600ac332e1e5
---

# Phase 5 Plan 02: Wasgau Chart Line Summary

**Wasgau becomes the 5th price-history line (teal #00838F, filled markers). The PWA greys it in the legend only when current-offers reports Wasgau "unavailable" (kill switch). HIST-03 is amended to match.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-10-12T16:57:27Z
- **Completed:** 2026-10-12T17:01:04Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- `STORES_WITH_LINES` now lists five stores. The new `lineStores(wasgauUnavailable)` drops Wasgau only while the kill switch is on.
- `prepareChartData(historyLines, { wasgauUnavailable })` builds windows, x-axis, series and offerCounts from `lineStores()`. The Wasgau line stays all-null until a clean offer is in the history. Under the kill switch, Wasgau rows never widen the axis.
- New pure `legendModel({ wasgauUnavailable })` returns `{ swatches, greyedWasgau }`. `renderLegend(container, model)` draws it and adds the greyed "nicht automatisch verfügbar" item only when `greyedWasgau` is true. The DOM is still built with createElement/textContent only.
- `main.js` reads the kill switch from the loaded data and passes it to the chart: `stores.find(s => s.store === "Wasgau")?.status === "unavailable"`.
- REQUIREMENTS.md HIST-03 now describes five lines plus the kill-switch exception. A new "Last updated" footer line was added.

## Task Commits

1. **Task 1 RED: failing tests for five-store chart + legend model**: `1fd9890` (test)
2. **Task 1 GREEN: 5th Wasgau line, lineStores, legendModel, kill-switch-aware legend**: `c63e449` (feat)
3. **Task 2: main.js wasgauUnavailable wiring + HIST-03 amendment**: `b0a4834` (feat)

No REFACTOR commit was needed.

## TDD Gate Compliance

- **RED** (`1fd9890`): `node --test --test-reporter=tap test/chart.test.mjs` exited 1 with 19 tests: 12 passed, 7 failed. The classifier returned `RED_EVIDENCE_OK` (`target_test_failed`).
  - Target test: "prepareChartData lines up five line-stores; Wasgau's line is empty without a clean offer".
  - Semantic assessment: the target ran and failed on the planned `deepEqual` of `out.stores` (actual 4 stores, expected 5). There was no load, syntax or fixture fault.
  - The kill-switch test already passed at RED, because the old code always excluded Wasgau. It is kept as a lock on the new parameter.
- **GREEN** (`c63e449`): `npm --prefix web test` passed 64/64.

## Files Created/Modified
- `web/src/chart/history.js`: five line-stores, `lineStores`, `legendModel`, the Wasgau colour and filled markers, the kill-switch flag through `prepareChartData`/`renderHistory`/`renderLegend`.
- `web/test/chart.test.mjs`: the four-store test is replaced by five-store tests. Added tests for the Wasgau segment, the kill-switch fallback, `lineStores`, `legendModel`, and colour distinctness. The header comment is updated.
- `web/src/main.js`: the `wasgauUnavailable` flag is derived from current-offers and passed to `renderHistory`.
- `.planning/REQUIREMENTS.md`: HIST-03 text amended; new footer line.

## Decisions Made
- Teal `#00838F` with solid-filled markers, per RESEARCH A7. It differs from the 4 store colours and from amber `#9a5b00`.
- Under the kill switch, Wasgau rows are filtered out before the x-axis is built, so no Wasgau-only dates show up on the axis.
- The test file uses a namespace import. That way the RED run fails on assertions and not on an ESM link error for the not-yet-existing exports.

## Deviations from Plan

None. The plan was executed as written.

## Issues Encountered
- A first edit attempt with a bash heredoc turned `"\n"` in the test fixture into a literal newline, which caused a SyntaxError. It was fixed with the Edit tool before the RED run counted. The remaining module edits were also made with Edit.

## Known Stubs

None. The Wasgau line is empty by design until a clean Wasgau offer exists (D-12/D-16). All current fixtures and the live `data/current-offers.json` report Wasgau as "unavailable", so the deployed chart keeps showing 4 lines plus the greyed item until plans 05-03..05-05 change the Wasgau status.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness
- The PWA side of D-16/D-04/D-17 is done and depends only on the frozen data contract.
- Once the scraper (05-03..05-05) emits a non-"unavailable" Wasgau status and clean history rows, the 5th line shows with no further PWA change.
- Open for the user (RESEARCH A7): confirm the teal colour visually.

## Self-Check: PASSED
- FOUND: web/src/chart/history.js, web/src/main.js, web/test/chart.test.mjs, .planning/REQUIREMENTS.md
- FOUND commits: 1fd9890, c63e449, b0a4834
- Acceptance criteria re-run: Task 1 (node -e export check exit 0; "nicht automatisch verfügbar" = 2; textContent = 6; data.length 6/5 tests present), Task 2 (renderHistory grep = 1; wasgauUnavailable = 2; "Kaufland, Wasgau)" = 1; "amended Phase 5" = 1; old wording = 0; build OK)
- Plan verification: `npm --prefix web test` 64/64, `npm --prefix web run build` built OK, root `npm test` 207/207

---
*Phase: 05-wasgau-leaflet-source*
*Completed: 2026-10-12*
