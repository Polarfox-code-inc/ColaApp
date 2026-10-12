---
phase: 05-wasgau-leaflet-source
reviewed: 2026-10-12T18:34:36Z
depth: standard
files_reviewed: 22
files_reviewed_list:
  - .github/workflows/diagnose.yml
  - scraper/fetch.mjs
  - scraper/filter.mjs
  - scraper/index.mjs
  - scraper/merge.mjs
  - scraper/wasgau/build.mjs
  - scraper/wasgau/candidates.mjs
  - scraper/wasgau/config.mjs
  - scraper/wasgau/dates.mjs
  - scraper/wasgau/leaflet.mjs
  - scraper/wasgau/pair.mjs
  - scraper/wasgau/source.mjs
  - test/scraper.merge.test.mjs
  - test/scraper.run.test.mjs
  - test/scraper.wasgau.candidates.test.mjs
  - test/scraper.wasgau.dates.test.mjs
  - test/scraper.wasgau.leaflet.test.mjs
  - test/scraper.wasgau.pair.test.mjs
  - test/scraper.wasgau.source.test.mjs
  - web/src/chart/history.js
  - web/src/main.js
  - web/test/chart.test.mjs
findings:
  critical: 0
  warning: 7
  info: 4
  total: 11
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-10-12T18:34:36Z
**Depth:** standard
**Files Reviewed:** 22
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

I reviewed the Phase 5 change set since `7da6c0d`: the new Wasgau leaflet source (`scraper/wasgau/*`), how it plugs into the orchestrator and merge, the chart and main changes for the 5th line, the diagnose workflow, and the new tests. The full suite passes (278/278). Fault isolation (Wasgau vs marktguru), the kill switch, and the merge carry-forward rules are correct. Parser inputs are bounded and safe from ReDoS. Every leaflet URL is rebuilt from a validated id.

I confirmed each defect below by running the real modules on crafted inputs:

- **Security controls that don't work as documented.** The redirect check runs only after native `fetch` has already followed the redirect off-host. The body-size cap only checks the length after the whole body has been read into memory.
- **Text parsing that is narrower than the leaflet prose it needs to handle.** `litresOf` disagrees with the frozen matcher on `×`, `je` and `Liter`. The date parser misses abbreviated weekdays such as `Do., 15.10.`. Neither fails loudly. Both silently demote a valid case to needsReview or give it the wrong validity dates.
- **Robustness of the leaflet cache and error path.** One unpriced Cola box turns Wasgau to "error" for the whole leaflet week. Because the cache is keyed only on the leaflet id, fixing the parser does not repair the stored doc until a new leaflet appears.

No blockers: none of these produces a wrong *clean* price while `probation: true` (the shipped default). However, WR-03, WR-04 and WR-05 decide whether the Wasgau source is ever useful once probation is switched off.

## Warnings

### WR-01: Redirect allow-list check runs after the off-host request was already sent, and refusals are retried

**File:** `scraper/wasgau/source.mjs:88-94` (claim in header lines 14-20)
**Issue:** `fetchImpl(url, { headers, signal })` uses the default `redirect: "follow"`. Native fetch (undici) therefore issues every redirect hop itself, including hops to hosts that are not on the allow-list. The `res.url` re-check runs only after the final response has arrived. It throws away the response, but the GET to the foreign host has already been made. The header comment says "a redirect cannot carry the runner off-list". That is false: the request is sent; only the body is dropped. Two further gaps:
- The refusal is thrown *inside* `withRetry`, so an off-list redirect is followed 3 times (initial attempt plus 2 retries).
- An intermediate `http:` hop on an allowed host is also followed.

The test at `test/scraper.wasgau.source.test.mjs:70-76` only fakes `res.url`, so it locks in the false assurance. Impact is limited: it is a blind GET from an ephemeral runner with no credentials, and it needs a compromised or open-redirecting wasgau.de or 1kcloud. Still, the documented T-05-12 mitigation is not in effect.
**Fix:** Refuse redirects at the transport level, and make refusals non-retryable:
```js
const res = await fetchImpl(url, { headers: { "user-agent": UA }, signal, redirect: "error" });
// or redirect: "manual" + validate res.headers.get("location") with allowedHost() before following.
```
Throw refusal errors with a marker (e.g. `err.noRetry = true`) and have `withRetry` rethrow those immediately. Also add a test asserting `init.redirect === "error"`.

### WR-02: MAX_BODY_CHARS does not protect against oversized or decompression-bomb bodies

