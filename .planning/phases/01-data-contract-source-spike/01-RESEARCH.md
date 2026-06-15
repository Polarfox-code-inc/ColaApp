# Phase 1: Data Contract & Source Spike - Research

**Researched:** 2026-06-15
**Domain:** Unofficial REST API reverse-engineering (marktguru.de), strict product matching, JSON data-contract design (Node 22+ native fetch, zod validation)
**Confidence:** MEDIUM-HIGH (schema design HIGH; marktguru field names MEDIUM — community-corroborated but unofficial; per-store PLZ 67105 coverage LOW until the live probe runs)

## Summary

This is a **spike phase**: its deliverables are a frozen JSON contract, a strict matcher, and **live proof** that marktguru returns the 12×1L Coca-Cola case for PLZ 67105. The most important research finding reshapes the matcher design: marktguru offer **titles are extremely short and generic** ("Cola", "Original Taste", "Limonade") and the **pack-size and flavor information lives in the `description` field, not the title** (verified against live marktguru.de offer pages). A title-only matcher is therefore impossible — the strict 12×1L matcher must parse the `description`/`product.description` text for pack tokens like `12 x 1 l` / `12x1l` / `1-l` `Kasten`, and reject `1,25-l`, `Dose`/`Ds.`, `0,5-l`, `6 x`, `24 x` patterns. German offer text uses comma decimals (`0,83 €/l`) and packs Coca-Cola with sibling brands ("oder Coca-Cola Zero", "MEZZO MIX oder FANTA") in a single offer — these mixed-brand offers are exactly the `needsReview: true` (D-08) quarantine candidates.

