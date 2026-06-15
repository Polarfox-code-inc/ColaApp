---
phase: 03-pwa-frontend
plan: 04
subsystem: pwa-frontend
tags: [pwa, vanilla-js, render, dom, fetch, degrade, xss-safe, de-DE, integration, wave-2]
requires:
  - "web/src/derive/derive.js (Plan 02: berlinToday/isActive/isUpcoming/isStale/bestDeal/soonestUpcoming/sortCards)"
  - "web/src/format/format.js (Plan 02: formatPrice/formatPerLitre/formatValidUntil/formatTimestamp)"
  - "web/src/chart/history.js (Plan 03: async renderHistory + parseHistoryJsonl)"
  - "contract/schema.mjs (Plan 01 frozen: parseCurrentOffers/parseStatusFile)"
  - "web/index.html, web/src/styles.css (Plan 01 shell + tokens)"
  - "mocks/current-offers.*.json + mocks/status.stale.json (six UI-state fixtures)"
provides:
  - "web/src/data/load.js: tolerant fetch + JSONL reuse + defensive contract validation (loadData), degrades per-file"
  - "web/src/render/hero.js: renderHero (active best-deal vs empty+nudge, D-05/06/07)"
  - "web/src/render/card.js: renderCards (5 cards, unmistakable 3-state chips + upcoming badge + veraltet chip)"
  - "web/src/render/footer.js: renderFooter (file-level zuletzt aktualisiert)"
  - "web/src/main.js: entry capturing now once, load->derive->render four sections, ?state= dev switch"
  - "web/public/data/current-offers.{offer,no_offer,upcoming,error,stale,unavailable}.json + status.stale.json fixtures"
  - "styles.css component layer (hero/card/chip/footer/chart) with per-state data-state colors"
affects:
  - "Plan 03-05 (human-verify install/offline + six-state visual check)"
  - "Phase 4 ship (the built web/dist/ is what GitHub Pages serves)"
tech-stack:
  added: []
  patterns:
    - "Consumer I/O boundary mirrors scraper/io.mjs readJsonOrNull: fetch/parse/validate all degrade to null/empty + an errors map, never throw"
    - "validate-but-degrade: contract parse inside try/catch, raw fallback on drift (RESEARCH Security V7)"
    - "All render is createElement + textContent; zero innerHTML in the render layer (ASVS V5 / T-03-07)"
    - "Clock captured once in main.js; now/today threaded into every derive call (no second new Date())"
    - "?state= dev switch via per-file name overrides on loadData (fixtures share the public/data dir)"
key-files:
  created:
    - "web/src/data/load.js"
    - "web/src/render/hero.js"
    - "web/src/render/card.js"
    - "web/src/render/footer.js"
    - "web/test/load.test.mjs"
    - "web/public/data/current-offers.offer.json"
    - "web/public/data/current-offers.no_offer.json"
    - "web/public/data/current-offers.upcoming.json"
    - "web/public/data/current-offers.error.json"
    - "web/public/data/current-offers.stale.json"
    - "web/public/data/current-offers.unavailable.json"
    - "web/public/data/status.stale.json"
  modified:
    - "web/src/main.js (replaced the Plan 01 placeholder stub with the real orchestrator)"
    - "web/src/styles.css (added the component layer below the token contract)"
decisions:
  - "loadData gained an optional per-file `files` override (rather than a per-state base dir) so the six fixtures live alongside the live files in one public/data/ directory and the ?state= switch swaps filenames only"
  - "Upcoming cards render the announced price MUTED (not accent green) in Row 2 — it is a look-ahead, not actionable today (D-06/D-13 intent)"
  - "card.js writes the glyph icons via textContent (not inline-SVG innerHTML) — strictly stronger than the plan's allowed fixed-literal innerHTML, so the render layer has zero innerHTML"
  - "footer degrades to 'unbekannt' when the file-level lastUpdated is absent (degraded load) rather than crashing on formatTimestamp(null)"
metrics:
  duration: ~14 min
  completed: 2026-06-15
  tasks: 3
  files: 14
  tests: 10
---

# Phase 3 Plan 04: PWA Integration (load + render + orchestrator) Summary

