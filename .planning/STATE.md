---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
last_updated: "2026-06-16T11:40:00.000Z"
last_activity: 2026-06-16 - Completed quick task 260616-ixt: Add the cat logo image to the bottom of the ColaApp PWA page
progress:
  total_phases: 4
  completed_phases: 2
  total_plans: 14
  completed_plans: 12
  percent: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-15)

**Core value:** When the 12×1L Coca-Cola case goes on sale at one of the 5 Schifferstadt stores, the app shows it — accurately, with the price and the dates it's valid.
**Current focus:** Phase 04 — live-integration-all-stores-hardening

## Current Position

Phase: 04 (live-integration-all-stores-hardening) — EXECUTING
Plan: 3 of 3
Status: Plan 04-03 IN PROGRESS — Task 1 (docs) committed (6f9e1e3); Task 2 OPEN human-verify gate (real-device live acceptance) awaiting "approved"
Last activity: 2026-06-16

Progress: [█████████░] 86%

## Performance Metrics

**Velocity:**

- Total plans completed: 6
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 3 | - | - |
| 02 | 3 | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
| Phase 01 P01 | 1 session | 3 tasks | 8 files |
| Phase 01 P02 | ~5 min | 3 tasks | 13 files |
| Phase 01 P01-03 | 12 min | 2 tasks | 15 files |
| Phase 02 P01 | 10 min | 3 tasks | 8 files |
| Phase 02 P02 | ~3 min | 2 tasks | 3 files |
| Phase 02 P03 | ~12 min | 3 tasks | 5 files |
| Phase 03 P01 | ~12 min | 3 tasks | 14 files |
| Phase 03 P02 | ~5 min | 2 tasks | 4 files |
| Phase 03 P03 | 4 | 2 tasks | 2 files |
| Phase 03 P04 | 14 | 3 tasks | 14 files |
| Phase 04 P01 | 5min | 2 tasks | 4 files |
| Phase 04 P02 | ~1min | 2 tasks | 1 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Merged research Phases 0+1 into a single Phase 1 keystone (schema contract + marktguru spike) — spike output finalizes the schema before any production code depends on it.
- [Roadmap]: Phases 2 (scraper) and 3 (PWA) both depend only on Phase 1 and can be built in parallel against the frozen mocks.
- [Roadmap]: Remaining store adapters + hardening folded into Phase 4 (coarse granularity) — they scale existing capabilities (DATA-05 isolation, OFFR-04 "unavailable") rather than adding new v1 requirements.
- [Phase ?]: [Phase 1 spike] marktguru offers live at data.results (20 results @ 67105); Wasgau unavailable; validityDates day-granular Berlin; price decimal euro
- [Phase ?]: [Phase 1 spike] No real 12x1L case on sale this week -> Plan 03 synthesizes positive fixture from RESEARCH (synthesized-from-real); captured payload is the negative/quarantine corpus
- [Phase 01-02]: Frozen zod contract (contract/schema.mjs + types.d.ts) encoding D-01..D-14 is the single scraper<->PWA interface; both Phase 2 and Phase 3 import it
- [Phase 01-02]: StoreOffer schemas use .strict() so a stray pfand/deposit key is rejected (hard-enforces D-10); status:offer offer-field requirement via superRefine
- [Phase 01-02]: Six UI-state mocks (offer/no_offer/upcoming/error/stale/unavailable) + 23-test node:test suite prove the contract represents every state and rejects float price/unknown status
- [Phase ?]: [Phase 01-03] Strict 12x1L matcher (contract/matcher.mjs): pure classify(offer)->accept|reject|review over normalized brand+title+description text (NOT title-only); brand gate first then size gate; mixed-brand/Kasten-no-size -> needsReview (D-08); Pfand ignored (D-10); ReDoS-safe regexes; 15-test suite, full 38/38 green
- [Phase ?]: [Phase 02-01] Scraper pure-transform core (clock/normalize/filter/select/dedup) built TDD; reuses frozen classify + parseHistoryLine verbatim; Berlin-day via Intl never UTC slice (D-09); dedup on frozen D-14 key
- [Phase ?]: [Phase 02-02] fetch.mjs: withRetry fresh AbortSignal.timeout per attempt (undici #1926); single key-hygienic offers/search call returns results[] (D-01/D-11/D-12)
- [Phase ?]: [Phase 02-02] io.mjs: atomic same-dir temp+rename (EXDEV-safe); readPrior ENOENT-tolerant cold start; history append-only (DATA-05/D-02/D-06)
- [Phase ?]: [Phase 02-03] Scraper orchestrator wired: index.mjs fault-isolated per-store loop + validate-before-write (T-02-08) + atomic write order (current-offers->status->history); merge.mjs verbatim carry-forward, cold-start no_offer/error, frozen-vs-bumped two timestamps (D-04/D-05/D-06); npm run scrape; 84/84 green
- [Phase ?]: [Phase 03-01] web/ Vite PWA scaffold: pinned vite@^7/vite-plugin-pwa@^1.3.0/uplot@^1.6.32; generateSW manifest (standalone, theme #1A1D21, separate any/maskable icons) + StaleWhileRevalidate /data/*.json(l) route; UI-SPEC :root tokens (D-01) + hero->cards->graph->footer shell (D-02); npm run build proven
- [Phase ?]: [Phase 03-03] Price-history chart: pure prepareChartData (shared epoch-seconds axis + null gaps; no interpolation HIST-02) + STORES_WITH_LINES excludes Wasgau (HIST-03); renderHistory lazy-imports uPlot+CSS (async) so the module stays node --test loadable; <3 points => paths:()=>null markers-only; cold-start panel returns before uPlot; 40/40 web tests green
- [Phase ?]: Render layer is textContent-only (zero innerHTML) for XSS safety
- [Phase ?]: loadData per-file files override lets the six ?state= fixtures share one public/data dir
- [Phase ?]: [Phase 04-01] Keepalive heartbeat in a SEPARATE data/heartbeat.json (Option A): cannot mutate stores[].lastUpdated (D-05 by construction), never edits the frozen .strict() contract; runs standalone via node scripts/heartbeat.mjs after the scrape
- [Phase ?]: [Phase 04-01] Vite base:'/ColaApp/' set once at top level for the Pages subpath (D-08); start_url/scope stay './' and icon srcs stay bare-relative (plugin #713); SW urlPattern matches url.pathname so already subpath-safe (D-07)
- [Phase ?]: [Phase 04-02] CI pipeline.yml assembled (D-06): single workflow schedule 2x/day + push(master) + dispatch; Job A scrape->data_changed diff (excl heartbeat, BEFORE heartbeat L-2)->heartbeat->github-actions[bot] commit+rebase+push; Job B gated data_changed||push->copy 3 data files->build web /ColaApp/->official Pages flow; 5 actions first-party pinned (checkout/setup-node@v6, configure-pages@v6, upload/deploy@v5)
- [Phase ?]: [Phase 04-02] L-1 keepalive (INFR-03): chose accept-residual-risk — heartbeat-commit only, NO gh-enable step. A 60-day auto-disabled schedule surfaces via the in-app stale chip (D-03), one-click to re-enable; honors no-new-secrets (D-02)

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 1]: marktguru is an unofficial API and Wasgau Cola coverage at PLZ 67105 is unconfirmed — the Phase 1 live spike must resolve this before the schema is finalized. "Not automatically available" for Wasgau is an acceptable designed outcome, not a failure.
- [Phase 04 L-1/Open Q1] A GITHUB_TOKEN bot commit may not reliably reset GitHub's 60-day scheduled-workflow inactivity timer; Plan 02 should surface as a checkpoint:human-verify (accept residual risk vs a gh workflow enable/API touch)
- [Phase 04-03 OPEN human-verify gate] Task 2 real-device live acceptance is NOT done. Requires: (one-time human GitHub settings — repo Public, Pages source "GitHub Actions", token Read+write, default branch master, failure-email on) THEN the 8-step web/README.md "Live verification (production / D-12)" checklist on a physical Android phone against https://polarfox-code-inc.github.io/ColaApp/. On "approved": mark INFR-01/02/03 complete, close Phase 3's 03-05 checkpoint, advance plan counter, update ROADMAP. Do NOT mark Phase 4 complete until then.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260616-ixt | Add the cat logo image to the bottom of the ColaApp PWA page | 2026-06-16 | 5289848 | [260616-ixt-add-the-cat-logo-image-to-the-bottom-of-](./quick/260616-ixt-add-the-cat-logo-image-to-the-bottom-of-/) |

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-06-16T08:53:13Z
Stopped at: Plan 04-03 Task 1 committed (6f9e1e3); paused at Task 2 OPEN checkpoint:human-verify (real-device live acceptance)
Resume file: .planning/phases/04-live-integration-all-stores-hardening/04-03-SUMMARY.md (PENDING-HUMAN-VERIFY)
