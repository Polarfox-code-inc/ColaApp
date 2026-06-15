---
phase: 02-core-scraper
plan: 01
subsystem: scraper
tags: [scraper, pure-transform, normalize, select, dedup, tdd]
requires:
  - contract/schema.mjs (parseCurrentOffers, parseHistoryLine)
  - contract/matcher.mjs (classify)
provides:
  - scraper/clock.mjs (systemNow injectable now seam)
  - scraper/normalize.mjs (berlinDay, toStoreOffer)
  - scraper/filter.mjs (filterToAllowList)
  - scraper/select.mjs (selectForStore)
  - scraper/dedup.mjs (historyLinesToAppend, keyOf)
affects:
  - scraper/index.mjs (Plan 02 orchestrator composes these)
  - scraper/merge.mjs (Plan 02 consumes selectForStore output)
  - scraper/io.mjs (Plan 02 appends dedup line strings)
tech-stack:
  added: []
  patterns:
    - "Injectable clock seam: pure modules receive now, never call new Date()"
    - "Intl.DateTimeFormat en-CA/Europe/Berlin for calendar-day trim (never UTC slice)"
    - "Numbered decision-ladder mirroring contract/matcher.classify()"
    - "Validate-before-emit: parseHistoryLine throws on drift before stringify"
key-files:
  created:
    - scraper/clock.mjs
    - scraper/normalize.mjs
    - scraper/filter.mjs
    - scraper/select.mjs
    - scraper/dedup.mjs
    - test/scraper.normalize.test.mjs
    - test/scraper.select.test.mjs
    - test/scraper.dedup.test.mjs
  modified: []
decisions:
  - "select.mjs reuses frozen classify() verbatim — no size/brand regex re-implemented"
  - "displayName === store identity for v1 (Open Q2)"
  - "no_offer signal is { status: 'no_offer' } with no offer fields (schema-valid)"
metrics:
  duration: ~10 min
  completed: 2026-06-15
  tasks: 3
  files: 8
  tests: "65/65 green (3 new suites: 9 + 10 + 8 = 27 new assertions)"
---

# Phase 2 Plan 01: Scraper Pure-Transform Core Summary

Built the side-effect-free, offline-testable core of the marktguru scraper: an injectable clock seam, an offer-to-StoreOffer normalizer (integer cents, cents/litre, Berlin-trimmed dates, no pfand), a 5-store allow-list filter, the active-first/upcoming/lowest-price/needsReview selection ladder, and frozen-key deduplicated price-history line emission — all reusing the frozen Phase 1 `contract/schema.mjs` and `contract/matcher.mjs` verbatim.

## What Was Built

**Task 1 — clock + normalize** (`scraper/clock.mjs`, `scraper/normalize.mjs`)
- `systemNow()` is the single injectable "now" seam; every pure module takes `now` as a parameter so the whole pipeline is deterministic against fixtures.
- `berlinDay(iso)` uses a module-level `Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", ... })` — never a UTC `.slice(0,10)`. Proven: `2026-06-14T22:00:00Z` -> `2026-06-15` (Berlin CEST midnight boundary), `2026-06-20T21:59:00Z` -> `2026-06-20`.
- `toStoreOffer(offer, range)` emits a `status:"offer"` StoreOffer: `price = Math.round(price*100)` integer cents (D-09), `pricePerLitre = Math.round(price/12)` cents (D-11), `currency:"EUR"`, Berlin-trimmed `validFrom`/`validTo` from the chosen range, `displayName === store`, `needsReview:false`, and **no pfand/deposit key** (D-10). A normalized offer round-trips through `parseCurrentOffers` without throwing.

**Task 2 — filter + select** (`scraper/filter.mjs`, `scraper/select.mjs`)
- `filterToAllowList(results)` buckets raw offers by the 4 marktguru slugs (`rewe/edeka/lidl/kaufland` -> store names), pre-seeding all four keys. Wasgau is intentionally absent (D-03); out-of-scope advertisers (netto-marken-discount, penny, scheck-in-center, thomas-philipps) match no bucket and are dropped.
- `selectForStore(candidates, now)` is a numbered decision ladder mirroring `classify()`: partition by the frozen `classify()` into accept/review (drop reject); rank accepts active-covers-today before upcoming, tie-break earliest start then lowest price; emit a review candidate with `needsReview:true` ONLY when no clean accept exists (a clean accept always wins, D-08); else return `{ status:"no_offer" }`. Multi-range `validityDates` arrays are fully iterated (Pitfall 5). Receives `now` as a parameter — no `new Date()` in the module.

**Task 3 — dedup** (`scraper/dedup.mjs`)
- `keyOf(entry)` = the frozen `${store}|${price}|${validFrom}` (D-14).
- `historyLinesToAppend(offers, existingKeys, now)` filters to `status:"offer" && !needsReview` (upcoming included), skips keys already in the `existingKeys` Set (DATA-04), validates each object via `parseHistoryLine` before `JSON.stringify` (T-02-01), and returns the line strings (no disk I/O — that is Plan 02's io.mjs). A re-run with seeded keys yields zero new lines; needsReview / no_offer / unavailable / error entries yield none.

## How It Works

- TDD throughout: each task committed a failing `test(...)` (RED) then a `feat(...)` (GREEN). No refactor commits were needed — modules were clean on first GREEN.
- Frozen-contract reuse: `select.mjs` imports `classify` from `contract/matcher.mjs`; `dedup.mjs` imports `parseHistoryLine` and `normalize.mjs` exposes `berlinDay`/`toStoreOffer` for both select and dedup to share. No matching or schema logic was re-implemented.
- Field names verified live against `spike/fixtures/raw-67105-search.json`: `advertisers[].uniqueName` (slug), `validityDates: [{from,to}]` ISO-UTC, decimal `price`.

## Deviations from Plan

None — plan executed exactly as written.

## TDD Gate Compliance

All three tasks followed RED -> GREEN. Per-task commits present in git log:
- Task 1: `2894a05` (test/RED) -> `7803565` (feat/GREEN)
- Task 2: `fd9638c` (test/RED) -> `3904c17` (feat/GREEN)
- Task 3: `0f020a1` (test/RED) -> `eebbb66` (feat/GREEN)

## Verification

- `npm test` (full suite): **65/65 green** — the frozen Phase 1 `test/schema.test.mjs` + `test/matcher.test.mjs` did NOT regress; 27 new assertions across 3 new suites pass.
- No new runtime dependency: `zod` remains the only dep; new modules import only `contract/*` and Node built-ins.
- All acceptance criteria met: `Intl`/`Europe/Berlin` present and no UTC `.slice(0,10)` ISO-trim in normalize; `select.mjs` imports `classify` and contains zero non-comment `new Date(` calls; dedup imports `parseHistoryLine`; re-run yields empty array; needsReview excluded.

## Self-Check: PASSED

Created files (all FOUND): scraper/clock.mjs, scraper/normalize.mjs, scraper/filter.mjs, scraper/select.mjs, scraper/dedup.mjs, test/scraper.normalize.test.mjs, test/scraper.select.test.mjs, test/scraper.dedup.test.mjs.

Commits (all present in git log): 2894a05, 7803565, fd9638c, 3904c17, 0f020a1, eebbb66.
