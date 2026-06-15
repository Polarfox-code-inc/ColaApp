# Phase 3: PWA Frontend - Research

**Researched:** 2026-06-15
**Domain:** Vanilla-JS PWA (Vite + vite-plugin-pwa / Workbox 7), uPlot time-series chart, `Intl` de-DE formatting, client-side derivation against a frozen data contract
**Confidence:** HIGH (stack + contract verified against registry/docs and the in-repo frozen schema; uPlot gap API verified from upstream type defs)

## Summary

Phase 3 is a **framework-free, single-screen PWA** built with Vite + `vite-plugin-pwa`'s `generateSW` (Workbox 7), developed entirely against the six Phase-1 mocks and the three committed `data/*.json(l)` files — no live backend. The data contract is **frozen** (`contract/schema.mjs` / `types.d.ts`); the PWA is a pure **consumer** that reads files and **derives** the time-relative views (`upcoming`, `stale`) at render time. Every locked decision (D-01..D-22) plus the UI-SPEC color/copy/anatomy contract is already concrete; this research confirms the libraries are current and legitimate, pins exact API shapes for the three load-bearing decisions (uPlot gap handling D-13-graph, Workbox StaleWhileRevalidate route D-22, maskable icons D-21), and flags the version/derivation landmines.

The single biggest correctness risk is **honesty of derived state**: per-store staleness (D-16/D-18) must be computed from `status.json`'s per-store `lastUpdated`, NOT from `current-offers.json`'s file-level timestamp; `needsReview:true` offers must be filtered before any hero/card/best-deal selection; and uPlot must `null`-break lines across no-offer gaps (`spanGaps:false`) rather than interpolate. All derivation logic is pure and unit-testable with the repo's existing `node --test` style.

