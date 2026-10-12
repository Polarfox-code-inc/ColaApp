---
phase: 05-wasgau-leaflet-source
plan: 05
subsystem: scraper
tags: [wasgau, fault-isolation, ssrf, allow-list, body-cap, tripwire, github-actions, node-test, tdd]

requires:
  - phase: 05-wasgau-leaflet-source
    provides: "Plan 05-03 run({ wasgau }) seam, independent Wasgau try/catch, 5-store mergeWithPrior with kill switch, createFetchText (UA, withRetry, shared deadline); Plan 05-01 leaflet.mjs HOMEPAGE_URL/LEAFLET_HOST + fixtures"
  - phase: 02-scraper
    provides: "withRetry + UA in scraper/fetch.mjs, three-path merge semantics"
provides:
  - "scraper/wasgau/source.mjs: ALLOWED_HOSTS (www.wasgau.de, wasgau-dlog.1kcloud.com), MAX_BODY_CHARS (5,000,000); https + exact-host check before the request and on res.url after redirects; body-size refusal"
  - "Refusal messages: 'wasgau fetch refused: host not allowed (<host>)', '... redirected off allow-list (<host>)', '... body too large (<n> chars)'"
  - "run()-level proofs of D-01..D-04 plus a network tripwire in test/scraper.run.test.mjs; wasgauStub(pages, overrides)"
  - "merge unit cases for the enabled Wasgau paths in test/scraper.merge.test.mjs; priorWith(..., wasgau)"
  - "test/scraper.wasgau.source.test.mjs (11 offline tests)"
  - ".github/workflows/diagnose.yml prints data/wasgau-candidates.json (read-only runner probe, RESEARCH A1)"
affects: [phase 05 verification, end-of-phase UAT (live runner reachability)]

actuals:
  tokens: 7440
  tasks: 2
  commits: 3
plan_head_before: 4a7a8ee6400815e1150905def407676e2ca46670
plan_head_after: c6afc89d952f522bd75cc8bd27d3fb6712cf643a

tech-stack:
  added: []
  patterns:
    - "Network tripwire: a test file replaces globalThis.fetch with a throwing recorder at load and its LAST test asserts zero calls"
    - "Fixture stub override map: URL -> in-memory text or Error, so failure variants need no new fixture files"
    - "Seam-level allow-list as the last line behind URL rebuilding: exact Set lookup on host, checked pre-request (never retried) and post-redirect"

key-files:
  created:
    - test/scraper.wasgau.source.test.mjs
  modified:
    - scraper/wasgau/source.mjs
    - test/scraper.run.test.mjs
    - test/scraper.merge.test.mjs
    - .github/workflows/diagnose.yml

key-decisions:
  - "No defect in scraper/merge.mjs or scraper/index.mjs: every D-01..D-04 run()-level and merge case passed against the Plan 05-03 implementation, so both files are unchanged"
  - "The post-redirect check also requires https (same allowedHost() rule as the pre-request check), so a redirect cannot downgrade to http on an allowed host either"
  - "The allow-list refusal sits outside withRetry (never retried); the redirect and body-size refusals sit inside each attempt like the HTTP-status error"

patterns-established:
  - "Every run() in test/scraper.run.test.mjs injects an explicit wasgau seam (18 calls, checked by the acceptance one-liner)"

requirements-completed: [P5-SC3, P5-SC4]

