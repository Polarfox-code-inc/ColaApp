// scraper/wasgau/dates.mjs
//
// Validity windows for Wasgau leaflet offers (Phase 5, D-08).
// Pure + clock-free: no I/O, no logging, no `new Date()` of "now".
//
// The leaflet states its windows in German prose: "GÜLTIG VOM 12. BIS 17.
// OKTOBER 2026" (leaflet header), "VOM DONNERSTAG 15. BIS SAMSTAG 17. OKTOBER"
// (page header, often letter-spaced by the PDF text layer) or "Donnerstag
// 15.10. bis Samstag 17.10." (numeric). These are already Berlin CALENDAR
// dates, so all math uses Date.UTC/getUTC* and the output is a plain
// "YYYY-MM-DD" — never a UTC slice of a local Date.
//
// D-08 precedence (resolveWindow): a window in the candidate's OWN box wins,
// else a window in a page TOP-BAND box, else the leaflet-wide window. Boxes in
// the middle of a page never set a window (Pitfall 6: the p1 app-coupon
// "Donnerstag 15.10. bis Samstag 17.10." applies to the coupon only).
//
// SECURITY (T-05-02 / T-05-11, ReDoS): bounded quantifiers only; whitespace
// compaction is a single linear replace.
//
// Node 22+, no new dependencies.

// German month by 3-letter prefix (also "mae" for the ASCII "Maerz" spelling).
const MONTHS = {
  jan: 1, feb: 2, mär: 3, mae: 3, mar: 3, apr: 4, mai: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, okt: 10, nov: 11, dez: 12,
};
const monthOf = (word) => (word ? MONTHS[word.slice(0, 3)] ?? null : null);

// Page top band for window headers, as a fraction of page height (y grows
// upward in pdfminer coords, so the top band is bbox y0 >= ratio * height).
// Measured on the real 2026-10-12 leaflet: window headers sit at p24 0.966,
// p25 0.967 and p26 0.844 (the letter-spaced weekend header below "ENDLICH
// WOCHENENDE"); boxes that must stay OUT sit at p1 0.706 (app coupon) and p8
// 0.642 (monthly "GÜLTIG VOM 1. BIS 31. OKTOBER"). RESEARCH's 0.9 would miss
// the real p26 header, so 0.8 sits between both groups.
export const TOP_BAND_RATIO = 0.8;

// Both patterns run on lowercased text, once whitespace-collapsed and once with
// ALL whitespace removed (letter-spaced headers such as "VO N D O N N E R STAG
// 1 5. O KTO B E R"), so every separator is \s{0,3}.
//
// Word-month: "[gültig] vom|von [weekday] D. [month [YYYY]] bis [weekday] D.
// month [YYYY]". Groups: fromDay, fromMonth, fromYear, toDay, toMonth, toYear.
const WORD_MONTH_RE =
  /(?:gültig\s{0,3})?vo[mn]\s{0,3}(?:[a-zäöü]{2,10}\s{0,3})?(\d{1,2})\.\s{0,3}(?:([a-zäöü]{3,9})\s{0,3}(?:(\d{4})\s{0,3})?)?bis\s{0,3}(?:[a-zäöü]{2,10}\s{0,3})?(\d{1,2})\.\s{0,3}([a-zäöü]{3,9})(?:\s{0,3}(\d{4}))?/u;

// Numeric: "D.M.[YY|YYYY] bis|–|- [weekday] D.M.[YY|YYYY]".
// Groups: fromDay, fromMonth, fromYear, toDay, toMonth, toYear.
const NUMERIC_RE =
  /(?<!\d)(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})?\s{0,3}(?:bis|–|—|-)\s{0,3}(?:[a-zäöü]{2,10}\s{0,3})?(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})?/u;

const MAX_WINDOW_DAYS = 31;
const DAY_MS = 86_400_000;

// UTC epoch-ms of a calendar date, or null when the date does not exist.
function utcDate(y, m, d) {
  if (!(m >= 1 && m <= 12)) return null;
  const t = Date.UTC(y, m - 1, d);
  const dt = new Date(t);
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
    ? t
    : null;
}

const iso = (t) => {
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
};

// "26" -> 2026, "2026" -> 2026, absent -> null.
const yearOf = (s) => (s ? (s.length === 2 ? 2000 + Number(s) : Number(s)) : null);

// refDate "YYYY-MM-DD" -> epoch-ms, or null.
function refOf(refDate) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(refDate ?? ""));
  return m ? utcDate(Number(m[1]), Number(m[2]), Number(m[3])) : null;
}

/**
 * Turn raw window parts into a validated calendar window.
 * fromMonth may be null (inherits the to-month); years may be null (taken
 * from the other side, else inferred from refDate).
 */
