---
phase: 01-data-contract-source-spike
plan: 01
subsystem: data-source-spike
tags: [marktguru, scaffold, spike, node22, zod]
requires: []
provides:
  - Node 22 ESM scaffold (zod@^3.25 pinned, node:test wired)
  - Live marktguru probe (spike/probe.mjs)
  - Captured raw payload fixture (spike/fixtures/raw-67105-search.json)
  - Authoritative live findings (spike/findings.md): wrapper key, 5-store slug map, Wasgau verdict, validityDates granularity, price type, positive-fixture status
affects:
  - "01-02 frozen-contract-schema: freezes data.results wrapper, slug allow-list, validityDates Berlin normalization, Math.round(price*100) cents"
  - "01-03 strict-matcher: uses captured negative corpus + synthesizes positive fixture from RESEARCH (no real 12x1L case this week)"
tech_stack:
  added:
    - "zod@^3.25 (validation, pinned to v3 line)"
  patterns:
    - "Native fetch only (no axios/node-fetch) per CLAUDE.md"
    - "node:test as test runner (no vitest/jest)"
    - "ESM (type: module)"
    - "Two-step marktguru auth: scrape homepage JSON-island keys -> call /offers/search with x-apikey/x-clientkey"
key_files:
  created:
    - package.json
    - package-lock.json
    - .gitignore
    - .nvmrc
    - spike/probe.mjs
    - spike/README.md
    - spike/fixtures/raw-67105-search.json
    - spike/findings.md
  modified: []
decisions:
  - "Response offers array lives at data.results (not data.data, not bare array)"
  - "Wasgau -> status: unavailable (D-05/OFFR-04); OCR explicitly out of scope"
  - "validityDates is array of {from,to} ISO-UTC datetimes; 22:00:00Z == Berlin midnight -> day-granular in Europe/Berlin; trim to YYYY-MM-DD in Berlin tz"
  - "price is decimal euro -> Math.round(price*100) cents conversion (D-09) confirmed correct"
  - "No real 12x1L Coca-Cola case on sale this week -> Plan 03 synthesizes the positive accept-fixture from documented RESEARCH live strings (labelled synthesized-from-real)"
metrics:
  duration: "~1 session (multi-segment, paused at human-verify checkpoint)"
  completed: 2026-06-15
  tasks: 3
  files: 8
---

# Phase 01 Plan 01: Scaffold & Live marktguru Probe Summary

Stood up the Node 22 ESM scaffold (zod pinned, native fetch, node:test) and ran the live marktguru `/offers/search` probe for PLZ 67105, capturing the real payload as a committed fixture and recording the four live-only unknowns (wrapper key, advertiser slugs, Wasgau verdict, validityDates granularity) plus price type and positive-fixture status in `spike/findings.md` — replacing CLAUDE.md's MEDIUM-confidence guesses with real data before Plans 02/03 freeze the contract and matcher.

## What Was Built

- **Scaffold (Task 1):** `package.json` (`type: module`, `engines.node >=22`, `test`/`probe` scripts), `zod@^3.25` pinned, `package-lock.json`, `.nvmrc` (`22`), `.gitignore` excluding `node_modules/`, `.env`, `*.key`. No axios/node-fetch/vitest/jest.
- **Probe (Task 2):** `spike/probe.mjs` — `getKeys()` scrapes the homepage `<script type="application/json">` bootstrap island for `config.apiKey`/`config.clientKey` (try/catch per block, no eval), then fetches `/offers/search?q=coca cola&zipCode=67105` with `x-apikey`/`x-clientkey` and a descriptive User-Agent. Writes the raw payload to `spike/fixtures/raw-67105-search.json`, logs `Object.keys(data)`, resolves the offers array via `data.results ?? data.data ?? data`, and prints distinct `advertisers[].uniqueName`. Never logs/writes keys. Single low-volume request. `spike/README.md` documents re-run + good-citizen cadence.
- **Fixture (Task 2 artifact):** `spike/fixtures/raw-67105-search.json` — 20-result live payload, the field-name source of truth.
- **Findings (Task 3):** `spike/findings.md` — authoritative answers feeding Plans 02/03.