coverage:
  - id: D1
    description: "Any Wasgau-source failure (fetch error, missing var wasgau script, foreign angebotslink, index without data-textpos, empty coords XML) marks only Wasgau 'error'; warm: verbatim carry-forward with frozen ts and byte-identical candidates file; cold and pre-Phase-5 'unavailable' prior: no_offer + error at now; marktguru stores never 'error' (D-01, P5-SC3)"
    requirement: "P5-SC3"
    verification:
      - kind: integration
        ref: "test/scraper.run.test.mjs#warm Wasgau failure: verbatim carry-forward, frozen ts, REWE still refreshes (D-01, D-03)"
        status: pass
      - kind: integration
        ref: "test/scraper.run.test.mjs#cold Wasgau failure: no_offer + error at now, no candidates file (D-01)"
        status: pass
      - kind: integration
        ref: "test/scraper.run.test.mjs#pre-Phase-5 'unavailable' prior + Wasgau failure -> no_offer + error, never unavailable (D-01, Pitfall 2)"
        status: pass
      - kind: integration
        ref: "test/scraper.run.test.mjs#shape change (...) -> Wasgau error, marktguru stores unaffected (D-01, D-03) [4 cases]"
        status: pass
      - kind: unit
        ref: "test/scraper.merge.test.mjs (5 Wasgau-enabled cases)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Isolation in the reverse direction and the other status rules: marktguru total failure sweeps only REWE/Edeka/Lidl/Kaufland while a Wasgau offer is written with bumped ts (D-03); negatives-only leaflet -> no_offer with bumped ts and 3 reject candidates (D-02); kill switch -> 0 requests, no candidates file, unavailable with carried ts (D-04); validation drift -> Wasgau 'error' when enabled (D-04)"
    requirement: "P5-SC3"
    verification:
      - kind: integration
        ref: "test/scraper.run.test.mjs#marktguru total failure sweeps only the 4 marktguru stores; Wasgau success is written (D-03)"
        status: pass
      - kind: integration
        ref: "test/scraper.run.test.mjs#negatives-only leaflet -> Wasgau no_offer with bumped ts, rejects written for review (D-02, D-10)"
        status: pass
      - kind: integration
        ref: "test/scraper.run.test.mjs#kill switch: zero Wasgau requests, no candidates file, unavailable with carried ts (D-04)"
        status: pass
      - kind: integration
        ref: "test/scraper.run.test.mjs#validation drift with Wasgau enabled writes Wasgau 'error' in the error status.json (D-04, WR-02)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Good-citizen seam: https + exact allowed host before any request (http, foreign and suffix-trick hosts refused with 0 fetch calls), redirect re-check, 5,000,000-char body cap, UA header, 503 -> status+host only after 3 attempts, 50 ms shared deadline rejects fast, fetchCandidates max in-flight 1 and Cola pages only (D-09, P5-SC4)"
    requirement: "P5-SC4"
    verification:
      - kind: unit
        ref: "test/scraper.wasgau.source.test.mjs (11 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The suite never touches the network: the run-test tripwire records zero real fetch calls (RESEARCH Pitfall 1)"
    requirement: "P5-SC4"
    verification:
      - kind: unit
        ref: "test/scraper.run.test.mjs#network tripwire: no test in this file made a real fetch call (Pitfall 1)"
        status: pass
    human_judgment: false
  - id: D5
    description: "GitHub-runner reachability of wasgau.de / 1kcloud and the live Wasgau card (RESEARCH A1): diagnose run prints a plausible wasgau-candidates.json, pipeline status.json Wasgau is offer/no_offer, PWA card no longer 'nicht automatisch verfügbar'"
    requirement: "P5-SC4"
    verification:
      - kind: manual_procedural
        ref: "05-05-PLAN.md Task 2 <human-check> (diagnose workflow_dispatch, post-push pipeline run, live PWA)"
        status: unknown
    human_judgment: true
    rationale: "Only observable on a real GitHub runner after the code is pushed; pushing master and dispatching workflows is the user's decision (end-of-phase UAT)"

duration: 5min
completed: 2026-10-12
status: complete
---

# Phase 5 Plan 05: Wasgau Fault Isolation Proofs and Network Hardening Summary

**Every Wasgau failure class now has a run()-level test showing that only Wasgau degrades: verbatim carry-forward with a frozen timestamp, or no_offer + error on a cold or pre-Phase-5 prior. The tests also show that marktguru failures never touch Wasgau. The Wasgau fetch seam now talks only https to www.wasgau.de and wasgau-dlog.1kcloud.com, re-checks the host after redirects and caps bodies at 5,000,000 chars. A network tripwire proves the suite stays offline, and diagnose.yml prints wasgau-candidates.json for the live runner check.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-10-12T18:22:33Z
- **Completed:** 2026-10-12T18:27:51Z
- **Tasks:** 2 (both tdd="true")
- **Files modified:** 5 (1 created, 4 modified)

