# Phase 4: Live Integration, All Stores & Hardening - Research

**Researched:** 2026-06-16
**Domain:** GitHub Actions CI/CD (scheduled cron + Pages deploy), GitHub Pages static hosting under a project subpath, PWA subpath correctness, pipeline self-healing/keepalive
**Confidence:** HIGH (action versions, Pages flow, GITHUB_TOKEN trigger behavior verified live this session); MEDIUM on the 60-day keepalive mechanics (see Landmine L-1).

## Summary

Phase 4 adds exactly one greenfield artifact — a single `.github/workflows/*.yml` — plus a one-line `base: '/ColaApp/'` change in `web/vite.config.js` and a small data-copy step. No new product code, no new stores, no new npm packages. The scraper (`npm run scrape`, fault-isolated, all 5 stores, atomic validate-before-write) and the PWA (six states, offline last-data via Workbox StaleWhileRevalidate) already exist and are built subpath-safe. The job is integration + hardening only.

The workflow runs on `schedule:` (2×/day, D-01) and on `push` to the default branch (D-10). Each run: checks out, sets up Node 22, runs the scraper, detects whether `data/` changed, writes a heartbeat timestamp every run (D-04/D-05), commits data+heartbeat back via the built-in `GITHUB_TOKEN`, and — only when `data/` actually changed (D-09) — copies `data/` into the Vite build input, builds with `base:'/ColaApp/'`, and deploys to Pages via the official `actions/upload-pages-artifact` + `actions/deploy-pages` flow (D-06). Failure alerting is GitHub's built-in "workflow failed" email to the repo owner (D-02); silent cron skips are backstopped by the PWA's existing stale indicator (D-03).

**Primary recommendation:** One workflow, two jobs (`scrape-and-commit` → `deploy`), gated by a `data_changed` step output. Pin all five official actions to current major tags (checkout@v6, setup-node@v6, configure-pages@v6, upload-pages-artifact@v5, deploy-pages@v5). Pages source must be set to "GitHub Actions" in repo Settings (manual, one-time). **The one real risk to surface to the user is L-1:** there is strong community evidence that a `GITHUB_TOKEN` bot commit does NOT reliably reset the 60-day inactivity timer — so D-04's heartbeat-commit may not by itself satisfy INFR-03's keepalive goal. A belt-and-suspenders API-based re-enable (or accepting the documented residual risk) should be a planned decision.

> **Repo fact verified this session:** the remote is `github.com/Polarfox-code-inc/ColaApp` (an **organization**, not the personal account `knut_ulf`). The Pages URL is therefore `https://polarfox-code-inc.github.io/ColaApp/` and `base: '/ColaApp/'` is correct. The CONTEXT phrasing "owner / knut_ulf@web.de" refers to the notification recipient, not the URL owner segment.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Scheduled data production (INFR-01) | CI / GitHub Actions | — | Browser can't fetch marktguru (CORS); a server-side scheduled job is the only path |
| Data persistence (committed `data/`) | Git repo (CI commit) | — | "Static file the PWA reads directly" model; no DB |
| Static hosting of shell + data (INFR-02) | CDN / GitHub Pages | — | Free, HTTPS, no local machine |
| Build/transform (Vite + base) | CI / build step | — | Static asset emission with subpath rewriting |
| Offline last-data + fresh-when-online | Browser / Service Worker | CDN | Already implemented; SW StaleWhileRevalidate route on `/data/*` |
| Failure surfacing (INFR-03) | CI (email) + Browser (stale chip) | — | GitHub email for hard failures; in-app stale indicator for silent skips |
| Keepalive (INFR-03) | CI (commit/API activity) | — | Repo activity inside the 60-day window |

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Scheduled scrape runs **2×/day** (~04:00 and ~16:00 UTC), offset from the top of the hour to dodge cron-cluster delays. Exact minute is the planner's discretion.
- **D-02:** Rely on GitHub's **built-in "workflow failed" email** (to `knut_ulf@web.de`) for run failures. No third-party monitor, no new accounts.
- **D-03:** The PWA's **existing stale/last-updated indicator (OFFR-06)** is the human backstop for *silent cron skips* (which GitHub's failure email does NOT catch).
- **D-04:** Every run writes a **heartbeat touch-commit** so the repo always has activity within the 60-day window — even during long no-offer stretches with no data diff.
- **D-05 (constraint for planner):** The heartbeat must bump a **"last successful run"** timestamp (top-level field in `status.json` or a dedicated heartbeat field) **without resetting the per-store `lastUpdated` values**. Side benefit: distinguishes "we checked, no offer" from "we haven't run in days."
- **D-06:** **Single workflow** does scrape → (commit data) → build → deploy, using the official GitHub Pages Actions flow (`actions/upload-pages-artifact` + `actions/deploy-pages`).
- **D-07:** Scraped data served **same-origin** under the Pages subpath (`/ColaApp/data/...`) by copying repo-root `data/` into the Vite build before `vite build`. Keeps the existing Workbox **StaleWhileRevalidate** route on `/data/*.{json,jsonl}` working unchanged (matches on `url.pathname`, subpath-safe).
- **D-08:** Set Vite **`base: '/ColaApp/'`**. `start_url`/`scope` stay relative (`./`).
- **D-09:** **Deploy only when data changed.** Heartbeat-only (no-change) runs still commit the heartbeat (D-04) but skip the deploy.
- **D-10:** Also **redeploy on code push** to the default branch via a normal `push` trigger.
- **D-11:** Production data source = repo-root **`data/`** copied into the build. Dev/local continues to use the `?state=` fixtures under `web/public/data/`.
- **D-12:** Phase 4 **absorbs the deferred 03-05 real-device verification** — install to Android home screen, offline last-data, fresh-when-online, six-state visual check — against the **live HTTPS GitHub Pages URL on the actual phone**. Closes Phase 3's open 03-05 checkpoint.

### Claude's Discretion
- Exact cron minute/offset.
- The conditional "data changed?" detection mechanism.
- Git bot commit identity.
- Workflow `concurrency:` group + `git pull --rebase` to avoid commit races.
- The precise data-copy step.

