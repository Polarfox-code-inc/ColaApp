# Phase 2: Core Scraper - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-15
**Phase:** 2-core-scraper
**Areas discussed:** Fault-isolation model, Last-known preservation, Per-store offer selection, Politeness & retries

---

## Fault-isolation model

| Option | Description | Selected |
|--------|-------------|----------|
| One call + classify | Single marktguru call → filter to 5 slugs; absent store = no_offer; per-store parse error isolated; total-call failure → fetchable stores error + preserve last-known. Matches good-citizen ToS. | ✓ |
| Per-store calls | Five separate queries, each independently retried/isolated. True per-store isolation but 5× request volume against an unofficial API for little gain. | |

**User's choice:** One call + classify
**Notes:** Fault isolation realized as three layers (absent=no_offer / per-store parse error / total-failure preserve-last-known); run always completes and writes all three files. Wasgau stays `unavailable` regardless.

---

## Last-known preservation (serialization)

| Option | Description | Selected |
|--------|-------------|----------|
| Carry offer, freeze ts | Copy prior current-offers entry verbatim (status stays offer w/ old price); in status.json set store=error and DON'T bump its per-store lastUpdated; PWA derives stale. | ✓ |
| Set error, drop price | Mark store error with null price; loses last-known price on any blip. | |
| Carry offer, status=error | Carry old price but set current-offers status=error; conflicts with the frozen contract (offer requires price; error implies none). | |

**User's choice:** Carry offer, freeze timestamp
**Notes:** Requires the scraper to read prior data/current-offers.json + data/status.json at run start.

## Timestamp semantics (DATA-06)

| Option | Description | Selected |
|--------|-------------|----------|
| Run-time vs success-time | File-level lastUpdated = run wall-clock (always bumps, liveness); per-store lastUpdated = last successful refresh (frozen on error/unavailable). | ✓ |
| Both = run time | Both bump every run; a long-dead store looks "fresh", defeating honest staleness. | |

**User's choice:** Run-time vs success-time

---

## Per-store offer selection

| Option | Description | Selected |
|--------|-------------|----------|
| Active first, then upcoming | Prefer active-now offer; else upcoming; tie-break lowest price. Shows the buyable deal, surfaces next week's when nothing now. | ✓ |
| Lowest price overall | Lowest accepted price regardless of active/future; could show upcoming as if current. | |
| Soonest-ending active | Prefer active offer ending soonest; more complex for little benefit. | |

**User's choice:** Active first, then upcoming (lowest-price tie-break)

## needsReview fallback (D-08)

| Option | Description | Selected |
|--------|-------------|----------|
| Surface w/ needsReview:true | Emit review candidate as offer + needsReview:true; PWA hides it, maintainer eyeballs it. The D-08 quarantine design. | ✓ |
| Treat as no_offer | Ignore review candidates; store shows kein Angebot; throws away the quarantine signal. | |

**User's choice:** Surface with needsReview:true

## Price-history append policy

| Option | Description | Selected |
|--------|-------------|----------|
| Clean accepts only (incl. upcoming) | Append every non-needsReview offer (incl. upcoming); dedup on store+price+validFrom. | ✓ |
| Active accepts only | Only append currently-active offers; loses early upcoming data point. | |

**User's choice:** Clean accepts only, including upcoming

---

## Politeness & retries

| Option | Description | Selected |
|--------|-------------|----------|
| 2 retries, backoff, ~10s timeout | Up to 2 retries (exp backoff ~1s/~3s), ~10s timeout; final failure → error + preserve last-known. Polite + rides out blips. | ✓ |
| No retries | One attempt; any failure → error; recover next run. Simplest but ages data on one hiccup. | |
| Aggressive (5+ retries) | Many retries; pushes volume against an unofficial API against ToS guidance. | |

**User's choice:** 2 retries, backoff, ~10s timeout

## Key caching

| Option | Description | Selected |
|--------|-------------|----------|
| Re-fetch every run | Fetch homepage keys each run (1 extra request); stateless, always-valid, nothing persisted. | ✓ |
| Cache to disk ~6h | Persist keys, reuse within ~6h; adds state/expiry/CI file mgmt for negligible benefit at this cadence. | |

**User's choice:** Re-fetch homepage keys every run

---

## Claude's Discretion

- Scraper layout / entrypoint (`scraper/index.mjs` + `npm run scrape`) and internal module decomposition.
- Injectable clock mechanism for deterministic tests.
- Testing approach reusing `spike/fixtures/raw-67105-search.json` (negatives) + the synthesized positive fixture.
- Atomic file writes (temp + rename) to avoid half-written data files on crash.
- Cold-start serialization detail (no prior data + fetch fails) against the contract.

## Deferred Ideas

- GitHub Actions cron + concurrency guard + keepalive heartbeat → Phase 4.
- GitHub Pages serving + end-to-end loop verification → Phase 4.
- Dead-man's-switch / external failure alerting → Phase 4.
- Per-store direct fallback adapter (Aldi Süd / REWE direct) → v2 (DATA-07).
- PWA-side staleness threshold + all upcoming/stale derivation → Phase 3.
