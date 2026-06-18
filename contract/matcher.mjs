// contract/matcher.mjs
// Coca-Cola 1-litre-case matcher (DATA-02) — pure, network-free classifier.
//
// THE decisive research finding (01-RESEARCH.md, spike/findings.md): marktguru
// offer TITLES are generic ("Cola") — pack size + flavor live in the
// `description` / `product.description` field. A title-only matcher is therefore
// impossible. classify() reads the CONCATENATION of brand + product.name +
// product.description + description (NOT title alone — Anti-Pattern #1).
//
// SCOPE (user decision, 2026-06): accept any CASE OF 1-LITRE PET BOTTLES whose
// bottle count is 12 OR MORE (a full Kasten plus optional bonus bottles) that
// INCLUDES Coca-Cola — any flavor (Classic/Zero/Light/koffeinfrei, "versch.
// Sorten") and any Coca-Cola-company multi-brand bundle (Coca-Cola + Fanta /
// Sprite / Mezzo Mix). German Kasten promos are overwhelmingly these bundles, so
// treating them as real offers (not quarantined) is what makes the app useful.
//   - REJECT: store/competitor colas (no Coca-Cola), wrong per-bottle sizes
//     (1,25 / 0,5 / 0,33 / 0,2 / cans), and 1-litre packs UNDER 12 (a six-pack is
//     not a case).
//   - REVIEW (needsReview, D-08): a "Kasten"/"case" wording with NO confirmable
//     1-litre size/count — genuinely ambiguous, surfaced flagged rather than
//     dropped, never silently guessed.
//   - "versch. Sorten" means various FLAVORS, never mixed-brand — it never demotes
//     an otherwise-clean case (the earlier defect this scope change fixes).
//
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

// A 1-litre multipack token, capturing the bottle COUNT in group 2: "N x [je] 1 l".
// Tolerates the real Kaufland phrasing "14 x je 1-l-PET-Fl." and an optional hyphen
// before the unit. Bounded \s* runs and a {1,2}-digit count only — strictly linear.
const NX1L = /(^|[^\d])(\d{1,2})\s*x\s*(je\s*)?1\s*-?\s*l(iter)?\b/;

// The smallest bottle count that still counts as a "case" (a full Kasten is 12;
// "plus bonus bottles" — e.g. 13/14/20 — is fine; fewer is a six-pack, not a case).
const MIN_CASE = 12;

// Wrong per-bottle SIZE / can tokens — if present without a confirmed 1-litre
// case, reject (these are the non-1L products: 1,25L/0,5L/0,33L/0,2L bottles and
// cans). NB: pack COUNT is no longer disqualifying here — the count gate (>=12)
// owns that — so a large 1-litre case is judged on its count, not blocked.
const WRONG_SIZE = /(1,25|0,5|0,33|0,2|\bdose\b|\bds\.)/;

// Coca-Cola brand signal (brand field already lowercased into the blob). Required:
// a bundle must INCLUDE Coca-Cola to qualify (a Fanta-only offer is not ours).
const COCA_COLA_BRAND = /coca[\s-]?cola/;

// Store / competitor cola brands — always reject (D-07).
const STORE_BRAND = /(ja!|gut\s*&\s*g|k-classic|vita\s*cola|river\s*cola|\briver\b|freeway|pepsi|fritz[\s-]?kola|fritz)/;

// Ambiguous "case"-ish wording without a confirming per-bottle size.
const CASE_WORD = /(\bkasten\b|\bcase\b)/;

/**
 * The bottle count of a 1-litre multipack in the offer text, or null if the offer
 * carries no "N x 1 l" token. Exported so the normalizer can price per ACTUAL
 * litres (a 14×1L is 14 litres, not 12).
 * @param {object} offer marktguru-shaped Offer
 * @returns {number|null}
 */
export function caseCount(offer) {
  const m = normalize(offer).match(NX1L);
  return m ? Number.parseInt(m[2], 10) : null;
}

/**
 * Classify an offer as a Coca-Cola 1-litre case (>=12 bottles).
 * @param {object} offer marktguru-shaped Offer
 * @returns {"accept"|"reject"|"review"}
 */
export function classify(offer) {
  const text = normalize(offer);

  // 1. Store / competitor brand -> reject (D-07). Checked first so a size-matching
  //    store cola (e.g. "River Cola 12 x 1 l") can never slip through.
  if (STORE_BRAND.test(text)) return "reject";

  // 2. Must INCLUDE Coca-Cola (any flavor; mixed bundles list it in the brand
  //    field) — otherwise it is not our product.
  if (!COCA_COLA_BRAND.test(text)) return "reject";

  // From here the offer includes Coca-Cola.
  const nx1l = text.match(NX1L);
  const count = nx1l ? Number.parseInt(nx1l[2], 10) : null;
  const is1LPack = nx1l !== null;

  // 3. A confirmed 1-litre multipack: a full case (>=12) plus optional bonus
  //    bottles is a valid offer — incl. Coca-Cola-company mixed bundles and any
  //    flavor. Fewer than 12 is a six-pack, not a case -> reject.
  if (is1LPack) return count >= MIN_CASE ? "accept" : "reject";

  // 4. Not a 1-litre pack, and a wrong per-bottle size / can token is present
  //    (1,25 / 0,5 / 0,33 / 0,2 / Dose) -> wrong product -> reject.
  if (WRONG_SIZE.test(text)) return "reject";

  // 5. "Kasten"/"case" wording but no confirmable 1-litre size/count -> genuinely
  //    ambiguous; surface flagged for a human check rather than guess (D-08).
  if (CASE_WORD.test(text)) return "review";

  // 6. Coca-Cola but no recognizable 1-litre case at all -> reject.
  return "reject";
}
