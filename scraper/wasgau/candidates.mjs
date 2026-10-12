// scraper/wasgau/candidates.mjs
//
// Wasgau candidate capture and evaluation (Phase 5).
// Pure + clock-free: `now` is injected, no I/O, no logging.
//
// Every Coca-Cola/Coke textbox on a Cola page becomes a Candidate — accepts AND
// rejects (D-10) — so near-misses stay reviewable in data/wasgau-candidates.json.
// The doc is validated by a .strict() zod schema before it is returned (D-11),
// so an invalid doc can never be written.
//
// evaluateCandidates() turns a doc into a StoreOffer by shaping candidates like
// marktguru offers and reusing selectForStore (one ranking rule for all stores,
// D-06). It re-runs the UNCHANGED matcher on the stored text every call and never
// trusts a stored verdict (D-06, D-14); with probation on, every offer is
// needsReview (D-12), so a mis-parsed leaflet price never reaches hero/history.
//
// Node 22+, no new dependencies (zod is already the project's one dependency).

import { z } from "zod";
import { classify } from "../../contract/matcher.mjs";
import { selectForStore } from "../select.mjs";
import { COLA_RE } from "./leaflet.mjs";
import { pairPrice } from "./pair.mjs";
import { resolveWindow } from "./dates.mjs";

const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const Cents = z.number().int().min(0);

const CandidateSchema = z
  .object({
    page: z.number().int().min(1).max(200),
    box: z.number().int().min(0),
    bbox: z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()]),
    text: z.string().max(2000),
    priceCents: Cents.nullable(),
    pairing: z.enum(["clean", "ambiguous", "mismatch", "unpaired"]),
    adjacentCents: z.array(Cents).max(10),
    unitPriceCents: Cents.nullable(),
    litres: z.number().finite().nullable(),
    validFrom: DateOnly,
    validTo: DateOnly,
    windowSource: z.enum(["box", "page", "leaflet"]),
    verdict: z.enum(["accept", "reject", "review"]),
  })
  .strict();

export const CandidatesDocSchema = z
  .object({
    leafletId: z.string().regex(/^[A-Za-z0-9]{4,32}$/),
    leafletUrl: z.string().max(100),
    title: z.string().max(200),
    leafletWindow: z.object({ from: DateOnly, to: DateOnly }).strict(),
    colaPages: z.array(z.number().int().min(1).max(200)).max(8),
    candidates: z.array(CandidateSchema).max(50),
  })
  .strict();

/**
 * Capture every Coca-Cola/Coke box of one reconstructed page as a Candidate.
 * @param {number} pageNumber leaflet page (from the URL, not the XML)
 * @param {ReturnType<import("./leaflet.mjs").reconstructPage>} page
 * @param {{ from: string, to: string }} leafletWindow
 * @returns {Array<object>} candidates in the fixed key order
 */
export function extractCandidates(pageNumber, page, leafletWindow) {
  const out = [];
  for (const box of page.boxes) {
    if (!COLA_RE.test(box.text)) continue;
    const pair = pairPrice(box, page.priceTokens);
    const win = resolveWindow(box, page, leafletWindow);
    out.push({
      page: pageNumber,
      box: box.id,
      bbox: box.bbox,
      text: box.text,
      priceCents: pair.priceCents,
      pairing: pair.pairing,
      adjacentCents: pair.adjacentCents,
      unitPriceCents: pair.unitPriceCents,
      litres: pair.litres,
      validFrom: win.from,
      validTo: win.to,
      windowSource: win.source,
      verdict: classify({ description: box.text }), // matcher reused as-is (D-14)
    });
  }
  return out;
}

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * Assemble and validate the candidates doc (deterministic for clean git diffs:
 * fixed key order, candidates sorted by (page, box), bbox rounded to 0.1 pt).
 * @param {{ leafletId: string, leafletUrl: string, title: string,
 *   leafletWindow: { from: string, to: string }, colaPages: number[],
 *   candidates: Array<object> }} parts
 * @returns {object} the validated doc
 * @throws ZodError when the doc violates CandidatesDocSchema
 */
