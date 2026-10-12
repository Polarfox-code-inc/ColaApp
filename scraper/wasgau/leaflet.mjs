// scraper/wasgau/leaflet.mjs
//
// Pure parsers for the Wasgau weekly leaflet (Phase 5): the wasgau.de homepage
// link, the 1kcloud ePaper index page, and the per-page pdfminer coords XML.
// Pure + clock-free: no I/O, no logging, no `new Date()`. The network seam that
// feeds these strings in lives elsewhere (Plan 05-03).
//
// Decisions honoured: D-07/D-18 (the leaflet link comes ONLY from the homepage
// `var wasgau` JSON and must match the 1kcloud allow-list), D-09/SC4 (only index
// pages mentioning Coca-Cola/Coke are selected, capped), D-10 (COLA_RE is
// deliberately wide so near-misses are captured too), D-15 (fixture-proven).
//
// SECURITY (T-05-01, Pitfall 11): the angebotslink is untrusted third-party
// data. It is read via JSON.parse (never eval), must match
// ^https://wasgau-dlog.1kcloud.com/<4-32 alnum>/$, and every later URL is
// REBUILT from the validated id plus an integer page 1..200 — a hijacked page
// can never steer the runner to another host or path.
// SECURITY (T-05-02, ReDoS): every regex is linear with bounded quantifiers or
// negated character classes; no nested quantifiers.
//
// The XML "parser" is a deliberately small linear scanner (RESEARCH "Don't
// Hand-Roll" alternative): the input is one flat, machine-generated, fully
// escaped pdfminer.six format (no CDATA/namespaces/DTD) and the project keeps a
// single dependency.
//
// ACCEPTED RESIDUAL RISK — glyph dropout (RESEARCH Pitfall 7): some leaflet
// fonts lack Unicode maps (e.g. p20 reads "Aktionszeitrum", "Kuf"). A Cola
// offer set in such a font is invisible to this text layer (a false no_offer),
// and a dropped price digit surfaces as a pairing "mismatch" -> needsReview,
// never as a wrong clean price. Fixing it would need OCR, which CLAUDE.md
// excludes.
//
// ACCEPTED ASSUMPTION (RESEARCH Open Question 4): a multi-variant box such as
// "6 x 1-l-Glas ... oder Kiste mit je 12 x 1-l-PET" is classified by the
// matcher's FIRST "N x 1 l" token (count 6 -> reject). It stays visible as a
// near-miss in data/wasgau-candidates.json; the matcher is not changed (D-14).
//
// Node 22+, no new dependencies.

export const HOMEPAGE_URL = "https://www.wasgau.de/";
export const LEAFLET_HOST = "wasgau-dlog.1kcloud.com";

// Bounded, linear: the JSON object literal may not contain "<" or ";" and is at
// most 500 chars, so a hostile page cannot make this scan expensive.
const LINK_SCRIPT_RE = /var\s+wasgau\s*=\s*(\{[^<;]{0,500}\})\s*;/;
const ALLOWED_LINK_RE = /^https:\/\/wasgau-dlog\.1kcloud\.com\/([A-Za-z0-9]{4,32})\/$/;
const ID_RE = /^[A-Za-z0-9]{4,32}$/;
const MAX_PAGE = 200;

// Normalize CRLF/CR to LF at every parser entry (Pitfall 8: autocrlf=true on
// the Windows dev machine turns committed LF fixtures into CRLF).
const lf = (s) => String(s ?? "").replace(/\r\n?/g, "\n");
const collapse = (s) => s.replace(/\s+/g, " ").trim();

const NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/**
 * Decode the five XML/HTML named entities plus decimal/hex numeric references.
 * Numeric references outside the Unicode range are left untouched.
 * @param {string} s
 * @returns {string}
 */
