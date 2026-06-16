---
phase: 04-live-integration-all-stores-hardening
plan: 02
subsystem: infra
tags: [github-actions, ci-cd, github-pages, keepalive, deploy-pages, least-privilege, supply-chain]

# Dependency graph
requires:
  - phase: 04-live-integration-all-stores-hardening
    provides: "scripts/heartbeat.mjs (keepalive writer) + web/vite.config.js base:'/ColaApp/' (subpath-correct build) from Plan 01"
  - phase: 02-scraper
    provides: "scraper/index.mjs CLI (npm run scrape) — fault-isolated, exits 0 on store errors, writes the three data/ files"
provides:
  - ".github/workflows/pipeline.yml: single scrape->commit->build->deploy workflow (D-06); schedule 2x/day + push(master) + workflow_dispatch"
  - "Self-sustaining live loop: scraped data + heartbeat committed back via GITHUB_TOKEN; PWA + data deployed to GitHub Pages on real data change or code push"
affects: [04-03-full-loop-verification, live-integration, github-pages-deploy]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single workflow, two jobs (scrape-and-commit -> deploy) with the deploy gated by a job output (data_changed) OR the push event (D-09/D-10)"
    - "data_changed computed via `git diff --quiet -- data/ ':!data/heartbeat.json'` BEFORE the heartbeat write so heartbeat-only runs read as no-change (L-2)"
    - "Safe GITHUB_TOKEN self-commit: github-actions[bot] identity + commit-only-if-staged + pull --rebase --autostash + push HEAD:$GITHUB_REF_NAME (Pattern 3)"
    - "Official first-party Pages flow: configure-pages -> upload-pages-artifact(web/dist) -> deploy-pages with per-job pages:write + id-token:write (no gh-pages branch, no PAT)"
    - "Least-privilege: top-level contents:write only; deploy job narrows to pages:write/id-token:write/contents:read"

key-files:
  created:
    - .github/workflows/pipeline.yml
  modified: []

key-decisions:
  - "L-1 keepalive (INFR-03 crux): accept-residual-risk — heartbeat-commit only, NO `gh workflow enable` re-arm step. Documented as a YAML comment. A silently-disabled scheduled job surfaces within days via the in-app stale chip (D-03) and is one click to re-enable; honors no-new-accounts/secrets (D-02)."
  - "data_changed diff runs BEFORE the heartbeat write and excludes data/heartbeat.json so a heartbeat-only run does not trigger a deploy (L-2 / D-09)"
  - "No shell strictness on `npm run scrape` (no set -e wrapper) — the scraper deliberately exits 0 on per-store/total fetch errors; over-stricting would turn that into a failed run (L-6)"
  - "Heartbeat step has NO `if: always()` (Open Q3): runs only on scrape success; a failed scrape fails the job, emails the owner (D-02), and the manual intervention resets the timer anyway"
  - "All five actions pinned to the VERIFIED majors (checkout@v6, setup-node@v6, configure-pages@v6, upload-pages-artifact@v5, deploy-pages@v5) — NOT the @v4 references in CONTEXT/CLAUDE.md"

patterns-established:
  - "Pattern: assembly-only CI phase — pipeline composes first-party GitHub primitives + existing Plan-01 scripts; zero new product code, zero new npm packages"

requirements-completed: [INFR-01, INFR-02, INFR-03]

# Metrics
duration: ~1min
completed: 2026-06-16
---

# Phase 4 Plan 02: Live CI/CD pipeline (scrape -> commit -> build -> deploy) Summary

**A single greenfield `.github/workflows/pipeline.yml` that turns the existing scraper + PWA into a free, self-sustaining live loop: on a 2x/day schedule and on push to master it runs the fault-isolated scraper, writes the keepalive heartbeat, commits data back via GITHUB_TOKEN, and — only when scraped data actually changed or the run was a code push — builds the PWA at the /ColaApp/ subpath and deploys it to GitHub Pages via the official artifact flow, with the L-1 keepalive risk explicitly decided as accept-residual-risk.**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-06-16T08:48:51Z
- **Completed:** 2026-06-16T08:49:49Z
- **Tasks:** 2 (1 decision checkpoint pre-resolved, 1 auto)
- **Files modified:** 1 (1 created)

