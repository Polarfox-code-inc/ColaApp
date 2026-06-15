---
phase: 01-data-contract-source-spike
verified: 2026-06-15T00:00:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
gaps: []
deferred: []
human_verification: []
---

# Phase 1: Data Contract & Source Spike Verification Report

**Phase Goal:** The scraper/PWA file contract is frozen and the marktguru data source is proven viable for the exact target product, store, and postcode before any production code depends on it.
**Verified:** 2026-06-15
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A live marktguru probe confirms the 12x1L case is returned for PLZ 67105 across the five target stores, with Wasgau either confirmed or explicitly declared "not automatically available" | VERIFIED (with deliberate note — see SC1 assessment below) | `spike/findings.md` records a live probe run; REWE/Edeka/Kaufland slugs confirmed present; Lidl absent this week (normal cycle); Wasgau explicitly declared `status: "unavailable"` (no OCR). `spike/fixtures/raw-67105-search.json` is a 1741-line live payload (20 results, `totalResults: 20`). |
| 2 | Real captured marktguru payloads exist as fixtures, and a strict matcher accepts the 12x1L case while rejecting 1.25L 6-packs, can trays, Zero/light non-case SKUs, and store-brand colas | VERIFIED | `spike/fixtures/raw-67105-search.json` is a live capture. 12 labelled fixtures (3 accept / 7 reject / 2 review) exist in `spike/fixtures/`. `npm test` runs 38 tests: 38/38 pass. All reject fixtures verified by running tests. |
| 3 | A frozen `data/*.json` schema (current-offers, price-history, status) exists with realistic mocks for every UI state: offer present, no offer, upcoming only, store errored, stale | VERIFIED | `contract/schema.mjs` (zod, D-01..D-14). `data/current-offers.json`, `data/price-history.jsonl`, `data/status.json` all exist and validate. Six mock fixtures (offer, no_offer, upcoming, error, stale, unavailable) exist and pass `parseCurrentOffers`. `test/schema.test.mjs` confirms all 23 schema tests pass. |
| 4 | The Pfand convention (price excludes Pfand) and the "no offer" vs "error" vs "unavailable" distinctions are decided and encoded in the schema and shared types | VERIFIED | Schema uses `.strict()` so any `pfand`/`deposit` key is rejected. Status enum is exactly `["offer", "no_offer", "unavailable", "error"]`. `contract/types.d.ts` mirrors these. `spike/findings.md` §3 documents the three-way distinction. No pfand field appears anywhere in contract/, data/, or mocks/ directories. |

**Score:** 4/4 truths verified

---

### SC1 Assessment — "probe confirms the case is returned across the five stores"

**Verdict: VERIFIED with documented condition — not a gap.**

The success criterion must be read in two parts: (a) proving the data source mechanism works — the probe makes a real API call, resolves store slugs, and captures live offer shapes; and (b) that the 12x1L case specifically is on sale.

The probe definitively satisfies part (a): live payload captured (20 offers), REWE/Edeka/Kaufland slug-present confirmed, Lidl slug identified but absent this week, Wasgau explicitly declared unavailable. The findings document all this as freshly-observed (not fallback).

Part (b) was not satisfiable: no 12x1L Coca-Cola case was on sale at any of the five stores during the probe week (2026-06-14 to 2026-06-20). This is not a tooling failure — it is the real-world condition that the app exists to track. The ROADMAP wording "confirms the Coca-Cola 12x1L case is returned" is most plausibly read as "proves the source can return such offers" — the source does return offers, the stores are covered, and the fixture documentation explains why no positive offer was live that week.

The mitigation taken — synthesizing the positive accept fixture verbatim from documented live strings (RESEARCH "Strict 12x1L Matcher"), explicitly labelled `synthesized-from-real-text` — is the approach the plan itself prescribed as the designed fallback. The PLAN human-checkpoint step 5 explicitly says: "if no live 12x1L positive case is on sale that week, say so — the matcher plan (03) will synthesize the positive fixture verbatim from the live strings documented in RESEARCH".

