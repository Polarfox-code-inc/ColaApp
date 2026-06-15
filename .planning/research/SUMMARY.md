# Project Research Summary

**Project:** ColaApp
**Domain:** Single-product, single-user local grocery offer tracker — scheduled serverless scrape + static PWA
**Researched:** 2026-06-15
**Confidence:** HIGH (stack, architecture, pitfalls); HIGH (features — scope is unusually well-defined)

## Executive Summary

ColaApp is a narrow, deliberate tool: one product (Coca-Cola 12×1L case), five fixed stores in Schifferstadt (PLZ 67105), one user (the author's brother). The canonical architecture for this class of problem is "baked data + static PWA": a scheduled GitHub Actions cron job produces plain JSON data files committed to the repo, and GitHub Pages serves both those files and the PWA shell — no live backend, no always-on compute, zero cost. The scraper and frontend are fully decoupled by a versioned JSON file contract, which is the single most important structural decision: get the schema right first and both sides can be built in parallel against mocks.

The recommended data source is the **marktguru.de unofficial JSON API** (`api.marktguru.de/api/v1/offers/search?q=coca+cola&zipCode=67105`) — a single endpoint that covers all five store groups including Wasgau (a regional chain that would otherwise require unreliable PDF/image OCR). Using this aggregator collapses five separate brittle scraping problems into one `fetch` call with no headless browser. The recommended frontend stack is Node 22 + native `fetch` for the scraper, Vite + vite-plugin-pwa (Workbox) for the PWA shell, and uPlot for the price-history chart. Everything is vanilla JS — no framework needed for a one-screen app.

The top risks are concentrated in the data layer: the marktguru endpoint is unofficial and can change; GitHub Actions cron is best-effort and auto-disables after 60 days of repo inactivity; service-worker caching can serve stale prices silently forever; and a naive product matcher will confuse the 12×1L case with 1.25L packs, can trays, or Pfand-inclusive prices. All of these have well-understood mitigations that must be designed in from day one, not retrofitted. A Phase 0 schema-contract spike and a Phase 1 data-source spike — confirming marktguru actually returns the 12×1L case for PLZ 67105 across all five stores, especially Wasgau — are prerequisites before committing to the data schema or building anything else.

## Key Findings

### Recommended Stack

The entire stack is one language (Node/JS) across scraper and frontend, which keeps the toolchain minimal and the shared JSON schema trivially reusable. Node 22 LTS provides native `fetch`/`undici` with no HTTP client dependency needed. The marktguru API requires fetching two auth keys (`x-apikey`, `x-clientkey`) from the marktguru homepage at runtime — not from a registration — then calling the search endpoint.

**Core technologies:**
- **Node.js 22 LTS**: Scraper runtime — native `fetch`, one language for scraper + frontend, first-class `actions/setup-node@v4` support
- **marktguru.de unofficial API** (`api.marktguru.de/api/v1`): Single data source for all 5 store groups — plain JSON, `zipCode` param, covers REWE/Edeka/Netto/Lidl/Kaufland/Aldi/Penny and Wasgau; eliminates 5 separate scrapers
- **GitHub Actions** (`schedule:` cron): Free, unlimited minutes on public repos; commits `current-offers.json` + `price-history.json` back to the repo on each run
- **GitHub Pages**: Free HTTPS static hosting (required for PWA installability); serves data files and PWA shell from the same origin, eliminating CORS
- **Vite 7.x + vite-plugin-pwa 1.x (Workbox 7)**: Zero-config PWA manifest + service worker; precaches app shell; runtime route for data files (network-first/stale-while-revalidate)
- **uPlot 1.6.x**: ~15–25 KB canvas chart for the price-history graph — primary recommendation; Chart.js 4.5 is the friendlier alternative at ~60 KB
- **zod 3.x**: Optional but recommended — validate marktguru response shape before writing data files; loud failure beats silent schema corruption

**What NOT to use:** Playwright/Puppeteer (300MB CI download, not needed when JSON is available), per-store direct scrapers as primary path (REWE moved to Cloudflare mTLS in 2024; Wasgau is PDF/image-only direct), React/Vue/Svelte (one screen, one chart), SQLite (overkill for 5 stores × weekly), axios/node-fetch (Node 22 has native fetch).

### Expected Features

**Must have (table stakes — v1):**
- Per-store current-offer cards (all 5 always rendered; greyed "kein Angebot" when no deal) — core view
- Best-current-deal highlight (min price among currently-valid, non-stale offers — upcoming excluded)
- Designed "no current offer anywhere" state — first-class UI state distinct from error; long dry spells are expected
- Upcoming offers section (future-dated validFrom; German leaflets publish ~1 week ahead)
- "Last updated" / staleness timestamp (from `generatedAt`; tiered: fresh → aging → stale banner)
- Offline display of last-fetched data (service worker cache; staleness timestamp makes it honest)
- PWA installability (manifest + SW + HTTPS → Android "Add to Home Screen")
- Price-history graph — minimum useful version (best-price-per-week line + offer dot markers; sparse-data handling at launch)
- At-a-glance hero answer ("REWE — 10,99€ (bis Sa)" or "Aktuell kein Angebot")

**Should have (v1.x — after validation):**
- Per-store history overlay lines; all-time-low reference line on graph; OS dark-mode via `prefers-color-scheme`; tiered staleness escalation banner

**Defer permanently (anti-features):** More stores, other products, other pack sizes, push notifications, accounts/login, shopping list, settings UI, i18n, map/directions, analytics. These are the growth features of marktguru and kaufDA — exactly the bloat this app exists to avoid.

**Critical UX distinction:** "No current offer" (fresh data, zero qualifying offers) and "data is stale/fetch failed" must be visually distinct first-class states. Conflating them destroys trust.

### Architecture Approach

This is a **baked-data / static-site-with-precomputed-data** architecture. Three data artifacts — `current-offers.json` (overwritten each run), `price-history.json` (append-only, idempotent dedupe by `(storeId, validFrom, validTo, price)`), and `status.json` (per-store health) — form the contract between scraper and PWA. Recommended repo layout: monorepo with `scraper/`, `web/`, `data/` at root; GitHub Pages via deploy-from-branch (Setup A), eliminating both CORS and the deploy-trigger-loop.

**Major components:**
1. **ETL Orchestrator** (`scraper/src/run.ts`) — runs each store adapter, isolates failures via `runAdapterSafe()`, merges results into data files, commits with `[skip ci]` via `GITHUB_TOKEN`
2. **Store Adapter (×5)** (`scraper/src/adapters/`) — one module per store implementing a shared `StoreAdapter` interface; failures are local and never abort the run
3. **Normalization Layer** — canonical `Offer` shape: price (excl. Pfand), `eurPerL` derived, `validFrom`/`validTo` as ISO date strings (Europe/Berlin local date), `isUpcoming` flag, `stale` flag for carried-forward data
4. **Data Artifacts** (`data/*.json`) — the file contract; the PWA only knows this shape; it never knows marktguru exists
5. **PWA Frontend** (`web/`) — fetches JSON, computes best deal, renders all UI states including "no offer" and stale; service worker handles offline
6. **GitHub Actions Workflows** — `scrape.yml` (cron, data producer) and `deploy.yml` (on web changes); kept separate to avoid retriggers

**Key patterns:** per-adapter fault isolation; overwrite-current + append-only-history with idempotent dedupe; file contract as API (schema-first, mockable, enables parallel build); `GITHUB_TOKEN` + `[skip ci]` + schedule-only trigger prevents deploy loops.

### Critical Pitfalls

1. **Wasgau OCR trap** — Direct site is PDF/image-only; OCR on German promo leaflets is unreliable. Avoid: marktguru covers Wasgau; if Cola coverage is absent there, show "unavailable" — do not build OCR.
2. **Wrong-SKU product matching** — "contains 'cola'" returns 1.25L packs, can trays, Zero, store brands. Avoid: require positive match on both pack count (`12`) AND unit size (`1l`/`1000ml`) PLUS explicit exclusion list. Store real captured fixtures in CI.
3. **GitHub Actions 60-day auto-disable** — scheduled workflows silently disabled after 60 days of no repo activity. Avoid: write a heartbeat timestamp to `status.json` on every run so every run produces a real commit.
4. **Service worker serves stale data forever** — cache-first SW keeps serving the cached data file. Avoid: network-first (or SWR + cache-bust) for data files; cache-first only for app shell. Verify on a real installed Android device.
5. **GitHub Pages `/repo/` base-path** — absolute paths 404, manifest `start_url: "/"` breaks SW scope. Avoid: relative paths; `start_url: "."` and `scope: "./"`. Consider user/org Pages or custom domain to serve at root.
6. **Append-only history accumulating duplicates** — daily runs produce 7 identical points per weekly offer; failed fetches produce €0 spikes. Avoid: upsert by `(storeId, validFrom, validTo, price)`; never write a price row for a failed fetch.
7. **Pfand and multi-buy price mangling** — Pfand (€3 on 12×1L) sometimes included/excluded; multi-buy shows per-unit-when-buying-N price. Avoid: one canonical price convention (excl. Pfand), stamp `pfandIncluded` and `isMultibuy` flags on every stored price.

## Implications for Roadmap

### Phase 0: Schema Contract and Mock Data
**Rationale:** The file contract is the keystone; freezing it first unblocks parallel scraper + PWA build and forces correctness decisions (Pfand convention, staleness fields, "no offer" vs "error" states) before any code depends on them.
**Delivers:** Frozen `data/*.json` schema with realistic mocks for all states (offer present, no offer, upcoming only, store errored, stale); shared TypeScript types; the contract both sides code to.
**Avoids:** Pitfalls 2, 3, 9, 10

### Phase 1: Data Source Spike (marktguru Verification)
**Rationale:** The entire strategy depends on marktguru returning the 12×1L case for PLZ 67105 across all five store groups. This must be proven before the schema is finalized or any production code is written. This is the highest-risk, highest-value validation in the project.
**Delivers:** Live API probe results: confirmed exact response field names, confirmed Wasgau Cola coverage (or explicit "unavailable" decision), real offer payloads as SKU-matcher fixtures, per-store data-source tier (A/B/C), regional confirmation (Edeka Südwest, Aldi Süd).
**Avoids:** Pitfalls 1, 2, 13, 14, 15
**Research flag:** THIS IS THE SPIKE. Cannot be planned around; must be executed and output must feed back into schema finalization before Phase 2 begins.

### Phase 2: Core Scraper (ETL + Matching + One Store Adapter)
**Rationale:** With schema fixed and marktguru confirmed, build the producer end-to-end for one store. The matching and normalization logic is the most correctness-sensitive work; it must be built, tested against real fixtures, and proven before adding more adapters.
**Delivers:** Working ETL orchestrator with `runAdapterSafe`, idempotent history dedupe, one functioning store adapter producing real `data/*.json` on the Phase 0 schema.
**Avoids:** Pitfalls 2, 3, 5, 10, 11

### Phase 3: PWA Frontend (against mock data)
**Rationale:** Parallel to Phase 2. The frontend codes to Phase 0 mocks; it does not wait for real scraper data. Building against mocks forces all UI states — "no offer", "upcoming only", "stale", "one store errored" — to be first-class from day one.
**Delivers:** Full PWA: hero answer, per-store cards (all states), upcoming section, price-history graph (uPlot + sparse-data handling), staleness indicator, offline via SW, installable on Android Chrome.
**Avoids:** Pitfalls 7 (SW cache strategy), 8 (base-path), 9 (staleness UI)

### Phase 4: GitHub Actions Wiring and First Real Data
**Rationale:** Connect the two tracks. This is where the system first runs end-to-end with real data and all the scheduling/commit/deploy mechanics are verified in production conditions.
**Delivers:** `scrape.yml` with cron, `GITHUB_TOKEN` `contents: write`, `[skip ci]`, keepalive heartbeat; GitHub Pages (Setup A); verified full loop: cron → scraper → commit → Pages → installed PWA shows new data.
**Avoids:** Pitfalls 4, 5, 6, 8

### Phase 5: Remaining Store Adapters
**Rationale:** Add Edeka/Netto, Lidl/Kaufland, Aldi/Penny, Wasgau one per increment, easiest to hardest. Wasgau last — highest risk of partial/absent Cola coverage. Each adapter is one file, fault-isolated.
**Delivers:** All 5 store groups in data; Wasgau shown as "unavailable" explicitly if marktguru Cola coverage is absent (not a bug — a designed state).
**Avoids:** Pitfall 1 (OCR trap)

### Phase 6: Hardening and Maintainer Observability
**Rationale:** Make the pipeline reliable for a solo maintainer who won't check the Actions tab. Silent failure is the worst outcome for a price-tracking app.
**Delivers:** Failure alerting (red run → owner email, debounced); schema validation (zod) before write; timezone correctness (Europe/Berlin, DST boundary) verified; staleness banner verified end-to-end.
**Avoids:** Pitfalls 5, 11, 12

### Phase Ordering Rationale
- Phase 0 before everything: schema is the API; changes after both sides are built are expensive
- Phase 1 before Phase 2: scraper cannot be correctly built without live marktguru field name confirmation and Wasgau coverage verdict
- Phase 3 parallel to Phase 2: Phase 0 mocks enable this; largest scheduling win in the project
- Phase 4 after both tracks: real data needed to verify the live loop
- Phase 5 after Phase 4: each new adapter added to a verified-working pipeline; failures immediately visible
- Phase 6 last: addresses failure modes that only surface in a running system

### Research Flags

Needs research / live probe:
- **Phase 1 (Data Source Spike):** Must be executed live before schema can be finalized. Block Phase 2 on its output.
- **Phase 4 (GitHub Pages wiring):** Pages source configuration options change periodically; verify current options at build time (MEDIUM confidence per ARCHITECTURE.md).

Standard patterns — skip research-phase:
- **Phase 0:** Schema fully specified across ARCHITECTURE.md and STACK.md
- **Phase 2:** marktguru integration pattern corroborated by multiple community repos; `runAdapterSafe` is standard
- **Phase 3:** Vite + vite-plugin-pwa + uPlot well-documented; only nuance is verifying on real installed Android device
- **Phase 5:** Mechanical adapter additions once orchestrator and interface exist
- **Phase 6:** Standard GitHub Actions failure-handling patterns

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All choices backed by package registries, official docs, multiple community sources. marktguru API longevity is the one MEDIUM uncertainty — it is unofficial but corroborated by multiple independent repos. |
| Features | HIGH | Scope is unusually well-defined in PROJECT.md. Feature set is a direct translation of requirements. Open question (Wasgau coverage) resolved by Phase 1 spike. |
| Architecture | HIGH (core) / MEDIUM (Pages deploy specifics) | "Baked data + static PWA" is standard and proven. Pages source config options change periodically — verify at build time. |
| Pitfalls | HIGH | All critical pitfalls corroborated by official GitHub docs, community discussions, and established PWA guidance. marktguru-specific pitfalls are MEDIUM (unofficial endpoint). |

**Overall confidence:** HIGH

### Gaps to Address

- **marktguru field names:** Exact JSON field names (`validFrom`/`validTo` vs `expires` or other variants; `advertisers[].name` vs `retailer.name`) must be verified live in Phase 1. Treat Phase 0 schema as a draft until Phase 1 closes.
- **Wasgau Cola coverage:** marktguru indexes Wasgau Bäckerei/Metzgerei leaflets; whether the 12×1L Coca-Cola case appears at PLZ 67105 is unconfirmed. If absent, Wasgau's card must show "nicht automatisch verfügbar" as a permanent designed state.
- **marktguru auth key stability:** `x-apikey`/`x-clientkey` are scraped from the homepage at runtime. If marktguru hardens this, the key-fetch step breaks. Mitigation: cache per-run, add schema validation (zod) that fails loudly on bad responses, have per-store fallback documented (Aldi Süd direct JSON most viable).
- **REWE direct fallback:** If marktguru drops REWE, the direct API requires a community-maintained Cloudflare mTLS client certificate. Fragile; treat as last resort, not planned fallback. Accept partial coverage before maintaining a cert.

## Sources

### Primary (HIGH confidence)
- GitHub Docs — Actions billing, cron behavior, workflow syntax, Pages deploy, GITHUB_TOKEN scopes
- web.dev — Service worker caching and HTTP caching (cache strategy by resource type)
- npm / package registries — `vite-plugin-pwa@1.x`, `chart.js@4.5.0`, `cheerio@1.2.0`, `uplot@1.6.x` versions and compatibility
- GitHub Community discussions (#156282, #194300, #57858, #32197) — cron delay/skip, 60-day disable, commit-back loop patterns
- PROJECT.md — Scope, constraints, known risks (primary ground truth)

### Secondary (MEDIUM confidence)
- `sydev/marktguru`, `Nusscookie/offers-api`, `manmal/marktguru-cli` — marktguru endpoint path, auth key scrape pattern, response shape
- marktguru.de retailer pages for Wasgau (`/r/wasgau`) and Penny — confirms aggregator coverage
- `ByteSizedMarius/rewerse-engineering`, `foo-git/rewe-discounts` — REWE Cloudflare mTLS since 2024
- German web-scraping legal commentary (§87b UrhG database right; robots.txt as intent signal)
- kaufDA and marktguru app store listings — feature set analysis

### Tertiary (LOW confidence / needs live validation)
- Wasgau Cola coverage on marktguru at PLZ 67105 — inferred; unconfirmed until Phase 1 spike
- Regional retail structure (Edeka Südwest, Aldi Süd territory) — general domain knowledge; needs Phase 1 confirmation

---
*Research completed: 2026-06-15*
*Ready for roadmap: yes — pending Phase 1 spike output for schema finalization*