### Deferred Ideas (OUT OF SCOPE)
- **healthchecks.io dead-man's-switch** — would catch silent cron skips that the failure email misses. Deferred; revisit if silent skips prove a real problem.
- **External cron → `repository_dispatch`** (cron-job.org) — fallback only if GitHub's own cron skips become intolerable.
- **Direct per-store fallback adapter** (e.g. Aldi Süd direct JSON) — v2 **DATA-07**, not Phase 4. marktguru remains the sole source.
- **Tiered staleness escalation (OFFR-07)** and **all-time-low line (HIST-04)** — v2.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **INFR-01** | Offer data is produced by a scheduled GitHub Actions job and committed to the repository | Pattern 1 (workflow scaffold), Pattern 2 (data-changed detection), Pattern 3 (safe self-commit). `schedule:` cron (D-01) + `git commit` via `GITHUB_TOKEN`. |
| **INFR-02** | The PWA and its data are served at zero cost via GitHub Pages, nothing hosted locally | Pattern 5 (official Pages deploy flow), Pattern 6 (`base:'/ColaApp/'` + data-copy), manual checklist (Pages source = "GitHub Actions", repo public). |
| **INFR-03** | Scheduled job stays enabled over time (60-day keepalive) and the full loop runs end-to-end (cron → data → Pages → installed PWA reflects new data) | Pattern 4 (heartbeat write), **Landmine L-1 (keepalive caveat)**, Pattern 7 (full-loop verification, D-12). |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

These have the same authority as locked decisions; research/plans must not contradict them:

- **Free only** — no paid hosting, no paid APIs/tiers. Keep the repo **public** so Actions standard-runner minutes are free and unlimited.
- **Nothing hosted on the author's local machine** — GitHub Actions + GitHub Pages is the chosen path.
- **Native `fetch` / `undici`** in the scraper — **no `axios`, no `node-fetch`** (Node 22 has global fetch).
- **No Playwright/Puppeteer on the happy path** — marktguru returns JSON; a headless browser is forbidden unless forced.
- **`actions/setup-node@v4`+, Node 22 LTS** pinned in the workflow for reproducibility (this research updates the version to current `@v6` — see Standard Stack).
- **Commit only if changed** guard (`git diff --quiet || git commit`) to avoid empty commits — already anticipated by D-09.
- **Add `concurrency:` to the workflow** so only one run commits at a time; `git pull --rebase` before push.
- **Be a good marktguru citizen** — slow cadence (D-01's 2×/day is well within this), sane `User-Agent`, cache the homepage keys, never parallel-hammer. (Key-scrape already implemented in `scraper/fetch.mjs`.)
- **GitHub Pages provides HTTPS** (mandatory for service workers / installability).

## Standard Stack

Phase 4 adds **no new npm packages.** The "stack" is GitHub-hosted Actions and the already-installed Vite toolchain. All versions below were verified live this session against the GitHub releases API and the npm registry.

### Core — GitHub Actions (verified current major + latest)

| Action | Pin (recommended) | Latest release | Purpose | Why standard |
|--------|-------------------|----------------|---------|--------------|
| `actions/checkout` | `@v6` | v6.0.3 | Check out repo (and commit back) | Official; required before reading/committing `data/` `[VERIFIED: GitHub releases API]` |
| `actions/setup-node` | `@v6` | v6.4.0 | Provision Node 22 + npm cache | Official; `node-version: 22`, `cache: npm` `[VERIFIED: GitHub releases API]` |
| `actions/configure-pages` | `@v6` | v6.0.0 | Set up Pages context for the deploy | Official Pages flow `[VERIFIED: GitHub releases API]` |
| `actions/upload-pages-artifact` | `@v5` | v5.0.0 | Package `dist/` as the Pages artifact | Official Pages flow (D-06) `[VERIFIED: GitHub releases API]` |
| `actions/deploy-pages` | `@v5` | v5.0.0 | Deploy the artifact to Pages | Official Pages flow (D-06) `[VERIFIED: GitHub releases API]` |

> **Version note:** CONTEXT/CLAUDE.md reference `actions/setup-node@v4` and the GitHub docs sample shows `deploy-pages@v4`. Those still work, but **v5/v6 are the current majors as of June 2026** `[VERIFIED: GitHub releases API, 2026-06-16]`. Pin to the major tag (e.g. `@v6`) — GitHub's own templates and docs pin to majors, which auto-receive patch/minor security fixes. SHA-pinning is an option for stricter supply-chain hygiene but is heavier maintenance for a solo hobby repo; major-tag pinning is the proportionate choice here.

### Supporting — already installed (no install action needed)

| Library | Installed version | Purpose | When used in Phase 4 |
|---------|-------------------|---------|----------------------|
| `vite` | `^7` (project pins 7 deliberately; **8.0.16 exists but is intentionally not used**) | Build the PWA shell with `base` | `npm run build` step `[VERIFIED: web/package.json + npm view]` |
| `vite-plugin-pwa` | `1.3.0` | Manifest + Workbox SW; auto-prepends Vite `base` to SW/manifest registration | No config change beyond `base` (Pattern 6) `[VERIFIED: web/package.json]` |
| `uplot` | `^1.6.32` | Chart (unchanged) | Bundled by the build only `[VERIFIED]` |
| `zod` | `^3.25.76` (scraper); registry latest is 4.4.3 | Validate before write (unchanged) | Used inside `npm run scrape` `[VERIFIED: npm view]` |

**Installation:** None for Phase 4 product code. In CI, `actions/setup-node@v6` + `npm ci` (root for the scraper, `web/` for the build) is the only "install."

### Alternatives Considered

| Instead of | Could use | Tradeoff |
|------------|-----------|----------|
| Single workflow, two jobs | Two separate workflows (scrape; deploy) | Splits the source of truth (violates D-06); harder to gate deploy on the scrape's data diff via job outputs. Keep one workflow. |
| `GITHUB_TOKEN` self-commit | PAT / deploy key / GitHub App token | A PAT would let the self-commit re-trigger the `push` workflow (forming an auto-deploy loop) AND more reliably reset the 60-day timer — but adds a secret + rotation burden, contradicting "no new accounts/secrets" (D-02 spirit). Default to `GITHUB_TOKEN`; see L-1 for the keepalive nuance. |
| `git diff --quiet` data detection | `dorny/paths-filter` or comparing hashes | Built-in `git` is zero-dependency and exactly fits "did `data/` change after the scrape." No third-party action needed. |
| Heartbeat in a dedicated `heartbeat.json` | Heartbeat as a top-level field in `status.json` | `status.json` is already schema-validated (`.strict()`) and re-read by the PWA each load; a top-level field is convenient for the footer/freshness logic but **requires a schema change** (see Pattern 4 / Landmine L-3). A separate `data/heartbeat.json` (or `.github/keepalive` marker) avoids touching the frozen contract. Planner must choose — both are documented below. |

## Package Legitimacy Audit

> Phase 4 installs **no new packages.** All five workflow actions are first-party `actions/*` (GitHub-published, the canonical Pages flow). All npm packages are pre-existing and already in `package.json`/`web/package.json`.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `actions/checkout@v6` | GitHub Actions | years | first-party | github.com/actions/checkout | OK | Approved (existing GitHub-official) |
| `actions/setup-node@v6` | GitHub Actions | years | first-party | github.com/actions/setup-node | OK | Approved |
| `actions/configure-pages@v6` | GitHub Actions | years | first-party | github.com/actions/configure-pages | OK | Approved |
| `actions/upload-pages-artifact@v5` | GitHub Actions | years | first-party | github.com/actions/upload-pages-artifact | OK | Approved |
| `actions/deploy-pages@v5` | GitHub Actions | years | first-party | github.com/actions/deploy-pages | OK | Approved |
| `vite` / `vite-plugin-pwa` / `uplot` / `zod` | npm | mature | very high | (official) | OK | Pre-existing, already installed |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.

> The `gsd-tools query package-legitimacy check` seam is not available in this runtime (command not registered). Verification was done directly: all five actions are under the GitHub-owned `actions/` org (confirmed via the releases API this session); all npm packages were confirmed via `npm view` and are already declared and installed in the repo. No third-party keepalive action is *recommended for install* — the keepalive can be done with built-in `git`/`gh` (see L-1) to honor "no new accounts/dependencies."

## Architecture Patterns

### System Architecture Diagram

```
        ┌─────────────────────────── GitHub Actions (free, public repo) ───────────────────────────┐
        │                                                                                            │
 schedule: cron ──┐                                                                                  │
 (04:0X & 16:0X   ├──► JOB A: scrape-and-commit (concurrency: cola-pipeline, cancel-in-progress:false)│
   UTC, D-01)     │      1. actions/checkout@v6                                                       │
                  │      2. actions/setup-node@v6 (node 22, cache npm)                                │
 push: default ───┘      3. npm ci  →  npm run scrape   ── marktguru JSON API (native fetch) ◄───────┼── api.marktguru.de
 branch (D-10)           4. write heartbeat timestamp (D-04/D-05)  ─► data/ (status.json or heartbeat)│
   │                     5. STEP OUTPUT data_changed = (git diff --quiet -- data/ ? "false":"true")  │
   │                     6. git pull --rebase ; git add data/ ; git commit ; git push  (GITHUB_TOKEN)│
   │                            └─ commits ALWAYS (heartbeat ⇒ ≥1 change/run)  ──► repo data/ history │
   │                                                                                                  │
   │                  JOB B: deploy   needs: A   if: A.outputs.data_changed=='true' OR event==push    │
   │                     1. actions/checkout@v6  (gets the just-pushed data/ on schedule path)        │
   │                     2. setup-node ; (root npm ci for contract) ; cd web ; npm ci                 │
   │                     3. COPY repo-root data/  ──►  web/public/data/  (prod files, D-07/D-11)      │
   │                     4. npm run build  (base:'/ColaApp/')  ──► web/dist/ (+ sw.js + manifest)     │
   │                     5. actions/configure-pages@v6                                                │
   │                     6. actions/upload-pages-artifact@v5  (path: web/dist)                        │
        │                7. actions/deploy-pages@v5  ─────────────────────────────────┐               │
        └──────────────────────────────────────────────────────────────────────────┼───────────────┘
                                                                                     ▼
                                                              GitHub Pages CDN  https://polarfox-code-inc.github.io/ColaApp/
                                                                                     │  HTTPS
                                                                                     ▼
              Android home-screen PWA ──fetch('./data/…') ⇒ /ColaApp/data/… ──► Workbox SW
                 (StaleWhileRevalidate: instant cached copy offline; bg-refresh when online)
```

GITHUB_TOKEN-pushed commit on the schedule path does **not** re-trigger the `push` workflow (verified — no infinite loop), which is why Job B must run within the same workflow rather than relying on the self-commit to fire a new run.

### Recommended Project Structure (additions only)

```
.github/
└── workflows/
    └── pipeline.yml      # the single scrape→commit→build→deploy workflow (greenfield)
web/
└── vite.config.js        # + base: '/ColaApp/'  (one-line change, D-08)
data/                     # (existing) repo-root prod data — copied into the build (D-07/D-11)
```

### Pattern 1: Single workflow, two jobs, dual trigger

```yaml
# .github/workflows/pipeline.yml
name: pipeline
on:
  schedule:
    - cron: "7 4 * * *"     # ~04:07 UTC (offset off the hour — D-01)
    - cron: "23 16 * * *"   # ~16:23 UTC
  push:
    branches: [master]       # default branch — D-10
  workflow_dispatch: {}      # manual run for first-deploy / debugging

# Least-privilege at the top; per-job permissions tighten further.
permissions:
  contents: write            # commit data/heartbeat back (Job A)

concurrency:
  group: cola-pipeline       # only one pipeline at a time — avoids commit races (CLAUDE.md)
  cancel-in-progress: false  # let an in-flight deploy finish; never cancel a half-deploy

jobs:
  scrape-and-commit:
    runs-on: ubuntu-latest
    outputs:
      data_changed: ${{ steps.diff.outputs.data_changed }}
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - name: Scrape (fault-isolated; exits 0 on per-store errors)
        run: npm run scrape
      - name: Heartbeat (bump last-run WITHOUT touching per-store lastUpdated)
        run: node scripts/heartbeat.mjs   # see Pattern 4 / D-04 / D-05
      - name: Detect data change
        id: diff
        run: |
          if git diff --quiet -- data/; then
            echo "data_changed=false" >> "$GITHUB_OUTPUT"
          else
            echo "data_changed=true"  >> "$GITHUB_OUTPUT"
          fi
      - name: Commit data + heartbeat (always — heartbeat guarantees a diff)
        run: |
          git config user.name  "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add data/
          # Commit only if there is something staged (heartbeat normally guarantees it).
          if git diff --cached --quiet; then
            echo "nothing to commit"; exit 0
          fi
          git commit -m "chore(data): scheduled scrape + heartbeat [skip ci]"
          git pull --rebase --autostash origin "${GITHUB_REF_NAME}"
          git push origin "HEAD:${GITHUB_REF_NAME}"

  deploy:
    needs: scrape-and-commit
    # Deploy when data changed (D-09) OR when this run was a code push (D-10).
    if: ${{ needs.scrape-and-commit.outputs.data_changed == 'true' || github.event_name == 'push' }}
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
      contents: read
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v6          # gets the just-pushed data/ (schedule path)
      - uses: actions/setup-node@v6
        with: { node-version: 22, cache: npm }
      - run: npm ci                        # root: makes ../contract resolvable for the build
      - name: Copy prod data into the build input (D-07/D-11)
        run: |
          mkdir -p web/public/data
          cp data/current-offers.json data/status.json data/price-history.jsonl web/public/data/
      - name: Build PWA (base:'/ColaApp/')
        working-directory: web
        run: |
          npm ci
          npm run build
      - uses: actions/configure-pages@v6
      - uses: actions/upload-pages-artifact@v5
        with:
          path: web/dist
      - id: deployment
        uses: actions/deploy-pages@v5
```

**What:** the canonical end-to-end pipeline.
**When to use:** this is the phase. `[CITED: github.com/actions/deploy-pages README]` `[VERIFIED: action versions via releases API]`

> **`[skip ci]` is belt-and-suspenders, not the primary loop guard.** The primary guard is that **`GITHUB_TOKEN`-pushed commits don't trigger any workflow** (verified below). `[skip ci]` is harmless insurance and also documents intent in the log.

### Pattern 2: "Did the data change?" via `git diff --quiet`

`git diff --quiet -- data/` exits **0** if there's no change, **1** if there is. Capture it into a step output **before** the heartbeat or capture it on the scraped data only — order matters (see Landmine L-2). Because the heartbeat (D-04) writes every run, *something* in `data/` always changes; the `data_changed` flag must therefore reflect the **scraper's** output specifically, not the heartbeat. Two clean designs:

- **(A) Diff before heartbeat:** run scraper → `git diff --quiet -- data/` (this is "did the scrape change anything?") → set `data_changed` → then write the heartbeat → then commit everything. This is the recommended order (shown in Pattern 1 if the heartbeat step is moved after the diff step).
- **(B) Diff excluding the heartbeat file:** if the heartbeat lives in its own file (`data/heartbeat.json`), diff with a pathspec exclusion: `git diff --quiet -- data/ ':!data/heartbeat.json'`.

`[ASSUMED]` (standard git semantics; the exact step ordering is the planner's to lock).

### Pattern 3: Safe self-commit from inside the deploying workflow

- **Bot identity:** use the canonical `github-actions[bot]` identity (name + the `41898282+github-actions[bot]@users.noreply.github.com` no-reply email). No secret needed — `GITHUB_TOKEN` is auto-provisioned and `actions/checkout@v6` configures it for push when `permissions: contents: write`. `[CITED: docs.github.com GITHUB_TOKEN]`
- **Race avoidance:** `concurrency.group` (one pipeline at a time) is the primary defense against overlapping scheduled runs colliding on the commit; `cancel-in-progress: false` so a deploy is never half-killed. As a second layer, `git pull --rebase --autostash` before `git push` handles the rare case where a human pushed between checkout and push. `[VERIFIED: CLAUDE.md guidance + standard git]`
- **No infinite loop:** **a commit pushed with `GITHUB_TOKEN` does NOT create a new workflow run** — GitHub blocks this specifically to prevent recursive runs (`workflow_dispatch`/`repository_dispatch` are the only exceptions). So the schedule-path self-commit will not fire the `push` trigger. `[VERIFIED: docs.github.com GITHUB_TOKEN — "events triggered by GITHUB_TOKEN will not create a new workflow run"]`

### Pattern 4: Heartbeat write satisfying D-04/D-05

The heartbeat must bump a "last successful run" timestamp **without** touching per-store `lastUpdated`. Two viable homes:

- **Option A — dedicated `data/heartbeat.json` (recommended; no contract change):**
  ```js
  // scripts/heartbeat.mjs  (run as a workflow step AFTER npm run scrape)
  import { writeFile } from "node:fs/promises";
  await writeFile(
    new URL("../data/heartbeat.json", import.meta.url),
    JSON.stringify({ lastRun: new Date().toISOString() }, null, 2) + "\n"
  );
  ```
  - Pros: zero change to the frozen `contract/schema.mjs`; cannot accidentally fail validation; trivially diffable; the PWA can optionally fetch it for the footer to distinguish "checked, no offer" vs "haven't run in days" (D-05 side benefit). It also guarantees a `data/` diff every run (so the commit step always has content → keepalive activity).
  - Cons: a new file the PWA isn't reading yet (footer enhancement is optional, out of strict Phase 4 scope unless wanted).
- **Option B — top-level field in `status.json`:** add e.g. `lastSuccessfulRun` as a top-level field. **Requires editing `contract/schema.mjs`** (`StatusFileSchema` is `.strict()`, so an unknown top-level key is rejected) and re-running the contract tests. The existing `status.json.lastUpdated` already bumps every run in `merge.mjs`, so even a separate field is somewhat redundant; the per-store `lastUpdated` values (the thing D-05 protects) live one level down in `stores[]` and are **already correctly carried-forward/frozen** by `merge.mjs` (warm-error path freezes them; refresh bumps them). The heartbeat must NOT write into `stores[].lastUpdated`.

**Where it runs:** as a **separate workflow step** (`node scripts/heartbeat.mjs`), NOT inside `scraper/index.mjs`. Reasons: (1) keeps the scraper's atomic validate-before-write path untouched; (2) the heartbeat must fire even when the scraper *throws* (validation drift hard-stop) so the repo still gets activity — but note that on a hard scraper failure the job will exit non-zero and email the owner anyway (D-02), and a failed run may not reach the heartbeat step. If keepalive-on-failure matters, run the heartbeat step with `if: always()` after the scrape step. `[ASSUMED — design recommendation; planner locks the home + the if: always() decision]`

**Critical D-05 invariant for the planner/verifier:** confirm via inspection that the heartbeat writes a *top-level/separate* timestamp and never mutates `current-offers.json.stores[].*` or `status.json.stores[].lastUpdated`. A test asserting per-store `lastUpdated` is unchanged by the heartbeat would lock this.

### Pattern 5: Official GitHub Pages deploy flow (build/deploy split)

The artifact-based flow (not the legacy `gh-pages` branch) is the current standard: `configure-pages` → build → `upload-pages-artifact` (path = `web/dist`) → `deploy-pages` with `permissions: pages: write, id-token: write` and `environment: github-pages`. `[CITED: github.com/actions/deploy-pages README]` `[VERIFIED: versions]`

### Pattern 6: `base: '/ColaApp/'` + data-copy (D-07/D-08/D-11)

```js
// web/vite.config.js — the ONLY product-code change in Phase 4
export default defineConfig({
  base: '/ColaApp/',          // <-- add this (D-08). Everything else stays.
  // ...existing server.fs.allow, VitePWA config unchanged...
});
```

- `vite-plugin-pwa` **automatically prepends Vite's `base`** to the generated `sw.js`/`registerSW.js`/`manifest.webmanifest` registration URLs — so setting `base` is sufficient for SW + manifest registration. `[CITED: vite-pwa-org docs + plugin issue #4 "Support base path from vite config"]`
- The manifest's `start_url: './'` and `scope: './'` are already **relative** — correct and subpath-safe (do NOT change them to absolute). `[VERIFIED: web/vite.config.js]`
- The manifest **icon `src`** values are already bare relative (`icon-192.png`, no leading slash) — this matters because there's a known plugin issue (#713) where icon `src` does NOT get `base` auto-prepended; a leading-slash `/icon-192.png` would break under the subpath. The existing relative srcs resolve relative to the manifest location (`/ColaApp/`) and are correct. **Verifier check: confirm icons resolve at `/ColaApp/icon-*.png` in the built `dist/`.** `[CITED: plugin issue #713]`
- **Data-copy:** `cp` the three repo-root `data/` files into `web/public/data/` **in the deploy job before `npm run build`** (Pattern 1 step 3). Vite copies `public/` verbatim into `dist/`, landing them at `dist/data/*` → served at `/ColaApp/data/*`. This is the production path (D-11); it overwrites/sits alongside the dev `?state=` fixtures (which keep their `*.offer.json` etc. suffixes, so no name collision with the three live files). The SW route `/\/data\/.*\.(json|jsonl)$/` matches on `url.pathname` → works unchanged under the subpath. `[VERIFIED: web/vite.config.js runtimeCaching + load.js DEFAULT_BASE='./data/']`
- **Runtime fetch subtlety (verifier note):** `web/src/data/load.js` fetches `./data/...` (relative). Vite's `base` rewrites *asset* URLs at build time but does NOT rewrite runtime `fetch('./data/...')` strings — relative fetch resolves against `document.baseURI`, which for the page served at `/ColaApp/` is `/ColaApp/`, so `./data/current-offers.json` correctly resolves to `/ColaApp/data/current-offers.json`. This is why D-07 works without code changes. **Confirm `index.html` has no `<base href>` override that would shift `document.baseURI`.** `[VERIFIED: load.js + relative-URL semantics]`

### Pattern 7: Full-loop verification (D-12)

See the dedicated **Verification Procedure** section below. `[VERIFIED: extends web/README.md]`

### Anti-Patterns to Avoid

- **Two workflows (one to scrape, one to deploy)** — violates D-06's single-source-of-truth and breaks the `data_changed` job-output gating.
- **Using a PAT for the self-commit "to be safe"** — adds a secret/rotation burden against the no-new-accounts spirit, AND would make the self-commit re-trigger the `push` workflow → redundant double-deploy. Only consider a PAT if L-1's keepalive risk is deemed unacceptable.
- **Setting `start_url`/`scope`/icon `src` to absolute paths** — breaks under the `/ColaApp/` subpath. Keep them relative.
- **Writing the heartbeat into `stores[].lastUpdated`** — defeats OFFR-06/D-05 (a stale store would look fresh).
- **`cancel-in-progress: true`** — could kill a half-finished Pages deploy. Use `false`.
- **Legacy `peaceiris/actions-gh-pages` / pushing to a `gh-pages` branch** — superseded by the official artifact flow and would conflict with "Pages source = GitHub Actions."

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---------|-------------|-------------|-----|
| Deploy static site to Pages | Custom `gh-pages` branch push + git plumbing | `configure-pages`+`upload-pages-artifact`+`deploy-pages` | Official flow handles artifact signing, environment, `id-token` OIDC, URL output |
| "Did files change?" | Custom hashing/manifest of `data/` | `git diff --quiet -- data/` | Git already tracks exactly this; zero deps |
| Bot commit identity/auth | Generating/storing a PAT | `GITHUB_TOKEN` + `github-actions[bot]` | Auto-provisioned, scoped, no secret, no rotation, no recursive-trigger |
| SW/manifest subpath rewriting | Manually templating base into sw.js | Vite `base` (auto-applied by vite-plugin-pwa) | Plugin already prepends base to registration |
| Cron reliability monitoring | Polling/alerting infra | GitHub failure email (D-02) + in-app stale chip (D-03) | Free, zero new accounts (healthchecks.io deferred) |

**Key insight:** Phase 4 is almost entirely *assembly of first-party primitives*. The only place hand-rolling is even tempting — the keepalive — is exactly where a tiny `gh`/git step (or accepting documented risk) beats adding a third-party action, per the project's no-new-deps constraint.

## Runtime State Inventory

> Phase 4 is integration, not a rename/refactor — but it DOES introduce new runtime/CI/hosting state. Included for completeness.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Repo-root `data/{current-offers.json, status.json, price-history.jsonl}` already exist (committed). Phase 4 adds the heartbeat (`data/heartbeat.json` or a `status.json` field). | New: heartbeat file/field + the CI commit that maintains it. |
| Live service config | **GitHub repo Settings → Pages source = "GitHub Actions"** (not a file, not in git). **Repo must stay public** (free unlimited Actions + free Pages). The `github-pages` deployment environment is auto-created on first deploy. | Manual one-time settings (see checklist). |
| OS-registered state | None (no local machine, no scheduler). The cron lives in the committed workflow YAML. | None — verified: nothing runs locally (PROJECT constraint). |
| Secrets/env vars | **None new.** `GITHUB_TOKEN` is auto-injected; no marktguru keys are stored (the scraper scrapes them from the homepage at runtime — `scraper/fetch.mjs`). | None — verified: no secrets to add. |
| Build artifacts | `web/dist/` (CI-only, gitignored output); `web/public/data/` receives copied prod files during the deploy job (ephemeral in CI; locally it holds the `?state=` fixtures — do not commit the copied live files over them). | Ensure the CI copy step doesn't get committed back into `web/public/data/` (it runs in the deploy job which doesn't push). |

## Common Pitfalls

### Pitfall 1: GITHUB_TOKEN commit does not re-trigger `push` → deploy must be in-job
**What goes wrong:** Expecting the schedule-path self-commit to fire the `push` trigger and deploy "for free." It won't.
**Why:** GitHub suppresses workflow triggers from `GITHUB_TOKEN` events to prevent recursion. `[VERIFIED]`
**How to avoid:** Deploy within the same run (Pattern 1 Job B), gated on `data_changed`. (This is exactly D-06/D-09.)
**Warning signs:** Data commits land but Pages never updates on scheduled runs.

### Pitfall 2: Heartbeat makes every run look "changed"
**What goes wrong:** If `data_changed` is computed *after* the heartbeat write, it's always true → deploy fires on every no-offer run (~2/day), defeating D-09.
**How to avoid:** Compute the data-change diff on the scraper's output *before* the heartbeat, or exclude the heartbeat file from the diff pathspec (Pattern 2).
**Warning signs:** A redeploy on every scheduled run even with no offer change.

### Pitfall 3: First-deploy chicken-and-egg (Pages not yet enabled)
**What goes wrong:** `deploy-pages` fails on the very first run with "Pages not enabled" / "environment protection rules" if the repo Settings → Pages source wasn't set to "GitHub Actions" first.
**How to avoid:** Do the manual settings step (checklist) before the first workflow run; use `workflow_dispatch` to trigger the first deploy on demand.
**Warning signs:** First `deploy-pages` step errors about an enablement or environment.

### Pitfall 4: `concurrency` cancelling a deploy
**What goes wrong:** Overlapping scheduled + push runs; `cancel-in-progress: true` kills a half-finished deploy.
**How to avoid:** `cancel-in-progress: false` and one shared `group`.
**Warning signs:** Sporadic "deployment cancelled" / partial Pages updates.

### Pitfall 5: Cron lateness/skips read as "broken"
**What goes wrong:** `schedule:` runs 10–30 min late or occasionally skip under load; treating this as a bug.
**How to avoid:** Expected behavior (CLAUDE.md). 2×/day (D-01) tolerates it; the in-app stale chip (D-03) surfaces a genuinely long gap. Offset minutes off the hour (D-01).
**Warning signs:** Runs not starting exactly on the minute — normal, not a defect.

### Pitfall 6: Stale `git push` race between overlapping runs
**What goes wrong:** Two runs check out, both try to push → non-fast-forward rejection.
**How to avoid:** `concurrency` serializes; `git pull --rebase --autostash` before push as backup.
**Warning signs:** `! [rejected] ... (fetch first)` in the push step.

## Code Examples

### Verified Pages deploy job skeleton
```yaml
# Source: github.com/actions/deploy-pages README (versions verified via releases API 2026-06-16)
permissions:
  pages: write
  id-token: write
environment:
  name: github-pages
  url: ${{ steps.deployment.outputs.page_url }}
steps:
  - uses: actions/configure-pages@v6
  - uses: actions/upload-pages-artifact@v5
    with: { path: web/dist }
  - id: deployment
    uses: actions/deploy-pages@v5
```

### Data-change gate via step output
```bash
# Source: standard git semantics (--quiet ⇒ exit 1 on diff)
if git diff --quiet -- data/ ':!data/heartbeat.json'; then
  echo "data_changed=false" >> "$GITHUB_OUTPUT"
else
  echo "data_changed=true"  >> "$GITHUB_OUTPUT"
fi
```

## State of the Art

| Old approach | Current approach | When changed | Impact |
|--------------|------------------|--------------|--------|
| Push to `gh-pages` branch (`peaceiris`/`gh-pages`) | Artifact flow: `upload-pages-artifact` + `deploy-pages` + "Source: GitHub Actions" | 2022+ (now default) | Use the artifact flow; D-06 already specifies it |
| `actions/checkout@v3/v4`, `setup-node@v4`, `deploy-pages@v4` | `checkout@v6`, `setup-node@v6`, `configure-pages@v6`, `upload-pages-artifact@v5`, `deploy-pages@v5` | majors bumped through 2025–2026 | Pin to the new majors `[VERIFIED 2026-06-16]` |
| Keepalive via dummy commit (keepalive-workflow v1) | API-based re-enable (v2) because bot commits don't reliably reset the timer | ~2023+ | Directly informs Landmine L-1 |

**Deprecated/outdated:**
- `actions/setup-node@v4` (CLAUDE.md) and `deploy-pages@v4` (GitHub docs sample) — still functional but behind current majors.

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|-------|---------|---------------|
| A1 | Step ordering (diff-before-heartbeat) is the planner's to lock; both orderings work | Pattern 2/4 | Low — either documented variant is correct |
| A2 | Heartbeat belongs in a separate step (optionally `if: always()`), not inside the scraper | Pattern 4 | Medium — if it must reset the timer *on failed runs*, placement matters (see L-1) |
| A3 | Default branch is `master` (matches current git status); workflow `branches:`/push target must match | Pattern 1 | Low — verifiable; adjust if the repo's default differs |
| A4 | Manifest icon relative `src` resolves correctly at `/ColaApp/icon-*.png` (no base-prepend needed) | Pattern 6 | Low-Medium — verify in built `dist/` (plugin issue #713) |
| A5 | `index.html` has no `<base href>` that would shift `document.baseURI` away from `/ColaApp/` | Pattern 6 | Low — one-line check |

## Open Questions

1. **Does a `GITHUB_TOKEN` heartbeat commit actually reset the 60-day timer? (the INFR-03 crux — see Landmine L-1)**
   - What we know: GitHub disables scheduled workflows after 60 days of no *activity*; "any commit to the default branch resyncs" is the documented cure. `[VERIFIED]`
   - What's unclear: Multiple community sources (and the keepalive-workflow project's pivot from commit-mode to API-mode) strongly suggest **bot commits via `GITHUB_TOKEN` do NOT reliably count as the activity that resets the timer.** GitHub has no crisp official statement either way. `[MEDIUM confidence]`
   - Recommendation: surface to the user. Cheapest robust mitigation that honors "no new accounts": a tiny `gh api` / `gh workflow enable` step (or the API-mode keepalive) on a periodic basis, OR accept the documented residual risk (the failure email + the in-app stale chip would catch a disabled job within days of the maintainer next opening the app, and re-enabling is a single click). The planner should make this an explicit decision, possibly a `checkpoint:human-verify`.

2. **Heartbeat home: `status.json` field (contract change) vs `data/heartbeat.json` (no contract change)?**
   - Recommendation: default to `data/heartbeat.json` (Option A) unless the user wants the footer to consume it (then a `status.json` top-level field + a contract bump is cleaner for the PWA). Lock in discuss/plan.

3. **Should the heartbeat run `if: always()` so a failed scrape still produces keepalive activity?**
   - Recommendation: yes if keepalive robustness is prioritized; but a failed scrape exits non-zero → the job fails → owner is emailed (D-02) → human intervention resets the timer anyway. Low stakes; planner's call.

## Environment Availability

| Dependency | Required by | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| GitHub Actions (public repo, standard runners) | INFR-01 scheduled scrape | ✓ (repo is on github.com/Polarfox-code-inc) | n/a | none needed (free/unlimited on public) |
| GitHub Pages | INFR-02 hosting | ✓ (enable via Settings) | n/a | netcup (fallback only, PROJECT) |
| Node 22 in CI | scraper + build | ✓ via `setup-node@v6` | 22 LTS | none |
| `git` / `gh` in runner | self-commit / optional keepalive | ✓ (preinstalled on `ubuntu-latest`) | current | none |
| marktguru API reachable from CI IPs | scrape | ✓ (assumed; same JSON path as the proven spike) | n/a | "no offer"/error states already handled by fault isolation |
| Repo is **public** | free unlimited Actions + free Pages | **VERIFY** | n/a | — |

**Missing dependencies with no fallback:** none identified.
**Manual prerequisites (not code) — see checklist below.**

## Manual Maintainer Checklist (non-code prerequisites)

Do these once, before the first scheduled run (use `workflow_dispatch` to trigger the first deploy):

1. **Repo visibility = Public** — Settings → General → Danger Zone. Required for free unlimited Actions minutes and free Pages. (Verify current state.)
2. **Pages source = GitHub Actions** — Settings → Pages → "Build and deployment" → Source → **GitHub Actions**. (Not "Deploy from a branch.") This is the chicken-and-egg fix for Pitfall 3.
3. **Actions enabled & default `GITHUB_TOKEN` workflow permissions = Read and write** — Settings → Actions → General → "Workflow permissions" → **Read and write permissions** (so the self-commit can push). The workflow's own `permissions:` block further scopes per job.
4. **Notifications** — ensure the owner account (`knut_ulf@web.de`) has "Actions: failed workflows" email notifications on (default on) so D-02 works.
5. **Confirm default branch name** — the workflow's `push.branches` and push target must match (currently `master`).
6. **(Optional, L-1) Decide keepalive hardening** — accept residual risk, or add a periodic `gh`/API re-enable step.

## Verification Procedure (D-12 — closes Phase 3's 03-05 checkpoint)

Extends `web/README.md`'s localhost procedure to the **live** Pages URL `https://polarfox-code-inc.github.io/ColaApp/` on the real Android phone. Run after the first successful deploy.

1. **Loop proof (success-criterion 3 / INFR-03):** Trigger the workflow (`workflow_dispatch` or wait for cron). Confirm: Actions run green → a `chore(data): ...` commit appears on the default branch → the `deploy` job ran (gated correctly) → the live URL serves the new `current-offers.json` (check the footer "last updated").
2. **INSTALL (PWA-01):** Open the live URL in **Android Chrome** → "Add to home screen." Confirm name **ColaApp**, the trademark-safe bottle icon on `#1A1D21` (not Coca-Cola red), maskable not clipped, opens standalone (no browser chrome).
3. **OFFLINE LAST-DATA (PWA-02):** With the installed app loaded once, enable airplane mode, reopen. Confirm hero/cards/graph/footer all render last-fetched data — not an offline error page.
4. **FRESH-WHEN-ONLINE (PWA-03):** Back online, after the next scrape that changes data (or force one), reopen the installed app twice. Confirm the new price appears (StaleWhileRevalidate revalidated). Confirm the data fetched from `/ColaApp/data/...` (DevTools/remote-debug Network if needed).
5. **SIX STATES:** On the phone, visit `…/ColaApp/?state=offer|no_offer|upcoming|error|stale|unavailable` and confirm each renders per `web/README.md`'s table. (These fixtures ship in `dist/data/*` from `web/public/data/`.)
6. **Localisation:** German throughout; `de-DE` formatting (`€9,99`, `0,83 €/l`, `21.06.2026`).
7. **Subpath sanity:** Confirm the SW registered under `/ColaApp/` (Application → Service Workers), the manifest loaded, and icons resolved at `/ColaApp/icon-*.png` (no 404s — guards Pattern 6 / A4).
8. **Fault isolation live (success-criterion 4):** Confirm all five stores present; Wasgau shows "nicht automatisch verfügbar"; a single store error doesn't blank the others.

When 1–8 pass, mark Phase 3's `03-05` checkpoint closed (D-12) and INFR-01/02/03 satisfied.

## Landmines

- **L-1 (highest) — keepalive may not actually keep alive.** Bot `GITHUB_TOKEN` commits very likely do **not** reset the 60-day scheduled-workflow inactivity timer (community-corroborated; the canonical keepalive action abandoned commit-mode for API-mode for this exact reason). D-04's heartbeat-commit guarantees *repo content activity* but possibly not *scheduled-trigger reactivation*. **Action:** treat as an explicit user decision (Open Q1). Cheapest honoring-of-constraints mitigation: a periodic `gh workflow enable`/API touch, or accept that a disabled job surfaces via the stale chip + the one-click re-enable. `[MEDIUM]`
- **L-2 — heartbeat vs data_changed ordering** (Pitfall 2): get the diff order right or D-09 is defeated.
- **L-3 — `status.json` is `.strict()`** (Pattern 4 Option B): adding a top-level heartbeat field there is a frozen-contract change that breaks validation + tests unless `schema.mjs` is updated. Prefer the separate file to avoid touching the contract.
- **L-4 — first-deploy enablement** (Pitfall 3): set Pages source before the first run.
- **L-5 — `GITHUB_TOKEN` write permission** must be enabled at the repo level (checklist item 3) or the self-commit push 403s.
- **L-6 — marktguru key-scrape in CI**: the scraper fetches a `User-Agent`-bearing homepage to extract `x-apikey`/`x-clientkey` at runtime (already implemented, `scraper/fetch.mjs`). Confirm it runs cleanly headless on `ubuntu-latest`; a total fetch failure is already handled (all marktguru stores → error, run still exits 0, last-known data preserved). No browser needed — keep it that way (CLAUDE.md).
- **L-7 — empty/heartbeat-only deploy**: D-09 already prevents this — the `if:` gate skips the deploy job on heartbeat-only runs; only the commit happens.

## Security Domain

> `security_enforcement: true`, ASVS level 1. This phase is CI/CD + static hosting; the threat surface is supply-chain and CI-token handling, not app input.

### Applicable ASVS Categories

| ASVS category | Applies | Standard control |
|---------------|---------|------------------|
| V1 Architecture | yes | Least-privilege workflow `permissions:` (top-level `contents: write`; deploy job adds `pages: write`/`id-token: write`, drops to `contents: read`) |
| V2 Authentication | no | No app auth (single-user static PWA) |
| V5 Input Validation | partial | Scraper already validates marktguru JSON via `contract/schema.mjs` before write (unchanged); PWA validate-but-degrade in `load.js` |
| V6 Cryptography | n/a (consumed) | HTTPS provided by Pages; OIDC `id-token` for deploy attestation — never hand-rolled |
| V10 Malicious Code / supply chain | yes | Pin actions to majors (or SHAs); only first-party `actions/*`; `npm ci` (lockfile-exact); no new deps |
| V14 Configuration | yes | No secrets added; `GITHUB_TOKEN` least-privilege; marktguru keys never logged (existing T-02-10 guard); `[skip ci]` + GITHUB_TOKEN no-recursion |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard mitigation |
|---------|--------|---------------------|
| Compromised/typo-squatted third-party action | Tampering/Elevation | Use only first-party `actions/*`; pin to major (or SHA); add no third-party keepalive action |
| Over-privileged `GITHUB_TOKEN` | Elevation | Scope `permissions:` per job to the minimum; default repo token to read+write only because the self-commit needs it |
| Recursive workflow trigger / runaway minutes | DoS | `GITHUB_TOKEN` commits don't re-trigger (verified) + `[skip ci]` + `concurrency` |
| Secret leakage in logs | Info disclosure | No new secrets; scraper already logs `err.message` only and never the marktguru keys (T-02-10) |
| Corrupt/half-written `data/` committed | Tampering/Integrity | Scraper's atomic temp+rename + validate-before-write preserved; CI commits whole files only |

## Sources

### Primary (HIGH confidence)
- GitHub releases API (queried 2026-06-16) — current action versions: checkout v6.0.3, setup-node v6.4.0, configure-pages v6.0.0, upload-pages-artifact v5.0.0, deploy-pages v5.0.0.
- `github.com/actions/deploy-pages` README — official Pages deploy flow, permissions, environment, concurrency.
- `docs.github.com` GITHUB_TOKEN — "events triggered by GITHUB_TOKEN will not create a new workflow run" (recursion prevention; exceptions = workflow_dispatch/repository_dispatch).
- Repo inspection — remote `Polarfox-code-inc/ColaApp`, default branch `master`, existing `data/`, `web/public/data/` fixtures, `scraper/*`, `contract/schema.mjs`, `web/vite.config.js`, `web/src/data/load.js`, `web/README.md`.
- npm registry (`npm view`) — zod 4.4.3 (project uses ^3.25.76), vite 8.0.16 (project pins ^7), vite-plugin-pwa 1.3.0.

### Secondary (MEDIUM confidence)
- GitHub community discussions #86087, #32197, #25702 + keepalive-workflow marketplace page — 60-day inactivity disable; strong indication that `GITHUB_TOKEN` commits don't reliably reset the timer (commit-mode → API-mode pivot). Basis for Landmine L-1 / Open Q1.
- vite-pwa-org docs + plugin issues #4, #263, #713 — `base` auto-applied to SW/manifest registration; icon `src` base-prepend caveat.
- CLAUDE.md — marktguru integration notes, GitHub Actions free-tier/cron caveats table, PWA installability notes (corroborated against live sources).

### Tertiary (LOW confidence)
- Step-ordering and `if: always()` heartbeat placement — design recommendations (`[ASSUMED]`), to be locked by the planner.

## Metadata

**Confidence breakdown:**
- Action versions + Pages flow: HIGH — verified live via releases API and the official README.
- Self-commit / no-recursion / data-gating: HIGH — verified via GitHub docs + standard git.
- `base`/subpath/SW correctness: HIGH on mechanism (existing code is already subpath-safe by design), MEDIUM on the icon base-prepend edge (verify in built `dist/`).
- 60-day keepalive (D-04 efficacy): MEDIUM — community-corroborated caveat, no crisp official statement; surfaced as L-1/Open Q1.

**Research date:** 2026-06-16
**Valid until:** ~2026-07-16 (action major versions are stable but bump periodically; re-verify pins if planning slips a month).
