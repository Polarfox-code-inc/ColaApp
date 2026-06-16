# Phase 4: Live Integration, All Stores & Hardening - Context

**Gathered:** 2026-06-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire the already-proven scraper and the already-built PWA into a free, self-sustaining
**live loop**: a scheduled GitHub Actions job runs the scraper → commits the data → builds
and deploys the PWA to GitHub Pages → the installed PWA reflects the new data. All five
stores must be present and fault-isolated (Wasgau shown "not automatically available"), the
job must keep itself enabled over time, and a broken run must surface to the maintainer
rather than silently serving stale prices.

Covers requirements **INFR-01, INFR-02, INFR-03**. This is the integration/hardening phase —
no new product capability, no new stores, no UI redesign. The scraper (all 5 stores,
fault-isolated) and the PWA (six UI states, offline last-data) already exist; Phase 4 makes
them run for real, for free, on a schedule.

</domain>

<decisions>
## Implementation Decisions

### Scrape Cadence
- **D-01:** Scheduled scrape runs **2×/day** (~04:00 and ~16:00 UTC). Offset from the top of
  the hour to dodge GitHub's cron-cluster delays. Rationale: German offers are weekly and
  announced ~a week ahead, so 2×/day is plenty fresh; a skipped run is covered by the next
  within hours; volume stays trivially polite to marktguru. Exact minute is the planner's
  discretion.

### Failure Alerting
- **D-02:** Rely on GitHub's **built-in "workflow failed" email** (delivered to the repo
  owner / `knut_ulf@web.de`) for run failures. No third-party monitor, no new accounts —
  honors the free/simple constraint.
