---
phase: quick-261012-bpz
plan: 01
quick_id: 261012-bpz
slug: fix-deploy-job-checking-out-pre-scrape-c
type: execute
wave: 1
depends_on: []
files_modified:
  - .github/workflows/pipeline.yml
autonomous: true
requirements: [INFR-03, INFR-02, PWA-03]

estimate:
  tokens: 30000
  raw_tokens: 30000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "The deploy job checks out the branch tip (github.ref_name), so a scheduled/dispatch/push run deploys the data commit its own scrape-and-commit job just pushed, not the pre-scrape triggering SHA"
    - "On the verification run, the deploy job's checkout log fetches refs/heads/master (not +<triggering-sha>:refs/remotes/origin/master) and checks out a 'chore(data): scheduled scrape' commit that descends from the triggering SHA"
    - "The live https://polarfox-code-inc.github.io/ColaApp/data/status.json lastUpdated equals data/status.json lastUpdated of the deployed commit — the one-run data lag is gone"
    - "scrape-and-commit job, deploy permissions, the cola-pipeline concurrency group, and the 260705-s9l hardening (rebase -X theirs, one gated deploy-pages retry) are unchanged"
  artifacts:
    - path: .github/workflows/pipeline.yml
      provides: "deploy job checkout pinned to the branch tip with an accurate explanatory comment"
      contains: "ref: ${{ github.ref_name }}"
  key_links:
    - from: "deploy job actions/checkout@v6 (with.ref)"
      to: "scrape-and-commit push target (git push origin HEAD:${GITHUB_REF_NAME})"
      via: "same branch name: github.ref_name == GITHUB_REF_NAME, so deploy reads the exact tip the scrape job just pushed"
      pattern: "ref: \\$\\{\\{ github.ref_name \\}\\}"
    - from: "deploy job checked-out tree data/status.json"
      to: "web/public/data/status.json -> web/dist -> GitHub Pages"
      via: "Copy prod data step (cp data/current-offers.json data/status.json data/price-history.jsonl web/public/data/)"
      pattern: "cp data/current-offers.json data/status.json data/price-history.jsonl web/public/data/"
---

<objective>
Fix the one-run data lag on the live site: the deploy job in `.github/workflows/pipeline.yml` uses a bare `actions/checkout@v6`, which checks out `github.sha` — the commit that TRIGGERED the run. On schedule/dispatch runs that is the pre-scrape commit, so Pages always serves the previous run's data (evidence: run 38171846347 — scrape job pushed acdb398 at 20:21, deploy fetched `+10d3c8f…:refs/remotes/origin/master`, live status.json shows 10:44 = 10d3c8f's data). Then push the fix and prove on a real run that the live site now serves the same-run data.

