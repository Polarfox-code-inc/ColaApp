---
phase: 03-pwa-frontend
plan: 03
subsystem: ui
tags: [uplot, chart, price-history, vanilla-js, vite, jsonl, node-test]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: frozen contract (contract/types.d.ts HistoryLine shape, data/price-history.jsonl fixture)
  - phase: 03-pwa-frontend (plan 01)
    provides: Vite PWA scaffold (uplot dependency pinned, graph section in the shell)
provides:
  - Pure price-history data-prep (parseHistoryJsonl + prepareChartData) with shared date axis, null gaps, Wasgau exclusion, per-store point counts
  - uPlot renderHistory with honest gap/markers rules, per-store palette, Wasgau-aware legend, cold-start panel, ResizeObserver
  - node --test data-prep suite proving the no-interpolation null gap and the cold-start shape
affects: [03-pwa-frontend plan that wires main.js to renderHistory, freshness/footer integration, phase-04 ship]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure data-prep / impure render split: testable transform exports + a render function that lazy-imports the chart lib"
    - "Lazy dynamic import() of uPlot + its CSS inside renderHistory so the module stays node --test loadable while Vite still bundles/code-splits it"
    - "DOM built via createElement/textContent only (never innerHTML) on the chart surface (T-03-06 / ASVS V5)"

key-files:
  created:
    - web/src/chart/history.js
    - web/test/chart.test.mjs
  modified: []

key-decisions:
  - "uPlot + uPlot.min.css are lazy-imported via dynamic import() inside renderHistory (not top-level static imports) so the pure data-prep tests load the module under bare node --test; Vite still resolves and code-splits the dynamic import for the browser build"
  - "renderHistory is async (returns Promise<uPlot|null>) as a consequence of the lazy import; cold start returns null before importing uPlot at all"
  - "STORES_WITH_LINES = [REWE, Edeka, Lidl, Kaufland] is the single source of the no-Wasgau rule; data has exactly 5 entries (x + 4 series), never a Wasgau series"

patterns-established:
  - "Pattern: align sparse per-store observations to a shared sorted epoch-seconds x-axis with null (not 0) for missing dates so spanGaps:false breaks the line"
  - "Pattern: paths:()=>null for <3 points renders markers-only (no misleading 1-2-point trend); >=3 points use uPlot's default linear path"

requirements-completed: [HIST-01, HIST-02, HIST-03]

# Metrics
duration: 4min
completed: 2026-06-15
---

# Phase 3 Plan 3: Price-History Chart Summary

**uPlot multi-line price-history chart for REWE/Edeka/Lidl/Kaufland with a pure, unit-tested data-prep that null-breaks no-offer gaps (never interpolates), excludes Wasgau, and renders an honest "Noch keine Daten" cold-start panel.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-15T18:56:57Z
- **Completed:** 2026-06-15T19:00:54Z
- **Tasks:** 2 (Task 1 via TDD: RED → GREEN)
- **Files modified:** 2 (both created)

## Accomplishments

- Pure `prepareChartData` aligns the append-only JSONL history to one shared sorted date x-axis (epoch seconds at UTC midnight) and one euro y-series per line-store, inserting `null` (not a value) where a store has no observation — the load-bearing no-interpolation mechanism for HIST-02.
- `STORES_WITH_LINES` excludes Wasgau entirely, so the chart never invents a line for the store with no automatic data source (HIST-03); the legend still lists Wasgau greyed with "nicht automatisch verfügbar".
- `renderHistory` encodes the markers-only-for-<3-points rule (`paths:()=>null`), `spanGaps:false`, the per-store palette (#C2143C/#1B5FB0/#0B7A3B/#7A3FB0), a `ResizeObserver`→`setSize`, and a cold-start panel that returns before constructing uPlot (Pitfall 8).
- 10 new data-prep tests prove the shared axis, the REWE `[10.99, null, 9.99]` null gap, Wasgau's absence, per-store point counts, and the cold-start empty shape; full web suite is 40/40 green and `npm run build` exits 0.

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): failing data-prep tests** - `4ff3b71` (test)
2. **Task 1 (GREEN): pure data-prep implementation** - `bb9e38f` (feat)
3. **Task 2: uPlot rendering half** - `8345664` (feat)

