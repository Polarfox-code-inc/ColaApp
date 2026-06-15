---
phase: 01-data-contract-source-spike
reviewed: 2026-06-15T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - contract/matcher.mjs
  - contract/schema.mjs
  - contract/types.d.ts
  - spike/probe.mjs
  - test/matcher.test.mjs
  - test/schema.test.mjs
findings:
  critical: 0
  warning: 5
  info: 4
  total: 9
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-06-15
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Phase 1 ships the frozen data contract (`schema.mjs` + `types.d.ts`), the strict
12x1L matcher (`matcher.mjs`), and a live source spike (`probe.mjs`), with two
test suites. The code is clean, well-documented, and all 38 tests pass. Security
posture is good: the probe never logs/writes the scraped keys, uses native fetch
with a single low-volume request, parses JSON islands with `JSON.parse` (never
`eval`), and all regexes are linear/anchored (no ReDoS found — the homepage
island regex uses a single lazy `.*?` and the matcher/schema regexes use bounded
`\s*` runs only).

No BLOCKER/Critical defects. However, the matcher and schema both have
correctness gaps that undercut their own stated guarantees:

- The matcher's competitor-brand blocklist contains the bare token `fritz`,
  which spuriously **rejects a genuine Coca-Cola 12x1L offer** whose text merely
  contains an unrelated word like "Fritzlar" (a real town) or "fritzbox". For an
  app whose entire core value is "show the one offer when it appears," a
  false-negative that silently drops a real offer is the most damaging failure
  mode. (WR-01)
- The schema advertises "fail loud on drift" but accepts several semantically
  invalid payloads: impossible calendar dates (`2026-13-45`), `no_offer` entries
  carrying stray `price`/date fields, and inverted `validFrom`/`validTo` ranges.
  The PWA computes staleness/upcoming math from these dates, so an invalid date
  flows downstream as `Invalid Date`/`NaN`. (WR-02..WR-04)

No source files were modified. A scratch probe file created during review was
deleted.

## Warnings

### WR-01: Bare `fritz` token in STORE_BRAND silently rejects valid offers

**File:** `contract/matcher.mjs:56`
**Issue:** `STORE_BRAND` ends with `|fritz)` — an unbounded substring with no
word boundary. Any offer text containing "fritz" as a substring (e.g. the town
"Fritzlar", "fritzbox", "Fritz-Kola" is already covered by `fritz[\s-]?kola`)
matches and is rejected at step 1 **before** the Coca-Cola brand and pack-size
checks ever run. Verified: a `Coca-Cola 12 x 1-l Markt Fritzlar` offer
classifies as `reject` instead of `accept`. Because step 1 runs first, this
drops a genuine 12x1L Coca-Cola case — the exact event the app exists to surface.
The sibling `\briver\b` token correctly uses boundaries; `fritz` does not.
**Fix:** Anchor the token to a word boundary (and drop the redundant bare alt,
since `fritz[\s-]?kola` already covers the real competitor):
```js
const STORE_BRAND = /(ja!|gut\s*&\s*g|k-classic|vita\s*cola|river\s*cola|\briver\b|freeway|pepsi|\bfritz[\s-]?kola\b)/;
```
If a standalone "fritz" brand must stay, bound it: `\bfritz\b`.

### WR-02: DateOnly accepts impossible calendar dates

**File:** `contract/schema.mjs:34-36`
**Issue:** `DateOnly` validates only the shape `^\d{4}-\d{2}-\d{2}$`, so
`"2026-13-45"`, `"2026-00-00"`, and `"2026-02-30"` all pass. The contract's
stated purpose (schema.mjs:5-6) is to make drifted payloads "throw here rather
than silently corrupting data." A malformed date is exactly such drift, yet it
passes into `validFrom`/`validTo`/`date`. The PWA derives "upcoming" and
staleness by comparing/parsing these strings (see test/schema.test.mjs:237-243),
where an impossible date yields `Invalid Date`/`NaN` comparisons.
**Fix:** Add a real-date refinement after the regex:
```js
const DateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD (Europe/Berlin)")
  .refine((s) => {
    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }, "not a real calendar date");
```

### WR-03: no_offer / unavailable / error entries may carry stray offer fields

