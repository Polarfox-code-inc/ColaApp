# Phase 2: Core Scraper - Pattern Map

**Mapped:** 2026-06-15
**Files analyzed:** 17 (9 new `scraper/` modules + 6 new test files + 1 modified `package.json` + 1 reused contract import surface)
**Analogs found:** 17 / 17 (every new file has an in-repo analog — this phase is composition + reuse, not greenfield invention)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `scraper/index.mjs` | orchestrator / CLI entry | request-response + file-I/O | `spike/probe.mjs` (`main()` + top-level `.catch`) | role-match (probe is the only existing entrypoint; needs DI seams it lacks) |
| `scraper/fetch.mjs` | service (network I/O) | request-response | `spike/probe.mjs` (`getKeys()` + offers/search fetch) | exact — refactor the probe's two fetches + add retry/timeout |
| `scraper/filter.mjs` | utility (pure transform) | transform | `contract/matcher.mjs` (`normalize()` pure-fn shape) | role-match (pure fn over offers; slug map is new) |
| `scraper/select.mjs` | utility (pure transform) | transform | `contract/matcher.mjs` (`classify()` decision ladder) | role-match (pure decision ladder over candidates) |
| `scraper/normalize.mjs` | utility (pure transform) | transform | `contract/matcher.mjs` (`normalize()`) + `data/current-offers.json` (output shape) | exact — produces a `StoreOffer` object |
| `scraper/merge.mjs` | utility (pure transform) | transform + file-state | `data/current-offers.json` + `data/status.json` (output shapes) | role-match (carry-forward logic is new; output shapes exist) |
| `scraper/dedup.mjs` | utility (pure transform) | transform | `data/price-history.jsonl` (line shape) + `contract/schema.mjs` `HistoryLineSchema` | exact — emits validated JSONL lines |
| `scraper/io.mjs` | utility (filesystem) | file-I/O | `spike/probe.mjs` (`writeFile`/`mkdir`/`HERE`/`fileURLToPath` path resolution) | role-match (adds read-prior + temp+rename atomic write) |
| `scraper/clock.mjs` | utility (provider) | — | (none — trivial new seam) | no analog (≈3 lines; see "No Analog Found") |
| `test/scraper.fetch.test.mjs` | test | — | `test/matcher.test.mjs` / `test/schema.test.mjs` | exact — `node:test` + `assert/strict` |
| `test/scraper.select.test.mjs` | test | — | `test/matcher.test.mjs` (verdict-per-fixture loop) | exact |
| `test/scraper.normalize.test.mjs` | test | — | `test/schema.test.mjs` (parse + assert.equal on fields) | exact |
| `test/scraper.merge.test.mjs` | test | — | `test/schema.test.mjs` (`assert.throws` / `doesNotThrow`) | exact |
| `test/scraper.dedup.test.mjs` | test | — | `test/schema.test.mjs` (JSONL line parse loop, lines 207-217) | exact |
| `test/scraper.run.test.mjs` | test | — | `test/schema.test.mjs` (fixture-driven file validation) | role-match (adds tmp dataDir + injected fetch) |
| `package.json` (modify) | config | — | existing `scripts` block (`probe` script) | exact — add `"scrape": "node scraper/index.mjs"` |
| (reused) `contract/schema.mjs`, `contract/matcher.mjs` | import-and-reuse | — | themselves | N/A — imported verbatim, never modified |

## Pattern Assignments

### `scraper/fetch.mjs` (service, request-response)

**Analog:** `spike/probe.mjs` — refactor `getKeys()` and the offers/search call out of `main()` into reusable functions, then wrap both in a `withRetry` helper (the one genuinely new piece, ~12 lines per RESEARCH Pattern 1).

**Imports / constants pattern** (`spike/probe.mjs` lines 25-37) — carry over verbatim, dropping `writeFile`:
```javascript
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const UA = "colaapp-spike/0.1 (personal, low-volume)"; // bump label to colaapp-scraper
const HOME = "https://www.marktguru.de/";
const API = "https://api.marktguru.de/api/v1/offers/search";
const ZIP = "67105";
const QUERY = "coca cola";
```

