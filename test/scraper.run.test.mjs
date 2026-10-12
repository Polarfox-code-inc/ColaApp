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
import { parseCandidatesDoc } from "../scraper/wasgau/candidates.mjs";

// Network tripwire (RESEARCH Pitfall 1): every run() below injects its seams,
// so a real fetch would be a bug. Replace the global fetch with a recorder that
// throws; the LAST test in this file asserts it was never called (node:test runs
// a file's top-level tests in declaration order).
const realFetch = globalThis.fetch;
const tripwireCalls = [];
globalThis.fetch = async (url) => {
  tripwireCalls.push(String(url));
  throw new Error("real network call in an offline test");
};

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
const raw = readJson("spike/fixtures/raw-67105-search.json");

// Wasgau seam for the marktguru cases: kill switch off (D-04), and a fetchText
// that throws, so no run() in this file can ever reach wasgau.de or 1kcloud
// (RESEARCH Pitfall 1). Cases A–G therefore keep asserting Wasgau "unavailable".
const WASGAU_OFF = {
  config: { enabled: false },
  fetchText: async (url) => {
    throw new Error(`test must not fetch Wasgau (${url})`);
  },
};

// Offline Wasgau source serving the real-derived fixtures by URL. Records every
// requested URL in `calls` and throws on any URL outside the leaflet path.
// `overrides` maps an exact URL to in-memory text (returned instead of the
// fixture) or to an Error (thrown), so failure variants need no new fixture files.
const WASGAU_FIXTURES = join(ROOT, "test", "fixtures", "wasgau");
const LEAFLET_ROOT = "https://wasgau-dlog.1kcloud.com/ep1rP1V0/";
const HOMEPAGE = "https://www.wasgau.de/";
const wasgauFixture = (name) => readFileSync(join(WASGAU_FIXTURES, name), "utf8");
function wasgauStub(pages = { 17: "page_17.positive.xml", 26: "page_26.xml" }, overrides = {}) {
  const calls = [];
  const fixture = wasgauFixture;
  const fetchText = async (url) => {
    calls.push(url);
    if (Object.hasOwn(overrides, url)) {
      const o = overrides[url];
      if (o instanceof Error) throw o;
      return o;
    }
    if (url === HOMEPAGE) return fixture("homepage.html");
    if (url === LEAFLET_ROOT) return fixture("index.html");
    const m = url.match(/^https:\/\/wasgau-dlog\.1kcloud\.com\/ep1rP1V0\/epaper\/coords\/page_(\d+)\.xml$/);
    if (m && pages[m[1]]) return fixture(pages[m[1]]);
    throw new Error(`wasgauStub: unexpected URL ${url}`);
  };
  return { calls, fetchText };
}

// A Wednesday inside the 2026-10-12..17 leaflet window of the fixtures.
const WASGAU_NOW = new Date("2026-10-14T10:00:00Z");

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
    await run({ now: NOW, dataDir: d, wasgau: WASGAU_OFF, fetchOffers: async () => raw.results });
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
    await run({ now: NOW, dataDir: d, wasgau: WASGAU_OFF, fetchOffers: async () => [acceptOffer("rewe", 9.99)] });
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
    await run({ now: NOW, dataDir: d, wasgau: WASGAU_OFF, fetchOffers });
    await run({ now: NOW, dataDir: d, wasgau: WASGAU_OFF, fetchOffers }); // identical second run

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

    await run({ now: NOW, dataDir: d, wasgau: WASGAU_OFF, fetchOffers: async () => { throw new Error("boom"); } });

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
    await run({ now: NOW, dataDir: d, wasgau: WASGAU_OFF, fetchOffers: async () => { throw new Error("boom"); } });

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
      run({ now: NOW, dataDir: d, wasgau: WASGAU_OFF, fetchOffers: async () => { throw new Error("boom"); } })
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
    await run({ now: NOW, dataDir: d, wasgau: WASGAU_OFF, fetchOffers: async () => raw.results });
    assert.equal((await readCurrent(d)).lastUpdated, NOW_ISO);
    assert.equal((await readStatus(d)).lastUpdated, NOW_ISO);
  } finally {
    await rm(d, { recursive: true, force: true });
  }
});

// --- Case H (Phase 5 tracer): wasgau.de homepage -> 1kcloud index -> Cola pages
//     -> needsReview Wasgau offer + schema-valid wasgau-candidates.json, offline ---

