# Phase 5: Wasgau leaflet source - Context

**Gathered:** 2026-10-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a second, fully independent data source for **Wasgau only**: read the weekly 1kcloud ePaper text layer (`epaper/coords/page_N.xml`, linked from the wasgau.de homepage `var wasgau = {"angebotslink": ...}`), rebuild product/price/date textboxes, pair prices by geometry, run the existing matcher, and emit a normal Wasgau entry (`offer` / `no_offer` / `error`) instead of the fixed `unavailable`. No OCR. marktguru stays the source for REWE/Edeka/Lidl/Kaufland. The PWA gains a Wasgau chart line. Nothing beyond that (no new stores, no notifications).

</domain>

<decisions>
## Implementation Decisions

### Status semantics & fault isolation
- **D-01:** **Wasgau source failure → `error` + carry-forward**, exactly like the marktguru stores (Phase 2 D-02/D-04): last-known Wasgau entry copied verbatim into `current-offers.json`, Wasgau's per-store `lastUpdated` in `status.json` frozen → PWA shows stale. Covers: angebotslink missing on wasgau.de, 1kcloud shape change, XML fetch/parse failure. Cold start + failure → `error` in status, `no_offer` in current-offers (Phase 2 D-06 path). **This supersedes roadmap SC3's "degrades to `unavailable`" wording** — SC3's intent (Wasgau failure never affects others) is kept.
- **D-02:** **Leaflet parsed successfully, no Cola case → `no_offer`**, and Wasgau's per-store `lastUpdated` bumps (the check succeeded).
- **D-03:** **Fully independent sources.** Separate try/catch paths: a marktguru total failure sweeps only REWE/Edeka/Lidl/Kaufland; a Wasgau failure touches only Wasgau. Replaces Phase 2 D-03 ("Wasgau always unavailable") and the `merge.mjs` hard-coded Wasgau branch.
- **D-04:** **Kill switch.** A config flag forces Wasgau back to the old fixed `unavailable` behaviour (no leaflet fetch at all; PWA shows "nicht automatisch verfügbar", chart legend reverts to greyed). For abandoning the source later without a code change. `unavailable` stays in the frozen status enum — no schema change.

### Fetch volume & caching
- **D-05:** **Skip re-download when the leaflet id is unchanged.** Every run does the cheap wasgau.de homepage request to read the current 1kcloud id; the ~10 MB page-XML download happens only when the id differs from the last successfully parsed one (≈ once per week instead of ≈ 14×).
- **D-06:** **Cache extracted candidates, not the final entry.** On an unchanged id, reuse the cached reconstructed candidates (product text + paired price(s) + dates + page/bbox) and **re-run matcher + active/upcoming selection against `now` every run** — so matcher changes and expiry (validTo passed → `no_offer`) take effect without a re-download. An unchanged-id run counts as a successful check (Wasgau `lastUpdated` bumps).
- **D-07:** **Current leaflet only.** Use whatever wasgau.de links as `angebotslink`; no hunting for a preview/next-week leaflet. If the link already points at next week, the future `validFrom` surfaces as "upcoming" via existing PWA logic.
- **D-08:** **Validity dates:** leaflet-wide window from page 1 (e.g. `GÜLTIG VOM 12. BIS 17. OKTOBER 2026`) by default; an offer's own window (e.g. `Donnerstag 15.10. bis Samstag 17.10.`) overrides it when present. Stored as `YYYY-MM-DD` Berlin like everything else.
- **D-09:** Good-citizen fetching carried over: native `fetch`, descriptive User-Agent, strictly sequential page requests, retries/timeouts per Phase 2 D-11, no parallelism.

### Candidate capture & review (no positive Wasgau match has ever been observed)
- **D-10:** **Candidate = any reconstructed textbox mentioning Coca-Cola / Coke** (incl. Zero, mixed-brand bundles, cans, glass, 2 L PET) — captured with page number, bbox, reconstructed text, paired price(s), dates, and the `classify()` verdict. Deliberately wide so near-misses are visible.
- **D-11:** **Candidates are committed as JSON in `data/`** (e.g. `data/wasgau-candidates.json`). The same file holds the last-parsed leaflet id → it **is** the D-05/D-06 cache. A few KB, reviewable week by week in git history on GitHub. Not read by the PWA.
- **D-12:** **Probation mode:** a flag (default ON) forces every Wasgau *accept* to be emitted as `needsReview:true` (amber "bitte prüfen" card, never hero, never history) until the maintainer has eyeballed a real positive and flips the flag off. — **Reversibility:** reversible — single flag.
- **D-13:** **After probation, ambiguous pairing → `needsReview`** (best-guess price shown): e.g. two plausible price boxes next to the product, or the product text's own `1-l-Preis X` cross-check disagrees with the paired price. Only clean, unambiguous pairings become a normal offer. Matches the marktguru review path (Phase 2 D-08, post-04 review card).
- **D-14:** **Matcher reused as-is** (`contract/matcher.mjs` `classify()` on the reconstructed textbox text, broadened post-04 scope: any ≥12×1L PET case including Coca-Cola). Price → integer cents, €/litre over actual bottle count via `caseCount()`, Pfand excluded — same normalization as marktguru offers.
- **D-15:** **Fixtures = trimmed real page XML**: keep only the textboxes around each Cola mention (product box + nearby price/date boxes) plus the page-1 date header, from the real 2026-10-12 leaflet. Must include the known negatives (6×1L glass, 0.33 can, 2 L PET). A positive fixture may be synthesized-from-real (Phase 1 precedent) until a real one is captured.

