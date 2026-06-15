# Live Spike Findings — marktguru /offers/search @ PLZ 67105

> **Source:** Live probe run against `https://api.marktguru.de/api/v1/offers/search?as=web&q=coca%20cola&zipCode=67105&limit=200&offset=0`, captured to `spike/fixtures/raw-67105-search.json`. These are **freshly-observed** answers (not documented-fallback), human-verified at the Task-2 checkpoint and recorded here as the authoritative inputs Plans 02 (contract) and 03 (matcher) freeze against.
>
> **Query week:** 2026-06-15 (offers valid for the 2026-06-14 -> 2026-06-20 weekly cycle).

## 1. Response wrapper key (Open Question 1 / Assumption A4)

The offers array lives at the top-level key **`results`** — NOT `data`, NOT a bare array.

Top-level keys of the payload: `filters`, `totalResults`, `skippedResults`, `results`.

- `totalResults`: **20**
- `results`: array of **20** offer objects
- Contract resolution rule (Plan 02): read offers from `data.results`. The probe's defensive `data.results ?? data.data ?? data` chain resolved on `results`.

## 2. Observed advertiser slug map (Assumptions A1/A2, Pitfall 3)

Distinct `advertisers[].uniqueName` values returned for 67105 (sorted):

`edeka`, `kaufland`, `netto-marken-discount`, `penny`, `rewe`, `scheck-in-center`, `thomas-philipps`

Five-target verdict table:

| Target store | Real `advertisers[].uniqueName` slug | Verdict |
|--------------|--------------------------------------|---------|
| REWE | `rewe` | **Present** |
| Edeka | `edeka` | **Present** (no `edeka-frischemarkt` variant observed) |
| Lidl | — | **Not present at 67105 this week** |
| Kaufland | `kaufland` | **Present** |
| Wasgau | — (no structured advertiser) | **Not present** -> see section 3 |

Notes:
- `netto-marken-discount`, `penny`, `scheck-in-center`, and `thomas-philipps` are returned by the query but are **out of scope** (Aldi/Penny/Netto are excluded per ROADMAP; Scheck-In / Thomas Philipps are not target stores). The contract/scraper filters strictly to the five-target slug allow-list `{rewe, edeka, lidl, kaufland, wasgau}`.
- Lidl returning no offers this week is a normal weekly-cycle outcome, not a coverage failure — the slug `lidl` is the expected identifier when Lidl offers do appear.

## 3. Wasgau verdict (D-05 / OFFR-04 / Assumption A3)

**Verdict: absent — no structured Wasgau advertiser is returned at PLZ 67105.**

Decision: Wasgau is modeled with `status: "unavailable"` (per D-05 / OFFR-04) — i.e. "not automatically available" — rather than "no offer" (`kein Angebot`) or "error". The three states are distinct:
- **no offer** — store IS covered by the source but has no qualifying Cola case this cycle (e.g. Lidl).
- **unavailable** — store is not structurally retrievable from the source (Wasgau).
- **error** — a fetch/parse failure for a normally-available store.

**OCR is explicitly OUT OF SCOPE.** Wasgau leaflets are image/PDF-only on the store's own site; per CLAUDE.md "What NOT to Use" and the project scope, we do not build an OCR pipeline. An explicit "unavailable" state is the designed, accepted outcome.

## 4. validityDates granularity (Open Question 4 / Assumption A5)

`validityDates` is an **array of `{from, to}` objects** (supports multiple ranges), each with a **full ISO-8601 datetime in UTC**.

Sample observed value:

```json
"validityDates": [
  { "from": "2026-06-14T22:00:00Z", "to": "2026-06-20T21:59:00Z" }
]
```

Interpretation:
- `22:00:00Z` == **Berlin midnight** (CEST, UTC+2 in June) -> the data is effectively **day-granular in Europe/Berlin** despite being stored as datetime.
- **Active-range selection rule (Plan 02):** pick the range covering "now" (Europe/Berlin); if none is current, pick the next upcoming range (earliest `from` in the future) to satisfy the "current and upcoming" requirement.
- **Contract normalization:** trim each `from`/`to` to `YYYY-MM-DD` **in Europe/Berlin** (so `2026-06-14T22:00:00Z` -> `2026-06-15`, `2026-06-20T21:59:00Z` -> `2026-06-20`). Do NOT trim in UTC, or the Berlin-midnight boundary shifts a day.

## 5. Price field confirmation (D-09 / Assumption A7)

`price` is a **decimal euro number** (not cents, not a string). Observed sample values: `5.99`, `0.79`, `8.88`.

This confirms the contract's **`Math.round(price * 100)` cents conversion (D-09)** is correct. Float-rounding via `Math.round` (not truncation) avoids the classic `5.99 * 100 = 598.9999...` off-by-one.

Supporting fields also present in the payload:
- `referencePrice` — EUR/litre reference value (usable for the contract's EUR/litre field, or recompute from price / litres).
- `unit.shortName` — e.g. `"l"` (litre), useful for unit sanity checks.

## 6. Positive-fixture status (drives Plan 03)

**ZERO real 12x1L Coca-Cola cases were on sale at the target stores this week.**

All captured Coca-Cola offers are **disqualifiers** for the strict 12x1L matcher:
- 1.25L single bottles
- 0.33L cans
- 6x / 10x / 18x packs
- 6x1.25L multipacks
- 1.5L bottles
- Bacardi / Jack Daniel's mixer bundles ("... mit Coca-Cola")

Consequences for downstream plans:

- **Plan 03 (matcher)** must **SYNTHESIZE** the positive accept-fixture from the documented live strings in `01-RESEARCH.md` ("Strict 12x1L Matcher"), clearly labelled **`synthesized-from-real`**. There is no genuine positive case to capture this cycle.
- The captured `raw-67105-search.json` is a **strong negative / quarantine corpus**: it exercises the matcher's rejection paths (wrong size, wrong pack count, mixer bundles).
- Mixed-brand entries (e.g. "Coca-Cola **oder** Fanta / Mezzo Mix") are good **`needsReview` candidates** — ambiguous brand/variant strings the matcher should flag rather than silently accept or reject.

## Assumptions resolved

| Ref | Assumption (pre-spike guess) | Resolution |
|-----|------------------------------|------------|
| A1 | Advertiser slug for REWE/Edeka/Kaufland | Confirmed: `rewe`, `edeka`, `kaufland` |
| A2 | Lidl slug present | Slug expected `lidl`; **not returned this week** (no offers) |
| A3 | Wasgau coverage | **Absent** -> `status: "unavailable"`, no OCR |
| A4 | Wrapper key (`results` vs `data`) | **`results`** |
| A5 | validityDates granularity | Array of `{from,to}` ISO-UTC datetimes; day-granular in Berlin |
| A7 | `price` is decimal euro | **Confirmed** -> `Math.round(price*100)` cents (D-09) |
