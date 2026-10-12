// scraper/wasgau/dates.mjs
//
// Validity windows for Wasgau leaflet offers (Phase 5, D-08).
// Pure + clock-free: no I/O, no logging, no `new Date()` of "now".
//
// The leaflet states its window in German prose ("GÜLTIG VOM 12. BIS 17.
// OKTOBER 2026"). These are already Berlin CALENDAR dates, so all math uses
// Date.UTC/getUTC* and the output is a plain "YYYY-MM-DD" — never a UTC slice of
// a local Date.
//
// Plan 05-01 handles the leaflet level (word-month with explicit year);
// Plan 05-04 adds box/page-level windows and the numeric family to
// resolveWindow/parseWindow without changing their signatures.
//
// SECURITY (T-05-02, ReDoS): bounded quantifiers only.
//
// Node 22+, no new dependencies.

// German month by 3-letter prefix (also "mae" for the ASCII "Maerz" spelling).
const MONTHS = {
  jan: 1, feb: 2, mär: 3, mae: 3, mar: 3, apr: 4, mai: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, okt: 10, nov: 11, dez: 12,
};
const monthOf = (word) => (word ? MONTHS[word.slice(0, 3)] ?? null : null);

// "[gültig] vom [weekday] D. [month [YYYY]] bis [weekday] D. month YYYY"
// (lowercased input). The optional weekday word and from-month are bounded.
const WORD_MONTH_RE =
  /(?:gültig\s{1,3})?vom\s{1,3}(?:[a-zäöü]{2,10}\s{1,3})?(\d{1,2})\.\s{0,3}(?:([a-zäöü]{3,9})\s{0,3}(\d{4})?\s{0,3})?bis\s{1,3}(?:[a-zäöü]{2,10}\s{1,3})?(\d{1,2})\.\s{0,3}([a-zäöü]{3,9})\s{0,3}(\d{4})/u;

const MAX_WINDOW_DAYS = 31;
const DAY_MS = 86_400_000;

// UTC epoch-ms of a calendar date, or null when the date does not exist.
function utcDate(y, m, d) {
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

/**
 * Parse a German validity phrase into a calendar window.
 * @param {string} text NFKC box/page text
 * @param {{ refDate?: string }} [opts] reserved for year inference (Plan 05-04)
 * @returns {{ from: string, to: string } | null} null when unmatched, inverted,
 *   or longer than 31 days
 */
export function parseWindow(text, { refDate } = {}) {
  const m = String(text ?? "").toLowerCase().replace(/\s+/g, " ").match(WORD_MONTH_RE);
  if (!m) return null;
  const [, fromDayS, fromMonthW, fromYearS, toDayS, toMonthW, toYearS] = m;
  const fromDay = Number(fromDayS);
  const toDay = Number(toDayS);
  const toMonth = monthOf(toMonthW);
  const toYear = Number(toYearS);
  if (!toMonth) return null;

  let fromMonth;
  let fromYear = fromYearS ? Number(fromYearS) : toYear;
  if (fromMonthW) {
    fromMonth = monthOf(fromMonthW);
    if (!fromMonth) return null;
    // "28. Dezember bis 3. Januar 2027": an explicit later from-month without
    // its own year belongs to the previous year.
    if (!fromYearS && fromMonth > toMonth) fromYear -= 1;
  } else {
    // A missing from-month inherits the to-month, stepping back one month when
    // the from-day lies after the to-day ("VOM 28. BIS 3. OKTOBER").
    fromMonth = toMonth;
    if (fromDay > toDay) {
      fromMonth -= 1;
      if (fromMonth === 0) {
        fromMonth = 12;
        fromYear -= 1;
      }
    }
  }

  const from = utcDate(fromYear, fromMonth, fromDay);
  const to = utcDate(toYear, toMonth, toDay);
  if (from === null || to === null || to < from) return null;
  if ((to - from) / DAY_MS > MAX_WINDOW_DAYS) return null;
  return { from: iso(from), to: iso(to) };
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
 * The validity window that applies to one candidate box. Signature is final;
 * Plan 05-04 adds the box-level and page-top-band levels before this fallback.
 * @param {{ text: string, bbox: number[] }} box candidate box
 * @param {{ height: number, boxes: Array<object> }} page reconstructed page
 * @param {{ from: string, to: string }} leafletWindow leaflet-wide window
 * @returns {{ from: string, to: string, source: "box"|"page"|"leaflet" }}
 */
export function resolveWindow(box, page, leafletWindow) {
  return { from: leafletWindow.from, to: leafletWindow.to, source: "leaflet" };
}
