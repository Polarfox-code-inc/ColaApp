// web/test/derive.test.mjs
// Locks the six research-flagged correctness landmines of the derivation layer:
// best-deal selection, the D-06 upcoming/active split, D-16 per-store staleness,
// Berlin-today, and card sort order. Pure functions only — a fixed NOW + the
// repo-root fixtures drive every assertion (no network, no real clock).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  berlinToday,
  isActive,
  isUpcoming,
  isStale,
  bestDeal,
  soonestUpcoming,
  sortCards,
} from "../src/derive/derive.js";

// web/test -> web -> repo root. Mocks + data live at the repo root, not under web/.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), "utf8"));

// Fixed clock for every case (deterministic — Pattern 4).
const NOW = new Date("2026-06-15T10:00:00Z");

const offerMock = () => readJson("mocks/current-offers.offer.json");
const upcomingMock = () => readJson("mocks/current-offers.upcoming.json");
const staleStatus = () => readJson("mocks/status.stale.json");
const freshStatus = () => readJson("data/status.json");

const byStore = (stores, key) => stores.find((s) => s.store === key);

// --- berlinToday: Intl en-CA Europe/Berlin, never a UTC slice ---

test("berlinToday derives the Berlin calendar day via Intl en-CA", () => {
  assert.equal(berlinToday(new Date("2026-06-15T10:00:00Z")), "2026-06-15");
});

test("berlinToday rolls forward when UTC is still the previous day (CEST)", () => {
  // 22:00Z on 2026-06-14 is already 2026-06-15 in Berlin (CEST, +2) — a naive
  // UTC slice would wrongly say 2026-06-14.
  assert.equal(berlinToday(new Date("2026-06-14T22:00:00Z")), "2026-06-15");
});

// --- isActive / isUpcoming: !needsReview gate + string-compare on YYYY-MM-DD ---

test("isActive is true for a clean offer whose range covers today", () => {
  const rewe = byStore(offerMock().stores, "REWE");
  assert.equal(isActive(rewe, "2026-06-16"), true);
});

test("isActive excludes a needsReview offer even when its dates are active (Pitfall 2)", () => {
  const edeka = byStore(offerMock().stores, "Edeka"); // needsReview:true, 06-15..06-20
  assert.equal(isActive(edeka, "2026-06-16"), false);
});

test("isActive is false before validFrom (future-dated offer is not active yet)", () => {
  const rewe = byStore(offerMock().stores, "REWE"); // validFrom 2026-06-16
  assert.equal(isActive(rewe, "2026-06-15"), false);
});

test("isActive is false for non-offer statuses (no_offer/error/unavailable)", () => {
  const stores = offerMock().stores;
  assert.equal(isActive(byStore(stores, "Lidl"), "2026-06-16"), false);
  assert.equal(isActive(byStore(stores, "Kaufland"), "2026-06-16"), false);
  assert.equal(isActive(byStore(stores, "Wasgau"), "2026-06-16"), false);
});

test("isUpcoming is true for a clean offer whose validFrom is after today", () => {
  const rewe = byStore(upcomingMock().stores, "REWE"); // validFrom 2026-06-22
  assert.equal(isUpcoming(rewe, "2026-06-15"), true);
});

test("isUpcoming excludes a needsReview offer", () => {
  const edeka = byStore(offerMock().stores, "Edeka"); // needsReview:true
  assert.equal(isUpcoming(edeka, "2026-06-10"), false);
});

test("an active offer is not upcoming and an upcoming offer is not active", () => {
  const reweActive = byStore(offerMock().stores, "REWE"); // 06-16..06-21
  assert.equal(isActive(reweActive, "2026-06-16"), true);
  assert.equal(isUpcoming(reweActive, "2026-06-16"), false);
  const reweUpcoming = byStore(upcomingMock().stores, "REWE"); // 06-22..
  assert.equal(isUpcoming(reweUpcoming, "2026-06-15"), true);
  assert.equal(isActive(reweUpcoming, "2026-06-15"), false);
});

// --- bestDeal: lowest active price, needsReview excluded, D-06 future-validFrom never wins ---

test("bestDeal returns the cheapest active offer, excluding needsReview (REWE 999 not Edeka 1099)", () => {
  const best = bestDeal(offerMock().stores, "2026-06-16");
  assert.equal(best.store, "REWE");
  assert.equal(best.price, 999);
});