**Lidl this week:** Lidl returned no Cola offers this week, which is a normal weekly-cycle outcome. The slug `lidl` is recorded as "expected identifier" and the five-store slug allow-list in the contract correctly includes it. This is not a coverage failure.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `package.json` | Node 22 ESM scaffold, zod pinned, node:test script | VERIFIED | `"type": "module"`, `"engines": {"node": ">=22"}`, `"test": "node --test"`, `"probe": "node spike/probe.mjs"`, `"zod": "^3.25.76"`. No axios/node-fetch/vitest/jest. |
| `spike/probe.mjs` | Live key-scrape + /offers/search probe, dumps raw payload, logs advertiser slugs | VERIFIED | References `offers/search`, `zipCode=67105`, `x-apikey`, `x-clientkey`, `uniqueName`, `Object.keys(data)`. Single low-volume request. Never logs/writes keys. |
| `spike/findings.md` | Answers to 4 open questions + price type + positive-fixture status | VERIFIED | 103 lines; answers wrapper key (`results`), 5-store slug verdicts, Wasgau verdict, validityDates granularity, price type (decimal euro -> cents), and positive-fixture status (zero real cases -> synthesize). |
| `spike/fixtures/raw-67105-search.json` | Captured live marktguru payload | VERIFIED | 1741 lines, valid JSON, keys `[filters, totalResults, skippedResults, results]`, 20 results, no apiKey/clientKey present. |
| `contract/schema.mjs` | zod schemas + exported validators, needsReview, min 60 lines | VERIFIED | 146 lines; exports `STORES`, `STATUS_VALUES`, `StoreKey`, `StatusEnum`, `StoreOfferSchema` (with `.strict()` and `superRefine`), `CurrentOffersSchema`, `HistoryLineSchema`, `StatusFileSchema`, and parse helpers. `needsReview` present with default false. |
| `contract/types.d.ts` | TypeScript types for three files, min 20 lines | VERIFIED | 71 lines; exports `StoreKey`, `StoreStatusValue`, `StoreOffer`, `CurrentOffers`, `HistoryLine`, `StoreStatus`, `StatusFile`. |
| `data/current-offers.json` | Frozen 5-store snapshot, contains "needsReview" | VERIFIED | Exists, validates against `parseCurrentOffers`, contains all 5 stores. |
| `data/status.json` | Per-store fetch state + lastUpdated | VERIFIED | Exists, validates against `parseStatusFile`. |
| `data/price-history.jsonl` | JSONL append-only history lines | VERIFIED | 3 lines, does not start with `[`, each line is valid JSON with integer-cents prices. |
| `contract/matcher.mjs` | Pure classify(offer) -> accept/reject/review, min 40 lines, contains "needsReview" | VERIFIED | 101 lines; exports `normalize()` and `classify()`; reads brand+product.name+product.description+description; regex families `IS_12x1L`, `DISQUALIFY`, `COCA_COLA_BRAND`, `STORE_BRAND`, `MIXED_BRAND`, `CASE_WORD`; does not branch on Pfand. |
| `test/matcher.test.mjs` | node:test driving matcher over fixtures, min 30 lines | VERIFIED | 74 lines; loops every fixture in accept/reject/review dirs; includes Pfand-invariance test and normalize-reads-description test; 15 tests pass. |
| `spike/fixtures/accept/classic-12x1l.json` | Positive case (labelled) | VERIFIED | Exists; `synthesized-from-real-text` label present; contains Pfand phrase to prove D-10. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `spike/probe.mjs` | `https://api.marktguru.de/api/v1/offers/search` | native fetch with x-apikey/x-clientkey | WIRED | grep confirms `offers/search`, `x-apikey`, `x-clientkey` present in probe.mjs |
| `spike/probe.mjs` | `https://www.marktguru.de/` | homepage fetch + JSON-island key extraction | WIRED | grep confirms `application/json` pattern for JSON-island scrape |
| `test/schema.test.mjs` | `contract/schema.mjs` | import + parse every mock | WIRED | `import { parseCurrentOffers, parseStatusFile, parseHistoryLine, STORES, STATUS_VALUES, StoreOfferSchema }` present; all 7 mock files parsed in test loop |
| `test/matcher.test.mjs` | `contract/matcher.mjs` | import classify + assert per fixture | WIRED | `import { classify, normalize } from "../contract/matcher.mjs"` present; all fixtures classified |

