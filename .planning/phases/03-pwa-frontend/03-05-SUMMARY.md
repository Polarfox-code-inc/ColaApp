---
phase: 03-pwa-frontend
plan: 05
subsystem: pwa-frontend
tags: [verification, pwa, install, offline, network-first, six-states, human-verify, closed]
status: COMPLETE

# Dependency graph
requires:
  - "web/dist (Plan 04: built PWA shell + render layer + ?state= switch)"
  - "web/README.md (dev/build/preview + install/offline procedure)"
  - "Phase 4 live loop (pipeline.yml) deploying to GitHub Pages — the surface this was verified against"
provides:
  - "Recorded human verification of PWA-01 (install), PWA-02 (offline last-data), PWA-03 (fresh-when-online) and all six ?state= fixtures"
affects: [phase-3-completion, phase-4-04-03-closure, milestone-v1.0]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Verification-only checkpoint: no product code; the human ran install/offline/fresh + six-state checks on a real Android device against the live Pages URL"

key-files:
  created: []
  modified: []

key-decisions:
  - "Verified against the LIVE deployed PWA (https://polarfox-code-inc.github.io/ColaApp/), jointly with Phase 4 plan 04-03 — the two human-verify gates were twinned on the same real-device acceptance run and closed by a single 'approved'"
  - "Acceptance criteria were reconciled to the post-2026-06 merges BEFORE verification: data route is NetworkFirst (fresh on first online reload, not the old SWR two-reload lag, commit 94892ef); a needsReview offer now surfaces as a flagged amber 'bitte prüfen' card and must never headline the hero (commit 81bb27a)"

requirements-completed: [PWA-01, PWA-02, PWA-03, OFFR-01, OFFR-02, OFFR-03, OFFR-04, OFFR-05, OFFR-06, HIST-01, HIST-02, HIST-03]

# Metrics
duration: human-verify (out-of-band)
completed: 2026-06-18
---

# Phase 3 Plan 05: Human-verify install/offline/fresh + six states — COMPLETE

> **STATUS: COMPLETE.** Task 1 (build + localhost preview + README) was done and committed
> earlier. Task 2, the blocking `checkpoint:human-verify` gate, was approved by the human on
> **2026-06-18** against the live GitHub Pages deployment, jointly with Phase 4's 04-03 gate.

## What was verified

The human ran the install / offline / fresh-when-online / six-state checklist (as updated in
`03-05-PLAN.md`) and confirmed every check passes:

- **PWA-01 — Install:** "Add to home screen" works on Android Chrome; app name **ColaApp**, the
  trademark-safe bottle icon on the dark (#1A1D21) tile, maskable variant not clipped, opens
  standalone.
- **PWA-02 — Offline last-data:** With the app loaded, going offline and reloading still renders
  the last-fetched hero/cards/graph/footer — not a blank/error page.
- **PWA-03 — Fresh-when-online:** After a data-changing scrape, the new value appears on the
  **first** online reload. This confirms the **NetworkFirst** (3s timeout) route fixed the prior
  StaleWhileRevalidate one-open stale-price lag (commit 94892ef); a stale-forever result would
  have failed the checkpoint (threat T-03-10).
- **Six `?state=` fixtures:** offer / no_offer / upcoming / error / stale / unavailable each render
  the correct hero, cards, chips, stale markers, and graph. In the `offer` state a `needsReview`
  entry shows as its own amber **"bitte prüfen"** card (muted price, ranked below upcoming) and
  does **not** headline the hero (commit 81bb27a).
- **Localisation:** German throughout, de-DE number/date formatting (€9,99 · 0,83 €/l · 21.06.2026).

## Requirements closed

PWA-01, PWA-02, PWA-03 confirmed on a real device; OFFR-01..06 and HIST-01..03 visually confirmed
across all six states. All twelve were already implemented in Plans 01–04; this checkpoint provides
the human acceptance that promotes them from "built" to "verified".

## Self-Check: PASSED

- Human typed "approved" on 2026-06-18 after the full checklist passed against the live URL.
- Acceptance criteria had been reconciled to the merged NetworkFirst + review-card behavior before
  verification (no test against superseded criteria).
- Closes the Wave-3 Phase-3 checkpoint; Phase 3 is now 5/5 complete.
