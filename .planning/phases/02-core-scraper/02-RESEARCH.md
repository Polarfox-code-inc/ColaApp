# Phase 2: Core Scraper - Research

**Researched:** 2026-06-15
**Domain:** Node 22 ESM ETL — native-fetch ingestion of the marktguru `/offers/search` endpoint, contract-validated normalization, fault-isolated multi-file output (snapshot + JSONL history + status)
**Confidence:** HIGH (contract/source facts are frozen and verified in-repo; open implementation questions answered with verified Node 22 native-API patterns)

## Summary

Phase 2 is a **pure ETL with no new external dependencies**. Everything it needs already exists in the repo: the fetch pattern (`spike/probe.mjs`), the per-offer classifier (`contract/matcher.mjs`), the output schemas (`contract/schema.mjs`), the field-name source of truth (`spike/fixtures/raw-67105-search.json`), and the exact output shapes (`data/*.json(l)` + `mocks/*.json`). The marktguru field names, the 5-slug allow-list, the Wasgau=`unavailable` verdict, the `validityDates` array shape, the Berlin-day trim rule, and the `Math.round(price*100)` cents rule are all **already settled** in `spike/findings.md` and CONTEXT.md — this research does not re-derive them, it cites them.

The research value is concentrated in the **six open implementation questions** the phase must resolve, all answerable with **Node 22 built-ins, zero new packages**: (1) a per-attempt `AbortSignal.timeout` + exponential-backoff-with-jitter retry wrapper; (2) a same-directory temp-file + `fs.rename` atomic-write pattern (with the EXDEV caveat handled by keeping temp adjacent to target); (3) an injected `now()`/`clock` for deterministic tests; (4) a read-prior-then-merge flow that carries forward last-known data and freezes per-store timestamps; (5) a module decomposition (fetch / filter / select / normalize / dedup / write) that mirrors Phase 1's pure-function + `node:test` TDD style; and (6) a fault-isolation control flow whose run function **always completes and writes all three files**.

**Primary recommendation:** Build `scraper/` as small pure ES modules orchestrated by a thin `scraper/index.mjs` (wired to `npm run scrape`). Inject `{ now, fetchOffers, dataDir }` into the orchestrator so the entire pipeline runs offline against `spike/fixtures/raw-67105-search.json` in `node:test`. Wrap **both** network calls (homepage keys + offers/search) in one retry helper using a fresh `AbortSignal.timeout(10_000)` per attempt and backoff `~1s, ~3s`. Validate every file through `contract/schema.mjs` **before** atomic write; on any total-fetch failure, carry forward the prior `data/current-offers.json` verbatim and emit `error` (without bumping per-store `lastUpdated`) in `data/status.json`. No new dependencies — `zod` remains the only runtime dep.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Bootstrap-key fetch + offers/search | Network I/O (fetch module) | — | Only place that touches the network; everything downstream is pure |
| Retry / backoff / timeout | Network I/O (fetch module) | — | Wraps the two fetch calls; transient-failure policy lives with the I/O |
| Filter to 5-slug allow-list | Pure transform (filter module) | — | Client-side filter on `advertisers[].uniqueName`; no I/O |
| Strict 12×1L classify | Frozen contract (`contract/matcher.mjs`) | — | Reused verbatim; never re-implemented (D-09 ref) |
| One-entry-per-store selection | Pure transform (select module) | injected clock | Active-first/upcoming/tie-break needs "now" in Berlin |
| Normalize → cents/dates/€-litre | Pure transform (normalize module) | injected clock | Berlin-day trim depends on "now" only for active-range pick |
| Schema validation | Frozen contract (`contract/schema.mjs`) | — | `parse*` helpers throw on drift before any write |
| Dedup-append history | Pure transform + file read (dedup module) | filesystem | Reads existing JSONL keys, returns lines to append |
| Read-prior / carry-forward | Filesystem (read module) | — | Reads prior `current-offers.json` + `status.json` at run start |
| Atomic write of 3 files | Filesystem (write module) | — | temp+rename; ordering matters (history append last) |
| Fault isolation / orchestration | Orchestrator (`index.mjs`) | injected clock + fetch | Catches per-store errors, drives total-failure path, guarantees all 3 files written |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | 22 LTS ("Jod") | Runtime | Already the project runtime (`package.json` `engines.node >=22`, `.nvmrc`). Native `fetch`, `AbortSignal.timeout`, `Intl` tz, `node:fs/promises`, `node:test` — covers 100% of this phase. `[VERIFIED: package.json + .nvmrc]` |
| `zod` | ^3.25.76 | Validate output files before write | Already installed; `contract/schema.mjs` is built on it. The only runtime dep, and no new one is needed. `[VERIFIED: package.json]` |
| `node:test` + `node:assert/strict` | built-in | Offline unit tests | Phase 1's established test runner (`npm test` → `node --test`). Mirror its pure-function + fixture-driven style. `[VERIFIED: package.json + test/*.mjs]` |

