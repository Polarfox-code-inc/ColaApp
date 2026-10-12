// scraper/wasgau/build.mjs
//
// Wasgau leaflet orchestration (Phase 5): homepage -> 1kcloud index -> Cola
// pages -> validated candidates doc, plus the candidates-file cache read.
// No logging and no writes here; scraper/index.mjs owns both.
//
// Request budget (D-05, D-09, SC4): a new leaflet costs the homepage, the index
// and one coords XML per Cola page, strictly one awaited request at a time. An
// unchanged leaflet id costs the homepage only (the prior doc is reused).
//
// SECURITY (T-05-18): only HOMEPAGE_URL, the URL rebuilt by parseLeafletLink
// from a validated id, and coordsUrl(id, page) results are ever fetched — never
// a raw string taken from a response. A foreign angebotslink throws before any
// second request.
//
// Cache safety (Pitfall 10): the doc only exists after every Cola page parsed,
// so a partial failure throws and the old cache file survives for a retry.
//
// Node 22+, no new dependencies.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  HOMEPAGE_URL,
  parseLeafletLink,
  parseIndex,
  colaPageNumbers,
  coordsUrl,
  reconstructPage,
} from "./leaflet.mjs";
import { leafletWindowFromIndex } from "./dates.mjs";
import { extractCandidates, buildCandidatesDoc, parseCandidatesDoc, refreshVerdicts } from "./candidates.mjs";

// Lives beside current-offers.json / status.json in data/ (D-11).
export const CANDIDATES_FILE = "wasgau-candidates.json";

/**
 * Read the cached candidates doc. ANY failure (missing file, bad JSON, schema
 * drift) is a cache miss, never an error.
 * @param {string} dataDir
 * @returns {Promise<object|null>}
 */
export async function readCandidates(dataDir) {
  try {
    const text = await readFile(join(dataDir, CANDIDATES_FILE), "utf8");
    return parseCandidatesDoc(JSON.parse(text));
  } catch {
    return null; // cache miss
  }
}

/**
 * Fetch and parse this week's leaflet into a validated candidates doc.
 * @param {{ fetchText: (url: string) => Promise<string>, priorDoc?: object|null }} opts
 * @returns {Promise<object>} candidates doc (the prior one when the id is unchanged)
 * @throws on any fetch/parse failure (the caller marks Wasgau "error")
 */
export async function fetchCandidates({ fetchText, priorDoc }) {
  const html = await fetchText(HOMEPAGE_URL);
  const { id, url } = parseLeafletLink(html);

  // Same leaflet as last run: one request per unchanged week (D-05). Verdicts
  // are re-computed with the current matcher so the written file stays truthful
  // (D-06); with an unchanged matcher it is byte-identical (D-11).
  if (priorDoc?.leafletId === id) return refreshVerdicts(priorDoc);

  const index = parseIndex(await fetchText(url));
  const leafletWindow = leafletWindowFromIndex(index.pages);
  const colaPages = colaPageNumbers(index.pages);

  // Strictly sequential: one awaited request at a time (D-09), ascending pages.
  const candidates = [];
  for (const page of colaPages) {
    const xml = await fetchText(coordsUrl(id, page));
    candidates.push(...extractCandidates(page, reconstructPage(xml), leafletWindow));
  }

  return buildCandidatesDoc({
    leafletId: id,
    leafletUrl: url,
    title: index.title,
    leafletWindow,
    colaPages,
    candidates,
  });
}