**Primary recommendation:** Add a new `web/` Vite workspace (vanilla JS, ESM). Pin `vite@^7` (stable, satisfies vite-plugin-pwa's `^7.0.0` peer; avoids the freshly-published 8.0.16 "too-new" risk), `vite-plugin-pwa@^1.3.0` (bundles Workbox 7.4.1), `uplot@^1.6.32`. Keep all data shaping in pure modules behind a thin DOM render layer. Use `Intl.NumberFormat`/`DateTimeFormat('de-DE', …, {timeZone:'Europe/Berlin'})` for every number/date. Generate maskable icons as a **separate** icon entry (never `purpose:"any maskable"`).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Neutral / minimal visual style — NOT Coca-Cola-branded. Coca-Cola red only as a home-screen accent — and even that was overridden to neutral dark (D-20).
- **D-02:** Single scrolling screen, top→bottom: hero → 5 store cards → price-history graph → freshness footer.
- **D-03:** German throughout. Hardcoded German labels. No i18n framework.
- **D-04:** German (`de-DE`) number/date formatting via `Intl`. Prices `€10,99` / `9,99 €`, €/litre `0,83 €/l`, dates `16.06.2026`, short weekday `Mo 21.06.`. Price source is integer cents; PWA divides/formats on display.
- **D-05:** Hero shows store + price + valid-until + €/litre when ≥1 store has an active-now offer. Lowest price = lowest €/litre = "best deal".
- **D-06:** Hero is active-now only. Future-`validFrom` (upcoming) never wins the hero.
- **D-07:** Empty hero = "Kein aktuelles Angebot" + upcoming nudge if one exists. `needsReview` entries filtered out, never reach the hero.
- **D-08:** All 5 stores always rendered as cards (fixed set).
- **D-09:** Card ordering: active (cheapest-first) → upcoming → no_offer → unavailable/error.
- **D-10:** Three visually distinct states via color + icon + label: `no_offer` (muted grey "kein Angebot"), `unavailable` (info blue "i", "nicht automatisch verfügbar"), `error` (amber "!", "Fehler").
- **D-11:** Chart library: **uPlot** (~15–25 KB, canvas).
- **D-12:** Per-store separate lines (HIST-03 pulled into v1): REWE, Edeka, Lidl, Kaufland. **Wasgau has no line.** Legend + stable per-store color mapping.
- **D-13-graph:** Honest sparse/gap handling: 1–2 points → markers only (no line); 3+ points → connect; no-offer stretch → break line, never interpolate.
- **D-13:** Upcoming offers surface on the store's own card as a "demnächst — ab Mo 23.06." badge; sorts above `no_offer`. Plus hero empty-state nudge. No separate "Demnächst" section.
- **D-14:** Default window = all available history. No pan/zoom.
- **D-16:** Stale threshold = 3 days, derived client-side from per-store `lastUpdated`.
- **D-17:** Timestamp display = absolute date/time only (`15.06.2026 06:00 Uhr`), de-DE.
- **D-18:** Stale indication = per-store markers only (no global banner). Footer shows file-level last-updated.
- **D-19:** App name "ColaApp"; `short_name` "ColaApp".
- **D-20:** PWA theme color neutral dark (`#1A1D21`).
- **D-21:** Manifest essentials: `display: standalone`, `start_url`, 192 + 512 + maskable icons. HTTPS via Pages (Phase 4).
- **D-22:** `vite-plugin-pwa` `generateSW` (Workbox 7). Precache app shell. Runtime caching route for `data/*.json(l)` using **StaleWhileRevalidate** (or NetworkFirst w/ cache fallback). **No push/notifications** — caching only.

### Claude's Discretion
- **Icon artwork:** simple, trademark-safe glyph (generic single-bottle silhouette on solid `#1A1D21` tile, light glyph) at 192/512 + maskable. NOT the real Coca-Cola logo/wordmark/red.
- **Component/file decomposition** of the vanilla-JS frontend (modules for hero/card/graph/freshness), CSS approach, exact DOM structure — open, framework-free.
- **Exact wording/iconography** of German labels and precise color tokens for the three states + stale marker (UI-SPEC proposes these).
- **uPlot per-store color palette** and legend layout on a narrow phone.
- **Empty-graph / cold-start rendering** (0 points) — honest "Noch keine Daten" state, not an empty axis.

### Deferred Ideas (OUT OF SCOPE)
- **HIST-04** — all-time-low reference line — v2.
- **UI-01** — dark mode via `prefers-color-scheme` — v2.
- **OFFR-07** — tiered staleness escalation / global banner — v2.
- **DATA-07** — per-store direct fallback adapter — v2, scraper concern.
- **GitHub Actions cron + GitHub Pages serving + end-to-end loop + keepalive** — **Phase 4** (INFR-01..03). This phase builds against committed `data/`/`mocks/`, not a live feed.
- **`/gsd-ui-phase 3`** deeper visual contract — already produced (UI-SPEC.md exists, approved).
- Push notifications, accounts, multi-product, more than 5 stores — project-level out of scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OFFR-01 | Hero "best deal right now" (store + price + valid-until) or clear "no current offer" | Best-deal = min active price among `status:offer`, `needsReview:false`, `validFrom ≤ today ≤ validTo`. Pure selector, unit-testable. Empty + nudge per D-07. See *Pattern 2*. |
| OFFR-02 | Card per store: price, €/litre, valid dates | All 5 stores from `current-offers.json`; `Intl` formatting. See *Code Examples*. |
| OFFR-03 | `no_offer` clear state, distinct from error | UI-SPEC muted-grey chip + dash icon + label "kein Angebot". |
| OFFR-04 | `unavailable` clear state ("not automatically available") | Wasgau → info-blue "i" chip "nicht automatisch verfügbar". Three distinct states (color+icon+label) never color-only. |
| OFFR-05 | Upcoming offers (future valid-from) visible ahead | Derived `upcoming` = `validFrom > Berlin-today`. Card badge "demnächst — ab {…}" + hero nudge. See *Pattern 3*. |
| OFFR-06 | "Last updated" timestamp + stale warning | File-level `lastUpdated` in footer (D-17); per-store stale markers from `status.json` (D-16/D-18). |
| HIST-01 | Price-history graph of best price over time | uPlot multi-line; lowest line = best price. See *Pattern 4*. |
| HIST-02 | Sparse/gap handling, no misleading trend, no interpolation | uPlot `spanGaps:false` + `null` gaps; markers-only path for <3 points. See *Pattern 5*. |
| HIST-03 | Per-store lines (REWE/Edeka/Lidl/Kaufland; Wasgau none) | Build one uPlot series per store aligned on a shared date axis. Stable palette from UI-SPEC. |
| PWA-01 | Installable to Android home screen (manifest + SW) | `display:standalone`, 192/512/maskable icons, valid SW. See *Pattern 6* + *Common Pitfalls*. |
| PWA-02 | Open offline, see last-fetched data | Workbox precache (shell) + StaleWhileRevalidate runtime route for data files (cache fallback offline). |
| PWA-03 | Online loads fresh, not stale indefinitely | StaleWhileRevalidate revalidates in background; `registerType:'autoUpdate'` for shell. See *Pitfall 5*. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Reading `data/*.json(l)` | Browser / Client (`fetch`) | Service Worker (cache) | Static files; PWA fetches them directly, SW caches. No API tier exists in this phase. |
| Deriving `upcoming` / `stale` / best-deal / sort | Browser / Client (pure JS) | — | Phase 1 D-12 mandates client-side derivation so it stays correct while the PWA sits open offline. |
| Rendering hero / cards / footer | Browser / Client (DOM) | — | Vanilla JS DOM construction; no SSR, no framework. |
| Price-history chart | Browser / Client (uPlot canvas) | — | Canvas rendering in the page. |
| Offline last-data + fresh-when-online | Service Worker (Workbox) | CDN/Static (GitHub Pages, Phase 4) | SW StaleWhileRevalidate route; Pages serves over HTTPS in Phase 4. |
| App-shell precache + install | Service Worker / Static | — | Workbox `generateSW` precaches the build output. |
| de-DE formatting | Browser / Client (`Intl`) | — | Built-in ICU in Node 22 / modern Chrome; no library. |

**Note:** There is deliberately **no backend/API tier** in this phase. Misassigning derivation to a build step or imagining a server would violate D-12 (client-side derivation) and the "static file the PWA reads directly" model.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vite | `^7` (latest 7.3.5) | Frontend build + dev server | `[VERIFIED: npm registry]` Canonical base for `vite-plugin-pwa`; satisfies its `^7.0.0` peer. CLAUDE.md says "7.x". Latest tag is 8.0.16 but freshly published (see Pitfall 6) — pin 7 for stability. |
| vite-plugin-pwa | `^1.3.0` | Manifest + service worker (Workbox `generateSW`) | `[VERIFIED: npm registry]` 3.36M weekly downloads, official `vite-pwa` org. D-22. Bundles `workbox-build`/`workbox-window` `7.4.1`. Peer allows `vite ^3..^8`. |
| uPlot | `^1.6.32` | Price-history time-series chart | `[VERIFIED: npm registry]` ~545KB unpacked, tiny minified runtime; canvas; D-11. `spanGaps`/`points` API supports D-13-graph exactly. Published 2025-03-14. |
| Node.js | 22 LTS | Build + `node --test` units | `[VERIFIED]` Repo `engines: >=22`, `type:module`. Vite 7 requires Node `^18 || ^20.19 || >=22.12`. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | `^3.25.76` (already a dep) | Optional defensive validation of fetched data before render | `[VERIFIED: repo]` `contract/schema.mjs` exports `parseCurrentOffers`/`parseStatusFile`/`parseHistoryLine`. **But zod is a runtime dep the PWA would ship** — consider validating only in dev/tests, or accept ~13KB. Recommend: validate in unit tests, optionally guard at runtime behind a try/catch that degrades to an error state. |
| `@vite-pwa/assets-generator` | `^1.0.2` | Generate 192/512/maskable PNGs from one source SVG | `[VERIFIED: npm registry]` Optional dev tool; produces the maskable + transparent icon set from a single source, avoiding hand-exporting. Dev dependency only. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| uPlot | Chart.js 4.5 | CLAUDE.md/D-11 locked uPlot. Chart.js is ~60KB + needs a date adapter. Do not switch. |
| Vanilla JS | Preact/Svelte | CLAUDE.md "What NOT to Use" + D-01 lock vanilla. One screen, one chart — no framework. |
| Vite 7 | Vite 8.0.16 | 8 is supported by the peer range but freshly published; no upside for this app. Stay on 7. |
| Runtime zod validation | Trust the contract | Producer and consumer share the schema; runtime validation is defensive insurance against a corrupt commit. Keep it optional/lightweight. |

**Installation:**
```bash
# From repo root, scaffold the web/ workspace (vanilla, no template framework)
mkdir web && cd web
npm init -y
npm install vite@^7 vite-plugin-pwa@^1.3.0 uplot@^1.6.32
npm install -D @vite-pwa/assets-generator@^1.0.2   # optional, for icon generation
# zod is already at repo root; import contract/schema.mjs directly or add a workspace ref
```
> **Decision for the planner:** choose between (a) a separate `web/package.json` (cleanest isolation, its own `node_modules`) or (b) npm workspaces so `web/` can import `../contract/*` and reuse the root `zod`. Either works; (b) avoids duplicating the contract. The contract files are plain ESM (`.mjs` + `.d.ts`) and import-able from `web/` via relative path regardless. `[ASSUMED]` — verify the chosen layout doesn't break Vite's `fs.allow` (Vite restricts serving files outside project root; importing `../contract` may need `server.fs.allow: ['..']`).

**Version verification (this session):**
```
npm view vite version            → 8.0.16 (latest), 7.3.5 (vite@7)   [VERIFIED 2026-06-15]
npm view vite-plugin-pwa version → 1.3.0, peers vite ^3..^8, workbox 7.4.1   [VERIFIED]
npm view uplot version           → 1.6.32 (published 2025-03-14)   [VERIFIED]
npm view @vite-pwa/assets-generator version → 1.0.2   [VERIFIED]
```

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| vite | npm | published 2026-06-01 (8.0.16) | 138.8M/wk | github.com/vitejs/vite | SUS ("too-new") | **Pin `vite@^7` (7.3.5).** SUS is a false positive from the recency heuristic on the *latest* tag; vite is the canonical bundler. Using the stable 7 line also sidesteps the flag entirely. |
| vite-plugin-pwa | npm | published 2026-05-05 | 3.36M/wk | github.com/vite-pwa/vite-plugin-pwa | OK | Approved |
| uplot | npm | published 2025-03-14 | 394K/wk | github.com/leeoniya/uPlot | OK | Approved |
| @vite-pwa/assets-generator | npm | 1.0.2 | (official vite-pwa org) | github.com/vite-pwa/assets-generator | OK | Approved (dev-only, optional) |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** `vite` — false positive (recency of latest 8.0.16). No postinstall script. Mitigation: pin `vite@^7`. No `checkpoint:human-verify` strictly required, but the planner may add one note for the version pin.

No package has a `postinstall` script (`postinstall: null` for all three verified).

## Architecture Patterns

### System Architecture Diagram

```
                          ┌─────────────────────────────────────────┐
   build time (Vite)      │  web/src/  (vanilla ESM modules)         │
   ───────────────►       │   main.js → imports format/, derive/,    │
                          │            render/, chart/               │
                          └─────────────────────────────────────────┘
                                          │ vite build
                                          ▼
                          ┌─────────────────────────────────────────┐
                          │  web/dist/  (static shell + sw.js +      │
                          │  manifest.webmanifest + icons)           │ ◄── Phase 4 serves via Pages
                          └─────────────────────────────────────────┘

   runtime (browser / installed PWA)
   ──────────────────────────────────
   open app ──► register SW (autoUpdate) ──► precache shell from cache

   render ──► fetch('data/current-offers.json')  ┐
              fetch('data/status.json')           ├─► Service Worker
              fetch('data/price-history.jsonl')   ┘    StaleWhileRevalidate
                          │                              ├─ cache HIT → serve now (offline last-data, PWA-02)
                          │                              └─ revalidate in bg → fresh next open (PWA-03)
                          ▼
              parse (+ optional zod) ──► DERIVE (pure):
                 • Berlin "today"  (Intl en-CA, Europe/Berlin)
                 • filter needsReview:true OUT
                 • per offer: active? upcoming? (validFrom/validTo vs today)
                 • per store: stale? (now − status.lastUpdated > 3d)   ◄── from status.json
                 • best-deal = min price among active
                 • card sort order
                          │
          ┌───────────────┼───────────────┬───────────────┐
          ▼               ▼               ▼               ▼
       Hero            5 Cards        uPlot graph      Freshness footer
      (OFFR-01)      (OFFR-02..05)   (HIST-01..03)      (OFFR-06)
```

### Recommended Project Structure
```
web/
├── index.html              # app shell (single screen)
├── vite.config.js          # VitePWA() config (D-22)
├── package.json
├── public/                 # static icons (192/512/maskable), data/ symlink-or-copy for dev
│   ├── icon-192.png
│   ├── icon-512.png
│   ├── icon-maskable-512.png
│   └── data/               # dev fixtures (copied from repo data/ or mocks/)
└── src/
    ├── main.js             # entry: fetch → derive → render → mount SW
    ├── styles.css          # :root CSS custom-property tokens (UI-SPEC)
    ├── format/             # pure de-DE Intl helpers (price, perLitre, date, weekday, ts)
    │   └── format.js
    ├── derive/             # pure: today(), isActive(), isUpcoming(), isStale(), bestDeal(), sortCards()
    │   └── derive.js
    ├── render/             # DOM builders: hero.js, card.js, footer.js
    └── chart/              # uPlot setup: history.js (alignData, gap rules, palette, resize)
        └── history.js
└── test/                   # node --test units for format/ + derive/ + chart data-prep
```

### Pattern 1: Pure derivation modules, thin DOM render layer
**What:** All time-relative logic (`today`, `isActive`, `isUpcoming`, `isStale`, `bestDeal`, `sortCards`, `prepareChartData`) lives in pure functions that take `(data, now)` and return plain values. DOM modules only read those results and build elements.
**When to use:** Always — it makes the locked decisions unit-testable in the repo's `node --test` style (matches the Phase 2 TDD core), and keeps `now` injectable so tests are deterministic.
**Example:**
```js
// Source: derived from contract/types.d.ts + D-12/D-16
// derive/derive.js
export function berlinToday(now = new Date()) {
  // 'en-CA' yields YYYY-MM-DD, sortable + comparable to contract DateOnly
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(now);
}
export function isActive(o, today) {
  return o.status === 'offer' && !o.needsReview
      && o.validFrom <= today && today <= o.validTo;   // string compare OK for YYYY-MM-DD
}
export function isUpcoming(o, today) {
  return o.status === 'offer' && !o.needsReview && o.validFrom > today;
}
export function isStale(storeStatus, now = new Date(), days = 3) {
  const ageMs = now.getTime() - new Date(storeStatus.lastUpdated).getTime();
  return ageMs > days * 24 * 60 * 60 * 1000;            // ISO-UTC math (D-16)
}
```

### Pattern 2: Best-deal selection (OFFR-01 / D-05/06/07)
**What:** Filter to active offers (above), pick minimum `price`. Lowest price ⇒ lowest €/litre (D-05). If none active, return null → hero empty state; compute the soonest upcoming for the nudge.
**Example:**
```js
export function bestDeal(stores, today) {
  const active = stores.filter(o => isActive(o, today));
  if (active.length === 0) return null;
  return active.reduce((best, o) => (o.price < best.price ? o : best));
}
export function soonestUpcoming(stores, today) {
  const up = stores.filter(o => isUpcoming(o, today));
  if (up.length === 0) return null;
  return up.reduce((soon, o) => (o.validFrom < soon.validFrom ? o : soon));
}
```

### Pattern 3: Card sort order (D-09)
**What:** Group by derived bucket, order buckets `active → upcoming → no_offer → unavailable/error`; within active sort by price asc.
```js
const RANK = { active: 0, upcoming: 1, no_offer: 2, unavailable: 3, error: 3 };
function bucket(o, today) {
  if (isActive(o, today)) return 'active';
  if (isUpcoming(o, today)) return 'upcoming';
  return o.status; // 'no_offer' | 'unavailable' | 'error'
}
export function sortCards(stores, today) {
  return [...stores].sort((a, b) => {
    const ra = RANK[bucket(a, today)], rb = RANK[bucket(b, today)];
    if (ra !== rb) return ra - rb;
    if (ra === 0) return a.price - b.price;   // cheapest first among active
    return 0;
  });
}
```

### Pattern 4: uPlot multi-line over a shared date axis (HIST-01/03)
**What:** Build one x-array of unique observation timestamps (epoch seconds) across all history lines, then one y-series per store (REWE/Edeka/Lidl/Kaufland) with `null` where that store has no observation on that date. Wasgau is never a series.
**Example:**
```js
// Source: uPlot.d.ts (AlignedData = [xValues, ...yValues]); time axis in seconds
const STORES_WITH_LINES = ['REWE', 'Edeka', 'Lidl', 'Kaufland'];
export function prepareChartData(historyLines) {
  const dates = [...new Set(historyLines.map(l => l.date))].sort();
  const x = dates.map(d => Date.parse(d + 'T00:00:00Z') / 1000); // epoch seconds
  const series = STORES_WITH_LINES.map(store => {
    const byDate = new Map(historyLines.filter(l => l.store === store)
                                       .map(l => [l.date, l.price / 100]));
    return dates.map(d => (byDate.has(d) ? byDate.get(d) : null)); // null => gap
  });
  return { data: [x, ...series], dates };
}
```

### Pattern 5: uPlot gap + markers-only rules (HIST-02 / D-13-graph) — load-bearing
**What:** uPlot's `series.spanGaps` defaults to `false`, so `null` values **already break the line** (correct: never interpolate across no-offer gaps). For a store with **<3 points**, suppress the connecting line and show **points only**; for **≥3** show the line + points.
**Example:**
```js
// Source: uPlot.d.ts — Series { spanGaps?, points?, paths? }, Points { show?, size? }
function seriesFor(store, color, marker, pointCount) {
  return {
    label: store,
    stroke: color,
    width: 2,
    spanGaps: false,                       // null => broken line, NO interpolation (D-13-graph)
    paths: pointCount < 3
      ? (u) => null                        // <3 points: suppress the line path => markers only
      : undefined,                         // >=3: default linear path
    points: { show: true, size: 7 },       // always draw markers (double-encodes by shape via custom draw if desired)
  };
}
```
> `paths: () => null` is the documented way to render a series with **no connecting line** while still drawing its points — exactly the "markers only for sparse series" rule. Verified against `uPlot.d.ts` (`Series.paths?: Series.PathBuilder`). `[VERIFIED: uPlot.d.ts]` for `spanGaps`/`points`; `[CITED: github.com/leeoniya/uPlot]` for the `paths:()=>null` markers-only idiom.

### Pattern 6: VitePWA generateSW config (D-22 / PWA-01/02/03)
**Example:**
```js
// web/vite.config.js
// Source: vite-pwa-org.netlify.app/guide + /workbox/generate-sw.html
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // base: '/ColaApp/'  ← Phase 4 sets this for the GitHub Pages subpath (see Pitfall 4)
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',           // shell updates without a prompt (PWA-03)
      injectRegister: 'auto',
      manifest: {
        name: 'ColaApp',
        short_name: 'ColaApp',
        description: 'Wo der 12×1-l-Coca-Cola-Kasten in Schifferstadt im Angebot ist',
        lang: 'de',
        display: 'standalone',
        start_url: './',                     // relative => survives a base subpath
        scope: './',
        theme_color: '#1A1D21',              // D-20 neutral dark
        background_color: '#FFFFFF',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'], // precache shell
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\/data\/.*\.(json|jsonl)$/.test(url.pathname),
            handler: 'StaleWhileRevalidate',  // offline last-data (PWA-02) + bg refresh (PWA-03)
            options: {
              cacheName: 'cola-data',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: true },          // exercise the SW in dev
    }),
  ],
});
```
> `urlPattern` as a **function** is more robust than a regex literal under a Pages subpath (matches on `url.pathname`). `[CITED: vite-pwa-org.netlify.app/workbox/generate-sw.html]` for `runtimeCaching` shape; `[CITED: vite-pwa-org.netlify.app/guide]` for manifest/registerType.

### Anti-Patterns to Avoid
- **Deriving staleness from `current-offers.json` file-level `lastUpdated`.** That timestamp always bumps ("job is alive", Phase 2 D-05). Per-store staleness MUST use `status.json`'s per-store `lastUpdated` (frozen on error/unavailable). Mixing them makes a dead store look fresh.
- **Forgetting to filter `needsReview:true`** before hero/best-deal/card render (the `offer` mock has Edeka `needsReview:true` — it must NOT appear as an active deal).
- **Interpolating across no-offer gaps** in the chart (would imply a price that never existed). `spanGaps:false` + `null` is mandatory.
- **`purpose: "any maskable"` on one icon entry** — Chrome treats the whole icon as maskable and crops it; ship separate `any` and `maskable` entries.
- **Absolute `start_url: '/'`** — breaks under the Phase-4 GitHub Pages subpath. Use relative `./`.
- **Comparing dates with `new Date(str)` parsing for active/upcoming** — string compare on `YYYY-MM-DD` is correct and timezone-safe; use the Berlin-today string, not the device clock's date.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Service worker / precache / offline | Hand-written `sw.js` + cache logic | vite-plugin-pwa `generateSW` (Workbox 7) | D-22; Workbox handles cache versioning, cleanup, navigation fallback, SWR correctly. |
| de-DE currency/date formatting | Manual `,`/`.` swapping, month maps | `Intl.NumberFormat`/`Intl.DateTimeFormat` | Built into Node 22 + Chrome; handles `9,99 €`, `0,83 €/l`, `16.06.2026`, weekday "Mo". Verified working this session. |
| Timezone-correct "today" | `new Date().toISOString().slice(0,10)` | `Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin'})` | UTC slice is wrong near midnight; Phase 2 already established "Berlin-day via Intl never UTC slice". |
| Time-series chart with gaps/markers | Custom canvas drawing | uPlot `spanGaps:false` + `points` + `paths` | D-11; uPlot already does broken lines, points, time axis, resize. |
| Data shape validation | Ad-hoc field checks | `contract/schema.mjs` zod parsers (optional, defensive) | Single source of truth shared with the scraper. |
| Maskable/any icon export | Manual Photoshop exports | `@vite-pwa/assets-generator` from one SVG | Generates correct sizes + safe-zone maskable variant. |

**Key insight:** Almost everything load-bearing here (offline, formatting, charting) has a correct, tiny, standard solution. The only genuinely hand-written code is the **pure derivation layer** and the **DOM render layer** — and the derivation layer is exactly what must be unit-tested.

## Common Pitfalls

### Pitfall 1: Staleness computed from the wrong timestamp
**What goes wrong:** A store that errored 10 days ago shows as fresh.
**Why it happens:** Using `current-offers.json` file-level `lastUpdated` (always bumped) instead of `status.json` per-store `lastUpdated` (frozen on error/unavailable, Phase 2 D-05).
**How to avoid:** Drive D-16/D-18 markers from `status.json` per-store entries. Footer (D-17) uses file-level.
**Warning signs:** Stale marker never appears; `status.stale.json` mock (file `lastUpdated` 2026-06-05) should mark stores stale relative to 2026-06-15.

### Pitfall 2: `needsReview` offers leaking into the view
**What goes wrong:** A quarantined/ambiguous offer (e.g. mixed-brand "Kasten") wins the hero or shows as an active card.
**Why it happens:** Filtering only on `status==='offer'` without checking `needsReview`.
**How to avoid:** Every active/upcoming/best-deal predicate includes `!o.needsReview`. The `current-offers.offer.json` mock has Edeka `needsReview:true` — assert it is excluded.
**Warning signs:** Edeka €10,99 appears in the offer mock's hero/cards (it shouldn't; REWE €9,99 is the real best deal there).