### Supporting (all Node built-ins — no install)
| Module | Purpose | When to Use |
|--------|---------|-------------|
| `node:fs/promises` (`readFile`, `writeFile`, `rename`, `mkdir`, `appendFile`) | Read prior data, atomic write, JSONL append | Read-prior-then-merge + atomic write |
| `globalThis.fetch` + `AbortSignal.timeout` | Network calls with per-request timeout | Homepage keys + offers/search (D-11/D-12) |
| `Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' })` | Trim ISO-UTC `validityDates` to Berlin `YYYY-MM-DD` | Date normalization (D-09) and active-range "now" comparison (D-07) |
| `node:path` + `node:url` (`fileURLToPath`) | Resolve `data/` paths relative to module (cwd-independent) | Carry over `spike/probe.mjs` `HERE`/`FIXTURE` pattern |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native `fetch` | `axios` / `node-fetch` | **Forbidden by CLAUDE.md "What NOT to Use"** — unneeded dep on Node 22; native `fetch`/`undici` built in. `[CITED: CLAUDE.md]` |
| `AbortSignal.timeout` | `setTimeout` + manual `AbortController.abort()` | `AbortSignal.timeout(ms)` is the idiomatic Node 22 one-liner; manual controller is more code and easy to leak. `[VERIFIED: node runtime]` |
| temp+rename atomic write | direct `writeFile` over the target | Direct write can leave a half-written/corrupt file on crash mid-write (the discretion item explicitly wants this avoided). `[CITED: github.com/nodejs/node#19077]` |
| `Intl` Berlin trim | `date-fns-tz` / `Temporal` | New dep (date-fns-tz) or unstable (`Temporal` not in Node 22 stable); `Intl` already proven to produce the exact Berlin day. `[VERIFIED: node runtime]` |
| hand-rolled dedup set | a DB / `better-sqlite3` | Overkill and breaks the "static file the PWA reads" model (CLAUDE.md). Dedup is an in-memory `Set` over `store+price+validFrom`. `[CITED: CLAUDE.md]` |

**Installation:**
```bash
# NONE. Phase 2 adds zero runtime dependencies.
# All modules are Node 22 built-ins; zod is already installed.
```

**Version verification:** No new packages to verify. `zod@^3.25.76` and Node `>=22` are already pinned and installed (`package.json`, `node_modules/`, `.nvmrc`). `[VERIFIED: package.json + node_modules present]`

## Package Legitimacy Audit

> Phase 2 installs **no external packages**. Every capability is a Node 22 built-in or the already-installed `zod`. No legitimacy gate required.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `zod` | npm (already installed) | mature | very high | github.com/colinhacks/zod | OK | Already a dep — no new install |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                          npm run scrape  →  scraper/index.mjs  (orchestrator)
                                                     │
              ┌──────────────────────────────────────┼──────────────────────────────────┐
              │ inject { now, dataDir }               │   (deps injected for testability) │
              ▼                                        ▼                                   ▼
   ┌─────────────────────┐                  ┌─────────────────────┐            ┌─────────────────────┐
   │ readPrior(dataDir)  │                  │ fetchOffers()       │            │  clock = now()      │
   │  prior current-     │                  │  getKeys()  ─retry─►│            │  (single capture    │
   │  offers + status    │                  │  search()   ─retry─►│            │   at run start)     │
   └─────────┬───────────┘                  └─────────┬───────────┘            └─────────┬───────────┘
             │ prior snapshot               raw payload │ OR  total-failure              │
             │ (carry-forward source)       (results[]) │     (throws after retries)     │
             │                                          ▼                                 │
             │                          ┌───────────────────────────┐                    │
             │                          │ filterToAllowList(results) │ 5 slugs            │
             │                          └─────────────┬─────────────┘                    │
             │                                        ▼  per-store, fault-isolated        │
             │                          ┌───────────────────────────┐                    │
             │                          │ for each target slug:      │◄───────────────────┘ now
             │                          │  classify()  (matcher)     │
             │                          │  select(active-first,D-07) │
             │                          │  normalize(cents,Berlin)   │  ◄─ try/catch per store
             │                          │  → StoreOffer | needsReview│     (one store error
             │                          └─────────────┬─────────────┘      ≠ run abort)
             │                                        ▼
             │  store errored / total-fail   ┌─────────────────────────┐
             └──────────────────────────────►│ mergeWithPrior()        │ carry forward last-known
                                             │  build 3 in-memory docs │ freeze per-store ts on error
                                             └─────────────┬───────────┘
                                                           ▼  validate via contract/schema.mjs
                                             ┌─────────────────────────┐
                                             │ parseCurrentOffers()    │  THROW on drift
                                             │ parseStatusFile()       │  (before any write)
                                             │ parseHistoryLine() ×N   │
                                             └─────────────┬───────────┘
                                                           ▼
                                  ┌────────────────────────────────────────────┐
                                  │ writeAtomic(current-offers.json)  temp+rename│
                                  │ writeAtomic(status.json)          temp+rename│
                                  │ appendDedup(price-history.jsonl)  append last│
                                  └────────────────────────────────────────────┘
                                          run ALWAYS reaches here (D-02)
