# Phase 3 — Artifacts This Phase Produces

> Manifest of every symbol, file, command, and asset Phase 3 creates. Consumed by
> `/gsd-execute-phase` and the goal-backward checker. Phase 4 (live integration) builds on these.

## New directory

- `web/` — the Vite vanilla-JS PWA workspace (isolated `web/package.json`, imports the frozen
  `../../contract/*` via `server.fs.allow:['..']`).

## Files created

| File | Plan | Role |
|------|------|------|
| `web/package.json` | 03-01 | Toolchain: vite@^7, vite-plugin-pwa@^1.3.0, uplot@^1.6.32; type module; node>=22; scripts dev/build/preview/test |
| `web/.gitignore` | 03-01 | Ignore node_modules, dist |
| `web/vite.config.js` | 03-01 | Vite build + VitePWA generateSW config (manifest, runtimeCaching StaleWhileRevalidate, registerType autoUpdate, fs.allow:['..']) |
| `web/index.html` | 03-01 | Single-screen app shell; mount points #hero #cards #graph #footer; lang="de" |
| `web/src/styles.css` | 03-01 | :root CSS custom-property tokens (UI-SPEC color/spacing/typography/radius); page-shell layout |
| `web/public/icon-source.svg` | 03-01 | Trademark-safe bottle glyph source |
| `web/public/icon-192.png` / `icon-512.png` / `icon-maskable-512.png` | 03-01 | PWA icons (separate any + maskable entries) |
| `web/public/data/current-offers.json` / `status.json` / `price-history.jsonl` | 03-01 | Default dev fixtures (copied from mocks/ + data/) |
| `web/src/derive/derive.js` | 03-02 | Pure clock-injected derivation |
| `web/src/format/format.js` | 03-02 | Pure de-DE Intl formatters |
| `web/src/chart/history.js` | 03-03 | Pure chart data-prep + uPlot render |
| `web/src/data/load.js` | 03-04 | Tolerant fetch + JSONL parse + optional contract validation |
| `web/src/render/hero.js` / `card.js` / `footer.js` | 03-04 | DOM render modules |
| `web/src/main.js` | 03-04 | Entry orchestrator + ?state= dev switch + SW registration |
| `web/test/derive.test.mjs` / `format.test.mjs` / `chart.test.mjs` / `load.test.mjs` | 02/03/04 | node --test suites |
| `web/README.md` | 03-05 | Dev/build/preview + ?state= + install/offline test procedure |
| `web/dist/**` (generated) | 03-01/05 | Build output: index.html, sw.js/workbox-*.js, manifest.webmanifest, icons, hashed assets — what Phase 4 serves via Pages |

## Exported symbols (consumable by Phase 4 / future work)

**`web/src/derive/derive.js`**: `berlinToday(now)`, `isActive(o, today)`, `isUpcoming(o, today)`,
`isStale(storeStatus, now, days=3)`, `bestDeal(stores, today)`, `soonestUpcoming(stores, today)`,
`sortCards(stores, today)`.

**`web/src/format/format.js`**: `formatPrice(cents)`, `formatPerLitre(cents)`, `formatDate(dateOnly)`,
`formatWeekdayShort(dateOnly)`, `formatValidUntil(dateOnly)`, `formatTimestamp(isoUtc)`.

**`web/src/chart/history.js`**: `parseHistoryJsonl(text)`, `prepareChartData(historyLines)`,
`renderHistory(container, historyLines)`; const `STORES_WITH_LINES` (REWE/Edeka/Lidl/Kaufland).

**`web/src/data/load.js`**: `loadData(opts)` → `{currentOffers, status, history, errors}`.

**`web/src/render/{hero,card,footer}.js`**: `renderHero(mount, {bestDeal, soonestUpcoming})`,
`renderCards(mount, sortedStores, statusByStore, now)`, `renderFooter(mount, fileLastUpdated)`.

## Commands / build outputs

- `cd web && npm install` — materialize the pinned toolchain.
- `cd web && npm run dev` — Vite dev server (SW enabled via devOptions).
- `cd web && npm run build` — emits `web/dist/` (shell + Workbox SW + manifest + icons).
- `cd web && npm run preview` — serve dist on localhost (secure context for SW install/offline testing).
- `cd web && npm test` — run all `web/test/*.test.mjs` node --test suites.
- `?state=offer|no_offer|upcoming|error|stale|unavailable` — dev fixture switch (main.js).

## Manifest / service worker

- `manifest.webmanifest`: name/short_name "ColaApp", display standalone, start_url './', scope './',
  theme_color `#1A1D21`, background_color `#FFFFFF`, icons 192 (any) + 512 (any) + 512 (maskable).
- Service worker (Workbox 7 via vite-plugin-pwa generateSW): precache app shell; runtime route
  StaleWhileRevalidate for `/data/*.json(l)` (cacheName `cola-data`); registerType autoUpdate.

## Requirement coverage map

| Requirement | Plan(s) |
|-------------|---------|
| OFFR-01 (hero best-deal / empty) | 03-02, 03-04 |
| OFFR-02 (per-store card price/€-l/dates) | 03-02, 03-04 |
| OFFR-03 (no_offer state) | 03-04 |
| OFFR-04 (unavailable state) | 03-04 |
| OFFR-05 (upcoming offers) | 03-02, 03-04 |
| OFFR-06 (last-updated + stale warning) | 03-02, 03-04 |
| HIST-01 (price-history graph) | 03-03, 03-04 |
| HIST-02 (sparse/gap honesty) | 03-03 |
| HIST-03 (per-store lines, Wasgau none) | 03-03, 03-04 |
| PWA-01 (installable) | 03-01, 03-05 |
| PWA-02 (offline last-data) | 03-01, 03-05 |
| PWA-03 (fresh-when-online) | 03-01, 03-05 |