test("D-06: bestDeal returns null when the only offer has a future validFrom (upcoming never wins the hero)", () => {
  // upcoming mock REWE validFrom is 2026-06-22; at today 2026-06-15 nothing is active.
  assert.equal(bestDeal(upcomingMock().stores, "2026-06-15"), null);
});

test("bestDeal returns null when no store is active", () => {
  // offer mock at 2026-06-15: REWE not active yet (06-16), Edeka needsReview -> no eligible active.
  assert.equal(bestDeal(offerMock().stores, "2026-06-15"), null);
});

// --- soonestUpcoming: earliest validFrom among upcoming ---

test("soonestUpcoming returns the earliest-validFrom upcoming offer", () => {
  const soon = soonestUpcoming(upcomingMock().stores, "2026-06-15");
  assert.equal(soon.store, "REWE");
  assert.equal(soon.validFrom, "2026-06-22");
});

test("soonestUpcoming returns null when nothing is upcoming", () => {
  // offer mock: REWE is active-soon (06-16) -> upcoming at 2026-06-15; but to test the
  // null path use a today after all validFrom dates.
  assert.equal(soonestUpcoming(offerMock().stores, "2026-06-25"), null);
});

// --- isStale: D-16 per-store lastUpdated against a 3-day threshold, injectable now ---

test("D-16: a store last updated 10 days ago is stale (per-store lastUpdated)", () => {
  const rewe = byStore(staleStatus().stores, "REWE"); // lastUpdated 2026-06-05
  assert.equal(isStale(rewe, NOW), true);
});

test("D-16: a store updated today is not stale against the same now", () => {
  const rewe = byStore(freshStatus().stores, "REWE"); // lastUpdated 2026-06-15
  assert.equal(isStale(rewe, NOW), false);
});

test("isStale uses the PER-STORE lastUpdated, not a file-level timestamp (Pitfall 1)", () => {
  // Construct a status whose store entry is stale but whose file-level stamp is fresh.
  const mixed = {
    lastUpdated: "2026-06-15T04:00:00Z", // fresh file-level
    stores: [{ store: "REWE", status: "offer", lastUpdated: "2026-06-05T04:00:00Z" }],
  };
  assert.equal(isStale(mixed.stores[0], NOW), true);
});

test("isStale honours a custom day threshold", () => {
  const store = { store: "REWE", status: "offer", lastUpdated: "2026-06-13T10:00:00Z" };
  // exactly 2 days before NOW: stale at threshold 1, fresh at threshold 3
  assert.equal(isStale(store, NOW, 1), true);
  assert.equal(isStale(store, NOW, 3), false);
});

// --- sortCards: bucket rank active(0)->upcoming(1)->no_offer(2)->unavailable/error(3) ---

test("sortCards orders active(cheapest-first) then upcoming, no_offer, then unavailable/error", () => {
  const sorted = sortCards(offerMock().stores, "2026-06-16");
  const order = sorted.map((s) => s.store);
  // At 2026-06-16: REWE active(0); Edeka needsReview -> not active/upcoming, bucketed by its
  // raw status "offer" but excluded -> falls to no_offer-equivalent tier behaviour. Lidl no_offer(2),
  // Kaufland error(3), Wasgau unavailable(3). Assert REWE leads and the error/unavailable trail.
  assert.equal(order[0], "REWE");
  assert.ok(
    order.indexOf("Lidl") < order.indexOf("Kaufland"),
    "no_offer (Lidl) sorts before error (Kaufland)"
  );
  assert.ok(
    order.indexOf("Lidl") < order.indexOf("Wasgau"),
    "no_offer (Lidl) sorts before unavailable (Wasgau)"
  );
});

test("sortCards places active cheapest-first when multiple stores are active", () => {
  const stores = [
    { store: "Kaufland", status: "offer", needsReview: false, price: 1199, validFrom: "2026-06-10", validTo: "2026-06-20" },
    { store: "REWE", status: "offer", needsReview: false, price: 899, validFrom: "2026-06-10", validTo: "2026-06-20" },
    { store: "Lidl", status: "no_offer" },
  ];
  const order = sortCards(stores, "2026-06-16").map((s) => s.store);
  assert.deepEqual(order, ["REWE", "Kaufland", "Lidl"]);
});