### Pitfall 3: uPlot line interpolated across no-offer gaps
**What goes wrong:** A diagonal line drawn between two far-apart observations implies prices that never existed.
**Why it happens:** Leaving `spanGaps` at a truthy value, or using a fill that bridges nulls.
**How to avoid:** `spanGaps:false` per series; insert `null` for missing dates (Pattern 4/5).
**Warning signs:** A continuous line through a date where the store had `no_offer`.

### Pitfall 4: PWA breaks under the GitHub Pages subpath (Phase 4 boundary)
**What goes wrong:** SW scope, manifest `start_url`, and asset URLs are wrong when served at `/ColaApp/` instead of `/`.
**Why it happens:** Absolute paths; Vite `base` not set; runtimeCaching regex anchored to `/data/` at origin root.
**How to avoid:** Use relative `start_url:'./'`/`scope:'./'`; let Phase 4 set Vite `base:'/ColaApp/'`; use a **function** `urlPattern` matching `url.pathname` ending in `/data/*.json(l)`. Phase 3 should build root-relative-safe so Phase 4 only sets `base`. `[CITED: github.com/vite-pwa/vite-plugin-pwa issues #4/#263/#669]`
**Warning signs:** 404s for icons/sw after deploy; SW not controlling the page.

### Pitfall 5: Stale shell served forever (PWA-03 regression)
**What goes wrong:** User never sees new app code or new data because the SW serves cache indefinitely.
**Why it happens:** `registerType:'prompt'` without wiring an update flow, or caching data with CacheFirst.
**How to avoid:** `registerType:'autoUpdate'` for the shell; **StaleWhileRevalidate** (not CacheFirst) for data so it refreshes in the background while still showing last-known offline.
**Warning signs:** Editing data and reloading online shows old prices on the second-and-later loads.