### PWA presentation
- **D-16:** **Wasgau gets a 5th chart line**: add to `STORES_WITH_LINES` with its own colour/marker; drop the greyed "nicht automatisch verfügbar" legend item (except when the kill switch D-04 is on). The line stays empty until a clean (non-review) Wasgau offer lands in history.
- **D-17:** **Card label stays plain "Wasgau"** (`displayName` unchanged).
- **D-18:** **Reference branch = Wasgau Dudenhofen** wherever a branch must be chosen (store-specific leaflet variant, market selector/cookie on wasgau.de, regional offer differences). There is no Wasgau in Schifferstadt; Dudenhofen is the default "if in doubt".

### Claude's Discretion
- Module layout (e.g. `scraper/wasgau/` with homepage-link / page-fetch / textbox-reconstruct / price-pair / date-parse units), how the kill-switch and probation flags are stored (constants vs. a small config file), exact candidate JSON shape, geometric pairing heuristics, and whether to stop paging early once all relevant data is found are left to research/planning — provided each unit is offline-testable against fixtures.
- How `merge.mjs` / `index.mjs` are reshaped to run two independent sources and still validate-before-write against the frozen contract.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & source findings
- `.planning/ROADMAP.md` §"Phase 5: Wasgau leaflet source" — goal, live-probed 1kcloud findings (angebotslink, coords XML structure, price/date layout), success criteria (SC3 status wording superseded by D-01)
- `.planning/STATE.md` §Decisions "Post-04" — broadened matcher scope, needsReview card, NetworkFirst caching

### Prior decisions this phase builds on / amends
- `.planning/phases/02-core-scraper/02-CONTEXT.md` — D-02 fault isolation, D-03 (Wasgau always unavailable — **replaced** by D-01..D-04 here), D-04/D-05/D-06 carry-forward & timestamps, D-08 needsReview, D-10 history dedup, D-11 retry policy
- `.planning/phases/04-live-integration-all-stores-hardening/04-CONTEXT.md` — single pipeline workflow, data_changed-gated deploy, heartbeat invariant (D-05)
- `.planning/phases/01-data-contract-source-spike/` — frozen contract + matcher plans/findings
- `spike/findings.md` — marktguru spike (Wasgau absent there)

### Contract & code
- `contract/schema.mjs` — frozen zod contract (status enum incl. `unavailable`, `.strict()` StoreOffer, `needsReview`)
- `contract/matcher.mjs` — `classify()` / `caseCount()` reused on leaflet text

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `contract/matcher.mjs` `classify()` + `caseCount()`: apply to reconstructed textbox text.
- `scraper/fetch.mjs` `withRetry` (fresh `AbortSignal.timeout` per attempt): reuse for homepage + page-XML requests.
- `scraper/normalize.mjs`, `scraper/select.mjs` (active-first / upcoming / lowest price), `scraper/dedup.mjs`: reuse after Wasgau candidates are shaped like offers.
- `scraper/io.mjs` `writeAtomic` / `readPrior`: for the candidates/cache file.
- `scraper/clock.mjs` injectable `now`; `scripts/diagnose.mjs` + `.github/workflows/diagnose.yml` pattern for a live runner-side probe.

### Established Patterns
- All seams injectable; whole pipeline runs offline in `test/scraper.run.test.mjs` — the Wasgau fetch seam must be injectable the same way.
- Validate-before-write against the frozen schema; errors log `err.message` only.
- Render layer is textContent-only.

### Integration Points
- `scraper/merge.mjs` lines ~23–97: hard-coded Wasgau `unavailable` branch → replace with real Wasgau result + carry-forward.
- `scraper/index.mjs` `MARKTGURU_STORES` + `writeErrorStatus` (Wasgau fixed `unavailable` there too).
- `scraper/filter.mjs`: Wasgau intentionally absent from the slug map — stays absent (marktguru has no Wasgau).
- `web/src/chart/history.js` `STORES_WITH_LINES`, Wasgau legend/palette code (~lines 30, 129–216) and its tests.
- `.github/workflows/pipeline.yml`: `data_changed` diff + data copy step must account for the new `data/wasgau-candidates.json` (commit it; PWA doesn't need it copied).

</code_context>

<specifics>
## Specific Ideas

- User explicitly unsure what a positive Wasgau match will look like → emphasis on capture (D-10/D-11) and probation (D-12) over trusting the parser early.
- "Use Dudenhofen if in doubt" — reference branch (D-18).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 05-wasgau-leaflet-source*
*Context gathered: 2026-10-12*