export function decodeEntities(s) {
  return String(s ?? "").replace(
    /&(#[xX][0-9a-fA-F]{1,8}|#\d{1,8}|amp|lt|gt|quot|apos);/g,
    (whole, ref) => {
      if (ref[0] !== "#") return NAMED_ENTITIES[ref];
      const code = ref[1] === "x" || ref[1] === "X"
        ? Number.parseInt(ref.slice(2), 16)
        : Number.parseInt(ref.slice(1), 10);
      return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    },
  );
}

/**
 * Read the current leaflet link from the wasgau.de homepage `var wasgau`
 * script (D-07, D-18). Never "the first 1kcloud link on the page": market
 * pages also link unrelated 1kcloud documents.
 * @param {string} html homepage HTML
 * @returns {{ id: string, url: string }} validated id + URL rebuilt from it
 * @throws when the script is missing or the link is not an allowed 1kcloud URL
 */
export function parseLeafletLink(html) {
  const m = lf(html).match(LINK_SCRIPT_RE);
  if (!m) throw new Error("wasgau.de: angebotslink script not found");
  let link;
  try {
    link = JSON.parse(m[1])?.angebotslink; // never eval
  } catch {
    throw new Error("wasgau.de: angebotslink script not found");
  }
  const id = typeof link === "string" ? link.match(ALLOWED_LINK_RE)?.[1] : undefined;
  if (!id) throw new Error("wasgau.de: angebotslink not an allowed 1kcloud URL");
  // Rebuild rather than echo the untrusted string.
  return { id, url: `https://${LEAFLET_HOST}/${id}/` };
}

/**
 * Build the coords-XML URL for one leaflet page from a validated id.
 * @param {string} id leaflet id (re-validated here)
 * @param {number} page integer page number 1..200
 * @returns {string}
 * @throws on an invalid id or page
 */
export function coordsUrl(id, page) {
  if (typeof id !== "string" || !ID_RE.test(id)) {
    throw new Error("1kcloud: invalid leaflet id");
  }
  if (!Number.isInteger(page) || page < 1 || page > MAX_PAGE) {
    throw new Error("1kcloud: invalid page number");
  }
  return `https://${LEAFLET_HOST}/${id}/epaper/coords/page_${page}.xml`;
}

// One searchable block per leaflet page; [^<]* keeps the text capture linear.
const INDEX_PAGE_RE =
  /data-textpos="epaper\/coords\/page_(\d{1,3})\.xml">\s*<div class="text">([^<]*)<\/div>/g;
const TITLE_RE = /<title>([^<]{0,200})<\/title>/;

/**
 * Parse the 1kcloud index page into its title and per-page flattened texts.
 * Page texts are entity-decoded, NFKC-normalized and whitespace-collapsed.
 * Used for page discovery and the leaflet window only — never for classifying
 * (the flattened text merges neighbouring offers).
 * @param {string} html index.html of the leaflet
 * @returns {{ title: string, pages: Array<{ page: number, text: string }> }}
 * @throws when no searchable page is found
 */
export function parseIndex(html) {
  const src = lf(html);
  const pages = [];
  for (const m of src.matchAll(INDEX_PAGE_RE)) {
    const page = Number(m[1]);
    if (page < 1 || page > MAX_PAGE) continue;
    pages.push({ page, text: collapse(decodeEntities(m[2]).normalize("NFKC")) });
  }
  if (!pages.length) throw new Error("1kcloud index: no searchable pages");
  const t = src.match(TITLE_RE);
  const title = t ? collapse(decodeEntities(t[1])) : "";
  return { title, pages };
}

// Deliberately wide (D-10): any Coca-Cola/Coke mention is a candidate, the
// matcher decides later. Bounded separator run keeps it linear.
export const COLA_RE = /coca[\s-]{0,3}cola|\bcoke\b/i;

// More Cola pages than this in one weekly leaflet means a bad parse.
export const MAX_COLA_PAGES = 8;

/**
 * Pick the leaflet pages worth downloading: those whose index text mentions
 * Coca-Cola/Coke. An empty result is valid (no Cola this week -> no_offer).
 * @param {Array<{ page: number, text: string }>} pages from parseIndex
 * @returns {number[]} unique ascending page numbers
 * @throws when more than MAX_COLA_PAGES pages match (implausible)
 */
export function colaPageNumbers(pages) {
  const hits = new Set();
  for (const p of pages ?? []) {
    if (COLA_RE.test(p?.text ?? "")) hits.add(p.page);
  }
  const out = [...hits].sort((a, b) => a - b);
  if (out.length > MAX_COLA_PAGES) {
    throw new Error("1kcloud index: implausible Cola page count");
  }
  return out;
}

// Glyphs at or above this font size are the big offer prices (32.6 integer
// part, 21.2 cents on the real leaflet); strike prices (11.0) stay below it.
export const PRICE_MIN_SIZE = 18;
const PRICE_TEXT_RE = /^\d{1,3}\.\d{2}$/;

// Attribute parsing is order-tolerant so a pdfminer upgrade that reorders
// font/bbox/size does not break the scanner.
function attrsOf(s) {
  const out = {};
  for (const m of s.matchAll(/(\w+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

// "x0,y0,x1,y1" -> [x0,y0,x1,y1] or null unless exactly 4 finite numbers.
function parseBbox(s) {
  if (typeof s !== "string") return null;
  const parts = s.split(",");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => (p.trim() === "" ? Number.NaN : Number(p)));
  return nums.every(Number.isFinite) ? nums : null;
}

const unionBbox = (a, b) =>
  a ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] : [...b];

/**
 * Reconstruct one pdfminer coords page into product textboxes and page-wide
 * price tokens.
 *
 * Big glyphs (size >= PRICE_MIN_SIZE) form "price runs"; a run that reads like
 * "8.99" becomes a price token and never enters box text (Pitfall 5 — pdfminer
 * sometimes merges the big price into the product line). Lines are joined with
 * one space, except after a trailing "<letter>-" where they are glued so
 * "Coca-"/"Cola" stays "Coca-Cola" for the matcher's one-separator brand gate
 * (Pitfall 3). NFKC turns ligatures (ﬂ -> fl) into plain letters.
 *
 * @param {string} xml pdfminer.six `pdf2txt -t xml` output of ONE page
 * @returns {{ width: number, height: number,
 *   boxes: Array<{ id: number, bbox: number[], text: string }>,
 *   priceTokens: Array<{ cents: number, bbox: number[] }> }}
 * @throws when the page element or every content textbox is missing
 */
export function reconstructPage(xml) {
  const src = lf(xml);

  const pageTag = src.match(/<page\b([^>]*)>/);
  const pageBbox = pageTag ? parseBbox(attrsOf(pageTag[1]).bbox) : null;
  if (!pageBbox) throw new Error("1kcloud coords: no page");
  const width = pageBbox[2] - pageBbox[0];
  const height = pageBbox[3] - pageBbox[1];

  const boxes = [];
  const priceTokens = [];
  let contentBoxes = 0;

  // Walk OPENING <textbox ...> tags; the trailing <layout> section repeats ids
  // as self-closing <textbox .../> elements, which carry no text and are skipped.
  const openRe = /<textbox\b([^>]*)>/g;
  let open;
  while ((open = openRe.exec(src)) !== null) {
    const rawAttrs = open[1];
    if (rawAttrs.trimEnd().endsWith("/")) continue; // self-closing layout ref
    const bodyStart = openRe.lastIndex;
    const bodyEnd = src.indexOf("</textbox>", bodyStart);
    if (bodyEnd === -1) break; // truncated document: nothing more to read
    openRe.lastIndex = bodyEnd + "</textbox>".length;
    contentBoxes += 1;

    const attrs = attrsOf(rawAttrs);
    const id = Number(attrs.id);
    const bbox = parseBbox(attrs.bbox);
    if (!Number.isInteger(id) || !bbox) continue; // malformed box: skip it

    const body = src.slice(bodyStart, bodyEnd);
    const lines = [];
    for (const lm of body.matchAll(/<textline\b[^>]*>([\s\S]*?)<\/textline>/g)) {
      let line = "";
      let run = null; // current big-glyph run { text, bbox }

      // Close the current big-glyph run: a price-shaped run becomes a page-wide
      // token; anything else (a big headline word) is kept as ordinary text.
      const closeRun = () => {
        if (!run) return;
        if (PRICE_TEXT_RE.test(run.text) && run.bbox) {
          priceTokens.push({ cents: Math.round(Number(run.text) * 100), bbox: run.bbox });
        } else {
          line += run.text;
        }
        run = null;
      };

      for (const tm of lm[1].matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)) {
        const ta = attrsOf(tm[1]);
        const c = decodeEntities(tm[2]);
        if (Number(ta.size) >= PRICE_MIN_SIZE) {
          run ??= { text: "", bbox: null };
          run.text += c;
          const cb = parseBbox(ta.bbox);
          if (cb) run.bbox = unionBbox(run.bbox, cb);
        } else {
          closeRun();
          if (c !== "\n") line += c;
        }
      }
      closeRun(); // a run may end the line
      const clean = collapse(line);
      if (clean) lines.push(clean);
    }

    // Join lines: glue after "<letter>-" (Pitfall 3), else one space.
    let text = "";
    for (const l of lines) {
      if (!text) text = l;
      else if (/[A-Za-zÄÖÜäöüß]-$/.test(text)) text += l;
      else text += ` ${l}`;
    }
    text = collapse(text.normalize("NFKC"));
    if (text) boxes.push({ id, bbox, text });
  }

  if (!contentBoxes) throw new Error("1kcloud coords: no textboxes");
  return { width, height, boxes, priceTokens };
}
