// test/scraper.run.test.mjs
// End-to-end run() proof, fully offline: fetchOffers is ALWAYS injected so no
// network is touched. Each case gets a fresh tmp dataDir and asserts the three
// written files via the frozen parse helpers. Covers DATA-01 (write valid docs),
// DATA-04 (cross-run dedup), DATA-05/D-06 (warm carry-forward + cold-start fault).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { run } from "../scraper/index.mjs";
import {
  parseCurrentOffers,
  parseStatusFile,
  parseHistoryLine,
} from "../contract/schema.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
const raw = readJson("spike/fixtures/raw-67105-search.json");

// Fixed clock for every run (deterministic — Pattern 4).
const NOW = new Date("2026-06-15T10:00:00Z");
const NOW_ISO = "2026-06-15T10:00:00.000Z";

// Fresh tmp dataDir per case.
async function freshDir() {
  return mkdtemp(join(tmpdir(), "colarun-"));
}

// Read + parse one written output file.
const readCurrent = async (d) =>
  parseCurrentOffers(JSON.parse(await readFile(join(d, "current-offers.json"), "utf8")));
const readStatus = async (d) =>
  parseStatusFile(JSON.parse(await readFile(join(d, "status.json"), "utf8")));
async function readHistoryLines(d) {
  let text;
  try {
    text = await readFile(join(d, "price-history.jsonl"), "utf8");
  } catch (err) {
    if (err?.code === "ENOENT") return [];
    throw err;
  }
  return text.split("\n").map((l) => l.trim()).filter(Boolean);
}

const find = (doc, store) => doc.stores.find((s) => s.store === store);

// A synthesized accept-shaped offer that classify() accepts AND is active at NOW
// (so it normalizes to status:"offer" and emits a history line). Advertiser slug
// drives filter bucketing; explicit price + validityDates drive selection.
const acceptOffer = (slug = "rewe", price = 9.99) => ({
  id: 900001,
  advertisers: [{ uniqueName: slug }],
  brand: { name: "Coca-Cola", uniqueName: "coca-cola" },
  product: { name: "Cola", description: "Original Taste koffeinhaltig" },
  description: "Coca-Cola Original 12 x 1-l case zzgl. 3,30 Pfand",
  price,
  validityDates: [{ from: "2026-06-14T00:00:00Z", to: "2026-06-21T00:00:00Z" }],
});

// --- Case A: baseline raw fixture -> 5-store valid docs, Wasgau unavailable ---

test("run() with the raw fixture writes valid 5-store docs, Wasgau unavailable (DATA-01)", async () => {
  const d = await freshDir();
  try {
    await run({ now: NOW, dataDir: d, fetchOffers: async () => raw.results });
    const co = await readCurrent(d);
    const st = await readStatus(d);

    assert.equal(co.stores.length, 5);
    assert.equal(st.stores.length, 5);
    assert.equal(find(co, "Wasgau").status, "unavailable");
    assert.equal(co.lastUpdated, NOW_ISO);
    assert.equal(st.lastUpdated, NOW_ISO);

    // Every history line (if any) is schema-valid.
    for (const line of await readHistoryLines(d)) {
      assert.doesNotThrow(() => parseHistoryLine(JSON.parse(line)));
    }
  } finally {
    await rm(d, { recursive: true, force: true });
  }
});

// --- Case B: an accepted offer -> status:"offer" + a history line (DATA-01/04) ---

test("run() with an accepted 12x1L offer marks the store offer and appends one history line (DATA-01/04)", async () => {
  const d = await freshDir();
  try {
    await run({ now: NOW, dataDir: d, fetchOffers: async () => [acceptOffer("rewe", 9.99)] });
    const co = await readCurrent(d);

    const rewe = find(co, "REWE");
    assert.equal(rewe.status, "offer");
    assert.equal(Number.isInteger(rewe.price), true); // integer cents
    assert.equal(rewe.price, 999);

    const lines = await readHistoryLines(d);
    const reweLines = lines.filter((l) => JSON.parse(l).store === "REWE");
    assert.equal(reweLines.length, 1);
    for (const line of lines) {
      assert.doesNotThrow(() => parseHistoryLine(JSON.parse(line)));
    }
  } finally {
    await rm(d, { recursive: true, force: true });
  }
});

// --- Case C: re-running the same accept into one dataDir dedups (DATA-04) ---

test("re-running over the same accepted offer appends the history line once, not twice (DATA-04)", async () => {
  const d = await freshDir();
  try {
    const fetchOffers = async () => [acceptOffer("rewe", 9.99)];
    await run({ now: NOW, dataDir: d, fetchOffers });
    await run({ now: NOW, dataDir: d, fetchOffers }); // identical second run

    const reweLines = (await readHistoryLines(d)).filter(
      (l) => JSON.parse(l).store === "REWE"
    );
    assert.equal(reweLines.length, 1); // deduped on the frozen D-14 key
  } finally {
    await rm(d, { recursive: true, force: true });
  }
});

// --- Case D: total fetch failure WITH a prior snapshot -> warm carry-forward ---

