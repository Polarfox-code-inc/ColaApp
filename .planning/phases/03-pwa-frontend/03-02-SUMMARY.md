---
phase: 03-pwa-frontend
plan: 02
subsystem: pwa-derivation
tags: [pure-logic, tdd, de-DE, intl, derivation, formatting]
requires:
  - contract/types.d.ts (StoreOffer/StoreStatus shapes, integer-cents, ISO-UTC)
  - scraper/normalize.mjs (berlinDay Intl en-CA pattern, analog)
  - mocks/current-offers.offer.json, mocks/current-offers.upcoming.json, mocks/status.stale.json
  - data/status.json (fresh per-store lastUpdated fixture)
provides:
  - "web/src/derive/derive.js: berlinToday, isActive, isUpcoming, isStale, bestDeal, soonestUpcoming, sortCards"
  - "web/src/format/format.js: formatPrice, formatPerLitre, formatDate, formatWeekdayShort, formatValidUntil, formatTimestamp"
affects:
  - "Plan 03 (chart) and Plan 04 (render) consume these pure derived facts + formatters"
tech-stack:
  added: []
  patterns:
    - "Clock-injection: no internal new Date() (default param only); now/today threaded through"
    - "Berlin-day via Intl.DateTimeFormat en-CA Europe/Berlin (never UTC slice)"
    - "Date-only formatted at UTC-noon with timeZone:UTC to prevent host-TZ drift"
    - "node:test + node:assert/strict, fixed NOW, readJson from repo-root fixtures"
key-files:
  created:
    - web/src/derive/derive.js
    - web/src/format/format.js
    - web/test/derive.test.mjs
    - web/test/format.test.mjs
  modified: []
decisions:
  - "bestDeal eligibility is isActive only (D-06): a future-validFrom offer never wins the hero; it surfaces solely via soonestUpcoming"
  - "isStale reads the PER-STORE lastUpdated, never the file-level timestamp (D-16 / Pitfall 1)"
  - "Every active/upcoming/best-deal predicate funnels through isCleanOffer (status==='offer' && !needsReview) so a quarantined offer can never leak (Pitfall 2 / T-03-04)"
  - "de-DE Intl currency emits a non-breaking space (U+00A0/U+202F) before €; normalized to ASCII space to match the D-04 spec strings"
  - "A needsReview 'offer' buckets to no_offer in sortCards (neither active nor upcoming)"
metrics:
  duration: ~5 min
  tasks: 2
  files: 4
  tests: 30
  completed: 2026-06-15
---

# Phase 3 Plan 2: Pure Derivation + de-DE Formatting Layer Summary

The testable heart of the PWA: two pure, clock-injected modules — `derive.js` (best-deal,
upcoming/active split, per-store staleness, card sort) and `format.js` (de-DE Intl price/date/
timestamp formatters) — with 30 node:test assertions locking the six research-flagged correctness
landmines so the render (Plan 04) and chart (Plan 03) layers can trust the derived facts.

## What Was Built

### Task 1 — `web/src/derive/derive.js` (+ `web/test/derive.test.mjs`)
Seven exported pure functions plus an internal `bucket`/`isCleanOffer`:
- `berlinToday(now)` — Intl `en-CA` `Europe/Berlin` → `YYYY-MM-DD`; `2026-06-14T22:00:00Z` correctly rolls to `2026-06-15` (CEST), never a UTC slice.
- `isActive(o,today)` / `isUpcoming(o,today)` — both gate on `status==='offer' && !needsReview` then string-compare Berlin dates. Edeka (`needsReview:true`) is excluded even when its dates are active.
- `bestDeal(stores,today)` — cheapest **active** offer; **D-06**: a future-validFrom (upcoming) offer is never eligible and never wins the hero (returns `null` when nothing is active).
- `soonestUpcoming(stores,today)` — earliest `validFrom` among upcoming.
- `isStale(storeStatus,now,days=3)` — **D-16** ISO-millisecond math on the **per-store** `lastUpdated` (not the file-level stamp) vs an injectable `now`, 3-day default.
- `sortCards(stores,today)` — rank `active(0,cheapest-first) → upcoming(1) → no_offer(2) → unavailable/error(3)`, returns a new array.

