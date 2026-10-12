// scraper/wasgau/pair.mjs
//
// Geometric price pairing for Wasgau leaflet boxes (Phase 5, D-13).
// Pure + clock-free: no I/O, no logging.
//
// A leaflet product box carries no price of its own — the big price glyphs sit
// in a separate box to its right, left or below. The NEAREST price is often the
// wrong one (p17: the 0,33 can's nearest price is the glass bottles' 8.99,
// Pitfall 4), so pairing combines geometry with the box's mandatory per-litre
// price (PAngV "1-l-Preis"): litres x 1-l-Preis must reproduce the price.
//
// SECURITY (T-05-02, ReDoS): all regexes are linear with bounded quantifiers.
//
// Node 22+, no new dependencies.

// Max edge gap (pt) between a product box and its price token: ~42% of the
// 476 pt page width — wide enough for the real 168 pt can->0.79 layout.
export const MAX_GAP = 200;

// "je 12 x 1-l", "6 x 0,5-l" -> count x volume.
const MULTI_LITRES_RE = /(\d{1,2})\s{0,3}x\s{0,3}(\d{1,2}(?:,\d{1,3})?)\s{0,3}-?\s{0,3}l\b/;
// "0,33-l-Dose", "2-l-PET" -> volume; never the "1-l-Preis" unit-price label.
const SINGLE_LITRES_RE = /(?:^|[^\d,.])(\d{1,2}(?:,\d{1,3})?)\s{0,3}-?\s{0,3}l\b(?!-?\s{0,3}preis)/;
const UNIT_PRICE_RE = /1-l-preis\s{1,3}(ab\s{1,3})?(\d{1,3}\.\d{2})/gi;

const num = (s) => Number(s.replace(",", "."));
const round3 = (n) => Math.round(n * 1000) / 1000;

/**
 * Total litres advertised in a box: "N x V-l" multipacks give N*V, a single
 * "V-l" container gives V, otherwise null.
 * @param {string} text reconstructed box text
 * @returns {number|null}
 */
export function litresOf(text) {
  const t = String(text ?? "").toLowerCase();
  const multi = t.match(MULTI_LITRES_RE);
  if (multi) return round3(Number(multi[1]) * num(multi[2]));
  const single = t.match(SINGLE_LITRES_RE);
  if (single) return round3(num(single[1]));
  return null;
}

/**
 * The box's "1-l-Preis" (per-litre price) in cents.
 * @param {string} text reconstructed box text
 * @returns {{ cents: number, from: boolean, multi: boolean } | null}
 *   from: the first value is an "ab" (from-) price; multi: several values
 *   (a multi-variant box). Either makes the cross-check unreliable.
 */
export function unitPriceOf(text) {
  const matches = [...String(text ?? "").matchAll(UNIT_PRICE_RE)];
  if (!matches.length) return null;
  const [first] = matches;
  return {
    cents: Math.round(Number(first[2]) * 100),
    from: Boolean(first[1]),
    multi: matches.length > 1,
  };
}

// Edge gap between two bboxes on each axis (0 when the ranges overlap).
function gaps(p, t) {
  const dx = Math.max(0, t[0] - p[2], p[0] - t[2]);
  const dy = Math.max(0, t[1] - p[3], p[1] - t[3]);
  return { dx, dy };
}

/**
 * Pair a product box with one of the page's price tokens.
 * Adjacent = tokens overlapping the box on at least one axis with an edge gap
 * <= MAX_GAP, ordered by gap, then x0, then y0. Outcome classes (D-13):
 *   clean     - cross-checkable and exactly one adjacent token is consistent
 *   ambiguous - several consistent tokens (nearest consistent), or no usable
 *               cross-check (first consistent, else nearest adjacent)
 *   mismatch  - cross-checkable but no adjacent token is consistent (nearest)
 *   unpaired  - no adjacent token at all (priceCents null)
 * @param {{ bbox: number[], text: string }} box reconstructed product box
 * @param {Array<{ cents: number, bbox: number[] }>} priceTokens page-wide tokens
 * @returns {{ priceCents: number|null,
 *   pairing: "clean"|"ambiguous"|"mismatch"|"unpaired",
 *   adjacentCents: number[], unitPriceCents: number|null, litres: number|null }}
 */
export function pairPrice(box, priceTokens) {
  const adjacent = [];
  for (const tok of priceTokens ?? []) {
    const { dx, dy } = gaps(box.bbox, tok.bbox);
    // One-axis overlap keeps diagonal neighbours (another product's price) out.
    if ((dx === 0 || dy === 0) && dx + dy <= MAX_GAP) adjacent.push({ tok, gap: dx + dy });
  }
  adjacent.sort(
    (a, b) => a.gap - b.gap || a.tok.bbox[0] - b.tok.bbox[0] || a.tok.bbox[1] - b.tok.bbox[1],
  );

  const litres = litresOf(box.text);
  const unit = unitPriceOf(box.text);
  const base = {
    adjacentCents: adjacent.slice(0, 10).map((a) => a.tok.cents),
    unitPriceCents: unit ? unit.cents : null,
    litres,
  };

  // No price token near the box at all.
  if (!adjacent.length) return { priceCents: null, pairing: "unpaired", ...base };

  // Tokens that litres x 1-l-Preis reproduces; the tolerance absorbs the
  // leaflet's rounding (12 x 0.75 = 9.00 vs 8.99). Kept in gap order.
  const consistent =
    unit && litres !== null
      ? adjacent.filter(
          (a) => Math.abs(unit.cents * litres - a.tok.cents) <= Math.ceil(0.5 * litres) + 2,
        )
      : [];
  const nearest = adjacent[0].tok.cents;

  // Outcome table (D-13). Deliberately NO "mutual-nearest exclusion": in the
  // research prototype it stole granini's 1.69 for Sinalco.
  const crossCheckable = unit !== null && !unit.from && !unit.multi && litres !== null;
  if (crossCheckable) {
    if (consistent.length === 1) {
      return { priceCents: consistent[0].tok.cents, pairing: "clean", ...base };
    }
    if (consistent.length > 1) {
      return { priceCents: consistent[0].tok.cents, pairing: "ambiguous", ...base };
    }
    // The 1-l-Preis contradicts every nearby price (e.g. a dropped glyph).
    return { priceCents: nearest, pairing: "mismatch", ...base };
  }
  // No usable cross-check (no 1-l-Preis, an "ab" price, or a multi-variant box):
  // best guess only — the first consistent token if any, else the nearest.
  return {
    priceCents: consistent.length ? consistent[0].tok.cents : nearest,
    pairing: "ambiguous",
    ...base,
  };
}
