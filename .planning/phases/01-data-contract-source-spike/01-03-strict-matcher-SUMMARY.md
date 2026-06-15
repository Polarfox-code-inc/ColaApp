---
phase: 01-data-contract-source-spike
plan: 03
subsystem: matcher
tags: [matcher, regex, tdd, node-test, esm, data-02, fixtures]

# Dependency graph
requires:
  - phase: 01-01-scaffold-live-probe
    provides: "Captured raw marktguru payload (spike/fixtures/raw-67105-search.json) + finding that pack size lives in description, not title; no real 12x1L case live this week"
provides:
  - "Pure network-free strict 12x1L Coca-Cola matcher (contract/matcher.mjs): classify(offer) -> accept|reject|review + normalize(offer)"
  - "12 labelled fixtures (3 accept / 7 reject / 2 review) mirroring the marktguru Offer shape, each tagged captured-live or synthesized-from-real-text"
  - "node:test matcher suite (15 tests) pinning the accept/reject/review boundary for DATA-02"
affects: [02-core-scraper]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure classify(offer) over a normalized brand+title+description text blob (NOT title-only)"
    - "Linear/anchored regex families (IS_12x1L, DISQUALIFY, STORE_BRAND, MIXED_BRAND, COCA_COLA_BRAND, CASE_WORD) — ReDoS-safe"
    - "Ordered decision gates: store-brand -> non-CocaCola -> mixed-brand review -> disqualifier reject -> 12x1L accept -> case-word review -> reject"
    - "TDD RED (failing fixtures+test) -> GREEN (implement) with fixtures/verdicts pinned before code"
    - "Fixtures labelled captured-live vs synthesized-from-real-text; nothing invented"

key-files:
  created:
    - contract/matcher.mjs
    - test/matcher.test.mjs
    - spike/fixtures/README.md
    - spike/fixtures/accept/classic-12x1l.json
    - spike/fixtures/accept/zero-12x1l.json
    - spike/fixtures/accept/light-12x1l.json
    - spike/fixtures/reject/bottle-125l.json
    - spike/fixtures/reject/sixpack-033.json
    - spike/fixtures/reject/tray-10x033.json
    - spike/fixtures/reject/wholesale-24x033.json
    - spike/fixtures/reject/case-12x05l.json
    - spike/fixtures/reject/case-6x1l.json
    - spike/fixtures/reject/store-brand-cola.json
    - spike/fixtures/review/mixed-brand-12x1l.json
    - spike/fixtures/review/kasten-no-size.json
  modified: []

decisions:
  - "Brand gate runs FIRST (store-brand reject before any size check) so a size-matching store cola (e.g. 'River Cola 12 x 1 l') can never slip through (D-07)"
  - "6x1L rejects via DISQUALIFY (\\b6\\s*x) being true while IS_12x1L is false — no separate 6x1L rule needed"
  - "Accept fixtures synthesized-from-real (RESEARCH '12 x 1-l case') because zero real 12x1L cases were on sale at 67105 this week (findings.md S6); all labelled, none invented"
  - "Mixed-brand quarantine fires only when a case signal (12x1L token OR kasten/case word) co-occurs with sibling-brand phrasing, so a plain 6-pack 'oder Fanta' still rejects on size"

metrics:
  duration: ~12 min
  completed: 2026-06-15
  tasks: 2
  files: 15
---

# Phase 1 Plan 3: Strict 12×1L Coca-Cola Matcher Summary

Pure, network-free `classify(offer) -> "accept" | "reject" | "review"` (DATA-02) that reads the marktguru offer's normalized brand+title+**description** text — flavor-permissive (Classic/Zero/Light), strict on pack size, quarantining mixed-brand/ambiguous-size offers as needsReview — proven by TDD against 12 labelled real-derived fixtures.

## What Was Built

