# Phase 4: Live Integration, All Stores & Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-16
**Phase:** 4-live-integration-all-stores-hardening
**Areas discussed:** Scrape cadence, Failure alerting, 60-day keepalive, Deploy & data flow

---

## Scrape Cadence

| Option | Description | Selected |
|--------|-------------|----------|
| 2×/day | ~04:00 + 12:00 UTC; skipped run covered by next within hours; polite/low-volume | ✓ |
| 1×/day | Simplest/most polite; a single skipped run can mean ~2 days without refresh | |
| 4×/day | Max freshness/skip-resilience; marginal benefit over 2×/day for weekly data | |

**User's choice:** 2×/day
**Notes:** Settled on ~04:00 + 16:00 UTC, offset from the top of the hour to dodge GitHub's
cron-cluster lateness. Exact minute left to planner.

---

## Failure Alerting

| Option | Description | Selected |
|--------|-------------|----------|
| GitHub email + in-app freshness | Built-in workflow-failed email to knut_ulf@web.de + PWA stale indicator for silent skips; zero infra | ✓ |
| healthchecks.io dead-man's-switch | Also catches silent cron SKIPS; needs a free 3rd-party account + secret URL | |
| Auto-file a GitHub issue | In-repo visibility; doesn't catch skips; adds issue noise | |

**User's choice:** GitHub email + in-app freshness
**Notes:** GitHub's email catches run-and-fail; the existing OFFR-06 stale indicator is the
human backstop for silent skips. healthchecks.io noted as a deferred option if skips prove real.

---

## 60-Day Keepalive

| Option | Description | Selected |
|--------|-------------|----------|
| Heartbeat touch-commit | Commit a tiny heartbeat every run even with no data change; clock never reaches zero | ✓ |
| Accept the risk | Commit-on-change only; a >60-day no-offer stretch could silently disable cron | |
| Keepalive GitHub Action | 3rd-party action/separate workflow; extra moving part for what a 1-line commit does | |

**User's choice:** Heartbeat touch-commit
**Notes:** Planner constraint added — heartbeat must bump a "last successful run" timestamp
WITHOUT resetting per-store `lastUpdated`, so genuinely stale stores still read as stale (OFFR-06).

---

## Deploy & Data Flow

| Option | Description | Selected |
|--------|-------------|----------|
| One workflow: scrape → build → deploy | Single source of truth; data same-origin so existing SWR route works unchanged | ✓ |
| Decouple: shell once + cross-origin data | Avoids rebuilds but adds cross-origin fetch/CORS + two sources of truth | |
| Pages "deploy from branch" | Requires committing build artifacts; noisy history; classic non-Actions model | |

**User's choice:** One workflow: scrape → build → deploy (via `actions/deploy-pages`)

### Deploy trigger (sub-decision)

| Option | Description | Selected |
|--------|-------------|----------|
| Only when data changed | Scrape every run; commit+build+deploy only on real diff; heartbeat-only runs skip deploy | ✓ |
| Every run | Always rebuild/deploy; simple but ~2 wasteful redeploys/day | |
| Also redeploy on code push | Additive; folded in regardless | (folded in) |

**User's choice:** Only when data changed; code-push redeploy folded in as standard (D-10).

---

## Claude's Discretion

- Exact cron minute/offset, the "data changed?" detection mechanism, git bot commit identity,
  workflow `concurrency:` group + `git pull --rebase` (commit-race safety), and the data-copy step.

## Deferred Ideas

- healthchecks.io dead-man's-switch (silent-skip detection) — revisit if skips prove real.
- External cron → `repository_dispatch` fallback (cron-job.org) — only if GitHub cron degrades.
- Direct per-store fallback adapter (Aldi Süd JSON) — v2 DATA-07, not Phase 4.
- OFFR-07 tiered staleness / HIST-04 all-time-low line — v2.

## Note

- Phase 4 folds in the deferred Phase-3 **03-05 real-device install/offline/six-state
  verification** (against the live Pages URL) — it is the natural home for success-criterion 3.
