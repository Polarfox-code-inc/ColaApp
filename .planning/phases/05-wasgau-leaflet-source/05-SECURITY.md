---
phase: "05"
slug: "wasgau-leaflet-source"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-12"
---

# Phase 05 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| www.wasgau.de homepage -> leaflet.mjs | Untrusted third-party HTML carrying the leaflet link (and a third-party Mapbox token) | Public HTML; token must never be persisted or logged |
| wasgau-dlog.1kcloud.com index/coords XML -> leaflet/pair/dates | Untrusted third-party text, prices, geometry | Public leaflet text |
| GitHub runner -> wasgau.de / 1kcloud | Outbound HTTPS; responses may redirect | Requests to allow-listed hosts only |
| Wasgau source -> marktguru stores (shared run) | One run assembles both sources | Fault isolation; per-store status |
| data/wasgau-candidates.json (repo) -> scraper | Committed cache re-read every run | Schema-validated candidates doc |
| scraper -> data/current-offers.json / price-history.jsonl -> PWA | Schema-validated JSON fetched by the browser | Fixed-enum store names, numeric prices |
| diagnose workflow logs | Public Actions logs of a public repo | Public leaflet text only |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-05-01 | Tampering / Elevation (SSRF-like) | leaflet.mjs parseLeafletLink, coordsUrl | high | mitigate | `JSON.parse` (never eval) at leaflet.mjs:89; `ALLOWED_LINK_RE` leaflet.mjs:46; foreign-host/suffix-trick rejects in test/scraper.wasgau.leaflet.test.mjs:127-128 | closed |
| T-05-02 | Denial of Service (ReDoS) | leaflet/pair/dates regexes | medium | mitigate | Bounded quantifiers only; no nested quantifiers found in leaflet/pair/dates.mjs | closed |
| T-05-03 | Tampering (bogus price as deal) | candidates.mjs evaluateCandidates | medium | mitigate | Probation forces needsReview (candidates.mjs:202-203); `probation: true` default (config.mjs:25); `.strict()` schema (candidates.mjs:45,56) | closed |
| T-05-04 | Information Disclosure | index.mjs Wasgau catch, wasgau modules | medium | mitigate | No `console.*` in scraper/wasgau/; index.mjs:182 logs `err.message` only | closed |
| T-05-05 | Denial of Service (one source blanks others) | index.mjs run(), merge.mjs | high | mitigate | Own try/catch setting only `statusOverrides.Wasgau` (index.mjs:167-183); merge per-store (test/scraper.merge.test.mjs:253) | closed |
| T-05-06 | Tampering (XSS via leaflet text) | current-offers.json -> PWA | low | accept | See Accepted Risks AR-05-01 | closed |
| T-05-07 | Tampering (XSS via legend labels) | web/src/chart/history.js | low | mitigate | createElement/textContent only, no innerHTML (history.js:212-266) | closed |
| T-05-08 | Tampering (poisoned cache) | candidates.mjs parseCandidatesDoc | medium | mitigate | zod `.strict()` on read; invalid -> null/cache miss (test/scraper.wasgau.candidates.test.mjs:190-191) | closed |
| T-05-09 | Integrity (partial-failure cache poisoning) | build.mjs fetchCandidates, index.mjs write phase | medium | mitigate | Doc written only in run()'s write phase after all pages parse; page-failure test in Plan 05-04 SUMMARY | closed |
| T-05-10 | Integrity (wrong price as clean deal) | candidates.mjs evaluateCandidates | medium | mitigate | Ambiguous/mismatch -> needsReview (candidates.mjs:200, D-13); probation ON | closed |
| T-05-11 | Denial of Service (ReDoS) | dates.mjs window regexes | low | mitigate | Bounded quantifiers only; no nested quantifiers | closed |
| T-05-12 | Tampering / Elevation (SSRF via redirect) | source.mjs createFetchText | high | mitigate | https + exact-Set `ALLOWED_HOSTS` (source.mjs:45,59); `res.url` re-check (source.mjs:91-93); evil-host run test (test/scraper.run.test.mjs:483) | closed |
| T-05-13 | Denial of Service (oversized body, hung host) | source.mjs, leaflet.mjs | medium | mitigate | 60 s shared deadline (source.mjs:42,82), per-attempt timeout, `MAX_BODY_CHARS` 5,000,000 (source.mjs:48,100), `MAX_COLA_PAGES` 8 (leaflet.mjs:149,164) | closed |
| T-05-14 | Denial of Service on third party | source.mjs, build.mjs | low | mitigate | Sequential awaits, shared User-Agent, Cola-pages-only downloads (source.mjs:33) | closed |
| T-05-15 | Information Disclosure (bodies in errors) | source.mjs errors, index.mjs catch | medium | mitigate | Error texts carry status + host only (source.mjs:93); only `err.message` logged | closed |
| T-05-16 | Information Disclosure (public diagnose logs) | .github/workflows/diagnose.yml | low | accept | See Accepted Risks AR-05-02 | closed |
| T-05-17 | Denial of Service (Wasgau failure blanks others) | index.mjs, merge.mjs | high | mitigate | Run-level isolation tests both directions (test/scraper.run.test.mjs:497, 515) | closed |
| T-05-18 | Tampering / Elevation (SSRF via wiring) | build.mjs fetchCandidates, source.mjs | high | mitigate | Only HOMEPAGE_URL, validated-id URL and `coordsUrl(id, page)` fetched; foreign link throws before second request (test/scraper.run.test.mjs:483) | closed |
| T-05-SC | Tampering (supply chain) | npm installs | high | mitigate | No package.json / lockfile changes across the phase | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-05-01 | T-05-06 | StoreOffer is `.strict()` with no free-text field; wasgau-candidates.json is not copied to Pages (pipeline.yml:134 copies 3 files); PWA renders textContent-only | Plan 05-03 (plan-time acceptance) | 2026-10-12 |
| AR-05-02 | T-05-16 | diagnose prints only public leaflet text + two public data docs; homepage HTML never printed; `permissions: contents: read` (diagnose.yml:17-18) | Plan 05-05 (plan-time acceptance) | 2026-10-12 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-12 | 19 | 19 | 0 | /gsd-secure-phase (ASVS L1 grep-depth, plan-time register) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-12