**File:** `scraper/wasgau/source.mjs:99-102`
**Issue:** `const text = await res.text(); if (text.length > MAX_BODY_CHARS) throw ...` decodes and buffers the **entire** body before checking its length. A gzip bomb or a multi-hundred-MB response is fully inflated in memory first, which is exactly the threat T-05-13 says this line guards against. The refusal is also inside `withRetry`, so the oversized body is downloaded and inflated up to 3 times. Only the deadline actually bounds this, not the cap.
**Fix:** Reject early on `Content-Length`, then stream with a running byte counter and cancel when the limit is crossed:
```js
const len = Number(res.headers.get("content-length"));
if (len > MAX_BODY_BYTES) throw refusal("body too large");
const reader = res.body.getReader(); let total = 0; const chunks = [];
for (;;) { const { done, value } = await reader.read(); if (done) break;
  total += value.byteLength; if (total > MAX_BODY_BYTES) { await reader.cancel(); throw refusal("body too large"); }
  chunks.push(value); }
const text = new TextDecoder().decode(Buffer.concat(chunks));
```

### WR-03: `litresOf` disagrees with the frozen matcher, so valid 12x1L cases are demoted to mismatch/ambiguous

**File:** `scraper/wasgau/pair.mjs:21,23,35-42`
**Issue:** The matcher (`contract/matcher.mjs` `normalize` + `NX1L`) accepts `×` (it rewrites it to `x`), an optional `je` after the `x`, and `Liter`. `MULTI_LITRES_RE` handles none of these, and `SINGLE_LITRES_RE` then picks up the trailing `1-l` as **1 litre**. Verified output:
- `"Coca-Cola je 12 × 1-l-PET-Fl., 1-l-Preis 0.75"`: accept, litres=1, pairing `mismatch`
- `"Coca-Cola 12 x je 1-l-PET, 1-l-Preis 0.75"`: accept, litres=1, pairing `mismatch`
- `"Coca-Cola Kasten 12 x 1 Liter, 1-l-Preis 0.75"`: accept, litres=null, pairing `ambiguous`

So a correctly priced case accepted by the matcher can never be a `clean` pair. `evaluateCandidates` then always forces `needsReview`. Once probation is off, the offer still never reaches the hero or price-history. The `MULTI_LITRES_RE` `\d{1,2}` count is also not left-anchored (e.g. `112 x` reads as `12 x`).
**Fix:** Normalize the same way the matcher does, and accept the same token shapes:
```js
const t = String(text ?? "").toLowerCase().replace(/×/g, "x");
const MULTI_LITRES_RE = /(?:^|[^\d])(\d{1,2})\s{0,3}x\s{0,3}(?:je\s{0,3})?(\d{1,2}(?:,\d{1,3})?)\s{0,3}-?\s{0,3}l(?:iter)?\b/;
```
Make the same `l(?:iter)?` change in `SINGLE_LITRES_RE`. Add pair tests for `×`, `je` and `Liter`.

### WR-04: Common German weekday abbreviations break window parsing, which silently falls back to the wider leaflet window

**File:** `scraper/wasgau/dates.mjs:45-51`
**Issue:** The optional weekday group is `(?:[a-zäöü]{2,10}\s{0,3})?`, followed directly by the day digits. It does not allow a `.` or `,` after the weekday. Verified `parseWindow(..., { refDate: "2026-10-12" })` returns `null` for:
- `"Do., 15.10. – Sa., 17.10."`
- `"Do. 15.10. bis Sa. 17.10."`
- `"Mo. 12.10. - Sa. 17.10.2026"`
- `"Gültig von Montag, 12. bis Samstag, 17. Oktober 2026"`

`resolveWindow` then quietly uses the leaflet window (Mon-Sat), with no needsReview signal. A Thursday-Saturday weekend offer would show as **active from Monday**. With probation off, it would enter `price-history.jsonl` with the wrong `validFrom`. Wrong validity dates break the project's core value ("with the price and the dates it's valid").
**Fix:** Allow an optional period/comma after the weekday in both patterns:
```js
(?:[a-zäöü]{2,10}\.?,?\s{0,3})?
```
Apply this at both weekday positions in `WORD_MONTH_RE` and in `NUMERIC_RE`, then add dates tests for these four phrasings.

### WR-05: One unpaired Cola box turns Wasgau to "error" for the whole leaflet week and hides a valid clean offer

**File:** `scraper/wasgau/candidates.mjs:188-195`
**Issue:** `evaluateCandidates` throws on the **first** accept or review candidate with `pairing === "unpaired"`, before any validity window or other candidate is considered. Verified with a doc holding a clean, active `12 x 1-l` accept at 8.99 plus a price-less `"Coca-Cola Kasten Aktion"` banner (verdict `review`): it throws. It also throws when the unpaired box's window expired weeks ago. A brand banner or teaser box with "Kasten" wording and no price nearby is a normal leaflet element.