### Data-Flow Trace (Level 4)

Not applicable. This phase produces static contract files, fixtures, and a network spike — not a UI component rendering dynamic data. No Level 4 trace is required.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| npm test (full suite) | `node --test` | 38/38 pass, 0 fail, 0 skip | PASS |
| matcher accepts Coca-Cola 12x1L Classic with Pfand phrase | runtime verify (embedded in test suite) | "accept" | PASS |
| matcher rejects all 7 reject fixtures | runtime verify (embedded in test suite) | "reject" x 7 | PASS |
| matcher quarantines mixed-brand and ambiguous-size | runtime verify (embedded in test suite) | "review" x 2 | PASS |
| schema rejects float price | runtime verify (embedded in test suite) | throws on 9.99 | PASS |
| schema rejects unknown status | runtime verify (embedded in test suite) | throws on "pending" | PASS |
| raw-67105-search.json is valid JSON with real results | `node --input-type=module -e` | keys: [filters, totalResults, skippedResults, results]; results.length=20 | PASS |

### Probe Execution

The probe (`spike/probe.mjs`) requires live network access to marktguru.de. It was run by the user at the human-verify checkpoint per plan design. The resulting captured payload (`spike/fixtures/raw-67105-search.json`) proves the probe executed successfully: 1741-line live JSON, 20 results, wrapper key `results` confirmed. Re-running the probe in CI for this verification is not appropriate (good-citizen ToS cadence — plan explicitly constrains to low volume). The artifact evidence is sufficient.

| Probe | Run By | Result | Status |
|-------|--------|--------|--------|
| `spike/probe.mjs` (via `npm run probe`) | User at human-verify checkpoint | 20-result payload captured; findings.md authored from live output | PASS (evidenced by artifact) |

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DATA-02 | 01-01, 01-02, 01-03 | System matches strictly the 12x1L case and excludes other Cola SKUs | SATISFIED | `contract/matcher.mjs` implements classify(); 12 fixtures (3/7/2) pin the boundary; 38/38 tests pass; REQUIREMENTS.md marks DATA-02 as Complete for Phase 1 |

No orphaned requirements found. DATA-02 is the only requirement mapped to Phase 1 in REQUIREMENTS.md traceability table.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `contract/matcher.mjs` | 56 | Bare `fritz` token in STORE_BRAND regex (unbounded substring) | WARNING | Confirmed false-negative: a real Coca-Cola 12x1L offer whose description contains the substring "fritzlar" (a German town name) or "fritzbox" classifies as "reject" instead of "accept". Live-tested: `classify({brand:{name:"Coca-Cola"}, description:"Coca-Cola 12 x 1-l case Markt Fritzlar"})` returns `"reject"`. The existing `fritz[\s-]?kola` token in the same regex already covers the Fritz-Kola brand; the bare `fritz` alt is therefore redundant AND harmful. Fix: drop the bare `fritz` alt entirely (covered by `fritz[\s-]?kola`) or bound it to `\bfritz\b` if a standalone Fritz brand must remain. |
| `contract/matcher.mjs` | 56 | `gut\s*&\s*g` over-matches common phrases | WARNING | Confirmed false-negative: `classify({brand:{name:"Coca-Cola"}, product:{description:"12 x 1-l"}, description:"alles gut & günstig bei uns"})` returns `"reject"`. However, in practice the COCA_COLA_BRAND check at step 2 means this only fires if the offer IS Coca-Cola brand — the `gut\s*&\s*g` pattern sits at step 1 (STORE_BRAND check), so a Coca-Cola offer with marketing copy containing "gut & g..." is incorrectly rejected at step 1 before the brand check. Fix: bound the pattern to `\bgut\s*&\s*g[uü]nstig\b`. |
| `contract/schema.mjs` | 34-36 | DateOnly accepts impossible calendar dates (e.g. 2026-13-45) | WARNING | `DateOnly` validates only the regex shape, not real calendar validity. An impossible date passes the schema and flows downstream as `Invalid Date`/`NaN`. Fix: add a real-date refinement (see 01-REVIEW.md WR-02 for the exact code). |
| `contract/schema.mjs` | 62-74 | `no_offer`/`unavailable`/`error` entries may carry stray offer fields | WARNING | The `superRefine` only enforces offer-field presence for `status:"offer"` but not their absence for other statuses. A `{status:"no_offer", price:999}` entry passes. Fix: extend the refinement to reject offer fields when status != "offer" (01-REVIEW.md WR-03). |
| `contract/schema.mjs` | 46-58 | No cross-field check that `validFrom` <= `validTo` | WARNING | An inverted range (`validFrom:"2026-06-21", validTo:"2026-06-16"`) passes validation. Fix: add a `superRefine` comparing the two date strings (01-REVIEW.md WR-04). |

