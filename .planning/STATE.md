---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: milestone_complete
last_updated: "2026-06-18T12:00:00.000Z"
last_activity: 2026-07-05 - Quick task 260705-s9l: hardened CI pipeline.yml against re-run/concurrency failures (rebase -X theirs on commit step + one transient GitHub-Pages deploy retry) after scheduled run 28749099899 failed
progress:
  total_phases: 4
  completed_phases: 4
  total_plans: 14
  completed_plans: 14
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-15)

**Core value:** When the 12×1L Coca-Cola case goes on sale at one of the 5 Schifferstadt stores, the app shows it — accurately, with the price and the dates it's valid.
**Current focus:** Milestone v1.0 feature-complete — all 4 phases done. Next: `/gsd-ship` (PR/review) or `/gsd-complete-milestone` to archive v1.0.

## Current Position

Phase: 04 (live-integration-all-stores-hardening) — COMPLETE (all phases complete)
Plan: 3 of 3 — done
Status: Plan 04-03 COMPLETE — Task 1 (docs, 6f9e1e3) + Task 2 human-verify gate APPROVED 2026-06-18. Twin gate Phase 3 / 03-05 also closed.
Last activity: 2026-06-18

Progress: [██████████] 100% (14/14 plans)

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
- [Post-04 / merged PRs #2-#4]: **Matcher scope broadened (user decision, commits 83c959e+19f3a23)** — contract/matcher.mjs now accepts any 1L PET case of count >=12 that INCLUDES Coca-Cola (any flavor incl. Zero, and Coca-Cola-company mixed-brand bundles like +Fanta/Sprite/Mezzo Mix), incl. odd "+bonus bottle" counts (14×1L). REJECT: store/competitor colas (checked first), wrong per-bottle sizes (1,25/0,5/0,33/0,2/Dose), 1L packs <12. REVIEW: only a Kasten/case with no confirmable 1L size. "versch. Sorten" (= various flavors) no longer demotes a clean case. New caseCount() helper → normalize.mjs prices €/litre over ACTUAL bottle count (14×1L = 14 L). Replaces the original strict "exactly 12×1L" matcher (01-03).
- [Post-04 / merged PR #2]: **needsReview UI card (commit 81bb27a)** — web render layer no longer suppresses needsReview offers; a live review offer gets its own "bitte prüfen" amber-chip card (price/€l/validity, muted price), ranked below upcoming and above no_offer. isCleanOffer unchanged so review offers never headline the hero. isReview() helper + tests.
- [Post-04 / merged PR #4]: **PWA data caching → NetworkFirst (commit 94892ef)** — web/vite.config.js runtime route for data/*.json|jsonl switched from StaleWhileRevalidate to NetworkFirst (3s timeout). SWR painted the previous visit's data (app reads file once at startup) → permanent one-open stale-price lag. NetworkFirst restores PWA-03 (current price) while preserving PWA-02 (offline last-known). App-shell precache + autoUpdate unchanged.
- [Post-04 / merged]: **Throwaway diagnostic workflow (commits e681d1f, 428cefa)** — .github/workflows/diagnose.yml + scripts/diagnose.mjs run the live marktguru fetch + frozen matcher on a GitHub runner (sandbox is 403-blocked) to dump the raw cola feed and classify() verdict. Read-only: no commit, no deploy. Spawned by the Kaufland 12×1L / 14×1L investigation; safe to delete once that closes.

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 1]: marktguru is an unofficial API and Wasgau Cola coverage at PLZ 67105 is unconfirmed — the Phase 1 live spike must resolve this before the schema is finalized. "Not automatically available" for Wasgau is an acceptable designed outcome, not a failure.
- [Phase 04 L-1, RESIDUAL — accepted] A GITHUB_TOKEN bot commit may not reliably reset GitHub's 60-day scheduled-workflow inactivity timer. Decided accept-residual-risk in 04-02: a 60-day auto-disable surfaces via the in-app stale chip (one click re-enables). Monitor over time; revisit only if the schedule silently disables.
- [Phase 04-03 / 03-05 human-verify gate] — ✅ RESOLVED 2026-06-18. Human approved the real-device acceptance run (install/offline/fresh-when-online + six states) against https://polarfox-code-inc.github.io/ColaApp/. INFR-01/02/03 complete; both twin checkpoints closed with SUMMARYs.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260616-ixt | Add the cat logo image to the bottom of the ColaApp PWA page | 2026-06-16 | 5289848 | [260616-ixt-add-the-cat-logo-image-to-the-bottom-of-](./quick/260616-ixt-add-the-cat-logo-image-to-the-bottom-of-/) |
| 260618-q81 | Clean placeholder history data + show offer duration as a price line over the valid week | 2026-06-18 | fa9d1b6, 4e1afea | [260618-q81-clean-non-real-placeholder-data-graph-ol](./quick/260618-q81-clean-non-real-placeholder-data-graph-ol/) |
| 260618-qze | Fix scraper.run Case D/G: seed prior state from mocks, not live scraped data (drift-proof) | 2026-06-18 | 1dcc19a | [260618-qze-fix-scraper-run-test-mjs-case-d-and-hard](./quick/260618-qze-fix-scraper-run-test-mjs-case-d-and-hard/) |
| 260705-s9l | Harden pipeline against re-run/concurrency failures (rebase -X theirs + one transient Pages-deploy retry) | 2026-07-05 | 53a6c04 | [260705-s9l-harden-pipeline-rerun-safety](./quick/260705-s9l-harden-pipeline-rerun-safety/) |

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-06-18
Stopped at: Milestone v1.0 feature-complete — human approved the twin real-device human-verify gates (03-05 + 04-03 Task 2); all 4 phases / 14 plans done. Doc sync of merged PRs #2-#4 also folded in (matcher scope, review card, NetworkFirst).
Resume file: none — next is `/gsd-ship` (PR + review) or `/gsd-complete-milestone` (archive v1.0). Note: local doc commits are not yet pushed to origin.
