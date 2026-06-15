// web/src/format/format.js
// Pure de-DE display formatters (D-04). The scraper stores integer cents and
// ISO-UTC instants; this is the inverse on display. No DOM, no clock, no fetch —
// every function is a deterministic string transform, unit-locked in
// web/test/format.test.mjs.
//
// Two TZ rules:
//  - date-only values (YYYY-MM-DD) are already Berlin calendar days; we parse
//    them at UTC-noon and format in UTC so the rendered day can never drift.
//  - the file-level timestamp is an ISO-UTC instant; it is converted to
//    Europe/Berlin for display (D-17).

// de-DE Intl currency/number output separates the amount and the unit with a
// non-breaking space (U+00A0) — and newer ICU uses a narrow NBSP (U+202F) before
// units. The D-04 spec asserts plain ASCII spaces ("9,99 €"), so we normalize
// every NBSP variant to a regular space on the way out.
const normalizeSpaces = (s) => s.replace(/[  ]/g, " ");

const EUR = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

const PER_LITRE = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// Date-only formatters run in UTC against a UTC-noon Date (see dateOnlyToUtcNoon)
// so "2026-06-21" always renders as 21.06.2026 / "So" regardless of host TZ.
const DATE = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

const WEEKDAY = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  timeZone: "UTC",
});

const DAYMONTH = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "UTC",
});

// The file-level timestamp is displayed in Berlin wall-clock time (D-17).
const BERLIN_STAMP = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Berlin",
});

// Parse a "YYYY-MM-DD" Berlin calendar day into a Date pinned at UTC-noon. Noon
// keeps the calendar day stable under any +/- TZ shift the UTC formatters apply.
const dateOnlyToUtcNoon = (dateOnly) => new Date(`${dateOnly}T12:00:00Z`);

/**
 * Integer cents -> de-DE EUR string. `formatPrice(999) === "9,99 €"`.
 * @param {number} cents integer cents (D-09)
 * @returns {string}
 */
export function formatPrice(cents) {
  return normalizeSpaces(EUR.format(cents / 100));
}

/**
 * Integer cents/litre -> de-DE €/l string. `formatPerLitre(83) === "0,83 €/l"`.
 * @param {number} cents integer cents per litre (D-11)
 * @returns {string}
 */
export function formatPerLitre(cents) {
  return `${PER_LITRE.format(cents / 100)} €/l`;
}

/**
 * "YYYY-MM-DD" -> "TT.MM.JJJJ". `formatDate("2026-06-21") === "21.06.2026"`.
 * @param {string} dateOnly Berlin calendar day
 * @returns {string}
 */
export function formatDate(dateOnly) {
  return DATE.format(dateOnlyToUtcNoon(dateOnly));
}

/**
 * "YYYY-MM-DD" -> German short weekday, COMPUTED via Intl (never hardcoded).
 * `formatWeekdayShort("2026-06-21") === "So"` (the UI-SPEC's "Sa" is wrong).
 * @param {string} dateOnly Berlin calendar day
 * @returns {string}
 */
export function formatWeekdayShort(dateOnly) {
  return WEEKDAY.format(dateOnlyToUtcNoon(dateOnly));
}

/**
 * The "gültig bis {…}" tail: weekday + "TT.MM.".
 * `formatValidUntil("2026-06-21") === "So 21.06."`.
 * @param {string} dateOnly Berlin calendar day
 * @returns {string}
 */
export function formatValidUntil(dateOnly) {
  const d = dateOnlyToUtcNoon(dateOnly);
  // de-DE day/month already renders a trailing dot ("21.06."), so no extra one.
  return `${WEEKDAY.format(d)} ${DAYMONTH.format(d)}`;
}

/**
 * ISO-UTC instant -> Berlin de-DE stamp with " Uhr" (D-17).
 * `formatTimestamp("2026-06-15T04:00:00Z") === "15.06.2026 06:00 Uhr"`.
 * Built from formatToParts so the year-comma the locale inserts is dropped
 * deterministically rather than string-replaced.
 * @param {string} isoUtc full ISO-8601 UTC timestamp
 * @returns {string}
 */
export function formatTimestamp(isoUtc) {
  const parts = BERLIN_STAMP.formatToParts(new Date(isoUtc));
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "";
  const date = `${get("day")}.${get("month")}.${get("year")}`;
  const time = `${get("hour")}:${get("minute")}`;
  return `${date} ${time} Uhr`;
}
