// web/src/chart/history.js
// Price-history chart (HIST-01/02/03). Two halves:
//   1. PURE data-prep — parseHistoryJsonl + prepareChartData. Aligns the
//      append-only JSONL history lines to a single shared date x-axis with one
//      y-series per LINE-store, inserting `null` (NOT a value) wherever a store
//      has no observation on a date. Those nulls are the honesty mechanism:
//      with uPlot's spanGaps:false they break the line instead of interpolating
//      a price that never existed (RESEARCH Pitfall 3 / HIST-02). Wasgau is never
//      a series — it has no automatic data source (D-12 / HIST-03). This half is
//      unit-locked in web/test/chart.test.mjs.
//   2. renderHistory (added in the second task) — the uPlot rendering that
//      encodes the gap/markers rules, palette, legend and cold-start panel.
//
// Price math: history `price` is integer cents (D-09); the chart axis is euros,
// so each value is price/100. The x-axis is epoch SECONDS at UTC midnight of each
// Berlin calendar day — uPlot's time scale wants seconds, and midnight-UTC keeps
// the tick on the correct calendar day for the de-DE day/month formatter.

/**
 * The four stores that get a chart line. Wasgau is INTENTIONALLY absent: it has
 * no automatic data source, so it never becomes a series (D-12 / HIST-03). The
 * legend still lists it, greyed, in renderHistory.
 * @type {ReadonlyArray<'REWE'|'Edeka'|'Lidl'|'Kaufland'>}
 */
export const STORES_WITH_LINES = ["REWE", "Edeka", "Lidl", "Kaufland"];

/**
 * Parse the append-only price-history JSONL text into HistoryLine objects.
 * Splits on newlines, drops empty/whitespace-only lines (so a trailing newline
 * or stray blank line is harmless), and JSON.parses each remaining line.
 * @param {string} text raw contents of data/price-history.jsonl
 * @returns {import('../../../contract/types.d.ts').HistoryLine[]}
 */
export function parseHistoryJsonl(text) {
  if (!text) return [];
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

/**
 * Align history lines to a shared sorted date axis with one y-series per
 * line-store and `null` gaps where a store has no observation on a date.
 *
 * @param {import('../../../contract/types.d.ts').HistoryLine[]} historyLines
 * @returns {{
 *   data: (number[] | (number|null)[])[],  // [xSeconds, ...one series per STORES_WITH_LINES]
 *   dates: string[],                        // unique sorted YYYY-MM-DD (empty => cold start)
 *   stores: typeof STORES_WITH_LINES,       // the four line-stores, in order (no Wasgau)
 *   pointCounts: Record<string, number>,    // non-null observations per store
 * }}
 */
export function prepareChartData(historyLines) {
  // Unique observation dates, ascending. ISO YYYY-MM-DD sorts lexically === chronologically.
  const dates = [...new Set(historyLines.map((l) => l.date))].sort();
  // x-axis: epoch SECONDS at UTC midnight of each date (uPlot time scale wants seconds).
  const x = dates.map((d) => Date.parse(`${d}T00:00:00Z`) / 1000);

  const pointCounts = {};
  const series = STORES_WITH_LINES.map((store) => {
    // date -> euro price for this store only.
    const byDate = new Map(
      historyLines
        .filter((l) => l.store === store)
        .map((l) => [l.date, l.price / 100]),
    );
    pointCounts[store] = byDate.size;
    // null where the store has no observation => a broken line, never interpolated.
    return dates.map((d) => (byDate.has(d) ? byDate.get(d) : null));
  });

  return {
    data: [x, ...series],
    dates,
    stores: STORES_WITH_LINES,
    pointCounts,
  };
}