- **D-03:** The PWA's **existing stale/last-updated indicator (OFFR-06)** is the human
  backstop for *silent cron skips* (which GitHub's failure email does NOT catch). A long gap
  becomes visible when the maintainer opens the app. (healthchecks.io dead-man's-switch was
  considered and deliberately deferred — see Deferred Ideas.)

### 60-Day Keepalive
- **D-04:** Every run writes a **heartbeat touch-commit** so the repo always has activity
  within the 60-day window — even during long no-offer stretches where the scraper produces
  no data diff. This guarantees the scheduled workflow can never drift into GitHub's
  inactivity auto-disable.
- **D-05 (constraint for planner):** The heartbeat must bump a **"last successful run"**
  timestamp (e.g. a top-level field in `status.json` or a dedicated heartbeat field) **without
  resetting the per-store `lastUpdated` values**. Otherwise a genuinely stale store would
  falsely look fresh and defeat OFFR-06. Side benefit: lets the app distinguish "we checked,
  no offer" from "we haven't run in days."

### Deploy & Data Flow
- **D-06:** **Single workflow** does scrape → (commit data) → build → deploy, using the
  official GitHub Pages Actions flow (`actions/upload-pages-artifact` + `actions/deploy-pages`).
  Single source of truth.
- **D-07:** The scraped data is served **same-origin** under the Pages subpath
  (`/ColaApp/data/...`) by copying repo-root `data/` into the Vite build before `vite build`.
  This keeps the PWA's existing Workbox **StaleWhileRevalidate** route on `/data/*.{json,jsonl}`
  working unchanged (it matches on `url.pathname`, so it is subpath-safe). No cross-origin
  fetch, no CORS, no second data source.
- **D-08:** Set Vite **`base: '/ColaApp/'`** for the project-Pages subpath. `start_url`/`scope`
  stay relative (`./`) as already configured in `web/vite.config.js`.
- **D-09:** **Deploy only when data changed.** The scraper runs every scheduled time, but
  commit + build + deploy happen only if `data/` produced a real diff. Heartbeat-only
  (no-change) runs still commit the heartbeat (D-04) but skip the deploy — avoids ~2 pointless
  redeploys/day and keeps deployment history meaningful.
- **D-10:** Also **redeploy on code push** (frontend/scraper changes to the default branch)
  via a normal `push` trigger — additive, standard.
- **D-11:** Production data source = repo-root **`data/`** (the real scraped files) copied into
  the build. Dev/local continues to use the `?state=` fixtures under `web/public/data/`; the
  six fixtures are NOT the production data path.

### Verification (folded from Phase 3)
- **D-12:** Phase 4 **absorbs the deferred 03-05 real-device verification** — install to the
  Android home screen, offline last-data, fresh-when-online, and the six-state visual check —
  performed against the **live HTTPS GitHub Pages URL on the actual phone**. This is the true
  acceptance environment and directly satisfies Phase 4 success-criterion 3 (full loop:
  cron → scraper → committed data → Pages → installed PWA reflects new data). When this passes,
  Phase 3's open 03-05 checkpoint can be closed.

### Claude's Discretion
- Exact cron minute/offset, the conditional "data changed?" detection mechanism, git bot commit
  identity, workflow `concurrency:` group + `git pull --rebase` to avoid commit races, and the
  precise data-copy step are left to the researcher/planner.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Requirements
- `.planning/PROJECT.md` — cost/hosting/delivery constraints (free only, nothing hosted
  locally, public repo for unlimited Actions, PWA install-only).
- `.planning/REQUIREMENTS.md` §Infrastructure — INFR-01/02/03 (the only open requirements).
- `.planning/ROADMAP.md` §Phase 4 — goal + 5 success criteria (the acceptance bar).
- `CLAUDE.md` — the stack/feasibility doc: marktguru API integration notes, the
  "GitHub Actions free-tier & scheduled-cron caveats" table (cron lateness/skips, 60-day
  inactivity disable, concurrent-run races), and the PWA installability/offline-last-data notes.

### Existing Implementation (the things Phase 4 wires together)
- `scraper/index.mjs` — the all-5-store, fault-isolated orchestrator; writes
  `data/{current-offers.json,status.json,price-history.jsonl}`. Entry: `npm run scrape`.
- `scraper/io.mjs` — `readPrior` / `writeAtomic` / `appendLines` (the data-write seams).
- `web/vite.config.js` — VitePWA `generateSW` config; manifest; the `/data/` SWR runtime route;
  the explicit "Phase 4 sets base:'/ColaApp/'" + relative `start_url`/`scope` notes.
- `web/README.md` — dev/build/preview + `?state=` fixture switch + localhost install/offline
  procedure (the Phase-3 03-05 artifact; the real-device procedure extends it).
- `contract/schema.mjs` — frozen parse/validate functions guarding every data write.

### Phase 3 carry-over
- `.planning/phases/03-pwa-frontend/03-05-PLAN.md` — the deferred human-verify checkpoint whose
  install/offline/six-state checks are folded into Phase 4 (D-12).

No external ADRs — decisions are captured above and in CLAUDE.md.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`scraper/index.mjs` (+ all seams)**: complete, fault-isolated, all-5-store run that always
  writes the three data files. Phase 4 invokes it as-is (`npm run scrape`); no scraper logic
  changes expected beyond possibly the heartbeat write (D-04/D-05).
- **`web/` Vite + VitePWA build**: produces the installable shell; only needs `base` set and
  the data-copy step. The SW `/data/` SWR route already implements offline-last-data +
  fresh-when-online and is subpath-safe by design.

### Established Patterns
- **Atomic, validate-before-write** (`writeAtomic`, `contract/schema.mjs`): a drifted/failed
  run never lands a corrupt file. The CI commit step should preserve this guarantee.
- **Fault isolation per store** (try/catch around fetch and each store build; Wasgau fixed
  "unavailable"): success-criterion 4 is already satisfied in code — Phase 4 just needs to not
  break it and to verify it live.
- **Same-origin pathname-matched caching**: the SW route matches `/data/*.{json,jsonl}` on
  pathname, so serving data at `/ColaApp/data/...` requires no SW change.

### Integration Points
- **New `.github/workflows/` (greenfield)**: the scheduled+push workflow that runs scraper,
  conditionally commits data + heartbeat, builds with `base`, and deploys to Pages.
- **Data hand-off seam**: repo-root `data/` → copied into the Vite build → served at
  `/ColaApp/data/`. This is the one place the scraper output and the frontend meet in prod.
- **GitHub repo settings**: Pages set to "GitHub Actions" source; repo kept **public**.

</code_context>

<specifics>
## Specific Ideas

- Maintainer/owner email for failure notifications: `knut_ulf@web.de` (single user).
- Pages URL shape: `https://<owner>.github.io/ColaApp/` → drives `base: '/ColaApp/'`.
- Keep everything on the free tier with zero new third-party accounts (no healthchecks.io for
  v1, no external cron).

</specifics>

<deferred>
## Deferred Ideas

- **healthchecks.io dead-man's-switch** — would catch *silent cron skips* that GitHub's failure
  email misses. Deliberately deferred: adds a third-party account/secret for marginal benefit
  over the in-app stale indicator (D-03). Revisit if silent skips prove to be a real problem in
  practice.
- **External cron → `repository_dispatch`** (cron-job.org) — fallback only if GitHub's own cron
  skips become intolerable. Noted in CLAUDE.md; not for v1.
- **Direct per-store fallback adapter** (e.g. Aldi Süd direct JSON) — this is v2 **DATA-07**,
  not Phase 4. marktguru remains the sole source.
- **Tiered staleness escalation (OFFR-07)** and **all-time-low line (HIST-04)** — v2, out of
  scope.

None of the above are in Phase 4 scope — discussion stayed within the integration/hardening
boundary.

</deferred>

---

*Phase: 4-live-integration-all-stores-hardening*
*Context gathered: 2026-06-16*
