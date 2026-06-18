// contract/matcher.mjs
// Strict 12x1L Coca-Cola matcher (DATA-02) — pure, network-free classifier.
//
// THE decisive research finding (01-RESEARCH.md, spike/findings.md): marktguru
// offer TITLES are generic ("Cola") — pack size + flavor live in the
// `description` / `product.description` field. A title-only matcher is therefore
// impossible. classify() reads the CONCATENATION of brand + product.name +
// product.description + description (NOT title alone — Anti-Pattern #1).
//
// Flavor-permissive (Classic/Zero/Light/koffeinfrei all match — D-06); strict on
// pack size (rejects 1,25L 6-packs, can trays, 0,5L, the known-wrong 6x/10x/18x/
// 24x cases, store-brand colas — D-07); quarantines mixed-brand / ambiguous-size
// offers AND case-like 1-litre multipacks whose count is not 12 (e.g. a 14x1L
// promo) as "review" (needsReview, D-08) instead of silently dropping them.
// Pfand text is never parsed or branched on (D-10).
//
// All regexes are linear / anchored with bounded quantifiers — no nested
// unbounded quantifiers, so adversarial offer text cannot trigger catastrophic
// backtracking (threat T-03-01, ReDoS).

/**
 * Normalize an offer to a single lowercase text blob for matching.
 * Joins brand.name + product.name + product.description + description (NEVER
 * title alone), lowercases, unifies the multiplication sign, and collapses
 * whitespace.
 * @param {object} offer marktguru-shaped Offer
 * @returns {string}
 */
export function normalize(offer) {
  return [
    offer?.brand?.name,
    offer?.product?.name,
    offer?.product?.description,
    offer?.description,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/×/g, "x")
    .replace(/\s+/g, " ")
    .trim();
}

// A clean "12 x 1 L" case token: 12, an x, an optional "je", a single 1, an
// optional hyphen, then l / liter at a word boundary. The optional "je" tolerates
// the real Kaufland phrasing "12 x je 1-l-PET-Fl.". Bounded \s* runs only — linear.
const IS_12x1L = /(^|[^\d])12\s*x\s*(je\s*)?1\s*-?\s*l(iter)?\b/;

// Any 1-litre multipack token, capturing the bottle COUNT in group 2: N x [je] 1 l.
// Used to spot a case-like Coca-Cola offer whose count is NOT 12 (e.g. the real
// Kaufland "14 x je 1-l-PET-Fl." promo). Same bounded, linear shape as IS_12x1L.
const NX1L = /(^|[^\d])(\d{1,2})\s*x\s*(je\s*)?1\s*-?\s*l(iter)?\b/;

// Disqualifying pack/size tokens — if present without a clean IS_12x1L, reject.
// Covers wrong bottle sizes (1,25 / 0,5 / 0,33 / 0,2), cans (dose/ds.), and the
// KNOWN-wrong pack counts (6x / 10x / 18x / 24x). These counts are rejected
// outright (checked BEFORE the odd-count "review" path below), so a 6x1L case
// stays a reject while an unanticipated 14x1L 1-litre case becomes a review.
const DISQUALIFY = /(1,25|0,5|0,33|0,2|\bdose\b|\bds\.|\b6\s*x|\b10\s*x|\b18\s*x|\b24\s*x)/;

// Coca-Cola brand signal (brand field already lowercased into the blob).
const COCA_COLA_BRAND = /coca[\s-]?cola/;

// Store / competitor cola brands — always reject (D-07).
const STORE_BRAND = /(ja!|gut\s*&\s*g|k-classic|vita\s*cola|river\s*cola|\briver\b|freeway|pepsi|fritz[\s-]?kola|fritz)/;

// Mixed-brand bundle phrasing — Coca-Cola advertised alongside siblings.
const MIXED_BRAND = /(oder\s+(fanta|sprite|mezzo\s*mix)|fanta\/sprite|versch\.\s*sorten)/;

// Ambiguous "case"-ish wording without a confirming per-bottle size.
const CASE_WORD = /(\bkasten\b|\bcase\b)/;

/**
 * Classify an offer as a strict 12x1L Coca-Cola case.
 * @param {object} offer marktguru-shaped Offer
 * @returns {"accept"|"reject"|"review"}
 */
export function classify(offer) {
  const text = normalize(offer);

  // 1. Store / competitor brand -> reject (D-07). Checked before everything so a
  //    size-matching store cola (e.g. "River Cola 12 x 1 l") cannot slip through.
  if (STORE_BRAND.test(text)) return "reject";

  // 2. Not Coca-Cola -> reject. A "Cola"-titled offer with a non-Coca-Cola brand
  //    is not our product.
  if (!COCA_COLA_BRAND.test(text)) return "reject";

  // From here the offer IS Coca-Cola brand.
  const isCase = IS_12x1L.test(text);
  const mixed = MIXED_BRAND.test(text);
  const caseWord = CASE_WORD.test(text);
  // A 1-litre multipack whose count is NOT 12 (e.g. "14 x 1 l"). Case-like but
  // not the canonical Kasten -> a review candidate below (D-08).
  const nx1l = text.match(NX1L);
  const otherCount1L = Boolean(nx1l) && nx1l[2] !== "12";

  // 3. Mixed-brand AND a 12x1L-ish case signal -> quarantine (D-08). Ambiguous
  //    which product the price applies to, so flag rather than accept/drop.
  if (mixed && (isCase || caseWord)) return "review";

  // 4. Disqualifier present and no clean 12x1L token -> reject (wrong size/pack).
  if (DISQUALIFY.test(text) && !isCase) return "reject";

  // 5. Clean 12x1L token, Coca-Cola, no disqualifier, not mixed -> accept (D-06).
  if (isCase) return "accept";

  // 6. Either a "Kasten"/"case" with no confirming size, OR a 1-litre multipack
  //    whose count is not 12 (e.g. 14 x 1 l). Both are case-like but ambiguous,
  //    so quarantine as needsReview (D-08) rather than silently drop. Reached
  //    only AFTER the DISQUALIFY reject above, so the known-wrong counts
  //    (6x/10x/18x/24x) and wrong bottle sizes still hard-reject.
  if (caseWord || otherCount1L) return "review";

  // 7. Coca-Cola but no recognizable 12x1L case signal at all -> reject.
  return "reject";
}