## Accomplishments
- 12 new run()-level tests in test/scraper.run.test.mjs:
  - warm and cold Wasgau failure
  - pre-Phase-5 `unavailable` prior
  - four shape changes, each failing for the intended reason (logged as `angebotslink script not found`, `not an allowed 1kcloud URL`, `no searchable pages`, `no page`)
  - marktguru total failure with Wasgau success
  - negatives-only leaflet
  - kill switch with 0 requests
  - validation drift with Wasgau enabled
  - the tripwire as the last test
- In the foreign-host case the stub records exactly 1 request, so nothing is fetched from evil.example.
- 5 new merge unit cases cover the enabled Wasgau paths. `priorWith` gained an optional Wasgau entry, and existing callers are unchanged.
- `createFetchText` refuses any non-https or non-allow-listed URL before calling fetch. That includes `wasgau-dlog.1kcloud.com.evil.example` and `www.wasgau.de.evil.example`. It also rejects off-list redirects and bodies above 5,000,000 chars. The UA, retry, shared deadline and status+host-only errors are kept.
- diagnose.yml prints `data/wasgau-candidates.json`, with a display-only fallback line. pipeline.yml is unchanged: `git add data/` still commits the candidates file, and the deploy still copies only the three PWA files.
- The full root suite is green at 278/278, up from 250. No diff in `contract/`, `pipeline.yml`, `scraper/merge.mjs` or `scraper/index.mjs` since the plan base.

## Task Commits

1. **Task 1: Prove Wasgau fault isolation and status semantics end-to-end**: `d7454b4` (test)
2. **Task 2: Good-citizen network hardening and the read-only runner probe**: `308a2e5` (test, RED) and `c6afc89` (feat, GREEN)

## TDD Gate Compliance
- **Task 1:** this is a proof task. Its `<action>` says to fix merge/index only if a case fails. All 34 tests in the two files passed against the Plan 05-03 code, apart from one test-expectation correction (see Deviations). No production code changed, so there is no feat commit for Task 1. The tests are committed as regression proofs (`test(05-05)`). This is an unexpected GREEN that I checked: the behaviour already existed in Plan 05-03 (its SUMMARY lists the prior-unavailable guard, the kill-switch branch and the per-source try/catch). Each shape-change case was confirmed to fail on the intended error message.
- **Task 2 RED:** I ran `node --test --test-reporter=tap test/scraper.wasgau.source.test.mjs`. It exited 1 with 7 of 11 failing, all `ERR_ASSERTION`:
  - constants not exported (`ALLOWED_HOSTS must be a Set`)
  - 4 refusals and the redirect and body-cap tests: `Missing expected rejection.`

  The classifier returned `RED_EVIDENCE_OK` for the target "refuses https://wasgau-dlog.1kcloud.com.evil.example/ep1rP1V0/ without ever calling fetch (T-05-12)". Expected: rejects /host not allowed/ with 0 fetch calls. Actual: no rejection. Semantic assessment: every failure is an assertion on planned behaviour. The 4 passing tests (UA, 503, deadline, sequential fetchCandidates) cover Plan 05-03 behaviour and are kept as regression proofs. The namespace import keeps a missing export from failing at module load.
- **Task 2 GREEN:** `c6afc89` follows `308a2e5`, with 11/11 and 278/278 passing. No refactor commit was needed.