### Pitfall 6: Vite version flagged / churn
**What goes wrong:** Pulling `vite@latest` grabs the just-published 8.0.16 ("too-new" SUS) and a Node `>=22.12` floor.
**Why it happens:** Unpinned install.
**How to avoid:** Pin `vite@^7` (7.3.5). vite-plugin-pwa's peer allows it; no feature in 8 is needed.
**Warning signs:** legitimacy check SUS on vite; engine warnings on older Node 22 minors.

### Pitfall 7: Vite `fs.allow` blocks importing `../contract`
**What goes wrong:** Vite dev server refuses to serve `contract/schema.mjs` / `types.d.ts` from outside `web/`.
**Why it happens:** Vite's `server.fs.allow` defaults to the project (workspace) root.
**How to avoid:** Either use npm workspaces (root becomes allowed), or set `server.fs.allow: ['..']`, or copy the contract into `web/` (least DRY). `[ASSUMED]` — confirm at build time.

### Pitfall 8: Cold-start empty graph (0 history points)
**What goes wrong:** uPlot renders an empty axis box that looks broken.
**Why it happens:** Passing an empty data array to uPlot anyway.
**How to avoid:** If `price-history.jsonl` has 0 lines, skip uPlot and render the "Noch keine Daten" panel (D-discretion / UI-SPEC `graph.empty`).