- **`contract/matcher.mjs`** — exports `normalize(offer)` (joins `brand.name` + `product.name` + `product.description` + `description`, lowercases, unifies `×`→`x`, collapses whitespace) and `classify(offer)`. Internal regex families: `IS_12x1L`, `DISQUALIFY`, `COCA_COLA_BRAND`, `STORE_BRAND`, `MIXED_BRAND`, `CASE_WORD`. Decision order: store-brand → non-Coca-Cola → mixed-brand+case → disqualifier-without-clean-12x1L → 12x1L → kasten/case-word → reject. Pfand text is never parsed or branched on (D-10).
- **12 fixtures** mirroring the marktguru `Offer` shape, each carrying `_label` (`captured-live` | `synthesized-from-real-text`) and `_source` meta keys the matcher ignores:
  - accept (3): Classic/Zero/Light at `12 x 1-l` (D-06); the Classic fixture embeds `zzgl. 3,30 Pfand` to prove D-10.
  - reject (7): `1,25-l` bottle, `6 x 0,33`, `10 x 0,33`, `24 x 0,33` wholesale, `12 x 0,5-l`, `6 x 1-l`, store-brand (`ja!`/River Cola at `12 x 1 l`).
  - review (2): mixed-brand `oder Fanta/Sprite/Mezzo Mix 12 x 1-l`, and `Kasten` with no per-bottle size.
- **`spike/fixtures/README.md`** — labels every fixture's origin string.
- **`test/matcher.test.mjs`** — `node:test` loops every fixture and asserts the verdict, plus a D-10 Pfand-invariance test and a normalize() description-not-title test (15 tests).

## How It Works

`normalize()` produces one lowercase blob from brand + title + both descriptions — this is the whole point of the plan: marktguru titles are generic ("Cola") and pack size lives in `description` (findings.md, RESEARCH). `classify()` then applies ordered gates. The brand gate runs before the size gate so a store cola that happens to be 12×1L still rejects. `6×1L` rejects automatically because `\b6\s*x` is a disqualifier and `IS_12x1L` (which requires the `1` immediately) is false. Ambiguity (mixed siblings, bare "Kasten") routes to `review` (D-08) rather than being dropped.

## Verification

- `node --test test/matcher.test.mjs` → 15/15 pass (was RED at Task 1: matcher.mjs absent).
- `npm test` (full suite, schema + matcher) → 38/38 pass.
- Fixture counts: accept=3, reject=7, review=2.
- Regexes are linear/anchored with bounded quantifiers — no nested unbounded quantifiers (ReDoS-safe, T-03-01).

## Deviations from Plan

None — plan executed exactly as written. TDD RED→GREEN; no REFACTOR commit needed (implementation was readable on first green). No auth gates, no architectural changes.

## TDD Gate Compliance

- RED gate: `test(01-03): add failing matcher fixtures + test` (56d25e7) — fixtures + test committed; suite failed because `contract/matcher.mjs` did not exist.
- GREEN gate: `feat(01-03): implement strict 12x1L matcher` (a5da9cb) — implementation makes all 15 tests pass.
- REFACTOR gate: not required (no behavior-preserving cleanup needed).

## Known Stubs

None. The matcher is fully implemented and exercised by real-derived fixtures. The accept fixtures are `synthesized-from-real-text` (not stubs) because no genuine 12×1L Coca-Cola case was on sale at PLZ 67105 this week — documented and labelled per RESEARCH; Phase 2 will feed live offers through this same matcher.

## For Next Phase (Phase 2 — Core Scraper)

- Import `classify`/`normalize` from `contract/matcher.mjs` to filter the live `/offers/search` payload before normalization.
- `classify` returns `"review"` → set `needsReview: true` on the resulting `StoreOffer` (contract/schema.mjs); `"reject"` → drop; `"accept"` → emit the offer.
- The matcher is brand+text only; advertiser-slug filtering ({rewe, edeka, lidl, kaufland, wasgau}) and price→cents/€-litre/date normalization remain Phase 2 concerns.

## Self-Check: PASSED

All 16 created files present on disk; both task commits (56d25e7 RED, a5da9cb GREEN) found in git history.
