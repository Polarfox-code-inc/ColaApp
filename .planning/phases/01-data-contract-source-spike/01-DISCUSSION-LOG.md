# Phase 1: Data Contract & Source Spike - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-15
**Phase:** 1-Data Contract & Source Spike
**Areas discussed:** Schema file layout, Store identity model, Strict matcher rules, State & price encoding, Dates/history/quarantine details

---

## Schema File Layout

### File split

| Option | Description | Selected |
|--------|-------------|----------|
| Three separate files | current-offers.json + price-history.jsonl + status.json | ✓ |
| One combined data.json | Everything in a single file | |
| Snapshot + history split | data.json (offers+status) + price-history | |

**User's choice:** Three separate files.

### History format

| Option | Description | Selected |
|--------|-------------|----------|
| JSONL (one object per line) | Append-only, clean diffs, no merge risk | ✓ |
| JSON array | Single array, rewritten each run | |

**User's choice:** JSONL.

---

## Store Identity Model

### Store representation

| Option | Description | Selected |
|--------|-------------|----------|
| 5 fixed group slots | rewe / edeka-netto / lidl-kaufland / aldi-penny / wasgau, best per group | |
| One entry per advertiser | Separate entry per chain | ✓ |
| 5 slots + record which chain | 5 slots but store actual advertiser name | |

**User's choice:** One entry per advertiser.

### Both-chains tie-break (asked under original group model)

| Option | Description | Selected |
|--------|-------------|----------|
| Cheapest of the two | Show lower price within group | |
| Keep both | Show both chains | ✓ |

**Notes:** Moot once the per-advertiser model was chosen — each advertiser is its own entry, no within-group tie.

### Card set (re-asked after advertiser list clarified)

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed 5, always rendered | REWE/Edeka/Lidl/Kaufland/Wasgau always shown | ✓ |
| Only stores with offers | Cards only when an offer exists | |

**User's choice:** Fixed 5, always rendered.

**Notes:** User **clarified the exact advertiser list** mid-discussion (rejected the first list-confirmation question to do so): the target set is **REWE, Edeka, Kaufland, Wasgau, Lidl** — "Aldi never has 12×1L, Penny and Netto are not on his route." This narrows the original 5 marktguru groups to 5 individual route-relevant advertisers.

---

## Strict Matcher Rules

### Variants

| Option | Description | Selected |
|--------|-------------|----------|
| Classic Coca-Cola only | Reject Zero/Light even at 12×1L | |
| Any Coca-Cola flavor at 12×1L | Classic/Zero/Light all count if 12×1L | ✓ |
| Classic + Zero (not Light) | Middle ground | |

**User's choice:** Any Coca-Cola flavor at 12×1L. Reject on pack size, not flavor; store-brand rejected.

### Ambiguity handling

| Option | Description | Selected |
|--------|-------------|----------|
| Reject (strict) | Drop if not confidently 12×1L | |
| Flag for manual review | Quarantine for eyeballing | ✓ |
| Accept (liberal) | Show ambiguous as matches | |

**User's choice:** Flag for manual review.

---

## State & Price Encoding

### Price units

| Option | Description | Selected |
|--------|-------------|----------|
| Integer cents | 1099 = €10,99 | ✓ |
| Euros as decimal number | 10.99 | |
| Decimal string | "10.99" | |

**User's choice:** Integer cents (+ currency: EUR).

### €/litre

| Option | Description | Selected |
|--------|-------------|----------|
| Scraper computes & stores it | pricePerLitre written into offer | ✓ |
| PWA derives it | PWA computes price÷12 | |

**User's choice:** Scraper computes & stores it.

### Pfand

| Option | Description | Selected |
|--------|-------------|----------|
| Don't store Pfand | No deposit field | ✓ |
| Store Pfand for display | Record deposit for "zzgl. Pfand" | |

**User's choice:** Don't store Pfand.

### State model

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit status enum + derived staleness | offer/no_offer/unavailable/error; upcoming+stale derived by PWA | ✓ |
| Scraper writes everything incl. stale | Staleness frozen at scrape time | |
| Booleans instead of enum | Separate flags | |

**User's choice:** Explicit status enum + derived staleness.

---

## Dates / History / Quarantine

### Date representation

| Option | Description | Selected |
|--------|-------------|----------|
| Calendar dates + timestamp | validFrom/To as YYYY-MM-DD (Europe/Berlin); lastUpdated as ISO 8601 UTC | ✓ |
| Full ISO timestamps everywhere | All dates as datetimes | |

**User's choice:** Calendar dates + timestamp.

### History line fields

| Option | Description | Selected |
|--------|-------------|----------|
| date, store, price, pricePerLitre, validFrom, validTo | Full per-observation record | ✓ |
| Minimal: date, store, price | Essentials only | |
| Best-price-only per run | One cheapest line per run | |

**User's choice:** date, store, price, pricePerLitre, validFrom, validTo. Dedup key: store + price + validFrom.

### Quarantine location

| Option | Description | Selected |
|--------|-------------|----------|
| Separate review file/fixture | needs-review.json, never in current-offers | |
| Flag inside current-offers | needsReview:true, hidden by PWA | ✓ |

**User's choice:** Flag inside current-offers (`needsReview: true`, filtered out by the PWA).

---

## Claude's Discretion

- Exact JSON key naming/casing, internal nesting, and spike fixture filenames left open to propose against the locked decisions.
- Must provide a realistic mock fixture for each ROADMAP UI state (offer present, no offer, upcoming only, store errored, stale).

## Deferred Ideas

- Staleness threshold value → Phase 3 (PWA).
- Price-history dedup *logic* → Phase 2 (DATA-04); record shape frozen here.
- Per-store direct fallback adapters (e.g. Aldi Süd JSON) → v2 (DATA-07).
- Tiered staleness, dark mode, history overlays → v2.