export function buildCandidatesDoc({ leafletId, leafletUrl, title, leafletWindow, colaPages, candidates }) {
  const sorted = [...(candidates ?? [])]
    .sort((a, b) => a.page - b.page || a.box - b.box)
    .map((c) => ({
      page: c.page,
      box: c.box,
      bbox: c.bbox.map(round1),
      text: c.text,
      priceCents: c.priceCents,
      pairing: c.pairing,
      adjacentCents: c.adjacentCents,
      unitPriceCents: c.unitPriceCents,
      litres: c.litres,
      validFrom: c.validFrom,
      validTo: c.validTo,
      windowSource: c.windowSource,
      verdict: c.verdict,
    }));
  const doc = {
    leafletId,
    leafletUrl,
    title,
    leafletWindow: { from: leafletWindow?.from, to: leafletWindow?.to },
    colaPages,
    candidates: sorted,
  };
  return CandidatesDocSchema.parse(doc); // validate before any later write (D-11)
}

/**
 * Validate an untrusted value (e.g. the cached JSON file) as a candidates doc.
 * @param {unknown} value
 * @returns {object|null} the doc, or null when invalid (a cache miss)
 */
export function parseCandidatesDoc(value) {
  const r = CandidatesDocSchema.safeParse(value);
  return r.success ? r.data : null;
}

/**
 * Re-run the current matcher over a (cached) doc's candidate texts (D-06).
 * Only `verdict` changes; with an unchanged matcher the doc serializes to the
 * same bytes, so a cache-hit run causes no git churn (D-11).
 * @param {object} doc validated candidates doc (not mutated)
 * @returns {object} a new doc with fresh verdicts
 */
export function refreshVerdicts(doc) {
  return {
    ...doc,
    candidates: doc.candidates.map((c) => ({ ...c, verdict: classify({ description: c.text }) })),
  };
}

// Shape a candidate like a marktguru offer so selectForStore/toStoreOffer are
// reused unchanged (one ranking rule for all stores).
const shape = (c) => ({
  store: "Wasgau",
  description: c.text,
  price: c.priceCents / 100,
  // Noon UTC is the same Berlin calendar day under CET and CEST, so
  // berlinDay() inside selectForStore round-trips the date exactly.
  validityDates: [{ from: `${c.validFrom}T12:00:00Z`, to: `${c.validTo}T12:00:00Z` }],
});

/**
 * Turn a candidates doc into the Wasgau StoreOffer for this run.
 *
 * Gating (all on the FRESH matcher verdict, never the stored one — D-06):
 *  1. an accept/review candidate without a paired price throws (the caller
 *     marks Wasgau "error" and still writes the doc for review, P5-SC3);
 *  2. rejects are dropped;
 *  3. clean-paired accepts are ranked first and may become a normal offer;
 *  4. otherwise ambiguous/mismatch accepts and review candidates are ranked
 *     and any offer is forced needsReview (D-13, best-guess price kept);
 *  5. probation forces needsReview on every offer (D-12).
 * Expired windows fall out in selectForStore (no_offer); future windows
 * surface as upcoming offers (D-07).
 *
 * @param {object} doc validated candidates doc
 * @param {Date} now injected clock instant
 * @param {{ probation?: boolean }} config Wasgau source config
 * @returns {object} StoreOffer or { status: "no_offer" }
 * @throws when a Coca-Cola case candidate has no paired price
 */
export function evaluateCandidates(doc, now, config) {
  const clean = [];
  const rest = [];
  for (const c of doc?.candidates ?? []) {
    const verdict = classify({ description: c.text });
    if (verdict === "reject") continue;
    if (c.pairing === "unpaired" || c.priceCents === null) {
      throw new Error(`wasgau: Cola case candidate without a paired price (page ${c.page} box ${c.box})`);
    }
    (verdict === "accept" && c.pairing === "clean" ? clean : rest).push(shape(c));
  }

  let result = selectForStore(clean, now);
  if (result.status !== "offer") {
    const fallback = selectForStore(rest, now);
    if (fallback.status === "offer") result = { ...fallback, needsReview: true }; // D-13
  }
  if (result.status === "offer" && config?.probation) {
    return { ...result, needsReview: true }; // probation (D-12)
  }
  return result;
}
