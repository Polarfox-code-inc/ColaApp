// scripts/diagnose.mjs
// Throwaway diagnostic (NOT part of the pipeline). Runs the SAME live fetch and
// the SAME frozen matcher the scraper uses, then dumps — to stdout, for the CI
// logs — every Kaufland-tagged offer and every cola-text offer with its
// classify() verdict. Purpose: explain why a known Kaufland 12x1L offer is not
// surfacing on the PWA (is it in marktguru at all? wrong advertiser slug?
// matcher reject? text format?).
//
// Reuses scraper/fetch.mjs + contract/matcher.mjs verbatim so the verdict shown
// here is authoritative. Reads nothing, writes nothing, commits nothing.

import { fetchOffers } from "../scraper/fetch.mjs";
import { classify, normalize } from "../contract/matcher.mjs";

const results = await fetchOffers();
console.log(`TOTAL results returned by marktguru: ${results.length}`);

// Distinct advertiser slugs — confirms whether "kaufland" is even present.
const slugs = new Set();
for (const o of results) {
  for (const a of o?.advertisers ?? []) if (a?.uniqueName) slugs.add(a.uniqueName);
}
console.log("distinct advertiser uniqueName slugs:", [...slugs].sort().join(", "));

function describe(o) {
  return {
    advertisers: (o?.advertisers ?? [])
      .map((a) => `${a?.name}[${a?.uniqueName}]`)
      .join(", "),
    title: o?.title,
    brand: o?.brand?.name,
    productName: o?.product?.name,
    productDescription: o?.product?.description,
    description: o?.description,
    price: o?.price,
    validityDates: o?.validityDates,
    normalizedText: normalize(o),
    VERDICT: classify(o),
  };
}

const kaufland = results.filter((o) =>
  (o?.advertisers ?? []).some((a) => a?.uniqueName === "kaufland")
);
console.log(`\n=== Offers tagged advertiser slug "kaufland": ${kaufland.length} ===`);
for (const o of kaufland) console.log(JSON.stringify(describe(o), null, 2));

const cola = results.filter(
  (o) => /cola/i.test(normalize(o)) || /cola/i.test(o?.title ?? "")
);
console.log(`\n=== Any cola-text offers (ALL advertisers): ${cola.length} ===`);
for (const o of cola) console.log(JSON.stringify(describe(o), null, 2));