function finish({ fromDay, fromMonth, fromYear, toDay, toMonth, toYear }, refDate) {
  if (!toMonth) return null;
  if (fromMonth === null) {
    // A missing from-month inherits the to-month, stepping back one month when
    // the from-day lies after the to-day ("VOM 28. BIS 3. OKTOBER").
    fromMonth = fromDay > toDay ? toMonth - 1 || 12 : toMonth;
  }
  if (!fromMonth) return null;
  // A from-month later than the to-month means the window crosses New Year
  // ("28. Dezember bis 3. Januar 2027", "29.12. bis 3.1.").
  const crossesYear = fromMonth > toMonth ? 1 : 0;

  if (fromYear === null && toYear !== null) fromYear = toYear - crossesYear;
  else if (toYear === null && fromYear !== null) toYear = fromYear + crossesYear;
  else if (fromYear === null && toYear === null) {
    // No year at all: pick the from-year in {Y-1, Y, Y+1} whose date lies
    // closest to the reference day (the leaflet window start).
    const ref = refOf(refDate);
    if (ref === null) return null;
    const y = new Date(ref).getUTCFullYear();
    let best = null;
    for (const cand of [y - 1, y, y + 1]) {
      const t = utcDate(cand, fromMonth, fromDay);
      if (t === null) continue;
      if (best === null || Math.abs(t - ref) < Math.abs(best.t - ref)) best = { year: cand, t };
    }
    if (!best) return null;
    fromYear = best.year;
    toYear = fromYear + crossesYear;
  }

  const from = utcDate(fromYear, fromMonth, fromDay);
  const to = utcDate(toYear, toMonth, toDay);
  if (from === null || to === null || to < from) return null;
  if ((to - from) / DAY_MS > MAX_WINDOW_DAYS) return null;
  return { from: iso(from), to: iso(to) };
}

function parseWordMonth(s, refDate) {
  const m = s.match(WORD_MONTH_RE);
  if (!m) return null;
  const [, fromDayS, fromMonthW, fromYearS, toDayS, toMonthW, toYearS] = m;
  const fromMonth = fromMonthW ? monthOf(fromMonthW) : null;
  if (fromMonthW && !fromMonth) return null; // unknown month word
  return finish(
    {
      fromDay: Number(fromDayS),
      fromMonth,
      fromYear: yearOf(fromYearS),
      toDay: Number(toDayS),
      toMonth: monthOf(toMonthW),
      toYear: yearOf(toYearS),
    },
    refDate
  );
}

function parseNumeric(s, refDate) {
  const m = s.match(NUMERIC_RE);
  if (!m) return null;
  const [, fromDayS, fromMonthS, fromYearS, toDayS, toMonthS, toYearS] = m;
  const fromMonth = Number(fromMonthS);
  const toMonth = Number(toMonthS);
  // Month 0 (glyph dropout, "2.0. – 7.0.2026") or 13+ is no window.
  if (fromMonth < 1 || fromMonth > 12 || toMonth < 1 || toMonth > 12) return null;
  return finish(
    {
      fromDay: Number(fromDayS),
      fromMonth,
      fromYear: yearOf(fromYearS),
      toDay: Number(toDayS),
      toMonth,
      toYear: yearOf(toYearS),
    },
    refDate
  );
}

/**
 * Parse a German validity phrase into a calendar window.
 * Tries word-month then numeric on the whitespace-collapsed text, then both
 * again on the whitespace-free text (letter-spaced headers).
 * @param {string} text box/page text
 * @param {{ refDate?: string }} [opts] "YYYY-MM-DD" used to infer missing years
 * @returns {{ from: string, to: string } | null} null when unmatched, invalid,
 *   inverted, or longer than 31 days
 */
export function parseWindow(text, { refDate } = {}) {
  const lower = String(text ?? "").normalize("NFKC").toLowerCase();
  for (const s of [lower.replace(/\s+/g, " "), lower.replace(/\s+/g, "")]) {
    const win = parseWordMonth(s, refDate) ?? parseNumeric(s, refDate);
    if (win) return win;
  }
  return null;
}

/**
 * The leaflet-wide window from page 1's index text (D-08 leaflet level).
 * @param {Array<{ page: number, text: string }>} pages from parseIndex
 * @returns {{ from: string, to: string }}
 * @throws when page 1 is missing or carries no parsable window
 */
export function leafletWindowFromIndex(pages) {
  const first = (pages ?? []).find((p) => p?.page === 1);
  const win = first ? parseWindow(first.text) : null;
  if (!win) throw new Error("1kcloud index: no leaflet validity window on page 1");
  return win;
}

/**
 * The validity window that applies to one candidate box (D-08):
 * own box text > page top-band box > leaflet window.
 * @param {{ text: string, bbox: number[] }} box candidate box
 * @param {{ height: number, boxes: Array<{ id: number, bbox: number[], text: string }> }} page
 *   reconstructed page
 * @param {{ from: string, to: string }} leafletWindow leaflet-wide window
 * @returns {{ from: string, to: string, source: "box"|"page"|"leaflet" }}
 */
export function resolveWindow(box, page, leafletWindow) {
  const refDate = leafletWindow.from;

  const own = parseWindow(box?.text, { refDate });
  if (own) return { ...own, source: "box" };

  // Top band only, scanned from the top of the page down (descending y0, then
  // box id for determinism). A missing height disables this level.
  const bandY = TOP_BAND_RATIO * (page?.height ?? Infinity);
  const top = (page?.boxes ?? [])
    .filter((b) => b.bbox[1] >= bandY)
    .sort((a, b) => b.bbox[1] - a.bbox[1] || a.id - b.id);
  for (const b of top) {
    const win = parseWindow(b.text, { refDate });
    if (win) return { ...win, source: "page" };
  }

  return { from: leafletWindow.from, to: leafletWindow.to, source: "leaflet" };
}
