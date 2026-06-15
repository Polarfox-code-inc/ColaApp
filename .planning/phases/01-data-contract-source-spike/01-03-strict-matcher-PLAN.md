---
phase: 01-data-contract-source-spike
plan: 03
type: tdd
wave: 2
depends_on: ["01-01"]
files_modified:
  - contract/matcher.mjs
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
  - spike/fixtures/README.md
  - test/matcher.test.mjs
autonomous: true
requirements: [DATA-02]
user_setup: []

must_haves:
  truths:
    - "The matcher accepts a 12×1L Coca-Cola case in any flavor (Classic/Zero/Light)"
    - "The matcher rejects 1.25L 6-packs, can trays (0.33L), wholesale trays, 12×0.5L, 6×1L cases, and store-brand colas"
    - "The matcher quarantines mixed-brand and ambiguous-size offers as needsReview rather than silently dropping them"
    - "The matcher reads the description text, not the generic title, and never parses Pfand into a result"
  artifacts:
    - path: "contract/matcher.mjs"
      provides: "Pure classify(offer) -> 'accept'|'reject'|'review' over normalized brand+title+description text"
      contains: "needsReview"
      min_lines: 40
    - path: "test/matcher.test.mjs"
      provides: "node:test driving the matcher over accept/reject/review fixtures"
      min_lines: 30
    - path: "spike/fixtures/accept/classic-12x1l.json"
      provides: "Positive case (captured live or synthesized-from-real, labelled)"
  key_links:
    - from: "test/matcher.test.mjs"
      to: "contract/matcher.mjs"
      via: "import classify + assert per fixture"
      pattern: "classify"
    - from: "contract/matcher.mjs"
      to: "offer.description / product.description"
      via: "normalized text concatenation (NOT title-only)"
      pattern: "description"
---

<objective>
Implement and fixture-test the strict 12×1L Coca-Cola matcher (DATA-02) as a pure, network-free classifier `classify(offer) -> "accept" | "reject" | "review"` operating on the offer's normalized text. Per the decisive research finding, the matcher parses the `description`/`product.description` field (where pack size lives) — a title-only matcher is impossible because marktguru titles are generic ("Cola"). The matcher is flavor-permissive (Classic/Zero/Light all match — D-06), strict on pack size (rejects 1.25L 6-packs, can trays, 0.5L, 6×1L cases, store-brand colas — D-07), and quarantines mixed-brand / ambiguous-size offers as `needsReview` rather than dropping them silently (D-08). It is proven against captured/synthesized fixtures via TDD: the fixtures and their expected verdicts are written first, then the matcher is implemented to satisfy them.

Purpose: DATA-02 is the sole Phase 1 requirement and the app's core-value guarantee — the wrong SKU shown is worse than no offer. Building this against real captured strings (Plan 01) under TDD locks the accept/reject/review boundaries before Phase 2's scraper consumes the matcher.
Output: contract/matcher.mjs, twelve labelled fixtures (3 accept / 7 reject / 2 review), and test/matcher.test.mjs.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/phases/01-data-contract-source-spike/01-CONTEXT.md
@.planning/phases/01-data-contract-source-spike/01-RESEARCH.md
@.planning/phases/01-data-contract-source-spike/01-01-SUMMARY.md
@spike/findings.md
@spike/fixtures/raw-67105-search.json
</context>

<artifacts_this_phase_produces>
This plan (03) creates:
- `contract/matcher.mjs` — exports `normalize(offer)` (lowercase, collapse whitespace, unify `×`→`x`) and `classify(offer) -> "accept"|"reject"|"review"`; internal regex families `IS_12x1L`, `DISQUALIFY`, `STORE_BRAND`, `COCA_COLA_BRAND`, `MIXED_BRAND`. The matcher is consumed by the Phase 2 scraper (it does NOT itself write data files).
- `spike/fixtures/accept/*.json` (3) — Coca-Cola 12×1L Classic, Zero, Light positive cases.
- `spike/fixtures/reject/*.json` (7) — 1.25L bottle, 6×0.33 pack, 10×0.33 tray, 24×0.33 wholesale, 12×0.5L case, 6×1L case, store-brand cola.
- `spike/fixtures/review/*.json` (2) — mixed-brand "Cola oder Fanta/Sprite/Mezzo Mix 12×1L", and "Kasten" with no explicit per-bottle size.
- `spike/fixtures/README.md` — labels each fixture as captured-live or synthesized-from-real-text (per RESEARCH: never invented).
- `test/matcher.test.mjs` — node:test asserting the expected verdict for every fixture.
</artifacts_this_phase_produces>

