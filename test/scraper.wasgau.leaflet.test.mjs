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
  decodeEntities,
} from "../scraper/wasgau/leaflet.mjs";
import { classify, caseCount } from "../contract/matcher.mjs";
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

// ---- homepage link + coords URL (D-07, D-18, T-05-01) -------------------------

// A homepage carrying the given angebotslink in the real `var wasgau` script.
const homepageWith = (link) =>
  `<script id="wa-prospekt-links-js-extra">\nvar wasgau = ${JSON.stringify({ angebotslink: link })};\n</script>`;

test("parseLeafletLink: real homepage -> id ep1rP1V0, URL rebuilt from the id", () => {
  assert.deepEqual(parseLeafletLink(fixture("homepage.html")), {
    id: "ep1rP1V0",
    url: "https://wasgau-dlog.1kcloud.com/ep1rP1V0/",
  });
});

test("parseLeafletLink: rejects a missing script, foreign host, http, and traversal ids", () => {
  assert.throws(
    () => parseLeafletLink('<a href="https://wasgau-dlog.1kcloud.com/ep1rP1V0/">Zum Prospekt</a>'),
    /angebotslink script not found/,
  );
  for (const bad of [
    "https://evil.example.com/ep1rP1V0/",
    "https://wasgau-dlog.1kcloud.com.evil.example/ep1rP1V0/",
    "http://wasgau-dlog.1kcloud.com/ep1rP1V0/",
    "https://wasgau-dlog.1kcloud.com/ep1r/P1V0/",
    "https://wasgau-dlog.1kcloud.com/../ep1rP1V0/",
  ]) {
    assert.throws(() => parseLeafletLink(homepageWith(bad)), /not an allowed 1kcloud URL/, bad);
  }
});

test("coordsUrl: rejects page 0, 201, 1.5 and id '../x'", () => {
  assert.throws(() => coordsUrl("ep1rP1V0", 0));
  assert.throws(() => coordsUrl("ep1rP1V0", 201));
  assert.throws(() => coordsUrl("ep1rP1V0", 1.5));
  assert.throws(() => coordsUrl("../x", 17));
  assert.equal(
    coordsUrl("ep1rP1V0", 200),
    "https://wasgau-dlog.1kcloud.com/ep1rP1V0/epaper/coords/page_200.xml",
  );
});

// ---- index page (D-09, SC4) ---------------------------------------------------

test("parseIndex: real index -> title, pages [1, 2, 17, 26], page-1 window text", () => {
  const { title, pages } = parseIndex(fixture("index.html"));
  assert.equal(title, "WASGAU Prospekt ab 12.10.");
  assert.deepEqual(pages.map((p) => p.page), [1, 2, 17, 26]);
  assert.ok(pages[0].text.startsWith("GÜLTIG VOM 12. BIS 17. OKTOBER 2026"), pages[0].text.slice(0, 60));
  assert.deepEqual(colaPageNumbers(pages), [17, 26]);
});

test("parseIndex: no searchable pages throws", () => {
  assert.throws(() => parseIndex("<html></html>"), /no searchable pages/);
});

test("colaPageNumbers: more than 8 Cola pages is implausible and throws; zero is valid", () => {
  const nine = Array.from({ length: 9 }, (_, i) => ({ page: i + 1, text: "Coca-Cola je 12 x 1-l" }));
  assert.throws(() => colaPageNumbers(nine), /implausible Cola page count/);
  assert.deepEqual(colaPageNumbers([{ page: 1, text: "Pepsi only" }]), []);
});

// ---- coords XML reconstruction (Pattern 2, Pitfalls 3/5/8) --------------------

test("reconstructPage p17: page height, exact box-14 text, price tokens without strike prices", () => {
  const pg = reconstructPage(fixture("page_17.xml"));
  assert.equal(pg.height, 841.89);
  assert.equal(
    pg.boxes.find((b) => b.id === 14).text,
    "*Coca Cola1) oder *Coca Cola Zero 1) und weitere Sorten je 6 x 1-l-MW-Glasflaschen, zzgl. 2.40 Pfand, 1-l-Preis 1.50, 1)koffeinhaltig",
  );
  const cents = pg.priceTokens.map((t) => t.cents);
  for (const c of [899, 79, 499, 169]) assert.ok(cents.includes(c), `token ${c}`);
  // Strike prices (10.99, 5.99) are size 11 and must never become tokens.
  assert.ok(!cents.includes(1099) && !cents.includes(599), String(cents));
});

test("reconstructPage p1 box 28: merged big price leaves the text, token lies inside the box (Pitfall 5)", () => {
  const pg = reconstructPage(fixture("page_1.xml"));
  const box = pg.boxes.find((b) => b.id === 28);
  assert.ok(box.text.includes("kg-Preis 9.93"), box.text);
  assert.ok(!box.text.includes("1.49"), box.text);
  const tok = pg.priceTokens.find((t) => t.cents === 149);
  assert.ok(tok, "1.49 token");
  const [bx0, by0, bx1, by1] = box.bbox;
  const [tx0, ty0, tx1, ty1] = tok.bbox;
  assert.ok(tx0 >= bx0 && ty0 >= by0 && tx1 <= bx1 && ty1 <= by1, `${tok.bbox} inside ${box.bbox}`);
});

