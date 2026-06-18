// web/test/chart.test.mjs
// Locks the load-bearing data-prep half of the price-history chart: each offer
// becomes a FLAT PRICE SEGMENT spanning its validity window on a shared
// epoch-seconds x-axis (one series per line-store), with `null` everywhere
// outside a window so spanGaps:false breaks between distinct offers and never
// interpolates (HIST-02). A one-second sentinel after each offer's validTo keeps
// two back-to-back same-store offers from joining into one sloped line. Wasgau is
// never a series (HIST-03). Pure functions only — no DOM, no uPlot, no clock.
//
// The fixture is INLINE (not the live data/price-history.jsonl) so these tests are
// deterministic and independent of whatever real history the scraper has appended.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHistoryJsonl, prepareChartData } from "../src/chart/history.js";

// Epoch seconds at UTC midnight — mirrors the production daySeconds() helper.
const SEC = (d) => Date.parse(`${d}T00:00:00Z`) / 1000;

// Three offers: REWE has TWO (06-02..06-07 @10,99 and 06-16..06-21 @9,99),
// Kaufland ONE (06-09..06-14 @10,49). Lines up to prove segments + breaks.
const HISTORY = [
  '{"date":"2026-06-01","store":"REWE","price":1099,"pricePerLitre":92,"validFrom":"2026-06-02","validTo":"2026-06-07"}',
  '{"date":"2026-06-08","store":"Kaufland","price":1049,"pricePerLitre":87,"validFrom":"2026-06-09","validTo":"2026-06-14"}',
  '{"date":"2026-06-15","store":"REWE","price":999,"pricePerLitre":83,"validFrom":"2026-06-16","validTo":"2026-06-21"}',
].join("\n");

const seriesOf = (out, store) => out.data[1 + out.stores.indexOf(store)];

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
  assert.equal(parseHistoryJsonl(HISTORY + "\n").length, 3);
  assert.equal(parseHistoryJsonl("\n" + HISTORY + "\n\n   \n").length, 3);
});

test("parseHistoryJsonl returns [] for empty / whitespace-only input", () => {
  assert.deepEqual(parseHistoryJsonl(""), []);
  assert.deepEqual(parseHistoryJsonl("   \n  \n"), []);
});

// --- prepareChartData: per-offer segments + sentinel breaks ---

test("prepareChartData builds the shared x-axis from offer windows + sentinels", () => {
  const out = prepareChartData(parseHistoryJsonl(HISTORY));
  // Every offer contributes from, to, and (to + 1s); sorted unique, ascending.
  const expected = [
    SEC("2026-06-02"),
    SEC("2026-06-07"),
    SEC("2026-06-07") + 1,
    SEC("2026-06-09"),
    SEC("2026-06-14"),
    SEC("2026-06-14") + 1,
    SEC("2026-06-16"),
    SEC("2026-06-21"),
    SEC("2026-06-21") + 1,
  ];
  assert.deepEqual(out.x, expected);
  assert.deepEqual(out.data[0], expected); // data[0] is the x-series
});

test("prepareChartData lines up four line-stores and excludes Wasgau", () => {
  const out = prepareChartData(parseHistoryJsonl(HISTORY));
  assert.deepEqual(out.stores, ["REWE", "Edeka", "Lidl", "Kaufland"]);
  assert.ok(!out.stores.includes("Wasgau"), "Wasgau must never be a series");
  assert.equal(out.data.length, 5); // x + 4 series, never a 5th (Wasgau)
});

test("prepareChartData paints REWE's two offers as flat segments, broken apart", () => {
  const out = prepareChartData(parseHistoryJsonl(HISTORY));
  // x:    02     07     07+1  09    14    14+1  16     21     21+1
  // REWE: 10,99  10,99  null  null  null  null  9,99   9,99   null
  assert.deepEqual(seriesOf(out, "REWE"), [
    10.99, 10.99, null, null, null, null, 9.99, 9.99, null,
  ]);
});

test("prepareChartData paints Kaufland's single offer as one flat segment", () => {
  const out = prepareChartData(parseHistoryJsonl(HISTORY));
  assert.deepEqual(seriesOf(out, "Kaufland"), [
    null, null, null, 10.49, 10.49, null, null, null, null,
  ]);
});

test("prepareChartData leaves stores with no offers all-null", () => {
  const out = prepareChartData(parseHistoryJsonl(HISTORY));
  const allNull = new Array(out.x.length).fill(null);
  assert.deepEqual(seriesOf(out, "Edeka"), allNull);
  assert.deepEqual(seriesOf(out, "Lidl"), allNull);
});

test("prepareChartData counts offers (segments) per store", () => {
  const out = prepareChartData(parseHistoryJsonl(HISTORY));
  assert.equal(out.offerCounts.REWE, 2);
  assert.equal(out.offerCounts.Kaufland, 1);
  assert.equal(out.offerCounts.Edeka, 0);
  assert.equal(out.offerCounts.Lidl, 0);
});

test("the validTo sentinel breaks two back-to-back same-store offers (no joined slope)", () => {
  // Only REWE, two adjacent offers: 06-02..06-07 then 06-08..06-13. Nothing else
  // supplies a null between them, so the sentinel must.
  const backToBack = [
    '{"date":"2026-06-01","store":"REWE","price":1100,"pricePerLitre":92,"validFrom":"2026-06-02","validTo":"2026-06-07"}',
    '{"date":"2026-06-08","store":"REWE","price":1000,"pricePerLitre":83,"validFrom":"2026-06-08","validTo":"2026-06-13"}',
  ].join("\n");
  const out = prepareChartData(parseHistoryJsonl(backToBack));
  // x: 02   07   07+1  08   13   13+1
  assert.deepEqual(out.x, [
    SEC("2026-06-02"),
    SEC("2026-06-07"),
    SEC("2026-06-07") + 1,
    SEC("2026-06-08"),
    SEC("2026-06-13"),
    SEC("2026-06-13") + 1,
  ]);
  // The null at index 2 (the sentinel) is what keeps 11,00 and 10,00 from joining.
  assert.deepEqual(seriesOf(out, "REWE"), [11, 11, null, 10, 10, null]);
});

test("a one-day offer (validFrom == validTo) yields a single visible point", () => {
  const oneDay =
    '{"date":"2026-06-18","store":"Kaufland","price":1099,"pricePerLitre":79,"validFrom":"2026-06-18","validTo":"2026-06-18"}';
  const out = prepareChartData(parseHistoryJsonl(oneDay));
  // x: 18, 18+1 (from == to collapses to one boundary, plus the sentinel).
  assert.deepEqual(out.x, [SEC("2026-06-18"), SEC("2026-06-18") + 1]);
  assert.deepEqual(seriesOf(out, "Kaufland"), [10.99, null]);
  assert.equal(out.offerCounts.Kaufland, 1);
});

// --- cold-start shape (Pitfall 8): empty input must be detectable by renderHistory ---

test("prepareChartData([]) yields the cold-start-detectable empty shape", () => {
  const out = prepareChartData([]);
  assert.equal(out.isEmpty, true); // renderHistory branches on isEmpty
  assert.deepEqual(out.x, []);
  assert.deepEqual(out.data[0], []); // x-series present but empty => uPlot never built
  assert.equal(out.offerCounts.REWE, 0);
  assert.equal(out.offerCounts.Edeka, 0);
  assert.equal(out.offerCounts.Lidl, 0);
  assert.equal(out.offerCounts.Kaufland, 0);
});
