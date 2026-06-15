// web/src/data/load.js
// The PWA's fetch/parse boundary — the consumer-side analog of scraper/io.mjs's
// readJsonOrNull. It fetches the three static data files (current-offers.json,
// status.json, price-history.jsonl) under a base path and DEGRADES per file: a
// non-ok response or a JSON/JSONL parse failure for one file yields a null/empty
// slice with an error flag rather than throwing out of the whole load (T-03-08 /
// ASVS V7 — a single bad file must never blank the entire screen).
//
// Defensive contract validation (RESEARCH "validate-but-degrade"): each parsed
// file is run through the frozen contract parsers (parseCurrentOffers /
// parseStatusFile) inside a try/catch. On a validation failure we log and fall
// back to the raw parsed object marked degraded — we never crash, because a
// drifted-but-renderable payload is better than a white screen, and the render
// layer already treats every value as untrusted (textContent, STORES allow-list).
//
// The JSONL is parsed with parseHistoryJsonl reused from ../chart/history.js —
// the single source of the JSONL splitter (no duplicate parser here).

import { parseHistoryJsonl } from "../chart/history.js";
// Frozen contract, imported relatively (web/src/data -> repo-root /contract).
// Vite resolves this via server.fs.allow:['..'] (set in Plan 01). Defensive only.
import { parseCurrentOffers, parseStatusFile } from "../../../contract/schema.mjs";

// Default base path for the live data files (served from web/public/data/).
const DEFAULT_BASE = "./data/";

const FILES = {
  currentOffers: "current-offers.json",
  status: "status.json",
  history: "price-history.jsonl",
};

// Join a base path and a file name with exactly one slash between them.
function joinPath(base, file) {
  return base.endsWith("/") ? base + file : `${base}/${file}`;
}

/**
 * Fetch one file as text, returning null on a network error or non-ok response.
 * Never throws — the caller treats null as "this file failed, degrade".
 * @param {string} url
 * @returns {Promise<string|null>}
 */
async function fetchTextOrNull(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null; // offline / network error — degrade, don't crash
  }
}

/**
 * Parse JSON text, returning null on any parse error (never throws).
 * @param {string|null} text
 * @returns {object|null}
 */
function parseJsonOrNull(text) {
  if (text == null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Run a defensive contract validation, degrading on failure. Returns the
 * validated object on success; on a validation throw, logs and returns the raw
 * parsed object unchanged (marked degraded via the errors map by the caller).
 * Never throws (validate-but-degrade — RESEARCH Security V7).
 * @param {(obj: object) => object} parser the contract parse helper
 * @param {object|null} parsed the already-JSON-parsed object
 * @param {string} label file label for the warning
 * @returns {{ value: object|null, valid: boolean }}
 */
function validateOrDegrade(parser, parsed, label) {
  if (parsed == null) return { value: null, valid: false };
  try {
    return { value: parser(parsed), valid: true };
  } catch (err) {
    // Drifted payload — log loudly, keep the raw object so the screen still renders.
    // eslint-disable-next-line no-console
    console.warn(`[load] ${label} failed contract validation; rendering raw:`, err?.message ?? err);
    return { value: parsed, valid: false };
  }
}

/**
 * Fetch + tolerantly parse the three data files under a base path. DEGRADES per
 * file: any fetch/parse/validation failure leaves that slice null/empty with an
 * entry in `errors` rather than throwing. History reuses parseHistoryJsonl.
 *
 * @param {{ base?: string }} [opts]
 *   base — directory the three files live under (default './data/'); the ?state=
 *   dev switch in main.js overrides this to point at a fixture set.
 * @returns {Promise<{
 *   currentOffers: object|null,
 *   status: object|null,
 *   history: import('../../../contract/types.d.ts').HistoryLine[],
 *   errors: Record<string, string>,
 * }>}
 */
export async function loadData(opts = {}) {
  const base = opts.base ?? DEFAULT_BASE;
  const errors = {};

  // Fetch all three in parallel; each resolves to text or null (never throws).
  const [offersText, statusText, historyText] = await Promise.all([
    fetchTextOrNull(joinPath(base, FILES.currentOffers)),
    fetchTextOrNull(joinPath(base, FILES.status)),
    fetchTextOrNull(joinPath(base, FILES.history)),
  ]);

  // --- current-offers.json ---
  const offersParsed = parseJsonOrNull(offersText);
  if (offersText == null) errors.currentOffers = "fetch_failed";
  else if (offersParsed == null) errors.currentOffers = "parse_failed";
  const offers = validateOrDegrade(parseCurrentOffers, offersParsed, "current-offers.json");
  if (offersParsed != null && !offers.valid) errors.currentOffers = "validation_failed";

  // --- status.json ---
  const statusParsed = parseJsonOrNull(statusText);
  if (statusText == null) errors.status = "fetch_failed";
  else if (statusParsed == null) errors.status = "parse_failed";
  const status = validateOrDegrade(parseStatusFile, statusParsed, "status.json");
  if (statusParsed != null && !status.valid) errors.status = "validation_failed";

  // --- price-history.jsonl (reuse the chart's JSONL splitter) ---
  let history = [];
  if (historyText == null) {
    errors.history = "fetch_failed";
  } else {
    try {
      history = parseHistoryJsonl(historyText);
    } catch {
      // A malformed JSONL line must not crash the load — degrade to cold-start.
      errors.history = "parse_failed";
      history = [];
    }
  }

  return {
    currentOffers: offers.value,
    status: status.value,
    history,
    errors,
  };
}