```

The orchestrator is the only impure unit; everything between `filterToAllowList` and the schema-validate step is a pure function of `(rawPayload, priorSnapshot, now)`. That is what makes the whole pipeline offline-testable against the captured fixture. `[ASSUMED]` (design recommendation grounded in D-02/D-04 + Phase 1 patterns)

### Recommended Project Structure
```
scraper/
├── index.mjs          # orchestrator + CLI entry (npm run scrape); the only impure module
├── fetch.mjs          # getKeys() + searchOffers() + withRetry() (native fetch, AbortSignal.timeout)
├── filter.mjs         # filterToAllowList(results) → Map<slug, rawOffer[]>
├── select.mjs         # selectForStore(candidates, now) → active-first / upcoming / lowest-price (D-07)
├── normalize.mjs      # toStoreOffer(offer, now) → cents, €/litre, Berlin YYYY-MM-DD (D-09); berlinDay(iso,now)
├── merge.mjs          # mergeWithPrior(results, prior, now) → {currentOffers, status} (D-04/D-06 carry-forward)
├── dedup.mjs          # historyLinesToAppend(offers, existingKeys, now) → JSONL lines (D-10)
├── io.mjs             # readPrior(), writeAtomic(), appendLines() (node:fs/promises, temp+rename)
└── clock.mjs          # makeClock() / systemNow() — injectable "now"
test/
├── scraper.fetch.test.mjs      # retry/backoff/timeout (inject a fake fetch)
├── scraper.select.test.mjs     # active-first / upcoming / tie-break (inject fixed now)
├── scraper.normalize.test.mjs  # cents rounding, Berlin trim, €/litre
├── scraper.merge.test.mjs      # carry-forward + frozen ts + cold-start serialization
├── scraper.dedup.test.mjs      # store+price+validFrom dedup; needsReview excluded
└── scraper.run.test.mjs        # end-to-end against raw-67105-search.json: all 3 files valid; fault paths
```

### Pattern 1: Per-attempt timeout + exponential backoff with jitter (D-11/D-12)
**What:** A small `withRetry(fn, { retries: 2, baseMs: 1000 })` that runs `fn(signal)` up to 3 times, each with a **fresh** `AbortSignal.timeout(10_000)`, sleeping `~1s` then `~3s` (with jitter) between attempts. Wraps both `getKeys()` and `searchOffers()`.
**When to use:** Every network call in `fetch.mjs`. On final failure it throws → orchestrator routes to the D-02(c) total-failure path.
**Example:**
```javascript
// scraper/fetch.mjs  [VERIFIED: AbortSignal.timeout is a function in Node 22; pattern per betterstack/tasukehub guides]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function withRetry(fn, { retries = 2, baseMs = 1000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    // Fresh signal PER ATTEMPT — never reuse an already-fired AbortSignal (undici #1926).
    const signal = AbortSignal.timeout(10_000);
    try {
      return await fn(signal);
    } catch (err) {
      lastErr = err;
      if (attempt === retries) break;
      // ~1s, ~3s exponential backoff + jitter (jitter avoids retry storms).
      const delay = baseMs * 3 ** attempt + Math.floor(Math.random() * 250);
      await sleep(delay);
    }
  }
  throw lastErr;
}

async function getJson(url, headers, signal) {
  const res = await fetch(url, { headers, signal });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  return res.json();
}
```
> **Gotcha [CITED: github.com/nodejs/undici#1926, #4032]:** `AbortSignal.timeout` must be created fresh inside each attempt. A signal that already fired stays aborted, so reusing one across retries makes every subsequent attempt fail instantly. Backoff `3 ** attempt` gives 1s then 3s (matching D-11's "~1s, ~3s"); jitter prevents synchronized retries.

### Pattern 2: Same-directory temp-file + atomic rename (atomic-write discretion item)
**What:** Write to `data/.current-offers.json.<rand>.tmp`, `fsync`-free `writeFile`, then `rename` over the real path. Because the temp file lives in the **same directory** as the target, `rename(2)` is a same-filesystem atomic swap — readers see either the old file or the new one, never a half-written one.
**When to use:** Both whole-file writes (`current-offers.json`, `status.json`). The JSONL history is **appended**, not rewritten (D-02), so it uses `appendFile` not temp+rename (see Pattern 3).
**Example:**
```javascript
// scraper/io.mjs  [VERIFIED: fs.promises.rename is a function; EXDEV-avoidance per nodejs/node#19077]
import { writeFile, rename } from "node:fs/promises";
import { randomBytes } from "node:crypto";

