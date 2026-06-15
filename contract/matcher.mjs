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
// pack size (rejects 1,25L 6-packs, can trays, 0,5L, 6x1L cases, store-brand
// colas — D-07); quarantines mixed-brand / ambiguous-size offers as "review"
// (needsReview, D-08) instead of silently dropping them. Pfand text is never
// parsed or branched on (D-10).
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

// A clean "12 x 1 L" case token: 12, an x, a single 1, an optional hyphen, then
// l / liter at a word boundary. Bounded \s* runs only — linear.
const IS_12x1L = /(^|[^\d])12\s*x\s*1\s*-?\s*l(iter)?\b/;

// Disqualifying pack/size tokens — if present without a clean IS_12x1L, reject.
// Covers wrong bottle sizes (1,25 / 0,5 / 0,33 / 0,2), cans (dose/ds.), and
// wrong pack counts (6x / 10x / 24x).
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

  // 3. Mixed-brand AND a 12x1L-ish case signal -> quarantine (D-08). Ambiguous
  //    which product the price applies to, so flag rather than accept/drop.
  if (mixed && (isCase || caseWord)) return "review";

  // 4. Disqualifier present and no clean 12x1L token -> reject (wrong size/pack).
  if (DISQUALIFY.test(text) && !isCase) return "reject";

  // 5. Clean 12x1L token, Coca-Cola, no disqualifier, not mixed -> accept (D-06).
  if (isCase) return "accept";

  // 6. "Kasten"/"case" with no confirming size and no contradicting
  //    disqualifier -> ambiguous size, quarantine (D-08).
  if (caseWord) return "review";

  // 7. Coca-Cola but no recognizable 12x1L case signal at all -> reject.
  return "reject";
}