**File:** `contract/schema.mjs:62-74`
**Issue:** The `superRefine` only enforces that offer fields are **present** when
`status === "offer"`. It never enforces their **absence** for the other statuses.
A `{ status: "no_offer", price: 999, validFrom: "2026-06-16" }` entry validates
cleanly (verified). A drifted scraper that writes a stale price alongside a
`no_offer`/`error` status would not be caught, and the PWA could render a price
for a store it should show as having no offer — a correctness/trust bug for the
single user.
**Fix:** Extend the refinement to reject offer fields when status is not "offer":
```js
} else {
  for (const field of required) {
    if (o[field] !== undefined && o[field] !== null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field],
        message: `status:"${o.status}" must not carry ${field}` });
    }
  }
}
```

### WR-04: No cross-field check that validFrom <= validTo

**File:** `contract/schema.mjs:46-58, 112-121`
**Issue:** `StoreOfferSchema` and `HistoryLineSchema` accept inverted ranges
(`validFrom: "2026-06-21", validTo: "2026-06-16"` — verified). An inverted range
makes "is this offer currently valid?" logic in the PWA wrong (the window is
empty / negative). This is cheap to guard at the contract boundary and aligns
with the module's "fail loud on drift" mandate.
**Fix:** Add a `superRefine` comparing the two ISO `YYYY-MM-DD` strings
(lexicographic compare is valid for this format):
```js
if (o.validFrom && o.validTo && o.validFrom > o.validTo) {
  ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["validTo"],
    message: "validTo must be on or after validFrom" });
}
```

### WR-05: `gut\s*&\s*g` over-matches the common phrase "gut & günstig"

**File:** `contract/matcher.mjs:56`
**Issue:** `gut\s*&\s*g` is intended to catch Edeka's "Gut&Günstig" store brand,
but with no boundaries it matches any "...gut & g..." run in free advertiser
copy (e.g. "alles gut & günstig bei uns"). Combined with step-1 priority, this
can reject a real Coca-Cola 12x1L offer whose marketing blurb happens to use the
phrase. Lower-likelihood than WR-01 but the same false-negative class.
**Fix:** Bound it to the brand form, e.g. `\bgut\s*&\s*g[üu]nstig\b`, and rely on
the COCA_COLA_BRAND check to keep genuine Coca-Cola offers that merely mention the
phrase. If the goal is only to reject store-brand colas, the COCA_COLA_BRAND gate
at step 2 already handles non-Coca-Cola products.

## Info

### IN-01: Dead defensive loop — unreachable unknown-store branch

**File:** `contract/schema.mjs:99-107`
**Issue:** The loop "Reject any store key outside the fixed set" can never fire:
each array element is validated by `StoreOfferSchema` whose `store: StoreKey` is a
`z.enum(STORES)`, so any non-member key already fails before this file-level
refinement runs. The code comment acknowledges StoreKey enforces it. Harmless but
dead.
**Fix:** Remove lines 97-107, or keep with a comment explicitly noting it is
belt-and-suspenders that is currently unreachable.

### IN-02: `112 x 1-l` quarantines as "review" rather than "reject"

**File:** `contract/matcher.mjs:45,97`
**Issue:** Text "112 x 1-l case" fails `IS_12x1L` (the leading `1` correctly
blocks the `12` match) but still hits `CASE_WORD` ("case"), so it returns
"review" instead of "reject". A 112-pack is clearly not the product; routing it
to the human review queue is defensible but adds noise. Edge case, low frequency.
**Fix:** Acceptable as-is given the quarantine philosophy (D-08). If noise
matters, add an explicit large-count disqualifier (e.g. `\b\d{3,}\s*x`).

### IN-03: normalize() does not unify the comma/period decimal or Unicode spaces

**File:** `contract/matcher.mjs:28-41`
**Issue:** `normalize` unifies `×`→`x` and collapses ASCII whitespace, but
marktguru text can contain non-breaking spaces (` `) and the regexes use
`\s` (which in JS does match ` `, so this is fine) — however a thin space or
narrow no-break space variant in pack tokens like "12 x 1 l" is only handled by
`\s*`. Low risk; noted for Phase 2 when real payloads land.
**Fix:** None required now; revisit against `spike/fixtures/raw-67105-search.json`
real strings in Phase 2.

### IN-04: HistoryLineSchema does not constrain validFrom/validTo vs date

**File:** `contract/schema.mjs:112-121`
**Issue:** A history line's observation `date` can be unrelated to its
`validFrom`/`validTo` window (no relation enforced). Likely intentional
(observation timestamp vs offer window are different concepts), but worth a one-
line comment so Phase 2/3 don't assume `date` lies within the validity range.
**Fix:** Add a clarifying comment on the `date` field.

---

_Reviewed: 2026-06-15_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