test("total fetch failure with a prior snapshot carries offers forward and freezes per-store ts (DATA-05/D-06)", async () => {
  const d = await freshDir();
  try {
    // Seed the prior snapshot from COMMITTED MOCKS, not the live data/* files. The
    // live files are mutated by the scheduled scrape (REWE drifted to no_offer),
    // which previously invalidated this test's "prior offer" premise. The offer
    // mock pins REWE as a clean prior offer; the stale status mock gives it a known
    // frozen lastUpdated.
    const priorCurrent = readFileSync(join(ROOT, "mocks/current-offers.offer.json"), "utf8");
    const priorStatus = readFileSync(join(ROOT, "mocks/status.stale.json"), "utf8");
    await writeFile(join(d, "current-offers.json"), priorCurrent, "utf8");
    await writeFile(join(d, "status.json"), priorStatus, "utf8");
    await writeFile(
      join(d, "price-history.jsonl"),
      '{"date":"2026-06-15","store":"REWE","price":999,"pricePerLitre":83,"validFrom":"2026-06-16","validTo":"2026-06-21"}\n',
      "utf8"
    );

    const priorRewe = JSON.parse(priorCurrent).stores.find((s) => s.store === "REWE");
    const priorReweTs = JSON.parse(priorStatus).stores.find((s) => s.store === "REWE").lastUpdated;

    await run({ now: NOW, dataDir: d, fetchOffers: async () => { throw new Error("boom"); } });

    const co = await readCurrent(d);
    const st = await readStatus(d);

    // REWE had a prior offer -> carried forward VERBATIM, marked error w/ frozen ts.
    assert.deepEqual(find(co, "REWE"), priorRewe); // last-known data preserved
    assert.equal(find(st, "REWE").status, "error");
    assert.equal(find(st, "REWE").lastUpdated, priorReweTs); // frozen, not bumped

    // File-level lastUpdated still bumps to the run clock.
    assert.equal(co.lastUpdated, NOW_ISO);
    assert.equal(st.lastUpdated, NOW_ISO);

    assert.equal(find(co, "Wasgau").status, "unavailable");
  } finally {
    await rm(d, { recursive: true, force: true });
  }
});

// --- Case E: total fetch failure on a COLD dir -> no_offer + error, valid docs ---

test("total fetch failure on a cold dir serializes no_offer + error, both files valid (DATA-05/D-06)", async () => {
  const d = await freshDir();
  try {
    await run({ now: NOW, dataDir: d, fetchOffers: async () => { throw new Error("boom"); } });

    const co = await readCurrent(d); // throws if invalid
    const st = await readStatus(d);

    for (const store of ["REWE", "Edeka", "Lidl", "Kaufland"]) {
      assert.equal(find(co, store).status, "no_offer"); // honest cold-start serialization
      assert.equal(find(st, store).status, "error");
      assert.equal(find(st, store).lastUpdated, NOW_ISO); // synthetic first value
    }
    assert.equal(find(co, "Wasgau").status, "unavailable");

    // No history file is needed/created on a pure-error cold run (no offers).
    assert.equal((await readHistoryLines(d)).length, 0);
  } finally {
    await rm(d, { recursive: true, force: true });
  }
});

// --- Case G: a schema-validation drift still writes a valid error status.json
//     and leaves current-offers.json (last-known data) untouched (WR-02) ---

test("a validation drift writes a valid error status.json and preserves current-offers (WR-02)", async () => {
  const d = await freshDir();
  try {
    // Seed a DRIFTED prior current-offers.json: a status:"offer" REWE entry
    // missing its required offer fields. A total fetch failure carries this
    // forward verbatim, so the assembled current-offers fails parseCurrentOffers.
    // Base it on the committed offer mock (stable), NOT the live data/* file the
    // scheduled scrape mutates.
    const goodCurrent = JSON.parse(
      readFileSync(join(ROOT, "mocks/current-offers.offer.json"), "utf8")
    );
    const drifted = {
      lastUpdated: goodCurrent.lastUpdated,
      stores: goodCurrent.stores.map((s) =>
        s.store === "REWE"
          ? { store: "REWE", displayName: "REWE", status: "offer" } // missing price/etc
          : s
      ),
    };
    await writeFile(join(d, "current-offers.json"), JSON.stringify(drifted), "utf8");
    await writeFile(
      join(d, "status.json"),
      readFileSync(join(ROOT, "mocks/status.stale.json"), "utf8"),
      "utf8"
    );

    const driftedBytes = await readFile(join(d, "current-offers.json"), "utf8");

    // The run must FAIL LOUD (rethrow) — it is an alert-only hard stop.
    await assert.rejects(() =>
      run({ now: NOW, dataDir: d, fetchOffers: async () => { throw new Error("boom"); } })
    );

    // But status.json must now be a VALID error document (observable failure).
    const st = await readStatus(d); // parseStatusFile throws if invalid
    assert.equal(st.lastUpdated, NOW_ISO);
    for (const store of ["REWE", "Edeka", "Lidl", "Kaufland"]) {
      assert.equal(find(st, store).status, "error");
    }
    assert.equal(find(st, "Wasgau").status, "unavailable");

    // current-offers.json (last-known data) must be UNTOUCHED — not overwritten.
    assert.equal(await readFile(join(d, "current-offers.json"), "utf8"), driftedBytes);
  } finally {
    await rm(d, { recursive: true, force: true });
  }
});

// --- Case F: file-level lastUpdated === injected now on every run (DATA-06) ---

test("every run sets file-level lastUpdated on both files to the injected now (DATA-06)", async () => {
  const d = await freshDir();
  try {
    await run({ now: NOW, dataDir: d, fetchOffers: async () => raw.results });
    assert.equal((await readCurrent(d)).lastUpdated, NOW_ISO);
    assert.equal((await readStatus(d)).lastUpdated, NOW_ISO);
  } finally {
    await rm(d, { recursive: true, force: true });
  }
});
