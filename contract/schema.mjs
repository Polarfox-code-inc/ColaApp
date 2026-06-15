// contract/schema.mjs
// Frozen scraper <-> PWA data contract for ColaApp (Phase 1, Plan 02).
// Encodes decisions D-01..D-14 as zod schemas. This module is the single
// source of truth both Phase 2 (scraper, producer) and Phase 3 (PWA, consumer)
// import. A drifted payload throws here rather than silently corrupting data
// (threat T-02-01).
//
// Reference inputs honoured from the live spike (spike/findings.md):
//   - offers live at data.results; real slugs rewe/edeka/kaufland
//   - validityDates {from,to} ISO-UTC, day-granular Berlin -> trimmed to YYYY-MM-DD
//   - price is a decimal euro number -> stored as integer cents via Math.round(price*100)
//   - Wasgau absent -> status "unavailable", no OCR

import { z } from "zod";

// --- Fixed identity sets (D-03/D-04/D-12) ---

// The five target advertisers, modeled individually (NOT marktguru groups).
// Aldi/Penny/Netto are dropped entirely (D-04).
export const STORES = ["REWE", "Edeka", "Lidl", "Kaufland", "Wasgau"];

// Mutually-exclusive store status enum. Loose booleans are rejected (D-12).
// PWA derives "upcoming" (future validFrom) and "stale" (lastUpdated age) at
// render time — they are intentionally NOT frozen here.
export const STATUS_VALUES = ["offer", "no_offer", "unavailable", "error"];

export const StoreKey = z.enum(STORES);
export const StatusEnum = z.enum(STATUS_VALUES);

// --- Primitive field schemas ---

// Calendar date in Europe/Berlin (D-13). Anchored + linear regex (no
// backtracking) to avoid ReDoS (threat T-02-02).
const DateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD (Europe/Berlin)");

// Full ISO-8601 UTC timestamp for precise staleness math (D-13).
const IsoUtc = z.string().datetime();

// Integer cents (D-09) and integer cents/litre (D-11). Floats are rejected.
const Cents = z.number().int().nonnegative();

// --- StoreOffer (one entry per store in current-offers.json) ---

const StoreOfferBase = z.object({
  store: StoreKey,
  displayName: z.string().min(1),
  status: StatusEnum,
  needsReview: z.boolean().default(false), // quarantine flag (D-08)
  // Offer fields — required when status==="offer", nullable/absent otherwise.
  // No pfand/deposit field exists anywhere in the contract (D-10).
  price: Cents.nullable().optional(), // integer cents (D-09)
  currency: z.literal("EUR").nullable().optional(),
  pricePerLitre: Cents.nullable().optional(), // integer cents/litre (D-11)
  validFrom: DateOnly.nullable().optional(), // YYYY-MM-DD Berlin (D-13)
  validTo: DateOnly.nullable().optional(),
});

// Refine: a status:"offer" entry MUST carry the offer fields. A drifted
// "offer" missing price/pricePerLitre/dates fails validation.
export const StoreOfferSchema = StoreOfferBase.strict().superRefine((o, ctx) => {
  if (o.status !== "offer") return;
  const required = ["price", "currency", "pricePerLitre", "validFrom", "validTo"];
  for (const field of required) {
    if (o[field] === undefined || o[field] === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: `status:"offer" requires ${field}`,
      });
    }
  }
});

// --- CurrentOffers file (data/current-offers.json) ---

export const CurrentOffersSchema = z
  .object({
    lastUpdated: IsoUtc, // ISO UTC (D-13)
    stores: z.array(StoreOfferSchema),
  })
  .strict()
  .superRefine((file, ctx) => {
    // The 5 fixed StoreKeys must each appear exactly once (D-05).
    const seen = file.stores.map((s) => s.store);
    for (const key of STORES) {
      const count = seen.filter((s) => s === key).length;
      if (count !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["stores"],
          message: `store "${key}" must appear exactly once (found ${count})`,
        });
      }
    }
    // Reject any store key outside the fixed set (defensive; StoreKey already
    // enforces this per-entry, but this guards array-level extras).
    for (const s of seen) {
      if (!STORES.includes(s)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["stores"],
          message: `unknown store "${s}"`,
        });
      }
    }
  });

// --- Price-history line (one JSONL line in data/price-history.jsonl) (D-14) ---

export const HistoryLineSchema = z
  .object({
    date: DateOnly, // observation date
    store: StoreKey,
    price: Cents, // integer cents (D-09)
    pricePerLitre: Cents, // integer cents/litre (D-11)
    validFrom: DateOnly,
    validTo: DateOnly,
  })
  .strict();

// --- Status file (data/status.json) — per-store fetch state (D-01/D-06) ---
// Note: the DATA-06 fault-isolation LOGIC is Phase 2; only the SHAPE is frozen.

export const StoreStatusSchema = z
  .object({
    store: StoreKey,
    status: StatusEnum,
    lastUpdated: IsoUtc,
  })
  .strict();

export const StatusFileSchema = z
  .object({
    lastUpdated: IsoUtc,
    stores: z.array(StoreStatusSchema),
  })
  .strict();

// --- Parse helpers (throw on invalid input) ---

export const parseCurrentOffers = (obj) => CurrentOffersSchema.parse(obj);
export const parseHistoryLine = (obj) => HistoryLineSchema.parse(obj);
export const parseStatusFile = (obj) => StatusFileSchema.parse(obj);
