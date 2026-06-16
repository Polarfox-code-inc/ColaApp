# Phase 4: Live Integration, All Stores & Hardening - Pattern Map

**Mapped:** 2026-06-16
**Files analyzed:** 3 (1 greenfield workflow, 1 greenfield script, 1 one-line config edit)
**Analogs found:** 1 (heartbeat script) / 3 — the workflow YAML and the `base` config edit have NO in-repo analog (see "No Analog Found").

> **Read this first (planner):** Phase 4 is assembly of first-party primitives, not new product code. Two of the three files are greenfield with no codebase precedent — for those, the authority is **RESEARCH.md** (verified action versions + the full Pattern 1 YAML), not an invented analog. The one file that touches existing code (the heartbeat write) MUST mirror the data-write seams documented below so it does not break the frozen contract or D-05.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `.github/workflows/pipeline.yml` | config (CI/CD) | batch / event-driven | — (none in repo) | **no analog** — use RESEARCH Pattern 1 |
| `scripts/heartbeat.mjs` | utility (file-I/O writer) | file-I/O (write-only) | `scraper/io.mjs` (`writeAtomic`) + `scraper/index.mjs` `writeErrorStatus` | role + data-flow match |
| `web/vite.config.js` | config (build) | transform (build-time) | itself (one-line edit; structure already present) | exact (self) |

**Optional / contingent files (planner decides per Open Q2 / Q3):**

| File | Role | Data Flow | When it exists |
|------|------|-----------|----------------|
| `contract/schema.mjs` (edit) | model (schema) | validation | ONLY if heartbeat home = `status.json` field (Option B). Adds a top-level key to `StatusFileSchema` (`.strict()`). RESEARCH recommends Option A to AVOID this edit. |
| `test/heartbeat.*.test.mjs` | test | — | If the planner locks the D-05 invariant with a test (recommended by RESEARCH Pattern 4). Analog: existing `test/` node:test files (`node --test`). |
| `web/README.md` (edit) | doc | — | D-12 real-device verification procedure extends the existing localhost procedure. Analog: itself. |

---

## Pattern Assignments

### `scripts/heartbeat.mjs` (utility, file-I/O write-only) — the only file touching existing code paths

**Decision gate (Open Q2):** RESEARCH recommends **Option A — a dedicated `data/heartbeat.json`** because it requires NO change to the frozen `contract/schema.mjs` (`.strict()` would reject an unknown key — see Landmine L-3). Option B (top-level `status.json` field) is documented but needs a schema edit + contract-test rerun. The patterns below assume Option A; if the planner picks B, additionally apply the schema-edit pattern at the bottom.

**Primary analog:** `scraper/io.mjs` `writeAtomic` (lines 67-71) and `scraper/index.mjs` `writeErrorStatus` (lines 86-99).

**Critical seam to mirror — the data-dir-relative path resolution** (so the script works from any cwd, exactly like the scraper). From `scraper/io.mjs` lines 22-25:

```js
const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DATA_DIR = join(HERE, "..", "data");
```

> RESEARCH's Pattern 4 sketch uses `new URL("../data/heartbeat.json", import.meta.url)`. That is the equivalent shorthand. EITHER is fine, but note the script lives in `scripts/` (one level under repo root), so the relative hop is `../data/...` — confirm the depth matches wherever the planner places the file (RESEARCH structure puts it at `scripts/heartbeat.mjs`).

**Atomic-write pattern to mirror** (`scraper/io.mjs` lines 67-71) — same-directory temp + rename, never a half-written file (DATA-05 invariant the CI commit must preserve):