Wired the whole single-screen PWA together: the tolerant `loadData` fetch/parse boundary, the three XSS-safe DOM render modules (hero / card / footer), and the `main.js` orchestrator that captures `now` once, derives every view from the Plan-02 pure layer, mounts the Plan-03 price-history chart, and renders the honest per-store states — with a `?state=` dev switch over all six UI fixtures. `node --test` is 50/50 and `npm run build` emits a complete `dist/` (bundled entry + code-split uPlot + Workbox SW + manifest).

## What Was Built

### Task 1 — `web/src/data/load.js` (+ `web/test/load.test.mjs`) — commit `8bb032d`
- `loadData(opts)` fetches `current-offers.json`, `status.json`, `price-history.jsonl` under a base path. Each file degrades independently: a network error or non-ok response (`fetch_failed`), a JSON parse failure (`parse_failed`), or a contract-validation throw (`validation_failed`) records an entry in `errors` and yields `null`/`[]` for that slice — it never throws out of the whole load (mirrors `scraper/io.mjs` `readJsonOrNull`; T-03-08 / ASVS V7).
- Reuses `parseHistoryJsonl` from `../chart/history.js` for the JSONL — no duplicate splitter.
- Defensive `parseCurrentOffers`/`parseStatusFile` run inside try/catch (validate-but-degrade): on drift it logs and keeps the raw parsed object so the screen still renders.
- `load.test.mjs` (10 tests): asserts all six `current-offers.*` mocks + `status.stale.json` validate against the frozen contract, and that a malformed-JSON file and a total fetch failure both degrade without throwing.

### Task 2 — render modules + CSS component layer — commit `e128868`
- `hero.js` `renderHero(mount, {bestDeal, soonestUpcoming})`: active state shows the section label `Bestes Angebot`, the big accent-green price, the store name, and `gültig bis {…} · {€/l}`, with a 3px accent left edge; empty state shows `Kein aktuelles Angebot` + the `Nächstes Angebot ab {…} bei {Store}.` nudge (or `Zurzeit ist der 12×1-l-Kasten nirgends im Angebot.`). Because Plan-02 `bestDeal` is active-now only (D-06), a future offer can never reach the hero as a deal.
- `card.js` `renderCards(mount, sortedStores, statusByStore, now)`: renders all five cards in sorted order. Each carries one unmistakable state via color + icon + label — `active`(✓ `aktiv`), `upcoming`(→ `demnächst — ab {…}`), `no_offer`(– `kein Angebot`), `unavailable`(i `nicht automatisch verfügbar`), `error`(! `Fehler`) — driven by `derive.isActive`/`isUpcoming` against the threaded `today`. Active cards add the accent price row; a per-store `derive.isStale(status, now)` adds a `⚠ veraltet` chip in Row 1 (D-18, per-store only).
- `footer.js` `renderFooter(mount, fileLastUpdated)`: centered muted `zuletzt aktualisiert: {formatTimestamp(…)}` from the FILE-level lastUpdated (D-17), degrading to `unbekannt` if absent.
- `styles.css` gained a component layer: hero/card/chip/footer/chart classes referencing the Plan-01 `:root` tokens, with per-state chip + card-edge colors selected via `data-state` (never inline hex).

### Task 3 — `web/src/main.js` orchestrator + `?state=` switch — commit `39ce8da`
- Captures `const now = new Date()` once at entry; derives `today = berlinToday(now)` and threads `now`/`today` into `bestDeal`, `soonestUpcoming`, `sortCards`, `renderCards`. No clock re-read.
- Reads `?state=` via `URLSearchParams(location.search)`; maps it to per-file fixture overrides (the `stale` state also swaps in `status.stale.json`) and passes them to `loadData`. No param loads live `./data/`.
- Flow: `loadData` → build `statusByStore` map → `renderHero` → `renderCards` → `await renderHistory` → `renderFooter`, top→bottom (D-02). The whole flow is wrapped so a load/chart failure degrades to honest states / a cold-start graph — never a white screen (ASVS V7).
- SW registration is auto-injected by `vite-plugin-pwa` (`registerSW.js` appears in `dist/`); main.js does not hand-register.
- Seeded the six state-suffixed `current-offers.*` fixtures + `status.stale.json` into `web/public/data/` so `?state=` works in both dev and the built `dist/`.

