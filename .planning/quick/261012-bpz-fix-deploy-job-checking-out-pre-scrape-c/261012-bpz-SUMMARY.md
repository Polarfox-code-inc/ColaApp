---
phase: quick-261012-bpz
plan: 01
quick_id: 261012-bpz
subsystem: ci
tags: [github-actions, pages, deploy, data-freshness]
status: complete
requires: []
provides:
  - "deploy job checks out branch tip (github.ref_name), so Pages serves the same run's scraped data"
affects: [INFR-03, INFR-02, PWA-03]
tech-stack:
  added: []
  patterns: ["deploy checkout pinned to branch tip; serialized by cola-pipeline concurrency group"]
key-files:
  created: []
  modified: [.github/workflows/pipeline.yml]
decisions:
  - "Deploy checkout uses ref: github.ref_name (branch tip) rather than a pushed-SHA job output: simplest, no output plumbing, concurrency group guarantees the tip is the just-pushed data commit"
  - "Re-running a failed deploy job alone is now safe (ships current tip); fresh gh workflow run remains the preferred retry"
metrics:
  duration: ~4min
  completed: 2026-10-12
actuals:
  tokens: 1500
  tasks: 2
  commits: 1
plan_head_before: acdb39848e65fbe2a7803829f7cebddcc96ca12f
plan_head_after: e3e64b64a036a74c1928e63c6aa38ba14dc4a8b2
---

# Quick 261012-bpz Plan 01: Deploy job checks out branch tip Summary

The deploy job's `actions/checkout@v6` now uses `ref: ${{ github.ref_name }}`. Pages now ships the data commit that the same run's scrape job just pushed. Before, it shipped the pre-scrape triggering SHA, which put the live site one run behind. This was proven on a real push-triggered run and on the live site.

## Root cause

A bare `actions/checkout` resolves `github.sha`, which is the commit that triggered the run. On schedule and dispatch runs that is the pre-scrape commit, so the deploy always built the previous run's `data/`.

## Change

- `.github/workflows/pipeline.yml`, deploy job step 0: added `with: ref: ${{ github.ref_name }}`. Removed the inaccurate end-of-line comment ("gets the just-pushed data/") and added a 7-line rationale comment above the step.
- The expression is used only as an action input and never inside `run:` (T-bpz-02).
- Unchanged: the scrape-and-commit job (its default checkout and `rebase -X theirs`), the top-level and deploy `permissions`, the `cola-pipeline` concurrency group, the `if:` gate, env url coalescing, the copy/build steps, and both `deploy-pages@v5` steps. The static gate confirmed all of this.

## Design rationale (ref_name vs SHA output)

- **One `with:` input.** No job-output plumbing, and no empty-output fallback for the commit step's early `exit 0` (nothing staged).
- **Concurrency.** The workflow-level `cola-pipeline` group serializes pipeline runs, so the tip at deploy checkout is Job A's just-pushed data commit. Only a maintainer push can land in between. That is fine because newest data and code is the goal, and the push queues its own run anyway.
- **Push path.** The tip is the code commit plus the fresh data commit, which is strictly better than before (new code with stale data).
- **Branch agreement.** `github.ref_name` == `GITHUB_REF_NAME`, the branch the scrape step pushes to.

## Verification evidence

| Item | Value |
|------|-------|
| Fix commit | `e3e64b64a036a74c1928e63c6aa38ba14dc4a8b2` (pushed `acdb398..e3e64b6` to origin/master) |
| Verification run | `38213215638` (event: push, conclusion: success; scrape-and-commit success, deploy success) |
| Triggering SHA | `e3e64b64a036a74c1928e63c6aa38ba14dc4a8b2` |
| Deploy fetch refspec | `+refs/heads/master*:refs/remotes/origin/master*` (no `+<trigger-sha>:` fetch) |
| Deployed SHA (deploy-job `git log -1`) | `d0281aaf37704be16e731e3046ada6a1e70675d2`, which is `chore(data): scheduled scrape + heartbeat [skip ci]` and a descendant of the trigger |
| Repo `data/status.json` lastUpdated @ deployed SHA | `2026-10-12T06:34:59.805Z` |
| Live `status.json?cb=…` lastUpdated | `2026-10-12T06:34:59.805Z` (matched on the first probe attempt) |
| Pre-scrape (trigger) lastUpdated | `2026-10-11T20:21:21.393Z` |

Task 1 verify printed `PASS run=38213215638 trigger=e3e64b6… deployed=d0281aa…`. Task 2 verify printed matching `want=`/`got=`, different from the pre-scrape value, so the one-run lag is gone.

## Operational note (refines 260705-s9l "do not Re-run")

- **Re-running only a failed deploy job** is now safe. It checks out and ships the current branch tip, not a stale replayed SHA.
- **A full-workflow Re-run** still replays a stale SHA in scrape-and-commit. `rebase -X theirs` handles that case.
- **Preferred retry:** a fresh `gh workflow run pipeline.yml --ref master`.

## Flags for orchestrator

- The local `master` is now behind `origin/master` by the bot's data commit `d0281aa`. Run `git pull --rebase origin master` before the docs commit and push.
- Any docs commit made after this push (PLAN, SUMMARY, STATE) stays local until pushed. Pushing it later triggers one more harmless push-event run (scrape plus deploy).

## Deviations from Plan

None. The plan was executed exactly as written. The work was committed to master directly, as the user authorized for this quick task on the main checkout.

## Self-Check: PASSED

- FOUND: .github/workflows/pipeline.yml (with `ref: ${{ github.ref_name }}`)
- FOUND: e3e64b6 (ancestor of HEAD and of origin/master)
