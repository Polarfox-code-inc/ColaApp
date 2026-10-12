// test/scraper.wasgau.pair.test.mjs
//
// Offline tests for scraper/wasgau/pair.mjs (Phase 5, D-13): litres and
// 1-l-Preis extraction, and geometric price pairing with the per-litre
// cross-check, on REAL 2026-10-12 leaflet boxes (D-15) and on small synthetic
// boxes for the outcome classes the real week did not exhibit.
//
// Mirrors the node:test + assert/strict harness of test/scraper.fetch.test.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { reconstructPage } from "../scraper/wasgau/leaflet.mjs";
import { litresOf, unitPriceOf, pairPrice, MAX_GAP } from "../scraper/wasgau/pair.mjs";

const FIXTURES = new URL("./fixtures/wasgau/", import.meta.url);
const page = (name) => reconstructPage(readFileSync(new URL(name, FIXTURES), "utf8"));
const P1 = page("page_1.xml");
const P17 = page("page_17.xml");
const P24 = page("page_24.xml");
const P26 = page("page_26.xml");
const P17_POS = page("page_17.positive.xml");

// Pair one real box of a reconstructed page against that page's tokens.
const pairBox = (pg, id) => {
  const box = pg.boxes.find((b) => b.id === id);
  assert.ok(box, `box ${id} must be reconstructed`);
  return pairPrice(box, pg.priceTokens);
};

// ---- litresOf / unitPriceOf -------------------------------------------------

test("litresOf: multipacks, single containers, and the 1-l-Preis label alone", () => {
  assert.equal(litresOf("je 6 x 1-l-MW-Glasflaschen"), 6);
  assert.equal(litresOf("je 12 x 1-l-PET-Flaschen"), 12);
  assert.equal(litresOf("je 0,33-l-Dose"), 0.33);
  assert.equal(litresOf("je 2-l-PET-Flasche"), 2);
  assert.equal(litresOf("1-l-Preis 0.75"), null, "the unit-price label is not a volume");
});

test("unitPriceOf: plain, 'ab' (from-) price, and multi-variant Bitburger box", () => {
  assert.deepEqual(unitPriceOf("zzgl. 2.40 Pfand, 1-l-Preis 1.50,"), { cents: 150, from: false, multi: false });
  assert.equal(unitPriceOf("1-l-Preis ab 1.10").from, true);
  assert.equal(unitPriceOf("kg-Preis 9.93"), null);
  const bitburger = P1.boxes.find((b) => b.id === 37).text;
  assert.equal(unitPriceOf(bitburger).multi, true);
});

// ---- pairPrice on real boxes ------------------------------------------------

test("pairPrice p17 box 14 (6x1L glass): clean 8.99, only adjacent token", () => {
  const r = pairBox(P17, 14);
  assert.equal(r.pairing, "clean");
  assert.equal(r.priceCents, 899);
  assert.deepEqual(r.adjacentCents, [899]);
  assert.equal(r.unitPriceCents, 150);
  assert.equal(r.litres, 6);
});

test("pairPrice p17 box 17 (0,33 can): clean 0.79 although 8.99 is nearer (Pitfall 4)", () => {
  const r = pairBox(P17, 17);
  assert.equal(r.adjacentCents[0], 899, "the nearest token is the wrong (glass) price");
  assert.deepEqual(r.adjacentCents, [899, 79]);
  assert.equal(r.pairing, "clean");
  assert.equal(r.priceCents, 79);
});

test("pairPrice p17 box 10 (Sinalco 12x1L): clean 4.99 with granini's 1.69 also adjacent", () => {
  const r = pairBox(P17, 10);
  assert.ok(r.adjacentCents.includes(169), "1.69 is adjacent too");
  assert.equal(r.pairing, "clean");
  assert.equal(r.priceCents, 499);
});

test("pairPrice p26 box 36 (2 L PET): clean 1.49 with the price BELOW the box", () => {
  const r = pairBox(P26, 36);
  assert.equal(r.pairing, "clean");
  assert.equal(r.priceCents, 149);
});

test("pairPrice p24 box 3: price to the RIGHT, no 1-l-Preis -> ambiguous 1.39", () => {
  const r = pairBox(P24, 3);
  assert.equal(r.unitPriceCents, null);
  assert.equal(r.pairing, "ambiguous");
  assert.equal(r.priceCents, 139);
});

test("pairPrice p24 box 8: price to the LEFT, no 1-l-Preis -> ambiguous 0.99", () => {
  const r = pairBox(P24, 8);
  assert.equal(r.pairing, "ambiguous");
  assert.equal(r.priceCents, 99);
});

test("pairPrice p1 box 28: price merged into the product line (gap 0) -> ambiguous 1.49", () => {
  const r = pairBox(P1, 28);
  assert.equal(r.pairing, "ambiguous");
  assert.equal(r.priceCents, 149);
});

test("pairPrice p1 box 37 (Bitburger multi-variant): ambiguous, picks the consistent 11.99", () => {
  const r = pairBox(P1, 37);
  assert.deepEqual([...r.adjacentCents].sort((a, b) => a - b), [1099, 1199]);
  assert.equal(r.pairing, "ambiguous");
  assert.equal(r.priceCents, 1199);
});

test("pairPrice positive p17 box 14 (synthesized 12x1L): clean 8.99, 1-l-Preis 0.75, 12 L", () => {
  const r = pairBox(P17_POS, 14);
  assert.deepEqual(
    { priceCents: r.priceCents, pairing: r.pairing, unitPriceCents: r.unitPriceCents, litres: r.litres },
    { priceCents: 899, pairing: "clean", unitPriceCents: 75, litres: 12 },
  );
});

// ---- pairPrice synthetic outcome classes -------------------------------------

const CASE_BOX = {
  bbox: [0, 0, 100, 50],
  text: "Coca-Cola je 12 x 1-l-PET-Flaschen, zzgl. 3.30 Pfand, 1-l-Preis 0.75",
};
// A token to the right of CASE_BOX at the given edge gap (y overlaps).
const rightAt = (gap, cents) => ({ cents, bbox: [100 + gap, 10, 140 + gap, 40] });

test("pairPrice synthetic: single adjacent token inconsistent with the 1-l-Preis -> mismatch", () => {
  const r = pairPrice(CASE_BOX, [rightAt(10, 1299)]);
  assert.equal(r.pairing, "mismatch");
  assert.equal(r.priceCents, 1299);
});

test("pairPrice synthetic: two consistent tokens -> ambiguous with the nearest consistent", () => {
  const r = pairPrice(CASE_BOX, [rightAt(5, 1299), rightAt(30, 900), rightAt(60, 899)]);
  assert.deepEqual(r.adjacentCents, [1299, 900, 899]);
  assert.equal(r.pairing, "ambiguous");
  assert.equal(r.priceCents, 900);
});

test("pairPrice synthetic: no token within MAX_GAP -> unpaired, priceCents null", () => {
  const r = pairPrice(CASE_BOX, [rightAt(MAX_GAP + 1, 899)]);
  assert.equal(r.pairing, "unpaired");
  assert.equal(r.priceCents, null);
  assert.deepEqual(r.adjacentCents, []);
});

test("pairPrice synthetic: a diagonal token (no axis overlap) is never adjacent", () => {
  const r = pairPrice(CASE_BOX, [{ cents: 899, bbox: [110, 60, 150, 90] }]);
  assert.equal(r.pairing, "unpaired");
});
