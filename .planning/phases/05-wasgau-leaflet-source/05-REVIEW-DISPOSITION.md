---
phase: 05
review: 05-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "Redirect allow-list check runs after the off-host request was already sent, and refusals are retried"
  - id: WR-02
    severity: warning
    disposition: open
    title: "MAX_BODY_CHARS does not protect against oversized or decompression-bomb bodies"
  - id: WR-03
    severity: warning
    disposition: open
    title: "`litresOf` disagrees with the frozen matcher, so valid 12x1L cases are demoted to mismatch/ambiguous"
  - id: WR-04
    severity: warning
    disposition: open
    title: "Common German weekday abbreviations break window parsing, which silently falls back to the wider leaflet window"
  - id: WR-05
    severity: warning
    disposition: open
    title: "One unpaired Cola box turns Wasgau to \"error\" for the whole leaflet week and hides a valid clean offer"
  - id: WR-06
    severity: warning
    disposition: open
    title: "Leaflet cache is keyed only on leafletId, so parser fixes never reach the current week's stored doc"
  - id: WR-07
    severity: warning
    disposition: open
    title: "The diagnose probe can report Wasgau reachability from a stale, committed candidates file"
  - id: IN-01
    severity: info
    disposition: open
    title: "Page-1 leaflet window without a year makes the whole Wasgau source fail every run"
  - id: IN-02
    severity: info
    disposition: open
    title: "Only one leaflet is held, so an early homepage switch drops the current week's active offer"
  - id: IN-03
    severity: info
    disposition: open
    title: "Clean-first ranking can hide an active needsReview offer behind an upcoming clean one"
  - id: IN-04
    severity: info
    disposition: open
    title: "Stale \"three files\" wording in orchestrator docs"
open: 11
total: 11
recorded: 2026-10-12T18:36:01.200Z
---

# Phase 05: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| WR-03 | warning | open | - |
| WR-04 | warning | open | - |
| WR-05 | warning | open | - |
| WR-06 | warning | open | - |
| WR-07 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