export async function writeAtomic(targetPath, text) {
  // CRITICAL: temp MUST be in the same directory as target so rename stays
  // same-filesystem (cross-device rename throws EXDEV — nodejs/node#19077).
  const tmp = `${targetPath}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(tmp, text, "utf8");
  await rename(tmp, targetPath); // atomic on same FS (Linux CI + local same-dir)
}
```
> **EXDEV caveat [CITED: nodejs/node#19077]:** `rename` is only atomic within one filesystem. Keeping the temp file in `data/` (alongside the target) guarantees this on the GitHub Actions Linux runner and on the dev box. Do **not** write the temp to `os.tmpdir()` — that can be a different device and throws `EXDEV`. (A rare Windows-with-encrypted-FS edge case exists, but CI is Linux and the data dir is plain.)

### Pattern 3: JSONL dedup-append (D-10/D-14)
**What:** Load existing `price-history.jsonl`, build a `Set` of `${store}|${price}|${validFrom}` keys, compute new lines for every clean-accept `status:"offer"` entry (NOT `needsReview`, including upcoming), skip any whose key already exists, then `appendFile` only the genuinely-new lines.
**When to use:** After the snapshot is built and validated, as the **last** write of the run.
**Example:**
```javascript
// scraper/dedup.mjs + io.mjs
const keyOf = (e) => `${e.store}|${e.price}|${e.validFrom}`; // frozen dedup key (D-14)

export function historyLinesToAppend(offers, existingKeys, now) {
  const date = berlinDay(now.toISOString(), now); // observation date (D-10)
  return offers
    .filter((o) => o.status === "offer" && !o.needsReview)
    .filter((o) => !existingKeys.has(keyOf(o)))
    .map((o) => JSON.stringify({
      date, store: o.store, price: o.price,
      pricePerLitre: o.pricePerLitre, validFrom: o.validFrom, validTo: o.validTo,
    }));
}
// append (never rewrite — D-02): await appendFile(path, lines.map(l => l + "\n").join(""), "utf8")
```
> Each line is run through `parseHistoryLine()` before append so a drifted record throws rather than corrupting the graph.

### Pattern 4: Injectable clock (injectable-clock discretion item)
**What:** A single `now` value (a `Date`) captured once at run start and threaded through `select`, `normalize`, and `merge`. In production `index.mjs` does `const now = new Date()`; in tests, pass a fixed `new Date("2026-06-15T10:00:00Z")`.
**When to use:** Anywhere "now" matters — active-range selection (D-07), history `date` (D-10), and the file-level `lastUpdated` bump (D-05). Never call `new Date()` deep inside a pure module; receive `now` as a parameter.
**Example:**
```javascript
// scraper/index.mjs
export async function run({ now = new Date(), dataDir, fetchOffers = realFetchOffers } = {}) { ... }
// test:  await run({ now: new Date("2026-06-15T10:00:00Z"), dataDir: tmp, fetchOffers: async () => fixture.results });
```
> This single seam makes the whole pipeline deterministic against `spike/fixtures/raw-67105-search.json` with no network and no wall-clock flakiness.

### Pattern 5: Berlin-day trim (D-09 normalization)
**What:** Convert an ISO-UTC `validityDates[].from/to` to a Berlin `YYYY-MM-DD` via `Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' })` (the `en-CA` locale emits `YYYY-MM-DD` directly). Verified: `2026-06-14T22:00:00Z` → `2026-06-15`, exactly the spike's documented boundary.
**Example:**
```javascript
// scraper/normalize.mjs  [VERIFIED: node runtime — Intl Europe/Berlin produced 2026-06-15 from 2026-06-14T22:00:00Z]
const BERLIN_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
});
export const berlinDay = (iso) => BERLIN_DAY.format(new Date(iso)); // → "YYYY-MM-DD"
// price → cents: Math.round(price * 100)  (D-09; Math.round avoids 5.99*100=598.9999)
// €/litre cents: Math.round(cents / 12)   (12×1L case — D-09/D-11)
```
> Do **not** trim in UTC — `2026-06-20T21:59:00Z` is `2026-06-20` in Berlin but a naive UTC `slice(0,10)` also gives `2026-06-20` only by luck; the `22:00:00Z` boundary is the one that shifts a day. Always go through `Intl`. `[CITED: spike/findings.md §4]`

### Anti-Patterns to Avoid
- **Calling `new Date()` inside pure modules** — breaks determinism; thread injected `now` instead.
- **Writing the temp file to `os.tmpdir()`** — different device → `EXDEV` on rename. Keep temp in `data/`.
- **Rewriting `price-history.jsonl` as an array** — forbidden (D-02 JSONL append-only; CLAUDE.md). Use `appendFile`.
- **Reusing one `AbortSignal.timeout` across retries** — fires once, then every retry fails instantly (undici #1926).
- **Per-store marktguru queries** — one call returns all advertisers (D-01); 5× volume violates good-citizen ToS.
- **Letting one store's parse error throw out of the run** — must be caught per store (D-02b); the run always writes all three files.
- **Caching bootstrap keys across runs** — D-12 says re-fetch every run; never persist/log keys (Phase 1 security rule).
- **Validating *after* writing** — validate every doc through `contract/schema.mjs` *before* the atomic write so a drifted payload throws instead of corrupting `data/`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-request timeout | Custom `Promise.race` + `setTimeout` | `AbortSignal.timeout(ms)` passed to `fetch` | Native one-liner in Node 22; auto-aborts the socket. |
| Timezone day trim | Manual UTC offset arithmetic / hard-coded `+2` | `Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Berlin'})` | DST-correct (CEST vs CET); the `+2` only holds in summer. |
| Output validation | Ad-hoc `if (typeof price !== 'number')` checks | `contract/schema.mjs` `parse*` helpers | Single source of truth, already throws on drift, shared with Phase 3. |
| 12×1L classification | New regex in the scraper | `import { classify } from "contract/matcher.mjs"` | Frozen, fixture-tested (38 tests). Re-implementing diverges the boundary. |
| Atomic file replace | `unlink` + `writeFile` sequence | temp + `rename` | `rename` is the atomic primitive; unlink-first leaves a window with no file. |
| HTTP client | `axios` / `node-fetch` install | native `fetch` | Built into Node 22; CLAUDE.md forbids the deps. |
| Dedup store | SQLite / JSON array index | in-memory `Set` of `store|price|validFrom` | One product × 5 stores × weekly — a Set over the existing JSONL is sufficient. |

**Key insight:** This phase's correctness lives in *reuse and ordering*, not in new code. The two genuinely-new pieces are the retry wrapper and the atomic-write helper — both ~10 lines of Node built-ins. Everything else is composing frozen Phase 1 assets in a fault-isolated order.

## Runtime State Inventory

> Phase 2 is greenfield producer code (new `scraper/` modules), not a rename/refactor. No pre-existing runtime state is being renamed or migrated. The only persistent state it interacts with is the three `data/` files it both reads (prior snapshot) and writes — that read-prior-then-merge flow is the D-04 carry-forward, documented under Pattern 4 / Common Pitfalls, not a migration.

**Stored data:** None to migrate — `data/*.json(l)` are seed fixtures the scraper will overwrite/append on first real run. **Live service config / OS-registered state / secrets:** None — cron wiring and any secrets are explicitly Phase 4. The bootstrap keys are fetched per-run and never persisted (D-12). **Build artifacts:** None — no compile step; ESM runs directly. *(None found in any category — verified against the repo file listing and CONTEXT scope.)*

## Common Pitfalls

### Pitfall 1: Cold-start serialization rejected by the `.strict()` + `status:"offer"` superRefine (D-06)
**What goes wrong:** On a cold start (no prior `data/` files) with a fetch failure, you cannot write the errored store as `status:"offer"` (no price fields exist), and the `superRefine` *requires* price/currency/pricePerLitre/validFrom/validTo whenever `status==="offer"`. Writing `status:"error"` into `current-offers.json` is also wrong — `STATUS_VALUES` allows `error`, but the **brother-facing snapshot** convention (CONTEXT D-06) is that a store with no carry-forward data appears as `no_offer` in `current-offers.json` while the *fault* is recorded as `error` in `status.json`.
**Why it happens:** Two files encode two different facts — `current-offers.json` says "what to show", `status.json` says "did the fetch work". A cold-start error has nothing to show.
**How to avoid:** Cold-start errored store → `{ status: "no_offer" }` in `current-offers.json` (satisfies "5 stores once each", needs no offer fields) **and** `{ status: "error" }` with a frozen/synthetic `lastUpdated` in `status.json`. **Planner: confirm this exact serialization against `StoreOfferSchema` — the schema permits `no_offer` with no offer fields, so this validates.** `[CITED: contract/schema.mjs superRefine + CONTEXT D-06]`
**Warning signs:** `parseCurrentOffers` throwing `status:"offer" requires price` during a test of the total-failure path.

### Pitfall 2: Carry-forward must copy the prior entry *verbatim*, including offer fields (D-04)
**What goes wrong:** On a warm error (prior data exists, this run can't refresh a store), emitting `status:"error"` in `current-offers.json` would drop the last-known price and break "show last-known with a stale warning."
**Why it happens:** Conflating the snapshot file with the status file.
**How to avoid:** In `current-offers.json`, **copy the store's previous entry verbatim** (status stays `offer` with its prior price/dates → schema stays valid). In `status.json`, set that store `status:"error"` and **do NOT bump its per-store `lastUpdated`** (leave the old value → PWA derives `stale`). `[CITED: CONTEXT D-04]`
**Warning signs:** A store's price disappearing from the snapshot after a transient fetch failure; per-store `lastUpdated` advancing on an errored store.

### Pitfall 3: Two `lastUpdated` meanings (D-05)
**What goes wrong:** Bumping per-store `lastUpdated` on every run makes a permanently-erroring store look fresh forever; not bumping the file-level `lastUpdated` makes a healthy job look dead.
**How to avoid:** File-level `lastUpdated` (top of both files) = wall-clock run time — **always bumps** (`now.toISOString()`). Per-store `lastUpdated` (in `status.json` `stores[]`) = last *successful* refresh — bumps **only** on a successful fetch+parse for that store; frozen on `error`/`unavailable`. `[CITED: CONTEXT D-05]`
**Warning signs:** A store stuck on `error` never going stale in the PWA.

### Pitfall 4: `needsReview` leaking into history / overriding a clean accept (D-08/D-10)
**What goes wrong:** Appending a `review` candidate's price to `price-history.jsonl` pollutes the graph with an unverified price; or a `review` candidate displacing a clean `accept` for the same store.
**How to avoid:** History append filters `o.status === "offer" && !o.needsReview` (D-10). Selection: a `review` candidate is only emitted (with `needsReview:true`) when the store has **no** clean accept; a clean accept always wins (D-08). `[CITED: CONTEXT D-08/D-10]`
**Warning signs:** A history line whose price never appears in any clean offer.

### Pitfall 5: Active-range selection trimmed/compared in the wrong timezone (D-07/D-09)
**What goes wrong:** Comparing `validityDates[].from/to` against "now" in UTC, or picking the wrong range, mislabels an active offer as upcoming (or vice-versa) — the brother is shown next week's deal as if buyable today.
**How to avoid:** Convert both the range bounds and "now" to Berlin days, then: prefer a range covering today (active); else the earliest future `from` (upcoming); tie-break lowest price within the chosen tier. A `validityDates` array can hold multiple ranges — iterate all. `[CITED: spike/findings.md §4 + CONTEXT D-07]`
**Warning signs:** An offer with a future `validFrom` selected over a currently-active one.

### Pitfall 6: Wasgau or a total failure mutating the wrong stores (D-02/D-03)
**What goes wrong:** The total-failure path sweeping Wasgau into `error`, or an absent store being marked `error` instead of `no_offer`.
**How to avoid:** Wasgau is **always `unavailable`** regardless of fetch outcome (D-03) — it is never touched by the total-failure sweep. A store **absent from a successful** result set = `no_offer` (normal). Only a normally-fetchable store that *can't be refreshed after retries* = `error`. `[CITED: CONTEXT D-02/D-03]`
**Warning signs:** Wasgau showing `error`; Lidl showing `error` in a week it simply had no offer.

## Code Examples

### Resolve the offers array (wrapper-key defence, carried from the spike)
```javascript
// scraper/fetch.mjs — reuse the probe's defensive resolution [CITED: spike/probe.mjs + findings.md §1]
const resolveResults = (data) =>
  Array.isArray(data) ? data
  : Array.isArray(data?.results) ? data.results      // confirmed live key
  : Array.isArray(data?.data) ? data.data
  : (Object.values(data ?? {}).find(Array.isArray) ?? []);
```

### Filter to the 5-slug allow-list (client-side, D-01)
```javascript
// scraper/filter.mjs
const SLUG_TO_STORE = { rewe: "REWE", edeka: "Edeka", lidl: "Lidl", kaufland: "Kaufland" };
// Wasgau intentionally absent — it is never a marktguru slug (D-03).
export function filterToAllowList(results) {
  const byStore = new Map(Object.values(SLUG_TO_STORE).map((s) => [s, []]));
  for (const offer of results) {
    for (const a of offer?.advertisers ?? []) {
      const store = SLUG_TO_STORE[a?.uniqueName];
      if (store) byStore.get(store).push(offer);
    }
  }
  return byStore; // Map<"REWE"|"Edeka"|"Lidl"|"Kaufland", rawOffer[]>
}
```

### Per-store fault-isolated build (D-02b)
```javascript
// scraper/index.mjs (excerpt) — one store throwing never aborts the run
for (const store of ["REWE", "Edeka", "Lidl", "Kaufland"]) {
  try {
    const candidates = (byStore.get(store) ?? []).filter((o) => classify(o) !== "reject");
    storeOffers[store] = buildStoreOffer(store, candidates, now); // select+normalize; may be no_offer
  } catch (err) {
    storeOffers[store] = carryForwardOrColdStart(store, prior, now); // D-04 / D-06
    statusOverrides[store] = "error";                                // D-05: don't bump per-store ts
  }
}
storeOffers.Wasgau = { store: "Wasgau", displayName: "Wasgau", status: "unavailable" }; // D-03 always
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `node-fetch` / `axios` for HTTP | native global `fetch` (undici) | Node 18+ (stable) | No HTTP dep needed on Node 22. `[VERIFIED: node runtime]` |
| `setTimeout` + manual `AbortController` | `AbortSignal.timeout(ms)` | Node 17.3+ / 18 | One-liner request timeout. `[VERIFIED: node runtime]` |
| `Date` + manual tz offset | `Intl.DateTimeFormat` tz / (future) `Temporal` | `Intl` long stable; `Temporal` not in Node 22 stable | Use `Intl` now; DST-safe. `[VERIFIED: node runtime]` |
| Jest / Mocha | `node:test` built-in runner | Node 18+ stable | Zero test deps — already the project's runner. `[VERIFIED: package.json]` |

**Deprecated/outdated:**
- `node-fetch`, `axios`, `request` for this project — superseded by native `fetch` (and forbidden by CLAUDE.md).
- Writing history as a rewritten JSON array — superseded by append-only JSONL (D-02).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The orchestrator/module decomposition (fetch/filter/select/normalize/merge/dedup/io/clock) is the right seam set | Architecture Patterns / Structure | Low — it is a discretion item (CONTEXT); any decomposition that keeps units pure-testable satisfies the phase. Planner may rename/merge modules. |
| A2 | Cold-start errored store serializes as `no_offer` in current-offers.json + `error` in status.json | Pitfall 1 | Medium — CONTEXT D-06 explicitly asks the planner to *confirm* the exact serialization against the schema. The schema *permits* this combination (verified), but the convention should be re-checked when the merge module is planned. |
| A3 | `referencePrice` is not used; `pricePerLitre` is recomputed as `Math.round(cents/12)` | normalize (Pattern 5) | Low — D-09/D-11 mandate scraper-computed €/litre = price÷12 so PWA and history agree; `referencePrice` is only a sanity cross-check. |
| A4 | GitHub Actions runner + dev machine keep `data/` on one filesystem so `rename` stays atomic | Pattern 2 | Low — CI is Linux, temp lives in `data/`. A Windows-encrypted-FS dev edge case exists but does not affect CI. |

**If this table looks short:** it is — the field-name, slug, date, and price facts that would normally be assumptions were already *verified live* in Phase 1 and are cited, not assumed.

## Open Questions

1. **Exact cold-start status.json `lastUpdated` for a never-refreshed store**
   - What we know: per-store `lastUpdated` must be a valid ISO-UTC string (schema `IsoUtc`) and must NOT bump on error.
   - What's unclear: on a true cold start there is no prior per-store timestamp to freeze. A synthetic value is needed to satisfy the schema.
   - Recommendation: use the run's `now.toISOString()` for the *first ever* write of a never-seen store (there is no older value to preserve), and freeze thereafter. Planner to confirm against D-05 intent. Low risk — only affects the very first run.

2. **Whether `displayName` ever differs from `store`**
   - What we know: all current fixtures use `displayName === store` (e.g. `"REWE"`).
   - What's unclear: no requirement distinguishes them in Phase 2.
   - Recommendation: set `displayName = store` (identity) unless Phase 3 surfaces a need. Trivial to change.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js ≥22 | Entire scraper (native fetch, AbortSignal.timeout, Intl tz, node:test) | ✓ | `>=22` pinned; local runtime v24 (superset) | — |
| `zod` | Output validation via `contract/schema.mjs` | ✓ | ^3.25.76 installed | — |
| Network to `marktguru.de` / `api.marktguru.de` | Live `npm run scrape` only | runtime-dependent | — | **All tests run offline** against `spike/fixtures/raw-67105-search.json`; live run deferred to manual/Phase 4 |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** Live marktguru reachability is **not required for this phase's tests** — the entire pipeline is validated offline by injecting the captured fixture as the fetch result. A live smoke run is a nice-to-have here and the end-to-end loop is Phase 4. `[VERIFIED: spike/fixtures present + injectable-fetch design]`

## Validation Architecture

> `workflow.nyquist_validation` is `false` in `.planning/config.json`, so the structured Nyquist test-map is **not required**. The following is the recommended offline test approach (kept lightweight, mirroring Phase 1's `node:test` style) because the phase is logic-dense and the fixtures make full offline coverage cheap.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` + `node:assert/strict` (built-in, Node 22) |
| Config file | none — `npm test` → `node --test` discovers `test/*.test.mjs` |
| Quick run command | `node --test test/scraper.select.test.mjs` (single unit) |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Approach (offline, fixture-driven) | File Exists? |
|--------|----------|-----------|-------------------------------------|-------------|
| DATA-01 | Auto-fetch + filter to 5 stores, write valid `current-offers.json` | integration | Inject `raw-67105-search.json` as fetch result; assert `parseCurrentOffers` passes, 5 stores once each | ❌ new `test/scraper.run.test.mjs` |
| DATA-03 | Normalize price(cents, excl. Pfand), €/litre, store, Berlin dates | unit | `normalize` on synthesized accept fixture → `price:1199`, `pricePerLitre:100`, Berlin `validFrom/To` | ❌ new `test/scraper.normalize.test.mjs` |
| DATA-04 | Dedup-append history on the frozen key, no dupes on re-run | unit | Run dedup twice with same offer → second yields 0 new lines; `needsReview` excluded | ❌ new `test/scraper.dedup.test.mjs` |
| DATA-05 | Per-store error isolated; last-known preserved; store marked stale | integration | Inject a fetch that throws / a store that throws normalize → run completes, prior price carried forward, per-store ts frozen | ❌ new `test/scraper.merge.test.mjs` + `scraper.run.test.mjs` |
| DATA-06 | Per-store status + file/per-store `lastUpdated` recorded | unit/integration | Assert `status.json` validates; file-level ts == injected now; errored store's per-store ts unchanged | ❌ new `test/scraper.run.test.mjs` |
| (D-07) | Active-first / upcoming / lowest-price selection | unit | Fixed `now`; multi-range candidates → assert chosen entry | ❌ new `test/scraper.select.test.mjs` |
| (D-11) | Retry/backoff/timeout on transient failure | unit | Inject a fake fetch failing N times then succeeding → assert retried; failing always → throws | ❌ new `test/scraper.fetch.test.mjs` |

### Sampling Rate
- **Per task commit:** the unit file for the module touched (`node --test test/scraper.<unit>.test.mjs`).
- **Per wave/plan merge:** `npm test` (whole suite, incl. the frozen Phase 1 contract + matcher tests — must stay green).
- **Phase gate:** `npm test` fully green; one optional manual `npm run scrape` live smoke (network permitting) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `test/scraper.fetch.test.mjs` — retry/backoff/timeout (inject fake fetch) — D-11
- [ ] `test/scraper.select.test.mjs` — active-first/upcoming/tie-break — D-07
- [ ] `test/scraper.normalize.test.mjs` — cents/Berlin-trim/€-litre — DATA-03
- [ ] `test/scraper.merge.test.mjs` — carry-forward + frozen ts + cold-start — DATA-05/D-04/D-06
- [ ] `test/scraper.dedup.test.mjs` — dedup key + needsReview exclusion — DATA-04
- [ ] `test/scraper.run.test.mjs` — end-to-end against `raw-67105-search.json`; all 3 files valid; fault paths — DATA-01/05/06
- [ ] No framework install needed — `node:test` is built in.

## Security Domain

> `security_enforcement: true`, `security_asvs_level: 1` in config — section required.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No user auth; bootstrap keys are public homepage values (Phase 1 finding) |
| V3 Session Management | no | Stateless batch job |
| V4 Access Control | no | No multi-user surface |
| V5 Input Validation | **yes** | All external (marktguru) data is parsed through `contract/schema.mjs` `.strict()` schemas before write; `classify()` regexes are ReDoS-safe (anchored, bounded — Phase 1 threat T-03-01) |
| V6 Cryptography | no | No secrets stored; `randomBytes` used only for temp-file suffix uniqueness, not security |
| V7/V8 Error/Logging | **yes** | Bootstrap keys NEVER logged or written to disk (Phase 1 security rule, carried in D-12); errors log message only, not key values |

### Known Threat Patterns for {Node ETL ingesting an untrusted third-party JSON API}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Drifted/malicious marktguru payload corrupts `data/` | Tampering | Validate every doc via `parse*` before atomic write; throw (don't write) on drift |
| ReDoS via adversarial offer text | DoS | Reuse the frozen matcher's anchored/bounded regexes (T-03-01) — no new unbounded regex in the scraper |
| Half-written file on crash leaves corrupt snapshot | Tampering/Availability | temp-file + atomic `rename`; history is append-only |
| Bootstrap-key leakage via logs/commits | Info Disclosure | Keys never logged/persisted (D-12); only presence reported |
| Hammering the unofficial API | (good-citizen/ToS) | One call per run, ≤3 attempts, descriptive UA, no parallelism (D-01/D-11/D-12) |
| Unbounded payload / memory | DoS | `limit=200` caps result size; single product domain — bounded |

## Sources

### Primary (HIGH confidence — in-repo, verified this session)
- `contract/schema.mjs` — output schemas, `.strict()`, `status:"offer"` superRefine, `parse*` helpers (validation gate)
- `contract/matcher.mjs` — `classify()/normalize()` reused per-offer (D-08/D-09 selection)
- `spike/findings.md` — wrapper key `results` (§1), 5-slug verdict (§2), Wasgau `unavailable` (§3), `validityDates` Berlin-day rule (§4), `price` decimal→cents (§5)
- `spike/probe.mjs` — `getKeys()` bootstrap parse + fetch + defensive wrapper resolution + good-citizen/security comments
- `spike/fixtures/raw-67105-search.json` — live field-name truth: `advertisers[].uniqueName`, `price`, `validityDates[]{from,to}`, `referencePrice`, `unit.shortName`
- `test/schema.test.mjs`, `test/matcher.test.mjs` — `node:test` patterns to mirror
- `package.json`, `.nvmrc` — Node ≥22, zod-only, `node --test`
- `.planning/phases/02-core-scraper/02-CONTEXT.md` — D-01..D-12 (the authoritative phase spec)
- Local Node runtime probe — confirmed `AbortSignal.timeout`, `AbortSignal.any`, `fs.promises.rename`, `Intl Europe/Berlin → 2026-06-15` from `2026-06-14T22:00:00Z`

### Secondary (MEDIUM confidence — official issue trackers / guides, web-verified)
- [nodejs/node#19077](https://github.com/nodejs/node/issues/19077) — `fs.rename` is same-filesystem only (EXDEV across devices) → temp must live in `data/`
- [nodejs/undici#1926](https://github.com/nodejs/undici/issues/1926) — `AbortSignal.timeout` reuse gotcha → fresh signal per retry attempt
- [Better Stack — Timeouts in Node.js](https://betterstack.com/community/guides/scaling-nodejs/nodejs-timeouts/), [Tasuke Hub — fetch timeout/retry guide](https://tasukehub.com/articles/nodejs-fetch-timeout-retry-guide?lang=en) — `AbortSignal.timeout` + exponential-backoff-with-jitter retry pattern

### Tertiary (LOW confidence)
- None — every load-bearing claim is either in-repo or backed by an official source above.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new deps; all built-ins verified against the live runtime and `package.json`.
- Architecture / module decomposition: MEDIUM-HIGH — grounded in D-02/D-04 and Phase 1 patterns; exact module boundaries are a discretion item (A1).
- Open implementation patterns (retry, atomic write, clock, Berlin trim): HIGH — verified Node 22 native APIs + official issue-tracker caveats.
- Pitfalls / serialization (esp. cold-start D-06): HIGH on the rule, MEDIUM on exact serialization (A2 — CONTEXT asks the planner to confirm against the schema).

**Research date:** 2026-06-15
**Valid until:** 2026-07-15 (stable — Node 22 built-ins and a frozen Phase 1 contract; marktguru shape is already captured as a fixture so live drift does not invalidate the *design*, only a future live run).

Sources:
- [nodejs/node#19077](https://github.com/nodejs/node/issues/19077)
- [nodejs/undici#1926](https://github.com/nodejs/undici/issues/1926)
- [Better Stack — Timeouts in Node.js](https://betterstack.com/community/guides/scaling-nodejs/nodejs-timeouts/)
- [Tasuke Hub — fetch timeout/retry guide](https://tasukehub.com/articles/nodejs-fetch-timeout-retry-guide?lang=en)
