---
quick_id: 260705-s9l
slug: harden-pipeline-rerun-safety
date: 2026-07-05
status: complete
---

# Quick Task 260705-s9l — Summary

Hardened `.github/workflows/pipeline.yml` against the two failure modes that took
down scheduled run `28749099899` and its re-run.

## What changed

**Task 1 — rebase conflict-safe commit/push**
- `git pull --rebase --autostash` → `git pull --rebase -X theirs --autostash` in
  the "Commit data + heartbeat" step. During a rebase the replayed commit is
  "theirs", so a stale-SHA re-run or a concurrent origin advance auto-resolves the
  regenerated data files in favor of this run's fresh scrape instead of aborting
  with an unresolvable conflict.

**Task 2 — tolerate one transient Pages deploy error**
- First `actions/deploy-pages@v5` step now has `continue-on-error: true`; a 30s
  pause and a second `deploy-pages@v5` attempt run only if the first failed
  (`steps.deployment.outcome == 'failure'`). The retry has no `continue-on-error`,
  so a persistent failure still fails the run. `environment.url` coalesces across
  both step ids. First-party actions only (T-04-07 honored).

## Verification
- `pipeline.yml` parses as valid YAML (python `yaml.safe_load`).
- Fresh `workflow_dispatch` run `28750411777` (triggered before the edit, off
  current master) went fully green — deploy unblocked, latest data live.

## Root-cause recap (for the record)
- Run 28749099899 attempt 1: scrape+push succeeded; `deploy-pages` hit a transient
  "Deployment failed, try again later" — a GitHub Pages-side hiccup, not our data.
- Attempt 2 (user Re-run): GitHub replays from the original head SHA `5b00b97`
  while origin had advanced to `74e1a79`; the plain rebase couldn't merge the
  conflicting JSON timestamp lines and exited 1.

## Operational note
Do not use GitHub's "Re-run" button on this workflow — it replays a now-stale SHA.
To retry, trigger a fresh run: `gh workflow run pipeline.yml --ref master`.

## Not done (out of scope)
- No post-rebase push-race retry loop (concurrency group already serializes runs).
