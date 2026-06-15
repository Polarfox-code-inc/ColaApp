# Phase 1: Data Contract & Source Spike - Context

**Gathered:** 2026-06-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Freeze the JSON file contract between the scraper (Phase 2) and the PWA (Phase 3), define the strict 12×1L Coca-Cola matcher, and prove — with live captured payloads — that the marktguru API returns the 12×1L case for PLZ 67105 across the target stores. No production scraper or PWA code depends on the contract until it is frozen here.

The live probe and fixture capture are **spike/research work** (done by the researcher/spike, not the user). This discussion fixed the **contract decisions** the probe validates and that both downstream tracks build against in parallel.

</domain>

<decisions>
## Implementation Decisions

### Schema File Layout
- **D-01:** Three separate data files (not one combined file):
  - `data/current-offers.json` — latest snapshot, one entry per store
  - `data/price-history.jsonl` — append-only history points
  - `data/status.json` — per-store fetch state + last-updated timestamp
- **D-02:** Price history is **JSONL** (one JSON object per line), append-only — clean git diffs (one new line per run), trivial appends without rewriting/reparsing, no merge/race risk. (Confirms the CLAUDE.md recommendation; rejects a rewritten JSON array.)

### Store Identity Model
- **D-03:** Stores are modeled as **individual advertisers**, NOT the original 5 marktguru groups. The target set is a **fixed list of exactly 5 advertisers: REWE, Edeka, Lidl, Kaufland, Wasgau.**
- **D-04:** **Aldi, Penny, and Netto are dropped entirely.** Rationale from the user: Aldi never carries the 12×1L case; Penny and Netto are not on the brother's route. ⚠️ This narrows the original "REWE / Edeka-Netto / Lidl-Kaufland / Aldi-Penny / Wasgau" grouping in PROJECT.md, REQUIREMENTS.md (OFFR-02), and ROADMAP Phase 1 success criterion #1. The **live marktguru probe must target exactly these 5 advertisers** (and Lidl + Kaufland are now both first-class, separately).
- **D-05:** The 5 advertiser keys are a **fixed set, always rendered** — a store with no qualifying offer shows `no_offer` ("kein Angebot"); a store that can't be fetched shows `unavailable`/`error` (e.g. Wasgau). Keeps a stable 5-card UI and makes the honest no-offer vs error vs unavailable distinction (OFFR-03/04) explicit. (Per-advertiser model means there is no within-group "both chains" tie to resolve.)

### Strict Matcher Rules (DATA-02)
- **D-06:** **Any Coca-Cola flavor at 12×1L matches** — Classic, Zero, and Light all count provided the pack is the 12×1L case. Rejection is on **pack size**, not flavor.
- **D-07:** **Reject** non-12×1L packs (1.25L 6-packs, can trays, etc.) and **store-brand colas**.
- **D-08:** **Ambiguous entries are quarantined for manual review, not silently dropped and not shown to the brother.** An entry that is clearly Coca-Cola but whose 12×1L pack size cannot be confidently confirmed is kept with a `needsReview: true` flag **inside `current-offers.json`**, which the PWA filters out of the brother-facing view (see D-13). The user eyeballs these and tightens matcher rules from them.

### Price & Unit Encoding
- **D-09:** Price stored as **integer cents** (e.g. `1099` = €10,99) with `currency: "EUR"`. Avoids floating-point rounding; PWA formats to German `€10,99` on display.
- **D-10:** Price **excludes Pfand** (pre-locked, DATA-03) and **Pfand is NOT stored** at all — no deposit field in the schema.
- **D-11:** **€/litre is computed and stored by the scraper** (`pricePerLitre`, in cents/litre — for the 12×1L case = price ÷ 12). Both the PWA views and history read the same value so scraper and PWA can't diverge on rounding.

### State Modeling
- **D-12:** Each store carries an **explicit `status` enum**: `offer` | `no_offer` | `unavailable` | `error` (mutually exclusive — rejected loose booleans). The scraper states facts; the **PWA derives time-relative views**: `upcoming` = an offer whose `validFrom` is in the future; `stale` = `lastUpdated` age exceeds a threshold (threshold value itself deferred to Phase 3). Staleness is intentionally NOT frozen at scrape time so it stays correct while the PWA sits open offline.

