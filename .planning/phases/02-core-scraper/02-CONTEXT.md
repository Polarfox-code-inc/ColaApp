# Phase 2: Core Scraper - Context

**Gathered:** 2026-06-15
**Status:** Ready for planning

<domain>
## Phase Boundary

A runnable, scheduled-ready Node 22 ETL that produces the three frozen data files from real marktguru data: it calls the marktguru `/offers/search` endpoint once, filters to the 5 target advertisers, strict-matches the 12×1L Coca-Cola case (reusing the Phase 1 `contract/matcher.mjs`), normalizes each surviving offer to the frozen schema, picks one entry per store, appends a deduplicated price history, and records per-store fetch status with honest timestamps — all with per-store fault isolation so one store (or a total fetch failure) never aborts the run or destroys last-known data.

**In scope:** DATA-01, DATA-03, DATA-04, DATA-05, DATA-06 — fetch + normalize + dedup-append + fault isolation + status/timestamps, writing `data/current-offers.json`, `data/price-history.jsonl`, `data/status.json` against the Phase 1 contract.

**Out of scope (later phases):** GitHub Actions cron wiring, GitHub Pages, keepalive heartbeat (Phase 4); the PWA and all rendering/derivation of `upcoming`/`stale` (Phase 3); per-store direct fallback adapters (v2 DATA-07); OCR for Wasgau (permanently out — Wasgau stays `unavailable`). The data contract itself is **frozen** by Phase 1 and is not re-opened here.

</domain>

<decisions>
## Implementation Decisions

### Fetch Model & Fault Isolation (DATA-01, DATA-05)
- **D-01:** **Single marktguru call per run.** One `GET /offers/search?as=web&q=coca%20cola&zipCode=67105&limit=200&offset=0` returns all advertisers (proven by the Phase 1 spike); the scraper filters client-side to the 5-slug allow-list `{rewe, edeka, lidl, kaufland, wasgau}`. Rejects per-store queries (5× request volume against an unofficial API violates the good-citizen ToS guidance for no benefit, since one call already returns all five).
- **D-02:** **Fault isolation has three layers:** (a) a store **absent** from the (successful) results = `no_offer` — normal weekly outcome, e.g. Lidl this week; (b) a **per-store parse/normalize error** is caught in isolation — that one store goes `error`, the others are written normally; (c) a **total call failure** (homepage-key fetch or offers/search fails after retries) sends every normally-fetchable store to `error` while **last-known data is preserved** (see D-04). The run **always completes and writes all three files** — it never aborts.
- **D-03:** **Wasgau is always `unavailable`** (not structurally returned by marktguru at 67105; no OCR — permanent designed outcome). It is never `error` and never `no_offer`; the total-failure path in D-02 does not change Wasgau.

### Last-Known Preservation & Timestamps (DATA-05, DATA-06)
- **D-04:** **Preserve-last-known on error = carry forward + freeze timestamp.** On a run where a normally-fetchable store can't be refreshed: in `current-offers.json`, **copy the store's previous entry verbatim** (status stays `offer` with its prior price/dates — keeping the contract valid, since `status:"offer"` requires the offer fields). In `status.json`, set that store's `status` to `error` and **do NOT bump its per-store `lastUpdated`** (leave the old value). The PWA cross-references the aged per-store timestamp to derive `stale` and can still show the last-known price with a stale warning. This requires the scraper to **read the prior `data/current-offers.json` and `data/status.json` at the start of each run.**
- **D-05:** **Two timestamp meanings.** File-level `lastUpdated` (top of `current-offers.json` and `status.json`) = wall-clock time the run executed — **always bumps** (proves the job is alive). Per-store `lastUpdated` (in `status.json` `stores[]`) = the last time **that store was successfully refreshed** — bumps **only on a successful fetch+parse**, frozen on `error`/`unavailable`. This is what makes per-store staleness honest: a store stuck erroring goes stale even while the overall run keeps succeeding.
- **D-06:** **Cold start** (no prior `data/*` files AND the fetch fails): there is nothing to carry forward, so affected stores get `status:"error"` in `status.json` and a minimal `no_offer`-equivalent / null-priced representation that still satisfies the contract's "5 stores each appear exactly once" rule. (Planner: confirm the exact serialization against the schema — a cold-start errored store cannot be `status:"offer"` without price fields, so it is written as `error` in status.json and `no_offer` in current-offers.json until real data exists.)