## Accomplishments
- `.github/workflows/pipeline.yml` authored as a single workflow with two jobs, following RESEARCH Pattern 1 verbatim with the planner's locked L-2 step ordering.
- **Triggers (D-01/D-10):** `schedule:` two offset crons (`7 4 * * *` ~04:07 UTC, `23 16 * * *` ~16:23 UTC), `push: branches: [master]`, `workflow_dispatch: {}`.
- **Job A `scrape-and-commit`:** checkout@v6 -> setup-node@v6 (node 22, npm cache) -> `npm ci` -> `npm run scrape` (no shell strictness, L-6) -> `data_changed` diff via `git diff --quiet -- data/ ':!data/heartbeat.json'` BEFORE the heartbeat (L-2/D-09) -> `node scripts/heartbeat.mjs` -> `github-actions[bot]` commit-only-if-staged + `git pull --rebase --autostash` + `git push HEAD:$GITHUB_REF_NAME` (Pattern 3), message `chore(data): scheduled scrape + heartbeat [skip ci]`.
- **Job B `deploy`:** `needs: scrape-and-commit`, gated by `data_changed == 'true' || github.event_name == 'push'` (D-09/D-10); per-job least-privilege `pages: write` + `id-token: write` + `contents: read`; `environment: github-pages`. Steps: checkout@v6 -> setup-node@v6 -> root `npm ci` -> copy the three live data files into `web/public/data` (D-07/D-11) -> `npm ci && npm run build` in `web/` (base `/ColaApp/`) -> configure-pages@v6 -> upload-pages-artifact@v5 (`web/dist`) -> deploy-pages@v5.
- **Concurrency:** `cola-pipeline`, `cancel-in-progress: false` (never cancel a half-deploy, Pitfall 4).
- **Supply chain:** only first-party `actions/*`, all five pinned to the verified majors; no PAT, no third-party keepalive action, no legacy gh-pages branch.

## Task Commits

1. **Task 1 (checkpoint:decision):** pre-resolved by the orchestrator — no commit (decision recorded below).
2. **Task 2: pipeline.yml** - `859933e` (feat) — the single scrape->commit->build->deploy workflow.

## Decisions Made

### Task 1 — L-1 keepalive hardening (INFR-03 crux): **accept-residual-risk** (CHOSEN)
The user selected **accept-residual-risk** ("Accept documented residual risk — heartbeat-commit only").

- **What was applied:** The optional `gh workflow enable` re-arm step was OMITTED from Job A. In its place, a YAML comment block at the top of `pipeline.yml` documents the accepted residual risk.
- **Rationale:** Strong community evidence (the canonical keepalive-workflow project abandoned commit-mode for API-mode) indicates a GITHUB_TOKEN bot commit may not reliably reset GitHub's 60-day scheduled-workflow inactivity timer. The accepted residual risk is that the scheduled job could silently disable after ~60 days of bot-commit-only activity. This is tolerable because: (1) a disabled job surfaces within days via the in-app "stale" freshness chip (D-03); (2) re-enabling is a single click in the Actions tab; (3) it fully honors "no new accounts/secrets" (D-02) and avoids adding workflow surface. The heartbeat still guarantees repo CONTENT activity every run (D-04); only the scheduled-trigger re-arm is the documented uncertainty.

### Other decisions (Task 2)
- **L-2 diff ordering:** `data_changed` is computed from the scraper's output ONLY, excluding `data/heartbeat.json`, and BEFORE the heartbeat write — so a heartbeat-only run reads as no-change and does not trigger a needless deploy (D-09).
- **No shell strictness (L-6):** `npm run scrape` runs without a `set -e` wrapper; the scraper exits 0 on per-store/total fetch errors by design (verified in `scraper/index.mjs` `main()`), and only exits non-zero on a schema-validation throw. Over-stricting would turn a designed exit-0 into a failed run.
- **No `if: always()` on the heartbeat (Open Q3):** the heartbeat runs only on scrape success. A failed scrape fails the job and emails the owner (D-02); the manual intervention resets the timer anyway, so a missed heartbeat on a failed run is acceptable by design.
- **Verified action majors:** checkout@v6, setup-node@v6, configure-pages@v6, upload-pages-artifact@v5, deploy-pages@v5 — deliberately NOT the @v4 references in CONTEXT/CLAUDE.md.