test("reconstructPage: CRLF input reconstructs identically to LF (Pitfall 8)", () => {
  for (const name of ["page_1.xml", "page_17.xml", "page_24.xml", "page_26.xml"]) {
    const lfXml = fixture(name).replace(/\r\n?/g, "\n");
    assert.deepEqual(reconstructPage(lfXml.replace(/\n/g, "\r\n")), reconstructPage(lfXml), name);
  }
});

// Minimal pdfminer-shaped page around the given textbox markup.
const pageXml = (inner) =>
  `<?xml version="1.0" encoding="utf-8" ?>\n<pages>\n<page id="1" bbox="0.000,0.000,476.220,841.890" rotate="0">\n${inner}\n</page>\n</pages>\n`;

// One textline of 7.4 pt chars, one <text> element per char (an escaped entity
// like "&amp;" is ONE char, as pdfminer emits it). `order` swaps the attribute
// order to prove the scanner is order-tolerant.
const lineXml = (s, y = 100, order = "font-first") =>
  `<textline bbox="10,${y},90,${y + 8}">\n${s
    .match(/&[a-z]{2,4};|./gsu)
    .map((c, i) =>
      order === "font-first"
        ? `<text font="F" bbox="${10 + i},${y},${11 + i},${y + 8}" size="7.441">${c}</text>`
        : `<text size="7.441" bbox="${10 + i},${y},${11 + i},${y + 8}" font="F">${c}</text>`,
    )
    .join("\n")}\n<text>\n</text>\n</textline>`;

test("reconstructPage synthetic: 'Coca-' + 'Cola' lines join to 'Coca-Cola' (Pitfall 3)", () => {
  const xml = pageXml(
    `<textbox id="1" bbox="10,90,90,118">\n${lineXml("Coca-", 110)}\n${lineXml("Cola je 12 x 1-l", 100)}\n</textbox>`,
  );
  const [box] = reconstructPage(xml).boxes;
  assert.equal(box.text, "Coca-Cola je 12 x 1-l");
  assert.equal(classify({ description: box.text }), "accept");
});

test("reconstructPage synthetic: swapped attribute order parses identically", () => {
  const a = pageXml(`<textbox id="1" bbox="10,100,90,108">\n${lineXml("Coca Cola", 100, "font-first")}\n</textbox>`);
  const b = pageXml(`<textbox bbox="10,100,90,108" id="1">\n${lineXml("Coca Cola", 100, "size-first")}\n</textbox>`);
  assert.deepEqual(reconstructPage(b), reconstructPage(a));
});

test("reconstructPage synthetic: self-closing layout textboxes are ignored, &amp; decodes", () => {
  const xml = pageXml(
    `<textbox id="1" bbox="10,100,90,108">\n${lineXml("Fanta &amp; Coca Cola", 100)}\n</textbox>\n` +
      `<layout>\n<textgroup bbox="0,0,476,841">\n<textbox id="99" bbox="10,100,90,108" />\n</textgroup>\n</layout>`,
  );
  const pg = reconstructPage(xml);
  assert.deepEqual(pg.boxes.map((b) => b.id), [1]);
  assert.equal(pg.boxes[0].text, "Fanta & Coca Cola");
});

test("reconstructPage synthetic: missing page or missing textboxes throw", () => {
  assert.throws(() => reconstructPage("<pages></pages>"), /1kcloud coords: no page/);
  assert.throws(() => reconstructPage(pageXml("<figure></figure>")), /1kcloud coords: no textboxes/);
});

test("decodeEntities: named + numeric references; out-of-range left untouched", () => {
  assert.equal(decodeEntities("a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;"), "a & b <c> \"d\" 'e'");
  assert.equal(decodeEntities("&#252;&#xFC;"), "üü");
  assert.equal(decodeEntities("&#x110000;"), "&#x110000;");
});

// ---- matcher on reconstructed text (D-14, SC2 negatives) -----------------------

test("classify on reconstructed text: real negatives reject, synthesized positive accepts 12", () => {
  const p17 = reconstructPage(fixture("page_17.xml"));
  const p26 = reconstructPage(fixture("page_26.xml"));
  const pos = reconstructPage(fixture("page_17.positive.xml"));
  const text = (pg, id) => pg.boxes.find((b) => b.id === id).text;
  assert.equal(classify({ description: text(p17, 14) }), "reject", "6x1L glass");
  assert.equal(classify({ description: text(p17, 17) }), "reject", "0,33 can");
  assert.equal(classify({ description: text(p26, 36) }), "reject", "2 L PET");
  assert.equal(classify({ description: text(pos, 14) }), "accept");
  assert.equal(caseCount({ description: text(pos, 14) }), 12);
});
