# Requirements: ColaApp

**Defined:** 2026-06-15
**Core Value:** When the 12×1L Coca-Cola case goes on sale at one of the 5 Schifferstadt stores, the app shows it — accurately, with the price and the dates it's valid.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Data Acquisition

- [ ] **DATA-01**: System auto-fetches Coca-Cola 12×1L case offers for the 5 Schifferstadt stores (PLZ 67105) on a schedule, with no manual entry
- [ ] **DATA-02**: System matches strictly the 12×1L case and excludes other Cola SKUs (1.25L 6-packs, can trays, Zero/light unless the 12×1L case, store-brand colas)
- [ ] **DATA-03**: System normalizes each offer to price (excluding Pfand), €/litre, store, and valid-from/valid-to dates
- [ ] **DATA-04**: System appends each offer's price to a price history, deduplicated so repeated runs do not create duplicate entries
- [ ] **DATA-05**: A failed or unavailable store fetch is isolated — the run continues, last-known data is preserved, and the affected store is marked stale
- [ ] **DATA-06**: System records per-store fetch status and a last-updated timestamp

### Offers View

- [ ] **OFFR-01**: User sees a hero "best deal right now" answer (store + price + valid-until), or a clear "no current offer" message when nothing qualifies
- [ ] **OFFR-02**: User sees a card per store showing the current offer's price, €/litre, and valid dates
- [ ] **OFFR-03**: A store with no current offer shows a clear "kein Angebot" state, visually distinct from an error
- [ ] **OFFR-04**: A store whose data cannot be fetched automatically (e.g. Wasgau without coverage) shows a clear "not automatically available" state
- [ ] **OFFR-05**: User sees upcoming offers (future-dated valid-from) so next week's deals are visible ahead of time
- [ ] **OFFR-06**: User sees a "last updated" timestamp and a visible warning when the data is stale

### Price History

- [ ] **HIST-01**: User sees a price-history graph of the 12×1L case best price over time
- [ ] **HIST-02**: The graph handles sparse/early data gracefully — no misleading trend with too few points, and no interpolation across "no offer" gaps

### PWA & Delivery

- [ ] **PWA-01**: User can install the app to the Android home screen (web manifest + service worker, no sideloading, no app store)
- [ ] **PWA-02**: User can open the app offline and still see the last-fetched data
- [ ] **PWA-03**: When online, the app loads fresh data rather than serving stale prices indefinitely

### Infrastructure

- [ ] **INFR-01**: Offer data is produced by a scheduled GitHub Actions job and committed to the repository
- [ ] **INFR-02**: The PWA and its data are served at zero cost via GitHub Pages, with nothing hosted on the author's local machine
- [ ] **INFR-03**: The scheduled job stays enabled over time (keepalive against the 60-day inactivity disable) and the full loop runs end-to-end (cron → data → Pages → installed PWA reflects new data)

## v2 Requirements

Deferred to a future release. Tracked but not in the current roadmap.

### History Polish

- **HIST-03**: Per-store history overlay lines on the graph
- **HIST-04**: All-time-low reference line on the graph

### Presentation

- **UI-01**: Dark mode via OS `prefers-color-scheme`
- **OFFR-07**: Tiered staleness escalation (fresh → aging → prominent stale banner)

### Resilience

- **DATA-07**: Direct per-store fallback adapter for a store dropped by marktguru (e.g. Aldi Süd direct JSON)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| More than the 5 Schifferstadt stores | Scope is intentionally narrow; not expanding |
| Products other than the Coca-Cola 12×1L case | Single-product app by design |
| Other Cola pack sizes / variants as offers | Decided to track strictly the 12×1L case for cleanliness |
| Push notifications / alerts | Brother opens and checks himself; keeps it a static PWA |
| Native Android app / app-store distribution | PWA is sufficient and avoids sideloading |
| Accounts, login, multi-user, personalization | It's for one person |
| Shopping list, favorites, maps, in-app settings | marktguru/kaufDA bloat this app exists to avoid |
| Self-hosting / always-on local server as primary path | Must be free and not hosted locally (netcup is fallback only) |
| OCR of Wasgau PDF/image leaflets | Unreliable for price; show "unavailable" instead |
| Analytics / consent banners / i18n framework | Single user, single language; unnecessary |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | TBD | Pending |
| DATA-02 | TBD | Pending |
| DATA-03 | TBD | Pending |
| DATA-04 | TBD | Pending |
| DATA-05 | TBD | Pending |
| DATA-06 | TBD | Pending |
| OFFR-01 | TBD | Pending |
| OFFR-02 | TBD | Pending |
| OFFR-03 | TBD | Pending |
| OFFR-04 | TBD | Pending |
| OFFR-05 | TBD | Pending |
| OFFR-06 | TBD | Pending |
| HIST-01 | TBD | Pending |
| HIST-02 | TBD | Pending |
| PWA-01 | TBD | Pending |
| PWA-02 | TBD | Pending |
| PWA-03 | TBD | Pending |
| INFR-01 | TBD | Pending |
| INFR-02 | TBD | Pending |
| INFR-03 | TBD | Pending |

**Coverage:**
- v1 requirements: 20 total
- Mapped to phases: 0 (set during roadmap creation)
- Unmapped: 20 ⚠️

---
*Requirements defined: 2026-06-15*
*Last updated: 2026-06-15 after initial definition*