## Code Examples

Verified patterns (run in Node 22 this session unless noted):

### de-DE formatting (all verified live)
```js
// Source: Node 22 Intl, verified 2026-06-15
const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
eur.format(999 / 100);                       // "9,99 €"
const perL = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
perL.format(83 / 100) + ' €/l';              // "0,83 €/l"
new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  .format(new Date('2026-06-21T00:00:00'));  // "21.06.2026"
new Intl.DateTimeFormat('de-DE', { weekday: 'short' })
  .format(new Date('2026-06-21T00:00:00'));  // "So"  (NB: 2026-06-21 is a Sunday)
new Intl.DateTimeFormat('de-DE', { day:'2-digit',month:'2-digit',year:'numeric',
  hour:'2-digit',minute:'2-digit', timeZone:'Europe/Berlin' })
  .format(new Date('2026-06-15T04:00:00Z')); // "15.06.2026, 06:00"  (→ format to "… 06:00 Uhr")
```
> **UI-SPEC correction:** the doc's example "gültig bis Sa 21.06." has the wrong weekday — `2026-06-21` is **Sunday ("So")**, not Saturday. The weekday MUST be computed from the date via `Intl`, never hardcoded. Footer needs " Uhr" appended and the comma after the year removed/handled (use explicit parts if you want exactly `15.06.2026 06:00 Uhr`).