### Per-Store Offer Selection (DATA-01, DATA-03, ties to Phase 1 D-08)
- **D-07:** **One entry per store, chosen active-first.** When a store has multiple accepted 12×1L offers: prefer an offer whose date range is **active now** (Europe/Berlin); if none is active but an **upcoming** one exists, use the upcoming offer (the PWA renders it as `upcoming` via derived logic — OFFR-05). Within the same tier, **tie-break on lowest price.** Rationale: show the brother the deal he can act on today; surface next week's only when there's nothing now.
- **D-08:** **`needsReview` fallback (Phase 1 D-08 quarantine).** If a store has **no clean-accepted** 12×1L offer but the matcher returns a `review` candidate, emit it as a `status:"offer"` entry with `needsReview:true` plus its price/dates. The PWA filters `needsReview` entries out of the brother-facing view (Phase 1 D-13), so he never sees it — but the maintainer can eyeball it to tighten the matcher. A `review` candidate never overrides a clean accept.
- **D-09:** **Normalization reuses the frozen contract.** Price via `Math.round(price * 100)` → integer cents (Phase 1 D-09); Pfand excluded and not stored (D-10); `pricePerLitre` computed as cents ÷ 12 (D-11); `validFrom`/`validTo` trimmed to `YYYY-MM-DD` **in Europe/Berlin** using the active-range selection rule (Phase 1 D-13 / findings §4 — never trim in UTC). All values are validated through `contract/schema.mjs` before write; a drifted payload throws rather than corrupting data.

### Price-History Dedup (DATA-04)
- **D-10:** **Append clean accepts only, dedup on the frozen key.** Each run appends a `price-history.jsonl` line for every `status:"offer"` entry that is **not** `needsReview` — **including upcoming offers** (a future `validFrom` is a real price point worth graphing). Dedup key is the frozen **`store + price + validFrom`** (Phase 1 D-14): before appending, load existing lines and skip any whose key already exists, so re-runs of the same offer never duplicate. `needsReview` candidates are excluded so unverified prices never pollute the history graph. `date` (observation date) comes from the injectable run clock.

### Resilience & Good-Citizen Behavior (DATA-01, DATA-05, ToS)
- **D-11:** **Retry policy: up to 2 retries, exponential backoff (~1s, ~3s), ~10s per-request timeout** — applies to both the homepage-key fetch and the offers/search call. Max 3 attempts per run at 1–4 runs/day stays polite while riding out transient blips. On final failure → D-02(c) total-failure path (error + preserve last-known).
- **D-12:** **Re-fetch homepage bootstrap keys every run** (no cross-run caching). Stateless, always-valid keys, nothing secret-ish persisted; the ~6h cache CLAUDE.md mentions is for high-frequency callers, not a few runs/day. Keys are **never logged and never written to disk** (Phase 1 spike security rule — only presence is reported). Native `fetch` only, descriptive `User-Agent`, no parallelism (carry over the `spike/probe.mjs` good-citizen pattern).

### Claude's Discretion
- **Scraper layout / entrypoint:** a `scraper/` module with a runnable entry (e.g. `scraper/index.mjs`) wired to an `npm run scrape` script. Internal module decomposition (fetch / filter / select / normalize / dedup / write) is the planner's/executor's call, as long as each is unit-testable.
- **Injectable clock:** "now" (for active-range selection, `date`, and `lastUpdated`) should be injectable so tests are deterministic against the Phase 1 fixtures; exact mechanism is open.
- **Testing approach:** reuse the captured `spike/fixtures/raw-67105-search.json` as the negative/quarantine corpus and the `synthesized-from-real` positive fixture from Plan 03 to drive offline, network-free tests of fetch-parsing, selection, normalization, dedup, and the fault-isolation paths. JSON key naming inside files already fixed by the contract.
- **Atomic writes / file handling:** whether/how to write files atomically (temp + rename) to avoid a half-written file on crash is left to implementation, provided a failed run never leaves a corrupt data file.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The frozen contract (the hard constraint — read first)
- `contract/schema.mjs` — the zod schemas the scraper output MUST validate against: `CurrentOffersSchema`, `HistoryLineSchema`, `StatusFileSchema`, the `STORES` allow-list, `STATUS_VALUES`, and the `parse*` helpers that throw on drift. `.strict()` everywhere + the `status:"offer"` superRefine constrain D-04/D-06 serialization.
- `contract/matcher.mjs` — the strict 12×1L classifier (`classify(offer) → accept | reject | review`) the scraper calls per candidate offer. Drives D-07/D-08.
- `test/schema.test.mjs`, `test/matcher.test.mjs` — existing test patterns to mirror for the scraper's tests.