## Files Created/Modified
- `scraper/wasgau/source.mjs`: `ALLOWED_HOSTS`, `MAX_BODY_CHARS`, `allowedHost()` (https + exact host), pre-request refusal outside withRetry, post-redirect and body-size checks inside each attempt, and a rewritten header covering T-05-12/13/15, D-09 and D-18
- `test/scraper.wasgau.source.test.mjs`: 11 offline tests using a fake `fetchImpl`
- `test/scraper.run.test.mjs`: tripwire, `wasgauStub(pages, overrides)`, `HOMEPAGE`, `wasgauFixture`, `seedMocks`, `exists`, 12 new tests
- `test/scraper.merge.test.mjs`: `priorWith(..., wasgau)` via `withWasgau()`, 5 new tests
- `.github/workflows/diagnose.yml`: header note (runner probe, RESEARCH A1) and two print lines

## Decisions Made
- merge.mjs and index.mjs were not changed because no test exposed a defect (see key-decisions).
- The redirect re-check uses the same https + host rule as the pre-request check.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test expectation] Cold-failure test compared the whole parsed Wasgau entry**
- **Found during:** Task 1
- **Issue:** `readCurrent` parses through `parseCurrentOffers`, which fills in the schema default `needsReview: false`. A `deepEqual` against `{ store, displayName, status: "no_offer" }` therefore failed, even though the written file is correct.
- **Fix:** the run-level cold test asserts `status === "no_offer"`. The exact merge output shape is asserted in the merge unit tests, which do not parse.
- **Files modified:** test/scraper.run.test.mjs
- **Committed in:** d7454b4

---

**Total deviations:** 1 auto-fixed (test expectation)
**Impact on plan:** None on behaviour.

## Issues Encountered
- A Bash heredoc append failed in Git Bash on a quote-parsing error, before anything was written. I appended with the Edit tool instead, and the file was verified unchanged before the retry.
- The project uses `branching_strategy: none` and this was a sequential main-tree executor, so commits are on master as instructed. Nothing was pushed and no workflow was triggered.
- Git prints LF->CRLF warnings on commit (repo autocrlf). This is pre-existing.

## Known Stubs
None.

## Threat Flags
None. No new surface: the plan narrows the existing Wasgau outbound surface. T-05-12, T-05-13, T-05-14, T-05-15 and T-05-17 are mitigated and tested as registered. T-05-16 is accepted: diagnose prints only the public candidates file, with permissions unchanged (`contents: read`).

## User Setup Required
None. No external service configuration is required.

## End-of-Phase Human Check (not run here)
These steps need a push to master and a workflow dispatch, which are the user's decision:
1. Run GitHub → Actions → "diagnose" → Run workflow (or `gh workflow run diagnose.yml`, then `gh run watch`). In the "Run scraper (with new matcher) and show output" step, there should be no `WASGAU FAILED:` line. The printed wasgau-candidates.json should have a leafletId matching wasgau.de's current "Zum Prospekt" link, Cola pages, and paired prices.
2. After the push-triggered pipeline run, `git pull`. data/status.json should show Wasgau as `offer` or `no_offer`, not `error`.
3. Open https://polarfox-code-inc.github.io/ColaApp/. The Wasgau card should no longer read "nicht automatisch verfügbar", and the chart legend should list Wasgau.

If step 1 or 2 shows an error, set `WASGAU_CONFIG.enabled` to false in scraper/wasgau/config.mjs (the kill switch) and report the logged message.

## Next Phase Readiness
- All 5 plans of Phase 5 have summaries. The phase is ready for verification and the end-of-phase UAT above.

## Self-Check: PASSED
- Files present: scraper/wasgau/source.mjs, test/scraper.wasgau.source.test.mjs, test/scraper.run.test.mjs, test/scraper.merge.test.mjs, .github/workflows/diagnose.yml.
- Commits d7454b4, 308a2e5 and c6afc89 are ancestors of HEAD (3 measured from 4a7a8ee).
- Acceptance re-run:
  - tripwire count 6, and it is the last test (line 618)
  - 18 run() calls inject wasgau
  - source.mjs constants check exit 0
  - `cat data/wasgau-candidates.json` count 1
  - pipeline.yml cp line count 1 and `git add data/` count 1
  - contract/ and pipeline.yml diffs empty
  - the 3-file verify run 45/45, `npm test` 278/278