**No TBD/FIXME/XXX markers found** in any phase-modified file.

**Assessment of WR-01 (bare `fritz` token) against phase goal:**

WR-01 is a real false-negative defect confirmed by live execution. However, it does NOT block the phase goal:

1. The phase goal is to freeze the contract and prove the data source viable. Both are achieved.
2. The fixture corpus does not include an offer containing "Fritzlar" or similar — the tested fixtures all classify correctly. No fixture is wrongly classified.
3. The defect would only manifest if a real Coca-Cola 12x1L offer's description text coincidentally contained the substring "fritz" not as part of "fritz kola". This is a low-probability edge case for this product/market.
4. The 01-REVIEW.md code review explicitly identifies this, names the exact fix, and carries it as WR-01 (Warning, not Critical). The review found 0 Criticals.
5. The fix is a one-character change (drop the redundant `fritz` alt or add word boundary). Phase 2 can apply it before the scraper runs against live offers.

The phase goal — frozen contract + proven viable data source — is achieved. WR-01 is a pre-existing known defect to be fixed in Phase 2.

---

### Human Verification Required

None. All phase deliverables are verifiable programmatically:
- Test suite runs and passes (38/38)
- Schema validates all mocks
- Fixtures are parseable JSON
- No UI to inspect

---

### Gaps Summary

No blocking gaps. The four ROADMAP success criteria are satisfied:

**SC1 (live probe):** Achieved with documented condition. The probe ran live; real payload captured; store slug verdicts recorded; Wasgau declared unavailable as designed. The absence of a real 12x1L case on sale during the probe week is a market condition, not a tool failure, and was handled exactly as the plan prescribed.

**SC2 (fixtures + strict matcher):** Achieved. 12 labelled fixtures exist; all classify correctly; 38/38 tests pass including all reject/accept/review cases.

**SC3 (frozen schema + UI-state mocks):** Achieved. Three data files seeded, six UI-state mocks validated, contract enforces D-01..D-14.

**SC4 (Pfand convention + status distinctions):** Achieved. Schema enforces no-pfand via `.strict()`, status enum encodes all four values, distinctions documented in findings.md and context.

**Known defects from 01-REVIEW.md (WR-01 through WR-05):** All are Warnings, none are Criticals. WR-01 (bare `fritz` false-negative) and WR-05 (`gut\s*&\s*g` over-match) are real matcher correctness bugs confirmed by live test, but they do not affect any current fixture or test result. WR-02/03/04 are schema validation gaps. All five are documented and recommended for Phase 2 closure before the scraper runs against live data.

---

_Verified: 2026-06-15_
_Verifier: Claude (gsd-verifier)_