### Live data source facts (what the scraper parses)
- `spike/findings.md` — authoritative live answers: wrapper key is **`results`** (§1); the 5-target slug verdict table and out-of-scope slugs (§2); Wasgau **absent → `unavailable`** (§3); `validityDates` is an array of `{from,to}` ISO-UTC, day-granular Berlin, with the **active-range selection rule** (§4); `price` is decimal euro → `Math.round(price*100)` (§5); zero real positive cases this week so live runs will mostly be `no_offer` (§6).
- `spike/probe.mjs` — the working fetch pattern to build on: `getKeys()` (parse homepage `<script type="application/json">` islands for `config.apiKey`/`config.clientKey`), the offers/search call with `x-apikey`/`x-clientkey`/`user-agent`, the defensive `results ?? data ?? <first array>` wrapper resolution, and the good-citizen/security comments.
- `spike/fixtures/raw-67105-search.json` — captured real payload; the negative/quarantine test corpus (field-name source of truth).

### Requirements, scope & prior decisions
- `.planning/REQUIREMENTS.md` — DATA-01, DATA-03, DATA-04, DATA-05, DATA-06 (this phase's mapped requirements) and the Out-of-Scope table.
- `.planning/ROADMAP.md` — Phase 2 goal + 5 success criteria (the acceptance bar).
- `.planning/phases/01-data-contract-source-spike/01-CONTEXT.md` — the full D-01..D-14 contract rationale this phase implements against (esp. D-08 quarantine, D-12 state model, D-13 dates, D-14 history shape + dedup key).
- `CLAUDE.md` — "marktguru API — integration notes" (endpoint/headers/cadence/ToS), "Data File Format", "What NOT to Use" (native fetch only — no axios/node-fetch; JSONL not rewritten arrays; no OCR), and "Stack Patterns by Variant".

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `contract/schema.mjs` — import directly; validate every file before write (single source of truth, shared with Phase 3).
- `contract/matcher.mjs` — import directly; the scraper's per-offer accept/reject/review gate. No re-implementation.
- `spike/probe.mjs` — not imported, but its `getKeys()` + fetch + wrapper-resolution logic is the template the production fetch module is refactored from (add retry/backoff/timeout per D-11).
- `data/*.json(l)` + `mocks/*.json` — existing hand-authored examples of every target output shape; useful as expected-output references in tests.

### Established Patterns
- ESM, Node ≥22, native `fetch`, top-level await, zero runtime deps except `zod` (see `package.json`); tests via `node --test` (`npm test`). The scraper must stay within this toolchain.
- Phase 1 used per-plan TDD with `node:test`; mirror that for the scraper's selection/normalize/dedup/fault-isolation units.

### Integration Points
- The three `data/` files are the sole producer→consumer interface; this phase is the **producer**. Nothing else connects until Phase 4 wires the cron. The scraper both **reads** the prior `data/` files (for D-04 carry-forward) and **writes** the new ones.

</code_context>

<specifics>
## Specific Ideas

- "Show the deal he can act on today" drove D-07 (active-first selection) — the app's whole point is the buyable case, with upcoming as a look-ahead, not a substitute.
- Honest staleness is a first-class goal (D-04/D-05): the brother should never be shown a fresh-looking price that is actually weeks stale, and the maintainer should never be silently left with a dead store — the frozen vs run timestamps encode exactly that.
- The maintainer wants to keep eyeballing near-miss titles (D-08 `needsReview`) to tighten the matcher over time, rather than silently dropping ambiguous Coca-Cola entries.

</specifics>

<deferred>
## Deferred Ideas

- **GitHub Actions cron + concurrency guard + keepalive heartbeat** — Phase 4 (INFR-01/INFR-03). The scraper is built runnable here but not scheduled.
- **GitHub Pages serving + end-to-end loop verification** — Phase 4 (INFR-02/INFR-03).
- **Dead-man's-switch / external failure alerting** (e.g. healthchecks.io) — Phase 4 hardening.
- **Per-store direct fallback adapter** (e.g. Aldi Süd / REWE direct) for a store dropped by marktguru — v2 (DATA-07).
- **PWA-side staleness threshold value and all `upcoming`/`stale` derivation** — Phase 3 (the scraper only states facts + timestamps; the PWA derives time-relative views).

None of these are scope creep into Phase 2 — they are correctly downstream.

</deferred>

---

*Phase: 2-Core Scraper*
*Context gathered: 2026-06-15*
