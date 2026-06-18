// web/src/derive/derive.js
// The pure, clock-injected derivation layer — the testable heart of the PWA.
// No DOM, no fetch: every function takes (data, now/today) and returns plain
// values. This is where the locked correctness decisions live so the render
// layer (Plan 04) and the chart (Plan 03) can trust the derived facts.
//
// Determinism rule (RESEARCH Pattern 4 / scraper/clock.mjs): no function calls
// `new Date()` inside its body — `now` arrives as an argument (its only use of
// `new Date()` is as a default parameter value), and the logic threads the
// passed now/today everywhere.

// Berlin-day trim (RESEARCH Pattern 1, mirrors scraper/normalize.mjs). Intl over
// a UTC `.slice(0,10)` is mandatory: 2026-06-14T22:00:00Z is already 2026-06-15
// in Europe/Berlin (CEST), which a naive UTC slice would get wrong.
const BERLIN_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * The Berlin calendar day ("YYYY-MM-DD") for an instant.
 * @param {Date} [now] the wall-clock instant (default param only — never called internally)
 * @returns {string} "YYYY-MM-DD" in Europe/Berlin
 */
export function berlinToday(now = new Date()) {
  return BERLIN_DAY.format(now);
}

// A store entry counts as a clean, brother-facing offer iff it is status "offer"
// AND not quarantined. Every active/upcoming/best-deal predicate funnels through
// this so a needsReview offer can never leak into the hero or the active/upcoming
// tiers (RESEARCH Pitfall 2 / T-03-04 / D-08). A needsReview offer is NOT silently
// dropped though — it surfaces in its own flagged "review" card (see isReview).
const isCleanOffer = (o) => o?.status === "offer" && !o?.needsReview;

/**
 * Is this offer active (covers today) right now?
 * String compare on YYYY-MM-DD is correct because both sides are Berlin dates.
 * @param {object} o StoreOffer
 * @param {string} today "YYYY-MM-DD"
 * @returns {boolean}
 */
export function isActive(o, today) {
  return isCleanOffer(o) && o.validFrom <= today && today <= o.validTo;
}

/**
 * Is this offer upcoming (its validFrom is strictly after today)? (D-06)
 * @param {object} o StoreOffer
 * @param {string} today "YYYY-MM-DD"
 * @returns {boolean}
 */
export function isUpcoming(o, today) {
  return isCleanOffer(o) && o.validFrom > today;
}

/**
 * Is this a needs-review offer worth surfacing? A `needsReview` "offer" is a real
 * but UNVERIFIED offer the matcher quarantined (e.g. a mixed-brand / odd pack-count
 * 1-litre case — D-08). It is deliberately excluded from isActive/isUpcoming/
 * bestDeal, so it never headlines the hero, but — unlike a silent drop — it earns
 * its own flagged "review" card so the brother can verify it in store. Shown only
 * while not expired (validTo covers today or is still ahead).
 * @param {object} o StoreOffer
 * @param {string} today "YYYY-MM-DD"
 * @returns {boolean}
 */
export function isReview(o, today) {
  return o?.status === "offer" && o?.needsReview === true && o.validTo >= today;
}

/**
 * Is this store's data stale? (D-16) — millisecond math on the PER-STORE
 * `lastUpdated`, NOT the file-level timestamp (RESEARCH Pitfall 1 / T-03-03),
 * against an injectable `now` with a 3-day default threshold.
 * @param {object} storeStatus a StoreStatus ({ store, status, lastUpdated })
 * @param {Date} [now] injected clock instant (default param only)
 * @param {number} [days] staleness threshold in days (default 3)
 * @returns {boolean}
 */
export function isStale(storeStatus, now = new Date(), days = 3) {
  const last = new Date(storeStatus?.lastUpdated).getTime();
  if (Number.isNaN(last)) return true; // no/garbage timestamp -> treat as stale
  return now.getTime() - last > days * 86400000;
}

/**
 * The cheapest active offer across all stores, or null if none is active. (D-06)
 * A future-validFrom (upcoming) offer is never eligible and never wins the hero —
 * eligibility is `isActive` only, so it only ever surfaces via soonestUpcoming.
 * @param {Array<object>} stores StoreOffer[]
 * @param {string} today "YYYY-MM-DD"
 * @returns {object|null} the winning StoreOffer or null
 */
export function bestDeal(stores, today) {
  const active = (stores ?? []).filter((o) => isActive(o, today));
  if (!active.length) return null;
  return active.reduce((best, o) => (o.price < best.price ? o : best));
}

/**
 * The earliest-validFrom upcoming offer, or null if none is upcoming.
 * @param {Array<object>} stores StoreOffer[]
 * @param {string} today "YYYY-MM-DD"
 * @returns {object|null}
 */
export function soonestUpcoming(stores, today) {
  const upcoming = (stores ?? []).filter((o) => isUpcoming(o, today));
  if (!upcoming.length) return null;
  return upcoming.reduce((soon, o) => (o.validFrom < soon.validFrom ? o : soon));
}

// Card ordering buckets (RESEARCH Pattern 3 / D-09). Active offers lead
// (cheapest-first), then upcoming, then review (flagged-but-unverified), then
// no_offer, with error/unavailable last.
const RANK = { active: 0, upcoming: 1, review: 2, no_offer: 3, unavailable: 4, error: 4 };

/**
 * Classify a store into a sort bucket for `today`. Active/upcoming are derived
 * (and respect !needsReview); a live needsReview offer lands in "review";
 * everything else falls back to its raw status. An expired/quarantined offer with
 * nothing left to show lands in no_offer.
 * @param {object} o StoreOffer
 * @param {string} today "YYYY-MM-DD"
 * @returns {"active"|"upcoming"|"review"|"no_offer"|"unavailable"|"error"}
 */
function bucket(o, today) {
  if (isActive(o, today)) return "active";
  if (isUpcoming(o, today)) return "upcoming";
  if (isReview(o, today)) return "review";
  if (o?.status === "unavailable") return "unavailable";
  if (o?.status === "error") return "error";
  return "no_offer"; // no_offer, and any expired "offer"
}

/**
 * Sort store cards for render: bucket rank, then active cheapest-first. Pure —
 * returns a new array; recompute on every render. (RESEARCH Pattern 3 / D-09)
 * @param {Array<object>} stores StoreOffer[]
 * @param {string} today "YYYY-MM-DD"
 * @returns {Array<object>} a new, sorted array
 */
export function sortCards(stores, today) {
  return [...(stores ?? [])].sort((a, b) => {
    const ra = RANK[bucket(a, today)];
    const rb = RANK[bucket(b, today)];
    if (ra !== rb) return ra - rb;
    // Tie-break only matters within the active tier: cheapest first (D-09).
    if (ra === RANK.active) return (a.price ?? 0) - (b.price ?? 0);
    return 0;
  });
}