## Verification

- `cd web && node --test` → **50 pass, 0 fail** (load.test 10 + derive 20 + format 10 + chart 10).
- `cd web && npm run build` → exits 0; `dist/` contains the bundled entry (`assets/index-*.js`), the code-split `assets/uPlot.esm-*.js`, `sw.js` + `workbox-*.js`, `manifest.webmanifest`, `registerSW.js`, the three icons, and all 10 `data/` fixtures.
- Task 1 verify: PASS (six mocks + status.stale validate; malformed input does not throw; reuses parseHistoryJsonl).
- Task 2 grep verify: PASS (card.js has the four German state labels + isUpcoming/isStale/formatValidUntil; hero.js has both empty + nudge strings; footer.js uses formatTimestamp + 'zuletzt aktualisiert').
- Task 3 grep verify: PASS (main.js imports/calls all four render fns + berlinToday + loadData, reads ?state= via URLSearchParams, exactly one `new Date()`).
- No `.innerHTML =` anywhere in the render layer (textContent-only).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added a `files` per-file override to `loadData` for the `?state=` switch**
- **Found during:** Task 3.
- **Issue:** The plan's `?state=` switch needs to swap individual filenames (e.g. `current-offers.offer.json`, and for `stale` also `status.stale.json`) while keeping `price-history.jsonl` and the base dir constant. Task 1's `loadData` only accepted a single `base`, which would have forced a separate directory per state (and a second copy of the shared history/status files).
- **Fix:** Added an optional `opts.files` map merged over `DEFAULT_FILES`; main.js passes per-state overrides. The default (no override) is unchanged, so Task 1's tests stay green.
- **Files modified:** `web/src/data/load.js`, `web/src/main.js`.
- **Commit:** `39ce8da`.

**2. [Rule 2 - Verify-correctness] Reworded two `new Date()` comments in main.js**
- **Found during:** Task 3 verify.
- **Issue:** The Task 3 verify counts the literal `new Date()` and fails if >1. Two explanatory comments contained the literal phrase, tripping the regex even though there is exactly one real clock read.
- **Fix:** Reworded the comments to describe the single capture without the literal call. The one actual `const now = new Date()` remains.
- **Files modified:** `web/src/main.js`.
- **Commit:** `39ce8da`.

## Threat Mitigations Verified
- **T-03-07** (DOM XSS) — every render module builds DOM with `createElement` + `textContent`; the render layer assigns `innerHTML` nowhere (stronger than the plan's allowed fixed-literal icon innerHTML). Store names come from the frozen `STORES` allow-list upstream.
- **T-03-08** (a failed/malformed fetch blanks the screen) — `loadData` degrades per file; `main.js` wraps load + chart render so missing data renders honest per-store error states and a cold-start graph, never white. Asserted by the load.test degrade cases.
- **T-03-09** (key leakage) — N/A confirmed: the PWA reads only static JSON; no marktguru call, no embedded keys.

## Known Stubs
None. The Plan-01 `web/src/main.js` placeholder stub is fully replaced by the real orchestrator; all five OFFR + three HIST views render from real fixtures.

## Threat Flags
None — no new security surface beyond the plan's `<threat_model>`. The data boundary is read-only static fetch; no new endpoints, auth, or schema surface.

## Notes for Next Plan (03-05 human-verify)
- Exercise the six states via `?state=offer|no_offer|upcoming|error|stale|unavailable` (e.g. `npm run preview` then visit `…/?state=stale`). `?state=offer` must show REWE €9,99 as the hero and must NOT show Edeka (needsReview) as the deal; `?state=stale` must show the REWE `⚠ veraltet` chip.
- `renderHistory` is async (lazy uPlot) and is awaited; the default `data/price-history.jsonl` drives the live graph, cold-start renders "Noch keine Daten".
- The built `dist/` (with `registerSW.js` + `sw.js`) is install/offline-ready for the Plan-05 PWA checks.

## Self-Check: PASSED
