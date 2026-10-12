# Phase 5: Wasgau leaflet source - Pattern Map

**Mapped:** 2026-10-12
**Files analyzed:** 22 (9 new scraper modules, 5 modified scraper/web files, 6+ test files, fixtures)
**Analogs found:** 19 / 22 (the pure XML/geometry/date units have no in-repo analog; they use the RESEARCH.md patterns)

All analog paths below are git-tracked (verified with `git ls-files`).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `scraper/wasgau/config.mjs` (new) | config | n/a | `scraper/fetch.mjs` lines 20-32 (module constants) | partial |
| `scraper/wasgau/source.mjs` (new) | service (network seam) | request-response | `scraper/fetch.mjs` (`getKeys`, `withRetry`, deadline) | exact |
| `scraper/wasgau/index-page.mjs` (new) | utility (pure parse) | transform | `scraper/fetch.mjs` `getKeys` island scan (HTML regex, select by presence) | role-match |
| `scraper/wasgau/coords.mjs` (new) | utility (pure parse) | transform | none (RESEARCH Pattern 2) | no analog |
| `scraper/wasgau/pair.mjs` (new) | utility (pure) | transform | none (RESEARCH Pattern 3) | no analog |
| `scraper/wasgau/dates.mjs` (new) | utility (pure) | transform | `scraper/normalize.mjs` `berlinDay` (date output convention only) | partial |
| `scraper/wasgau/candidates.mjs` (new) | model + evaluator | transform / file-I/O schema | `contract/schema.mjs` (zod) + `scraper/select.mjs` `selectForStore` | role-match |
| `scraper/wasgau/build.mjs` (new) | service (orchestrator) | request-response + cache | `scraper/index.mjs` `run()` lines 110-199 | role-match |
| `scraper/index.mjs` (mod) | orchestrator | batch | itself | exact |
| `scraper/merge.mjs` (mod) | utility (pure assemble) | transform | itself | exact |
| `scraper/fetch.mjs` (mod: export `UA`) | service | request-response | itself line 20 | exact |
| `web/src/chart/history.js` (mod) | component | render | itself lines 125-139, 190-232 | exact |
| `web/src/main.js` (mod, line ~106) | component | render | itself | exact |
| `test/scraper.wasgau.*.test.mjs` (new) | test | offline fixtures | `test/scraper.fetch.test.mjs`, `test/scraper.run.test.mjs` | exact |
| `test/scraper.merge.test.mjs` (mod, lines 96-115) | test | — | itself | exact |
| `test/scraper.run.test.mjs` (mod, every `run()` call) | test | — | itself | exact |
| `web/test/chart.test.mjs` (mod, lines 76-81) | test | — | itself | exact |
| `test/fixtures/wasgau/*.xml|.html` (new) | fixture | — | `.planning/phases/05-wasgau-leaflet-source/research-samples/*` (copy) + `spike/fixtures/` precedent | exact |
| `data/wasgau-candidates.json` (generated) | data/cache | file-I/O | `data/current-offers.json` format (2-space, trailing newline, writeAtomic) | role-match |
| `.github/workflows/pipeline.yml` | config | — | no change required (`git add data/` line 85) | n/a |
| `.planning/REQUIREMENTS.md` line 32 | doc | — | — | n/a |

## Pattern Assignments

### `scraper/wasgau/source.mjs` (service, request-response)

**Analog:** `scraper/fetch.mjs`

Header comment convention (lines 1-18): module name, purpose, SECURITY note (never log values — here: never log homepage contents, they hold a mapbox token), GOOD CITIZEN note, "Node 22+, no dependencies".

Constants (lines 20-32) — export `UA` and reuse it; define own deadline:
```js
const UA = "colaapp-scraper/0.1 (personal, low-volume)";   // change to: export const UA
const PER_ATTEMPT_TIMEOUT_MS = 10_000;
const TOTAL_DEADLINE_MS = 20_000;   // Wasgau: own deadline, e.g. 60_000
```

Retry wrapper to import, not copy (line 53):
```js
export async function withRetry(fn, { retries = 2, baseMs = 1000, deadline } = {})
// fn(signal) receives a FRESH per-attempt AbortSignal (undici #1926); deadline via AbortSignal.any
```
Usage shape: `const deadline = AbortSignal.timeout(TOTAL_DEADLINE_MS); await withRetry((signal) => fetch(url, { headers: { "User-Agent": UA }, signal }).then(...), { deadline });` — strictly sequential `for ... of` over Cola pages, no `Promise.all`.

