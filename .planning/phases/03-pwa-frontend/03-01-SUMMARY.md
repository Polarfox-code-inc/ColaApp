---
phase: 03-pwa-frontend
plan: 01
subsystem: pwa-frontend
tags: [pwa, vite, vite-plugin-pwa, workbox, uplot, scaffold, manifest, service-worker, icons, design-tokens]
requires:
  - "contract/* (frozen schema — imported via Vite server.fs.allow in later plans)"
  - "mocks/current-offers.offer.json, data/status.json, data/price-history.jsonl (dev fixtures)"
provides:
  - "web/ Vite vanilla-JS PWA workspace with pinned stack (vite@^7, vite-plugin-pwa@^1.3.0, uplot@^1.6.32)"
  - "Buildable PWA shell: vite.config.js (generateSW manifest + SWR data route), index.html (hero/cards/graph/footer mount points), styles.css (UI-SPEC :root tokens)"
  - "Trademark-safe PWA icons (192/512/maskable) on #1A1D21 tile"
  - "Provable npm run build -> web/dist/ with Workbox SW + manifest.webmanifest + icons"
affects:
  - "Plans 03-02/03/04 (render, derive, chart) drop into this working build"
  - "Plan 03-05 (human-verify install/offline)"
tech-stack:
  added:
    - "vite@^7 (7.3.5) — frontend build + dev server"
    - "vite-plugin-pwa@^1.3.0 (Workbox 7.4.1) — generateSW manifest + service worker"
    - "uplot@^1.6.32 — price-history chart (consumed in Plan 03-03)"
    - "@vite-pwa/assets-generator@^1.0.2 (dev) — bundles sharp, used to render icon PNGs"
  patterns:
    - "Standalone web/package.json (isolated node_modules); contract reused later via server.fs.allow:['..']"
    - "Relative start_url/scope ('./') so the shell is GitHub-Pages-subpath-safe (Phase 4)"
    - "Three SEPARATE manifest icon entries (any/any/maskable) — never combined 'any maskable'"
    - "Function urlPattern on url.pathname for the StaleWhileRevalidate /data/*.json(l) route"
key-files:
  created:
    - "web/package.json"
    - "web/.gitignore"
    - "web/package-lock.json"
    - "web/vite.config.js"
    - "web/index.html"
    - "web/src/styles.css"
    - "web/src/main.js (placeholder stub — Plan 04 authors the real render layer)"
    - "web/public/data/current-offers.json"
    - "web/public/data/status.json"
    - "web/public/data/price-history.jsonl"
    - "web/public/icon-source.svg"
    - "web/public/icon-192.png"
    - "web/public/icon-512.png"
    - "web/public/icon-maskable-512.png"
  modified: []
decisions:
  - "Pinned vite@^7 (not 8.x) per RESEARCH Pitfall 6 / threat T-03-SC — vite 8 SUS is a recency false-positive"
  - "Standalone web/ workspace (own node_modules) over npm workspaces — cleanest isolation; contract imported relatively later via server.fs.allow"
  - "Did NOT run npm audit fix --force: the only fix is vite@8 (forbidden), and the esbuild dev-server advisory does not affect the deployed static dist/"
  - "Added web/src/main.js placeholder stub so vite build resolves the index.html module ref; Plan 04 replaces it"
metrics:
  duration: ~12 min
  completed: 2026-06-15
  tasks: 3
  files: 14
---

# Phase 3 Plan 01: PWA Frontend Scaffold Summary

