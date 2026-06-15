# Roadmap: ColaApp

## Overview

ColaApp delivers one answer to one person: where is the Coca-Cola 12×1L case on sale among five fixed Schifferstadt stores (REWE, Edeka, Lidl, Kaufland, Wasgau — the brother's route; Aldi/Penny/Netto are excluded). The journey starts by freezing the JSON file contract between scraper and PWA and proving — live — that the marktguru API actually returns the 12×1L case for PLZ 67105 across those five target stores (especially Wasgau). With the contract frozen and the data source confirmed, the producer (scraper) and consumer (PWA) are built in parallel against the same schema: a fault-isolated ETL that strictly matches the 12×1L case and appends a deduplicated price history, and an installable offline-capable PWA that renders the best deal, per-store cards, upcoming offers, and a price-history graph with honest "no offer" / "unavailable" / "stale" states. Finally the two tracks are wired together through a free GitHub Actions cron + GitHub Pages loop, all five store adapters land (Wasgau isolated so it can never block the rest), and the pipeline is hardened so a solo maintainer is never silently left with stale prices.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Data Contract & Source Spike** - Freeze the JSON file contract and prove marktguru returns the 12×1L case across all 5 stores (completed 2026-06-15)
- [x] **Phase 2: Core Scraper** - Fault-isolated ETL that fetches, normalizes, and appends a deduplicated price history (completed 2026-06-15)
- [ ] **Phase 3: PWA Frontend** - Installable offline PWA rendering best deal, per-store states, upcoming offers, and price history
- [ ] **Phase 4: Live Integration, All Stores & Hardening** - Wire the free cron + Pages loop, land all 5 adapters, and harden against silent failure

## Phase Details

### Phase 1: Data Contract & Source Spike

**Goal**: The scraper/PWA file contract is frozen and the marktguru data source is proven viable for the exact target product, store, and postcode before any production code depends on it.
**Depends on**: Nothing (first phase)
**Requirements**: DATA-02
**Success Criteria** (what must be TRUE):

  1. A live marktguru probe confirms the Coca-Cola 12×1L case is returned for PLZ 67105 across the five target stores (REWE, Edeka, Lidl, Kaufland, Wasgau — modeled as individual advertisers, not groups; Aldi/Penny/Netto excluded), with Wasgau coverage either confirmed or explicitly declared "not automatically available"
  2. Real captured marktguru payloads exist as fixtures, and a strict matcher accepts the 12×1L case while rejecting 1.25L 6-packs, can trays, Zero/light non-case SKUs, and store-brand colas
  3. A frozen `data/*.json` schema (current-offers, price-history, status) exists with realistic mocks for every UI state: offer present, no offer, upcoming only, store errored, and stale
  4. The Pfand convention (price excludes Pfand) and the "no offer" vs "error" vs "unavailable" distinctions are decided and encoded in the schema and shared types**Plans**: 3 plans

**Wave 1**

- [x] 01-01-scaffold-live-probe-PLAN.md — Scaffold the Node 22 project and run the live marktguru probe; capture the raw payload, advertiser slugs, and the Wasgau verdict (Wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-frozen-contract-schema-PLAN.md — Freeze the 3-file zod contract (D-01..D-14) and author a passing mock for every UI state (Wave 2)
- [x] 01-03-strict-matcher-PLAN.md — Implement and fixture-test the strict 12×1L matcher (DATA-02) via TDD (Wave 2)

### Phase 2: Core Scraper

**Goal**: A scheduled, fault-isolated ETL produces real data files on the frozen schema — fetching the 12×1L case automatically, normalizing it, and maintaining a clean append-only price history.
**Depends on**: Phase 1
**Requirements**: DATA-01, DATA-03, DATA-04, DATA-05, DATA-06
**Success Criteria** (what must be TRUE):

  1. Running the scraper auto-fetches the 12×1L case for the Schifferstadt stores with no manual entry and writes `current-offers.json` conforming to the frozen schema
  2. Each offer is normalized to price (excluding Pfand), €/litre, store, and valid-from/valid-to dates
  3. Re-running the scraper appends new prices to the price history without creating duplicate entries for the same offer
  4. A failed or unavailable store fetch is isolated: the run completes, last-known data is preserved, and the affected store is marked stale rather than aborting the whole run
  5. Every run records per-store fetch status and a last-updated timestamp

**Plans**: 3 plans

**Wave 1**

- [x] 02-01-PLAN.md — Pure-transform core: filter to the 5-store allow-list, normalize to integer cents/€-litre/Berlin dates, active-first/upcoming/lowest-price selection, frozen-key dedup, injectable clock (Wave 1)
- [x] 02-02-PLAN.md — I/O boundary: retrying single marktguru fetch with per-attempt timeout + key hygiene, and atomic temp+rename writes / append-only history / cold-start-tolerant read-prior (Wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 02-03-PLAN.md — Orchestrator + merge: fault-isolated per-store build, carry-forward/cold-start serialization, two-timestamp status, schema-validated atomic writes, `npm run scrape`, end-to-end fixture test (Wave 2)

### Phase 3: PWA Frontend

**Goal**: An installable, offline-capable PWA (built against the Phase 1 mocks) answers "where is the best deal" at a glance and renders every offer and history state honestly.
**Depends on**: Phase 1
**Requirements**: OFFR-01, OFFR-02, OFFR-03, OFFR-04, OFFR-05, OFFR-06, HIST-01, HIST-02, HIST-03, PWA-01, PWA-02, PWA-03
**Success Criteria** (what must be TRUE):

  1. The user sees a hero "best deal right now" answer (store + price + valid-until), or a clear "no current offer" message when nothing qualifies
  2. The user sees a card per store with the current price, €/litre, and valid dates, where "kein Angebot", "not automatically available" (e.g. Wasgau), and a fetch error are three visually distinct states
  3. The user sees upcoming (future-dated) offers and a price-history graph — with a separate per-store line (REWE, Edeka, Lidl, Kaufland; Wasgau none) — that handles sparse/early data without misleading trends or interpolating across "no offer" gaps
  4. The user sees a "last updated" timestamp with a visible warning when data is stale
  5. The user can install the app to the Android home screen, open it offline to see last-fetched data, and gets fresh data (not indefinitely stale prices) when online

**Plans**: 5 plans

**Wave 1**

- [ ] 03-01-PLAN.md — Scaffold web/ Vite PWA: pinned toolchain, VitePWA generateSW (manifest + StaleWhileRevalidate data route), app shell, design tokens, trademark-safe icons, dev fixtures (Wave 1)
- [ ] 03-02-PLAN.md — Pure clock-injected derivation + de-DE formatters: best-deal, upcoming/active, per-store staleness, card sort, currency/date/weekday/timestamp — unit-tested (Wave 1)
- [ ] 03-03-PLAN.md — Price-history chart: pure data-prep (shared axis, null gaps, point counts, Wasgau excluded) + uPlot render (spanGaps:false, markers-only <3 pts, palette, legend, cold-start) (Wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 03-04-PLAN.md — Integration: tolerant fetch/parse load boundary, hero/card/footer DOM render (three distinct states, upcoming badge, stale chip, footer), main.js orchestrator + ?state= dev switch (Wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 03-05-PLAN.md — Human-verify checkpoint: build + localhost preview, README, and manual install / offline / fresh-when-online + six-state visual verification (Wave 3)
**UI hint**: yes

### Phase 4: Live Integration, All Stores & Hardening

**Goal**: The full system runs end-to-end for free with all five stores, and the pipeline keeps itself alive and surfaces failures instead of silently serving stale prices.
**Depends on**: Phase 2, Phase 3
**Requirements**: INFR-01, INFR-02, INFR-03
**Success Criteria** (what must be TRUE):

  1. A scheduled GitHub Actions job produces the offer data and commits it to the repository on each run
  2. The PWA and its data are served at zero cost via GitHub Pages with nothing hosted on the author's local machine
  3. The full loop is verified end-to-end: cron → scraper → committed data → Pages → the installed PWA reflects the new data
  4. All five target stores (REWE, Edeka, Lidl, Kaufland, Wasgau) are present in the data, with each adapter fault-isolated so Wasgau (shown "not automatically available" if Cola coverage is absent) can never block the others
  5. The scheduled job stays enabled over time via a keepalive heartbeat (against the 60-day inactivity disable), and a failing run surfaces to the maintainer rather than failing silently

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Data Contract & Source Spike | 3/3 | Complete    | 2026-06-15 |
| 2. Core Scraper | 3/3 | Complete    | 2026-06-15 |
| 3. PWA Frontend | 0/5 | Not started | - |
| 4. Live Integration, All Stores & Hardening | 0/TBD | Not started | - |
