# Phase 3: PWA Frontend - Pattern Map

**Mapped:** 2026-06-15
**Files analyzed:** 19 new/modified files
**Analogs found:** 10 / 19 (the 9 with no analog are genuinely new frontend/Vite/uPlot/manifest territory — see "No Analog Found")

This phase creates a NEW `web/` Vite vanilla-JS PWA in an existing ESM/Node scraper repo. The repo's strongest reusable analogs are: the **frozen contract** (`contract/schema.mjs`, `contract/types.d.ts`), the **pure clock-injected derivation modules** in `scraper/` (`select.mjs`, `normalize.mjs`, `clock.mjs`), the **filesystem-boundary module** (`scraper/io.mjs`), and the **`node --test` fixture-driven test files** (`test/*.test.mjs`). These set the ESM module style, the Berlin-day-via-`Intl` rule, the injected-`now` determinism seam, contract consumption, and the test conventions the PWA's pure logic must follow.

The DOM/render layer, Vite config, VitePWA/Workbox setup, uPlot chart, manifest, and icons have **no in-repo analog** — the codebase is backend-only today. For those, the planner should follow RESEARCH.md (Patterns 1-6) and UI-SPEC.md verbatim, not force a weak match.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `web/src/derive/derive.js` | utility (pure logic) | transform | `scraper/select.mjs` | exact (pure clock-injected selection) |
| `web/src/format/format.js` | utility (pure formatters) | transform | `scraper/normalize.mjs` (`berlinDay` Intl) | role + Intl-pattern match |
| `web/src/chart/history.js` | utility + render (uPlot data-prep) | transform → render | `scraper/select.mjs` (pure prep) for data-prep half; uPlot wiring has none | partial (prep only) |
| `web/src/main.js` | entry / orchestrator | request-response (fetch → derive → render) | `scraper/index.mjs` (orchestrator threading `now`) | role-match (orchestration shape only) |
| `web/src/data/load.js` (fetch + optional zod guard) | service (I/O boundary) | file-I/O (fetch static JSON) | `scraper/io.mjs` (`readJsonOrNull` tolerant read) + `contract/schema.mjs` parsers | role-match |
| `web/src/render/hero.js` | render (DOM builder) | render | — | no analog (new DOM layer) |
| `web/src/render/card.js` | render (DOM builder) | render | — | no analog |
| `web/src/render/footer.js` | render (DOM builder) | render | — | no analog |
| `web/src/styles.css` | config (CSS tokens) | — | — | no analog (UI-SPEC is the source) |
| `web/index.html` | config (app shell) | — | — | no analog |
| `web/vite.config.js` | config (build + VitePWA) | — | — | no analog (RESEARCH Pattern 6) |
| `web/package.json` | config | — | `package.json` (root: ESM, `node --test`, engines) | role-match (toolchain conventions) |
| `web/public/icon-192.png` / `icon-512.png` / `icon-maskable-512.png` | asset | — | — | no analog (Claude's-discretion artwork) |
| `web/public/data/*.json(l)` (dev fixtures) | config (fixtures) | — | `mocks/*.json`, `data/*.json(l)` | exact (copied verbatim as fixtures) |
| `web/test/derive.test.mjs` | test | — | `test/scraper.select.test.mjs` | exact |
| `web/test/format.test.mjs` | test | — | `test/schema.test.mjs` / `test/scraper.normalize.test.mjs` | exact |
| `web/test/chart.test.mjs` | test | — | `test/scraper.select.test.mjs` | exact |

---

## Pattern Assignments

### `web/src/derive/derive.js` (utility, pure transform)

**Analog:** `scraper/select.mjs` — the canonical "pure, clock-free, `now` injected, string-compare on `YYYY-MM-DD`" decision module. The PWA's `isActive`/`isUpcoming`/`bestDeal`/`sortCards` are the consumer-side mirror of its `pickRange`/`bestOf` ranking.

**`now`-injection + Berlin-day rule** (`scraper/select.mjs:67-69`, `scraper/normalize.mjs:14-26`):
```javascript
// select.mjs — today derived from injected now, never new Date() inside logic
export function selectForStore(candidates, now) {
  const today = berlinDay(now.toISOString());
```
```javascript
// normalize.mjs — the mandatory Berlin-day-via-Intl helper (NOT UTC slice)
const BERLIN_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
});
export const berlinDay = (iso) => BERLIN_DAY.format(new Date(iso));
```
**Copy this exactly:** `berlinToday(now)` must use `Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Berlin'})` (RESEARCH Pattern 1), and every derivation fn takes `(data, now/today)` — never calls `new Date()` internally. This is the same determinism seam as `scraper/clock.mjs`.

**String-compare ranking on `YYYY-MM-DD`** (`scraper/select.mjs:38-49`):
```javascript
const active = ranges.filter((r) => r.from <= today && today <= r.to);
// ... earliest start via .localeCompare, lowest price tie-break
```
The PWA's `isActive(o, today)` reuses this exact `o.validFrom <= today && today <= o.validTo` string comparison (RESEARCH Pattern 1/2). `bestDeal` = min `price` among active; `sortCards` = bucket rank `active→upcoming→no_offer→unavailable/error` then price asc (RESEARCH Pattern 2/3).

**Must also include (from contract semantics, see Shared Patterns):** every active/upcoming/best-deal predicate filters `!o.needsReview` (the `offer` mock has Edeka `needsReview:true` — `mocks/current-offers.offer.json:19`). `isStale` uses `status.json` per-store `lastUpdated`, not the file-level one.

---

### `web/src/format/format.js` (utility, pure de-DE formatters)

**Analog:** `scraper/normalize.mjs` — same "pure, ISO-in / formatted-out, `Intl` is mandatory" shape. `normalize.mjs` proves the cents→display and Berlin-`Intl` conventions the formatters extend to currency/weekday/timestamp.

**Cents handling** (`scraper/normalize.mjs:37-40`):
```javascript
const price = Math.round((offer?.price ?? 0) * 100);   // cents in the contract
const pricePerLitre = Math.round(price / 12);
```
The PWA does the inverse on display: integer cents ÷ 100 → `Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'})`. Formatters live in pure fns (price, perLitre, date `TT.MM.JJJJ`, short weekday `Mo 21.06.`, timestamp `15.06.2026 06:00 Uhr`) per UI-SPEC "Formatting rules" and RESEARCH "Code Examples".

**Note for planner:** RESEARCH flags a UI-SPEC bug — weekday MUST be computed via `Intl.DateTimeFormat('de-DE',{weekday:'short'})`, never hardcoded (`2026-06-21` is "So", not "Sa"). Footer needs " Uhr" appended with the year-comma removed.

---

### `web/src/chart/history.js` (utility data-prep + uPlot render)

**Analog (data-prep half only):** `scraper/select.mjs` — pure transform from raw lines to aligned arrays, unit-testable with fixtures. The uPlot wiring half has no in-repo analog → follow RESEARCH Patterns 4/5.

**Data-prep pattern (pure, testable):** build one sorted unique x-array of dates, one y-series per store with `null` for missing dates (RESEARCH Pattern 4). Source data shape is `data/price-history.jsonl` (one JSON object per line: `{date, store, price, pricePerLitre, validFrom, validTo}`). Parse JSONL by splitting on `\n` (mirror of `scraper/io.mjs:82-85` append-only line model, read direction).

**uPlot gap/markers rules (load-bearing, no analog — RESEARCH Pattern 5):** `spanGaps:false` + `null` gaps (never interpolate); `<3 points → paths:()=>null` (markers only); `≥3 → default line`. Wasgau never a series. Per-store palette + marker shapes from UI-SPEC Color table. Cold-start (0 points) → render "Noch keine Daten" panel, do not call uPlot.

---

### `web/src/data/load.js` (service, file-I/O boundary)

**Analog:** `scraper/io.mjs` (tolerant read) + `contract/schema.mjs` (optional defensive parse).

**Tolerant read pattern** (`scraper/io.mjs:29-38`):
```javascript
async function readJsonOrNull(path) {
  let text;
  try { text = await readFile(path, "utf8"); }
  catch (err) { if (err?.code === "ENOENT") return null; throw err; }
  return JSON.parse(text);
}
```
The PWA's fetch boundary mirrors this "degrade, don't crash" stance: a failed `fetch`/parse → render an honest error state per store (ASVS V7, RESEARCH Security Domain), never throw out of the whole render.

**Optional defensive validation** (`contract/schema.mjs:143-145`):
```javascript
export const parseCurrentOffers = (obj) => CurrentOffersSchema.parse(obj);
export const parseStatusFile = (obj) => StatusFileSchema.parse(obj);
export const parseHistoryLine = (obj) => HistoryLineSchema.parse(obj);
```
The PWA may import these to validate fetched JSON before render (defensive; producer/consumer share the schema). RESEARCH recommends validating in tests, optional runtime guard behind try/catch (zod is ~13KB shipped). Decide workspace layout so `web/` can import `../contract/schema.mjs` (npm workspaces or `server.fs.allow:['..']` — RESEARCH Pitfall 7).

---

### `web/src/main.js` (entry / orchestrator)

**Analog:** `scraper/index.mjs` (orchestrator — captures `now` once and threads it). The PWA entry follows the same "capture `now` once, thread to every pure derive call" discipline (RESEARCH Pattern 1: keeps `now` injectable). Flow: fetch the three files → optional parse → derive (with one captured `now`) → render hero/cards/graph/footer → register SW. See RESEARCH "System Architecture Diagram".

---

### `web/package.json` (config)

**Analog:** root `package.json` (`package.json:1-28`).

**Conventions to copy:** `"type": "module"`, `"engines": { "node": ">=22" }`, `"test": "node --test"` script. Pin `vite@^7`, `vite-plugin-pwa@^1.3.0`, `uplot@^1.6.32` (RESEARCH Standard Stack). `@vite-pwa/assets-generator@^1.0.2` as optional dev dep for icons.

---

### `web/test/*.test.mjs` (tests)

**Analog:** `test/scraper.select.test.mjs` (best match — fixed-clock, fixture-driven pure-logic tests) and `test/schema.test.mjs`.

**Test harness pattern** (`test/scraper.select.test.mjs:1-13`):
```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { selectForStore } from "../scraper/select.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
const NOW = new Date("2026-06-15T10:00:00Z");   // fixed clock, deterministic
```
**Copy exactly:** `node --test` + `node:assert/strict`, fixed `NOW`, load mocks via `readJson`. Mirror the behaviour-named test titles (`"active offer beats a future-dated upcoming offer"`). Assert the load-bearing edge cases the PWA owns: Edeka `needsReview:true` is excluded from hero/cards (RESEARCH Pitfall 2), `status.stale.json` (file `lastUpdated` `2026-06-05`) marks stores stale vs `2026-06-15` (RESEARCH Pitfall 1), uPlot data-prep inserts `null` across gaps (RESEARCH Pitfall 3), de-DE formatter outputs (`9,99 €`, `0,83 €/l`, `21.06.2026`, weekday "So").

---

## Shared Patterns

### Pure / clock-injected derivation (apply to: derive.js, format.js, chart/history.js data-prep)
**Source:** `scraper/clock.mjs:9`, `scraper/select.mjs:67-69`, `scraper/normalize.mjs:1-9`
```javascript
// clock.mjs — the single injectable "now" seam
export const systemNow = () => new Date();
```
Every pure module takes `now`/`today` as a parameter and never calls `new Date()` internally. `main.js` captures `now` once (like `scraper/index.mjs`) and threads it. This is what makes the locked decisions unit-testable and deterministic.

### Berlin-day-via-Intl, never UTC slice (apply to: derive.js, format.js)
**Source:** `scraper/normalize.mjs:11-26`
```javascript
const BERLIN_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year:"numeric", month:"2-digit", day:"2-digit" });
export const berlinDay = (iso) => BERLIN_DAY.format(new Date(iso));
```
`'en-CA'` yields sortable `YYYY-MM-DD` comparable to contract `DateOnly` via string compare. UTC `.slice(0,10)` is wrong near midnight (CEST). Mandatory for `berlinToday()` and active/upcoming math.

### Contract as the single source of shapes (apply to: load.js, derive.js, all tests)
**Source:** `contract/types.d.ts:23-70`, `contract/schema.mjs:20-25,143-145`
- Editor types without runtime zod: import from `contract/types.d.ts` (`StoreOffer`, `CurrentOffers`, `HistoryLine`, `StoreStatus`, `StatusFile`).
- `STORES = ["REWE","Edeka","Lidl","Kaufland","Wasgau"]`; `STATUS_VALUES = ["offer","no_offer","unavailable","error"]`.
- Price/pricePerLitre are integer cents; dates `YYYY-MM-DD` Berlin; `lastUpdated` ISO-UTC.
- Optional runtime validation via `parseCurrentOffers`/`parseStatusFile`/`parseHistoryLine`.

### Honest-state / fault isolation (apply to: load.js, render/*, derive.js)
**Source:** `scraper/io.mjs:29-38` (tolerant read), `scraper/select.mjs:160-176` (per-offer isolation, never poison siblings)
Degrade per-store, never crash the whole screen. A failed fetch/parse → per-store `error` state. `needsReview:true` filtered out of the brother-facing view (`mocks/current-offers.offer.json:19` Edeka). Build DOM with `textContent`/`createElement`, never `innerHTML` with data values (ASVS V5/XSS, RESEARCH Security Domain).

### Path resolution relative to module file (apply to: load.js, tests)
**Source:** `scraper/io.mjs:22-25`, `test/scraper.select.test.mjs:9`
```javascript
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
```
Resolve fixtures/data relative to the module, not cwd — same pattern the scraper and all tests use.

---

## No Analog Found

The repo is backend-only today; these are genuinely new frontend territory. Planner should follow RESEARCH.md (Patterns 4-6, Pitfalls 4-8) and UI-SPEC.md, not force a weak match.

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `web/src/render/hero.js` | render (DOM) | render | No DOM/UI layer exists in repo; build per UI-SPEC "Hero" anatomy + RESEARCH Security (textContent/createElement). |
| `web/src/render/card.js` | render (DOM) | render | No card/component code exists; UI-SPEC "Store card" anatomy + three-state chip table. |
| `web/src/render/footer.js` | render (DOM) | render | No DOM layer; UI-SPEC "Freshness footer". |
| `web/src/styles.css` | config (CSS) | — | No CSS in repo; UI-SPEC Color/Spacing/Typography tokens are the source of truth. |
| `web/index.html` | config (shell) | — | No HTML shell exists; single-screen shell per UI-SPEC "Page shell". |
| `web/vite.config.js` | config | — | No Vite/build config exists; RESEARCH Pattern 6 (VitePWA generateSW, StaleWhileRevalidate data route, manifest). |
| `web/src/chart/history.js` (uPlot wiring half) | render | render | No charting code exists; RESEARCH Patterns 4/5 (uPlot `spanGaps:false`, `paths:()=>null` markers-only, resize). |
| `web/public/icon-*.png` | asset | — | No icons in repo; Claude's-discretion trademark-safe glyph, 192/512/maskable (separate `any`/`maskable` entries — RESEARCH Pitfall). |
| Service worker / Workbox runtime route | config (generated) | — | Generated by `vite-plugin-pwa generateSW`; do NOT hand-roll (RESEARCH "Don't Hand-Roll"). |

---

## Metadata

**Analog search scope:** `contract/`, `scraper/`, `test/`, `mocks/`, `data/`, root `package.json`
**Files scanned:** 12 read in full/part (schema.mjs, types.d.ts, select.mjs, normalize.mjs, io.mjs, clock.mjs, package.json, scraper.select.test.mjs, schema.test.mjs, mocks/current-offers.offer.json, mocks/status.stale.json, data/price-history.jsonl); full file listing enumerated
**Pattern extraction date:** 2026-06-15
</content>
</invoke>
