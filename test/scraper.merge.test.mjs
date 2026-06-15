import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeWithPrior } from "../scraper/merge.mjs";
import { parseCurrentOffers, parseStatusFile } from "../contract/schema.mjs";

// Fixed clock for every merge case (deterministic — Pattern 4).
const NOW = new Date("2026-06-15T10:00:00Z");
const NOW_ISO = "2026-06-15T10:00:00.000Z";

// A built status:"offer" StoreOffer (what selectForStore returns on an accept).
const builtOffer = (store, price = 999) => ({
  store,
  displayName: store,
  status: "offer",
  needsReview: false,
  price,
  currency: "EUR",
  pricePerLitre: Math.round(price / 12),
  validFrom: "2026-06-16",
  validTo: "2026-06-21",
});

// A prior snapshot mirroring data/current-offers.json + data/status.json shapes.
const priorWith = (rewePrice = 1099, rewePriorTs = "2026-06-01T04:00:00Z") => ({
  currentOffers: {
    lastUpdated: "2026-06-01T04:00:00Z",
    stores: [
      {
        store: "REWE",
        displayName: "REWE",
        status: "offer",
        needsReview: false,
        price: rewePrice,
        currency: "EUR",
        pricePerLitre: Math.round(rewePrice / 12),
        validFrom: "2026-06-02",
        validTo: "2026-06-07",
      },
      { store: "Edeka", displayName: "Edeka", status: "no_offer" },
      { store: "Lidl", displayName: "Lidl", status: "no_offer" },
      { store: "Kaufland", displayName: "Kaufland", status: "no_offer" },
      { store: "Wasgau", displayName: "Wasgau", status: "unavailable" },
    ],
  },
  status: {
    lastUpdated: "2026-06-01T04:00:00Z",
    stores: [
      { store: "REWE", status: "offer", lastUpdated: rewePriorTs },
      { store: "Edeka", status: "no_offer", lastUpdated: "2026-06-01T04:00:00Z" },
      { store: "Lidl", status: "no_offer", lastUpdated: "2026-06-01T04:00:00Z" },
      { store: "Kaufland", status: "no_offer", lastUpdated: "2026-06-01T04:00:00Z" },
      { store: "Wasgau", status: "unavailable", lastUpdated: "2026-06-01T04:00:00Z" },
    ],
  },
});

const coldPrior = () => ({ currentOffers: null, status: null });
const find = (doc, store) => doc.stores.find((s) => s.store === store);

// --- Both documents are always schema-valid with all 5 stores once ---

test("mergeWithPrior produces schema-valid docs with all 5 stores exactly once", () => {
  const storeResults = {
    REWE: builtOffer("REWE"),
    Edeka: { status: "no_offer" },
    Lidl: { status: "no_offer" },
    Kaufland: { status: "no_offer" },
  };
  const { currentOffers, status } = mergeWithPrior(storeResults, {}, coldPrior(), NOW);

  assert.doesNotThrow(() => parseCurrentOffers(currentOffers));
  assert.doesNotThrow(() => parseStatusFile(status));
  assert.deepEqual(
    currentOffers.stores.map((s) => s.store).sort(),
    ["Edeka", "Kaufland", "Lidl", "REWE", "Wasgau"]
  );
  assert.deepEqual(
    status.stores.map((s) => s.store).sort(),
    ["Edeka", "Kaufland", "Lidl", "REWE", "Wasgau"]
  );
});

// --- File-level lastUpdated always bumps to the run clock (D-05) ---

test("file-level lastUpdated on BOTH files === injected now (D-05)", () => {
  const { currentOffers, status } = mergeWithPrior(
    { REWE: { status: "no_offer" }, Edeka: { status: "no_offer" }, Lidl: { status: "no_offer" }, Kaufland: { status: "no_offer" } },
    {},
    coldPrior(),
    NOW
  );
  assert.equal(currentOffers.lastUpdated, NOW_ISO);
  assert.equal(status.lastUpdated, NOW_ISO);
});

// --- Wasgau is ALWAYS unavailable, even under a total-failure override (D-03) ---

test("Wasgau stays unavailable under a total-failure override map (D-03)", () => {
  const overrides = { REWE: "error", Edeka: "error", Lidl: "error", Kaufland: "error" };
  const { currentOffers, status } = mergeWithPrior({}, overrides, coldPrior(), NOW);

  assert.equal(find(currentOffers, "Wasgau").status, "unavailable");
  assert.equal(find(status, "Wasgau").status, "unavailable");
  assert.doesNotThrow(() => parseCurrentOffers(currentOffers));
  assert.doesNotThrow(() => parseStatusFile(status));
});