test("Wasgau leaflet end-to-end: 4 sequential requests -> needsReview offer + candidates file (P5-SC1, SC4, D-12)", async () => {
  const d = await freshDir();
  try {
    const stub = wasgauStub();
    // Default WASGAU_CONFIG (no config override): proves probation defaults ON.
    await run({ now: WASGAU_NOW, dataDir: d, wasgau: { fetchText: stub.fetchText }, fetchOffers: async () => [] });

    // Exactly 4 requests, in order: homepage, index, then ONLY Cola pages 17 + 26.
    assert.deepEqual(stub.calls, [
      "https://www.wasgau.de/",
      LEAFLET_ROOT,
      `${LEAFLET_ROOT}epaper/coords/page_17.xml`,
      `${LEAFLET_ROOT}epaper/coords/page_26.xml`,
    ]);

    // Classified by the unchanged matcher; probation forces needsReview.
    const co = await readCurrent(d);
    assert.deepEqual(find(co, "Wasgau"), {
      store: "Wasgau",
      displayName: "Wasgau",
      status: "offer",
      needsReview: true,
      price: 899,
      currency: "EUR",
      pricePerLitre: 75,
      validFrom: "2026-10-12",
      validTo: "2026-10-17",
    });

    const st = await readStatus(d);
    assert.deepEqual(find(st, "Wasgau"), {
      store: "Wasgau",
      status: "offer",
      lastUpdated: "2026-10-14T10:00:00.000Z",
    });

    // needsReview never enters the history graph (D-12).
    const wasgauLines = (await readHistoryLines(d)).filter((l) => JSON.parse(l).store === "Wasgau");
    assert.equal(wasgauLines.length, 0);

    // Candidates file: accepts AND rejects, schema-valid, trailing newline (D-10/D-11).
    const text = await readFile(join(d, "wasgau-candidates.json"), "utf8");
    assert.ok(text.endsWith("\n"));
    const doc = parseCandidatesDoc(JSON.parse(text));
    assert.ok(doc, "wasgau-candidates.json must pass parseCandidatesDoc");
    assert.equal(doc.leafletId, "ep1rP1V0");
    assert.deepEqual(doc.leafletWindow, { from: "2026-10-12", to: "2026-10-17" });
    assert.deepEqual(doc.colaPages, [17, 26]);
    assert.equal(doc.candidates.length, 3);
    const c14 = doc.candidates.find((c) => c.page === 17 && c.box === 14);
    assert.ok(c14, "page 17 box 14 must be a candidate");
    assert.equal(c14.verdict, "accept");
    assert.equal(c14.pairing, "clean");
    assert.equal(c14.priceCents, 899);
    assert.equal(c14.unitPriceCents, 75);
    assert.equal(c14.litres, 12);
  } finally {
    await rm(d, { recursive: true, force: true });
  }
});

// =====================================================================
// Phase 5 fault isolation + status semantics, run()-level (D-01..D-04, SC3)
// =====================================================================

const WASGAU_NOW_ISO = "2026-10-14T10:00:00.000Z";
const MARKTGURU = ["REWE", "Edeka", "Lidl", "Kaufland"];

// Copy committed mock snapshots into a tmp dataDir as the prior run's files.
async function seedMocks(d, currentRel, statusRel) {
  if (currentRel) {
    await writeFile(join(d, "current-offers.json"), readFileSync(join(ROOT, currentRel), "utf8"), "utf8");
  }
  if (statusRel) {
    await writeFile(join(d, "status.json"), readFileSync(join(ROOT, statusRel), "utf8"), "utf8");
  }
}

// Does a file exist in the dataDir?
async function exists(d, name) {
  try {
    await readFile(join(d, name), "utf8");
    return true;
  } catch (err) {
    if (err?.code === "ENOENT") return false;
    throw err;
  }
}

// --- D-01 warm: Wasgau failure carries its last-known entry forward verbatim,
//     freezes its per-store ts, and leaves the candidates file + REWE alone ---

