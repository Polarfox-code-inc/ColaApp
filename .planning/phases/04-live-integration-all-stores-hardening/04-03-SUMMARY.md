---
phase: 04-live-integration-all-stores-hardening
plan: 03
subsystem: docs
tags: [verification, pwa, github-pages, real-device, d-12, checkpoint-open]
status: PENDING-HUMAN-VERIFY

# Dependency graph
requires:
  - phase: 04-live-integration-all-stores-hardening
    provides: "pipeline.yml live loop (Plan 02) + heartbeat/base:'/ColaApp/' (Plan 01)"
provides:
  - "web/README.md: repeatable live full-loop + real-device verification procedure (D-12) extending the localhost one"
affects: [phase-4-completion, phase-3-03-05-closure]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Documentation-only plan: extends the existing localhost PWA-01/02/03 procedure to the live HTTPS Pages URL; no product-code change"

key-files:
  created: []
  modified:
    - web/README.md

key-decisions:
  - "Live-verify section inserted between the localhost procedure and the 'Phase 4 boundary' note so the two procedures read as production counterpart of localhost"
  - "Verify-assertion line-wrap fix: 'Add to home screen' kept on a single line (the substring check fails on a line break) — Rule 3 blocking-issue fix"

requirements-completed: []   # INFR-01/02/03 remain PENDING the open human-verify gate

# Metrics
duration: ~3min
completed: PENDING
---

# Phase 4 Plan 03: Live full-loop + real-device verification (D-12) Summary — PENDING HUMAN VERIFICATION

> **STATUS: NOT COMPLETE.** Task 1 (documentation) is done and committed. **Task 2 is an
> OPEN `checkpoint:human-verify` gate** that requires running the 8-step checklist on a
> physical Android phone against the live GitHub Pages URL. That cannot be performed by the
> executor agent (no phone, no live-deployment access). This SUMMARY records Task 1 only and
> documents the open checkpoint. Do NOT treat the plan or Phase 4 as complete, and do NOT mark
> INFR-01/02/03 or Phase 3's 03-05 checkpoint closed, until a human types "approved".

**Task 1 added a "Live verification (production / D-12)" section to `web/README.md` — the production counterpart of the existing localhost PWA procedure: a numbered 8-step checklist (loop proof, Android install, offline last-data, fresh-when-online, six `?state=` fixtures, de-DE localisation, subpath sanity, live fault isolation) run against `https://polarfox-code-inc.github.io/ColaApp/`, plus the one-time maintainer GitHub prerequisites (referencing Plan 02). Task 2's real-device acceptance remains an OPEN human-verify checkpoint.**

## Performance

- **Duration:** ~3 min (Task 1 only)
- **Started:** 2026-06-16T08:53:13Z
- **Tasks:** 1 of 2 complete (Task 2 = open human-verify gate)
- **Files modified:** 1 (web/README.md; 72 insertions)

## Accomplishments (Task 1)

- Added a numbered live-verification checklist transcribing RESEARCH's "Verification Procedure (D-12)" steps 1–8 against the live HTTPS Pages URL, on a real Android phone.
- Added a "One-time maintainer prerequisites" table (repo Public, Pages source = "GitHub Actions", token Read+write, default branch master, failure email) referencing Plan 02's `04-02-SUMMARY.md` "User Setup Required".
- Documentation only — no product-code file touched (verified via `git status`).
- The plan's verify assertion (`node -e ...` for the five required substrings) passes: `README live-verify section OK`.

## Task Commits

1. **Task 1: web/README.md live-verify section** — `6f9e1e3` (docs) — "document live full-loop + real-device verification (D-12)".
2. **Task 2: live full-loop + real-device acceptance** — NOT EXECUTED. Open `checkpoint:human-verify` (gate="blocking"); requires a physical Android device + the maintainer's one-time GitHub settings. See "Open Checkpoint" below.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Verify-assertion failure on line-wrapped "Add to home screen"**
- **Found during:** Task 1 verify step.
- **Issue:** The plan's `node -e` assertion checks for the literal substring `Add to home screen`. My first draft wrapped that phrase across a Markdown line break (matching the pre-existing localhost section's style), so the substring did not exist and the assertion exited 1.
- **Fix:** Reworded step 2 so `"Add to home screen"` stays on a single line.
- **Files modified:** web/README.md
- **Commit:** 6f9e1e3 (same atomic Task 1 commit; caught and fixed before committing).

## Open Checkpoint — Task 2 (`checkpoint:human-verify`, gate="blocking")

**This gate is OPEN.** The human must:

**Prerequisite (one-time, human-only — GitHub repo Settings):** repo **Public**; Pages source = **"GitHub Actions"**; Actions workflow permissions = **Read and write**; default branch = **master**; failed-workflow **email on** for knut_ulf@web.de.

**Then run the 8-step checklist on a real Android phone against `https://polarfox-code-inc.github.io/ColaApp/`:**
1. Loop proof: trigger workflow → green run → `chore(data): scheduled scrape + heartbeat` commit on master → deploy job ran (gated) → live footer "last updated" reflects new data.
2. Install via Android Chrome "Add to home screen": name ColaApp, trademark-safe bottle icon on #1A1D21, maskable not clipped, opens standalone.
3. Offline last-data: airplane mode reopen renders last-fetched hero/cards/graph/footer (not an error).
4. Fresh-when-online: after a data-changing scrape, reopen twice → new price appears (StaleWhileRevalidate).
5. Six states: `?state=offer|no_offer|upcoming|error|stale|unavailable` each render per the README table.
6. Localisation: German throughout, de-DE formatting (€9,99, 0,83 €/l, 21.06.2026).
7. Subpath sanity: SW registered under /ColaApp/, manifest loaded, icons resolve at /ColaApp/icon-*.png (no 404s), data fetched from /ColaApp/data/.
8. Fault isolation: all five stores present; Wasgau "nicht automatisch verfügbar"; one store error doesn't blank the others.

**Resume signal:** human types **"approved"** when all 8 steps pass, or describes which step failed.

**On approval (NOT done yet):** mark INFR-01/02/03 complete, close Phase 3's 03-05 checkpoint (D-12), advance the plan counter, update ROADMAP, and update this SUMMARY to a COMPLETE state.

## Known Stubs

None. Documentation-only change; no placeholder/mock data, no TODO/FIXME, no unwired data source.

## Self-Check: PASSED

- `web/README.md` exists and contains the live-verification section (verify assertion `README live-verify section OK`).
- Task 1 commit `6f9e1e3` is present in git history (`git log` shows it on master).
- Task 2 deliberately NOT executed/fabricated — recorded as an open `checkpoint:human-verify`.
