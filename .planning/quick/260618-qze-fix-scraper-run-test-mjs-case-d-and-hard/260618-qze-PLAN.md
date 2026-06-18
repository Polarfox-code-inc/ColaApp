---
quick_id: 260618-qze
slug: fix-scraper-run-test-mjs-case-d-and-hard
date: 2026-06-18
type: quick
autonomous: true
files_modified:
  - test/scraper.run.test.mjs
---

# Quick Task 260618-qze: De-couple scraper.run Case D/G from live scraped data

## Problem

`test/scraper.run.test.mjs` Case D ("total fetch failure with a prior snapshot carries offers
forward...") seeds its prior state by reading the **live** `data/current-offers.json`,
`data/status.json`, and `data/price-history.jsonl`. It assumes REWE has a prior **offer** so the
carry-forward assertions (`deepEqual(co.REWE, priorRewe)`, `status==="error"`, frozen ts) hold.
The scheduled scrape has since set REWE to `no_offer`, so the premise is invalid and the test fails
(verified failing at HEAD, independent of any other change). Case G shares the identical live-file
coupling and is one scrape away from the same break.

## Fix

Seed both cases from **committed, stable fixtures** instead of the live `data/*` files:
- `mocks/current-offers.offer.json` — REWE is a clean prior offer (status offer, 999, 06-16..06-21,
  needsReview:false); 5 stores incl. Wasgau unavailable.
- `mocks/status.stale.json` — REWE status offer, frozen `lastUpdated` 2026-06-05T04:00:00Z.
- Case D's history seed: an inline valid D-14 line (REWE 999) rather than the live JSONL.

`priorRewe` / `priorReweTs` are then read from the same mock strings, so the carry-forward
assertions are deterministic and immune to scrape drift. Case G keeps its drifted-REWE override but
sources its base snapshot from the mocks too.

## Tasks

1. Rewrite Case D's seeding + prior-extraction to use `mocks/current-offers.offer.json` +
   `mocks/status.stale.json` + an inline history line. (atomic commit)
2. Point Case G's base snapshot at the same mocks. (same commit — one coherent de-coupling)

## Verification

- `node --test test/scraper.run.test.mjs` — all cases green (was 6/7).
- `npm test` (root) green; `cd web && npm test` still 57/57 (untouched).
- Re-run is stable regardless of what the live `data/*` files currently hold.
