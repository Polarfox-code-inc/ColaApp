// test/scraper.wasgau.dates.test.mjs
// Validity-window parsing and the D-08 precedence (own box > page top band >
// leaflet), proven on the real 2026-10-12 leaflet pages: the p1 app-coupon trap
// (Pitfall 6), the p24 page header and the real letter-spaced p26 weekend
// header that sits at 0.844 x page height (below RESEARCH's 0.9 band).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import * as dates from "../scraper/wasgau/dates.mjs";
import { reconstructPage, parseIndex } from "../scraper/wasgau/leaflet.mjs";

const { parseWindow, resolveWindow, leafletWindowFromIndex } = dates;

const FIX = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "wasgau");
const page = (n) => reconstructPage(readFileSync(join(FIX, `page_${n}.xml`), "utf8"));
const boxOf = (p, id) => {
  const b = p.boxes.find((x) => x.id === id);
  assert.ok(b, `box ${id} must exist`);
  return b;
};

const LEAFLET = { from: "2026-10-12", to: "2026-10-17" };
const WEEKEND = { from: "2026-10-15", to: "2026-10-17" };
const REF = { refDate: "2026-10-12" };

// --- parseWindow: word-month family ---

test("parseWindow: leaflet header with explicit year", () => {
  assert.deepEqual(parseWindow("GÜLTIG VOM 12. BIS 17. OKTOBER 2026"), LEAFLET);
});

test("parseWindow: weekday words and a missing year inherited from refDate", () => {
  assert.deepEqual(parseWindow("VOM DONNERSTAG 15. BIS SAMSTAG 17. OKTOBER", REF), WEEKEND);
});

test("parseWindow: letter-spaced 'VON' header (real p26 text) parses via compaction", () => {
  assert.deepEqual(
    parseWindow("VO N   D O N N E R STAG  1 5. O KTO B E R B I S   SA M STAG  1 7. O KTO B E R", REF),
    WEEKEND
  );
});

test("parseWindow: missing from-month inherits the to-month, stepping back when fromDay > toDay", () => {
  assert.deepEqual(parseWindow("VOM 28. BIS 3. OKTOBER 2026"), { from: "2026-09-28", to: "2026-10-03" });
});

test("parseWindow: MÄRZ and the ASCII MAERZ spelling", () => {
  const want = { from: "2027-03-02", to: "2027-03-07" };
  assert.deepEqual(parseWindow("VOM 2. BIS 7. MÄRZ 2027"), want);
  assert.deepEqual(parseWindow("VOM 2. BIS 7. MAERZ 2027"), want);
});

// --- parseWindow: numeric family ---

test("parseWindow: numeric coupon phrase with weekdays and refDate year", () => {
  assert.deepEqual(parseWindow("Donnerstag 15.10. bis Samstag 17.10.", REF), WEEKEND);
});

test("parseWindow: numeric dates with years and an en dash", () => {
  assert.deepEqual(parseWindow("15.10.2026 – 17.10.2026"), WEEKEND);
});

test("parseWindow: Dec/Jan rollover picks the year closest to refDate (both sides of New Year)", () => {
  const want = { from: "2026-12-29", to: "2027-01-03" };
  assert.deepEqual(parseWindow("29.12. bis 3.1.", { refDate: "2026-12-28" }), want);
  assert.deepEqual(parseWindow("29.12. bis 3.1.", { refDate: "2027-01-02" }), want);
});

// --- parseWindow: rejections ---

test("parseWindow: non-windows, glyph dropout, inverted and over-long spans are null", () => {
  assert.equal(parseWindow("Ab 28.10. geht's los", REF), null);
  assert.equal(parseWindow("KW 42 | 2026", REF), null);
  assert.equal(parseWindow("ERHÄLTLICH ab DIENSTAG", REF), null);
  assert.equal(parseWindow("Aktionszeitrum: 2.0. – 7.0.2026", REF), null); // month 0
  assert.equal(parseWindow("17.10.2026 - 15.10.2026"), null); // to < from
  assert.equal(parseWindow("15.10. bis 30.11.", REF), null); // > 31 days
});

test("parseWindow: a missing year without refDate cannot be resolved", () => {
  assert.equal(parseWindow("Donnerstag 15.10. bis Samstag 17.10."), null);
});

// --- leafletWindowFromIndex keeps its contract ---

test("leafletWindowFromIndex still reads the real index page-1 window", () => {
  const index = parseIndex(readFileSync(join(FIX, "index.html"), "utf8"));
  assert.deepEqual(leafletWindowFromIndex(index.pages), LEAFLET);
});

// --- resolveWindow on real geometry (D-08) ---

test("TOP_BAND_RATIO is 0.8 (real p26 header sits at 0.844)", () => {
  assert.equal(dates.TOP_BAND_RATIO, 0.8);
});

test("resolveWindow: p24 box 3 takes the page top-band window", () => {
  const p = page(24);
  assert.deepEqual(resolveWindow(boxOf(p, 3), p, LEAFLET), { ...WEEKEND, source: "page" });
});

test("resolveWindow: p26 box 36 (2 L Coca Cola) takes the letter-spaced weekend header", () => {
  const p = page(26);
  assert.ok(boxOf(p, 1).bbox[1] < 0.9 * p.height, "the real header is below a 0.9 band");
  assert.deepEqual(resolveWindow(boxOf(p, 36), p, LEAFLET), { ...WEEKEND, source: "page" });
});

test("resolveWindow: p1 box 28 gets the leaflet header, never the mid-page app coupon (Pitfall 6)", () => {
  const p = page(1);
  const w = resolveWindow(boxOf(p, 28), p, LEAFLET);
  assert.equal(w.from, "2026-10-12");
  assert.equal(w.to, "2026-10-17");
  assert.notEqual(w.from, "2026-10-15");
});

test("resolveWindow: p17 box 14 (no top-band header) falls back to the leaflet window", () => {
  const p = page("17.positive");
  assert.deepEqual(resolveWindow(boxOf(p, 14), p, LEAFLET), { ...LEAFLET, source: "leaflet" });
});

test("resolveWindow: a window in the candidate's own box beats a different page window", () => {
  const box = {
    id: 5,
    bbox: [10, 100, 200, 140],
    text: "Coca Cola und weitere Sorten je 12 x 1-l-PET, Donnerstag 15.10. bis Samstag 17.10.",
  };
  const p = {
    width: 476.22,
    height: 841.89,
    boxes: [{ id: 0, bbox: [10, 820, 300, 830], text: "GÜLTIG VOM 12. BIS 17. OKTOBER 2026" }, box],
    priceTokens: [],
  };
  assert.deepEqual(resolveWindow(box, p, LEAFLET), { ...WEEKEND, source: "box" });
});
