// scraper/dedup.mjs
// Pure transform: turn the selected StoreOffers into the new price-history JSONL
// lines to append, deduplicated on the frozen D-14 key. No disk I/O here (that
// is io.mjs in Plan 02) — this only computes the line strings.
//
// Rules:
//   - only status:"offer" && !needsReview entries become history (Pitfall 4);
//     upcoming (future validFrom) offers ARE recorded.
//   - dedup on `${store}|${price}|${validFrom}` (D-14) against a caller-supplied
//     Set of existing keys, so a re-run with unchanged offers appends nothing
//     (DATA-04).
//   - every emitted object is run through parseHistoryLine BEFORE stringify so a
//     drifted record throws instead of corrupting the graph (threat T-02-01).

import { parseHistoryLine } from "../contract/schema.mjs";
import { berlinDay } from "./normalize.mjs";

/**
 * The frozen dedup key for a history entry / store offer (D-14).
 * @param {object} entry carries store, price, validFrom
 * @returns {string} "store|price|validFrom"
 */
export const keyOf = (entry) => `${entry.store}|${entry.price}|${entry.validFrom}`;

/**
 * Compute the new history JSONL lines to append for this run.
 * @param {Array<object>} offers selected StoreOffers (one per store)
 * @param {Set<string>} existingKeys keys already present in price-history.jsonl
 * @param {Date} now injected clock instant (observation date source)
 * @returns {Array<string>} JSON line strings (no trailing newline) to append
 */
export function historyLinesToAppend(offers, existingKeys, now) {
  const date = berlinDay(now.toISOString()); // observation date (Berlin, D-13)
  return (offers ?? [])
    .filter((o) => o.status === "offer" && !o.needsReview) // Pitfall 4
    .filter((o) => !existingKeys.has(keyOf(o))) // DATA-04 dedup
    .map((o) => {
      // Validate against the frozen schema BEFORE emitting (T-02-01). Field
      // order matches data/price-history.jsonl.
      const line = {
        date,
        store: o.store,
        price: o.price,
        pricePerLitre: o.pricePerLitre,
        validFrom: o.validFrom,
        validTo: o.validTo,
      };
      parseHistoryLine(line); // throws on a drifted record
      return JSON.stringify(line);
    });
}