## Deviations from Plan

None - plan executed exactly as written.

Task 1 was a `checkpoint:decision` that the orchestrator pre-resolved to `accept-residual-risk`; it was applied directly without pausing, per the execution instructions. Note: the verify assertion only string-matches the workflow; an additional structural sanity check (no tab indentation, both jobs present, top-level keys) was run as belt-and-suspenders YAML validation and passed.

## User Setup Required — maintainer one-time GitHub settings (prerequisite for the first live run)

These are **human-only** prerequisites. They do not block authoring the workflow file (done), but the pipeline cannot run end-to-end until they are completed:

| # | Task | Where |
|---|------|-------|
| 1 | Set repo visibility to **Public** | Settings -> General -> Danger Zone (free unlimited Actions + free Pages) |
| 2 | Set Pages source to **"GitHub Actions"** (NOT "Deploy from a branch") | Settings -> Pages -> Build and deployment -> Source -> GitHub Actions |
| 3 | Set default `GITHUB_TOKEN` workflow permissions to **Read and write** | Settings -> Actions -> General -> Workflow permissions -> Read and write permissions |
| 4 | Confirm failed-workflow **email notifications are on** for the owner (knut_ulf@web.de) | GitHub account Notifications settings (default on) |
| 5 | (Already true) Default branch is **master** | matches the `push: branches: [master]` trigger |

L-1 follow-up for the maintainer: because we accepted the residual risk, if the in-app stale chip (D-03) ever shows the data is no longer updating, check the Actions tab — the scheduled workflow may have been auto-disabled after 60 days; re-enable it with a single click.

## Threat Model Compliance
- **T-04-05 (EoP, over-broad token):** mitigated — top-level `permissions: contents: write` only; the deploy job narrows to `pages: write` + `id-token: write` + `contents: read`.
- **T-04-06 (DoS, recursive trigger / runaway minutes):** mitigated — GITHUB_TOKEN-pushed commits do not re-trigger workflows, plus `[skip ci]` in the commit message and `concurrency` serialization with `cancel-in-progress: false`.
- **T-04-07 (tampering, typo-squatted action):** mitigated — only first-party `actions/*` pinned to verified majors; no third-party keepalive action (the `accept-residual-risk` choice uses no extra action at all).
- **T-04-08 (info disclosure, key leak):** mitigated — no new secrets introduced; the workflow never echoes the scraped keys (the scraper's existing T-02-10 guard logs `err.message` only).
- **T-04-09 (integrity, corrupt/half-written data):** mitigated — the scraper's atomic temp+rename + validate-before-write is preserved untouched; the workflow `git add`s whole files only; `concurrency` + `git pull --rebase` prevent push races.
- **T-04-SC (supply chain, npm/action installs):** mitigated — `npm ci` (lockfile-exact) in both jobs; zero new npm packages; all actions first-party per the RESEARCH Package Legitimacy Audit.

No new threat surface introduced beyond the plan's `<threat_model>`. (No new network endpoints, auth paths, file-access patterns, or schema changes — this plan only orchestrates existing primitives.)

## Known Stubs
None. The workflow wires real existing scripts (`npm run scrape`, `node scripts/heartbeat.mjs`) and real first-party Pages actions; no placeholder/mock data, no TODO/FIXME, no unwired data sources.

## Issues Encountered
None. The workflow's verify assertion passed first try; a supplementary structural YAML sanity check (no tabs, both jobs present) also passed.

## Next Phase Readiness
- The full live loop is assembled and committed. Plan 03 (D-12) exercises the FIRST live run end-to-end — which is where the maintainer's one-time GitHub settings above must already be in place.
- Carry-forward (non-blocking): the L-1 residual risk is now an ACCEPTED, documented posture rather than an open question; the only operational follow-up is the maintainer re-enabling a possibly-auto-disabled schedule if the stale chip ever flags it.

## Self-Check: PASSED

- `.github/workflows/pipeline.yml` exists on disk (verified via Write + git commit of 129 insertions).
- Commit `859933e` (feat 04-02 pipeline) is present in git history.
- The plan's verify assertion (`node -e ...`) printed `workflow assertions OK`.
