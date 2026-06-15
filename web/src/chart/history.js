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
//   2. renderHistory — the uPlot rendering that encodes the gap/markers rules,
//      per-store palette, the Wasgau-aware legend and the cold-start panel.
//
// Price math: history `price` is integer cents (D-09); the chart axis is euros,
// so each value is price/100. The x-axis is epoch SECONDS at UTC midnight of each
// Berlin calendar day — uPlot's time scale wants seconds, and midnight-UTC keeps
// the tick on the correct calendar day for the de-DE day/month formatter.
//
// uPlot (and its CSS) are loaded LAZILY inside renderHistory via dynamic import,
// NOT at module top level. That keeps this module pure-Node-loadable so the
// data-prep unit tests can `import` it under bare `node --test` (Node cannot
// resolve the `.css` import or the canvas-touching uPlot bundle; Vite resolves
// both fine and still code-splits the dynamic import into the browser build).

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

// --- Rendering half (renderHistory) -----------------------------------------

const CHART_HEIGHT = 240;

// Stable per-store line palette (UI-SPEC; D-12). Chosen for legibility on white
// and for red/green-deficiency distinguishability (each pair also differs in
// lightness; markers double-encode by shape). Wasgau has NO colour — no line.
const LINE_COLORS = {
  REWE: "#C2143C", // red
  Edeka: "#1B5FB0", // blue
  Lidl: "#0B7A3B", // green
  Kaufland: "#7A3FB0", // violet
};

// All five stores appear in the legend; Wasgau is greyed with an explanatory
// note so its absence from the chart is explained, never silently missing (D-12).
const WASGAU = "Wasgau";

// de-DE axis formatters. x ticks are epoch seconds -> "TT.MM."; y ticks are euros
// rendered with a comma decimal + " €" (matches the rest of the de-DE display).
const X_TICK = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
});
const formatXTick = (t) => X_TICK.format(t * 1000);
const formatYTick = (v) => `${v.toFixed(2).replace(".", ",")} €`;

/**
 * One uPlot series for a line-store. Honesty rules live here:
 *  - spanGaps:false -> a null breaks the line, NEVER interpolated (D-13-graph).
 *  - paths:()=>null when the store has <3 points -> markers only, no connecting
 *    line (a 1–2-point "trend" would be misleading). >=3 points -> default line.
 *  - points always shown so even single observations are visible.
 * @param {string} store
 * @param {string} color
 * @param {number} pointCount
 */
function seriesFor(store, color, pointCount) {
  return {
    label: store,
    stroke: color,
    width: 2,
    spanGaps: false, // null => broken line, NO interpolation (HIST-02 / D-13-graph)
    paths: pointCount < 3 ? () => null : undefined, // <3 points: markers only
    points: { show: true, size: 7 },
  };
}

// Build the cold-start panel (0 history points) with the UI-SPEC copy. DOM is
// built via createElement/textContent only — never innerHTML — so the chart
// surface can never become an HTML-injection sink (T-03-06 / ASVS V5).
function renderColdStart(container) {
  const panel = document.createElement("div");
  panel.className = "chart-empty";

  const heading = document.createElement("p");
  heading.className = "chart-empty__title";
  heading.textContent = "Noch keine Daten";

  const body = document.createElement("p");
  body.className = "chart-empty__body";
  body.textContent = "Sobald Preise gesammelt sind, erscheint hier der Verlauf.";

  panel.appendChild(heading);
  panel.appendChild(body);
  container.appendChild(panel);
}

// Build the legend below the chart: all four line-stores with a colour swatch,
// then Wasgau greyed/struck with the "nicht automatisch verfügbar" note (D-12).
function renderLegend(container) {
  const legend = document.createElement("ul");
  legend.className = "chart-legend";

  for (const store of STORES_WITH_LINES) {
    const item = document.createElement("li");
    item.className = "chart-legend__item";

    const swatch = document.createElement("span");
    swatch.className = "chart-legend__swatch";
    swatch.style.backgroundColor = LINE_COLORS[store];
    swatch.setAttribute("aria-hidden", "true");

    const name = document.createElement("span");
    name.textContent = store;

    item.appendChild(swatch);
    item.appendChild(name);
    legend.appendChild(item);
  }

  // Wasgau: greyed, struck name + the explanatory note (no swatch colour).
  const wasgau = document.createElement("li");
  wasgau.className = "chart-legend__item chart-legend__item--unavailable";

  const wasgauName = document.createElement("span");
  wasgauName.className = "chart-legend__name--struck";
  wasgauName.textContent = WASGAU;

  const wasgauNote = document.createElement("span");
  wasgauNote.className = "chart-legend__note";
  wasgauNote.textContent = "nicht automatisch verfügbar";

  wasgau.appendChild(wasgauName);
  wasgau.appendChild(wasgauNote);
  legend.appendChild(wasgau);

  container.appendChild(legend);
}

/**
 * Render the price-history chart into `container`. Reads the prepared data; on a
 * cold start (0 dates) it renders the honest "Noch keine Daten" panel and returns
 * WITHOUT constructing uPlot (Pitfall 8 — an empty axis looks broken). Otherwise
 * it builds one line per store with the gap/markers rules, the Wasgau-aware
 * legend, and a ResizeObserver that keeps the canvas the width of its container.
 *
 * uPlot and its CSS are imported lazily here (see top-of-file note) so this
 * module stays Node-loadable for the pure data-prep tests. The cold-start path
 * returns BEFORE importing uPlot at all — an empty graph needs no chart library.
 *
 * @param {HTMLElement} container target element (its width drives the chart width)
 * @param {import('../../../contract/types.d.ts').HistoryLine[]} historyLines
 * @returns {Promise<import('uplot').default | null>} the uPlot instance, or null on cold start
 */
export async function renderHistory(container, historyLines) {
  const { data, dates, stores, pointCounts } = prepareChartData(historyLines);

  // Cold start: no observations yet. Honest empty panel, no hollow uPlot axis.
  // Returns before any uPlot/CSS import is even evaluated (Pitfall 8).
  if (dates.length === 0) {
    renderColdStart(container);
    return null;
  }

  // Lazy-load the chart library + its stylesheet only when there's data to draw.
  const { default: uPlot } = await import("uplot");
  await import("uplot/dist/uPlot.min.css");

  const opts = {
    width: container.clientWidth,
    height: CHART_HEIGHT,
    scales: { x: { time: true } },
    axes: [
      { values: (u, ticks) => ticks.map(formatXTick) },
      { values: (u, ticks) => ticks.map(formatYTick) },
    ],
    series: [
      {}, // x series placeholder (uPlot convention)
      ...stores.map((store) =>
        seriesFor(store, LINE_COLORS[store], pointCounts[store]),
      ),
    ],
  };

  const plot = new uPlot(opts, data, container);

  renderLegend(container);

  // Keep the canvas the width of its container as the viewport changes.
  const resize = new ResizeObserver(() => {
    plot.setSize({ width: container.clientWidth, height: CHART_HEIGHT });
  });
  resize.observe(container);

  return plot;
}