The marktguru response schema is well-corroborated by the `sydev/marktguru` TypeScript definitions [VERIFIED: github.com/sydev/marktguru]: an `Offer` has `product.name` / `product.description`, a top-level `description`, a decimal `price` (e.g. `4.00` — **NOT cents**, so D-09's integer-cents storage requires a `Math.round(price*100)` conversion in the scraper, frozen as a contract note here), a `referencePrice` (price-per-unit, e.g. `1.33`) with `unit.shortName` (`"l"`), an `advertisers[]` array each with `name` + `uniqueName`, and `validityDates: [{from, to}]` (an **array**, ISO date strings — NOT `validFrom`/`validTo` and NOT a single `expires` field). The two auth keys are scraped from a `<script type="application/json">` block on the marktguru homepage as `config.apiKey` / `config.clientKey`.

**Primary recommendation:** Freeze the three-file contract exactly per D-01…D-14, with the matcher operating on `description` text (not title); have the spike capture **raw unfiltered** `/offers/search` payloads as committed fixtures so field names are proven from real data before any production code depends on them, and treat marktguru's reverse-engineered field names as MEDIUM-confidence until the captured fixtures confirm them. Wasgau coverage for PLZ 67105 is the single biggest unknown — design the contract so "not automatically available" (`status: "unavailable"`) is a first-class, fully-mocked outcome, not a failure.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| marktguru API key extraction | Scraper (Node, Phase 2) | — | CORS blocks the PWA; keys scraped server-side from homepage |
| `/offers/search` fetch | Scraper (Node, Phase 2) | — | Server-side only; this phase only *probes* it via the spike |
| Strict 12×1L matcher (DATA-02) | Scraper logic (shared module) | — | Defined + fixture-tested here; runs in Phase 2 scraper |
| Price→cents + €/litre normalization | Scraper (Phase 2) | — | D-09/D-11: scraper computes, PWA only reads |
| `status` enum (offer/no_offer/unavailable/error) | Scraper (Phase 2 writes) | PWA (Phase 3 derives upcoming/stale) | D-12: scraper states facts; PWA derives time-relative views |
| Data contract / schema / shared types | **This phase (1)** | Scraper + PWA consume | The frozen interface both tracks build against |
| UI-state mocks (offer/no_offer/upcoming/error/stale) | **This phase (1)** | PWA (Phase 3 renders) | ROADMAP success criterion #3 |
| zod schema validation | Scraper (Phase 2) | — | Optional guard; schema defined here, enforced at scrape time |

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Three separate data files: `data/current-offers.json` (latest snapshot, one entry per store), `data/price-history.jsonl` (append-only history points), `data/status.json` (per-store fetch state + last-updated timestamp).
- **D-02:** Price history is **JSONL** (one JSON object per line), append-only — clean git diffs, trivial appends, no merge/race risk. (Rejects a rewritten JSON array.)
- **D-03:** Stores modeled as **individual advertisers**, a fixed list of exactly 5: **REWE, Edeka, Lidl, Kaufland, Wasgau.**
- **D-04:** **Aldi, Penny, Netto dropped entirely.** Live probe targets exactly these 5 advertisers; Lidl + Kaufland are both first-class and separate.
- **D-05:** The 5 advertiser keys are a **fixed set, always rendered**. No qualifying offer → `no_offer`; can't be fetched → `unavailable`/`error`.
- **D-06:** **Any Coca-Cola flavor at 12×1L matches** — Classic, Zero, Light. Rejection is on **pack size**, not flavor.
- **D-07:** **Reject** non-12×1L packs (1.25L 6-packs, can trays, etc.) and **store-brand colas**.
- **D-08:** **Ambiguous entries quarantined** with `needsReview: true` **inside `current-offers.json`** (PWA filters them out of the brother-facing view). Not silently dropped, not shown.
- **D-09:** Price stored as **integer cents** (`1099` = €10,99) with `currency: "EUR"`. PWA formats to German `€10,99`.
- **D-10:** Price **excludes Pfand** (DATA-03) and **Pfand is NOT stored** — no deposit field in the schema.
- **D-11:** **€/litre computed and stored by the scraper** (`pricePerLitre`, cents/litre — for 12×1L case = price ÷ 12). Both PWA views and history read the same value.
- **D-12:** Each store carries explicit `status` enum: `offer` | `no_offer` | `unavailable` | `error` (mutually exclusive). Scraper states facts; PWA derives `upcoming` (validFrom future) and `stale` (lastUpdated age).
- **D-13:** Dates: `validFrom`/`validTo` as plain `YYYY-MM-DD` in **Europe/Berlin**; `lastUpdated` as full **ISO 8601 UTC** timestamp.
- **D-14:** Each `price-history.jsonl` line: `date`, `store`, `price` (cents), `pricePerLitre`, `validFrom`, `validTo`. **Dedup key: store + price + validFrom** (dedup logic lands Phase 2; record shape frozen here).

### Claude's Discretion

- Exact JSON key naming/casing, file-internal nesting, and spike fixture filenames are open — propose against the decisions above.
- All five UI-state mocks (offer present, no offer, upcoming only, store errored, stale) must be representable; provide a realistic mock fixture for each.

### Deferred Ideas (OUT OF SCOPE)

- Staleness threshold value (days = "stale") → Phase 3.
- Price-history dedup *logic* (record shape frozen here) → Phase 2 (DATA-04).
- Per-store fallback adapters (e.g. Aldi Süd direct JSON) → v2 (DATA-07).
- Tiered staleness escalation, dark mode, per-store/all-time-low history overlays → v2.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DATA-02 | System matches strictly the 12×1L case and excludes other Cola SKUs (1.25L 6-packs, can trays, Zero/light unless the 12×1L case, store-brand colas) | Matcher must parse the **`description`** field (pack size lives there, not in the short `product.name` title — verified live). Accept tokens: `12 x 1 l`/`12x1l`/`12×1`; reject `1,25`, `Dose`/`Ds.`, `0,33`, `0,5`, `6 x`, `10 x`, `24 x`, store-brand cola names. Flavor-permissive (Classic/Zero/Light). Mixed-brand offers ("oder Fanta/Sprite/Mezzo Mix") → `needsReview: true`. See **Strict 12×1L Matcher** section. |

> DATA-03 (price excl. Pfand, €/litre, valid dates) and OFFR-03/04/05/06 are not *mapped* to this phase but their state distinctions are *encoded* in the schema here (status enum, validity dates, lastUpdated), so Phases 2/3 inherit a contract that already expresses them.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | 22 LTS (24.15 present locally) | Spike runtime + scraper | CLAUDE.md mandate; native `fetch`/`undici`, no HTTP client dep [CITED: CLAUDE.md] |
| Native `fetch` | built-in (Node 18+) | Homepage key scrape + `/offers/search` probe | CLAUDE.md forbids axios/node-fetch; `fetch` is global in Node 22/24 [CITED: CLAUDE.md] |
| `zod` | **4.4.3 latest** (CLAUDE.md says 3.x — see State of the Art) | Validate captured payloads + outgoing `current-offers.json`/`status.json` shape | CLAUDE.md recommends zod to fail loudly on marktguru shape drift [CITED: CLAUDE.md] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:test` + `node:assert` | built-in (Node 22+) | Run the matcher against captured fixtures | Zero-dep test runner; nyquist_validation is OFF so no framework is mandated. Use this rather than adding vitest/jest for a spike. |
| TypeScript (`.d.ts` or JSDoc) | 5.x (optional) | Shared types for the contract | CONTEXT calls for "shared types". A single `types.ts`/`schema.ts` exporting the contract types + zod schemas is the deliverable both Phase 2 and 3 import. Plain JSDoc-typed `.js` is also acceptable for a single-user app. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native `fetch` | `sydev/marktguru` npm pkg | The package wraps exactly this API, but pulling a dep for one endpoint contradicts CLAUDE.md "no unneeded deps"; **use it as a reference for field names, not as a runtime dependency.** |
| `node:test` | vitest | vitest gives nicer DX but adds a toolchain for a 1-file matcher test in a spike; not justified. |
| zod | hand-rolled validation | "Don't hand-roll" — zod is already blessed by CLAUDE.md and catches shape drift declaratively. |
| zod 4 | zod 3.25 (`zod/v4` compat or pin `zod@3`) | zod 4 changed APIs/imports; see State of the Art — planner should pick one and pin it. |

**Installation:**
```bash
# In repo root (spike + future scraper share this)
npm init -y
npm install zod
# dev types only if using TS:
npm install -D typescript @types/node
```

**Version verification:**
- `zod` — `npm view zod version` → **4.4.3** (latest), created 2020-03-07, last modified 2026-05-04 [VERIFIED: npm registry]. dist-tags: `latest: 4.4.3`, `beta: 4.1.13-beta.0`.

## Package Legitimacy Audit

> This phase installs one external package (`zod`). marktguru is accessed over HTTP, not via a package (the `sydev/marktguru` repo is used only as a field-name reference, not installed).

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `zod` | npm | ~6 yrs (created 2020-03-07) | very high (top-tier validation lib) | github.com/colinhacks/zod | OK | Approved — but pin major (3 vs 4), see State of the Art |
| `typescript` | npm | mature | very high | github.com/microsoft/TypeScript | OK | Approved (optional, dev-only) |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.

> The `package-legitimacy check` seam was unavailable in this environment; verification was done via `npm view` (registry existence, age, modify date) plus known-provenance source repos. zod is a household-name library — no slopsquat risk. The only planner action is choosing/pinning the zod major version.

## marktguru API — Verified Integration Notes

> Source: `sydev/marktguru` TypeScript definitions + index, `manmal/marktguru-cli`, and live marktguru.de offer pages. All MEDIUM confidence (unofficial, reverse-engineered) — **the spike must confirm against captured payloads.**

### Auth key extraction (homepage bootstrap)
1. `GET https://www.marktguru.de/` (the homepage HTML).
2. Extract `<script type="application/json">…</script>` blocks. Regex used by sydev: `/<script\stype="application\/json">(.*?)<\/script>/gm` [VERIFIED: github.com/sydev/marktguru index].
3. `JSON.parse` the matching block → object shaped `{ config: { apiKey, clientKey } }`. Read `config.apiKey` and `config.clientKey` [VERIFIED: sydev `Config` type].
4. Cache the keys (~6h per CLAUDE.md). For the **spike**, fetching once is fine.

> Multiple `<script type="application/json">` blocks exist on the page; the scraper must find the one that parses to an object containing `config.apiKey`. The spike should log how many blocks matched and which index held the keys, so Phase 2 selects robustly rather than assuming block [0].

### `/offers/search` request
- **Base:** `https://api.marktguru.de/api/v1`
- **Request:** `GET /offers/search?as=web&q=coca%20cola&zipCode=67105&limit=200&offset=0`
- **Headers:** `x-apikey: <apiKey>`, `x-clientkey: <clientKey>`, plus a sane `User-Agent` (good-citizen, per CLAUDE.md ToS notes) [VERIFIED: sydev + manmal-cli].
- Params confirmed across tools: `as=web`, `q`, `zipCode`, `limit` (sydev defaults 1000; CLAUDE.md uses 200), `offset`.

### Response shape (sydev TypeScript definitions — confirm live)
`Offer` (top-level array entries; the wrapper around the array — `results`/`data`/`totalResults` — is **NOT in the sydev types and must be captured live**):

| Field path | Type | Notes / confidence |
|------------|------|--------------------|
| `id` | number | offer id [VERIFIED: sydev type] |
| `description` | string | **top-level**; in practice carries pack/flavor detail [VERIFIED: sydev] |
| `product.name` | string | short generic title ("Cola") [VERIFIED: sydev + live pages] |
| `product.description` | string \| null | secondary description [VERIFIED: sydev] |
| `brand` | `Brand` (`{name, uniqueName, id, …}`) | e.g. Coca-Cola [VERIFIED: sydev] |
| `price` | number | **decimal euros** (e.g. `4.00`, `9.99`) — **NOT cents** [VERIFIED: sydev + live] |
| `oldPrice` | number \| null | strike-through price [VERIFIED: sydev] |
| `referencePrice` | number | price-per-unit (e.g. `1.33`) — basis for €/litre cross-check [VERIFIED: sydev + live] |
| `unit` | `{shortName, id, name}` | e.g. `{shortName:"l", name:"Liter"}` [VERIFIED: sydev + live] |
| `advertisers` | `Advertiser[]` | each `{name, uniqueName, id, indexOffer, …}` [VERIFIED: sydev] |
| `advertisers[].name` | string | display name ("REWE") [VERIFIED: sydev] |
| `advertisers[].uniqueName` | string | slug key (`'rewe'`,`'lidl'`,…) [VERIFIED: sydev] |
| `validityDates` | `Array<{from, to}>` | **array** of date ranges, ISO strings — **NOT** `validFrom`/`validTo`, **NOT** a single `expires` [VERIFIED: sydev] |
| `images.urls.{small,medium,large}` | string | CDN image URLs (Coca-Cola product images out of scope per CLAUDE.md, but available) [VERIFIED: sydev] |

**Field-name reconciliation vs CLAUDE.md reverse-engineered notes:**
- CLAUDE.md guessed `validFrom`/`validTo` *or* `expires`. **Reality (per sydev): `validityDates: [{from,to}]`.** Map to the contract's `validFrom`/`validTo` by taking the relevant range's `from`/`to`. ⚠️ An offer can have **multiple** validity ranges — the scraper must pick the current/next one. Flag in the spike.
- CLAUDE.md guessed `price`. Confirmed, but it is a **decimal**, so D-09 cents storage = `Math.round(price * 100)`.
- Store identity is **`advertisers[].uniqueName`** for matching (slug) + `advertisers[].name` for display.

## Per-Store Coverage (PLZ 67105) — UNCONFIRMED, spike must resolve

| Target advertiser | Expected `uniqueName` (assume, confirm live) | marktguru coverage signal | Confidence |
|-------------------|---------------------------------------------|---------------------------|------------|
| REWE | `rewe` | Live `/rb/rewe/coca-cola` page exists with Cola offers incl. a "12 x 1-l case" [CITED: marktguru.de/rb/rewe/coca-cola] | MEDIUM |
| Edeka | `edeka` (variants seen: `edeka-frischemarkt`) | `/rb/edeka-frischemarkt/coca-cola` exists; **exact uniqueName at PLZ 67105 must be confirmed** [CITED: marktguru.de] | MEDIUM-LOW |
| Lidl | `lidl` | Listed retailer; confirmed in sydev `Retailer` enum [VERIFIED: sydev] | MEDIUM |
| Kaufland | `kaufland` (assume) | Listed retailer in CLAUDE.md feasibility table; not in sydev enum sample | LOW — confirm live |
| Wasgau | `wasgau` (assume) | CLAUDE.md: regional Pfalz chain present on marktguru retailer pages, but **Cola coverage at 67105 unconfirmed; may be leaflet-only → `unavailable`** | **LOW — the key unknown** |

[ASSUMED] uniqueName slugs for edeka/kaufland/wasgau — sydev's sample enum lists `'lidl'|'netto-marken-discount'|'aldi-sued'|'aldi-nord'|'penny'|'norma'|string` (open-ended `string`), so others exist but exact slugs aren't proven. **The spike must record the actual `advertisers[].uniqueName` returned for 67105 and build the 5-store key map from live data.**

> Wasgau outcome is acceptable either way: if no structured Cola offer appears, the contract's `status:"unavailable"` (D-05/OFFR-04) is the *designed* result, not a bug. Do **not** plan OCR (CLAUDE.md What-NOT-to-Use).

## Strict 12×1L Matcher (DATA-02) — design

### The decisive finding: match on `description`, not title
Live marktguru offer rows have a **short generic bold title** and a **separate descriptive line** carrying pack size + flavor:

| Bold title (`product.name`) | Descriptive line (`description`) — verbatim | Verdict |
|---|---|---|
| `Cola` | `12 x 1-l case … (Fanta/Sprite/Mezzo Mix), 9,99 €` | **needsReview** (mixed brands) |
| `Cola` | `1,25-l-Fl. … versch. Sorten` | reject (1.25L bottle) |
| `Cola` | `je 6 x 0,33-l-Fl.-Pckg.` | reject (6-pack cans/bottles) |
| `Cola` | `je 10 x 0,33-l-Ds.` (`oder Coca-Cola Zero`) | reject (can tray) |
| `Cola` | `24 x 0,33 l Dose … NUR FÜR GROSSHÄNDLER` | reject (wholesale tray) |
| `Cola` | `12 x 0,5-l … 7,99 €` | reject (0.5L, not 1L) |
| `Cola` | `6 x 1-l case … 7,99 €` | reject (6×1L, not 12) |
[CITED: marktguru.de/rb/rewe/coca-cola, marktguru.de/bl/coca-cola/koeln]

**Implication:** the matcher's input is the **concatenation** of `brand.name` + `product.name` + `product.description` + `description` (normalize: lowercase, collapse whitespace, replace `×`/`,`/`-` consistently — German uses `12 x 1 l`, `12x1l`, `12 × 1 l`, `12 x 1-l`).

### Matcher rules (frozen here, implemented + fixture-tested in this phase)
1. **Brand gate (reject store brands, D-07):** require Coca-Cola brand. Accept if `brand.uniqueName`/`brand.name` ~ `coca[\s-]?cola` OR text contains `coca-cola`. Reject obvious store/competitor colas (`ja!`, `gut&günstig`, `k-classic`, `vita cola`, `freeway`, `river`, `pepsi`, `fritz`, `red bull cola`, etc.). A `Cola`-titled offer whose brand is NOT Coca-Cola → reject.
2. **Pack-size gate (strict, D-06/D-07):** ACCEPT only when a `12 × 1 L` token is present: regex family `/(^|[^\d])12\s*[x×]\s*1\s*[-]?\s*l(iter)?\b/i`. Synonyms to accept alongside: presence of `12 x 1` with unit `l` and absence of disqualifiers.
3. **Disqualifier tokens (reject even if "12" appears):** `1,25`, `0,5`/`0,33`/`0,2`, `dose`/`ds.`/`tray`, `6 x`, `10 x`, `24 x`, `0,33-l`, `flasche`-only without `12 x 1`. Reject if any disqualifier present and no clean `12 x 1 l`.
4. **Flavor-permissive (D-06):** do NOT reject on `zero`/`light`/`zerolight`/`classic`/`koffeinfrei` — these match if pack size is the case.
5. **Quarantine → `needsReview: true` (D-08):** set when the offer is clearly Coca-Cola brand AND mentions a 12×1L-ish case BUT is **mixed-brand** (text contains `oder fanta`/`sprite`/`mezzo mix`/`versch. sorten`) or pack size is **ambiguous** (e.g. `12 x 1 l` token absent but `kasten`/`case` present without a contradicting size). These are kept in `current-offers.json` with `needsReview:true` and filtered from the brother view (D-13/D-08).
6. **Pfand stripping (D-10):** ignore `zzgl. … pfand` / `+ … deposit` text entirely; never parse it into a price.

### Fixtures the matcher must be tested against (capture as committed JSON)
Accept: a real `12 x 1 l` Coca-Cola Classic offer; a Zero `12 x 1 l`; a Light `12 x 1 l`.
Reject: `1,25-l` bottle; `6 x 0,33` pack; `10 x 0,33 Dose`; `24 x 0,33 Dose` wholesale; `12 x 0,5-l`; `6 x 1-l`; a store-brand `Cola`.
Quarantine: the mixed `Cola oder Fanta/Sprite/Mezzo Mix 12 x 1 l` offer; an offer saying `Kasten` with no explicit per-bottle size.

> Because real 12×1L Coca-Cola offers may not be live at 67105 on spike day, the plan must allow **hand-authored fixtures derived from the verbatim live strings above** when a live capture lacks a positive case — clearly labelled as synthesized-from-real-text, not invented.

## Architecture Patterns

### System Architecture Diagram

```
                         ┌─────────────────────────────┐
   marktguru.de homepage │  GET / (HTML)               │
   ──────────────────────┤  extract <script            │
                         │  type="application/json">   │
                         │  → config.apiKey/clientKey   │
                         └──────────────┬──────────────┘
                                        │ keys (cache ~6h)
                                        ▼
   api.marktguru.de  ┌──────────────────────────────────────┐
   ──────────────────┤ GET /offers/search?q=coca cola        │
   x-apikey/clientkey│   &zipCode=67105&as=web&limit=200      │
                     └──────────────┬───────────────────────┘
                                    │ raw Offer[] JSON
                                    ▼
   ┌─────────────────────────────────────────────────────────┐
   │ SPIKE CAPTURE (this phase)                              │
   │  • write raw payload → fixtures/raw-67105-*.json        │
   │  • record actual advertisers[].uniqueName per store     │
   └──────────────┬──────────────────────────────────────────┘
                  │ raw offers
                  ▼
   ┌──────────────────────────┐    accept ──► offer entry (status:"offer")
   │ STRICT MATCHER (DATA-02) │    reject ──► dropped
   │  brand + 12×1L pack gate │    ambiguous ──► needsReview:true (kept, hidden)
   └──────────────┬───────────┘
                  │ matched offers
                  ▼
   ┌─────────────────────────────────────────────────────────┐
   │ NORMALIZE (contract)                                    │
   │  price→cents (round(price*100))                         │
   │  pricePerLitre = cents/12  (cross-check referencePrice) │
   │  validityDates[].{from,to} → validFrom/validTo (Berlin) │
   └──────────────┬──────────────────────────────────────────┘
                  │
        ┌─────────┼──────────────────────┬───────────────────┐
        ▼         ▼                      ▼                   ▼
  current-     price-history.jsonl   status.json        UI-state MOCKS
  offers.json  (append line)         (per-store state)  (offer/no_offer/
  (5 stores)                                             upcoming/error/stale)
        │            │                     │                   │
        └────────────┴──────────┬──────────┴───────────────────┘
                                ▼
                   shared types.ts + zod schema
                  (Phase 2 scraper & Phase 3 PWA both import)
```

### Recommended Project Structure (proposal — Claude's discretion D)
```
/
├── data/
│   ├── current-offers.json        # frozen mock for this phase; real in Phase 2
│   ├── price-history.jsonl        # seeded with mock lines
│   └── status.json
├── contract/
│   ├── schema.ts (or .js+JSDoc)   # zod schemas + TS types — THE shared contract
│   └── matcher.ts                 # strict 12×1L matcher (pure fn over text)
├── spike/
│   ├── probe.mjs                  # fetch keys + /offers/search, save raw payloads
│   └── fixtures/
│       ├── raw-67105-search.json  # captured live payload (or per-store)
│       ├── accept/*.json          # positive matcher cases
│       ├── reject/*.json
│       └── review/*.json
├── mocks/                         # one file per required UI state
│   ├── current-offers.offer.json
│   ├── current-offers.no_offer.json
│   ├── current-offers.upcoming.json
│   ├── current-offers.error.json
│   └── current-offers.stale.json
└── test/
    └── matcher.test.mjs           # node:test over spike fixtures
```

### Pattern 1: Pure matcher over normalized text
**What:** matcher is a pure function `classify(offer) → "accept" | "reject" | "review"` operating on a normalized concatenation of brand/title/description.
**When:** always — keeps it unit-testable against fixtures without network.
**Example:**
```js
// Source: derived from sydev/marktguru Offer shape + live marktguru.de strings
function normalize(offer) {
  return [offer.brand?.name, offer.product?.name, offer.product?.description, offer.description]
    .filter(Boolean).join(" ")
    .toLowerCase()
    .replace(/×/g, "x")
    .replace(/\s+/g, " ");
}
const IS_12x1L = /(^|[^\d])12\s*x\s*1\s*-?\s*l(iter)?\b/;
const DISQUALIFY = /(1,25|0,5|0,33|0,2|\bdose\b|\bds\.|6\s*x|10\s*x|24\s*x)/;
const STORE_BRAND = /(ja!|gut&g|k-classic|vita cola|river cola|freeway|pepsi)/;
```

### Anti-Patterns to Avoid
- **Matching on `product.name`/title alone** — titles are generic ("Cola"); pack size is in `description`. (This is the #1 trap.)
- **Storing `price` as a float** — violates D-09; round to cents on capture.
- **Treating `validityDates` as a single object** — it is an **array of `{from,to}`**; pick the active range.
- **Inventing fixtures** — fixtures must be captured live or synthesized verbatim from the live strings documented above.
- **OCR / leaflet parsing for Wasgau** — explicitly forbidden (CLAUDE.md); `unavailable` is the answer.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON shape validation | custom field checks | `zod` schemas | CLAUDE.md mandate; declarative, catches marktguru drift loudly |
| HTTP requests | axios/node-fetch | native `fetch` | CLAUDE.md forbids extra HTTP deps on Node 22/24 |
| Test running | custom runner | `node:test` | built-in; no dep for a spike |
| Date handling for validity | custom parsing | keep ISO `YYYY-MM-DD` strings as-is (Berlin semantics noted) | D-13 stores plain dates; no date lib needed at contract layer (date-fns is a Phase-3 PWA concern) |
| API client for marktguru | full wrapper lib | tiny `probe.mjs` (2 fetches) | one endpoint; sydev pkg as reference only |

**Key insight:** This phase is contract + proof, not production code. The least code that *proves the field names and freezes the schema* wins; resist building Phase-2 scraper machinery here.

## Common Pitfalls

### Pitfall 1: marktguru returns nothing positive at 67105 on spike day
**What goes wrong:** Weekly Cola offers are sparse; the live probe may return zero 12×1L Coca-Cola offers, leaving no positive fixture.
**Why:** German offers are weekly; the case may simply not be on sale that week at those 5 stores.
**How to avoid:** Plan for it — capture whatever *is* returned (proves the pipeline + field names), and **synthesize the positive fixture from the verbatim live 12×1L string** documented in this research, clearly labelled. Success criterion #1 allows "Wasgau not automatically available"; criterion #2 is satisfiable with synthesized-from-real fixtures.

### Pitfall 2: Assuming the field names from CLAUDE.md
**What goes wrong:** CLAUDE.md guesses `validFrom`/`validTo`/`expires` and `price`; the real shape is `validityDates:[{from,to}]` and decimal `price`.
**Why:** The notes are reverse-engineered and flagged "confirm live."
**How to avoid:** The spike's first job is to dump a raw payload and diff it against this research's field table; freeze the contract from the *captured* payload, not the guesses.

### Pitfall 3: Wrong advertiser `uniqueName` slugs
**What goes wrong:** Filtering by guessed slugs (`edeka`, `kaufland`, `wasgau`) silently drops all stores.
**Why:** Only `lidl`/`penny`/`netto-marken-discount`/`aldi-*`/`norma` are confirmed in sydev's sample; others are `string`.
**How to avoid:** The probe logs **every distinct `advertisers[].uniqueName`** seen for 67105; the 5-store key map is built from that observed set, not assumed.

### Pitfall 4: Multiple `<script type="application/json">` blocks
**What goes wrong:** Grabbing block [0] may not contain `config.apiKey`.
**Why:** Modern pages embed several JSON islands.
**How to avoid:** Iterate all matches, `JSON.parse` each, select the one with `config.apiKey`. Log the index for Phase 2.

### Pitfall 5: Pfand leaking into price
**What goes wrong:** `zzgl. 3,30 Pfand` text gets parsed as part of the price.
**Why:** Pfand appears inline in description text and as `+€X deposit` on pages.
**How to avoid:** D-10 — never read deposit; use only the numeric `price` field, convert to cents.

## Code Examples

### Spike probe (capture raw payload + advertiser slugs)
```js
// Source: sydev/marktguru index (key regex) + manmal-cli (request shape). Node 22+, native fetch.
const HOME = "https://www.marktguru.de/";
const API = "https://api.marktguru.de/api/v1/offers/search";

async function getKeys() {
  const html = await (await fetch(HOME, { headers: { "user-agent": "colaapp-spike/0.1 (personal, low-volume)" } })).text();
  const blocks = [...html.matchAll(/<script\s+type="application\/json">(.*?)<\/script>/gms)];
  for (const [, json] of blocks) {
    try { const o = JSON.parse(json); if (o?.config?.apiKey) return { apiKey: o.config.apiKey, clientKey: o.config.clientKey }; } catch {}
  }
  throw new Error("config.apiKey not found in homepage JSON islands");
}

const { apiKey, clientKey } = await getKeys();
const url = `${API}?as=web&q=${encodeURIComponent("coca cola")}&zipCode=67105&limit=200&offset=0`;
const res = await fetch(url, { headers: { "x-apikey": apiKey, "x-clientkey": clientKey, "user-agent": "colaapp-spike/0.1 (personal, low-volume)" } });
const data = await res.json();
// persist raw for fixtures + freeze field names from THIS object:
await import("node:fs/promises").then(fs => fs.writeFile("spike/fixtures/raw-67105-search.json", JSON.stringify(data, null, 2)));
// log observed store slugs:
const slugs = new Set();
for (const o of (data.results ?? data.data ?? data)) for (const a of (o.advertisers ?? [])) slugs.add(a.uniqueName);
console.log("advertiser uniqueNames @67105:", [...slugs].sort());
```
> ⚠️ The top-level wrapper (`data.results` vs `data.data` vs a bare array) is **unconfirmed** — the spike resolves it; the `??` chain above is a placeholder the spike will narrow.

### Normalize price → cents + €/litre (contract)
```js
// D-09 cents, D-11 pricePerLitre (12×1L → ÷12). price is a decimal euro number.
const cents = Math.round(offer.price * 100);          // 9.99 -> 999
const pricePerLitre = Math.round(cents / 12);          // case = 12 L
// sanity cross-check against marktguru referencePrice (€/l) when unit.shortName === "l":
// Math.abs(pricePerLitre/100 - offer.referencePrice) should be small.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| zod 3.x (CLAUDE.md) | zod **4.x is now `latest` (4.4.3)** | zod 4 GA + ongoing 2025–2026 | zod 4 changed imports (`zod/v4`), some APIs, error format. Planner must **pick & pin**: `zod@^3.25` (stable, matches CLAUDE.md, has `zod/v4` mini) OR `zod@^4`. For a spike either works; recommend pinning `zod@3` to match CLAUDE.md's documented version unless the team wants v4. [VERIFIED: npm registry] |
| Guessed `validFrom`/`validTo`/`expires` | Real: `validityDates:[{from,to}]` array | — | Contract mapping must select a range from the array |
| Guessed scalar `price` in cents | Real: decimal euro `price` | — | Must `round(price*100)` for D-09 |

**Deprecated/outdated:**
- REWE direct `mobile-api` (Cloudflare mTLS since 2024) — not used; marktguru aggregator path stands (CLAUDE.md).
- node-fetch/axios — unnecessary on Node 22/24 (native fetch).

## Runtime State Inventory

> Greenfield phase — no rename/refactor/migration. Section omitted (nothing to inventory; only `.planning/`, `.claude/`, `CLAUDE.md` exist, no prior code or data files).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js + native `fetch` | spike probe, matcher, tests | ✓ | v24.15.0 (>=18 needed) | — |
| `npm` | install zod | ✓ (ships with Node) | — | — |
| Network → `marktguru.de` / `api.marktguru.de` | live probe (success criterion #1) | ✗ unverified in this sandbox | — | If blocked at plan/spike time: capture must run on the user's machine; synthesize fixtures from documented live strings as last resort |
| `zod` (npm) | schema validation | ⚠ not yet installed | 4.4.3 avail | hand validation (discouraged) |

**Missing dependencies with no fallback:** none hard-blocking — Node is present. The marktguru live call is the only thing that *can't* be guaranteed from inside the build sandbox; the spike step runs it and records the result (including a legitimate "Wasgau unavailable").

**Missing dependencies with fallback:** `zod` (install step), live positive fixture (synthesize from verbatim live text if absent that week).

## Security Domain

> `security_enforcement: true`, ASVS level 1. This phase makes outbound HTTP to a third-party unofficial API and writes JSON to the repo. No auth, no user input, no PII.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No app auth; marktguru keys are public bootstrap values, not secrets |
| V3 Session Management | no | No sessions |
| V4 Access Control | no | Single-user static data; no access tiers |
| V5 Input Validation | **yes** | `zod`-validate the captured marktguru payload before trusting any field; matcher treats text as untrusted |
| V6 Cryptography | no | No secrets stored; do not hand-roll crypto |
| V14 Configuration | yes | Keys fetched at runtime, never committed; `node_modules`/secrets gitignored |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Untrusted upstream JSON (marktguru changes shape / injects garbage) | Tampering | zod schema validation; fail loudly, don't corrupt `data.json` |
| ReDoS in matcher regexes | DoS | Keep matcher regexes linear/anchored; avoid catastrophic backtracking (the patterns above are simple, bounded) |
| Committing the scraped apiKey/clientKey | Info disclosure | They are *public* page-bootstrap values, but still **do not commit them**; the spike logs only their presence, fixtures store offer payloads not keys |
| Leaflet/HTML injection if ever parsing HTML (Wasgau) | Tampering/XSS | Out of scope — no HTML parse this phase; Wasgau → `unavailable` |
| Good-citizen ToS (rate/UA) | — (legal/operational) | Single low-volume probe, descriptive UA, cache keys; never parallel-hammer (CLAUDE.md) |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Edeka uniqueName is `edeka` (saw `edeka-frischemarkt` variant) | Per-Store Coverage | Filter drops Edeka silently — probe must capture real slug |
| A2 | Kaufland uniqueName is `kaufland` | Per-Store Coverage | Filter drops Kaufland — probe must confirm |
| A3 | Wasgau is reachable as a structured advertiser at 67105 | Per-Store Coverage | Likely `unavailable` (designed outcome) — probe decides |
| A4 | Response top-level wraps offers as `results`/`data` (vs bare array) | API notes / code example | Probe must inspect the real wrapper before Phase 2 |
| A5 | `validityDates[]` from/to are `YYYY-MM-DD` (or trimmable to it) for D-13 | API notes | May be full ISO datetimes; scraper trims to date — confirm live |
| A6 | A 12×1L Coca-Cola offer will be capturable; else synthesize from verbatim live strings | Matcher / Pitfall 1 | If no live positive that week, fixtures are synthesized-from-real (labelled) |
| A7 | `price` is always a decimal euro number (not occasionally cents/string) | Normalization | Wrong cents conversion — zod-validate type, confirm live |

**These are the decisions the planner should gate behind the spike's live capture** — none should be locked into production code (Phase 2) until the captured payload confirms them.

## Open Questions

1. **Top-level response wrapper shape.**
   - Known: array entries are `Offer` (sydev). Unclear: the wrapper (`results`/`data`/pagination/total).
   - Recommendation: spike dumps `Object.keys(data)` of the raw response; freeze from that.
2. **Wasgau Cola coverage at 67105.**
   - Known: regional chain present on marktguru retailer pages generally. Unclear: structured 12×1L Cola at this PLZ.
   - Recommendation: probe; if absent, declare `status:"unavailable"` (acceptable per criterion #1) and mock it.
3. **zod major version (3 vs 4).**
   - Known: CLAUDE.md says 3.x; `latest` is 4.4.3.
   - Recommendation: pin `zod@3` to match documented stack unless user opts into v4.
4. **`validityDates` granularity & multiplicity.**
   - Known: array of `{from,to}` ISO strings. Unclear: datetime vs date, and how to pick when >1 range.
   - Recommendation: spike inspects a real offer; contract takes the current-or-next range, trimmed to `YYYY-MM-DD` Berlin.

## Sources

### Primary (HIGH confidence)
- `github.com/sydev/marktguru` — `src/@types/marktguru.d.ts` (Offer/Product/Advertiser/Unit/ValidityDates/Brand/Images/Config types) and key-extraction regex — the authoritative reverse-engineered schema.
- `CLAUDE.md` (project) — marktguru integration notes, per-store feasibility, Data File Format, What-NOT-to-Use, version compatibility.
- `npm view zod` — version 4.4.3 latest, created 2020, dist-tags.
- Node `v24.15.0` present locally (native fetch).

### Secondary (MEDIUM confidence)
- `manmal/marktguru-cli`, `Nusscookie/offers-api`, `thorschtn/ha-marktguru` — corroborate base URL, headers (`x-apikey`/`x-clientkey`), params (`as`,`q`,`zipCode`,`limit`,`offset`), homepage key scrape.
- `marktguru.de/rb/rewe/coca-cola` and `marktguru.de/bl/coca-cola/koeln` — live verbatim offer strings proving pack size lives in the description and the 12×1L/1,25L/Dose/case distinctions.

### Tertiary (LOW confidence)
- Assumed advertiser uniqueName slugs for edeka/kaufland/wasgau and Wasgau coverage at 67105 — flagged in Assumptions Log; the live spike resolves them.

## Metadata

**Confidence breakdown:**
- Schema/contract design (D-01…D-14 feasibility): HIGH — all decisions map cleanly to the verified marktguru shape; only cents conversion + validityDates-array mapping are contract notes.
- marktguru field names: MEDIUM — corroborated across 4 community repos + live pages, but unofficial; spike must confirm against captured payload.
- Per-store PLZ 67105 coverage (esp. Wasgau): LOW — unverifiable without the live probe; "unavailable" is a designed acceptable outcome.
- Matcher rules: MEDIUM-HIGH — grounded in verbatim live offer strings; needs real-fixture tuning (the `needsReview` quarantine exists for exactly this).

**Research date:** 2026-06-15
**Valid until:** ~2026-07-15 for the schema design; marktguru field names/keys should be re-confirmed by the spike capture at plan/execution time (unofficial API can change without notice — treat breakage as expected, not exceptional).