## Live Findings (PLZ 67105, 2026-06-14 -> 2026-06-20 cycle)

1. **Wrapper key:** `data.results` (top keys: filters, totalResults, skippedResults, results; 20 results, totalResults 20).
2. **Advertiser slugs seen:** edeka, kaufland, netto-marken-discount, penny, rewe, scheck-in-center, thomas-philipps.
3. **Five-store verdicts:** REWE -> present (`rewe`); Edeka -> present (`edeka`); Lidl -> not present this week; Kaufland -> present (`kaufland`); Wasgau -> absent -> `status: unavailable` (no OCR).
4. **validityDates:** array of `{from,to}` full ISO-UTC datetimes (e.g. `2026-06-14T22:00:00Z` -> `2026-06-20T21:59:00Z`); 22:00:00Z == Berlin midnight -> day-granular in Europe/Berlin; trim to YYYY-MM-DD in Berlin tz; pick current-or-next range.
5. **price:** decimal euro number (5.99, 0.79, 8.88) -> confirms `Math.round(price*100)` cents (D-09). `referencePrice` (EUR/l) and `unit.shortName "l"` also present.
6. **Positive fixture:** ZERO real 12x1L cases this week (all Cola offers are disqualifiers: 1.25L bottles, cans, 6x/10x/18x packs, mixer bundles). Plan 03 must synthesize the positive fixture from RESEARCH live strings (labelled synthesized-from-real). Captured fixture serves as the negative/quarantine corpus; mixed-brand "oder Fanta/Mezzo Mix" entries are needsReview candidates.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Scaffold Node 22 project (zod pinned, node:test) | 790b6fd | package.json, package-lock.json, .gitignore, .nvmrc |
| 2 | Live marktguru probe + README | 6bb5ac0 | spike/probe.mjs, spike/README.md |
| 2 (artifact) | Capture live /offers/search payload fixture | 97cb7d1 | spike/fixtures/raw-67105-search.json |
| 3 | Record live findings into spike/findings.md | 65c7157 | spike/findings.md |

## Verification

- `npm test` -> exit 0 (0 tests; matcher tests land in Plan 03 — acceptable per plan).
- `spike/fixtures/raw-67105-search.json` exists and is valid JSON.
- `spike/findings.md` answers all four open questions + price type + positive-fixture status.
- No `apiKey`/`clientKey` value, no `*.key`/`.env` file under version control.

## Deviations from Plan

None - plan executed as written. Execution paused at the Task-2/Task-3 blocking human-verify checkpoint (network access to marktguru cannot be guaranteed in the build sandbox); the user ran the probe on their machine, returned the recorded findings ("approved"), and a continuation executor completed Task 3.

## Authentication Gates

None.

## Known Stubs

None. `spike/findings.md` contains real observed data; no placeholder values flow to any consumer. The absence of a positive 12x1L fixture is a documented real-world condition (no such offer this week), explicitly handed to Plan 03 to synthesize from RESEARCH — not a stub.

## Notes for Downstream Plans

- **Plan 02 (contract):** read offers from `data.results`; filter to slug allow-list `{rewe, edeka, lidl, kaufland, wasgau}`; normalize validityDates to YYYY-MM-DD in Europe/Berlin; convert price via `Math.round(price*100)`; model Wasgau as `status: "unavailable"`.
- **Plan 03 (matcher):** use `raw-67105-search.json` as the negative/quarantine corpus; synthesize the positive 12x1L accept-fixture from RESEARCH "Strict 12x1L Matcher" strings (label `synthesized-from-real`); treat mixed-brand "Coca-Cola oder Fanta/Mezzo Mix" entries as `needsReview`.

## Self-Check: PASSED

All created files verified present on disk; all task commits (790b6fd, 6bb5ac0, 97cb7d1, 65c7157) verified in git history.