Because `fetchCandidates` reuses the cached doc for an unchanged leaflet id (`build.mjs:66`), the throw repeats on every run until the next leaflet. Wasgau shows "error" all week, and the card carries forward last week's offer. The fail-loud intent (P5-SC3) is reasonable for the *only* candidate, but here it masks a correct offer.
**Fix:** Collect unpaired candidates instead of throwing immediately. Only fail when no offer could be selected from the paired candidates, or when an unpaired candidate's window covers today or the future. Otherwise drop it (it stays visible in `wasgau-candidates.json` for review):
```js
const unpaired = [];
for (const c of doc?.candidates ?? []) {
  const verdict = classify({ description: c.text });
  if (verdict === "reject") continue;
  if (c.pairing === "unpaired" || c.priceCents === null) { unpaired.push(c); continue; }
  ...
}
// after selection:
if (result.status !== "offer" && unpaired.some((c) => c.validTo >= berlinDay(now.toISOString()))) throw ...;
```

### WR-06: Leaflet cache is keyed only on leafletId, so parser fixes never reach the current week's stored doc

**File:** `scraper/wasgau/build.mjs:66`, `scraper/wasgau/candidates.mjs:147-152`
**Issue:** On a cache hit, only `verdict` is recomputed. `priceCents`, `pairing`, `litres`, `validFrom`, `validTo` and `windowSource` are served from the cached JSON, which an older version of `pair.mjs`, `dates.mjs` or `leaflet.mjs` produced. If a maintainer fixes a pairing or date bug (for example WR-03 or WR-04, or the unpaired error in WR-05), the fix has no effect until 1kcloud publishes a new leaflet id. The store stays wrong or "error" for up to a week unless someone knows to delete `data/wasgau-candidates.json` by hand. Nothing in `config.mjs` (the "maintainer manual") documents this.
**Fix:** Stamp a parser version into the doc and treat a mismatch as a cache miss:
```js
export const PARSER_VERSION = 1; // bump whenever leaflet/pair/dates/candidates extraction changes
// CandidatesDocSchema: parserVersion: z.literal(PARSER_VERSION)
if (priorDoc?.leafletId === id && priorDoc.parserVersion === PARSER_VERSION) return refreshVerdicts(priorDoc);
```

### WR-07: The diagnose probe can report Wasgau reachability from a stale, committed candidates file

**File:** `.github/workflows/diagnose.yml:36-43`
**Issue:** `pipeline.yml` runs `git add data/`, so `data/wasgau-candidates.json` is committed. A `workflow_dispatch` of `diagnose` on master checks that file out. Two consequences:
1. If this run's Wasgau fetch fails, `cat data/wasgau-candidates.json` prints the **old committed doc** and the `|| echo "(not written ...)"` fallback never fires. The probe looks like a success.
2. If the leaflet id is unchanged, the scraper fetches only the homepage (cache hit). The probe never proves that the runner can reach `wasgau-dlog.1kcloud.com`, which is the point of RESEARCH A1.
**Fix:** Delete the cache before running the scraper in this read-only job:
```yaml
run: |
  rm -f data/wasgau-candidates.json
  npm run scrape
  ...
```

## Info

### IN-01: Page-1 leaflet window without a year makes the whole Wasgau source fail every run

**File:** `scraper/wasgau/dates.mjs:188-193`
**Issue:** `leafletWindowFromIndex` calls `parseWindow(first.text)` with no `refDate`. A header such as `"GÜLTIG VOM 12. BIS 17. OKTOBER"` (no year) therefore returns null, and the function throws. The index title already reads `"WASGAU Prospekt ab 12.10."` without a year. If Wasgau ever drops the year from the header, the source errors every week.
**Fix:** Pass the run date as a fallback `refDate` (thread `now` into `fetchCandidates`). Keep the year-bearing parse as the primary path.

### IN-02: Only one leaflet is held, so an early homepage switch drops the current week's active offer

**File:** `scraper/wasgau/build.mjs:59-87`
**Issue:** The candidates doc holds exactly one leaflet. If wasgau.de points `angebotslink` at next week's leaflet before the current one expires (e.g. a Saturday preview), the current week's still-valid offer vanishes. The refresh is a successful `no_offer`/upcoming, not an error, so nothing is carried forward. This is unverified against Wasgau's real switch timing. Worth noting in the config manual.
**Fix:** Document this, or keep the previous doc's still-active candidates when the leaflet id changes.

### IN-03: Clean-first ranking can hide an active needsReview offer behind an upcoming clean one

**File:** `scraper/wasgau/candidates.mjs:197-201`
**Issue:** `selectForStore(clean)` wins whenever it yields any offer, including an *upcoming* one. An *active* ambiguous or mismatch offer in `rest` is then never shown, even though marktguru stores rank active before upcoming.
**Fix:** If the clean result is upcoming and the `rest` result is active, prefer the active one with `needsReview: true`. Or document the precedence explicitly.

### IN-04: Stale "three files" wording in orchestrator docs

**File:** `scraper/index.mjs:3-4,113`
**Issue:** The header and the `run()` JSDoc still say "writes all three files". Since Phase 5, `run()` can also write `wasgau-candidates.json` (lines 237-243).
**Fix:** Update the wording to "three data files plus the Wasgau candidates doc when a leaflet was parsed".

---

_Reviewed: 2026-10-12T18:34:36Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
