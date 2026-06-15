// web/test/chart.test.mjs
// Locks the load-bearing data-prep half of the price-history chart: the shared
// sorted date axis, per-store y-series with NULL gaps (never interpolated —
// RESEARCH Pitfall 3 / HIST-02), the Wasgau-is-never-a-series rule (HIST-03),
// per-store point counts (drives markers-only vs line), JSONL parsing of the real
// repo-root fixture, and the cold-start-detectable empty shape (Pitfall 8).
// Pure functions only — no DOM, no uPlot, no clock. Mirrors the derive/format
// test harness style (node:test + node:assert/strict + repo-root fixtures).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseHistoryJsonl, prepareChartData } from "../src/chart/history.js";

// web/test -> web -> repo root. The fixture lives at the repo root, not under web/.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const HISTORY = readFileSync(join(ROOT, "data", "price-history.jsonl"), "utf8");

// --- parseHistoryJsonl: JSONL text -> HistoryLine[] ---

test("parseHistoryJsonl parses the 3-line fixture into HistoryLine objects", () => {
  const lines = parseHistoryJsonl(HISTORY);
  assert.equal(lines.length, 3);
  assert.deepEqual(lines[0], {
    date: "2026-06-01",
    store: "REWE",
    price: 1099,
    pricePerLitre: 92,
    validFrom: "2026-06-02",
    validTo: "2026-06-07",
  });
  assert.equal(lines[2].store, "REWE");
  assert.equal(lines[2].price, 999);
});

test("parseHistoryJsonl tolerates a trailing newline and blank lines", () => {
  const withTrailing = parseHistoryJsonl(HISTORY + "\n");
  assert.equal(withTrailing.length, 3);
  const withBlanks = parseHistoryJsonl("\n" + HISTORY + "\n\n   \n");
  assert.equal(withBlanks.length, 3);
});

test("parseHistoryJsonl returns [] for empty / whitespace-only input", () => {
  assert.deepEqual(parseHistoryJsonl(""), []);
  assert.deepEqual(parseHistoryJsonl("   \n  \n"), []);
});

// --- prepareChartData: shared axis + null gaps + point counts ---

test("prepareChartData builds the shared sorted date axis from the fixture", () => {
  const out = prepareChartData(parseHistoryJsonl(HISTORY));
  assert.deepEqual(out.dates, ["2026-06-01", "2026-06-08", "2026-06-15"]);
  // x is epoch SECONDS at UTC midnight of each date, aligned to dates.
  const x = out.data[0];
  assert.deepEqual(x, [
    Date.parse("2026-06-01T00:00:00Z") / 1000,
    Date.parse("2026-06-08T00:00:00Z") / 1000,
    Date.parse("2026-06-15T00:00:00Z") / 1000,
  ]);
});

test("prepareChartData lines up four line-stores and excludes Wasgau", () => {
  const out = prepareChartData(parseHistoryJsonl(HISTORY));
  assert.deepEqual(out.stores, ["REWE", "Edeka", "Lidl", "Kaufland"]);
  assert.equal(out.stores.length, 4);
  assert.ok(!out.stores.includes("Wasgau"), "Wasgau must never be a series");
  // data = [x, ...4 series]; never a 5th (Wasgau) series.
  assert.equal(out.data.length, 5);
});

test("prepareChartData breaks the REWE line with null at the no-offer date (no interpolation)", () => {
  const out = prepareChartData(parseHistoryJsonl(HISTORY));
  const rewe = out.data[1 + out.stores.indexOf("REWE")];
  // REWE: 10.99 on 06-01, NOTHING on 06-08 (null gap), 9.99 on 06-15.
  assert.deepEqual(rewe, [10.99, null, 9.99]);
  // The null at index 1 is the proof of HIST-02: never interpolate across a gap.
  assert.equal(rewe[1], null);
});

test("prepareChartData maps prices to euros and aligns Kaufland's single point", () => {
  const out = prepareChartData(parseHistoryJsonl(HISTORY));
  const kaufland = out.data[1 + out.stores.indexOf("Kaufland")];
  assert.deepEqual(kaufland, [null, 10.49, null]);
});

test("prepareChartData leaves stores with no observations all-null", () => {
  const out = prepareChartData(parseHistoryJsonl(HISTORY));
  const edeka = out.data[1 + out.stores.indexOf("Edeka")];
  const lidl = out.data[1 + out.stores.indexOf("Lidl")];
  assert.deepEqual(edeka, [null, null, null]);
  assert.deepEqual(lidl, [null, null, null]);
});

test("prepareChartData counts non-null points per store (drives markers-only branch)", () => {
  const out = prepareChartData(parseHistoryJsonl(HISTORY));
  assert.equal(out.pointCounts.REWE, 2); // 2 points -> markers only (<3)
  assert.equal(out.pointCounts.Kaufland, 1); // 1 point -> markers only
  assert.equal(out.pointCounts.Edeka, 0);
  assert.equal(out.pointCounts.Lidl, 0);
});

// --- cold-start shape (Pitfall 8): empty input must be detectable by renderHistory ---

test("prepareChartData([]) yields the cold-start-detectable empty shape", () => {
  const out = prepareChartData([]);
  assert.deepEqual(out.dates, []);
  assert.equal(out.dates.length, 0); // renderHistory branches on dates.length === 0
  // x-series present but empty so uPlot is never constructed on a hollow axis.
  assert.deepEqual(out.data[0], []);
  // every line-store reports zero points.
  assert.equal(out.pointCounts.REWE, 0);
  assert.equal(out.pointCounts.Edeka, 0);
  assert.equal(out.pointCounts.Lidl, 0);
  assert.equal(out.pointCounts.Kaufland, 0);
});
