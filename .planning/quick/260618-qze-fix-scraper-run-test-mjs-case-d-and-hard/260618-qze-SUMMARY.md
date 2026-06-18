---
quick_id: 260618-qze
slug: fix-scraper-run-test-mjs-case-d-and-hard
date: 2026-06-18
status: complete
files_modified:
  - test/scraper.run.test.mjs
commits:
  - 1dcc19a  # test(scraper): seed run Case D/G from mocks, not live scraped data
---

# Quick Task 260618-qze — Summary

## What was wrong

`test/scraper.run.test.mjs` Case D seeded its prior snapshot by reading the **live**
`data/current-offers.json` / `data/status.json` / `data/price-history.jsonl` and assumed REWE held a
prior **offer**, so the carry-forward assertions (`deepEqual(co.REWE, priorRewe)`, `status==="error"`,
frozen ts) could pass. The scheduled scrape drifted REWE to `no_offer`, invalidating the premise — the
test failed at HEAD independent of any other change. Case G shared the same live-file coupling.

## What was done

Seed both cases from committed, stable fixtures instead of the live `data/*` files:
- `mocks/current-offers.offer.json` — REWE is a clean prior offer (999, 06-16..06-21, needsReview:false);
  5 stores incl. Wasgau unavailable.
- `mocks/status.stale.json` — REWE status offer, frozen `lastUpdated` 2026-06-05T04:00:00Z.
- Case D's history seed is now an inline valid D-14 line (REWE 999) rather than the live JSONL.

`priorRewe` / `priorReweTs` derive from those same mock strings, so the carry-forward checks are
deterministic and immune to scrape drift. Case G keeps its drifted-REWE override but sources its base
snapshot from the mocks too (it was one scrape away from the same break).

## Verification

- `node --test test/scraper.run.test.mjs` → **7/7 pass** (was 6/7).
- `npm test` (root, incl. web tests via recursive discovery) → **169/169 pass**.
- Stable on re-run regardless of the current live `data/*` contents.

## Commit

- `1dcc19a` test(scraper): seed run Case D/G from mocks, not live scraped data.