```js
export async function writeAtomic(targetPath, text) {
  const tmp = `${targetPath}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(tmp, text, "utf8");
  await rename(tmp, targetPath); // atomic on the same filesystem
}
```

**Serialization + trailing-newline convention to mirror** (`scraper/index.mjs` lines 95-98, and again 191-198) — every data file is written as `JSON.stringify(obj, null, 2) + "\n"`:

```js
await writeAtomic(
  join(dataDir, "status.json"),
  JSON.stringify(status, null, 2) + "\n"
);
```

So the heartbeat write should be (matching RESEARCH Pattern 4 Option A, upgraded to the repo's atomic + 2-space + trailing-newline convention):

```js
// shape per RESEARCH Pattern 4: { lastRun: ISO }
JSON.stringify({ lastRun: new Date().toISOString() }, null, 2) + "\n"
```

**D-05 INVARIANT (the load-bearing rule for this file):** the heartbeat MUST bump only a top-level / separate "last run" timestamp and MUST NOT mutate per-store `lastUpdated`. The per-store timestamps that D-05 protects live one level down, in `stores[].lastUpdated`, and are already correctly frozen/bumped by `scraper/merge.mjs`:
- Warm-error path **freezes** the prior per-store timestamp — `merge.mjs` line 68: `lastUpdated: priorSt?.lastUpdated ?? nowIso`.
- Successful-refresh path **bumps** it — `merge.mjs` line 87: `statusStores.push({ store, status, lastUpdated: nowIso })`.

A dedicated `data/heartbeat.json` (Option A) physically cannot touch `stores[]`, so it satisfies D-05 by construction. This is the strongest reason RESEARCH prefers Option A.

**Where it runs (NOT inside the scraper):** as a separate workflow step `node scripts/heartbeat.mjs` AFTER `npm run scrape` (RESEARCH Pattern 4, "Where it runs"). Keeping it out of `scraper/index.mjs` preserves the scraper's atomic validate-before-write path (the `run()` write block, `index.mjs` lines 168-199) untouched. Planner decides the `if: always()` question (Open Q3).

**No dependencies:** `scraper/io.mjs` header (line 15) is explicitly "No dependencies" — the heartbeat script should likewise use only `node:fs/promises` / `node:url` / `node:path` built-ins. Phase 4 adds NO npm packages (RESEARCH Standard Stack).

---

### `web/vite.config.js` (config, build-time transform) — one-line edit

**Analog:** the file itself — the VitePWA `generateSW` structure is already complete and already carries the Phase-4 intent in a comment.

**Existing structure to edit** (lines 7-13) — `defineConfig({ server: {...}, plugins: [...] })`. The `base` key goes at the top level of the config object, BEFORE `server`. The file even pre-documents this (lines 8-9):

```js
// Phase 4 sets base:'/ColaApp/' for the GitHub Pages subpath. Keep start_url/scope
// relative ('./') so the shell stays subpath-safe (RESEARCH Pitfall 4).
```

**The change** (RESEARCH Pattern 6 — the ONLY product-code line in Phase 4):

```js
export default defineConfig({
  base: '/ColaApp/',          // <-- add this (D-08). Everything else stays.
  server: { fs: { allow: ['..'] } },   // unchanged
  plugins: [ VitePWA({ ... }) ],       // unchanged
});
```

**Do NOT touch — already correct and subpath-safe (verified this session):**
- `manifest.start_url: './'` and `scope: './'` (lines 24-25) are relative — correct under the subpath. Making them absolute would break installability (RESEARCH Anti-Pattern + Pitfall 4).
- Manifest icon `src` values are bare-relative (`icon-192.png`, no leading slash — lines 30-32). This matters: plugin issue #713 means icon `src` does NOT get `base` auto-prepended; a leading slash would 404 under `/ColaApp/`. Leave them bare.
- The SW runtime route matches on `url.pathname` via a function `urlPattern` (line 42): `({ url }) => /\/data\/.*\.(json|jsonl)$/.test(url.pathname)`. This is why serving data at `/ColaApp/data/...` needs NO SW change (D-07). Verified subpath-safe.
- `vite-plugin-pwa@1.3.0` auto-prepends `base` to the generated `sw.js` / `registerSW.js` / `manifest.webmanifest` registration URLs, so setting `base` alone is sufficient for SW + manifest registration.

**Runtime-fetch confirmation (no code change needed):** `web/src/data/load.js` line 25 sets `DEFAULT_BASE = "./data/"` and fetches relative (lines 47-55, `fetch(url)`). Vite's `base` rewrites build-time *asset* URLs but NOT runtime fetch strings; the relative `./data/...` resolves against `document.baseURI` = `/ColaApp/`, so it correctly hits `/ColaApp/data/...`. **Verified: `web/index.html` has NO `<base href>` override** (would shift `document.baseURI` — Assumption A5, now confirmed). No change to `load.js`.

---

## Shared Patterns

### Data-write integrity (atomic + validate-before-write)
**Source:** `scraper/io.mjs` lines 67-71 (`writeAtomic`) + `scraper/index.mjs` lines 168-199 (validate-then-write order).
**Apply to:** the heartbeat write, AND the CI commit step (the workflow must commit whole files only — never a partial `data/`).
The DATA-05 guarantee is "a crash mid-write leaves either the old file or the new one — never a half-written file." The CI commit preserves this because it `git add`s already-fully-written files. RESEARCH Security table row "Corrupt/half-written `data/` committed → atomic temp+rename + validate-before-write preserved; CI commits whole files only."

### Trailing-newline + 2-space JSON serialization
**Source:** `scraper/index.mjs` lines 95-98, 191-198 (every `writeAtomic` call).
**Apply to:** `scripts/heartbeat.mjs` and any new data file, so git diffs stay clean and consistent with the existing committed `data/*.json`.

### Frozen contract — do not add top-level keys casually
**Source:** `contract/schema.mjs` lines 134-139 (`StatusFileSchema` is `.strict()`) and lines 78-108 (`CurrentOffersSchema` is `.strict()` + requires the 5 stores exactly once).
**Apply to:** the heartbeat home decision. `.strict()` rejects unknown top-level keys → Option B (status.json field) is a frozen-contract change (Landmine L-3). Default to a SEPARATE file (Option A) to avoid touching this module and its contract tests entirely.

### Fault isolation already satisfies success-criterion 4 — don't break it
**Source:** `scraper/index.mjs` lines 122-149 (try/catch around the single fetch AND each per-store build) + the Wasgau fixed-"unavailable" handling in `scraper/merge.mjs` lines 92-98.
**Apply to:** the workflow's `npm run scrape` step — the scraper exits 0 on per-store/total fetch errors (`index.mjs` `main()`, lines 207-223; only a schema-validation throw exits non-zero). The workflow must NOT add `set -e`-style strictness that turns the deliberate exit-0-on-store-error into a failed run. RESEARCH Landmine L-6.

### Least-privilege CI permissions (Security V1 / V10)
**Source:** RESEARCH Pattern 1 + Security Domain table (no in-repo analog).
**Apply to:** the workflow — top-level `permissions: contents: write` (for the self-commit); deploy job narrows to `pages: write` + `id-token: write` + `contents: read`. Pin all five `actions/*` to current majors (checkout@v6, setup-node@v6, configure-pages@v6, upload-pages-artifact@v5, deploy-pages@v5). `npm ci` (lockfile-exact). No third-party actions.

---

## No Analog Found

These files have no precedent in the codebase. The planner should follow **RESEARCH.md** (which contains the verified, copy-ready artifacts) rather than inventing or adapting a local analog.

| File | Role | Data Flow | Reason / Where to get the pattern |
|------|------|-----------|-----------------------------------|
| `.github/workflows/pipeline.yml` | config (CI/CD) | batch / event-driven | **Greenfield — no `.github/` directory exists** (verified). Use **RESEARCH Pattern 1** (full verified YAML, lines 187-275): single workflow, two jobs (`scrape-and-commit` → `deploy`), `schedule:` 2×/day + `push: [master]` + `workflow_dispatch`, `concurrency: { group: cola-pipeline, cancel-in-progress: false }`, `data_changed` step output gating the deploy. Also RESEARCH Pattern 2 (data-change diff via `git diff --quiet -- data/`), Pattern 3 (safe `GITHUB_TOKEN` self-commit + `github-actions[bot]` identity), Pattern 5 (official Pages flow), and the Manual Maintainer Checklist (Pages source = "GitHub Actions", repo public, token read+write). Action versions are `[VERIFIED 2026-06-16]` but RESEARCH "Valid until ~2026-07-16" — re-verify pins if planning slips. |
| `scripts/` directory | — | — | **Does not exist** (verified). Greenfield home for `heartbeat.mjs`. |

**Decision still open for the planner (do NOT silently resolve):**
- **L-1 / Open Q1 — keepalive efficacy:** strong community evidence that a `GITHUB_TOKEN` bot commit does NOT reliably reset the 60-day inactivity timer, so D-04's heartbeat-commit may not by itself satisfy INFR-03's keepalive. RESEARCH recommends surfacing this as an explicit user decision (accept residual risk vs. a tiny `gh workflow enable`/API touch). This is a `checkpoint:human-verify` candidate — not a pattern-mapping call.
- **Open Q3 — heartbeat `if: always()`** (run on failed scrape too): planner's call; low stakes (a failed scrape already emails the owner per D-02).

---

## Metadata

**Analog search scope:** repo root, `scraper/`, `contract/`, `web/`, `web/src/`, `data/`, `web/public/data/`, `.github/` (absent), `scripts/` (absent), `.claude/skills` + `.agents/skills` (absent).
**Files scanned (read in full):** `scraper/io.mjs`, `scraper/index.mjs`, `scraper/merge.mjs`, `contract/schema.mjs`, `web/vite.config.js`, `web/src/data/load.js`, `package.json`. Directory listings: `data/`, `scraper/`, `web/`, `web/public/data/`, repo root. Grep: `web/index.html` (`<base href>` — none), `web/package.json` (scripts).
**Project skills:** none found (no `.claude/skills`, `.agents/skills`, etc.).
**Pattern extraction date:** 2026-06-16
