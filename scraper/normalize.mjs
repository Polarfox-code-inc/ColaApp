// scraper/normalize.mjs
// Pure transforms turning a marktguru-shaped offer + a chosen validity range
// into a frozen-schema-valid StoreOffer. Side-effect-free and clock-free:
// the observation/validity instants arrive as ISO strings, never `new Date()`
// here (determinism against fixtures — RESEARCH Pattern 4).
//
// Encodes DATA-03 normalization: integer cents (D-09), cents/litre over the
// ACTUAL bottle count (D-11), Berlin-trimmed calendar dates (D-13), and NO pfand
// field (D-10 — the contract is .strict() and would reject an extra key).

import { caseCount } from "../contract/matcher.mjs";

// Berlin-day trim (D-09, findings S4). Intl over a UTC `.slice(0,10)` is
// mandatory: 2026-06-14T22:00:00Z is already 2026-06-15 in Europe/Berlin (CEST),
// which a naive UTC slice would get wrong.
const BERLIN_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Trim an ISO-UTC instant to its calendar day in Europe/Berlin.
 * @param {string} iso ISO-8601 timestamp (e.g. "2026-06-14T22:00:00Z")
 * @returns {string} "YYYY-MM-DD" in Berlin local time
 */
export const berlinDay = (iso) => BERLIN_DAY.format(new Date(iso));

/**
 * Build a frozen-schema-valid `status:"offer"` StoreOffer from an accepted
 * marktguru offer and the validity range Task-2 selection chose.
 * @param {object} offer marktguru-shaped offer; must carry `store` + decimal `price`
 * @param {{from: string, to: string}} range the chosen validityDates range (ISO-UTC)
 * @returns {object} StoreOffer (price/pricePerLitre integer cents, Berlin dates)
 */
export function toStoreOffer(offer, range) {
  const store = offer?.store;
  // Math.round avoids float artefacts like 5.99 * 100 === 598.9999... (D-09).
  const price = Math.round((offer?.price ?? 0) * 100);
  // Per-litre is price over the ACTUAL number of 1-litre bottles (D-11): a 14×1L
  // case is 14 litres, not 12. Fall back to 12 (a full Kasten) when the offer
  // carries no parseable count — e.g. an ambiguous "Kasten" review entry.
  const litres = caseCount(offer) ?? 12;
  const pricePerLitre = Math.round(price / litres);

  return {
    store,
    displayName: store, // identity for v1 (Open Q2)
    status: "offer",
    needsReview: false,
    price,
    currency: "EUR",
    pricePerLitre,
    validFrom: berlinDay(range?.from),
    validTo: berlinDay(range?.to),
    // NB: no pfand/deposit key is ever produced (D-10).
  };
}
