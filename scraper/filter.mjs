// scraper/filter.mjs
// Pure allow-list filter: buckets raw marktguru offers by the 4 in-scope
// marktguru advertiser slugs. Untrusted third-party JSON, so every access is
// defensively optional-chained (ASVS V5), mirroring matcher.normalize().
//
// Wasgau is intentionally ABSENT from the slug map (D-03): it is never a
// marktguru advertiser at PLZ 67105, so it is handled downstream as a fixed
// "unavailable" store, never routed through this filter. Out-of-scope slugs
// (netto-marken-discount, penny, scheck-in-center, thomas-philipps, ...) match
// no bucket and are silently dropped (threat T-02-03, accept).

const SLUG_TO_STORE = {
  rewe: "REWE",
  edeka: "Edeka",
  lidl: "Lidl",
  kaufland: "Kaufland",
};

/**
 * Bucket raw offers by in-scope store, keyed by all four store names.
 * @param {Array<object>} results marktguru `results[]` (untrusted)
 * @returns {Map<string, Array<object>>} store -> matching raw offers
 */
export function filterToAllowList(results) {
  // Pre-seed all four buckets so callers always get every in-scope store key.
  const byStore = new Map(Object.values(SLUG_TO_STORE).map((s) => [s, []]));
  for (const offer of results ?? []) {
    for (const a of offer?.advertisers ?? []) {
      const store = SLUG_TO_STORE[a?.uniqueName];
      if (store) byStore.get(store).push(offer);
    }
  }
  return byStore;
}
