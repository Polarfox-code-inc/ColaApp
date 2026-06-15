// contract/types.d.ts
// TypeScript types mirroring contract/schema.mjs so Phase 3 (PWA) and Phase 2
// (scraper) get editor types WITHOUT importing zod at runtime. Keep in sync
// with schema.mjs — schema.mjs is the runtime source of truth (D-01..D-14).

/** The five fixed target advertisers (D-03/D-04). */
export type StoreKey = "REWE" | "Edeka" | "Lidl" | "Kaufland" | "Wasgau";

/** Mutually-exclusive store status (D-12). "upcoming"/"stale" are PWA-derived. */
export type StoreStatusValue = "offer" | "no_offer" | "unavailable" | "error";

/** Calendar date in Europe/Berlin, `YYYY-MM-DD` (D-13). */
export type DateOnly = string;

/** Full ISO-8601 UTC timestamp, e.g. `2026-06-15T04:00:00Z` (D-13). */
export type IsoUtc = string;

/**
 * One store entry inside current-offers.json. Offer fields are present when
 * `status === "offer"` and null/absent otherwise. Price is integer cents (D-09),
 * pricePerLitre is integer cents/litre (D-11). No Pfand/deposit field (D-10).
 */
export interface StoreOffer {
  store: StoreKey;
  displayName: string;
  status: StoreStatusValue;
  /** Quarantine flag; PWA filters these from the brother-facing view (D-08). */
  needsReview: boolean;
  /** Integer cents (D-09). Present iff status === "offer". */
  price?: number | null;
  currency?: "EUR" | null;
  /** Integer cents per litre (D-11). Present iff status === "offer". */
  pricePerLitre?: number | null;
  /** `YYYY-MM-DD` Europe/Berlin (D-13). Present iff status === "offer". */
  validFrom?: DateOnly | null;
  validTo?: DateOnly | null;
}

/** data/current-offers.json — latest 5-store snapshot (D-01/D-05). */
export interface CurrentOffers {
  lastUpdated: IsoUtc;
  /** Exactly the 5 fixed stores, each once (D-05). */
  stores: StoreOffer[];
}

/** One append-only line in data/price-history.jsonl (D-02/D-14). */
export interface HistoryLine {
  /** Observation date, `YYYY-MM-DD`. */
  date: DateOnly;
  store: StoreKey;
  /** Integer cents (D-09). */
  price: number;
  /** Integer cents per litre (D-11). */
  pricePerLitre: number;
  validFrom: DateOnly;
  validTo: DateOnly;
}

/** Per-store fetch state entry inside status.json (D-06). */
export interface StoreStatus {
  store: StoreKey;
  status: StoreStatusValue;
  lastUpdated: IsoUtc;
}

/** data/status.json — per-store fetch state + file-level timestamp (D-01). */
export interface StatusFile {
  lastUpdated: IsoUtc;
  stores: StoreStatus[];
}
