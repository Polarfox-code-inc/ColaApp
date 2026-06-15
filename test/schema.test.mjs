import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STORES,
  STATUS_VALUES,
  parseCurrentOffers,
  parseStatusFile,
  parseHistoryLine,
  StoreOfferSchema,
} from "../contract/schema.mjs";

// --- Contract shape guards (D-03/D-04/D-12) ---

test("STORES is exactly the 5 fixed advertisers (D-03/D-04)", () => {
  assert.deepEqual(STORES, ["REWE", "Edeka", "Lidl", "Kaufland", "Wasgau"]);
});

test("STATUS_VALUES is exactly the 4-value enum (D-12)", () => {
  assert.deepEqual(STATUS_VALUES, ["offer", "no_offer", "unavailable", "error"]);
});

// --- Behaviour: offer fields required when status==="offer" ---

test("a status:offer entry with integer-cents price validates", () => {
  const ok = StoreOfferSchema.parse({
    store: "REWE",
    displayName: "REWE",
    status: "offer",
    price: 999,
    currency: "EUR",
    pricePerLitre: 83,
    validFrom: "2026-06-16",
    validTo: "2026-06-21",
  });
  assert.equal(ok.needsReview, false); // defaults to false (D-08)
});

test("a status:offer entry with a FLOAT price is rejected (D-09)", () => {
  assert.throws(() =>
    StoreOfferSchema.parse({
      store: "REWE",
      displayName: "REWE",
      status: "offer",
      price: 9.99,
      currency: "EUR",
      pricePerLitre: 83,
      validFrom: "2026-06-16",
      validTo: "2026-06-21",
    })
  );
});

test("a status:offer entry missing price is rejected (refinement)", () => {
  assert.throws(() =>
    StoreOfferSchema.parse({
      store: "Edeka",
      displayName: "Edeka",
      status: "offer",
      currency: "EUR",
    })
  );
});

test("a no_offer entry without offer fields validates (D-05)", () => {
  const ok = StoreOfferSchema.parse({
    store: "Lidl",
    displayName: "Lidl",
    status: "no_offer",
  });
  assert.equal(ok.status, "no_offer");
});

test("an unknown status value is rejected (D-12)", () => {
  assert.throws(() =>
    StoreOfferSchema.parse({
      store: "REWE",
      displayName: "REWE",
      status: "pending",
    })
  );
});

test("no pfand/deposit field is accepted by the schema (D-10)", () => {
  // strict schema: unknown keys like 'pfand' must be stripped or rejected.
  const parsed = StoreOfferSchema.parse({
    store: "REWE",
    displayName: "REWE",
    status: "no_offer",
  });
  assert.equal("pfand" in parsed, false);
  assert.equal("deposit" in parsed, false);
});

test("parseCurrentOffers requires all 5 StoreKeys exactly once (D-05)", () => {
  const base = STORES.map((s) => ({
    store: s,
    displayName: s,
    status: "no_offer",
  }));
  const file = { lastUpdated: "2026-06-15T04:00:00Z", stores: base };
  assert.doesNotThrow(() => parseCurrentOffers(file));

  // missing a store -> reject
  assert.throws(() =>
    parseCurrentOffers({
      lastUpdated: "2026-06-15T04:00:00Z",
      stores: base.slice(0, 4),
    })
  );
  // duplicate store -> reject
  assert.throws(() =>
    parseCurrentOffers({
      lastUpdated: "2026-06-15T04:00:00Z",
      stores: [...base, { store: "REWE", displayName: "REWE", status: "no_offer" }],
    })
  );
});

test("parseCurrentOffers rejects a non-ISO lastUpdated (D-13)", () => {
  const base = STORES.map((s) => ({ store: s, displayName: s, status: "no_offer" }));
  assert.throws(() =>
    parseCurrentOffers({ lastUpdated: "2026-06-15", stores: base })
  );
});

test("parseHistoryLine requires the D-14 shape", () => {
  assert.doesNotThrow(() =>
    parseHistoryLine({
      date: "2026-06-15",
      store: "REWE",
      price: 999,
      pricePerLitre: 83,
      validFrom: "2026-06-16",
      validTo: "2026-06-21",
    })
  );
  // float price rejected
  assert.throws(() =>
    parseHistoryLine({
      date: "2026-06-15",
      store: "REWE",
      price: 9.99,
      pricePerLitre: 83,
      validFrom: "2026-06-16",
      validTo: "2026-06-21",
    })
  );
});

test("parseStatusFile validates per-store fetch state shape (D-01/D-06)", () => {
  assert.doesNotThrow(() =>
    parseStatusFile({
      lastUpdated: "2026-06-15T04:00:00Z",
      stores: STORES.map((s) => ({
        store: s,
        status: "no_offer",
        lastUpdated: "2026-06-15T04:00:00Z",
      })),
    })
  );
});
