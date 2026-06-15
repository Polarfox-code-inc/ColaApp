---
phase: "02"
slug: core-scraper
status: secured
threats_open: 0
threats_closed: 11
asvs_level: 1
block_on: high
created: 2026-06-15
---

# SECURITY — Phase 02 (core-scraper)

**Status:** SECURED
**ASVS Level:** 1
**block_on:** high
**Threats closed:** 11 / 11
**threats_open:** 0
**Audited:** 2026-06-15
**Register authored at plan time; mitigations verified against shipped code (read-only audit).**

This phase ships the scraper pipeline: `scraper/{clock,normalize,filter,select,dedup,fetch,io,merge,index}.mjs`
validating against the frozen `contract/{schema,matcher}.mjs`. The review's four
warning fixes (WR-01..WR-04) are in the live code and were re-verified here:
WR-02's `writeErrorStatus` path and WR-03's loosened bootstrap regex received
extra scrutiny per audit instructions.

---

## Threat Verification

| Threat ID | Category | Disposition | Verdict | Evidence |
|-----------|----------|-------------|---------|----------|
| T-02-01 | Tampering | mitigate | CLOSED | `dedup.mjs:48` `parseHistoryLine(line)` before `JSON.stringify`; emitted StoreOffers round-trip `parseCurrentOffers` at `index.mjs:169` before any write. |
| T-02-02 | DoS (ReDoS) | mitigate | CLOSED | `select.mjs:9` imports frozen `classify()`; zero regex in `select.mjs`/`filter.mjs`/`normalize.mjs` (grep clean). Contract regexes `matcher.mjs:45-62` anchored/bounded, no nested quantifiers. |
| T-02-03 | Tampering | accept | CLOSED | Accepted risk logged below. `filter.mjs:12-17` fixed `SLUG_TO_STORE` allow-list; non-matching `uniqueName` dropped at `filter.mjs:29-30`; no path trusts arbitrary advertiser. |
| T-02-04 | Info Disclosure | mitigate | CLOSED | `fetch.mjs` — keys live only in the `getKeys` return (`116-118`) and request headers (`138-139`); never logged, never stringified, no disk call in module (grep clean). |
| T-02-05 | Tampering/Availability | mitigate | CLOSED | `io.mjs:67-71` same-dir temp `${targetPath}.{hex}.tmp` + `rename` (EXDEV-safe, derived from target path). |
| T-02-06 | DoS (ReDoS) | mitigate | CLOSED | `fetch.mjs:104-108` loosened (WR-03) regex empirically linear: 500K-char adversarial inputs all sub-millisecond. Single non-greedy `.*?`, `[^>]*` attr run, no nested quantifiers. |
| T-02-07 | ToS / good-citizen | mitigate | CLOSED | `fetch.mjs` — one `searchOffers` call per run (`180`), `retries=2` → max 3 attempts (`53`), UA `colaapp-scraper/0.1` (`20`), no parallelism, keys re-fetched each run never cached (`179`). |
| T-02-08 | Tampering | mitigate | CLOSED | `index.mjs:169-170` `parseCurrentOffers`/`parseStatusFile` BEFORE writes (`191-199`); `historyLinesToAppend` validates each line first; `writeErrorStatus` validates at `index.mjs:94` before `writeAtomic` (`95`). |
| T-02-09 | Availability | mitigate | CLOSED | `index.mjs:122-128` fetch try/catch, `138-148` per-store try/catch; run always reaches `mergeWithPrior` + writes; carry-forward preserves last-known data — cannot wipe `data/`. |
| T-02-10 | Info Disclosure | mitigate | CLOSED | All `console.*` log `err.message`/`writeErr.message`/store names only (`index.mjs:125,146,172,175,220`); keys never logged (grep clean). |
| T-02-SC | Tampering | accept | CLOSED | Accepted risk logged below. `package.json:25-27` sole dep `zod` (pre-existing, Phase 1); zero new installs in Phase 2. |

---

## Accepted Risks Log

- **T-02-03 (Tampering / filter allow-list).** Out-of-scope marktguru advertisers
  (netto-marken-discount, penny, scheck-in-center, etc.) are silently excluded by
  the fixed slug allow-list in `filter.mjs`. Accepted: a malicious/extra advertiser
  in the untrusted feed simply matches no bucket and is dropped; no code path trusts
  an arbitrary `uniqueName`. No alerting on dropped advertisers is required for a
  single-user hobby app.

- **T-02-SC (Tampering / npm installs).** Phase 2 installs zero new packages
  (`zod` already present from Phase 1). Accepted: no new supply-chain install surface,
  so no per-install legitimacy checkpoint is required for this phase.

---

## WR-fix re-verification (per audit instructions)

- **WR-02 `writeErrorStatus` (`index.mjs:86-99`)** — builds the minimal status from
  store-name constants + `now.toISOString()` only (no keys), validates via
  `parseStatusFile` (`94`) before `writeAtomic` (`95`), and writes ONLY `status.json`
  (current-offers + history left intact). The doc is schema-valid: 4 marktguru stores
  "error" + Wasgau "unavailable" = all 5 `STORES` exactly once. No leak, no corrupt land.
- **WR-03 loosened island regex (`fetch.mjs:106`)** — confirmed ReDoS-safe by stress test.
- **WR-04 shared fetch deadline (`fetch.mjs:178-180`)** — bounds total wall-clock; supports
  the T-02-09 fast fail-over to last-known data.

---

## Unregistered Flags

None. All three plan SUMMARYs (`## Threat Surface`) declare no new attack surface
beyond the `<threat_model>` register, and the audit found none. Every registered
threat maps to shipped, verified code.
