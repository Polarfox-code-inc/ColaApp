---
phase: 04-live-integration-all-stores-hardening
plan: 01
subsystem: infra
tags: [github-actions, keepalive, heartbeat, vite, vite-plugin-pwa, github-pages, atomic-write, node-test]

# Dependency graph
requires:
  - phase: 02-scraper
    provides: scraper/io.mjs writeAtomic seam + data/ write order (mirrored by the heartbeat)
  - phase: 03-pwa-frontend
    provides: web/vite.config.js generateSW config + relative manifest/icon paths the base change preserves
provides:
  - "scripts/heartbeat.mjs: zero-dependency keepalive writer for data/heartbeat.json ({ lastRun: ISO })"
  - "test/heartbeat.test.mjs: locks the { lastRun } shape, the D-05 invariant, and the 2-space/trailing-newline convention"
  - "web/vite.config.js base:'/ColaApp/': PWA shell + Workbox SW correct under the GitHub Pages project subpath"
affects: [04-02-pipeline-workflow, live-integration, github-pages-deploy]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Keepalive heartbeat as a SEPARATE file (Option A) — never edits the frozen .strict() schema, cannot touch stores[].lastUpdated by construction (D-05)"
    - "Atomic same-dir temp+rename write reused verbatim from scraper/io.mjs across both data writers"
    - "Vite base set once at top level; vite-plugin-pwa auto-prepends to sw.js/registerSW.js/manifest while relative manifest/icon paths stay untouched"

key-files:
  created:
    - scripts/heartbeat.mjs
    - test/heartbeat.test.mjs
    - data/heartbeat.json
  modified:
    - web/vite.config.js

key-decisions:
  - "Heartbeat lives in a dedicated data/heartbeat.json (Option A), not a status.json field — avoids the .strict() contract edit (Landmine L-3) and satisfies D-05 by construction"
  - "Heartbeat write is standalone (node scripts/heartbeat.mjs), NOT inside scraper/index.mjs — keeps the scraper's atomic validate-before-write path untouched"
  - "vite base set to '/ColaApp/' only; start_url/scope stay './' and icon srcs stay bare-relative (plugin issue #713) so installability survives the subpath"

patterns-established:
  - "Pattern: zero-dep Node built-in-only data writers (node:fs/promises, node:crypto, node:path, node:url), mirroring scraper/io.mjs"
  - "Pattern: D-05 freshness invariant proven by a byte-identical before/after assertion on status.json + current-offers.json"

requirements-completed: [INFR-02, INFR-03]

# Metrics
duration: ~5min
completed: 2026-06-16
---

# Phase 4 Plan 01: Live-loop wiring primitives (heartbeat + Pages subpath) Summary

**Zero-dependency keepalive heartbeat writer (data/heartbeat.json, atomic, D-05-safe by construction) plus the one-line Vite base:'/ColaApp/' change that makes the PWA shell and Workbox SW correct under the GitHub Pages project subpath — both proven and ready for the Plan 02 CI workflow.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-16T07:53:00Z
- **Completed:** 2026-06-16T07:57:00Z
- **Tasks:** 2
- **Files modified:** 4 (3 created, 1 edited)

## Accomplishments
- `scripts/heartbeat.mjs` writes `data/heartbeat.json` as `{ lastRun: <ISO> }` atomically (same-dir temp+rename, EXDEV-safe), using only `node:` built-ins, runnable standalone as `node scripts/heartbeat.mjs` for CI.
- `test/heartbeat.test.mjs` locks the contract: valid ISO `lastRun`, the D-05 invariant (status.json + current-offers.json byte-identical before/after), and the 2-space-indent + trailing-newline serialization convention.
- `web/vite.config.js` now sets `base: '/ColaApp/'`; a production build emits asset URLs under `/ColaApp/`, with `sw.js`, `manifest.webmanifest`, and the three icons present, and relative manifest `start_url`/`scope`/icon srcs untouched.
- Full suite green: 149 tests pass (was 84+ at repo root; the 3 new heartbeat tests added, plus the web tests already in the suite).

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): failing heartbeat test** - `fd7b5aa` (test)
2. **Task 1 (GREEN): heartbeat writer implementation** - `4c258d0` (feat)
3. **Task 2: Vite base '/ColaApp/'** - `c28bdff` (feat)