<feature>
  <name>Strict 12×1L Coca-Cola matcher (DATA-02)</name>
  <files>contract/matcher.mjs, test/matcher.test.mjs, spike/fixtures/accept/*, spike/fixtures/reject/*, spike/fixtures/review/*</files>
  <behavior>
    classify(offer) returns one of "accept" | "reject" | "review":
    - ACCEPT: brand is Coca-Cola AND normalized text contains a 12×1L token (`12 x 1 l`/`12x1l`/`12 × 1 l`/`12 x 1-l`) AND no disqualifier — for any flavor (Classic, Zero, Light, koffeinfrei).
    - REJECT: store/competitor brand (ja!, gut&günstig, k-classic, vita cola, river, freeway, pepsi, fritz, …); OR a disqualifier token present (`1,25`, `0,5`, `0,33`, `0,2`, `dose`/`ds.`, `6 x`, `10 x`, `24 x`) with no clean 12×1L; OR Coca-Cola but a non-12×1L pack (12×0.5L, 6×1L).
    - REVIEW (needsReview): Coca-Cola brand AND a case-ish 12×1L signal BUT mixed-brand text (`oder fanta`/`sprite`/`mezzo mix`/`versch. sorten`) OR ambiguous size (`kasten`/`case` present without a confirming `12 x 1 l` token and without a contradicting disqualifier).
    - Pfand text (`zzgl. … pfand`, `+ … deposit`) is ignored entirely — never affects the verdict or any parsed price.
    - Matching reads the concatenation brand.name + product.name + product.description + description (NOT title alone).
  </behavior>
  <implementation>
    Implement after the fixtures + failing tests exist (RED→GREEN). `normalize(offer)` joins `[offer.brand?.name, offer.product?.name, offer.product?.description, offer.description].filter(Boolean).join(" ")`, lowercases, replaces `×`→`x`, collapses whitespace. Use anchored/linear regexes (RESEARCH ReDoS note): `IS_12x1L = /(^|[^\d])12\s*x\s*1\s*-?\s*l(iter)?\b/`; `DISQUALIFY = /(1,25|0,5|0,33|0,2|\bdose\b|\bds\.|6\s*x|10\s*x|24\s*x)/`; `COCA_COLA_BRAND = /coca[\s-]?cola/`; `STORE_BRAND = /(ja!|gut\s*&\s*g|k-classic|vita\s*cola|river|freeway|pepsi|fritz)/`; `MIXED_BRAND = /(oder\s+(fanta|sprite|mezzo\s*mix)|versch\.\s*sorten)/`. classify order: store-brand → reject; not Coca-Cola → reject; mixed-brand with 12×1L-ish → review; disqualifier present and no clean IS_12x1L → reject; IS_12x1L present → accept; `kasten`/`case` without size → review; else reject.
  </implementation>
</feature>

<tasks>

<task type="auto">
  <name>Task 1 (RED): Author labelled fixtures and the failing matcher test</name>
  <read_first>
    - .planning/phases/01-data-contract-source-spike/01-RESEARCH.md — "Strict 12×1L Matcher (DATA-02)" (the verbatim live offer string table, matcher rules, and the exact accept/reject/quarantine fixture list) and Pitfall 1 (synthesize-from-real if no live positive)
    - .planning/phases/01-data-contract-source-spike/01-CONTEXT.md — D-06 (flavor-permissive), D-07 (reject non-12×1L + store brands), D-08 (needsReview quarantine)
    - spike/fixtures/raw-67105-search.json and spike/findings.md — use real captured offers where available; the offer shape (brand/product.name/product.description/description) to mirror in fixtures
  </read_first>
  <files>spike/fixtures/accept/classic-12x1l.json, spike/fixtures/accept/zero-12x1l.json, spike/fixtures/accept/light-12x1l.json, spike/fixtures/reject/bottle-125l.json, spike/fixtures/reject/sixpack-033.json, spike/fixtures/reject/tray-10x033.json, spike/fixtures/reject/wholesale-24x033.json, spike/fixtures/reject/case-12x05l.json, spike/fixtures/reject/case-6x1l.json, spike/fixtures/reject/store-brand-cola.json, spike/fixtures/review/mixed-brand-12x1l.json, spike/fixtures/review/kasten-no-size.json, spike/fixtures/README.md, test/matcher.test.mjs</files>
  <action>
    Create the twelve fixture JSON files mirroring the marktguru Offer shape (`brand:{name}`, `product:{name,description}`, top-level `description`). Source each fixture's text from a real captured offer in spike/fixtures/raw-67105-search.json when one matches the case; otherwise synthesize the text VERBATIM from the live strings in RESEARCH "Strict 12×1L Matcher" (e.g. "12 x 1-l", "1,25-l-Fl.", "je 6 x 0,33-l-Fl.-Pckg.", "je 10 x 0,33-l-Ds.", "24 x 0,33 l Dose … NUR FÜR GROSSHÄNDLER", "12 x 0,5-l", "6 x 1-l", "Cola oder Fanta/Sprite/Mezzo Mix 12 x 1-l", a "Kasten"-without-size line, and a store-brand cola). In spike/fixtures/README.md, label EACH fixture as `captured-live` or `synthesized-from-real-text` with the source string (NEVER invented — RESEARCH anti-pattern). The accept fixtures cover Classic, Zero, and Light at 12×1L (D-06). Include a Pfand phrase (`zzgl. 3,30 Pfand`) inside at least one accept fixture's description to prove Pfand never flips the verdict (D-10). Then write test/matcher.test.mjs with `node:test`: a parametrized set asserting `classify(fixture)` returns "accept" for every accept/*, "reject" for every reject/*, and "review" for every review/*. Because contract/matcher.mjs does not exist yet, this test MUST currently FAIL (RED). Commit: `test(01-03): add failing matcher fixtures + test`.
  </action>
  <verify>
    <automated>node -e "const {readdirSync}=require('node:fs'); const a=readdirSync('spike/fixtures/accept').length, r=readdirSync('spike/fixtures/reject').length, v=readdirSync('spike/fixtures/review').length; if(a<3||r<7||v<2){console.error('fixture counts',a,r,v);process.exit(1)} console.log('fixtures present',a,r,v)" && node --check test/matcher.test.mjs</automated>
  </verify>
  <acceptance_criteria>
    - At least 3 accept, 7 reject, and 2 review fixtures exist, each mirroring the marktguru Offer shape (brand + product.description + description).
    - spike/fixtures/README.md labels every fixture as captured-live or synthesized-from-real-text with its source string.
    - At least one accept fixture's description contains a Pfand phrase.
    - test/matcher.test.mjs is valid (`node --check` passes) and references `classify` for all three verdict groups; it fails to run only because contract/matcher.mjs does not yet exist (RED state).
  </acceptance_criteria>
  <done>The fixture corpus and a failing matcher test exist; expected verdicts are pinned before any matcher code is written.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2 (GREEN/REFACTOR): Implement contract/matcher.mjs until all fixtures pass</name>
  <behavior>
    - classify() returns "accept" for all three accept fixtures (Classic/Zero/Light 12×1L).
    - classify() returns "reject" for all seven reject fixtures (1.25L, 6×0.33, 10×0.33, 24×0.33, 12×0.5L, 6×1L, store-brand).
    - classify() returns "review" for both review fixtures (mixed-brand, kasten-no-size).
    - A description containing a Pfand phrase still classifies on pack size alone (Pfand ignored).
  </behavior>
  <read_first>
    - .planning/phases/01-data-contract-source-spike/01-RESEARCH.md — "Pattern 1: Pure matcher over normalized text" (normalize() + regex families) and "Anti-Patterns to Avoid" (title-only matching, ReDoS)
    - test/matcher.test.mjs and the fixtures (created in Task 1) — the contract the implementation must satisfy
  </read_first>
  <files>contract/matcher.mjs</files>
  <action>
    Implement contract/matcher.mjs (ESM, zero runtime deps). Export `normalize(offer)` and `classify(offer)` exactly per the <feature> implementation note: normalize concatenates `brand.name`+`product.name`+`product.description`+`description` (NEVER title alone — RESEARCH #1 anti-pattern), lowercases, maps `×`→`x`, collapses whitespace. Define the anchored regex families `IS_12x1L`, `DISQUALIFY`, `COCA_COLA_BRAND`, `STORE_BRAND`, `MIXED_BRAND` and apply the classify decision order from the implementation note. Never parse or branch on Pfand text (D-10). Keep every regex linear/bounded — no nested quantifiers (RESEARCH ReDoS). Run `node --test test/matcher.test.mjs` and iterate until green (GREEN). If a real captured offer reveals a string the rules misclassify, tighten the rules and add/adjust a labelled fixture rather than loosening to a catch-all (this is exactly the D-08 review-tuning loop). Refactor for readability once green, keeping the test passing (REFACTOR). Commit: `feat(01-03): implement strict 12x1L matcher`.
  </action>
  <verify>
    <automated>node --test test/matcher.test.mjs</automated>
  </verify>
  <acceptance_criteria>
    - `node --test test/matcher.test.mjs` exits 0 — every accept fixture → "accept", every reject → "reject", every review → "review".
    - `contract/matcher.mjs` reads `description`/`product.description` (matching `description` appears in the source); it does not classify on `product.name` alone.
    - No regex uses nested unbounded quantifiers (ReDoS-safe).
    - The matcher never references a pfand/deposit value in its decision.
  </acceptance_criteria>
  <done>`npm test` green for the matcher: DATA-02 accept/reject/review boundaries hold against the real-derived fixture corpus.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| marktguru offer text → matcher | Untrusted third-party text fed into regex classification |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-01 | DoS | matcher regexes (IS_12x1L, DISQUALIFY, STORE_BRAND, MIXED_BRAND) | mitigate | All patterns are linear/anchored with bounded quantifiers — no catastrophic backtracking on adversarial offer text (RESEARCH Security: ReDoS). Verified by acceptance criterion. |
| T-03-02 | Tampering | misclassification (wrong SKU accepted) | mitigate | Strict accept gate (explicit 12×1L token required) + needsReview quarantine for ambiguity (D-08); fixtures pin the accept/reject/review boundary and catch regressions in CI. |
| T-03-03 | Info disclosure | synthesized fixtures committed | accept | Fixtures contain only public offer text (verbatim or captured), labelled in README; no keys/PII (RESEARCH Security). |
</threat_model>

<verification>
- `node --test test/matcher.test.mjs` exits 0 (RED in Task 1 → GREEN in Task 2).
- The matcher accepts Classic/Zero/Light 12×1L and rejects all seven non-case/store-brand fixtures.
- Mixed-brand and ambiguous-size offers route to "review" (D-08), not silently dropped.
- The matcher reads description text, not title, and ignores Pfand.
</verification>

<success_criteria>
ROADMAP success criterion #2 is satisfied: a strict matcher accepts the 12×1L case while rejecting 1.25L 6-packs, can trays, non-case Zero/Light SKUs, and store-brand colas, proven against captured (or synthesized-from-real, labelled) fixtures. DATA-02 — the sole Phase 1 requirement — is implemented as a pure, fixture-tested classifier ready for the Phase 2 scraper to consume.
</success_criteria>

<output>
Create `.planning/phases/01-data-contract-source-spike/01-03-SUMMARY.md` when done.
</output>