test("warm Wasgau failure: verbatim carry-forward, frozen ts, REWE still refreshes (D-01, D-03)", async () => {
  const d = await freshDir();
  try {
    // Seed with a successful Case-H-style run.
    await run({ now: WASGAU_NOW, dataDir: d, wasgau: { fetchText: wasgauStub().fetchText }, fetchOffers: async () => [] });
    const seeded = find(await readCurrent(d), "Wasgau");
    const seededCandidates = await readFile(join(d, "wasgau-candidates.json"), "utf8");
    assert.equal(seeded.status, "offer");

    // Next day: the homepage request throws; marktguru has a live REWE accept.
    const stub = wasgauStub(undefined, { [HOMEPAGE]: new Error("ECONNRESET") });
    const reweOffer = {
      ...acceptOffer("rewe", 9.99),
      validityDates: [{ from: "2026-10-12T00:00:00Z", to: "2026-10-18T00:00:00Z" }],
    };
    const NEXT = new Date("2026-10-15T10:00:00Z");
    await run({ now: NEXT, dataDir: d, wasgau: { fetchText: stub.fetchText }, fetchOffers: async () => [reweOffer] });

    const co = await readCurrent(d);
    const st = await readStatus(d);
    assert.deepEqual(find(co, "Wasgau"), seeded); // last-known data verbatim
    assert.deepEqual(find(st, "Wasgau"), { store: "Wasgau", status: "error", lastUpdated: WASGAU_NOW_ISO }); // frozen
    assert.equal(find(co, "REWE").status, "offer");
    assert.equal(find(st, "REWE").status, "offer");
    assert.equal(find(st, "REWE").lastUpdated, NEXT.toISOString()); // bumped
    assert.equal(await readFile(join(d, "wasgau-candidates.json"), "utf8"), seededCandidates);
  } finally {
    await rm(d, { recursive: true, force: true });
  }
});

// --- D-01 cold: no prior -> no_offer + error at now, no candidates file ---

test("cold Wasgau failure: no_offer + error at now, no candidates file (D-01)", async () => {
  const d = await freshDir();
  try {
    const stub = wasgauStub(undefined, { [HOMEPAGE]: new Error("ETIMEDOUT") });
    await run({ now: WASGAU_NOW, dataDir: d, wasgau: { fetchText: stub.fetchText }, fetchOffers: async () => [] });

    assert.equal(find(await readCurrent(d), "Wasgau").status, "no_offer");
    assert.deepEqual(find(await readStatus(d), "Wasgau"), { store: "Wasgau", status: "error", lastUpdated: WASGAU_NOW_ISO });
    assert.equal(await exists(d, "wasgau-candidates.json"), false);
  } finally {
    await rm(d, { recursive: true, force: true });
  }
});

// --- Pitfall 2: a pre-Phase-5 "unavailable" prior counts as no prior ---

test("pre-Phase-5 'unavailable' prior + Wasgau failure -> no_offer + error, never unavailable (D-01, Pitfall 2)", async () => {
  const d = await freshDir();
  try {
    await seedMocks(d, "mocks/current-offers.unavailable.json", "mocks/status.stale.json");
    const stub = wasgauStub(undefined, { [HOMEPAGE]: new Error("ECONNRESET") });
    await run({ now: WASGAU_NOW, dataDir: d, wasgau: { fetchText: stub.fetchText }, fetchOffers: async () => [] });

    assert.equal(find(await readCurrent(d), "Wasgau").status, "no_offer");
    assert.deepEqual(find(await readStatus(d), "Wasgau"), { store: "Wasgau", status: "error", lastUpdated: WASGAU_NOW_ISO });
  } finally {
    await rm(d, { recursive: true, force: true });
  }
});

// --- Shape changes: each degrades Wasgau alone to "error" (D-01, D-03, SC3) ---

const homepage = wasgauFixture("homepage.html");
const SHAPE_CHANGES = [
  {
    name: "homepage without the var wasgau script",
    overrides: { [HOMEPAGE]: homepage.replace(/var\s+wasgau/, "var somethingElse") },
  },
  {
    name: "angebotslink to a foreign host",
    overrides: { [HOMEPAGE]: homepage.replace(LEAFLET_ROOT, "https://evil.example/ep1rP1V0/") },
    calls: 1, // nothing is ever fetched from the foreign host
  },
  {
    name: "1kcloud index without data-textpos blocks",
    overrides: { [LEAFLET_ROOT]: wasgauFixture("index.html").replaceAll("data-textpos", "data-gone") },
  },
  {
    name: "coords XML shape change (<pages></pages>)",
    overrides: { [`${LEAFLET_ROOT}epaper/coords/page_17.xml`]: "<pages></pages>" },
  },
];

for (const sc of SHAPE_CHANGES) {
  test(`shape change (${sc.name}) -> Wasgau error, marktguru stores unaffected (D-01, D-03)`, async () => {
    const d = await freshDir();
    try {
      const stub = wasgauStub(undefined, sc.overrides);
      await run({ now: WASGAU_NOW, dataDir: d, wasgau: { fetchText: stub.fetchText }, fetchOffers: async () => raw.results });

      const st = await readStatus(d);
      assert.equal(find(st, "Wasgau").status, "error");
      for (const store of MARKTGURU) assert.notEqual(find(st, store).status, "error");
      if (sc.calls !== undefined) assert.equal(stub.calls.length, sc.calls);
    } finally {
      await rm(d, { recursive: true, force: true });
    }
  });
}

// --- D-03 reverse direction: a marktguru total failure never touches Wasgau ---

