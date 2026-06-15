// scraper/merge.mjs
// Assemble the two whole-file documents (current-offers.json + status.json) from
// the per-store build results and the run's status overrides. Pure + clock-free:
// `now` is injected (Pattern 4); this module NEVER fetches, validates, or writes
// (index.mjs owns validation + the atomic writes).
//
// The four marktguru stores (REWE/Edeka/Lidl/Kaufland) flow through one of three
// paths per run:
//   1. statusOverride === "error" WITH a prior offer entry  -> warm error:
//      copy the prior current-offers entry VERBATIM (last-known data survives,
//      D-04/Pitfall 2) and mark status "error" with the prior per-store
//      lastUpdated FROZEN (not bumped, D-05).
//   2. statusOverride === "error" WITHOUT a prior entry      -> cold-start error:
//      current-offers entry is an honest { status:"no_offer" } (schema-valid: the
//      contract requires offer fields only when status==="offer"), and status is
//      { status:"error", lastUpdated: now } — a synthetic first value, there is no
//      older timestamp to freeze (D-06 / Open Q1).
//   3. no override                                           -> successful refresh:
//      use the freshly built storeResults entry; per-store lastUpdated bumps to
//      now (D-05). An absent-from-results store (no override, no built entry)
//      degrades to no_offer, never error (Pitfall 6).
//
// Wasgau is NEVER touched by statusOverrides: it is always "unavailable" in both
// files, carrying its prior per-store timestamp when present else now (D-03).
//
// Both files' top-level lastUpdated ALWAYS bumps to the run clock (D-05).

// The four marktguru-fed stores, in fixed order. Wasgau is appended separately.
const MARKTGURU_STORES = ["REWE", "Edeka", "Lidl", "Kaufland"];

// Look up a store's prior entry in a (possibly null) prior document.
const priorEntry = (priorDoc, store) =>
  priorDoc?.stores?.find((s) => s.store === store) ?? null;

/**
 * Assemble the in-memory current-offers + status documents for this run.
 *
 * @param {Record<string, object>} storeResults  store -> built StoreOffer or
 *        { status:"no_offer" } signal (from selectForStore, Plan 01). Absent
 *        keys degrade to no_offer.
 * @param {Record<string, "error">} statusOverrides  store -> "error" for stores
 *        that threw during build or were swept by a total fetch failure.
 * @param {{ currentOffers: object | null, status: object | null }} prior  the
 *        prior snapshot from io.readPrior (nulls on cold start).
 * @param {Date} now  the injected run clock (captured once by the orchestrator).
 * @returns {{ currentOffers: object, status: object }}
 */
export function mergeWithPrior(storeResults, statusOverrides, prior, now) {
  const nowIso = now.toISOString();
  const results = storeResults ?? {};
  const overrides = statusOverrides ?? {};
  const priorCurrent = prior?.currentOffers ?? null;
  const priorStatus = prior?.status ?? null;

  const offerStores = [];
  const statusStores = [];

  for (const store of MARKTGURU_STORES) {
    if (overrides[store] === "error") {
      const priorOffer = priorEntry(priorCurrent, store);
      const priorSt = priorEntry(priorStatus, store);
      if (priorOffer) {
        // Warm error: keep last-known data; freeze the per-store timestamp.
        offerStores.push({ ...priorOffer }); // verbatim copy (D-04, Pitfall 2)
        statusStores.push({
          store,
          status: "error",
          lastUpdated: priorSt?.lastUpdated ?? nowIso, // frozen prior value (D-05)
        });
      } else {
        // Cold-start error: honest no_offer in the snapshot, error in status.
        offerStores.push({ store, displayName: store, status: "no_offer" }); // D-06
        statusStores.push({ store, status: "error", lastUpdated: nowIso }); // synthetic (Open Q1)
      }
      continue;
    }

    // No override: use the freshly built result (absent -> no_offer, Pitfall 6).
    const built = results[store] ?? { status: "no_offer" };
    const status = built.status ?? "no_offer";
    if (status === "offer") {
      // A built StoreOffer carries its own identity fields verbatim.
      offerStores.push({ ...built });
    } else {
      offerStores.push({ store, displayName: store, status: "no_offer" });
    }
    statusStores.push({ store, status, lastUpdated: nowIso }); // bumped on refresh (D-05)
  }

  // Wasgau is always unavailable; never routed through overrides (D-03). Its
  // per-store timestamp carries from prior when present, else the run clock.
  const priorWasgau = priorEntry(priorStatus, "Wasgau");
  offerStores.push({ store: "Wasgau", displayName: "Wasgau", status: "unavailable" });
  statusStores.push({
    store: "Wasgau",
    status: "unavailable",
    lastUpdated: priorWasgau?.lastUpdated ?? nowIso,
  });

  return {
    currentOffers: { lastUpdated: nowIso, stores: offerStores }, // file-level bump (D-05)
    status: { lastUpdated: nowIso, stores: statusStores },
  };
}
