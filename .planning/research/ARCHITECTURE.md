# Architecture Research

**Domain:** Serverless scheduled-scraper + static PWA (zero-cost GitHub Actions + GitHub Pages)
**Researched:** 2026-06-15
**Confidence:** HIGH (core structure), MEDIUM (GitHub Pages deploy-timing specifics)

## Standard Architecture

This is a **"baked data" / static-site-with-precomputed-data** architecture. There is no live backend and no API the phone talks to. A scheduled batch job runs server-side (on GitHub's runners), produces plain data files, commits them into the repo, and a static frontend fetches those files at runtime. The scraper and the frontend are fully decoupled by a **file contract** (the JSON schema) — they never call each other, they only agree on a file shape.

This is the right pattern here because:
- The phone PWA cannot scrape store sites directly (CORS, and store sites are HTML/PDF not CORS-enabled JSON APIs).
- Data changes at most weekly (German offer cadence), so a cron job + static file is vastly cheaper and simpler than any live service.
- Everything fits inside GitHub's free tier with zero always-on compute.

### System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│  COMPUTE: GitHub Actions runner (scheduled cron, ephemeral)        │
├──────────────────────────────────────────────────────────────────┤
│   ┌─────────────────────  ETL ORCHESTRATOR  ──────────────────┐   │
│   │                                                            │   │
│   │  for each store adapter (isolated, fault-tolerant):        │   │
│   │   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │   │
│   │   │ REWE     │  │ Edeka/   │  │ Lidl/    │  │ Wasgau   │   │   │
│   │   │ adapter  │  │ Netto    │  │ Kaufland │  │ adapter  │   │   │
│   │   └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │   │
│   │     fetch         fetch         fetch         fetch        │   │
│   │     parse         parse         parse         parse        │   │
│   │        └──────────────┴──── normalize ───┴──────┘          │   │
│   │                          │                                 │   │
│   │              canonical Offer[] + per-store StoreStatus     │   │
│   └──────────────────────────┼─────────────────────────────────┘  │
│                              │ merge with existing data            │
│                              ▼                                      │
│              writes:  current-offers.json (overwrite)              │
│                       price-history.json  (append/dedupe)          │
│                       status.json         (overwrite)              │
│                              │ git commit + push  [skip ci]        │
└──────────────────────────────┼─────────────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│  STORAGE / DELIVERY: the git repo + GitHub Pages CDN              │
│   data/*.json  ─────────────┐                                     │
│   web/ (built PWA: html/js/css/manifest/sw)  ──┐                  │
│                                                 ▼                  │
│                         GitHub Pages serves both as static files  │
└──────────────────────────────────────────────────────────────────┘
                               ▼  HTTPS fetch (same origin)
┌──────────────────────────────────────────────────────────────────┐
│  CLIENT: installed PWA on Android home screen                     │
│   fetch data/*.json → render best deal, per-store offers,         │
│   "no current offer" states, price-history graph                  │
└──────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **ETL orchestrator** | Runs each store adapter, collects results, isolates failures, merges into data files, writes outputs | A single Node/TS entrypoint (`scraper/src/run.ts`) invoked by the workflow |
| **Store adapter (×5)** | Knows ONE store: how to fetch its source, parse out the 12×1L Coca-Cola offer, return a normalized `Offer` (or null) + a `StoreStatus` | One module per store implementing a shared `StoreAdapter` interface |
| **Normalization layer** | Converts each adapter's raw extraction into the canonical `Offer` shape (price, pack, €/L derived, validFrom/validTo, store, fetchedAt) | Shared helper functions used by adapters; single source of truth for the record shape |
| **Merge/persistence layer** | Overwrites current-offers, appends-and-dedupes price-history, writes status | Pure functions operating on parsed JSON + filesystem write |
| **Data artifacts** | The contract between scraper and PWA: `current-offers.json`, `price-history.json`, `status.json` | Plain JSON committed in `data/` |
| **PWA frontend** | Fetches the JSON, computes/render best deal, per-store list, no-offer states, history chart, installability | Static HTML/JS/CSS (small framework or vanilla) + manifest + service worker |
| **GitHub Actions workflow** | Schedules the cron, runs the orchestrator, commits data | `.github/workflows/scrape.yml` |
| **GitHub Pages** | Serves the built PWA + data files over HTTPS as a CDN | Pages configured to serve from a branch/folder |

## Recommended Project Structure

**Monorepo, single repo, two top-level concerns.** A monorepo is correct here: the scraper and the web app share the JSON schema, and one repo keeps the data files co-located with the site that serves them (so Pages can serve both over the same origin — no CORS between PWA and data).

```
colaapp/
├── .github/
│   └── workflows/
│       ├── scrape.yml          # cron: run scraper, commit data/  [the data producer]
│       └── deploy.yml          # on push to main (web changes): build + deploy PWA
├── scraper/
│   ├── src/
│   │   ├── run.ts              # ETL orchestrator entrypoint
│   │   ├── types.ts           # canonical Offer, StoreStatus, schema (SHARED CONTRACT)
│   │   ├── adapters/
│   │   │   ├── adapter.ts      # StoreAdapter interface + runAdapterSafe() wrapper
│   │   │   ├── rewe.ts
│   │   │   ├── edeka.ts
│   │   │   ├── lidl.ts
│   │   │   ├── aldi.ts
│   │   │   └── wasgau.ts
│   │   ├── normalize.ts        # raw extraction → canonical Offer (€/L, date parse)
│   │   └── persist.ts          # merge current + append/dedupe history + write status
│   └── package.json
├── web/
│   ├── public/
│   │   ├── manifest.webmanifest
│   │   ├── icons/
│   │   └── sw.js               # service worker (offline shell + last-known data)
│   ├── src/                    # PWA app code; imports the shared schema type
│   └── index.html
├── data/                       # THE CONTRACT — committed JSON artifacts
│   ├── current-offers.json     # overwritten each run: latest snapshot per store
│   ├── price-history.json      # append-only, deduped: one point per (store,observation)
│   └── status.json             # per-store fetch status + timestamp (health/freshness)
└── schema/                     # OPTIONAL: shared JSON schema / TS types if not in scraper
```

### Structure Rationale

- **`scraper/types.ts` is the single source of truth for the record shape.** Both the merge layer and (ideally) the web app reference it. If web is a separate toolchain, mirror it as a small `schema/` package or a copied type — but treat the JSON shape as a versioned contract.
- **`data/` at repo root, not inside `web/`:** keeps the producer (Actions) and consumer (Pages) decoupled, and makes the "scraper writes here, PWA reads here" boundary obvious. Pages must be configured so `data/` is reachable at a stable URL.
- **`adapters/` one-file-per-store:** failure isolation and store-specific brittleness are contained; adding/removing a store touches exactly one file plus a registry array.
- **Two workflows, separate triggers:** the scrape (data) job and the web deploy job have different cadences and different trigger sources. Keeping them separate avoids rebuilding the PWA on every data commit and is the cleanest way to dodge the trigger-loop problem (see Anti-Patterns).

## Architectural Patterns

### Pattern 1: Per-store adapter with fault isolation ("fail one store, not the run")

**What:** Every store implements the same interface and is invoked through a `try/catch` wrapper that NEVER throws. A failed store yields a `StoreStatus` of `error` and contributes no new offer — but the run continues and last-known data for that store is preserved.

**When to use:** Always here. Known risk: scrapers are brittle and Wasgau may only have PDFs. One flaky store must not blank out the others.

**Trade-offs:** Slightly more ceremony per adapter; in exchange the system degrades gracefully and the UI can show "REWE data is 6 days old" rather than a broken page.

**Example:**
```typescript
interface StoreAdapter {
  storeId: string;            // "rewe", "wasgau", ...
  displayName: string;
  fetchOffer(): Promise<Offer | null>;   // null = no qualifying 12x1L offer found
}

interface StoreStatus {
  storeId: string;
  status: "ok" | "no-offer" | "error";
  lastSuccessAt: string | null;  // ISO; freshness of last GOOD fetch
  checkedAt: string;             // ISO; when this run touched it
  message?: string;              // error detail for debugging
}

// Isolation wrapper — the whole point: this never rejects.
async function runAdapterSafe(a: StoreAdapter, prevStatus?: StoreStatus) {
  try {
    const offer = await withTimeout(a.fetchOffer(), 30_000);
    return offer
      ? { offer, status: mkStatus(a, "ok") }
      : { offer: null, status: mkStatus(a, "no-offer", prevStatus) };
  } catch (e) {
    // keep last-known: do NOT overwrite this store's current offer downstream
    return { offer: null, status: mkStatus(a, "error", prevStatus, String(e)) };
  }
}
```

### Pattern 2: Overwrite-current + append-only-history with idempotent dedupe

**What:** Two different persistence strategies for two different files. `current-offers.json` is a **full snapshot** rebuilt each run (latest known offer per store, carrying forward last-known for stores that errored). `price-history.json` is **append-only** but **idempotent**: re-running the cron must not create duplicate points.

**Dedupe key:** an observation is identified by `(storeId, validFrom, validTo, price)` — or more simply `(storeId, offer-week)`. Before appending, check whether a point with the same key already exists; only append genuinely new observations. This makes the whole pipeline safe to re-run (cron retries, manual triggers, backfills) without polluting the graph.

**When to use:** Whenever a scheduled job both shows "current state" and accumulates "history."

**Trade-offs:** History grows unbounded but extremely slowly (5 stores × ~weekly = a few hundred points/year — JSON is fine for years; no DB needed). A coarse dedupe key risks merging two legitimately different offers in the same week; a price-inclusive key avoids that at the cost of occasionally recording a corrected price as a new point (acceptable, even desirable).

**Example:**
```typescript
function mergeHistory(history: HistoryPoint[], fresh: Offer[]): HistoryPoint[] {
  const seen = new Set(history.map(h => `${h.storeId}|${h.validFrom}|${h.validTo}|${h.price}`));
  for (const o of fresh) {
    const key = `${o.storeId}|${o.validFrom}|${o.validTo}|${o.price}`;
    if (!seen.has(key)) {
      history.push({ storeId: o.storeId, price: o.price, eurPerL: o.eurPerL,
                     validFrom: o.validFrom, validTo: o.validTo, observedAt: o.fetchedAt });
      seen.add(key);
    }
  }
  return history.sort((a, b) => a.observedAt.localeCompare(b.observedAt));
}
```

### Pattern 3: File contract decoupling (schema-first, mockable frontend)

**What:** The JSON schema is the API. Once the shape is fixed, the PWA can be built against a hand-written mock `data/*.json` while the real adapters are still being written, and vice versa. Neither side imports the other; they only share types.

**When to use:** Whenever a producer and consumer can be split by a stable data file — enables parallel work (see Build Order).

**Trade-offs:** You must discipline yourself to version/freeze the schema early; ad-hoc shape changes break the consumer silently. Mitigate with a shared TS type and/or a JSON Schema validation step in the scraper before writing.

## Proposed Data Schema (the contract)

```jsonc
// data/current-offers.json — overwritten each run
{
  "schemaVersion": 1,
  "generatedAt": "2026-06-15T04:00:00Z",
  "product": { "name": "Coca-Cola", "pack": "12x1L", "litres": 12 },
  "offers": [
    {
      "storeId": "rewe",
      "storeName": "REWE Schifferstadt",
      "price": 11.99,            // EUR for the 12x1L case
      "eurPerL": 0.999,          // derived: price / 12, for cross-store comparison
      "currency": "EUR",
      "validFrom": "2026-06-16", // ISO date (offer week start)
      "validTo": "2026-06-21",   // ISO date (offer week end)
      "isUpcoming": true,        // valid in the future vs currently active
      "sourceUrl": "https://...",// provenance / "view at store"
      "fetchedAt": "2026-06-15T04:00:12Z",
      "stale": false             // true if carried-forward last-known (this run errored/skipped)
    }
    // stores with no qualifying offer omitted OR included with price:null — pick one, see note
  ]
}
```
```jsonc
// data/price-history.json — append-only, deduped
{
  "schemaVersion": 1,
  "points": [
    { "storeId": "rewe", "price": 11.99, "eurPerL": 0.999,
      "validFrom": "2026-06-16", "validTo": "2026-06-21",
      "observedAt": "2026-06-15T04:00:12Z" }
  ]
}
```
```jsonc
// data/status.json — per-store health/freshness, overwritten each run
{
  "schemaVersion": 1,
  "generatedAt": "2026-06-15T04:00:00Z",
  "stores": [
    { "storeId": "rewe",   "status": "ok",       "lastSuccessAt": "2026-06-15T04:00:12Z", "checkedAt": "2026-06-15T04:00:12Z" },
    { "storeId": "wasgau", "status": "error",    "lastSuccessAt": "2026-06-08T04:00:09Z", "checkedAt": "2026-06-15T04:00:30Z", "message": "PDF parse failed" },
    { "storeId": "aldi",   "status": "no-offer", "lastSuccessAt": "2026-06-15T04:00:20Z", "checkedAt": "2026-06-15T04:00:20Z" }
  ]
}
```

**Schema note — "no offer" representation:** prefer an explicit per-store entry (with `status: "no-offer"` in status.json and either omission or `price:null` in current-offers) so the UI can distinguish "no current offer (working correctly)" from "we failed to fetch" — a Known Risk the UI must handle as a clean, non-broken state.

## Data Flow

### Producer flow (scheduled, server-side)

```
cron fires (GitHub Actions)
   ↓
checkout repo (need existing data/ to merge against)
   ↓
orchestrator: load existing current-offers + price-history + status
   ↓
for each adapter:  fetch → parse → normalize(price, pack→€/L, dates, store, fetchedAt)
   ↓   (each wrapped in runAdapterSafe → never throws)
collect: Offer[] (successes) + StoreStatus[] (all stores)
   ↓
merge:  current-offers = snapshot(new offers, carry-forward last-known for errored stores)
        price-history   = appendDedupe(existing, new offers)
        status          = rebuilt from StoreStatus[]
   ↓
validate against schema → write data/*.json
   ↓
git commit "data: update offers [skip ci]" → push to main
```

### Consumer flow (client, on open)

```
PWA launches (from home screen)
   ↓
service worker serves app shell instantly (cache-first)
   ↓
fetch data/current-offers.json + price-history.json + status.json (network, fallback to cache)
   ↓
compute best deal = min(eurPerL) among currently-valid, non-stale offers
   ↓
render: best deal banner • per-store cards (incl. upcoming + "no offer" + "stale/old" badges)
        • price-history chart • last-updated/freshness from status.json
```

### Key Data Flows

1. **Brittle-store carry-forward:** if Wasgau errors, its entry in `current-offers.json` is the *previous* run's offer with `stale:true`, and `status.json` shows `error` + an old `lastSuccessAt`. The graph gets no new (possibly-wrong) point. The user sees "Wasgau: last checked 7 days ago" not a blank or a crash.
2. **Idempotent re-run:** a manually-triggered or retried run re-observes the same week's offers; the history dedupe key drops them, so the chart is unchanged. Safe to run as often as you like.

## Repo / Deployment Layout Decision

**Recommendation: single repo, GitHub Pages serving from a branch (`/` root or `/docs`) that contains BOTH the built PWA and `data/`, with two separate workflows.**

Two viable concrete setups (pick based on whether the PWA has a build step):

| Setup | How Pages serves | When to choose |
|-------|------------------|----------------|
| **A. Deploy-from-branch, no build** | PWA is plain static files; configure Pages "Deploy from branch" = `main` (root or `/docs`). Scraper commits `data/` to that same branch. | Simplest. Choose if the web app is vanilla/no-bundler. The scrape commit *is* the deploy — Pages just re-serves new files; no rebuild needed. |
| **B. Actions-built deploy** | `deploy.yml` builds `web/` and the scrape job's data into a Pages artifact via `actions/deploy-pages`. | Choose if the PWA needs a bundler/build. The scrape job either commits data (triggering deploy) or the deploy workflow itself reads `data/` at build time. |

**Avoiding the awkward retrigger (critical mechanic):** A cron job that commits `data/` can accidentally trigger the Pages deploy workflow, which can in turn trigger more runs. Three compounding safeguards:
- Put `[skip ci]` in the data commit message (GitHub skips workflow runs for such commits).
- On the deploy workflow, use `paths-ignore: ['data/**']` so data-only commits don't rebuild the PWA. (For setup A with deploy-from-branch and no build step, there is *no* build workflow to retrigger — the cleanest case: data commits simply update served files.)
- Use the default `GITHUB_TOKEN` for the push; pushes made with it do **not** trigger further workflow runs by design, which alone breaks the loop. (A PAT *would* retrigger — avoid.)

**Net recommendation:** Start with **Setup A (deploy-from-branch, no/minimal build)** for maximum simplicity and zero trigger-loop risk; the data commit transparently becomes the deploy. Move to Setup B only if the PWA grows a real build step. Confidence MEDIUM on exact Pages config because GitHub's Pages source options change periodically — verify current settings at build time.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1 user, 5 stores (actual) | Nothing. JSON files + cron + Pages is permanently sufficient. |
| If stores grew to ~50 | Still fine; orchestrator loops more adapters, history JSON still small. Maybe parallelize fetches. |
| If history grew to 10k+ points | Split history by year/store file, or lazy-load chart data. Not a concern for years at this cadence. |

### Scaling Priorities

1. **First "bottleneck" is reliability, not load:** the real risk is adapters breaking, not traffic. Invest in fault isolation + status visibility, not performance.
2. **Second is GitHub Actions schedule reliability:** scheduled workflows can be delayed or skipped under GitHub load, and cron on inactive repos can be auto-disabled after ~60 days. Mitigate by tolerating skipped runs (carry-forward handles it) and keeping the repo active.

## Anti-Patterns

### Anti-Pattern 1: One try/catch around the whole scrape loop

**What people do:** Wrap all five stores in a single try/catch; first failure aborts the run.
**Why it's wrong:** One brittle store (likely Wasgau) blanks the entire dataset; users see nothing.
**Do this instead:** Per-adapter isolation (`runAdapterSafe`) — failures are local, last-known data is preserved, status records the error.

### Anti-Pattern 2: Rewriting price-history on every run (or appending blindly)

**What people do:** Either regenerate the whole history from "current" each run (loses past data) or append current every run (duplicate points flood the chart).
**Why it's wrong:** Both corrupt the history the app's value depends on.
**Do this instead:** Append-only with an idempotent dedupe key so re-runs are no-ops.

### Anti-Pattern 3: Committing data into the same trigger path as the deploy with a PAT

**What people do:** Push data with a personal access token and no path filters → deploy reruns → possible loops, wasted minutes.
**Why it's wrong:** Self-triggering workflows, noisy history, can spiral.
**Do this instead:** `GITHUB_TOKEN` + `[skip ci]` + `paths-ignore: data/**` (or deploy-from-branch with no build step at all).

### Anti-Pattern 4: PWA computing "best deal" from offers without checking validity/staleness

**What people do:** `min(price)` across all offers regardless of dates or stale flags.
**Why it's wrong:** Surfaces an expired or carried-forward (possibly wrong) price as "best deal."
**Do this instead:** Filter to currently-valid, non-stale offers before picking the min €/L; show upcoming offers separately.

### Anti-Pattern 5: Treating "no offer" as an error/empty state

**What people do:** Blank screen or error when no store has a 12×1L offer.
**Why it's wrong:** "No current offer" is the *expected normal* most weeks (Known Risk); a blank looks broken.
**Do this instead:** Explicit, friendly "no current offer — last deal was X on DATE" state driven by status.json + history.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Store websites/leaflets | Per-adapter fetch (HTTP) + parse (HTML/JSON/PDF) | Brittleness varies; Wasgau may be PDF/image — hardest. Each adapter owns its quirks. |
| GitHub Actions | Cron `schedule` + `workflow_dispatch` (manual) | Schedule can be delayed/skipped; build for idempotency + carry-forward. |
| GitHub Pages | Static hosting/CDN of `web/` + `data/` | Serve PWA and data same-origin → no CORS for the fetch. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Adapter ↔ orchestrator | Shared `StoreAdapter` interface; returns `Offer\|null` + `StoreStatus` | Adapters never write files or know about each other. |
| Scraper ↔ PWA | The JSON file contract only (`data/*.json` + shared types) | Fully decoupled — enables parallel build and mockability. |
| Workflow ↔ data | `GITHUB_TOKEN` commit with `[skip ci]` | The seam where loop-avoidance lives. |

## Build Order / Phase Implications

The file contract is the keystone — fix it first and two tracks proceed in parallel.

1. **Phase 0 — Schema/contract first (blocks everything).** Define `Offer`, `StoreStatus`, and the three JSON files with realistic *mock* data committed to `data/`. This unblocks the frontend immediately and defines what adapters must produce.
2. **Phase 1a (parallel) — Scraper vertical slice:** orchestrator + `runAdapterSafe` + normalize + persist (merge/dedupe) + **one** working store adapter (pick the easiest machine-readable one, likely REWE or Lidl). Proves the producer end-to-end and the dedupe logic. Must exist before trusting real data.
3. **Phase 1b (parallel) — PWA against the mock:** fetch + render best deal, per-store cards, no-offer/stale states, history chart, manifest + service worker (installability). Can be fully built and demoed against committed mock JSON before any real adapter exists.
4. **Phase 2 — Workflow + Pages wiring:** `scrape.yml` cron, commit with `[skip ci]`/`GITHUB_TOKEN`, Pages config (Setup A). Connects the two tracks; first real data lands.
5. **Phase 3 — Remaining adapters, one per increment:** Edeka/Netto, Aldi/Penny, Kaufland, then Wasgau last (highest risk; may end as partial coverage or aggregator fallback — isolate it so it can't regress the others).
6. **Phase 4 — Hardening:** timeouts, schema validation before write, freshness UI from status.json, handling long "no offer" stretches.

**Parallelization enabler:** the schema in Phase 0 lets frontend (1b) and scraper (1a) proceed independently — the single biggest scheduling win. The per-store adapter pattern lets Phase 3 stores be added incrementally without re-touching the core, and lets the riskiest store (Wasgau) be deferred or dropped without blocking ship.

## Sources

- [Workflow syntax for GitHub Actions — paths-ignore behavior](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions) (HIGH)
- [Stopping automatic GitHub Action on push — [skip ci] / GITHUB_TOKEN does not retrigger](https://github.com/orgs/community/discussions/50868) (HIGH)
- [Workflow infinite loop discussion](https://github.com/orgs/community/discussions/26970) (MEDIUM)
- [Creating a GitHub Pages site — publishing sources (branch vs /docs vs Actions)](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site) (HIGH)
- [Using custom workflows with GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) (HIGH)
- [Deploy to GitHub Pages action (branch deploy patterns)](https://github.com/marketplace/actions/deploy-to-github-pages) (MEDIUM)
- Project context: `.planning/PROJECT.md` (HIGH)

---
*Architecture research for: serverless scheduled-scraper + static PWA*
*Researched: 2026-06-15*
