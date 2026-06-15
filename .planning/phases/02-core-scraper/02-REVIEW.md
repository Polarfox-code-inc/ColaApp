---
phase: 02-core-scraper
reviewed: 2026-06-15T00:00:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - scraper/clock.mjs
  - scraper/normalize.mjs
  - scraper/filter.mjs
  - scraper/select.mjs
  - scraper/dedup.mjs
  - scraper/fetch.mjs
  - scraper/io.mjs
  - scraper/merge.mjs
  - scraper/index.mjs
  - package.json
findings:
  critical: 0
  warning: 4
  info: 5
  total: 9
status: issues-found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-06-15
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues-found

## Summary

Reviewed the Phase 2 core-scraper: an injectable-clock pure-transform core (normalize/filter/select/dedup), an I/O boundary (fetch with retry, atomic file writes, JSONL append), and a fault-isolated orchestrator (merge + index). The architecture is sound on the headline requirements I was asked to scrutinize:

- **Key/secret hygiene is clean.** The marktguru bootstrap `apiKey`/`clientKey` are scraped fresh per run, used only as request headers, and never logged or persisted. Error messages carry HTTP status/`statusText` only, not header values (`fetch.mjs:73-74,92,114-115`). Verified by grep — no key value ever reaches `console.*` or disk.
- **Atomic write is correct.** Same-directory temp + `rename` (`io.mjs:67-71`) is EXDEV-safe and gives all-or-nothing replacement.
- **Retry/timeout is correct.** A fresh `AbortSignal.timeout(10_000)` is constructed per attempt (`fetch.mjs:46`), avoiding the reused-fired-signal bug; backoff has jitter.
- **Regexes are ReDoS-safe.** The island-extraction regex (`fetch.mjs:78`) uses a non-greedy `.*?` with no nested quantifiers; the contract matchers are anchored/bounded. Confirmed empirically.
- **Fault isolation mostly holds.** Total-fetch and per-store builds are wrapped in try/catch; the run reaches the write step and carries forward last-known data.

No Critical (BLOCKER) defects found: no injection, no secret leakage, no data-loss path, no crash that wipes `data/`. The findings below are robustness and quality gaps — most importantly one fault-isolation hole (WR-01) where a single malformed offer downgrades an entire store to `error`, and one availability gap (WR-02) where a validation drift writes none of the three files.

## Warnings

### WR-01: A single malformed `validityDates` range throws and downgrades the whole store to `error`

**File:** `scraper/select.mjs:13-18` (via `scraper/normalize.mjs:26`)
**Issue:** `berlinRanges` maps every range through `berlinDay(r?.from)` / `berlinDay(r?.to)`, and `berlinDay` calls `new Intl.DateTimeFormat(...).format(new Date(iso))`. When `iso` is `undefined`, `null`, or a non-parseable string, `new Date(iso)` is an Invalid Date and `.format()` throws `RangeError: Invalid time value` (confirmed empirically). `validityDates` is untrusted third-party marktguru JSON. The throw propagates out of `selectForStore`, is caught only by the per-store try/catch in `index.mjs:118`, and marks the **entire store** `error` — even when that store has other perfectly valid offers in the same bucket. So one drifted/empty `from`/`to` on one offer suppresses a real, available offer for that store and shows the brother a stale/error state instead. This is exactly the fault-isolation property the phase set out to guarantee, but isolation here is per-store, not per-offer.

**Fix:** Make range parsing offer-local and skip an offer whose range cannot be parsed, rather than letting it poison the store. For example, guard `berlinRanges` so an unparseable range is dropped:
```js
const safeBerlinDay = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : BERLIN_DAY.format(d);
};
const berlinRanges = (offer) =>
  (offer?.validityDates ?? [])
    .map((r) => ({ raw: r, from: safeBerlinDay(r?.from), to: safeBerlinDay(r?.to) }))
    .filter((r) => r.from && r.to);
```
(Or wrap the per-offer mapping in `selectForStore` in its own try/catch so a bad offer is skipped, not the store.)

### WR-02: A merge/schema drift writes none of the three files and exits non-zero — violating "always write all three"

**File:** `scraper/index.mjs:132-134`
**Issue:** `parseCurrentOffers`/`parseStatusFile` run before any write (good — prevents corruption), but if either throws, the run aborts with exit code 1 and **zero** files are written: `current-offers.json` is not refreshed, `status.json` is not updated, and no history is appended. The stated invariant for this phase is that the run must always complete and write all three files (with last-known data preserved). A validation drift is the one path that breaks it — and crucially `status.json` is never updated to signal the failure, so the PWA freshness indicator cannot reflect that the run broke. The carried-forward `current-offers.json` from the last good run remains, which is acceptable, but the operator gets no machine-readable signal and the dead-man's-switch story depends on a stale file timestamp.

**Fix:** This is a deliberate "fail loud rather than corrupt" tradeoff, so don't suppress the throw — but make the failure observable without corrupting the snapshot. At minimum, on a validation throw, still attempt to write a minimal valid `status.json` recording an `error` for all stores (it has its own schema and a known-good shape), or document explicitly that a drift is an alert-only hard stop. If left as-is, add a comment at `index.mjs:132` making the "no files written on drift" consequence explicit so a future maintainer does not assume the always-write invariant is unconditional.