### uPlot construction (shape)
```js
// Source: uPlot.d.ts constructor new uPlot(opts, data, target)
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
const { data, dates } = prepareChartData(historyLines);
const opts = {
  width: container.clientWidth, height: 240,
  scales: { x: { time: true } },
  axes: [
    { values: (u, ticks) => ticks.map(t =>
        new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit'}).format(t*1000)) },
    { values: (u, ticks) => ticks.map(v => v.toFixed(2).replace('.', ',') + ' €') },
  ],
  series: [ {}, /* + one seriesFor(store,…) per store, Pattern 5 */ ],
};
const plot = new uPlot(opts, data, container);
// resize:
new ResizeObserver(() => plot.setSize({ width: container.clientWidth, height: 240 }))
  .observe(container);
```

## Runtime State Inventory

Not applicable — this is a greenfield phase (new `web/` directory, no rename/migration). No existing PWA state, caches, or registrations to migrate. Phase 4 will introduce the Pages subpath, but that is downstream.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hand-rolled `sw.js` + AppCache | Workbox `generateSW` via vite-plugin-pwa | Workbox 7 era | Less code, correct cache lifecycle. |
| Vite 7 (CLAUDE.md) | Vite 8 now latest (8.0.16, 2026-06-01) | 2026-06 | Both supported by vite-plugin-pwa peer; pin 7 for stability. |
| `purpose:"any maskable"` combined icon | Separate `any` + `maskable` entries | Chrome guidance | Avoids cropping of non-maskable icon. |
| Moment.js / date libs for de-DE | Native `Intl` | Long stable | Zero dependency; verified. |

