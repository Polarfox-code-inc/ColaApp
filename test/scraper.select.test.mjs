import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { filterToAllowList } from "../scraper/filter.mjs";
import { selectForStore } from "../scraper/select.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), "utf8"));

// Fixed clock for every selection case (no network, deterministic — Pattern 4).
const NOW = new Date("2026-06-15T10:00:00Z");

// A Coca-Cola 12x1L accept offer with explicit price + validity ranges.
const accept = (price, ranges, extra = {}) => ({
  brand: { name: "Coca-Cola", uniqueName: "coca-cola" },
  product: { name: "Cola", description: "Original Taste" },
  description: "Coca-Cola Original 12 x 1-l case",
  store: "REWE",
  price,
  validityDates: ranges,
  ...extra,
});

const range = (from, to) => ({ from, to });

// --- filterToAllowList: only the 4 in-scope marktguru slugs bucket ---

test("filterToAllowList keys exactly the 4 marktguru stores, excludes out-of-scope", () => {
  const raw = readJson("spike/fixtures/raw-67105-search.json");
  const results = Array.isArray(raw) ? raw : raw.results ?? raw.data ?? [];
  const byStore = filterToAllowList(results);

  // Pre-seeded with all four in-scope keys (Wasgau intentionally absent, D-03).
  assert.deepEqual([...byStore.keys()].sort(), ["Edeka", "Kaufland", "Lidl", "REWE"]);

  // No offer whose only advertiser is out-of-scope appears in any bucket.
  const all = [...byStore.values()].flat();
  for (const o of all) {
    const slugs = (o.advertisers ?? []).map((a) => a.uniqueName);
    assert.ok(
      slugs.some((s) => ["rewe", "edeka", "lidl", "kaufland"].includes(s)),
      `bucketed offer has no in-scope advertiser: ${slugs}`
    );
  }
});

test("filterToAllowList excludes netto/penny/scheck-in/thomas-philipps", () => {
  const results = [
    { advertisers: [{ uniqueName: "netto-marken-discount" }], id: 1 },
    { advertisers: [{ uniqueName: "penny" }], id: 2 },
    { advertisers: [{ uniqueName: "scheck-in-center" }], id: 3 },
    { advertisers: [{ uniqueName: "thomas-philipps" }], id: 4 },
    { advertisers: [{ uniqueName: "rewe" }], id: 5 },
  ];
  const byStore = filterToAllowList(results);
  assert.deepEqual(byStore.get("REWE").map((o) => o.id), [5]);
  assert.equal(byStore.get("Edeka").length, 0);
  assert.equal(byStore.get("Lidl").length, 0);
  assert.equal(byStore.get("Kaufland").length, 0);
});

// --- selectForStore decision ladder (D-07/D-08) ---

test("active offer beats a future-dated upcoming offer", () => {
  const activeRange = range("2026-06-14T22:00:00Z", "2026-06-20T21:59:00Z"); // covers 2026-06-15
  const futureRange = range("2026-06-21T22:00:00Z", "2026-06-27T21:59:00Z");
  const chosen = selectForStore(
    [accept(9.99, [futureRange]), accept(11.99, [activeRange])],
    NOW
  );
  assert.equal(chosen.status, "offer");
  assert.equal(chosen.validFrom, "2026-06-15"); // the active range was chosen
  assert.equal(chosen.price, 1199);
});

test("when only future offers exist the earliest-from upcoming wins", () => {
  const later = range("2026-06-28T22:00:00Z", "2026-07-04T21:59:00Z");
  const earlier = range("2026-06-21T22:00:00Z", "2026-06-27T21:59:00Z");
  const chosen = selectForStore(
    [accept(9.99, [later]), accept(8.88, [earlier])],
    NOW
  );
  assert.equal(chosen.status, "offer");
  assert.equal(chosen.validFrom, "2026-06-22"); // earliest future from (Berlin)
  assert.equal(chosen.price, 888);
});

test("two active accepts -> lowest price wins (tie-break)", () => {
  const r = range("2026-06-14T22:00:00Z", "2026-06-20T21:59:00Z");
  const chosen = selectForStore(
    [accept(11.99, [r]), accept(8.88, [r])],
    NOW
  );
  assert.equal(chosen.price, 888);
});

test("multi-range offer: an active range inside the array is found (Pitfall 5)", () => {
  const multi = accept(7.77, [
    range("2026-06-01T22:00:00Z", "2026-06-06T21:59:00Z"), // past
    range("2026-06-14T22:00:00Z", "2026-06-20T21:59:00Z"), // active
  ]);
  const chosen = selectForStore([multi], NOW);
  assert.equal(chosen.status, "offer");
  assert.equal(chosen.validFrom, "2026-06-15"); // the active sub-range
  assert.equal(chosen.price, 777);
});

test("review candidate with no accept -> needsReview:true StoreOffer (D-08)", () => {
  const reviewOffer = {
    brand: { name: "Coca-Cola", uniqueName: "coca-cola" },
    product: { name: "Cola" },
    description: "Coca-Cola Kasten", // case-word, no confirming size -> review
    store: "REWE",
    price: 12.49,
    validityDates: [range("2026-06-14T22:00:00Z", "2026-06-20T21:59:00Z")],
  };
  const chosen = selectForStore([reviewOffer], NOW);
  assert.equal(chosen.status, "offer");
  assert.equal(chosen.needsReview, true);
  assert.equal(chosen.price, 1249);
});

test("a clean accept always wins over a review candidate (review never overrides)", () => {
  const r = range("2026-06-14T22:00:00Z", "2026-06-20T21:59:00Z");
  const reviewOffer = {
    brand: { name: "Coca-Cola", uniqueName: "coca-cola" },
    product: { name: "Cola" },
    description: "Coca-Cola Kasten",
    store: "REWE",
    price: 5.0,
    validityDates: [r],
  };
  const chosen = selectForStore([accept(11.99, [r]), reviewOffer], NOW);
  assert.equal(chosen.needsReview, false);
  assert.equal(chosen.price, 1199); // the accept, even though pricier
});

test("no accept and no review -> no_offer signal (no offer fields)", () => {
  const rejectOffer = {
    brand: { name: "Pepsi" },
    description: "Pepsi 1,25 l",
    store: "REWE",
    price: 1.0,
    validityDates: [range("2026-06-14T22:00:00Z", "2026-06-20T21:59:00Z")],
  };
  const chosen = selectForStore([rejectOffer], NOW);
  assert.equal(chosen.status, "no_offer");
  assert.equal(chosen.price, undefined);
});

test("empty candidate list -> no_offer", () => {
  const chosen = selectForStore([], NOW);
  assert.equal(chosen.status, "no_offer");
});
