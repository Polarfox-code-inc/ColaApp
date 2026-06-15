// web/test/format.test.mjs
// Locks every exact de-DE output string (D-04) so the render layer can rely on
// stable, locale-correct text. Pure formatters — no DOM, no clock. Includes the
// corrected Sunday weekday (the UI-SPEC's "Sa 21.06." is wrong; 2026-06-21 is "So").
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatPrice,
  formatPerLitre,
  formatDate,
  formatWeekdayShort,
  formatValidUntil,
  formatTimestamp,
} from "../src/format/format.js";

// --- formatPrice / formatPerLitre: integer cents -> de-DE comma decimals ---

test("formatPrice renders integer cents as a de-DE EUR string", () => {
  assert.equal(formatPrice(999), "9,99 €");
});

test("formatPrice keeps two decimals for whole-euro prices", () => {
  assert.equal(formatPrice(1000), "10,00 €");
});

test("formatPerLitre renders cents/litre as a de-DE €/l string", () => {
  assert.equal(formatPerLitre(83), "0,83 €/l");
});

// --- formatDate: YYYY-MM-DD -> TT.MM.JJJJ, no TZ drift ---

test("formatDate renders a date-only string as TT.MM.JJJJ", () => {
  assert.equal(formatDate("2026-06-21"), "21.06.2026");
});

test("formatDate does not drift across the day boundary", () => {
  // A date-only must format to itself regardless of the host timezone.
  assert.equal(formatDate("2026-01-01"), "01.01.2026");
  assert.equal(formatDate("2026-12-31"), "31.12.2026");
});

// --- formatWeekdayShort: computed via Intl, never hardcoded ---

test("formatWeekdayShort computes the German short weekday (2026-06-21 -> So)", () => {
  // UI-SPEC bug correction: 2026-06-21 is Sunday ("So"), not "Sa".
  assert.equal(formatWeekdayShort("2026-06-21"), "So");
});

test("formatWeekdayShort handles other weekdays via Intl", () => {
  assert.equal(formatWeekdayShort("2026-06-15"), "Mo"); // Monday
  assert.equal(formatWeekdayShort("2026-06-20"), "Sa"); // Saturday
});

// --- formatValidUntil: weekday + TT.MM. for the "gültig bis {…}" line ---

test("formatValidUntil composes the corrected weekday with TT.MM.", () => {
  assert.equal(formatValidUntil("2026-06-21"), "So 21.06.");
});

// --- formatTimestamp: ISO-UTC -> Berlin de-DE, comma stripped, ' Uhr' appended ---

test("formatTimestamp renders an ISO-UTC instant in Berlin time with ' Uhr'", () => {
  assert.equal(formatTimestamp("2026-06-15T04:00:00Z"), "15.06.2026 06:00 Uhr");
});

test("formatTimestamp converts to Europe/Berlin (CEST +2), not UTC", () => {
  // 22:00Z is 00:00 the NEXT Berlin day.
  assert.equal(formatTimestamp("2026-06-14T22:00:00Z"), "15.06.2026 00:00 Uhr");
});