Parse-by-presence rule (getKeys, lines ~83-100): select the `var wasgau = {...}` JSON specifically, never "first 1kcloud link"; validate host `wasgau-dlog.1kcloud.com` + id allow-list; throw on miss (→ Wasgau `error`).

---

### `scraper/wasgau/build.mjs` + `scraper/index.mjs` reshape (orchestrator)

**Analog:** `scraper/index.mjs` lines 110-199

Injectable-seam signature (lines 110-114) — extend with `wasgau = {}`:
```js
export async function run({
  now = systemNow(),
  dataDir = DEFAULT_DATA_DIR,
  fetchOffers = realFetchOffers,
} = {}) {
```

Fault-isolation try/catch to mirror for the Wasgau block (lines 138-150):
```js
for (const store of MARKTGURU_STORES) {
  if (statusOverrides[store] === "error") continue; // already swept
  try {
    ...
    storeResults[store] = selectForStore(candidates, now);
  } catch (err) {
    console.error(`STORE BUILD FAILED (${store}):`, err.message);
    statusOverrides[store] = "error";
  }
}
```
Insert after this loop: `if (wasgauCfg.enabled) { try { const { result, candidatesDoc } = await buildWasgau(...); storeResults.Wasgau = result; } catch (err) { console.error("WASGAU FAILED:", err.message); statusOverrides.Wasgau = "error"; } }`, then call `mergeWithPrior(storeResults, statusOverrides, prior, now, { wasgauEnabled })`.

Validate-before-write (lines 163-179) stays; `writeErrorStatus` (lines 86-99) must emit Wasgau `"error"` when enabled, `"unavailable"` when disabled.

Write order (lines 188-199) — add candidates write between status and history:
```js
await writeAtomic(join(dataDir, "current-offers.json"), JSON.stringify(currentOffers, null, 2) + "\n");
await writeAtomic(join(dataDir, "status.json"), JSON.stringify(status, null, 2) + "\n");
// NEW: if (candidatesDoc) await writeAtomic(join(dataDir, "wasgau-candidates.json"), JSON.stringify(candidatesDoc, null, 2) + "\n");
await appendLines(historyPath, lines);
```

---

### `scraper/merge.mjs` (pure assemble, modified)

**Analog:** itself (read in full, 104 lines)

- Line 29 `const MARKTGURU_STORES = [...]` → loop `STORES` imported from `contract/schema.mjs:20`.
- Warm/cold error paths lines 58-76: keep verbatim, but change `if (priorOffer)` to `if (priorOffer && priorOffer.status !== "unavailable")` (Pitfall 2).
- Lines 90-98 (fixed Wasgau unavailable) → execute only when `!wasgauEnabled`:
```js
const priorWasgau = priorEntry(priorStatus, "Wasgau");
offerStores.push({ store: "Wasgau", displayName: "Wasgau", status: "unavailable" });
statusStores.push({ store: "Wasgau", status: "unavailable", lastUpdated: priorWasgau?.lastUpdated ?? nowIso });
```
- Signature: `mergeWithPrior(storeResults, statusOverrides, prior, now, { wasgauEnabled = true } = {})`. Update the header comment block (lines 7-26) — D-03 wording becomes stale.

---

### `scraper/wasgau/candidates.mjs` (zod model + evaluate)

**Analogs:** `contract/schema.mjs` (zod style), `scraper/select.mjs:67`, `scraper/io.mjs:48` (missing → null)

Zod style (schema.mjs lines 13-40): `import { z } from "zod";`, anchored linear regex for dates:
```js
const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD (Europe/Berlin)");
```
Use `.strict()` objects like StoreOffer. Read semantics from `readPrior` (io.mjs 40-55): missing/invalid file → `null` = cache miss, never throw.

Evaluate: shape candidates per RESEARCH Pattern 5 (`price: cents/100`, `validityDates: [{from: \`${d}T12:00:00Z\`, ...}]`, `store: "Wasgau"`, `description: text`) and call `selectForStore(candidates, now)`; then apply probation/ambiguity `needsReview: true`. Matcher: `classify()` / `caseCount()` from `contract/matcher.mjs` unchanged.

---

### `scraper/wasgau/config.mjs` (config)