_Task 1 was TDD (test → feat). No refactor commit was needed — the GREEN implementation was already clean._

## Files Created/Modified

- `web/src/chart/history.js` - Created. `STORES_WITH_LINES`, `parseHistoryJsonl`, `prepareChartData` (pure data-prep), and async `renderHistory` (uPlot lines + Wasgau-aware legend + cold-start panel + resize), with uPlot/CSS lazy-imported.
- `web/test/chart.test.mjs` - Created. `node:test`/`node:assert/strict` suite over the repo-root `data/price-history.jsonl` fixture asserting the shared axis, null gaps, Wasgau exclusion, point counts, JSONL parse tolerance, and the cold-start shape.

## Decisions Made

- **Lazy dynamic import of uPlot + CSS inside `renderHistory`** instead of top-level static imports. This was the fix for the deviation below: it keeps `history.js` loadable under bare `node --test` (Node cannot resolve a `.css` import) while Vite still resolves and code-splits the dynamic import for the browser. Side effect: `renderHistory` is now `async` and returns `Promise<uPlot|null>`.
- **Cold start returns `null` before importing uPlot at all** — an empty graph needs no chart library, and this keeps the "Noch keine Daten" path zero-dependency.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking / Rule 1 - Bug] uPlot CSS static import broke the data-prep unit tests**
- **Found during:** Task 2 (uPlot rendering)
- **Issue:** The plan's Task 2 instruction to `import uPlot from 'uplot'` and `import 'uplot/dist/uPlot.min.css'` at module top level made `history.js` un-loadable under bare `node --test` (`ERR_UNKNOWN_FILE_EXTENSION ".css"`). This regressed Task 1's passing suite — and Task 1's own acceptance criterion requires `cd web && node --test test/chart.test.mjs` to keep passing.
- **Fix:** Moved both imports to lazy `await import(...)` calls inside `renderHistory` (after the cold-start early return). The pure data-prep exports the tests consume now never trigger the uPlot/CSS evaluation; Vite still statically analyzes the dynamic imports and bundles them.
- **Files modified:** web/src/chart/history.js
- **Verification:** `node --test test/chart.test.mjs` 10/10; full web suite `npm test` 40/40; `npm run build` exits 0; the load-bearing grep assertion (spanGaps/paths/4 colors/"Noch keine Daten"/ResizeObserver/setSize present, no `.innerHTML =`) passes.
- **Committed in:** `8345664` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking/bug)
**Impact on plan:** The fix preserves every acceptance criterion of both tasks (the static-import approach would have failed Task 1's test gate). The only observable API change is `renderHistory` becoming async — its callers (a later plan wiring `main.js`) must `await` it. No scope creep.

## Issues Encountered

- The `.css` import incompatibility with `node --test` (documented above as the deviation). Resolved via lazy dynamic import.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Data-prep and rendering are complete and self-contained. A later Phase 3 plan must wire `main.js` to call `await renderHistory(graphContainer, parseHistoryJsonl(historyText))` and fetch `data/price-history.jsonl`.
- Note for the integrator: `renderHistory` is **async** (lazy uPlot import) — `await` it. It returns `null` on cold start.
- No blockers.

## Self-Check: PASSED

- FOUND: web/src/chart/history.js
- FOUND: web/test/chart.test.mjs
- FOUND commit: 4ff3b71 (test, RED)
- FOUND commit: bb9e38f (feat, GREEN data-prep)
- FOUND commit: 8345664 (feat, render)

---
*Phase: 03-pwa-frontend*
*Completed: 2026-06-15*