Design choice (Claude's discretion, stated for the record): pin the deploy checkout to `ref: ${{ github.ref_name }}` (branch tip) rather than passing the pushed SHA as a scrape-job output. Reasons:
- Simplest correct option: one `with:` input. No output plumbing, and no empty-output fallback needed for the commit step's early `exit 0` path when nothing is staged.
- The workflow-level `concurrency: cola-pipeline` group serializes runs, so no other pipeline run can push between job A's push and job B's checkout. The tip IS the just-pushed data commit. The only thing that can land in between is a maintainer push. Deploying that newer tip is fine because newest data and code is always the goal, and that push queues its own run anyway.
- Re-run safety (consistent with 260705-s9l): "Re-run failed jobs" on a deploy-only failure replays the original `github.sha`. With the tip pinned, it ships the newest data instead of a stale commit. A newer-than-intended deploy on re-run is acceptable by the same "newest data is desired" rule.
- Push path: the tip is the pushed code commit plus the fresh data commit on top. Before the fix, this path deployed new code with the previous run's data, so it is strictly better now.
- `github.ref_name` matches the `GITHUB_REF_NAME` the scrape step already pushes to, so both jobs agree on the branch.

Purpose: Restores INFR-03's end-to-end loop (cron → data → Pages → PWA reflects new data) and PWA-03's "fresh data when online" at the source. NetworkFirst in the PWA cannot help while the deployed file itself is one run stale.
Output: Edited `.github/workflows/pipeline.yml` (deploy checkout only), pushed to origin/master, verified live.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.github/workflows/pipeline.yml
@.planning/quick/260705-s9l-harden-pipeline-rerun-safety/260705-s9l-SUMMARY.md

Facts already verified by the orchestrator/planner (do not re-investigate):
- `workflow_dispatch: {}` exists in the workflow (`on:` block). A plain push to master also triggers the workflow (`push: branches: [master]`). Pushing the fix therefore starts its own verification run, so do NOT also run `gh workflow run`. That would queue a redundant second run behind the concurrency group.
- `data/status.json` top-level `lastUpdated` changes on every scrape (10d3c8f = 2026-10-11T10:44:41.401Z, acdb398 = 2026-10-11T20:21:21.393Z). So every run has `data_changed == true` and deploys, and comparing `lastUpdated` values is a valid freshness probe.
- In `gh run view --log` output, actions/checkout prints the fetch command line, then a `[command]/usr/bin/git log -1 --format=%H` line followed by the full 40-hex checked-out SHA on the next line. With a bare checkout the fetch refspec is `+<sha>:refs/remotes/origin/master`. With a branch `ref` input it becomes `+refs/heads/master*:refs/remotes/origin/master*`.
- With a non-SHA `ref` input, actions/checkout leaves `commit` empty and resolves the branch tip at checkout time. That is the behavior this fix relies on.
</context>

<tasks>

<task type="tracer">
  <name>Task 1: End-to-end — deploy job ships the just-pushed scrape commit (edit, push, prove on the push-triggered run)</name>
  <files>.github/workflows/pipeline.yml</files>
  <read_first>.github/workflows/pipeline.yml, .planning/quick/260705-s9l-harden-pipeline-rerun-safety/260705-s9l-SUMMARY.md</read_first>
  <precondition>`gh auth status` exits 0 (gh must be able to list/watch runs and read job logs for this repo).</precondition>
  <reversibility rating="reversible">Single workflow-input change on master; a git revert plus the next run restores prior behavior.</reversibility>
  <action>
1. Edit ONLY the `deploy:` job's first step, the bare `- uses: actions/checkout@v6` line. Do not touch the identical line in `scrape-and-commit`.
   - Add a `with:` block under it containing `ref: ${{ github.ref_name }}`, indented to match the other `with:` blocks in the file.
   - Delete that line's trailing end-of-line comment. It wrongly claims the default checkout picks up the scrape job's pushed data on the scheduled path. In fact the default checkout resolves to `github.sha`, the pre-scrape triggering commit.
   - Put a short replacement comment block (about 5-7 `#` lines) directly ABOVE the step. Indent it like the existing step comments in this file (e.g. the comments above "Detect scraped-data change"). It must say:
     - (a) why we check out the branch tip instead of the default triggering SHA (the default would always ship the previous run's data);
     - (b) that the workflow-level cola-pipeline concurrency group stops another pipeline run from pushing in between, so the tip is job A's data commit, and anything newer is also fine because newest data is the goal;
     - (c) that a deploy-only Re-run therefore ships the current tip instead of a stale replayed SHA, which complements the 260705-s9l rebase hardening.
   - In the comment, name `github.ref_name` in prose only; the `ref:` line itself carries the expression.
   - Use the expression only as the action's `with.ref` input, never inside a `run:` script (script-injection hygiene, T-bpz-02).
2. Leave everything else byte-for-byte unchanged:
   - scrape-and-commit job: its default checkout plus `rebase -X theirs` already handles a stale start;
   - top-level and deploy `permissions`;
   - `concurrency`;
   - the `if:` gate;
   - environment url coalescing;
   - copy/build steps;
   - both `deploy-pages@v5` steps.
3. Run the static gate: everything in the verify below before `FIX=` (python YAML assertions, stale-phrase check, `rebase -X theirs` grep). If it fails, fix the edit. Do not commit or push a failing edit.
4. Commit only `.github/workflows/pipeline.yml`:
   - Use a conventional message such as `fix(ci): deploy job checks out branch tip so Pages ships the just-scraped data`, plus the session's Co-Authored-By attribution trailer.
   - The message must NOT contain GitHub's skip-ci marker. If it does, the push will not start the verification run.
5. Sync and push. The user explicitly authorized the push.
   - Run `git fetch origin`, then `git pull --rebase origin master`. The bot lands data-only commits twice a day; they touch only `data/`, so no conflict is expected. If a conflict appears anyway, stop and report it rather than resolving it blindly.
   - Then run `git push origin master`.
6. Wait about 15 seconds so GitHub registers the push-event run, then run the full verify command.
   - `gh run watch` blocks until the run finishes: scrape about 1 min, deploy about 2-3 min, plus queue time if a scheduled run is in flight. Invoke it with a 600000 ms Bash timeout or `run_in_background`.
   - If the first `gh run list` still returns an older push run, the ancestor check fails fast. Wait a few seconds and re-run.
   - Only if no push-event run appears within about 2 minutes: fall back to `gh workflow run pipeline.yml --ref master` and replace `--event push` with `--event workflow_dispatch` in both verify commands.
  </action>
  <verify>
    <automated>python -c "import yaml; w=yaml.safe_load(open('.github/workflows/pipeline.yml',encoding='utf-8')); st=w['jobs']['deploy']['steps']; d=st[0]; a=w['jobs']['scrape-and-commit']['steps'][0]; assert d['uses']=='actions/checkout@v6' and 'github.ref_name' in d['with']['ref']; assert 'with' not in a; assert w['jobs']['deploy']['permissions']=={'pages':'write','id-token':'write','contents':'read'}; assert w['concurrency']['group']=='cola-pipeline'; assert sum(1 for s in st if s.get('uses')=='actions/deploy-pages@v5')==2; print('static OK')" && ! awk '/^  deploy:/{f=1} f' .github/workflows/pipeline.yml | grep -qF 'gets the just-pushed' && grep -q 'rebase -X theirs' .github/workflows/pipeline.yml && FIX=$(git log -1 --format=%H -- .github/workflows/pipeline.yml) && RUN=$(gh run list --workflow pipeline.yml --event push --branch master --limit 1 --json databaseId --jq '.[0].databaseId') && TRIG=$(gh run view "$RUN" --json headSha --jq .headSha) && git fetch -q origin master && git merge-base --is-ancestor "$FIX" "$TRIG" && gh run watch "$RUN" --exit-status -i 20 && DJ=$(gh run view "$RUN" --json jobs --jq '.jobs[] | select(.name=="deploy") | .databaseId') && LOG=$(gh run view "$RUN" --job "$DJ" --log) && echo "$LOG" | grep -q 'fetch .*+refs/heads/master' && ! echo "$LOG" | grep -q "+$TRIG:refs/remotes/origin/master" && DEP=$(echo "$LOG" | grep -A1 'git log -1 --format=%H' | grep -oE '[0-9a-f]{40}' | tail -1) && git fetch -q origin master && [ -n "$DEP" ] && [ "$DEP" != "$TRIG" ] && git merge-base --is-ancestor "$TRIG" "$DEP" && SUBJ=$(git log -1 --format=%s "$DEP") && echo "$SUBJ" | grep -q '^chore(data): scheduled scrape' && echo "PASS run=$RUN trigger=$TRIG deployed=$DEP"</automated>
  </verify>
  <done>
- The deploy job's checkout has `with.ref` set to `${{ github.ref_name }}` and an accurate comment above it. The YAML parses, and scrape-and-commit, permissions, concurrency, and the s9l hardening are unchanged.
- The fix is pushed to origin/master. The push-triggered pipeline run finished green.
- That run's deploy job fetched `refs/heads/master` and checked out the bot's data commit (a descendant of the triggering SHA, not the triggering SHA itself). The verify printed `PASS run=… trigger=… deployed=…`.
  </done>
</task>

<task type="auto">
  <name>Task 2: Prove the live site serves the same-run data (CDN-aware) and record evidence</name>
  <files>.planning/quick/261012-bpz-fix-deploy-job-checking-out-pre-scrape-c/261012-bpz-SUMMARY.md</files>
  <read_first>.planning/quick/260705-s9l-harden-pipeline-rerun-safety/260705-s9l-SUMMARY.md</read_first>
  <action>
1. Run the verify command below. It probes the live `data/status.json` with a cache-busting query param. Pages serves `max-age=600`, and deploy propagation can lag about a minute, so the probe polls up to 9 times, 60 s apart.
   - Run it with `run_in_background` (or a 600000 ms timeout) because it contains `sleep`.
   - It must show the live top-level `lastUpdated` equal to the deployed commit's `data/status.json`, and different from the triggering (pre-scrape) commit's value.
2. If ONLY the final inequality clause fails, the scrape did not bump `lastUpdated` (for example, a total marktguru fetch failure). In that case the live check cannot tell old from new. Record it as "inconclusive but consistent" and rely on Task 1's deploy-log SHA proof. Do not trigger extra runs.
3. Write the SUMMARY with:
   - the run id, triggering SHA, deployed SHA, and the live vs repo `lastUpdated` values;
   - the root cause in one line (bare checkout resolves `github.sha`, the pre-scrape commit);
   - the ref_name-vs-SHA-output design rationale from the objective;
   - an operational note that refines the 260705-s9l "do not Re-run" advice: re-running a failed deploy job alone is now safe and ships the current tip. A full-workflow re-run still replays a stale SHA in scrape-and-commit, but `rebase -X theirs` handles that, and a fresh `gh workflow run pipeline.yml --ref master` remains the preferred retry.
   - a flag for the orchestrator: any docs commit made AFTER the push (PLAN/SUMMARY/STATE) is local-only until pushed. Pushing it later triggers one more harmless push-event run.
  </action>
  <verify>
    <automated>RUN=$(gh run list --workflow pipeline.yml --event push --branch master --limit 1 --json databaseId --jq '.[0].databaseId') && TRIG=$(gh run view "$RUN" --json headSha --jq .headSha) && DJ=$(gh run view "$RUN" --json jobs --jq '.jobs[] | select(.name=="deploy") | .databaseId') && LOG=$(gh run view "$RUN" --job "$DJ" --log) && DEP=$(echo "$LOG" | grep -A1 'git log -1 --format=%H' | grep -oE '[0-9a-f]{40}' | tail -1) && [ -n "$DEP" ] && git fetch -q origin master && S_DEP=$(git show "$DEP:data/status.json") && S_OLD=$(git show "$TRIG:data/status.json") && WANT=$(echo "$S_DEP" | grep -oE '"lastUpdated": *"[^"]+"' | head -1) && OLD=$(echo "$S_OLD" | grep -oE '"lastUpdated": *"[^"]+"' | head -1) && [ -n "$OLD" ] && for i in 1 2 3 4 5 6 7 8 9; do GOT=$(curl -fsS "https://polarfox-code-inc.github.io/ColaApp/data/status.json?cb=$(date +%s)" | grep -oE '"lastUpdated": *"[^"]+"' | head -1); [ "$GOT" = "$WANT" ] && break; sleep 60; done; echo "want=$WANT got=$GOT pre-scrape=$OLD"; [ -n "$WANT" ] && [ "$GOT" = "$WANT" ] && [ "$WANT" != "$OLD" ]</automated>
  </verify>
  <done>
- The live `status.json` `lastUpdated` equals the deployed data commit's value and is newer than the pre-scrape commit's value. The verify printed matching `want=`/`got=`.
- The SUMMARY records the evidence, the root cause, the design rationale, and the refined re-run note.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| repo branch tip → deploy job | The deploy job now builds whatever is at the branch tip at checkout time, instead of the frozen triggering SHA |
| workflow expression → actions/checkout input | `github.ref_name` (a branch name) flows into an action input |
| deploy job → GitHub Pages | OIDC-authenticated publish of `web/dist` (pages:write, id-token:write) |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-bpz-01 | Tampering | deploy checkout of branch tip | low | accept | The tip can include a commit pushed after the scrape job. Only maintainers can push to master, and any such push already deploys via the `push` trigger, so no new trust is granted. Workflow triggers are limited to master and maintainer dispatch. |
| T-bpz-02 | Elevation of Privilege | `${{ github.ref_name }}` expression | low | mitigate | Used only as the `with.ref` input of actions/checkout (an action input, never interpolated into a `run:` shell), so a crafted branch name cannot inject shell. Task 1 action forbids moving it into `run:`. |
| T-bpz-03 | Elevation of Privilege | deploy job `permissions` | medium | mitigate | Task 1 static gate asserts deploy permissions stay exactly `pages: write`, `id-token: write`, `contents: read`. No new actions are added. |
| T-bpz-04 | Tampering (data integrity) | live `data/status.json` / offers served to the user | medium | mitigate | The fix itself, plus Task 1's deploy-log SHA proof and Task 2's live-vs-deployed `lastUpdated` equality probe. |
| T-bpz-SC | Tampering | npm/pip/cargo installs / third-party actions | low | accept | No package installs and no new actions. The already-pinned first-party `actions/checkout@v6` only gains a `with:` input (T-04-07 first-party-only policy preserved). |
</threat_model>

<verification>
- Static: `pipeline.yml` parses. The deploy step 0 is `actions/checkout@v6` with `with.ref` containing `github.ref_name`. The scrape-and-commit checkout has no `with:`. Deploy permissions and the concurrency group are unchanged. The stale comment phrase is gone from the deploy job. `rebase -X theirs` is present. Exactly two `deploy-pages@v5` steps remain.
- End-to-end: the push-triggered run is green. Its deploy job log shows a `+refs/heads/master` fetch (no `+<trigger-sha>:` fetch) and a checked-out SHA that is the bot's data commit on top of the trigger.
- Live: `https://polarfox-code-inc.github.io/ColaApp/data/status.json?cb=<ts>` `lastUpdated` equals the deployed commit's `data/status.json` `lastUpdated`.
</verification>

<success_criteria>
- The deployed site serves the data produced by the same pipeline run; the one-run lag is gone.
- No change to scrape-and-commit, permissions, concurrency, or the 260705-s9l retry/rebase hardening.
- The fix is on origin/master and proven on a real GitHub Actions run, with evidence (run id, SHAs, timestamps) in the SUMMARY.
</success_criteria>

<output>
Create `.planning/quick/261012-bpz-fix-deploy-job-checking-out-pre-scrape-c/261012-bpz-SUMMARY.md` when done.
</output>
