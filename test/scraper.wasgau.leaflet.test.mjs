// test/scraper.wasgau.leaflet.test.mjs
//
// Offline tests for the pure Wasgau leaflet slice (Phase 5): homepage link ->
// 1kcloud index (Cola pages + leaflet window) -> pdfminer coords XML
// reconstruction -> price pairing -> candidates doc -> needsReview StoreOffer.
//
// Fixtures are real 2026-10-12 captures (D-15) read with readFileSync; the only
// synthesized file is page_17.positive.xml (header says SYNTHESIZED-FROM-REAL).
// No network, no clock: NOW is injected.
//
// Mirrors the node:test + assert/strict harness of test/scraper.fetch.test.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  parseLeafletLink,
  coordsUrl,
  parseIndex,
  colaPageNumbers,
  reconstructPage,
} from "../scraper/wasgau/leaflet.mjs";
import { leafletWindowFromIndex } from "../scraper/wasgau/dates.mjs";
import {
  extractCandidates,
  buildCandidatesDoc,
  parseCandidatesDoc,
  evaluateCandidates,
} from "../scraper/wasgau/candidates.mjs";

const FIXTURES = new URL("./fixtures/wasgau/", import.meta.url);
const fixture = (name) => readFileSync(new URL(name, FIXTURES), "utf8");

// Wednesday of the 2026-10-12..17 leaflet week -> the offer is active.
const NOW = new Date("2026-10-14T10:00:00Z");

test("pure leaflet slice (tracer): homepage -> index -> positive p17 -> needsReview StoreOffer", () => {
  // 1. Homepage -> validated leaflet id; every later URL rebuilt from it.
  const link = parseLeafletLink(fixture("homepage.html"));
  assert.deepEqual(link, { id: "ep1rP1V0", url: "https://wasgau-dlog.1kcloud.com/ep1rP1V0/" });
  assert.equal(
    coordsUrl("ep1rP1V0", 17),
    "https://wasgau-dlog.1kcloud.com/ep1rP1V0/epaper/coords/page_17.xml",
  );

  // 2. Index -> Cola pages + leaflet-wide validity window (page-1 text).
  const index = parseIndex(fixture("index.html"));
  const colaPages = colaPageNumbers(index.pages);
  assert.deepEqual(colaPages, [17, 26]);
  const leafletWindow = leafletWindowFromIndex(index.pages);
  assert.deepEqual(leafletWindow, { from: "2026-10-12", to: "2026-10-17" });

  // 3. Positive page -> box-14 candidate, cleanly paired, accepted by the
  //    UNCHANGED matcher (D-14).
  const page = reconstructPage(fixture("page_17.positive.xml"));
  const candidates = extractCandidates(17, page, leafletWindow);
  const c14 = candidates.find((c) => c.box === 14);
  assert.ok(c14, "box 14 must be captured as a Cola candidate");
  assert.equal(c14.verdict, "accept");
  assert.equal(c14.pairing, "clean");
  assert.equal(c14.priceCents, 899);
  assert.equal(c14.unitPriceCents, 75);
  assert.equal(c14.litres, 12);
  assert.equal(c14.windowSource, "leaflet");
  assert.equal(c14.validFrom, "2026-10-12");
  assert.equal(c14.validTo, "2026-10-17");

  // 4. Candidates doc is schema-valid and survives a JSON round trip.
  const doc = buildCandidatesDoc({
    leafletId: link.id,
    leafletUrl: link.url,
    title: index.title,
    leafletWindow,
    colaPages,
    candidates,
  });
  const roundTripped = parseCandidatesDoc(JSON.parse(JSON.stringify(doc)));
  assert.notEqual(roundTripped, null, "doc must re-validate after JSON round trip");

  // 5. Evaluation -> a Wasgau StoreOffer; probation forces needsReview (D-12).
  const expected = {
    store: "Wasgau",
    displayName: "Wasgau",
    status: "offer",
    needsReview: true,
    price: 899,
    currency: "EUR",
    pricePerLitre: 75,
    validFrom: "2026-10-12",
    validTo: "2026-10-17",
  };
  assert.deepEqual(evaluateCandidates(roundTripped, NOW, { probation: true }), expected);
  assert.deepEqual(evaluateCandidates(roundTripped, NOW, { probation: false }), {
    ...expected,
    needsReview: false,
  });

  // 6. A stored verdict is never trusted: a tampered "reject" still yields the
  //    offer because evaluateCandidates re-classifies the text (D-06).
  const tampered = structuredClone(roundTripped);
  tampered.candidates.find((c) => c.box === 14).verdict = "reject";
  assert.deepEqual(evaluateCandidates(tampered, NOW, { probation: true }), expected);
});
