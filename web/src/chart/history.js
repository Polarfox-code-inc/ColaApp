// web/src/chart/history.js
// Price-history chart (HIST-01/02/03). Two halves:
//   1. PURE data-prep — parseHistoryJsonl + prepareChartData. Turns each offer in
//      the append-only JSONL history into a FLAT PRICE SEGMENT spanning its
//      validity window (validFrom→validTo) on a single shared x-axis, one y-series
//      per LINE-store. A store's series carries the offer price at every x inside
//      one of its windows and `null` everywhere else. With uPlot's spanGaps:false
//      that paints a horizontal line for the whole week an offer is valid (its
//      DURATION) and BREAKS between distinct offers — never interpolating a price
//      that never existed (RESEARCH Pitfall 3 / HIST-02). To keep two back-to-back
//      offers of the same store from joining into one sloped line, a one-second
//      sentinel after each offer's validTo forces a null between them. Wasgau is
//      the 5th line, fed by its weekly leaflet source since Phase 5 (D-16); it is
//      dropped only while its kill switch is on, i.e. current-offers reports
//      Wasgau status "unavailable" (D-04). This half is unit-locked in
//      web/test/chart.test.mjs.
//   2. renderHistory — the uPlot rendering that encodes the gap rule, per-store
//      palette, the kill-switch-aware legend and the cold-start panel.
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
 * The five stores that get a chart line. Wasgau is fed by its leaflet source
 * since Phase 5 (D-16); its line simply stays empty until a clean (non-review)
 * offer lands in the history. It is excluded only while the Wasgau kill switch
 * is on — see lineStores().
 * @type {ReadonlyArray<'REWE'|'Edeka'|'Lidl'|'Kaufland'|'Wasgau'>}
 */
export const STORES_WITH_LINES = ["REWE", "Edeka", "Lidl", "Kaufland", "Wasgau"];

const WASGAU = "Wasgau";

/**
 * The line-stores for the current kill-switch state. With the Wasgau kill switch
 * on (current-offers status "unavailable", D-04) Wasgau has no line and the
 * chart falls back to the four other stores.
 * @param {boolean} [wasgauUnavailable=false]
 * @returns {ReadonlyArray<string>}
 */
export function lineStores(wasgauUnavailable = false) {
  return wasgauUnavailable
    ? STORES_WITH_LINES.filter((s) => s !== WASGAU)
    : STORES_WITH_LINES;
}

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

// Epoch SECONDS at UTC midnight of a YYYY-MM-DD (uPlot time scale wants seconds).
const daySeconds = (d) => Date.parse(`${d}T00:00:00Z`) / 1000;

// One-second sentinel placed just after each offer's validTo. It guarantees a
// null x between two back-to-back offers of the SAME store, so spanGaps:false
// breaks them instead of joining their prices with a misleading slope (HIST-02).
const GAP_SECONDS = 1;

/**
 * Turn each offer into a flat price segment spanning its validity window, on a
 * single shared x-axis, one y-series per line-store. A store's value at x is the
 * offer price when x lies inside one of that store's [validFrom, validTo] windows,
 * else `null` — so spanGaps:false draws a horizontal line for the offer's whole
 * valid week and breaks between distinct offers (never interpolated).
 *
 * @param {import('../../../contract/types.d.ts').HistoryLine[]} historyLines
 * @param {{ wasgauUnavailable?: boolean }} [options] kill switch on => no Wasgau line
 * @returns {{
 *   data: (number[] | (number|null)[])[],  // [xSeconds, ...one series per line-store]
 *   x: number[],                            // shared epoch-seconds axis (empty => cold start)
 *   stores: ReadonlyArray<string>,          // lineStores(wasgauUnavailable), in order
 *   offerCounts: Record<string, number>,    // offers (segments) per store
 *   isEmpty: boolean,                       // true => renderHistory shows the cold-start panel
 * }}
 */
export function prepareChartData(historyLines, { wasgauUnavailable = false } = {}) {
  const stores = lineStores(wasgauUnavailable);
  // Collect each line-store's offer windows. Stores outside `stores` (Wasgau under
  // the kill switch, unknown names) never become a series and never widen the
  // x-axis; a row missing its validity window is skipped.
  const offersByStore = new Map(stores.map((s) => [s, []]));
  for (const l of historyLines) {
    const offers = offersByStore.get(l.store);
    if (!offers || !l.validFrom || !l.validTo) continue;
    offers.push({
      from: daySeconds(l.validFrom),
      to: daySeconds(l.validTo),
      price: l.price / 100,
    });
  }

  // Shared x-axis: every offer's validFrom + validTo, plus a (validTo + sentinel)
  // break point so adjacent same-store offers stay separated.
  const xs = new Set();
  for (const offers of offersByStore.values()) {
    for (const o of offers) {
      xs.add(o.from);
      xs.add(o.to);
      xs.add(o.to + GAP_SECONDS);
    }
  }
  const x = [...xs].sort((a, b) => a - b);

  const offerCounts = {};
  const series = stores.map((store) => {
    const offers = offersByStore.get(store);
    offerCounts[store] = offers.length;
    // Offer price where x is inside a window, else null (broken line — no interpolation).
    return x.map((t) => {
      const o = offers.find((win) => t >= win.from && t <= win.to);
      return o ? o.price : null;
    });
  });

  return {
    data: [x, ...series],
    x,
    stores,
    offerCounts,
    isEmpty: x.length === 0,
  };
}