_Task 1 was TDD (test → feat); no refactor commit needed — the GREEN implementation was already minimal and clean._

## Files Created/Modified
- `scripts/heartbeat.mjs` - Zero-dep ESM keepalive writer; atomic temp+rename; `{ lastRun: ISO }`; CLI entry for CI.
- `test/heartbeat.test.mjs` - node:test suite: shape, D-05 byte-identical invariant, serialization convention.
- `data/heartbeat.json` - Runtime artifact produced by the writer (committed; the Plan 02 workflow re-commits it each run as the keepalive activity).
- `web/vite.config.js` - Added top-level `base: '/ColaApp/'` (D-08); nothing else changed.

## Decisions Made
- **Option A (separate file)** for the heartbeat, per RESEARCH/PATTERNS recommendation: a dedicated `data/heartbeat.json` cannot mutate `stores[].lastUpdated` and never touches the frozen `.strict()` contract. This is the strongest D-05 guarantee.
- **Standalone CLI, not inside the scraper:** the heartbeat runs as its own workflow step after `npm run scrape`, leaving the scraper's atomic validate-before-write path (`scraper/index.mjs`) untouched.
- **Base-only Vite change:** `start_url`/`scope` stay `'./'` and icon `src` values stay bare-relative (plugin issue #713 means icon src is NOT base-prepended), so a leading slash would 404 under the subpath. The SW `urlPattern` matches `url.pathname`, so it is already subpath-safe (D-07) — no SW change.

## Deviations from Plan

None - plan executed exactly as written.

The plan's `files_modified` listed `scripts/heartbeat.mjs`, `test/heartbeat.test.mjs`, and `web/vite.config.js`. `data/heartbeat.json` is the runtime output of running the writer (the plan's own verify step runs `node scripts/heartbeat.mjs`); it is committed because the Plan 02 workflow commits it as the keepalive activity, and leaving it untracked would violate the "never leave generated data files untracked" rule.

## Threat Model Compliance
- **T-04-01 (tampering/integrity):** mitigated — atomic same-dir temp+rename mirrored verbatim from `io.mjs`; whole-file writes only.
- **T-04-03 (false freshness):** mitigated — D-05 invariant test asserts `stores[].lastUpdated` bytes unchanged; separate file cannot touch `stores[]`.
- **T-04-04 (absolute manifest paths under subpath):** mitigated — `start_url`/`scope`/icon srcs verified relative in the built `manifest.webmanifest`; base-only change verified to emit `/ColaApp/` asset URLs.
- **T-04-SC (npm installs):** mitigated — no new packages; web build used `npm ci` (lockfile-exact).

No new threat surface introduced beyond the plan's `<threat_model>`.

## Issues Encountered
None. RED failed as expected (module not found), GREEN passed the full suite first try, and the web build emitted a subpath-correct dist on the first attempt.

## User Setup Required
None for this plan. (Pages source = "GitHub Actions", repo public, and token permissions are Plan 02 / maintainer-checklist concerns surfaced by RESEARCH; the keepalive-efficacy open question L-1 remains a Plan-02 / human-verify decision.)

## Next Phase Readiness
- Both primitives the Plan 02 CI workflow consumes now exist and are proven: `node scripts/heartbeat.mjs` after the scrape, and a subpath-correct `npm run build`.
- Open carry-forward (not blocking this plan): L-1 / Open Q1 — community evidence that a `GITHUB_TOKEN` bot commit may not reliably reset the 60-day inactivity timer. Plan 02 should surface this as a `checkpoint:human-verify` (accept residual risk vs. a small `gh workflow enable`/API touch).

## Self-Check: PASSED

All created files exist on disk (scripts/heartbeat.mjs, test/heartbeat.test.mjs, data/heartbeat.json, web/vite.config.js, 04-01-SUMMARY.md) and all three task commits (fd7b5aa, 4c258d0, c28bdff) are present in git history.
