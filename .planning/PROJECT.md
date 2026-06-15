# ColaApp

## What This Is

A tiny, single-purpose web app (PWA) that tells one person — the author's brother — where the **Coca-Cola 12×1-litre case (Kasten)** is currently or soon on sale among **5 fixed supermarket stores in Schifferstadt, Germany** (REWE, Edeka, Lidl, Kaufland, Wasgau). He adds it to his Android home screen, opens it when curious, and sees which store has the best deal — plus a price-history graph over time.

## Core Value

When the 12×1L Coca-Cola case goes on sale at one of the 5 Schifferstadt stores, the app shows it — accurately, with the price and the dates it's valid. If that one thing works, the app is worth having.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — ship to validate)

### Active

<!-- Current scope. Building toward these. Hypotheses until shipped. -->

- [ ] App auto-fetches Coca-Cola 12×1L case offers from the 5 Schifferstadt stores on a schedule (no manual entry)
- [ ] Brother sees current and upcoming offers per store, each with price and valid-from/valid-to dates
- [ ] App highlights the best current deal across the 5 stores
- [ ] App shows a price-history graph of the 12×1L case over time
- [ ] App is installable to the Android home screen as a PWA — no sideloading, no app store
- [ ] Whole thing runs at zero cost with nothing hosted on the author's own machine

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- More than the 5 Schifferstadt stores — explicitly not expanding; scope is intentionally narrow
- Products other than the Coca-Cola 12×1L case — single-product focus by design
- Other pack sizes / Cola variants (1.25L 6-packs, can trays, etc.) — decided to track strictly the 12×1L case for cleanliness
- Push notifications / alerts — brother opens and checks himself; keeps it a simple static PWA
- Native Android app / app-store distribution — PWA is sufficient and avoids sideloading
- Multi-user accounts, login, personalization — it's for one person
- Self-hosting / always-on local server as the primary path — must be free and not hosted locally

## Context

- **Location:** Schifferstadt, Germany (PLZ 67105). Store locations are fixed and known, which simplifies targeting offers to specific local branches.
- **Stores in scope:** REWE, Edeka, Lidl, Kaufland, and Wasgau (a smaller regional Pfalz chain) — tracked as 5 individual advertisers. **Aldi, Penny, and Netto are excluded** (decided Phase 1): Aldi never carries the 12×1L case; Penny and Netto are not on the brother's route.
- **German offer cadence:** Supermarket offers typically run weekly (Mon–Sat/Sun) and are often announced a week ahead via leaflets ("Prospekte"/"Angebote") — so "upcoming next week" offers are meaningful and worth surfacing, not just the current week.
- **Author has a netcup server** available as a fallback compute option if the free path proves insufficient.
- **Single user:** The author's brother. No growth, scale, or multi-user concerns.

## Constraints

- **Cost**: Must be entirely free to run — no paid hosting, no paid APIs/tiers. — Personal hobby project for one person.
- **Hosting**: Nothing hosted on the author's own local machine. Chosen path is free cloud: GitHub Actions (scheduled scrape) + GitHub Pages (serves the PWA). Netcup server is a fallback only. — User requirement.
- **Delivery**: Must be installable without sideloading — PWA "add to home screen" on Android. — User requirement.
- **Data acquisition**: Offers must be fetched automatically (no relying on someone manually spotting and entering them). A phone PWA can't read store sites directly (CORS), so a scheduled server-side job produces a data file the PWA reads. — Follows from auto-fetch choice.
- **Simplicity**: The app must stay simple to build and use; the narrow scope is a deliberate constraint, not a temporary one.

## Key Decisions

<!-- Decisions that constrain future work. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Auto-fetch offers (not manual entry) | Convenience — the app should do the checking so the brother doesn't have to | — Pending |
| Track strictly the 12×1L Coca-Cola case | Cleanest, unambiguous target; matches exactly what he buys | — Pending |
| GitHub Actions (cron scrape) + GitHub Pages (PWA) | Meets "free + no local hosting" with zero maintenance; data file decouples scraper from frontend | — Pending |
| PWA, no push notifications | He opens and checks himself; keeps it a static, installable web app with no sideloading | — Pending |
| Price-history graph in v1 | Nearly free since data is stored over time anyway; useful for spotting a genuinely good price | — Pending |
| Track 5 individual advertisers — REWE, Edeka, Lidl, Kaufland, Wasgau (drop Aldi/Penny/Netto) | Aldi never carries the 12×1L case; Penny and Netto are not on the brother's route. Lidl and Kaufland tracked separately, not as a group | — Decided Phase 1 |

## Known Risks

<!-- Surfaced during questioning; for research/roadmap to address. -->

- **Per-store data feasibility varies.** Larger chains (REWE, Edeka, Lidl, Kaufland) more often expose machine-readable offer data or stable endpoints; smaller/regional ones — especially **Wasgau** — may only publish PDF/image leaflets, which are far harder to parse reliably. The research phase must assess each store and may recommend a fallback (e.g., an aggregator like marktguru, or accepting partial coverage) for stores without good data.
- **Pinning to exactly 12×1L may yield long "no offer" stretches.** That's accepted (it reflects reality), but the UI should make "no current offer" a clear, non-broken state.
- **Scrapers are brittle.** Store sites/endpoints change; the scheduled job must fail gracefully and keep serving the last-known data.

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-15 — Phase 1 discuss: store set narrowed to REWE, Edeka, Lidl, Kaufland, Wasgau (individual advertisers); Aldi/Penny/Netto dropped*
