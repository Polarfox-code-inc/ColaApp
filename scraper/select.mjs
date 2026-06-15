// scraper/select.mjs
// Pick exactly ONE entry per store from its candidate offers under the D-07/D-08
// ladder. Pure + clock-free: `now` is injected (Pattern 4), never `new Date()`.
//
// Reuses the frozen contract verbatim: classify() is THE 12x1L gate (no
// size/brand regex is re-implemented here) and toStoreOffer() / berlinDay()
// own all cents + Berlin-date rules. This module only orders candidates.

import { classify } from "../contract/matcher.mjs";
import { berlinDay, toStoreOffer } from "./normalize.mjs";

// Berlin-day trim that tolerates an unparseable instant. `validityDates` is
// untrusted marktguru JSON: a missing/null/garbage from|to makes `new Date(iso)`
// an Invalid Date, and feeding that to Intl.format throws RangeError. Returning
// null instead lets `berlinRanges` DROP just that range — so one malformed offer
// is skipped (per-offer isolation), never poisoning the whole store (WR-01).
const safeBerlinDay = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : berlinDay(iso);
};

// All marktguru validity ranges of an offer, trimmed to Berlin calendar days.
// Ranges whose from|to cannot be parsed are dropped (WR-01), preserving the
// accept/upcoming/active semantics for every valid range that remains. Because
// only parseable ranges survive here, the later toStoreOffer(best.range.raw)
// call can never hit an Invalid Date either.
const berlinRanges = (offer) =>
  (offer?.validityDates ?? [])
    .map((r) => ({
      raw: r,
      from: safeBerlinDay(r?.from),
      to: safeBerlinDay(r?.to),
    }))
    .filter((r) => r.from && r.to);

// The active range (covers `today`) if any, else the earliest future range.
// Returns the chosen { raw, from, to } or null when the offer has no usable range.
function pickRange(offer, today) {
  const ranges = berlinRanges(offer);
  const active = ranges.filter((r) => r.from <= today && today <= r.to);
  if (active.length) {
    // Prefer the range with the earliest start among the active ones.
    return active.sort((a, b) => a.from.localeCompare(b.from))[0];
  }
  const upcoming = ranges
    .filter((r) => r.from > today)
    .sort((a, b) => a.from.localeCompare(b.from));
  return upcoming[0] ?? null;
}

// Rank: active (covers today) sorts before upcoming; within a tier, earliest
// start, then lowest price.
function bestOf(entries) {
  return entries.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1; // active first
    if (a.range.from !== b.range.from) return a.range.from.localeCompare(b.range.from);
    return a.price - b.price; // lowest price tie-break
  })[0];
}

/**
 * Select the single best StoreOffer for one store's candidate offers.
 * @param {Array<object>} candidates raw offers already bucketed for this store
 * @param {Date} now injected clock instant
 * @returns {object} a StoreOffer (status:"offer", maybe needsReview) or { status:"no_offer" }
 */
export function selectForStore(candidates, now) {
  const today = berlinDay(now.toISOString());

  // 1. Partition by the frozen classifier; drop rejects.
  const accepts = [];
  const reviews = [];
  for (const offer of candidates ?? []) {
    const verdict = classify(offer);
    if (verdict === "accept") accepts.push(offer);
    else if (verdict === "review") reviews.push(offer);
  }

  // 2. A clean accept always wins (D-08). Rank accepts active>upcoming, lowest price.
  const acceptEntries = accepts
    .map((offer) => {
      const range = pickRange(offer, today);
      if (!range) return null;
      return {
        offer,
        range,
        isActive: range.from <= today && today <= range.to,
        price: Math.round((offer?.price ?? 0) * 100),
      };
    })
    .filter(Boolean);

  if (acceptEntries.length) {
    const best = bestOf(acceptEntries);
    return toStoreOffer(best.offer, best.range.raw);
  }

  // 3. No accept but a review candidate -> emit it with needsReview:true (D-08).
  const reviewEntries = reviews
    .map((offer) => {
      const range = pickRange(offer, today);
      if (!range) return null;
      return {
        offer,
        range,
        isActive: range.from <= today && today <= range.to,
        price: Math.round((offer?.price ?? 0) * 100),
      };
    })
    .filter(Boolean);

  if (reviewEntries.length) {
    const best = bestOf(reviewEntries);
    return { ...toStoreOffer(best.offer, best.range.raw), needsReview: true };
  }

  // 4. Nothing accepts or reviews -> no offer this run.
  return { status: "no_offer" };
}