**Deprecated/outdated:**
- CLAUDE.md "Vite 7.x" pin is slightly behind (8 exists) but still the recommended stable choice here — not a defect, just note 8 is available.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `web/` can import `../contract/*.mjs` (workspaces or `fs.allow:['..']`) | Standard Stack / Pitfall 7 | If blocked, must copy the contract into `web/` (DRY loss). Low risk; easily resolved at build. |
| A2 | `paths: () => null` is the correct uPlot idiom for points-only (no line) | Pattern 5 | If wrong, sparse-series rule needs an alternative (e.g. `series.show` + a separate points-only series). Verify against a uPlot demo at build. |
| A3 | Function `urlPattern` matching `url.pathname` is robust under the Pages subpath | Pattern 6 / Pitfall 4 | If matching fails, fall back to a regex including the base. Phase-4-adjacent. |
| A4 | `registerType:'autoUpdate'` gives the desired fresh-shell behavior without a prompt | Pattern 6 / Pitfall 5 | If updates feel too aggressive/janky, switch to `prompt` with a tiny update UI. Low risk for single-user. |
| A5 | Optional runtime zod validation is acceptable bundle cost (or restrict to tests) | Supporting stack | If bundle size matters, validate only in tests. Low risk. |

## Open Questions (RESOLVED in PLAN)

1. **Workspace layout vs standalone `web/package.json`** — **RESOLVED** (03-01-T1): standalone `web/package.json`, importing the frozen `../../contract/*` via Vite `server.fs.allow:['..']`. Single source of truth, no DRY loss, Pages-deploy-friendly.
   - What we know: contract is ESM `.mjs` + `.d.ts`, importable relatively; root has `zod`.
   - What's unclear: whether to use npm workspaces (share zod + contract) or an isolated `web/` (copy/relative-import).
   - Recommendation: planner picks; default to npm workspaces so `web/` reuses root `zod` and imports `../contract` directly, with `server.fs.allow:['..']` if Vite complains.

2. **Where the PWA reads data in this phase (mocks vs committed `data/`)** — **RESOLVED** (03-01-T1 + 03-04-T3): serve copies under `web/public/data/`; add a `?state=` dev switch so each of the six UI states renders for visual + unit verification.
   - What we know: both `mocks/*.json` and `data/*.json(l)` are valid fixtures; no live feed until Phase 4.
   - What's unclear: which to wire as the dev/default source and how to exercise all six states.
   - Recommendation: serve copies under `web/public/data/`; add a dev mechanism (e.g. `?state=upcoming`) or per-state test fixtures so each UI state (offer/no_offer/upcoming/error/stale/unavailable) renders for visual + unit verification.

