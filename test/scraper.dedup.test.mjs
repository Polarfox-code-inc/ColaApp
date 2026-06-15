import { test } from "node:test";
import assert from "node:assert/strict";
import { historyLinesToAppend, keyOf } from "../scraper/dedup.mjs";
import { parseHistoryLine } from "../contract/schema.mjs";
import { berlinDay } from "../scraper/normalize.mjs";

const NOW = new Date("2026-06-15T10:00:00Z");

const offer = (over = {}) => ({
  store: "REWE",
  displayName: "REWE",
  status: "offer",
  needsReview: false,
  price: 999,
  currency: "EUR",
  pricePerLitre: 83,
  validFrom: "2026-06-16",
  validTo: "2026-06-21",
  ...over,
});

// --- keyOf is the frozen D-14 key ---

test("keyOf returns the frozen store|price|validFrom key (D-14)", () => {
  assert.equal(keyOf(offer()), "REWE|999|2026-06-16");
});

// --- emits one valid line per new clean accept (incl. upcoming) ---

test("emits one valid history line per new clean accept", () => {
  const lines = historyLinesToAppend([offer()], new Set(), NOW);
  assert.equal(lines.length, 1);
  const obj = JSON.parse(lines[0]);
  assert.equal(obj.date, berlinDay(NOW.toISOString())); // observation date
  assert.equal(obj.date, "2026-06-15");
  assert.equal(obj.store, "REWE");
  assert.equal(obj.price, 999);
  assert.equal(obj.pricePerLitre, 83);
  assert.equal(obj.validFrom, "2026-06-16");
  assert.equal(obj.validTo, "2026-06-21");
  // No store-offer-only fields leak into the history line (strict HistoryLine).
  assert.equal("status" in obj, false);
  assert.equal("needsReview" in obj, false);
  assert.equal("currency" in obj, false);
});

test("upcoming (future validFrom) offers ARE included in history", () => {
  const upcoming = offer({ validFrom: "2026-06-30", validTo: "2026-07-05" });
  const lines = historyLinesToAppend([upcoming], new Set(), NOW);
  assert.equal(lines.length, 1);
});

test("every emitted line parses cleanly through parseHistoryLine", () => {
  const lines = historyLinesToAppend(
    [offer(), offer({ store: "Edeka", price: 888, pricePerLitre: 74, validFrom: "2026-06-17" })],
    new Set(),
    NOW
  );
  assert.equal(lines.length, 2);
  for (const line of lines) {
    assert.doesNotThrow(() => parseHistoryLine(JSON.parse(line)));
  }
});

// --- dedup: a re-run with seeded existingKeys yields zero new lines (DATA-04) ---

test("re-run over identical offers + seeded keys yields 0 new lines (DATA-04)", () => {
  const offers = [offer(), offer({ store: "Kaufland", price: 1049, validFrom: "2026-06-09" })];
  const first = historyLinesToAppend(offers, new Set(), NOW);
  assert.equal(first.length, 2);

  // Seed existingKeys from the first run's output, then re-run.
  const seen = new Set(first.map((l) => keyOf(JSON.parse(l))));
  const second = historyLinesToAppend(offers, seen, NOW);
  assert.equal(second.length, 0);
});

test("a changed price emits a new line even if store+validFrom repeat", () => {
  const seen = new Set([keyOf(offer())]); // REWE|999|2026-06-16
  const cheaper = offer({ price: 899, pricePerLitre: 75 });
  const lines = historyLinesToAppend([cheaper], seen, NOW);
  assert.equal(lines.length, 1); // new key REWE|899|2026-06-16
});

// --- exclusions: needsReview / non-offer statuses produce no line (Pitfall 4) ---

test("a needsReview:true offer produces NO history line (Pitfall 4)", () => {
  const flagged = offer({ needsReview: true });
  const lines = historyLinesToAppend([flagged], new Set(), NOW);
  assert.equal(lines.length, 0);
});

test("no_offer / unavailable / error entries produce no line", () => {
  const entries = [
    { store: "Lidl", status: "no_offer" },
    { store: "Wasgau", status: "unavailable" },
    { store: "Edeka", status: "error" },
  ];
  const lines = historyLinesToAppend(entries, new Set(), NOW);
  assert.equal(lines.length, 0);
});
