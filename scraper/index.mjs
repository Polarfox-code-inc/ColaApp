// scraper/index.mjs
// The scraper orchestrator + CLI entry. Composes the pure transforms (Plan 01)
// and the I/O seams (Plan 02) into one fault-isolated run that ALWAYS completes
// and writes all three files (current-offers.json, status.json, price-history.jsonl).
//
// Fault isolation (DATA-05 / D-02): both the single fetch AND each per-store
// build are wrapped in try/catch. A total fetch failure sweeps every marktguru
// store into statusOverrides["error"]; one store throwing during build marks
// only that store "error". Neither aborts the run — merge.mjs then carries
// forward last-known data and the writes still happen. A hostile/failed run can
// never wipe data/.
//
// Tampering guard (T-02-08): parseCurrentOffers/parseStatusFile/parseHistoryLine
// validate BEFORE any write; a drifted payload throws and no corrupt file lands.
//
// Info-disclosure guard (T-02-10 / D-12): errors log err.message ONLY; the
// bootstrap apiKey/clientKey are never logged.
//
// All seams default to the real implementations but are injectable, so the whole
// pipeline runs offline against fixtures (test/scraper.run.test.mjs).
//
// Node 22+ (native fetch via fetch.mjs, ESM). No new dependencies.

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { classify } from "../contract/matcher.mjs";
import {
  parseCurrentOffers,
  parseStatusFile,
} from "../contract/schema.mjs";

import { systemNow } from "./clock.mjs";
import { fetchOffers as realFetchOffers } from "./fetch.mjs";
import { readPrior, writeAtomic, appendLines } from "./io.mjs";
import { filterToAllowList } from "./filter.mjs";
import { selectForStore } from "./select.mjs";
import { keyOf, historyLinesToAppend } from "./dedup.mjs";
import { mergeWithPrior } from "./merge.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = join(HERE, "..", "data");

// The four marktguru-fed stores swept on a total fetch failure (Wasgau is fixed
// "unavailable" and never an error — D-03).
const MARKTGURU_STORES = ["REWE", "Edeka", "Lidl", "Kaufland"];

// Read the prior price-history.jsonl and return the Set of existing dedup keys.
// Cold start (ENOENT) -> empty set. Malformed lines are skipped, not thrown:
// the history graph is append-only and a single bad legacy line must not abort
// the run (the new lines are still validated before they are written).
async function readHistoryKeys(historyPath) {
  let text;
  try {
    text = await readFile(historyPath, "utf8");
  } catch (err) {
    if (err?.code === "ENOENT") return new Set(); // cold start: no history yet
    throw err;
  }
  const keys = new Set();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      keys.add(keyOf(JSON.parse(trimmed)));
    } catch {
      // skip an unparseable legacy line rather than abort the run
    }
  }
  return keys;
}

/**
 * Run the full scrape pipeline once. Always writes all three files.
 *
 * @param {object} [opts]
 * @param {Date}   [opts.now]          injected run clock (captured once)
 * @param {string} [opts.dataDir]      directory holding the data files
 * @param {() => Promise<Array<object>>} [opts.fetchOffers] injectable fetch seam
 * @returns {Promise<{ currentOffers: object, status: object }>}
 */
export async function run({
  now = systemNow(),
  dataDir = DEFAULT_DATA_DIR,
  fetchOffers = realFetchOffers,
} = {}) {
  // (1) Capture `now` once (already injected above) and read the prior snapshot.
  const prior = await readPrior(dataDir);

  // (2) Single fetch. A total failure sweeps every marktguru store to "error"
  //     but NEVER aborts the run (D-02c). Log err.message only — never keys.
  let results;
  const statusOverrides = {};
  try {
    results = await fetchOffers();
  } catch (err) {
    console.error("FETCH FAILED (total):", err.message);
    results = [];
    for (const store of MARKTGURU_STORES) statusOverrides[store] = "error";
  }

  // (3) Bucket the untrusted results by in-scope store.
  const byStore = filterToAllowList(results);

  // (4) Per-store fault-isolated build loop. One store throwing marks only that
  //     store "error"; it NEVER aborts the run (D-02b). Log err.message only.
  const storeResults = {};
  for (const store of MARKTGURU_STORES) {
    if (statusOverrides[store] === "error") continue; // already swept
    try {
      const candidates = (byStore.get(store) ?? [])
        .filter((o) => classify(o) !== "reject")
        // Stamp the resolved store identity so normalize/select can read it
        // (the filter buckets by advertiser slug but leaves the offer untouched).
        .map((o) => ({ ...o, store }));
      storeResults[store] = selectForStore(candidates, now);
    } catch (err) {
      console.error(`STORE BUILD FAILED (${store}):`, err.message);
      statusOverrides[store] = "error";
    }
  }

  // (5) Assemble the two whole-file documents (carry-forward / cold-start / D-03).
  const { currentOffers, status } = mergeWithPrior(
    storeResults,
    statusOverrides,
    prior,
    now
  );

  // (6) Validate BEFORE any write (T-02-08). A drift throws here -> no file lands.
  parseCurrentOffers(currentOffers);
  parseStatusFile(status);

  // (7) Compute the new history lines, deduped against the existing keys. The
  //     line objects are validated inside historyLinesToAppend (parseHistoryLine).
  const historyPath = join(dataDir, "price-history.jsonl");
  const existingKeys = await readHistoryKeys(historyPath);
  const lines = historyLinesToAppend(currentOffers.stores, existingKeys, now);

  // (8) Write order: atomic current-offers.json, atomic status.json, append
  //     history LAST — the brother-facing snapshot is replaced before the
  //     append-only graph grows.
  await writeAtomic(
    join(dataDir, "current-offers.json"),
    JSON.stringify(currentOffers, null, 2) + "\n"
  );
  await writeAtomic(
    join(dataDir, "status.json"),
    JSON.stringify(status, null, 2) + "\n"
  );
  await appendLines(historyPath, lines);

  return { currentOffers, status };
}

// --- CLI entry (mirrors spike/probe.mjs). A per-store/total fetch failure is
// NOT a crash — it writes error states and exits 0. Only a schema-validation
// throw or unexpected error produces a non-zero exit. ---
async function main() {
  const { status } = await run();
  const errored = status.stores.filter((s) => s.status === "error").map((s) => s.store);
  if (errored.length) {
    console.log(`scrape complete with per-store errors: ${errored.join(", ")} (last-known data preserved)`);
  } else {
    console.log("scrape complete: all three data files written");
  }
}

// Run main() only when invoked as the CLI entry, not when imported by tests.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error("SCRAPE FAILED:", err.message);
    process.exitCode = 1;
  });
}
