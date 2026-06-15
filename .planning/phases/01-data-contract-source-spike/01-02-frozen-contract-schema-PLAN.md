---
phase: 01-data-contract-source-spike
plan: 02
type: execute
wave: 2
depends_on: ["01-01"]
files_modified:
  - contract/schema.mjs
  - contract/types.d.ts
  - data/current-offers.json
  - data/price-history.jsonl
  - data/status.json
  - mocks/current-offers.offer.json
  - mocks/current-offers.no_offer.json
  - mocks/current-offers.upcoming.json
  - mocks/current-offers.error.json
  - mocks/current-offers.stale.json
  - mocks/status.stale.json
  - mocks/current-offers.unavailable.json
  - test/schema.test.mjs
autonomous: true
requirements: [DATA-02]
user_setup: []

must_haves:
  truths:
    - "Every D-01..D-14 contract decision is expressed as a zod schema that the mocks validate against"
    - "All five required UI-state mocks (offer, no_offer, upcoming, error, stale) plus Wasgau unavailable are representable and pass schema validation"
    - "Price is integer cents, pricePerLitre is integer cents/litre, no Pfand field exists, status is the 4-value enum, dates use the frozen encoding"
    - "Phase 2 (scraper) and Phase 3 (PWA) can both import the same shared schema/types"
  artifacts:
    - path: "contract/schema.mjs"
      provides: "zod schemas + exported validators for current-offers, price-history line, status — the shared contract"
      contains: "needsReview"
      min_lines: 60
    - path: "contract/types.d.ts"
      provides: "TypeScript types for the three files so Phase 2/3 get editor types"
      min_lines: 20
    - path: "data/current-offers.json"
      provides: "Frozen 5-store snapshot (mock for this phase, real in Phase 2)"
      contains: "needsReview"
    - path: "data/status.json"
      provides: "Per-store fetch state + lastUpdated"
      contains: "lastUpdated"
    - path: "data/price-history.jsonl"
      provides: "Seeded append-only history lines (D-14 shape)"
    - path: "test/schema.test.mjs"
      provides: "node:test proving every mock validates against the schema"
      min_lines: 30
  key_links:
    - from: "test/schema.test.mjs"
      to: "contract/schema.mjs"
      via: "import + parse every mock"
      pattern: "import.*schema"
    - from: "mocks/current-offers.offer.json"
      to: "contract/schema.mjs"
      via: "validated by CurrentOffers schema"
      pattern: "current-offers"
---

<objective>
Freeze the scraper↔PWA data contract as zod schemas + shared types encoding decisions D-01 through D-14, and provide a realistic mock fixture for every UI state required by ROADMAP success criterion #3 (offer present, no offer, upcoming only, store errored, stale) plus the Wasgau `unavailable` state. The three files — `data/current-offers.json`, `data/price-history.jsonl`, `data/status.json` — are the sole interface between Phase 2 (scraper) and Phase 3 (PWA); freezing them here lets both tracks build in parallel. A node:test suite proves every mock validates against the schema, which is the acceptance proof that the contract is sufficient to represent every state.

Purpose: D-12 (status enum), D-09 (integer cents), D-10 (no Pfand), D-11 (computed pricePerLitre), D-13 (date encoding), D-14 (history line shape) become executable, drift-catching zod schemas rather than prose. Both downstream phases inherit one source of truth.
Output: contract/schema.mjs, contract/types.d.ts, the three seeded data files, six mock fixtures, and test/schema.test.mjs.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@CLAUDE.md
@.planning/phases/01-data-contract-source-spike/01-CONTEXT.md
@.planning/phases/01-data-contract-source-spike/01-RESEARCH.md
@.planning/phases/01-data-contract-source-spike/01-01-SUMMARY.md
@spike/findings.md
</context>