Scaffolded the `web/` Vite vanilla-JS PWA workspace with the pinned stack and locked the build + PWA chrome: a Workbox `generateSW` service worker, an installable manifest (standalone, theme #1A1D21, separate any/maskable icons), a StaleWhileRevalidate runtime route for `/data/*.json(l)`, UI-SPEC `:root` design tokens, the single-screen hero→cards→graph→footer shell, trademark-safe bottle icons, and the three default dev fixtures — `npm install && npm run build` produces a deployable `web/dist/`.

## What Was Built

### Task 1 — Workspace scaffold + pinned stack + dev fixtures (commit `26f9c5e`)
- `web/package.json`: `colaapp-web`, private, `type:module`, `engines.node >=22`, scripts (dev/build/preview/test). Deps pinned exactly: `vite@^7`, `vite-plugin-pwa@^1.3.0`, `uplot@^1.6.32`; devDep `@vite-pwa/assets-generator@^1.0.2`. No `vite@^8`, no zod in web/ (reused from root later).
- `web/.gitignore`: `node_modules`, `dist`.
- Copied the three default dev fixtures into `web/public/data/` (current-offers from the `offer` mock, status + history from `data/`).
- `npm install` materialized the lockfile (vite resolved to 7.3.5).

### Task 2 — Vite + VitePWA config, app shell, design-token CSS (commit `68e06f4`)
- `web/vite.config.js`: `VitePWA({ registerType:'autoUpdate', injectRegister:'auto', devOptions:{enabled:true} })`; manifest (name/short_name ColaApp, lang de, display standalone, start_url/scope './', theme_color #1A1D21, background #FFFFFF, three separate icon entries); `workbox.runtimeCaching` single StaleWhileRevalidate entry matching `/\/data\/.*\.(json|jsonl)$/` on `url.pathname` (cacheName cola-data, bounded expiration, statuses [0,200]); `server.fs.allow:['..']` for later `../../contract` imports.
- `web/index.html`: lang="de", viewport-fit=cover, theme-color meta, single `<main class="app">` with empty mount points `#hero → #cards → #graph → #footer` (D-02), `<script type="module" src="/src/main.js">`.
- `web/src/styles.css`: all UI-SPEC tokens once on `:root` — neutral utility palette (D-01) with `--color-accent:#0b7a3b`, semantic state pairs (info/warning/muted/active + tints), spacing scale (xs..3xl), radius (sm/md), system-ui font stack, `.price { font-variant-numeric: tabular-nums }`; single-column shell layout (max-width 480px, centered, 48px/16px padding, 32px section gap, safe-area insets).
- `web/src/main.js`: placeholder stub (build-blocking fix — see Deviations).

### Task 3 — Trademark-safe icons + prove the build (commit `fab60ca`)
- `web/public/icon-source.svg`: generic single-bottle silhouette (near-white `#F4F5F7` glyph with a dark label-band cutout) on a solid `#1A1D21` tile. No Coca-Cola wordmark, ribbon, or red.
- Rendered with `sharp` (bundled in `@vite-pwa/assets-generator`): `icon-192.png` (192×192) and `icon-512.png` (512×512) full-bleed; `icon-maskable-512.png` (512×512) with the glyph scaled into the ~80% safe zone and padded with `#1A1D21` so Android's circular/squircle mask never clips it.
- `npm run build` succeeds: `dist/` contains `sw.js` + `workbox-*.js`, `manifest.webmanifest` (13 precache entries, 20.26 KiB), and the three icons. Generated manifest verified: name ColaApp, display standalone, theme_color #1A1D21, start_url './', 3 icons (192/any, 512/any, 512/maskable).

## Verification

- Task 1 automated verify: PASS (`type:module`, pins present, vite not ^8, install creates node_modules + lockfile).
- Task 2 automated verify: PASS (vite.config has VitePWA/StaleWhileRevalidate/autoUpdate/maskable/#1A1D21/standalone, no combined 'any maskable'; index.html has all four mount-point ids; styles.css has :root/accent/tabular-nums/spacing/radius).
- Task 3 automated verify: PASS (`npm run build` exits 0; dist/ has a service worker + all three icon PNGs at correct dimensions; manifest lists three icons + theme #1A1D21).
- Plan verification (`cd web && npm install && npm run build`): PASS — emits `web/dist/` with SW + manifest + 3 icons; manifest is installable-shaped; runtime route is StaleWhileRevalidate; registerType autoUpdate; tokens declared once on :root (D-01); shell in hero→cards→graph→footer order (D-02).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `web/src/main.js` placeholder stub**
- **Found during:** Task 2.
- **Issue:** `index.html` references `/src/main.js` (the real render entry is authored in Plan 04). Without the file, `vite build` (required by Task 3) fails to resolve the module.
- **Fix:** Created a minimal no-op ESM stub (`export {}`) that renders nothing, with a comment noting Plan 04 supersedes it.
- **Files modified:** `web/src/main.js`.
- **Commit:** `68e06f4`.

**2. [Rule 2 - Verify-correctness] Reworded a vite.config.js comment to avoid a false-positive verify match**
- **Found during:** Task 2.
- **Issue:** The Task 2 verify regex `/['"]any maskable['"]/` matched the literal phrase inside an explanatory comment (`'any maskable'`), not an actual icon entry, failing the check spuriously. The icon entries were already correctly separated.
- **Fix:** Reworded the comment to "never combine both purposes on one"; verify then passed.
- **Files modified:** `web/vite.config.js`.
- **Commit:** `68e06f4`.

### Decisions / Non-deviations

- **`npm audit` reports 2 high-severity esbuild advisories** (transitive via vite). The only fix is `vite@8.0.16`, which RESEARCH Pitfall 6 and threat T-03-SC explicitly forbid (pin `vite@^7`). The advisories affect only the esbuild **dev server**; the deployed artifact is the static `web/dist/` served by GitHub Pages (Phase 4), so they are out of scope for this read-only static PWA. Did NOT run `npm audit fix --force`. Logged here for the verifier.

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| `web/src/main.js` (`export {}`, renders nothing) | web/src/main.js | Plan 03-01 owns only the buildable shell, not render logic. Plan 03-04 authors the real fetch→derive→render entry. Stub exists solely so `vite build` resolves the index.html module reference. Intentional; resolved in Plan 04. |

## Notes for Next Plans

- Plans 02/03/04 import the frozen contract via `../../contract/*` — `server.fs.allow:['..']` is already set; verify resolution when first used (RESEARCH A1/Pitfall 7).
- The six UI-state fixtures live under `mocks/` + `data/`; Plan 04 adds a `?state=` dev switch (only the default trio is seeded under `web/public/data/` now).
- Phase 4 sets Vite `base:'/ColaApp/'`; start_url/scope are already relative so only `base` needs setting.

## Threat Flags

None — no new security surface beyond the plan's `<threat_model>`. The SW is caching-only (no push/notifications, scope './'), no secrets in the client, pinned deps with no postinstall scripts.

## Self-Check: PASSED

- Created files exist: web/package.json, web/vite.config.js, web/index.html, web/src/styles.css, web/src/main.js, web/public/icon-192.png, web/public/icon-512.png, web/public/icon-maskable-512.png, web/public/icon-source.svg, web/public/data/{current-offers.json,status.json,price-history.jsonl} — all FOUND.
- Commits exist: 26f9c5e, 68e06f4, fab60ca — all FOUND in git log.
