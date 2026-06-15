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
    // Seed the prior data/* shapes into the tmp dir.
    await writeFile(
      join(d, "current-offers.json"),
      readFileSync(join(ROOT, "data/current-offers.json"), "utf8"),
      "utf8"
    );
    await writeFile(
      join(d, "status.json"),
      readFileSync(join(ROOT, "data/status.json"), "utf8"),
      "utf8"
    );
    await writeFile(
      join(d, "price-history.jsonl"),
      readFileSync(join(ROOT, "data/price-history.jsonl"), "utf8"),
      "utf8"
    );

    const priorRewe = JSON.parse(readFileSync(join(ROOT, "data/current-offers.json"), "utf8"))
      .stores.find((s) => s.store === "REWE");
    const priorReweTs = JSON.parse(readFileSync(join(ROOT, "data/status.json"), "utf8"))
      .stores.find((s) => s.store === "REWE").lastUpdated;

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