<artifacts_this_phase_produces>
This plan (02) creates the frozen contract:
- `contract/schema.mjs` — zod schemas exported as `StoreOfferSchema`, `CurrentOffersSchema`, `HistoryLineSchema`, `StoreStatusSchema`, `StatusFileSchema`, plus `STORES` (the fixed 5-advertiser key list) and `STATUS_VALUES` (`offer|no_offer|unavailable|error`). Exported parse helpers `parseCurrentOffers`, `parseHistoryLine`, `parseStatusFile`.
- `contract/types.d.ts` — `StoreOffer`, `CurrentOffers`, `HistoryLine`, `StoreStatus`, `StatusFile`, `StoreKey` types.
- `data/current-offers.json`, `data/price-history.jsonl`, `data/status.json` — seeded frozen files (mock now, real in Phase 2).
- `mocks/current-offers.{offer,no_offer,upcoming,error,stale,unavailable}.json` + `mocks/status.stale.json` — one realistic fixture per UI state (SC#3 / D-05).
- `test/schema.test.mjs` — node:test asserting every mock + seeded data file parses cleanly.

Field names (Claude's discretion D, propose against decisions): `store` (StoreKey), `displayName`, `status`, `price` (int cents), `currency` ("EUR"), `pricePerLitre` (int cents/litre), `validFrom`/`validTo` (`YYYY-MM-DD`), `needsReview` (bool), and file-level `lastUpdated` (ISO UTC). History line: `date`, `store`, `price`, `pricePerLitre`, `validFrom`, `validTo` (D-14).
</artifacts_this_phase_produces>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Define the frozen zod contract (schema.mjs) + shared types (types.d.ts)</name>
  <behavior>
    - StoreStatus enum accepts exactly offer|no_offer|unavailable|error and rejects any other string (D-12).
    - A StoreOffer with status "offer" requires price (int cents), pricePerLitre (int cents/litre), validFrom/validTo (YYYY-MM-DD); a no_offer/unavailable/error entry allows those to be null/absent.
    - price and pricePerLitre must be integers (reject a float like 9.99) — enforces D-09/D-11.
    - There is NO pfand/deposit field anywhere — adding one is not part of the schema (D-10).
    - needsReview is an optional boolean defaulting to false (D-08).
    - CurrentOffers contains exactly the 5 fixed stores REWE, Edeka, Lidl, Kaufland, Wasgau (StoreKey enum) plus a file-level lastUpdated ISO-UTC string (D-03/D-05/D-13).
    - HistoryLine requires date, store, price, pricePerLitre, validFrom, validTo (D-14).
  </behavior>
  <read_first>
    - .planning/phases/01-data-contract-source-spike/01-CONTEXT.md — Decisions D-01 through D-14 (the authoritative constraint set) and Claude's Discretion (key naming is open)
    - .planning/phases/01-data-contract-source-spike/01-RESEARCH.md — "marktguru API — Verified Integration Notes" (validityDates[] → validFrom/validTo mapping note; decimal price → cents) and "Normalize price → cents" example
    - spike/findings.md — confirmed validityDates granularity + active-range rule, confirmed price-is-decimal, real store slugs
  </read_first>
  <files>contract/schema.mjs, contract/types.d.ts</files>
  <action>
    Create contract/schema.mjs (ESM, `import { z } from "zod"`). Export `STORES = ["REWE","Edeka","Lidl","Kaufland","Wasgau"]` (D-03/D-04 fixed set — Aldi/Penny/Netto excluded) and a `StoreKey` zod enum from it. Export `STATUS_VALUES = ["offer","no_offer","unavailable","error"]` and a `StatusEnum` zod enum (D-12; reject loose booleans). Define `StoreOfferSchema`: `store` (StoreKey), `displayName` (string), `status` (StatusEnum), `needsReview` (boolean, default false — D-08), and offer fields `price` (`z.number().int().nonnegative()` cents — D-09), `currency` (literal "EUR"), `pricePerLitre` (`z.number().int().nonnegative()` cents/litre — D-11), `validFrom`/`validTo` (string regex `^\d{4}-\d{2}-\d{2}$` — D-13). The offer fields are required when `status==="offer"` and nullable/optional otherwise — use a zod refinement so a status:"offer" entry missing price fails validation. Do NOT add any pfand/deposit field (D-10). Define `CurrentOffersSchema` = `{ lastUpdated: z.string().datetime() (ISO UTC — D-13), stores: z.array(StoreOfferSchema) }` and refine that the 5 StoreKeys are all present exactly once (D-05 fixed set always rendered). Define `HistoryLineSchema` = `{ date, store, price(int), pricePerLitre(int), validFrom, validTo }` (D-14). Define `StoreStatusSchema` and `StatusFileSchema` = `{ lastUpdated: ISO UTC, stores: array of { store, status, lastUpdated } }` (D-01 status.json, D-06 per-store fetch state — note DATA-06 logic is Phase 2; only the shape is frozen here). Export parse helpers `parseCurrentOffers(obj)`, `parseHistoryLine(obj)`, `parseStatusFile(obj)` that call `.parse()`. Mirror all of these as TypeScript types in contract/types.d.ts (`StoreOffer`, `CurrentOffers`, `HistoryLine`, `StoreStatus`, `StatusFile`, `StoreKey`) so Phase 3's PWA gets editor types without importing zod at runtime. Keep regexes anchored/linear (RESEARCH Security: avoid ReDoS).
  </action>
  <verify>
    <automated>node --input-type=module -e "import {parseCurrentOffers,STORES,STATUS_VALUES} from './contract/schema.mjs'; if(STORES.length!==5)process.exit(1); if(JSON.stringify(STATUS_VALUES)!==JSON.stringify(['offer','no_offer','unavailable','error']))process.exit(2); let threw=false; try{parseCurrentOffers({lastUpdated:'2026-06-15T04:00:00Z',stores:[{store:'REWE',displayName:'REWE',status:'offer',price:9.99,currency:'EUR',pricePerLitre:83,validFrom:'2026-06-16',validTo:'2026-06-21'}]})}catch{threw=true} if(!threw)process.exit(3); console.log('schema rejects float price + enforces enum ok')"</automated>
  </verify>
  <acceptance_criteria>
    - `contract/schema.mjs` exports `STORES` (exactly the 5 advertisers), `STATUS_VALUES` (exactly offer|no_offer|unavailable|error), and the parse helpers.
    - A status:"offer" entry with a float `price` (9.99) is REJECTED by the schema (proves int-cents enforcement, D-09).
    - No `pfand`/`deposit` key exists anywhere in the schema (D-10).
    - `needsReview` defaults to false (D-08); `lastUpdated` is validated as an ISO datetime (D-13).
    - `contract/types.d.ts` exports matching types for all three files.
  </acceptance_criteria>
  <done>The contract is a single importable zod module + matching .d.ts encoding D-01..D-14, rejecting float prices and unknown status values.</done>
</task>

<task type="auto">
  <name>Task 2: Seed the three data files and author every UI-state mock</name>
  <read_first>
    - .planning/phases/01-data-contract-source-spike/01-CONTEXT.md — D-05 (fixed 5 stores always rendered), D-12 (status enum), Claude's Discretion (all five UI-state mocks must be representable)
    - .planning/ROADMAP.md — Phase 1 success criterion #3 (mocks for offer present, no offer, upcoming only, store errored, stale) and #4 (no_offer vs error vs unavailable encoded)
    - contract/schema.mjs — the schema the mocks must satisfy (created in Task 1)
  </read_first>
  <files>data/current-offers.json, data/price-history.jsonl, data/status.json, mocks/current-offers.offer.json, mocks/current-offers.no_offer.json, mocks/current-offers.upcoming.json, mocks/current-offers.error.json, mocks/current-offers.stale.json, mocks/current-offers.unavailable.json, mocks/status.stale.json</files>
  <action>
    Author realistic mock fixtures, one per UI state, all conforming to contract/schema.mjs. Use today's reference date 2026-06-15 (Europe/Berlin) for relative-state realism. Each `current-offers.*.json` contains the file-level `lastUpdated` (ISO UTC) plus the full fixed set of 5 stores (D-05). State coverage:
    - `mocks/current-offers.offer.json`: at least one store status:"offer" with realistic integer-cents price (e.g. REWE price 999 = €9,99, pricePerLitre 83, validFrom 2026-06-16, validTo 2026-06-21), others a realistic mix.
    - `mocks/current-offers.no_offer.json`: a store with status:"no_offer", offer fields null/absent ("kein Angebot" — OFFR-03).
    - `mocks/current-offers.upcoming.json`: a store status:"offer" whose `validFrom` is FUTURE relative to 2026-06-15 (e.g. 2026-06-22) — the PWA derives "upcoming" (D-12; OFFR-05). The scraper file states the fact (status offer + future validFrom); upcoming is a PWA-derived view, so encode it as a future-dated offer.
    - `mocks/current-offers.error.json`: a store status:"error" (fetch failed — OFFR-03/04 distinct from no_offer).
    - `mocks/current-offers.unavailable.json`: Wasgau status:"unavailable" ("not automatically available" — D-05/OFFR-04; the designed Wasgau outcome).
    - `mocks/current-offers.stale.json` + `mocks/status.stale.json`: a current-offers file plus a status file whose `lastUpdated` is OLD (e.g. 2026-06-05, ~10 days back) so the PWA derives "stale" (D-12 — staleness is PWA-derived from the timestamp, not a frozen flag; OFFR-06).
    Include at least one entry across the mocks with `needsReview:true` to prove the quarantine field is representable (D-08). Seed `data/current-offers.json` as the canonical 5-store snapshot (mirror the offer mock), `data/status.json` with the 5 per-store statuses + a fresh lastUpdated, and `data/price-history.jsonl` with 2–3 D-14-shaped lines (one per recent observation date) — one JSON object per line, append-only style, NOT a JSON array (D-02). Do NOT include any pfand field anywhere.
  </action>
  <verify>
    <automated>node --input-type=module -e "import {parseCurrentOffers,parseStatusFile} from './contract/schema.mjs'; import {readFileSync} from 'node:fs'; for(const f of ['data/current-offers.json','mocks/current-offers.offer.json','mocks/current-offers.no_offer.json','mocks/current-offers.upcoming.json','mocks/current-offers.error.json','mocks/current-offers.stale.json','mocks/current-offers.unavailable.json']) parseCurrentOffers(JSON.parse(readFileSync(f,'utf8'))); parseStatusFile(JSON.parse(readFileSync('data/status.json','utf8'))); parseStatusFile(JSON.parse(readFileSync('mocks/status.stale.json','utf8'))); console.log('all mocks valid')"</automated>
  </verify>
  <acceptance_criteria>
    - All six current-offers mocks + seeded data/current-offers.json validate against `parseCurrentOffers` without error.
    - data/status.json and mocks/status.stale.json validate against `parseStatusFile`.
    - The offer, no_offer, upcoming (future validFrom), error, stale (old lastUpdated), and Wasgau-unavailable states are each represented in at least one mock.
    - At least one entry carries `needsReview:true`; no entry contains a pfand/deposit field.
    - `data/price-history.jsonl` is line-delimited JSON objects (each line valid JSON; the file as a whole is NOT a single JSON array).
  </acceptance_criteria>
  <done>Every ROADMAP-required UI state has a realistic mock that passes schema validation, and the three data files are seeded on the frozen contract.</done>
</task>

<task type="auto">
  <name>Task 3: node:test suite proving every mock + data file validates against the contract</name>
  <read_first>
    - .planning/phases/01-data-contract-source-spike/01-RESEARCH.md — "Supporting" (node:test + node:assert, zero-dep)
    - contract/schema.mjs and the mocks (created in Tasks 1–2)
  </read_first>
  <files>test/schema.test.mjs</files>
  <action>
    Create test/schema.test.mjs using `node:test` + `node:assert`. Tests: (1) a test per current-offers mock + data/current-offers.json asserting `parseCurrentOffers` does not throw; (2) tests asserting `parseStatusFile` accepts data/status.json and mocks/status.stale.json; (3) every non-empty line of data/price-history.jsonl parses as JSON and validates via `parseHistoryLine`; (4) a negative test asserting a float price and an unknown status value (e.g. "pending") are REJECTED (guards D-09/D-12 against regression); (5) an assertion that each current-offers mock contains all 5 StoreKeys exactly once (D-05). Wire nothing new into package.json — `npm test` (`node --test`) already discovers `test/*.test.mjs`.
  </action>
  <verify>
    <automated>node --test test/schema.test.mjs</automated>
  </verify>
  <acceptance_criteria>
    - `node --test test/schema.test.mjs` exits 0 with all tests passing.
    - The suite includes at least one negative test proving float price and an unknown status are rejected.
    - The suite validates every current-offers mock, both status files, and every price-history line.
  </acceptance_criteria>
  <done>`npm test` green: the contract provably represents every UI state and rejects malformed entries.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| data files → Phase 2/3 consumers | Schema is the contract both downstream phases trust; malformed data must fail loudly |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-01 | Tampering | upstream payload shape drift (future Phase 2 scraper input) | mitigate | zod schemas in contract/schema.mjs validate every field/type; a drifted shape throws rather than silently corrupting data.json (RESEARCH Security V5). |
| T-02-02 | DoS | regex in date validators | mitigate | Date regexes are anchored `^\d{4}-\d{2}-\d{2}$` — linear, no backtracking (RESEARCH ReDoS note). |
| T-02-03 | Info disclosure | mock fixtures committed to public repo | accept | Mocks contain only synthetic offer data — no keys, no PII (RESEARCH Security: keys never enter fixtures). |
</threat_model>

<verification>
- `npm test` exits 0.
- Every mock and seeded data file validates against the zod contract.
- The schema rejects float prices and unknown status values (regression guard for D-09/D-12).
- No pfand/deposit field exists anywhere (D-10).
</verification>

<success_criteria>
ROADMAP success criteria #3 and #4 are satisfied: a frozen `data/*.json(l)` schema (current-offers, price-history, status) exists with realistic mocks for every UI state (offer, no_offer, upcoming, error, stale, plus Wasgau unavailable), and the no_offer vs error vs unavailable distinctions plus the price-excludes-Pfand / integer-cents conventions are encoded in zod schemas and shared types that Phases 2 and 3 import. The contract is provably sufficient (node:test green).
</success_criteria>

<output>
Create `.planning/phases/01-data-contract-source-spike/01-02-SUMMARY.md` when done.
</output>
