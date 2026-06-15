# ColaApp — PWA Frontend (`web/`)

Single-screen, framework-free **PWA** that shows where the 12×1-l Coca-Cola
case (Kasten) is currently or soon on sale across the 5 fixed Schifferstadt
stores (REWE, Edeka/Netto, Lidl/Kaufland, Aldi/Penny, Wasgau), plus a
price-history graph. It is a pure **consumer**: it reads the committed static
`data/*.json(l)` files (produced by the scraper) and derives every
time-relative view (active / upcoming / stale / best-deal) at render time. No
backend, no live API call from the browser.

The UI is German throughout (`de-DE` `Intl` formatting) and deliberately
**neutral / non-Coca-Cola-branded** (CONTEXT D-01/D-20).

## Stack (pinned)

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | `>=22` (LTS) | Build + `node --test` units |
| Vite | `^7` (7.3.5) | Build + dev server (pinned to 7; 8 exists but is intentionally not used) |
| vite-plugin-pwa | `^1.3.0` | `generateSW` manifest + Workbox 7 service worker |
| uPlot | `^1.6.32` | Price-history time-series chart (canvas, ~15–25 KB) |
| `@vite-pwa/assets-generator` | `^1.0.2` (dev only) | Icon generation from one source SVG |

No runtime framework, no CSS framework, no component library — vanilla ESM
modules + hand-authored CSS (`src/styles.css`). The data contract is the frozen
`../contract/*.mjs` (imported via Vite `server.fs.allow: ['..']`).

## npm scripts

Run all commands from `web/`:

```bash
npm run dev       # Vite dev server (HMR) at http://localhost:5173 — SW enabled via devOptions
npm run build     # Production build → dist/ (bundled shell + code-split uPlot + sw.js + manifest)
npm run preview   # Serve the built dist/ at http://localhost:4173 — use this for install/offline testing
npm test          # node --test (pure derive/format/chart/load units; 50/50)
```

- Develop with `npm run dev`.
- **Test installability / offline / fresh-when-online against `npm run preview`**, because
  it serves the real built service worker over `http://localhost` — a valid
  secure context for service workers, so no HTTPS is required to test on
  localhost.

## `?state=` dev fixture switch

`src/main.js` reads a `?state=` query parameter and swaps in one of the six
UI-state fixtures from `public/data/` (the `stale` state also swaps in
`status.stale.json`). With **no** `?state=` parameter, the app loads the live
default `data/` files. Append the parameter to either the dev URL
(`http://localhost:5173/?state=…`) or the preview URL
(`http://localhost:4173/?state=…`).

| `?state=` value | What it should show |
|-----------------|---------------------|
| `?state=offer` | Hero shows **REWE €9,99** `gültig bis So 21.06. · 0,83 €/l`. **Edeka (`needsReview`) does NOT appear as a deal.** Lidl `kein Angebot` (grey), Kaufland `Fehler` (amber), Wasgau `nicht automatisch verfügbar` (info blue "i") are three distinct chips. |
| `?state=no_offer` | No active deal; hero empty `Kein aktuelles Angebot`; all cards show the muted `kein Angebot` state (no green). |
| `?state=upcoming` | Empty hero `Kein aktuelles Angebot` + nudge `Nächstes Angebot ab So 21.06. …`; the REWE card shows a `demnächst — ab …` badge and sorts above the `no_offer` cards. |
| `?state=error` | Affected store shows the warning `Fehler` chip (amber `!`), distinct from `no_offer`. |
| `?state=stale` | REWE card shows a `⚠ veraltet` chip (per-store `lastUpdated` 2026-06-05 is > 3 days old); the footer shows the file-level timestamp; **no global stale banner**. |
| `?state=unavailable` | Wasgau (and any unavailable store) shows the info-blue `nicht automatisch verfügbar` chip. |

Card ordering is always recomputed: **active (cheapest-first) → upcoming →
no_offer → unavailable/error**.

Graph: per-store colored lines (REWE/Edeka/Lidl/Kaufland); **Wasgau is greyed in
the legend** with `nicht automatisch verfügbar` (never a line). Sparse stores
(<3 points) render markers only with broken (never interpolated) lines. With 0
history points, a `Noch keine Daten` panel renders instead of an empty axis.

## Localhost install + offline + fresh-when-online test procedure

These are the PWA-01/02/03 checks. Use Chrome (desktop) or Android Chrome.

1. **Build and serve the production bundle:**
   ```bash
   npm run build
   npm run preview      # prints e.g. http://localhost:4173
   ```
2. **INSTALL (PWA-01):** Open the printed preview URL in Chrome. Confirm the
   install affordance appears (address-bar install icon, or Android "Add to home
   screen"). Install it. Confirm the app name is **ColaApp** and the icon is the
   trademark-safe bottle glyph on a dark `#1A1D21` tile (NOT Coca-Cola red / not
   the Coca-Cola logo); the maskable variant must not be clipped.
3. **OFFLINE LAST-DATA (PWA-02):** With the app loaded, go **offline**
   (DevTools → Application → Service Workers → check **Offline**, or device
   airplane mode) and reload. Confirm the last-fetched data still renders — hero,
   cards, graph, and footer all present — not a blank / "no internet" page.
4. **FRESH-WHEN-ONLINE (PWA-03):** Go back **online**. Edit
   `web/public/data/current-offers.json` (e.g. change the REWE price), re-run
   `npm run build` (so `dist/` picks up the edit) and reload the preview **twice**.
   Confirm the new value appears — StaleWhileRevalidate revalidated it in the
   background; the data is not stale forever.
5. **SIX STATES:** Visit `?state=offer`, `?state=no_offer`, `?state=upcoming`,
   `?state=error`, `?state=stale`, and `?state=unavailable` in turn (table above)
   and confirm each renders the correct hero, card chips, badges, stale markers,
   and graph.
6. **Localisation:** Confirm German throughout and `de-DE` number/date
   formatting (`€9,99` / `0,83 €/l` / `21.06.2026`), and the neutral
   (non-Coca-Cola-branded) utility look.

### Service worker behavior (Workbox `generateSW`)

- **Shell:** precached, `registerType: 'autoUpdate'` (new app code applies without a prompt).
- **`data/*.json(l)`:** runtime route, **StaleWhileRevalidate** → serves the
  cached copy instantly (offline last-data, PWA-02) while revalidating in the
  background (fresh-when-online, PWA-03). Caching only — no push/notifications.

## Phase 4 boundary (out of scope here)

The production install runs over **HTTPS at the GitHub Pages subpath**
(`/ColaApp/`). That is finalized in **Phase 4** by setting Vite's `base`
(`base: '/ColaApp/'`) in `vite.config.js`, plus the Actions cron + Pages serving.
Phase 3 is built root-relative-safe (`start_url: './'`, `scope: './'`, function
`urlPattern`) so Phase 4 only needs to set `base`. Testing here uses
`npm run preview` over `localhost`, which is a valid secure context for the
service worker without HTTPS.