test("marktguru total failure sweeps only the 4 marktguru stores; Wasgau success is written (D-03)", async () => {
  const d = await freshDir();
  try {
    await run({
      now: WASGAU_NOW,
      dataDir: d,
      wasgau: { fetchText: wasgauStub().fetchText },
      fetchOffers: async () => { throw new Error("marktguru down"); },
    });

    const co = await readCurrent(d);
    const st = await readStatus(d);
    for (const store of MARKTGURU) assert.equal(find(st, store).status, "error");
    assert.equal(find(co, "Wasgau").status, "offer");
    assert.equal(find(co, "Wasgau").needsReview, true);
    assert.deepEqual(find(st, "Wasgau"), { store: "Wasgau", status: "offer", lastUpdated: WASGAU_NOW_ISO });
  } finally {
    await rm(d, { recursive: true, force: true });
  }
});

// --- D-02: a parsed leaflet without a qualifying Cola case is no_offer ---

test("negatives-only leaflet -> Wasgau no_offer with bumped ts, rejects written for review (D-02, D-10)", async () => {
  const d = await freshDir();
  try {
    const stub = wasgauStub({ 17: "page_17.xml", 26: "page_26.xml" });
    await run({ now: WASGAU_NOW, dataDir: d, wasgau: { fetchText: stub.fetchText }, fetchOffers: async () => [] });

    assert.equal(find(await readCurrent(d), "Wasgau").status, "no_offer");
    assert.deepEqual(find(await readStatus(d), "Wasgau"), { store: "Wasgau", status: "no_offer", lastUpdated: WASGAU_NOW_ISO });

    const doc = parseCandidatesDoc(JSON.parse(await readFile(join(d, "wasgau-candidates.json"), "utf8")));
    assert.ok(doc, "candidates file must be schema-valid");
    assert.equal(doc.candidates.length, 3);
    for (const c of doc.candidates) assert.equal(c.verdict, "reject");
  } finally {
    await rm(d, { recursive: true, force: true });
  }
});

// --- D-04 kill switch: zero Wasgau requests, unavailable in both files ---

test("kill switch: zero Wasgau requests, no candidates file, unavailable with carried ts (D-04)", async () => {
  const d = await freshDir();
  try {
    await seedMocks(d, "mocks/current-offers.unavailable.json", "mocks/status.stale.json");
    const stub = wasgauStub();
    await run({
      now: WASGAU_NOW,
      dataDir: d,
      wasgau: { fetchText: stub.fetchText, config: { enabled: false } },
      fetchOffers: async () => [],
    });

    assert.equal(stub.calls.length, 0);
    assert.equal(await exists(d, "wasgau-candidates.json"), false);
    assert.equal(find(await readCurrent(d), "Wasgau").status, "unavailable");
    assert.deepEqual(find(await readStatus(d), "Wasgau"), {
      store: "Wasgau",
      status: "unavailable",
      lastUpdated: "2026-06-05T04:00:00Z",
    });
  } finally {
    await rm(d, { recursive: true, force: true });
  }
});

// --- D-04 + WR-02: a validation drift marks Wasgau "error" when enabled ---

test("validation drift with Wasgau enabled writes Wasgau 'error' in the error status.json (D-04, WR-02)", async () => {
  const d = await freshDir();
  try {
    // Same drifted REWE seed as Case G (Case G covers the disabled side: "unavailable").
    const goodCurrent = JSON.parse(readFileSync(join(ROOT, "mocks/current-offers.offer.json"), "utf8"));
    const drifted = {
      lastUpdated: goodCurrent.lastUpdated,
      stores: goodCurrent.stores.map((s) =>
        s.store === "REWE" ? { store: "REWE", displayName: "REWE", status: "offer" } : s
      ),
    };
    await writeFile(join(d, "current-offers.json"), JSON.stringify(drifted), "utf8");
    await seedMocks(d, null, "mocks/status.stale.json");

    await assert.rejects(() =>
      run({
        now: WASGAU_NOW,
        dataDir: d,
        wasgau: { fetchText: wasgauStub().fetchText },
        fetchOffers: async () => { throw new Error("boom"); },
      })
    );

    const st = await readStatus(d);
    assert.equal(find(st, "Wasgau").status, "error");
    for (const store of MARKTGURU) assert.equal(find(st, store).status, "error");
  } finally {
    await rm(d, { recursive: true, force: true });
  }
});

// --- Network tripwire: MUST stay the LAST test in this file ---

test("network tripwire: no test in this file made a real fetch call (Pitfall 1)", () => {
  globalThis.fetch = realFetch;
  assert.deepEqual(tripwireCalls, []);
});
