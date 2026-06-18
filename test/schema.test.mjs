import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  STORES,
  STATUS_VALUES,
  parseCurrentOffers,
  parseStatusFile,
  parseHistoryLine,
  StoreOfferSchema,
} from "../contract/schema.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), "utf8"));

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

// --- Fixture validation: every mock + seeded data file parses (SC#3) ---

const CURRENT_OFFERS_FILES = [
  "data/current-offers.json",
  "mocks/current-offers.offer.json",
  "mocks/current-offers.no_offer.json",
  "mocks/current-offers.upcoming.json",
  "mocks/current-offers.error.json",
  "mocks/current-offers.stale.json",
  "mocks/current-offers.unavailable.json",
];

for (const rel of CURRENT_OFFERS_FILES) {
  test(`current-offers fixture validates: ${rel}`, () => {
    const data = readJson(rel);
    assert.doesNotThrow(() => parseCurrentOffers(data));
    // Each fixture renders the 5 fixed stores exactly once (D-05).
    const seen = data.stores.map((s) => s.store);
    for (const key of STORES) {
      assert.equal(
        seen.filter((s) => s === key).length,
        1,
        `${rel} must contain store ${key} exactly once`
      );
    }
    // No pfand/deposit field leaks into any entry (D-10).
    for (const s of data.stores) {
      assert.equal("pfand" in s, false, `${rel}: ${s.store} has a pfand field`);
      assert.equal("deposit" in s, false, `${rel}: ${s.store} has a deposit field`);
    }
  });
}

test("status files validate: data/status.json + mocks/status.stale.json", () => {
  assert.doesNotThrow(() => parseStatusFile(readJson("data/status.json")));
  assert.doesNotThrow(() => parseStatusFile(readJson("mocks/status.stale.json")));
});

test("every non-empty price-history.jsonl line is valid JSON and a HistoryLine (D-14)", () => {
  const raw = readFileSync(join(ROOT, "data/price-history.jsonl"), "utf8");
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  assert.ok(lines.length >= 1, "expected at least 1 real history line");
  // The file must NOT be a single JSON array (D-02 JSONL, append-only).
  assert.notEqual(raw.trim()[0], "[", "price-history.jsonl must be JSONL, not an array");
  for (const line of lines) {
    const obj = JSON.parse(line);
    assert.doesNotThrow(() => parseHistoryLine(obj), `invalid history line: ${line}`);
  }
});

// --- UI-state coverage: each required state is represented (SC#3/#4) ---

test("each required UI state is representable across the mocks", () => {
  const offer = readJson("mocks/current-offers.offer.json");
  const noOffer = readJson("mocks/current-offers.no_offer.json");
  const upcoming = readJson("mocks/current-offers.upcoming.json");
  const errored = readJson("mocks/current-offers.error.json");
  const stale = readJson("mocks/current-offers.stale.json");
  const unavailable = readJson("mocks/current-offers.unavailable.json");

  const hasStatus = (file, status) => file.stores.some((s) => s.status === status);

  assert.ok(hasStatus(offer, "offer"), "offer state present");
  assert.ok(hasStatus(noOffer, "no_offer"), "no_offer state present");
  assert.ok(hasStatus(errored, "error"), "error state present");
  assert.ok(hasStatus(unavailable, "unavailable"), "unavailable state present");

  // upcoming = a status:offer whose validFrom is in the future vs 2026-06-15 (PWA-derived).
  const future = upcoming.stores.find(
    (s) => s.status === "offer" && s.validFrom > "2026-06-15"
  );
  assert.ok(future, "upcoming (future validFrom) state present");

  // stale = an OLD file-level lastUpdated (PWA derives staleness from the timestamp).
  assert.ok(stale.lastUpdated < "2026-06-15T00:00:00Z", "stale (old lastUpdated) present");

  // needsReview quarantine field is representable (D-08).
  const quarantined = offer.stores.some((s) => s.needsReview === true);
  assert.ok(quarantined, "at least one needsReview:true entry exists (D-08)");
});

// --- Negative regression guards (D-09/D-12) ---

test("a float price and an unknown status are rejected (regression guard)", () => {
  const baseFile = (override) => ({
    lastUpdated: "2026-06-15T04:00:00Z",
    stores: STORES.map((s) =>
      s === "REWE"
        ? {
            store: "REWE",
            displayName: "REWE",
            status: "offer",
            price: 999,
            currency: "EUR",
            pricePerLitre: 83,
            validFrom: "2026-06-16",
            validTo: "2026-06-21",
            ...override,
          }
        : { store: s, displayName: s, status: "no_offer" }
    ),
  });

  // float price -> rejected (D-09)
  assert.throws(() => parseCurrentOffers(baseFile({ price: 9.99 })));
  // unknown status value "pending" -> rejected (D-12)
  assert.throws(() => parseCurrentOffers(baseFile({ status: "pending" })));
});