No real analog; follow module-constant style of `scraper/fetch.mjs` 20-32 with an intention comment per flag:
```js
export const WASGAU_DEFAULTS = { enabled: true, probation: true }; // D-04 kill switch, D-12 probation
```

---

### `scraper/wasgau/index-page.mjs`, `coords.mjs`, `pair.mjs`, `dates.mjs` (pure transforms)

No in-repo analog — use RESEARCH.md Patterns 1-4 verbatim (regexes, size ≥18 price tokens, de-hyphenated line join + NFKC, adjacency/cross-check outcome classes, 3-level window precedence). Conventions to follow from existing pure modules (`scraper/merge.mjs`, `scraper/normalize.mjs`): header comment naming the module + decisions, "Pure + clock-free", JSDoc per export, no I/O. Date output must be plain `YYYY-MM-DD` (same as `berlinDay` output, `normalize.mjs:28`), never via UTC slice.

---

### `web/src/chart/history.js` + `web/src/main.js` (component)

**Analog:** itself
- Line 35 `STORES_WITH_LINES` → add `"Wasgau"` (or a `lineStores(wasgauUnavailable)` helper used by `prepareChartData`).
- `LINE_COLORS` lines 130-135 → add `Wasgau: "#00838F"` (assumed teal; differs from `--color-warning: #9a5b00`). Update comment "Wasgau has NO colour".
- `renderLegend(container)` lines 192-231: swatch loop over line-stores; keep the greyed Wasgau block (`chart-legend__item--unavailable`, note "nicht automatisch verfügbar") but only when `wasgauUnavailable`. textContent-only rendering preserved.
- `main.js:106` `await renderHistory(graph, data.history ?? []);` → pass `{ wasgauUnavailable: stores.find((s) => s.store === "Wasgau")?.status === "unavailable" }`.

---

### Tests

**Analogs:** `test/scraper.fetch.test.mjs` (lines 1-25), `test/scraper.run.test.mjs` (lines 1-40)

Harness:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
const NOW = new Date("2026-06-15T10:00:00Z");   // fixed clock
async function freshDir() { return mkdtemp(join(tmpdir(), "colarun-")); }
```
Network stubbing: prefer the injected seam (`run({ ..., wasgau: { fetchText, config } })`) with a URL-recording stub serving fixtures from `test/fixtures/wasgau/`; `scraper.fetch.test.mjs` shows the `globalThis.fetch` swap + `finally` restore for source-level tests. Every existing `run()` call in `scraper.run.test.mjs` (cases A-G, asserts at 68-77, 169, 190, 241) must inject the seam (Pitfall 1). Validate outputs with `parseCurrentOffers` / `parseStatusFile` from `contract/schema.mjs`.

## Shared Patterns

### Error handling / logging
**Source:** `scraper/index.mjs` 121-128, 145-148
**Apply to:** build.mjs, index.mjs Wasgau block, source.mjs
Log `err.message` only (`console.error("…FAILED (…):", err.message)`); never abort the run; mark the store `"error"` in `statusOverrides`.

### Injectable seams + fixed clock
**Source:** `scraper/index.mjs` 110-114, `scraper/clock.mjs:9` (`systemNow`)
**Apply to:** all Wasgau units — `now` and `fetchText` passed in, defaults only in `run()`.

### Atomic JSON writes
**Source:** `scraper/io.mjs:67` `writeAtomic(targetPath, text)`; format `JSON.stringify(doc, null, 2) + "\n"`
**Apply to:** `data/wasgau-candidates.json` (deterministic: no timestamps, sorted by page/box).

### Validate before write
**Source:** `scraper/index.mjs` 163-179 + `contract/schema.mjs`
**Apply to:** candidates doc (local zod schema) and the merged frozen docs (unchanged).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `scraper/wasgau/coords.mjs` | utility | transform | No XML parsing exists; use RESEARCH Pattern 2 (regex scanner, no new dependency) |
| `scraper/wasgau/pair.mjs` | utility | transform | No geometry code exists; RESEARCH Pattern 3 |
| `scraper/wasgau/dates.mjs` | utility | transform | No German date-phrase parsing exists; RESEARCH Pattern 4 |

## Metadata

**Analog search scope:** `scraper/`, `contract/`, `test/`, `web/src/`, `.github/workflows/`
**Files scanned:** ~12
**Pattern extraction date:** 2026-10-12