### Dates & History Record Shape
- **D-13:** Dates: `validFrom`/`validTo` as plain calendar dates `YYYY-MM-DD` interpreted in **Europe/Berlin** (offers are day-granular, weekly Mon–Sat/Sun). `lastUpdated` as a full **ISO 8601 UTC timestamp** (e.g. `2026-06-15T04:00:00Z`) so staleness math is precise.
- **D-14:** Each `price-history.jsonl` line carries: `date` (observation date), `store`, `price` (cents), `pricePerLitre`, `validFrom`, `validTo`. Sufficient for a per-store or best-price-over-time graph. **Dedup key: store + price + validFrom** (the dedup *logic* lands in Phase 2, but the record shape is frozen here).

### Claude's Discretion
- Exact JSON key naming/casing, file-internal nesting, and the spike fixture filenames are open — propose against the decisions above. The set of **UI-state mocks** required by ROADMAP success criterion #3 (offer present, no offer, upcoming only, store errored, stale) must all be representable in this schema; provide a realistic mock fixture for each.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Data source & integration (most important)
- `CLAUDE.md` — Technology Stack section. Specifically the **"marktguru API — integration notes"** block: base URL `https://api.marktguru.de/api/v1`, `GET /offers/search?as=web&q=coca%20cola&zipCode=67105&limit=200&offset=0`, the `x-apikey`/`x-clientkey` headers scraped from the homepage bootstrap (cached ~6h), client-side filtering by `advertisers[].name`/`uniqueName`, reverse-engineered response fields (`title`/`description`, `price`, validity dates — **field names to confirm live**), image URL pattern, and the ToS/good-citizen cadence guidance.
- `CLAUDE.md` — **"Per-Store Data-Source Feasibility"** table — per-store reachability via marktguru, incl. Wasgau (leaflet-only direct; marktguru retailer feed is the path) and the "explicit no-offer / not-automatically-available" fallback.
- `CLAUDE.md` — **"Data File Format"**, **"What NOT to Use"** (no axios/node-fetch, JSONL not rewritten arrays, no OCR for v1), and **"Stack Patterns by Variant"**.

### Requirements & scope
- `.planning/REQUIREMENTS.md` — **DATA-02** (strict matcher) is the only requirement mapped to Phase 1; DATA-03 (price excl. Pfand, €/litre, valid dates) and the OFFR-* state requirements inform the schema. Note the **Out of Scope** table (single product, no other pack sizes/variants-as-offers).
- `.planning/ROADMAP.md` — Phase 1 goal + 4 success criteria (the schema must satisfy all four, incl. mocks for every UI state).
- `.planning/PROJECT.md` — Core value, constraints (free, no local hosting), Known Risks (per-store feasibility, long "no offer" stretches, brittle scrapers).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **None** — greenfield repo. Only `.planning/`, `.claude/`, and `CLAUDE.md` exist; no `src/`, `scraper/`, `web/`, or `data/` yet.

### Established Patterns
- No code patterns yet. The frozen schema produced by this phase **becomes** the foundational pattern that Phases 2 and 3 build against in parallel.

### Integration Points
- The three `data/*.json(l)` files are the sole interface between the scraper (producer, Phase 2) and the PWA (consumer, Phase 3). This phase defines that interface; nothing else connects yet.

</code_context>

<specifics>
## Specific Ideas

- The brother's real shopping route drives the store set (D-03/D-04) — REWE, Edeka, Lidl, Kaufland, Wasgau only. This is a deliberate, user-stated narrowing, not an oversight.
- Matcher should be permissive on flavor (Classic/Zero/Light) but strict on pack size (D-06/D-07), with a manual-review safety net (D-08) rather than silent drops — the user wants to eyeball uncertain marktguru titles during the spike.

</specifics>

<deferred>
## Deferred Ideas

- **Staleness threshold value** (how many days = "stale") — schema carries the precise `lastUpdated` timestamp now; the PWA-side threshold/derivation is a Phase 3 (PWA) decision.
- **Price-history dedup *logic*** — record shape and dedup key frozen here (D-14); the implementation of deduplication on repeated runs is Phase 2 (DATA-04).
- **Per-store fallback adapters** (e.g. Aldi Süd direct JSON) — out of scope for v1 / Phase 1 (REQUIREMENTS v2 DATA-07).
- **Tiered staleness escalation, dark mode, per-store/all-time-low history overlays** — REQUIREMENTS v2.

None of these are scope creep into Phase 1 — they are correctly downstream.

</deferred>

---

*Phase: 1-Data Contract & Source Spike*
*Context gathered: 2026-06-15*