**Bootstrap-key parse pattern** (`spike/probe.mjs` lines 45-70) — copy `getKeys()` near-verbatim; it already (a) iterates ALL `<script type="application/json">` islands and selects by `config.apiKey` presence (NOT a fixed index — the probe's own comment on line 63 instructs Phase 2 to do exactly this), and (b) uses a bounded non-greedy regex (line 52) that is ReDoS-safe (V5/T-01-01). The ONLY change: it must receive an injected `signal` and run inside `withRetry`:
```javascript
const blocks = [...html.matchAll(/<script\s+type="application\/json">(.*?)<\/script>/gms)];
for (let i = 0; i < blocks.length; i++) {
  let parsed;
  try { parsed = JSON.parse(blocks[i][1]); } catch { continue; }
  if (parsed?.config?.apiKey && parsed?.config?.clientKey) {
    return { apiKey: parsed.config.apiKey, clientKey: parsed.config.clientKey };
  }
}
```
**SECURITY (carry the probe's comment, lines 16-21):** keys are NEVER logged and NEVER written to disk — only presence reported (D-12, ASVS V7). The retry/error path must log `err.message` only, never the key values or the raw header object.

**Offers/search call pattern** (`spike/probe.mjs` lines 75-86) — the headers and URL are correct as-is:
```javascript
const url = `${API}?as=web&q=${encodeURIComponent(QUERY)}&zipCode=${ZIP}&limit=200&offset=0`;
const res = await fetch(url, {
  headers: { "x-apikey": apiKey, "x-clientkey": clientKey, "user-agent": UA },
  signal, // NEW: from AbortSignal.timeout(10_000) inside withRetry
});
if (!res.ok) throw new Error(`offers/search failed: HTTP ${res.status} ${res.statusText}`);
```

**Wrapper-key resolution pattern** (`spike/probe.mjs` lines 96-115) — collapse the probe's verbose if-ladder into the compact `resolveResults` from RESEARCH (semantically identical, `results` is the confirmed live key):
```javascript
const resolveResults = (data) =>
  Array.isArray(data) ? data
  : Array.isArray(data?.results) ? data.results   // confirmed live wrapper key
  : Array.isArray(data?.data) ? data.data
  : (Object.values(data ?? {}).find(Array.isArray) ?? []);
```

**Retry wrapper (NEW — RESEARCH Pattern 1):** fresh `AbortSignal.timeout(10_000)` per attempt (never reuse — undici #1926), backoff `baseMs * 3 ** attempt + jitter` → ~1s, ~3s, 3 attempts total (D-11). Wraps BOTH `getKeys()` and the search call. On final failure it throws → orchestrator routes to the D-02(c) total-failure path.

**Good-citizen (carry probe comment lines 20-21):** native `fetch` only, single low-volume call, descriptive UA, no parallelism (D-01/D-12, CLAUDE.md ToS).

---

### `scraper/filter.mjs` (utility, transform)

**Analog:** `contract/matcher.mjs` `normalize()` (lines 28-41) — same shape: a pure, exported, side-effect-free function over a marktguru offer. Use the RESEARCH `filterToAllowList` body. Slug map from the **live** fixture (`advertisers[].uniqueName` is confirmed lowercase-slug, e.g. `"netto-marken-discount"`, verified in `spike/fixtures/raw-67105-search.json`):
```javascript
const SLUG_TO_STORE = { rewe: "REWE", edeka: "Edeka", lidl: "Lidl", kaufland: "Kaufland" };
// Wasgau intentionally absent — never a marktguru slug at 67105 (D-03 → always "unavailable").
export function filterToAllowList(results) {
  const byStore = new Map(Object.values(SLUG_TO_STORE).map((s) => [s, []]));
  for (const offer of results) {
    for (const a of offer?.advertisers ?? []) {
      const store = SLUG_TO_STORE[a?.uniqueName];
      if (store) byStore.get(store).push(offer);
    }
  }
  return byStore;
}
```
> Use the same optional-chaining defensive style as `matcher.normalize()` (`offer?.advertisers ?? []`) — the input is untrusted third-party JSON (ASVS V5).

---

### `scraper/select.mjs` (utility, transform)

**Analog:** `contract/matcher.mjs` `classify()` (lines 69-101) — copy its **numbered decision-ladder structure** (one guard per rule, early-return, a closing comment per branch). The selection rule is the D-07 ladder over candidates already passed through `classify(o) !== "reject"`:
1. Convert each candidate's `validityDates[].from/to` AND `now` to Berlin days (use `berlinDay` from `normalize.mjs`).
2. Prefer a range covering today → **active**; tie-break lowest `price`.
3. Else earliest future `from` → **upcoming**; tie-break lowest `price`.
4. A `review` candidate is emitted with `needsReview:true` ONLY when there is no clean `accept` (D-08); a clean accept always wins.

A `validityDates` array can hold multiple ranges — iterate all (RESEARCH Pitfall 5). Receive `now` as a parameter — never call `new Date()` here (RESEARCH Pattern 4 / Anti-Patterns).

---

### `scraper/normalize.mjs` (utility, transform)

**Analog:** `contract/matcher.mjs` `normalize()` (export style) for the function surface; `data/current-offers.json` lines 5-14 for the exact **output object shape** it must produce (a `status:"offer"` StoreOffer):
```json
{ "store": "REWE", "displayName": "REWE", "status": "offer", "needsReview": false,
  "price": 999, "currency": "EUR", "pricePerLitre": 83,
  "validFrom": "2026-06-16", "validTo": "2026-06-21" }
```

**Berlin-day trim (RESEARCH Pattern 5)** — `Intl`, never UTC `slice` (D-09, findings §4):
```javascript
const BERLIN_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
});
export const berlinDay = (iso) => BERLIN_DAY.format(new Date(iso)); // "YYYY-MM-DD"
```

**Cents rules (D-09/D-11):** `price` (decimal euro from the fixture, e.g. `8.88`) → `Math.round(price * 100)` integer cents; `pricePerLitre` → `Math.round(cents / 12)` (12×1L case). `currency` is the literal `"EUR"`. **No Pfand field is ever produced** (D-10 — the schema `.strict()` would reject one; see `test/schema.test.mjs` lines 89-98). `referencePrice` is ignored except as an optional sanity cross-check (RESEARCH A3).

> Input field names are confirmed in `spike/fixtures/raw-67105-search.json`: `price` (decimal), `validityDates: [{from, to}]` ISO-UTC (verified `"2026-06-14T22:00:00Z"` → Berlin `2026-06-15`).

---

### `scraper/merge.mjs` (utility, transform + file-state)

**Analog:** `data/current-offers.json` + `data/status.json` (the two output documents it assembles), and `test/schema.test.mjs` lines 70-77 (the `no_offer`-without-offer-fields shape that cold-start uses).

This is the densest **new** logic — no verbatim analog, but the rules are fully specified:
- **Warm error / total fail (D-04):** copy the prior store entry **verbatim** from prior `current-offers.json` (status stays `"offer"` with its prior price/dates → schema stays valid). In `status.json` set that store `status:"error"` and **do NOT bump** its per-store `lastUpdated` (RESEARCH Pitfall 2).
- **Absent from a successful result set:** `no_offer` (normal weekly outcome — Lidl this week). NOT `error`.
- **Cold start + fail (D-06, RESEARCH Pitfall 1 / A2):** errored store → `{status:"no_offer"}` in `current-offers.json` (satisfies "5 stores once each", needs no offer fields) AND `{status:"error"}` in `status.json` with a synthetic `now.toISOString()` per-store `lastUpdated` (Open Q1). **Planner: confirm this exact serialization against `StoreOfferSchema.superRefine` (schema.mjs lines 62-74) — `no_offer` with no offer fields validates; `offer` without price throws.**
- **Two timestamps (D-05, Pitfall 3):** file-level `lastUpdated` = `now.toISOString()` (always bumps); per-store `lastUpdated` bumps only on successful fetch+parse.
- **Wasgau (D-03):** always `{store:"Wasgau", displayName:"Wasgau", status:"unavailable"}` — never swept into the total-failure error path.

**Fault-isolated build skeleton (RESEARCH Code Examples, "Per-store fault-isolated build")** — mirror this try/catch-per-store loop in the orchestrator:
```javascript
for (const store of ["REWE", "Edeka", "Lidl", "Kaufland"]) {
  try {
    const candidates = (byStore.get(store) ?? []).filter((o) => classify(o) !== "reject");
    storeOffers[store] = buildStoreOffer(store, candidates, now);
  } catch (err) {
    storeOffers[store] = carryForwardOrColdStart(store, prior, now); // D-04 / D-06
    statusOverrides[store] = "error";                                // D-05: freeze per-store ts
  }
}
storeOffers.Wasgau = { store: "Wasgau", displayName: "Wasgau", status: "unavailable" }; // D-03
```

---

### `scraper/dedup.mjs` (utility, transform)

**Analog:** `data/price-history.jsonl` (exact line shape) + `contract/schema.mjs` `HistoryLineSchema` (lines 112-121). Existing seeded lines show the target:
```
{"date":"2026-06-15","store":"REWE","price":999,"pricePerLitre":83,"validFrom":"2026-06-16","validTo":"2026-06-21"}
```

**Dedup pattern (RESEARCH Pattern 3, D-10/D-14):** build a `Set` of the frozen key `${store}|${price}|${validFrom}` from existing lines; emit a line for every `status:"offer" && !needsReview` entry (including upcoming) whose key is new:
```javascript
const keyOf = (e) => `${e.store}|${e.price}|${e.validFrom}`; // frozen D-14 key
export function historyLinesToAppend(offers, existingKeys, now) {
  const date = berlinDay(now.toISOString()); // observation date (D-10)
  return offers
    .filter((o) => o.status === "offer" && !o.needsReview)
    .filter((o) => !existingKeys.has(keyOf(o)))
    .map((o) => JSON.stringify({ date, store: o.store, price: o.price,
      pricePerLitre: o.pricePerLitre, validFrom: o.validFrom, validTo: o.validTo }));
}
```
Run each line through `parseHistoryLine()` (schema.mjs line 144) before append so a drifted record throws. `needsReview` candidates are excluded (Pitfall 4).

---

### `scraper/io.mjs` (utility, filesystem)

**Analog:** `spike/probe.mjs` lines 25-37 + 89-90 — carry the cwd-independent path resolution (`dirname(fileURLToPath(import.meta.url))`, the `HERE`/`FIXTURE` pattern) and the `mkdir(..., {recursive:true})` + `writeFile(..., "utf8")` style.

**Atomic write (NEW — RESEARCH Pattern 2):** temp file in the **same directory** as target (EXDEV — nodejs/node#19077), then `rename`:
```javascript
import { writeFile, rename, readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
export async function writeAtomic(targetPath, text) {
  const tmp = `${targetPath}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(tmp, text, "utf8");
  await rename(tmp, targetPath); // atomic on same FS
}
```
- `readPrior(dataDir)` — `readFile` the prior `current-offers.json` + `status.json`; tolerate ENOENT (cold start → return nulls).
- `appendLines(path, lines)` — `appendFile(path, lines.map(l => l + "\n").join(""), "utf8")`. History is **append-only**, NEVER rewritten as an array (D-02, schema test lines 211-212).
- **Write order (RESEARCH diagram):** atomic `current-offers.json`, atomic `status.json`, then append history **last**.

---

### Test files — all mirror `test/matcher.test.mjs` / `test/schema.test.mjs`

**Shared test harness pattern** (`test/matcher.test.mjs` lines 1-9, `test/schema.test.mjs` lines 1-16):
```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
```

| Test file | Analog excerpt to copy | What it asserts |
|-----------|------------------------|-----------------|
| `scraper.fetch.test.mjs` | `assert.throws` / counting pattern | inject a fake fetch failing N times → assert retried then succeeds; always-fail → throws (D-11) |
| `scraper.select.test.mjs` | `matcher.test.mjs` lines 31-47 (loop-per-case) | fixed `now`, multi-range candidates → assert chosen entry (active > upcoming, tie lowest price) (D-07) |
| `scraper.normalize.test.mjs` | `schema.test.mjs` lines 30-42 (parse + `assert.equal` on fields) | `price:1199`, `pricePerLitre:100`, Berlin `validFrom/To` from `2026-..T22:00:00Z` |
| `scraper.merge.test.mjs` | `schema.test.mjs` lines 59-77, 100-123 (`throws`/`doesNotThrow`) | carry-forward verbatim, frozen per-store ts, cold-start `no_offer`+`error` serialization |
| `scraper.dedup.test.mjs` | `schema.test.mjs` lines 207-217 (JSONL split + parse loop) | run twice → 2nd yields 0 new lines; `needsReview` excluded (D-04/D-10) |
| `scraper.run.test.mjs` | `schema.test.mjs` lines 181-217 (parse every output file) | inject `raw-67105-search.json` as fetch result + tmp `dataDir`; assert all 3 files validate, 5 stores once each, fault paths (DATA-01/05/06) |

**Fixture corpus reuse (CONTEXT testing approach):** drive offline tests with `spike/fixtures/raw-67105-search.json` (negative/quarantine corpus — this week had zero real positives) and the synthesized positive `spike/fixtures/accept/*.json`. Inject the fixture as the fetch result; no network in any test.

---

### `package.json` (config, modify)

**Analog:** the existing `scripts` block (lines 9-12). Add one line mirroring the `probe` script:
```json
"scripts": { "test": "node --test", "probe": "node spike/probe.mjs", "scrape": "node scraper/index.mjs" }
```
No new dependencies — `zod` stays the only runtime dep (RESEARCH: zero installs).

## Shared Patterns

### Output validation (apply to ALL files before write)
**Source:** `contract/schema.mjs` `parseCurrentOffers` / `parseStatusFile` / `parseHistoryLine` (lines 143-145)
**Apply to:** `merge.mjs` output, `dedup.mjs` lines, `index.mjs` pre-write step.
Validate every document **before** the atomic write so a drifted marktguru payload throws instead of corrupting `data/` (ASVS V5, T-02-01; RESEARCH Anti-Pattern "Validating after writing").

### 12×1L classification (apply to select/index)
**Source:** `contract/matcher.mjs` `classify(offer) → "accept"|"reject"|"review"` (lines 69-101)
**Apply to:** the per-store candidate gate in `index.mjs`/`select.mjs`.
Import verbatim — never re-implement the regex boundary (D-09; the matcher is fixture-tested by `test/matcher.test.mjs`). `accept` → eligible; `review` → `needsReview:true` fallback; `reject` → drop.

### Injected clock (apply to select/normalize/merge/dedup)
**Source:** RESEARCH Pattern 4 (no existing analog — new seam)
**Apply to:** every pure module that needs "now". Capture `const now = new Date()` once in `index.mjs`; thread it as a parameter. Never call `new Date()` inside a pure module (breaks determinism against fixtures).

### cwd-independent path resolution (apply to io/index)
**Source:** `spike/probe.mjs` lines 36-37 (`HERE = dirname(fileURLToPath(import.meta.url))`)
**Apply to:** `io.mjs` `dataDir` defaulting and `index.mjs`, so `npm run scrape` works from any cwd (matches how `probe` and both test files already resolve `ROOT`).

### Key/secret hygiene (apply to fetch/index)
**Source:** `spike/probe.mjs` security comment (lines 16-21)
**Apply to:** `fetch.mjs` and any error logging in `index.mjs`. Bootstrap keys are NEVER logged or written to disk; errors log `err.message` only (D-12, ASVS V7).

## No Analog Found

| File | Role | Data Flow | Reason / Disposition |
|------|------|-----------|----------------------|
| `scraper/clock.mjs` | provider | — | Trivial new seam (`makeClock()` / `systemNow()`, ~3 lines). No existing injectable-clock pattern in the repo; follow RESEARCH Pattern 4. Could fold into `index.mjs` — it is a discretion item (A1). |
| `withRetry` (in `scraper/fetch.mjs`) | helper | — | No retry/backoff exists yet (the probe is single-shot). Build from RESEARCH Pattern 1 (~12 lines, Node-built-in `AbortSignal.timeout`). |
| `writeAtomic` (in `scraper/io.mjs`) | helper | file-I/O | The probe does a plain `writeFile`; no temp+rename exists. Build from RESEARCH Pattern 2. |

> All three "no analog" items are the genuinely-new ~10-line helpers RESEARCH calls out; everything else is reuse + reordering of frozen Phase 1 assets.

## Metadata

**Analog search scope:** `spike/`, `contract/`, `test/`, `data/`, `mocks/`, `package.json`
**Files scanned:** `spike/probe.mjs`, `contract/schema.mjs`, `contract/matcher.mjs`, `test/matcher.test.mjs`, `test/schema.test.mjs`, `package.json`, `data/current-offers.json`, `data/status.json`, `data/price-history.jsonl`, `spike/fixtures/accept/classic-12x1l.json`, `spike/fixtures/raw-67105-search.json` (offer shape probed live)
**Pattern extraction date:** 2026-06-15