### Task 2 — `web/src/format/format.js` (+ `web/test/format.test.mjs`)
Six exported de-DE formatters (**D-04**):
- `formatPrice(999) → "9,99 €"`, `formatPerLitre(83) → "0,83 €/l"` (integer cents ÷ 100, Intl `de-DE`).
- `formatDate("2026-06-21") → "21.06.2026"`, `formatWeekdayShort("2026-06-21") → "So"` (Intl-computed; the UI-SPEC's hardcoded "Sa" was wrong), `formatValidUntil("2026-06-21") → "So 21.06."`.
- `formatTimestamp("2026-06-15T04:00:00Z") → "15.06.2026 06:00 Uhr"` — Berlin-converted via `formatToParts` (D-17).

Date-only formatters parse at UTC-noon and format with `timeZone:UTC` so the rendered day cannot drift under the host timezone.

## TDD Flow

Both tasks followed RED → GREEN (no refactor needed — code was clean on first green):

| Gate | Commit | Notes |
|------|--------|-------|
| RED (derive) | `3ad5608` | `test(03-02)` — 20 assertions, failed on missing module |
| GREEN (derive) | `0afdae6` | `feat(03-02)` — 20/20 pass |
| RED (format) | `54299ca` | `test(03-02)` — 10 assertions, failed on missing module |
| GREEN (format) | `27fadd1` | `feat(03-02)` — 10/10 pass |

Full suite: `cd web && node --test test/derive.test.mjs test/format.test.mjs` → **30 pass, 0 fail**.

## Acceptance Criteria — all met
- `bestDeal` on the offer mock at `2026-06-16` returns REWE (999), not Edeka (1099, needsReview) — asserted.
- **D-06**: upcoming-mock REWE at `2026-06-15` is classified upcoming and `bestDeal` returns `null` — asserted.
- **D-16**: `status.stale.json` REWE (2026-06-05) is stale vs `data/status.json` REWE (2026-06-15) fresh against the same `NOW` — asserted.
- `berlinToday(new Date('2026-06-15T10:00:00Z')) === '2026-06-15'` — asserted.
- `derive.js` has no internal `new Date()` except default params / operating on the passed arg.
- **D-04** exact strings (`9,99 €`, `0,83 €/l`, `21.06.2026`, `So`, `15.06.2026 06:00 Uhr`) — asserted.
- `format.js` computes the weekday via Intl (no hardcoded weekday array/map).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected the test fixture relative path.**
- **Found during:** Task 1.
- **Issue:** The plan's `<action>` suggested resolving repo-root fixtures via `../../../mocks` from `web/test/`. That path resolves to `D:/codingprojects/mocks` (one level too high) — fixtures live at the repo root `mocks/`.
- **Fix:** Used `join(__dirname, "..", "..")` (`web/test → web → repo root`) so `mocks/…` and `data/…` resolve correctly.
- **Files:** `web/test/derive.test.mjs`.
- **Commit:** `3ad5608`.

**2. [Rule 1 - Bug] Normalized the de-DE currency non-breaking space.**
- **Found during:** Task 2 (GREEN).
- **Issue:** `Intl.NumberFormat('de-DE',{style:'currency'})` emits a non-breaking space (U+00A0, narrow NBSP U+202F in newer ICU) before `€`, so `formatPrice(1000)` produced `"10,00 €"`, failing the D-04 assertion that expects a plain ASCII space.
- **Fix:** Added a `normalizeSpaces` helper that maps NBSP variants to a regular space; wired into `formatPrice`.
- **Files:** `web/src/format/format.js`.
- **Commit:** `27fadd1`.

**3. [Rule 1 - Bug] Removed a doubled period in `formatValidUntil`.**
- **Found during:** Task 2 (GREEN).
- **Issue:** de-DE `{day,month}` already renders a trailing dot (`21.06.`), so appending `.` produced `So 21.06..`.
- **Fix:** Dropped the manual trailing dot.
- **Files:** `web/src/format/format.js`.
- **Commit:** `27fadd1`.

## Threat Mitigations Verified
- **T-03-03** (staleness from wrong timestamp) — `isStale` reads only the per-store `lastUpdated`; a test constructs a fresh file-level / stale per-store mix and asserts `true`.
- **T-03-04** (needsReview leaks into hero/cards) — every predicate funnels through `isCleanOffer`; the Edeka exclusion is asserted in `bestDeal`, `isActive`, and `isUpcoming`.

## Known Stubs
None. Both modules are fully implemented pure logic; no placeholder data, no UI wiring deferred here (wiring is Plan 04's job).

## Verification
```
cd web && node --test test/derive.test.mjs test/format.test.mjs
# tests 30 | pass 30 | fail 0
```

## Self-Check: PASSED
All 4 created files exist on disk and all 4 task commits (3ad5608, 0afdae6, 54299ca, 27fadd1) are present in git history.