// --- Rendering half (renderHistory) -----------------------------------------

const CHART_HEIGHT = 240;

// Stable per-store line palette (UI-SPEC; D-12). Chosen for legibility on white
// and for red/green-deficiency distinguishability (each pair also differs in
// lightness; markers double-encode by shape). Wasgau (D-16) is teal — distinct
// from the four store colours and from the amber warning token #9a5b00.
const LINE_COLORS = {
  REWE: "#C2143C", // red
  Edeka: "#1B5FB0", // blue
  Lidl: "#0B7A3B", // green
  Kaufland: "#7A3FB0", // violet
  Wasgau: "#00838F", // teal
};

/**
 * What the legend shows for the current kill-switch state: one colour swatch per
 * line-store, plus (only while the Wasgau kill switch is on) the greyed Wasgau
 * item explaining why it has no line (D-04). Pure — renderLegend just draws it.
 * @param {{ wasgauUnavailable?: boolean }} [options]
 * @returns {{ swatches: { store: string, color: string }[], greyedWasgau: boolean }}
 */
export function legendModel({ wasgauUnavailable = false } = {}) {
  return {
    swatches: lineStores(wasgauUnavailable).map((store) => ({
      store,
      color: LINE_COLORS[store],
    })),
    greyedWasgau: wasgauUnavailable,
  };
}

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
 *  - spanGaps:false -> a null breaks the line, NEVER interpolated (HIST-02 /
 *    D-13-graph). Combined with the per-offer windows + sentinel from
 *    prepareChartData, each offer paints a flat segment over its valid week and
 *    distinct offers stay broken apart.
 *  - points always shown so a one-day offer (validFrom == validTo) is still
 *    visible as a marker rather than a zero-length, invisible segment.
 *  - Wasgau's markers are solid-filled so the 5th line is distinguishable by more
 *    than hue alone (D-16).
 * @param {string} store
 * @param {string} color
 */
function seriesFor(store, color) {
  const points = { show: true, size: 6 };
  if (store === WASGAU) points.fill = color;
  return {
    label: store,
    stroke: color,
    width: 3,
    spanGaps: false, // null => broken line, NO interpolation (HIST-02 / D-13-graph)
    points,
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

// Build the legend below the chart from legendModel(): one colour swatch per
// line-store, then — only while the Wasgau kill switch is on — Wasgau greyed/
// struck with the "nicht automatisch verfügbar" note (D-04).
function renderLegend(container, model) {
  const legend = document.createElement("ul");
  legend.className = "chart-legend";

  for (const { store, color } of model.swatches) {
    const item = document.createElement("li");
    item.className = "chart-legend__item";

    const swatch = document.createElement("span");
    swatch.className = "chart-legend__swatch";
    swatch.style.backgroundColor = color;
    swatch.setAttribute("aria-hidden", "true");

    const name = document.createElement("span");
    name.textContent = store;

    item.appendChild(swatch);
    item.appendChild(name);
    legend.appendChild(item);
  }

  // Kill switch on: Wasgau greyed, struck name + the explanatory note (no swatch).
  if (model.greyedWasgau) {
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
  }

  container.appendChild(legend);
}

/**
 * Render the price-history chart into `container`. Reads the prepared data; on a
 * cold start (no offers) it renders the honest "Noch keine Daten" panel and returns
 * WITHOUT constructing uPlot (Pitfall 8 — an empty axis looks broken). Otherwise
 * it builds one flat-segment line per store with the gap rule, the kill-switch-
 * aware legend, and a ResizeObserver that keeps the canvas the width of its container.
 *
 * uPlot and its CSS are imported lazily here (see top-of-file note) so this
 * module stays Node-loadable for the pure data-prep tests. The cold-start path
 * returns BEFORE importing uPlot at all — an empty graph needs no chart library.
 *
 * @param {HTMLElement} container target element (its width drives the chart width)
 * @param {import('../../../contract/types.d.ts').HistoryLine[]} historyLines
 * @param {{ wasgauUnavailable?: boolean }} [options] Wasgau kill switch on (D-04);
 *   series and legend read the same flag so they can never disagree
 * @returns {Promise<import('uplot').default | null>} the uPlot instance, or null on cold start
 */
export async function renderHistory(container, historyLines, { wasgauUnavailable = false } = {}) {
  const { data, stores, isEmpty } = prepareChartData(historyLines, { wasgauUnavailable });

  // Cold start: no offers yet. Honest empty panel, no hollow uPlot axis.
  // Returns before any uPlot/CSS import is even evaluated (Pitfall 8).
  if (isEmpty) {
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
      ...stores.map((store) => seriesFor(store, LINE_COLORS[store])),
    ],
  };

  const plot = new uPlot(opts, data, container);

  renderLegend(container, legendModel({ wasgauUnavailable }));

  // Keep the canvas the width of its container as the viewport changes.
  const resize = new ResizeObserver(() => {
    plot.setSize({ width: container.clientWidth, height: CHART_HEIGHT });
  });
  resize.observe(container);

  return plot;
}