test("Wasgau per-store lastUpdated carries from prior when present, else now (D-03)", () => {
  // With prior -> prior Wasgau ts is carried.
  const warm = mergeWithPrior({}, {}, priorWith(), NOW);
  assert.equal(find(warm.status, "Wasgau").lastUpdated, "2026-06-01T04:00:00Z");
  // Cold -> synthetic now.
  const cold = mergeWithPrior({}, {}, coldPrior(), NOW);
  assert.equal(find(cold.status, "Wasgau").lastUpdated, NOW_ISO);
});

// --- Warm error: verbatim carry-forward + frozen per-store lastUpdated (D-04/D-05) ---

test("warm error carries the prior offer VERBATIM and freezes per-store lastUpdated (D-04/D-05)", () => {
  const prior = priorWith(1099, "2026-06-01T04:00:00Z");
  const overrides = { REWE: "error" };
  const storeResults = { Edeka: { status: "no_offer" }, Lidl: { status: "no_offer" }, Kaufland: { status: "no_offer" } };
  const { currentOffers, status } = mergeWithPrior(storeResults, overrides, prior, NOW);

  // current-offers.json: prior REWE entry copied verbatim (still status:"offer").
  const rewe = find(currentOffers, "REWE");
  assert.deepEqual(rewe, prior.currentOffers.stores.find((s) => s.store === "REWE"));
  assert.equal(rewe.status, "offer");
  assert.equal(rewe.price, 1099);

  // status.json: REWE is "error" with the FROZEN prior per-store lastUpdated.
  const reweStatus = find(status, "REWE");
  assert.equal(reweStatus.status, "error");
  assert.equal(reweStatus.lastUpdated, "2026-06-01T04:00:00Z"); // frozen, not bumped

  assert.doesNotThrow(() => parseCurrentOffers(currentOffers));
  assert.doesNotThrow(() => parseStatusFile(status));
});

// --- Cold-start error: no_offer in current-offers, error in status (D-06) ---

test("cold-start error serializes as no_offer + error and passes both parse helpers (D-06)", () => {
  const overrides = { REWE: "error", Edeka: "error", Lidl: "error", Kaufland: "error" };
  const { currentOffers, status } = mergeWithPrior({}, overrides, coldPrior(), NOW);

  for (const store of ["REWE", "Edeka", "Lidl", "Kaufland"]) {
    const co = find(currentOffers, store);
    assert.equal(co.status, "no_offer"); // honest no_offer (schema-valid, no offer fields)
    assert.equal(co.price, undefined);

    const st = find(status, store);
    assert.equal(st.status, "error");
    assert.equal(st.lastUpdated, NOW_ISO); // synthetic first value (Open Q1)
  }

  assert.doesNotThrow(() => parseCurrentOffers(currentOffers));
  assert.doesNotThrow(() => parseStatusFile(status));
});

// --- Successful refresh: bumps per-store lastUpdated (D-05) ---

test("successful store bumps per-store lastUpdated to now (D-05)", () => {
  const prior = priorWith();
  const storeResults = {
    REWE: builtOffer("REWE", 899),
    Edeka: { status: "no_offer" },
    Lidl: { status: "no_offer" },
    Kaufland: { status: "no_offer" },
  };
  const { currentOffers, status } = mergeWithPrior(storeResults, {}, prior, NOW);

  assert.equal(find(currentOffers, "REWE").price, 899); // the NEW offer, not the prior
  assert.equal(find(status, "REWE").status, "offer");
  assert.equal(find(status, "REWE").lastUpdated, NOW_ISO); // bumped on success
});

// --- Absent-from-results store -> no_offer, NOT error (Pitfall 6) ---

test("a store absent from results with no override is no_offer, not error (Pitfall 6)", () => {
  // Only REWE built; the other three are missing from storeResults and have no override.
  const storeResults = { REWE: builtOffer("REWE") };
  const { currentOffers, status } = mergeWithPrior(storeResults, {}, coldPrior(), NOW);

  for (const store of ["Edeka", "Lidl", "Kaufland"]) {
    assert.equal(find(currentOffers, store).status, "no_offer");
    assert.equal(find(status, store).status, "no_offer");
  }
  assert.doesNotThrow(() => parseCurrentOffers(currentOffers));
  assert.doesNotThrow(() => parseStatusFile(status));
});
