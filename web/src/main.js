// web/src/main.js
// The PWA entry / orchestrator (the consumer-side analog of scraper/index.mjs).
// It captures `now` ONCE, loads the three data files, derives every view from the
// pure Plan-02 layer threading that single `now`/`today`, and renders the four
// sections top→bottom: hero → 5 cards → price-history graph → freshness footer
// (D-02). The whole flow is wrapped so a load-level failure degrades to honest
// per-store error states and a cold-start graph — never a white screen (T-03-08 /
// ASVS V7).
//
// Clock discipline (RESEARCH Pattern 4): the wall-clock instant is captured
// exactly once at entry scope (see `const now` below). `today` is derived from it
// via berlinToday, and that captured now/today is threaded into every derive
// call — no function re-reads the clock.
//
// Dev fixture switch: a `?state=` query param (offer|no_offer|upcoming|error|
// stale|unavailable) points loadData at the matching state-suffixed fixtures in
// public/data/ so each of the six UI states can be exercised for verification. No
// param loads the live ./data/ files.
//
// Service-worker registration is injected automatically by vite-plugin-pwa
// (injectRegister:'auto', registerType:'autoUpdate' from Plan 01) — this module
// deliberately does NOT hand-register a SW.

import { loadData } from "./data/load.js";
import {
  berlinToday,
  bestDeal,
  soonestUpcoming,
  sortCards,
} from "./derive/derive.js";
import { renderHero } from "./render/hero.js";
import { renderCards } from "./render/card.js";
import { renderFooter } from "./render/footer.js";
import { renderHistory } from "./chart/history.js";

// --- The single captured clock instant. The clock is never re-read below. ---
const now = new Date();

// Map a ?state= value to its fixture file overrides. Each state has its own
// current-offers file; the `stale` state additionally swaps in the stale status
// file so per-store staleness is exercised. Unknown/absent states load live data.
const STATE_FIXTURES = {
  offer: { currentOffers: "current-offers.offer.json" },
  no_offer: { currentOffers: "current-offers.no_offer.json" },
  upcoming: { currentOffers: "current-offers.upcoming.json" },
  error: { currentOffers: "current-offers.error.json" },
  unavailable: { currentOffers: "current-offers.unavailable.json" },
  stale: {
    currentOffers: "current-offers.stale.json",
    status: "status.stale.json",
  },
};

// Read the ?state= dev switch from the URL, returning the matching loadData
// `files` override or null for the default (live) load.
function fixtureOverride() {
  const state = new URLSearchParams(location.search).get("state");
  if (state && Object.prototype.hasOwnProperty.call(STATE_FIXTURES, state)) {
    return STATE_FIXTURES[state];
  }
  return null;
}

// Build a store -> StoreStatus map for the per-store staleness lookups.
function statusByStoreMap(status) {
  const map = {};
  for (const s of status?.stores ?? []) map[s.store] = s;
  return map;
}

async function main() {
  const hero = document.getElementById("hero");
  const cards = document.getElementById("cards");
  const graph = document.getElementById("graph");
  const footer = document.getElementById("footer");

  // Derive `today` ONCE from the single captured `now` (no second clock read).
  const today = berlinToday(now);

  let data;
  try {
    const files = fixtureOverride();
    data = await loadData(files ? { files } : {});
  } catch (err) {
    // loadData itself is degrade-only and should not reject, but guard anyway so
    // an unexpected throw still renders an honest screen rather than a blank one.
    // eslint-disable-next-line no-console
    console.error("[main] load failed unexpectedly:", err);
    data = { currentOffers: null, status: null, history: [], errors: { all: "load_failed" } };
  }

  const stores = data.currentOffers?.stores ?? [];
  const statusByStore = statusByStoreMap(data.status);

  // --- Hero: cheapest ACTIVE offer (D-06) + upcoming nudge for the empty state ---
  renderHero(hero, {
    bestDeal: bestDeal(stores, today),
    soonestUpcoming: soonestUpcoming(stores, today),
  });

  // --- Cards: all five, sorted active(cheapest)->upcoming->no_offer->unavailable/error ---
  renderCards(cards, sortCards(stores, today), statusByStore, now);

  // --- Graph: price history (async — lazy uPlot import; null on cold start) ---
  try {
    await renderHistory(graph, data.history ?? []);
  } catch (err) {
    // A chart failure must not blank the rest of the screen — log and move on.
    // eslint-disable-next-line no-console
    console.error("[main] chart render failed:", err);
  }

  // --- Footer: FILE-level lastUpdated (job-alive timestamp, D-17) ---
  renderFooter(footer, data.currentOffers?.lastUpdated ?? null);
}

main();
