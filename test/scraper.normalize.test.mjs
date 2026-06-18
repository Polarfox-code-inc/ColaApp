import { test } from "node:test";
import assert from "node:assert/strict";
import { berlinDay, toStoreOffer } from "../scraper/normalize.mjs";
import { systemNow } from "../scraper/clock.mjs";
import { parseCurrentOffers, STORES } from "../contract/schema.mjs";

// --- clock seam ---

test("systemNow() returns a Date", () => {
  const now = systemNow();
  assert.ok(now instanceof Date);
  assert.ok(!Number.isNaN(now.getTime()));
});

// --- berlinDay: Intl Europe/Berlin trim, never a UTC slice (D-09, findings S4) ---

test("berlinDay trims at Berlin midnight, not UTC (S4 boundary)", () => {
  // 22:00Z in summer (CEST +02:00) is 00:00 the NEXT day in Berlin.
  assert.equal(berlinDay("2026-06-14T22:00:00Z"), "2026-06-15");
  // A UTC slice(0,10) would wrongly yield 2026-06-14.
});

test("berlinDay keeps the same day when still before Berlin midnight", () => {
  assert.equal(berlinDay("2026-06-20T21:59:00Z"), "2026-06-20");
});

// --- toStoreOffer: integer cents, cents/litre, frozen-schema-valid ---

const range = (from, to) => ({ from, to });

test("toStoreOffer builds integer-cents price + cents/litre for 11.99", () => {
  const offer = { price: 11.99 };
  const so = toStoreOffer({ ...offer, store: "REWE" }, range("2026-06-14T22:00:00Z", "2026-06-20T21:59:00Z"));
  assert.equal(so.price, 1199); // Math.round(11.99 * 100)
  assert.equal(so.pricePerLitre, 100); // Math.round(1199 / 12) === 100
  assert.equal(so.currency, "EUR");
  assert.equal(so.status, "offer");
  assert.equal(so.needsReview, false);
});

test("toStoreOffer builds integer-cents price + cents/litre for 8.88", () => {
  const so = toStoreOffer(
    { price: 8.88, store: "Edeka" },
    range("2026-06-14T22:00:00Z", "2026-06-20T21:59:00Z")
  );
  assert.equal(so.price, 888); // Math.round(8.88 * 100)
  assert.equal(so.pricePerLitre, 74); // Math.round(888 / 12) === 74
});

test("toStoreOffer prices per ACTUAL bottle count (14×1L -> /14, not /12)", () => {
  const so = toStoreOffer(
    {
      price: 10.99,
      store: "Kaufland",
      brand: { name: "Coca-Cola" },
      product: { name: "Cola" },
      description: "Fanta, Sprite oder Mezzo Mix versch. Sorten 14 x je 1-l-PET-Fl.",
    },
    range("2026-06-17T22:00:00Z", "2026-06-24T18:00:00Z")
  );
  assert.equal(so.price, 1099);
  assert.equal(so.pricePerLitre, 79); // Math.round(1099 / 14), NOT 1099/12 (=92)
});

test("toStoreOffer falls back to /12 when the offer carries no parseable count", () => {
  const so = toStoreOffer({ price: 11.99, store: "REWE" }, range("2026-06-14T22:00:00Z", "2026-06-20T21:59:00Z"));
  assert.equal(so.pricePerLitre, 100); // Math.round(1199 / 12)
});

test("toStoreOffer trims validity range to Berlin days", () => {
  const so = toStoreOffer(
    { price: 11.99, store: "REWE" },
    range("2026-06-14T22:00:00Z", "2026-06-20T21:59:00Z")
  );
  assert.equal(so.validFrom, "2026-06-15");
  assert.equal(so.validTo, "2026-06-20");
});

test("toStoreOffer output carries NO pfand/deposit key (D-10, .strict())", () => {
  const so = toStoreOffer(
    { price: 11.99, store: "REWE", pfand: 3.3 },
    range("2026-06-14T22:00:00Z", "2026-06-20T21:59:00Z")
  );
  assert.equal("pfand" in so, false);
  assert.equal("deposit" in so, false);
});

test("toStoreOffer sets displayName === store (identity, Open Q2)", () => {
  const so = toStoreOffer(
    { price: 11.99, store: "Kaufland" },
    range("2026-06-14T22:00:00Z", "2026-06-20T21:59:00Z")
  );
  assert.equal(so.store, "Kaufland");
  assert.equal(so.displayName, "Kaufland");
});

// --- round-trip through the frozen schema: a current-offers doc with this entry parses ---

test("a toStoreOffer result round-trips through parseCurrentOffers", () => {
  const rewe = toStoreOffer(
    { price: 11.99, store: "REWE" },
    range("2026-06-14T22:00:00Z", "2026-06-20T21:59:00Z")
  );
  const file = {
    lastUpdated: "2026-06-15T04:00:00Z",
    stores: [
      rewe,
      ...STORES.filter((s) => s !== "REWE").map((s) => ({
        store: s,
        displayName: s,
        status: "no_offer",
      })),
    ],
  };
  assert.doesNotThrow(() => parseCurrentOffers(file));
});