3. **Point shape double-encoding for color-blind legibility (UI-SPEC marker shapes)** — **RESOLVED** (03-03-T2): ship color + consistent point + legend in v1; custom marker shapes are a nice-to-have, not a hard requirement.
   - What we know: UI-SPEC assigns circle/square/triangle/diamond per store.
   - What's unclear: uPlot's default points are circles; custom shapes need a `points.show` draw callback.
   - Recommendation: ship with color + consistent point + legend in v1; treat distinct marker shapes as a nice-to-have (a custom `points.show` function) if time allows. Not a hard requirement.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Vite build, `node --test` | ✓ | `>=22` (repo engine) | — |
| npm | install Vite/PWA/uplot | ✓ | bundled with Node | — |
| Internet (npm) | first install only | ✓ (CI/dev) | — | — |
| Browser w/ SW + Intl | runtime (Android Chrome) | ✓ (target device) | modern Chromium | — |
| GitHub Pages HTTPS | install + SW at runtime | ✗ (Phase 4) | — | Local `vite preview` over `localhost` (SW allowed on localhost without HTTPS) for Phase-3 testing |

**Missing dependencies with no fallback:** none for Phase 3 (built against local fixtures; HTTPS-only install is a Phase-4 concern; `localhost` is a valid secure context for SW testing now).
**Missing dependencies with fallback:** GitHub Pages (Phase 4) → use `localhost`/`vite preview` for install + offline testing in Phase 3.

## Security Domain

Security enforcement is enabled (`security_enforcement: true`, ASVS L1). This is a **read-only, single-user, no-auth, no-backend static PWA** consuming committed JSON. Most categories are N/A.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No accounts/login (out of scope). |
| V3 Session Management | no | No sessions. |
| V4 Access Control | no | No protected resources; public static data. |
| V5 Input Validation | yes (light) | Data is produced by the trusted scraper, but the PWA should treat fetched JSON defensively: optional `contract/schema.mjs` validation; never `innerHTML` untrusted strings — build DOM with `textContent`/`createElement`. Prices/dates are numbers/`YYYY-MM-DD`. |
| V6 Cryptography | no | No secrets in the PWA; never embed marktguru keys client-side (those live only in the scraper). |
| V7 Error Handling | yes (light) | Fetch failure / malformed data → render an honest error state, do not crash the whole screen; degrade per-store. |
| V14 Configuration | yes (light) | SW caching-only, **no Notification/Push permissions** (D-22); manifest minimal; no third-party scripts/CDNs (system fonts, inline SVG → no external requests). |

### Known Threat Patterns for vanilla-JS PWA

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| DOM XSS via injecting data text as HTML | Tampering | Use `textContent`/`createElement`, never `innerHTML` with data values. Store `displayName` is from the frozen allow-list (`STORES`) but still render as text. |
| Cache poisoning / stale-forever | Tampering / DoS | StaleWhileRevalidate + `autoUpdate`; bounded `expiration`; no CacheFirst on data. |
| Over-broad SW scope / leaking | Info disclosure | `scope:'./'`, caching-only SW, no push. |
| Supply-chain (malicious dep) | Tampering | Pin versions; legitimacy audit above (all OK except vite recency false-positive); no postinstall scripts. |
| Embedding scraper API keys in client | Info disclosure | Keys live only in the scraper/Actions; the PWA reads static JSON, never calls marktguru. |

## Sources

### Primary (HIGH confidence)
- In-repo `contract/schema.mjs`, `contract/types.d.ts`, `mocks/*.json`, `data/*.json(l)` — frozen data shapes + every UI-state fixture (read this session).
- `npm view` for vite (7.3.5 / 8.0.16), vite-plugin-pwa (1.3.0, peers, workbox 7.4.1), uplot (1.6.32), @vite-pwa/assets-generator (1.0.2) — verified 2026-06-15.
- `gsd-tools query package-legitimacy check` — verdicts for vite/vite-plugin-pwa/uplot.
- Node 22 `Intl` formatting outputs — executed and verified this session.
- `https://raw.githubusercontent.com/leeoniya/uPlot/master/dist/uPlot.d.ts` — Series/Points/spanGaps/Axis/constructor/setSize types.

### Secondary (MEDIUM confidence)
- `vite-pwa-org.netlify.app/guide` and `/workbox/generate-sw.html` — VitePWA config, runtimeCaching/StaleWhileRevalidate shape, registerType, devOptions, globPatterns gotcha.
- Chrome for Developers (Lighthouse installable-manifest + maskable-icon audits) + web.dev add-manifest — Android install criteria (192+512 required, maskable safe-zone, separate `any`/`maskable`).
- vite-plugin-pwa GitHub issues #4/#263/#669/#764 — base path / scope under subpath deployment.

### Tertiary (LOW confidence)
- WebSearch summaries on PWA install criteria 2026 (corroborated by the Chrome docs above).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions, peers, legitimacy all verified against the registry this session.
- Contract/derivation: HIGH — read the frozen schema and all fixtures directly; derivation rules are unambiguous.
- uPlot gap/markers API: HIGH for `spanGaps`/`points`/`setSize` (type defs); MEDIUM for the `paths:()=>null` markers-only idiom (verify against a demo — A2).
- PWA/Workbox config: MEDIUM-HIGH — official docs confirm the shape; subpath specifics deferred to Phase 4 (Pitfall 4).
- de-DE formatting: HIGH — executed live in Node 22.

**Research date:** 2026-06-15
**Valid until:** 2026-07-15 (stable stack; re-check vite/vite-plugin-pwa if planning slips a month, as both moved in the last 6 weeks)
</content>
</invoke>
