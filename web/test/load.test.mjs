// web/test/load.test.mjs
// Locks the data-boundary contract: all six current-offers UI-state mocks and the
// stale status mock must validate against the FROZEN contract (parseCurrentOffers
// /parseStatusFile), and the load module's parse/degrade path must never throw on
// malformed input. Pure node:test — no network (fetch is stubbed) so it runs under
// bare `node --test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  parseCurrentOffers,
  parseStatusFile,
} from "../../contract/schema.mjs";
import { loadData } from "../src/data/load.js";

// web/test -> web -> repo root. Mocks live at the repo root, not under web/.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
const readText = (rel) => readFileSync(join(ROOT, rel), "utf8");

// The six UI-state current-offers fixtures (one per state) + the stale status mock.
const CURRENT_OFFERS_MOCKS = [
  "mocks/current-offers.offer.json",
  "mocks/current-offers.no_offer.json",
  "mocks/current-offers.upcoming.json",
  "mocks/current-offers.error.json",
  "mocks/current-offers.stale.json",
  "mocks/current-offers.unavailable.json",
];

// --- All six current-offers mocks validate against the frozen contract ---

for (const rel of CURRENT_OFFERS_MOCKS) {
  test(`${rel} validates via parseCurrentOffers (no throw)`, () => {
    const obj = readJson(rel);
    assert.doesNotThrow(() => parseCurrentOffers(obj));
    const parsed = parseCurrentOffers(obj);
    // Contract guarantees exactly the five fixed stores.
    assert.equal(parsed.stores.length, 5);
  });
}

// --- The stale status mock validates via parseStatusFile ---

test("mocks/status.stale.json validates via parseStatusFile", () => {
  const obj = readJson("mocks/status.stale.json");
  assert.doesNotThrow(() => parseStatusFile(obj));
  const parsed = parseStatusFile(obj);
  assert.equal(parsed.stores.length, 5);
});

// --- loadData degrades (does not throw) on malformed / failed fetches ---

// Stub global fetch so loadData runs without a real server. Each test sets the
// behaviour it wants and restores the original afterwards.
const realFetch = globalThis.fetch;

function stubFetch(handler) {
  globalThis.fetch = handler;
}
function restoreFetch() {
  globalThis.fetch = realFetch;
}

test("loadData degrades to nulls/empty when every fetch fails (no throw)", async () => {
  stubFetch(async () => {
    throw new Error("network down");
  });
  try {
    let result;
    await assert.doesNotReject(async () => {
      result = await loadData({ base: "./data/" });
    });
    assert.equal(result.currentOffers, null);
    assert.equal(result.status, null);
    assert.deepEqual(result.history, []);
    assert.equal(result.errors.currentOffers, "fetch_failed");
    assert.equal(result.errors.status, "fetch_failed");
    assert.equal(result.errors.history, "fetch_failed");
  } finally {
    restoreFetch();
  }
});

test("loadData degrades when a file is malformed JSON (no throw, error flag set)", async () => {
  // current-offers returns garbage; status + history return ok-but-empty.
  stubFetch(async (url) => {
    const u = String(url);
    if (u.includes("current-offers.json")) {
      return { ok: true, text: async () => "{ this is not valid json" };
    }
    if (u.includes("status.json")) {
      return { ok: true, text: async () => readText("mocks/status.stale.json") };
    }
    // price-history.jsonl
    return { ok: true, text: async () => "" };
  });
  try {
    let result;
    await assert.doesNotReject(async () => {
      result = await loadData({ base: "./data/" });
    });
    assert.equal(result.currentOffers, null);
    assert.equal(result.errors.currentOffers, "parse_failed");
    // status still parses + validates from the valid stale mock.
    assert.ok(result.status);
    assert.equal(result.status.stores.length, 5);
  } finally {
    restoreFetch();
  }
});

test("loadData parses + validates a good fixture set", async () => {
  stubFetch(async (url) => {
    const u = String(url);
    if (u.includes("current-offers.json")) {
      return { ok: true, text: async () => readText("mocks/current-offers.offer.json") };
    }
    if (u.includes("status.json")) {
      return { ok: true, text: async () => readText("data/status.json") };
    }
    return { ok: true, text: async () => readText("data/price-history.jsonl") };
  });
  try {
    const result = await loadData({ base: "./data/" });
    assert.ok(result.currentOffers);
    assert.equal(result.currentOffers.stores.length, 5);
    assert.ok(result.status);
    assert.ok(Array.isArray(result.history));
    assert.deepEqual(result.errors, {});
  } finally {
    restoreFetch();
  }
});