### WR-03: Bootstrap-key island regex is over-tight and silently routes every run to total-failure on a trivial markup change

**File:** `scraper/fetch.mjs:78`
**Issue:** `/<script\s+type="application\/json">(.*?)<\/script>/gms` requires the opening tag to be exactly `type="application/json">` with no other attributes and `>` immediately after the closing quote. Confirmed: `<script type="application/json" id="__NEXT_DATA__">` (a very common Next.js / nuxt shape) does **not** match, and `<script type = "application/json">` does not match. If marktguru adds any attribute or charset to that tag, `getKeys` finds no island, throws, and every run falls into total-failure → all four stores `error` indefinitely. Because the failure is silent (only `err.message` logged in CI), the brother would see stale data for days before anyone notices. This is the single highest-likelihood breakage vector in the scraper.

**Fix:** Loosen the tag match to tolerate extra attributes and whitespace around `=`, keeping it ReDoS-safe (still no nested quantifiers):
```js
/<script\b[^>]*\btype\s*=\s*["']application\/json["'][^>]*>(.*?)<\/script>/gms
```
Optionally also scan `<script type="application/ld+json">` or any island and accept the first with `config.apiKey`/`config.clientKey`, since selection is already by presence, not tag type.

### WR-04: `withRetry`'s 10s timeout is per-attempt only — no overall wall-clock cap; total fetch can run ~30s+ before failing over

**File:** `scraper/fetch.mjs:40-59` (compounded across `fetchOffers` at `142-146`)
**Issue:** Each attempt gets its own `AbortSignal.timeout(10_000)`, and `fetchOffers` chains two retried calls (`getKeys` then `searchOffers`). Worst case is 3×10s + ~1s + ~3s backoff per call = up to ~37s per call, ~74s total before the orchestrator gives up and carries forward. This is fine for correctness, but a hung marktguru endpoint can make a scheduled CI run sit for over a minute doing nothing useful. Not a data-correctness issue, but it weakens the "fast fail-over to last-known data" intent and consumes CI wall-time.

**Fix:** Either reduce `retries`/timeout for the homepage call (it is cheap and rarely the bottleneck), or pass a single shared deadline `AbortSignal` for the whole `fetchOffers` so the total run is bounded regardless of per-attempt timeouts. Low priority given the weekly-offer cadence, but worth a deliberate decision rather than emergent worst-case.

## Info

### IN-01: `MARKTGURU_STORES` is duplicated across two modules

**File:** `scraper/merge.mjs:29` and `scraper/index.mjs:47`
**Issue:** The four-store list `["REWE","Edeka","Lidl","Kaufland"]` is declared independently in both files. If the store set ever changes (it is a frozen Phase-1 decision, so unlikely), the two can drift. The canonical `STORES` already lives in `contract/schema.mjs`.
**Fix:** Derive the marktguru subset once (e.g. export `MARKTGURU_STORES` from `filter.mjs`/`merge.mjs` and import it in `index.mjs`, or compute it from `SLUG_TO_STORE` values), so there is a single source of truth.

### IN-02: Offers are classified twice per store

**File:** `scraper/index.mjs:113-116` and `scraper/select.mjs:58-61`
**Issue:** The build loop filters `classify(o) !== "reject"` and then `selectForStore` calls `classify(o)` again on the survivors. Redundant work; also two call sites that must stay semantically aligned. Not a bug (classify is pure/deterministic), just duplication.
**Fix:** Drop the pre-filter in `index.mjs` and let `selectForStore` own classification entirely (it already partitions accept/review/reject), or have the filter pass the verdict forward.

### IN-03: `appendLines` is not crash-atomic (acceptable but undocumented)

**File:** `scraper/io.mjs:82-85`
**Issue:** Unlike the snapshot writes, history append is a plain `appendFile`. A crash mid-append could leave a partial final line. This is self-healing — `readHistoryKeys` (`index.mjs:62-69`) `JSON.parse`s each line in try/catch and skips unparseable ones — so a torn line is silently ignored on the next read, never aborting the run. Worth an explicit note since the atomic-write module otherwise implies all writes are atomic.
**Fix:** Add a one-line comment in `appendLines` stating that partial-line tolerance is provided by the parse-and-skip read path, so the asymmetry with `writeAtomic` is intentional and documented.

### IN-04: `writeAtomic` leaves an orphan `.tmp` file if `rename` fails

**File:** `scraper/io.mjs:67-71`
**Issue:** If `writeFile` succeeds but `rename` throws (e.g. permission/EXDEV), the `${target}.<hex>.tmp` file is left behind. Harmless to data integrity (the target is untouched) but accumulates clutter in `data/` across failed runs, and the random suffix means each failure leaves a new file.
**Fix:** Wrap the `rename` in try/catch that best-effort `unlink`s the temp on failure before rethrowing.

### IN-05: `package.json` ships empty `author` and a default `ISC` license for a single-user personal project

**File:** `package.json:18-20`
**Issue:** `"keywords": []`, `"author": ""`, and `"license": "ISC"` are scaffold defaults. Not a functional problem for a never-published personal app, but the empty author and a permissive default license are inconsistent with a private hobby project and with the marktguru ToS note ("do not redistribute the data as a service").
**Fix:** Set `"private": true` to prevent accidental publish, and either fill in the author or set `"license": "UNLICENSED"`. Minor.

---

_Reviewed: 2026-06-15_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
