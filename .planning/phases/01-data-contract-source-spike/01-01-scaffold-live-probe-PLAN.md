---
phase: 01-data-contract-source-spike
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - package-lock.json
  - .gitignore
  - .nvmrc
  - spike/probe.mjs
  - spike/README.md
  - spike/fixtures/raw-67105-search.json
  - spike/findings.md
autonomous: false
requirements: [DATA-02]
user_setup: []

must_haves:
  truths:
    - "Running the probe fetches marktguru homepage keys and queries /offers/search for PLZ 67105 without crashing"
    - "Every distinct advertisers[].uniqueName returned for 67105 is recorded, and the 5 target stores (REWE, Edeka, Lidl, Kaufland, Wasgau) each have a confirmed-present or explicitly-unavailable verdict"
    - "A raw, unfiltered marktguru payload is committed as a fixture proving the real field names"
    - "Wasgau coverage is resolved to either a real slug or an explicit unavailable verdict (no OCR)"
  artifacts:
    - path: "package.json"
      provides: "Node 22 project scaffold, zod pinned, node:test script, type:module"
      contains: "\"zod\""
    - path: "spike/probe.mjs"
      provides: "Live key-scrape + /offers/search probe that dumps raw payload and logs advertiser slugs"
      min_lines: 40
    - path: "spike/findings.md"
      provides: "Recorded answers to the 4 open questions: wrapper key, advertiser slugs, Wasgau verdict, validityDates granularity"
      min_lines: 20
    - path: "spike/fixtures/raw-67105-search.json"
      provides: "Captured live (or documented-fallback) marktguru payload"
  key_links:
    - from: "spike/probe.mjs"
      to: "https://api.marktguru.de/api/v1/offers/search"
      via: "native fetch with x-apikey/x-clientkey headers"
      pattern: "offers/search"
    - from: "spike/probe.mjs"
      to: "https://www.marktguru.de/"
      via: "homepage fetch + JSON-island key extraction"
      pattern: "application/json"
---

<objective>
Stand up the greenfield project scaffold (Node 22, native fetch, zod pinned, node:test, gitignore) and run the live marktguru spike that PROVES the data source before any contract is frozen. The probe scrapes the homepage bootstrap keys, queries /offers/search for "coca cola" at PLZ 67105, dumps the raw unfiltered payload as a committed fixture, and records the four live-only unknowns: the top-level wrapper key, the actual advertisers[].uniqueName slug for each of the 5 target stores, the Wasgau verdict (real slug OR explicit "unavailable" — never OCR), and the validityDates[] granularity. This satisfies ROADMAP success criterion #1 and produces the real data inputs Plans 02 and 03 freeze against.

Purpose: Per the research, CLAUDE.md's reverse-engineered field names are MEDIUM confidence and several are wrong (validFrom/validTo vs validityDates[]; decimal price vs cents; assumed slugs). Freezing a contract on guesses is the #1 trap. This plan resolves the guesses with real data first.
Output: package.json scaffold, spike/probe.mjs, the captured raw fixture, and spike/findings.md recording every live answer.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@CLAUDE.md
@.planning/phases/01-data-contract-source-spike/01-CONTEXT.md
@.planning/phases/01-data-contract-source-spike/01-RESEARCH.md
</context>

<artifacts_this_phase_produces>
This plan (01) creates:
- `package.json` / `package-lock.json` — Node 22 scaffold, `"type": "module"`, `zod` pinned to `^3.25`, `"test": "node --test"` script.
- `.gitignore` — ignores `node_modules/`, any `*.key`/`.env` (keys are never committed).
- `.nvmrc` — `22`.
- `spike/probe.mjs` — `getKeys()` (homepage JSON-island scrape) + the `/offers/search` fetch; writes the raw payload; logs distinct `advertisers[].uniqueName`.
- `spike/fixtures/raw-67105-search.json` — captured raw payload (the field-name source of truth).
- `spike/findings.md` — the four open-question answers (wrapper key, per-store slugs, Wasgau verdict, validityDates granularity), feeding Plans 02 & 03.
- `spike/README.md` — how to re-run the probe and the good-citizen cadence note.

Downstream (Plans 02, 03) consume: the captured raw fixture, the confirmed wrapper key, the observed 5-store slug map, the Wasgau verdict, and the validityDates granularity from `spike/findings.md`.
</artifacts_this_phase_produces>

<tasks>

<task type="auto">
  <name>Task 1: Scaffold the Node 22 project with zod pinned and node:test wired</name>
  <read_first>
    - CLAUDE.md — Technology Stack ("What NOT to Use": no axios/node-fetch; native fetch only) and Installation block
    - .planning/phases/01-data-contract-source-spike/01-RESEARCH.md — "Standard Stack", "Package Legitimacy Audit", and "State of the Art" (zod 3 vs 4 — pin one)
  </read_first>
  <files>package.json, package-lock.json, .gitignore, .nvmrc</files>
  <action>
    Run `npm init -y` then edit package.json: set `"type": "module"`, `"engines": { "node": ">=22" }`, add scripts `"test": "node --test"` and `"probe": "node spike/probe.mjs"`. Install zod pinned to the v3 line per RESEARCH "State of the Art" recommendation (matches CLAUDE.md documented stack): `npm install zod@^3.25` — this writes the resolved version into package.json and package-lock.json. Do NOT install axios, node-fetch, vitest, or jest (native fetch + node:test only, per CLAUDE.md and RESEARCH "Don't Hand-Roll"). Create .nvmrc containing `22`. Create .gitignore listing `node_modules/`, `*.log`, `.env`, `*.key` — the scraped apiKey/clientKey are never committed (RESEARCH Security Domain, V14). Do NOT create a `*.key` or `.env` file; keys live only in process memory at probe time.
  </action>
  <verify>
    <automated>node -e "const p=require('./package.json'); if(p.type!=='module')process.exit(1); if(!p.dependencies||!p.dependencies.zod)process.exit(2); if(!/^[\^~]?3\./.test(p.dependencies.zod))process.exit(3); if(!p.scripts.test)process.exit(4); console.log('scaffold ok', p.dependencies.zod)"</automated>
  </verify>
  <acceptance_criteria>
    - `package.json` has `"type": "module"` and a `zod` dependency on the 3.x line (e.g. `^3.25.x`).
    - `npm` script `test` runs `node --test`; script `probe` runs `spike/probe.mjs`.
    - No axios / node-fetch / vitest / jest anywhere in dependencies or devDependencies.
    - `.gitignore` excludes `node_modules/`, `.env`, and `*.key`; no key file is committed.
  </acceptance_criteria>
  <done>A Node 22 ESM project exists with zod@^3.25 pinned, `npm test` and `npm run probe` wired, and secrets gitignored.</done>
</task>

<task type="auto">
  <name>Task 2: Write the live marktguru probe (key scrape + /offers/search capture + slug logging)</name>
  <read_first>
    - .planning/phases/01-data-contract-source-spike/01-RESEARCH.md — "marktguru API — Verified Integration Notes" (auth key extraction, request shape, response table), "Code Examples" (Spike probe), and Pitfalls 3 & 4
    - CLAUDE.md — "marktguru API — integration notes" (base URL, endpoint, headers, good-citizen cadence/User-Agent)
  </read_first>
  <files>spike/probe.mjs, spike/README.md</files>
  <action>
    Create spike/probe.mjs (ESM, native fetch, no deps). Implement `getKeys()`: `GET https://www.marktguru.de/` with a descriptive User-Agent header `colaapp-spike/0.1 (personal, low-volume)`; extract all `<script type="application/json">…</script>` blocks (regex `/<script\s+type="application\/json">(.*?)<\/script>/gms`); JSON.parse each and return the first whose parsed object has `config.apiKey`, reading `config.apiKey` and `config.clientKey`; throw a clear error if none found; log how many blocks matched and the index that held the keys (Pitfall 4 — Phase 2 needs this). Then fetch `https://api.marktguru.de/api/v1/offers/search?as=web&q=coca%20cola&zipCode=67105&limit=200&offset=0` with headers `x-apikey`, `x-clientkey`, and the same User-Agent. Write the raw parsed JSON to `spike/fixtures/raw-67105-search.json` (pretty-printed). Determine the offers array by inspecting the real wrapper: log `Object.keys(data)` and resolve the array via `data.results ?? data.data ?? data` (Open Question 1 / Pitfall 1) — log which key won. Collect every distinct `advertisers[].uniqueName` into a sorted Set and print it. NEVER log or write the apiKey/clientKey values (RESEARCH Security: keys are low-sensitivity public bootstrap values but still not committed/logged). Make a single low-volume request — no loops, no parallelism (good-citizen ToS). Also write spike/README.md documenting: how to run (`npm run probe`), that it hits a third-party unofficial API at low volume, and the cadence guidance from CLAUDE.md.
    NOTE: Network access to marktguru is unverified in this sandbox (RESEARCH Environment Availability). If the fetch fails or the sandbox blocks it, the probe must exit non-zero with an actionable message; the human checkpoint (Task 3) covers running it on the user's machine and the synthesized-fixture fallback. Do NOT silently fabricate a payload here.
  </action>
  <verify>
    <automated>node --check spike/probe.mjs && grep -q "offers/search" spike/probe.mjs && grep -q "x-apikey" spike/probe.mjs && grep -q "zipCode=67105" spike/probe.mjs && grep -q "uniqueName" spike/probe.mjs && echo "probe shape ok"</automated>
  </verify>
  <acceptance_criteria>
    - `node --check spike/probe.mjs` passes (valid ESM, no syntax errors).
    - probe.mjs references the exact endpoint `offers/search`, params `zipCode=67105` and `q=coca%20cola`/`coca cola`, and headers `x-apikey`/`x-clientkey`.
    - probe.mjs collects and prints distinct `advertisers[].uniqueName` values and logs `Object.keys(data)` to resolve the wrapper.
    - probe.mjs never writes or console-logs the apiKey/clientKey values; no key file is produced.
    - On network failure it exits non-zero with an actionable message (no fabricated payload).
  </acceptance_criteria>
  <done>spike/probe.mjs runs the two-step key-scrape + search probe, captures the raw payload, and reports observed advertiser slugs and the wrapper key — or fails loudly if the network is unavailable.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    A Node 22 scaffold and `spike/probe.mjs` that, when run with network access, fetches marktguru's bootstrap keys and the /offers/search payload for PLZ 67105, dumps the raw payload to `spike/fixtures/raw-67105-search.json`, and prints the distinct advertiser slugs and the response wrapper key.
  </what-built>
  <how-to-verify>
    This step needs live network access (the build sandbox cannot guarantee it — RESEARCH Environment Availability).
    1. Run the probe: `npm run probe`
    2. Confirm `spike/fixtures/raw-67105-search.json` was written and is a non-empty JSON payload (not an error page).
    3. Read the console output. Record in the next step (findings.md):
       - the top-level wrapper key that held the offers array (`results` vs `data` vs bare array) — Open Question 1
       - the full sorted list of distinct `advertisers[].uniqueName` slugs returned for 67105
       - for EACH of the 5 targets (REWE, Edeka, Lidl, Kaufland, Wasgau): the exact slug seen, OR "not present at 67105"
       - whether any returned offer text contains a real `12 x 1 l` Coca-Cola case (a positive matcher case), and a sample `validityDates` value to judge granularity (date vs datetime, single vs multiple ranges) — Open Question 4
    4. WASGAU: if Wasgau returns no structured Cola offer, that is the DESIGNED "unavailable" outcome (D-05 / OFFR-04) — NOT a failure and NOT a reason for OCR. Just record it.
    5. FALLBACK: if the network is blocked even on your machine, or no live 12×1L positive case is on sale that week, say so — the matcher plan (03) will synthesize the positive fixture verbatim from the live strings documented in RESEARCH "Strict 12×1L Matcher", clearly labelled as synthesized-from-real.
    Reply with: the wrapper key, the 5-store slug verdicts, the Wasgau verdict, and a sample validityDates value (or "network blocked — use documented fallback").
  </how-to-verify>
  <resume-signal>Type "approved" with the recorded findings, or "network blocked — use fallback".</resume-signal>
</task>

<task type="auto">
  <name>Task 3: Record live findings into spike/findings.md (feeds the contract + matcher freeze)</name>
  <read_first>
    - .planning/phases/01-data-contract-source-spike/01-RESEARCH.md — "Open Questions", "Per-Store Coverage", and "Assumptions Log" (A1–A7 are what findings.md resolves)
    - spike/fixtures/raw-67105-search.json — the captured payload (if present)
  </read_first>
  <files>spike/findings.md</files>
  <action>
    Write spike/findings.md capturing the human-verified results from the checkpoint as the authoritative answers Plans 02 and 03 build against. Required sections: (1) Response wrapper key — the actual top-level key holding the offers array (resolves Open Question 1 / Assumption A4). (2) Observed advertiser slug map — a table mapping each of the 5 targets (REWE, Edeka, Lidl, Kaufland, Wasgau) to its real `advertisers[].uniqueName` OR "not present at 67105" (resolves Assumptions A1/A2, Pitfall 3). (3) Wasgau verdict — present-with-Cola, present-no-Cola, or absent → explicit `status: "unavailable"` decision, with a one-line note that OCR is out of scope (D-05, A3). (4) validityDates granularity — date vs datetime, single vs multiple ranges, and the rule for picking the active range (resolves Open Question 4 / A5). (5) Price field confirmation — confirm `price` is a decimal euro number so the contract's `Math.round(price*100)` cents conversion (D-09) is correct (A7). (6) Positive-fixture status — whether a real 12×1L Coca-Cola case was captured, or whether Plan 03 must synthesize it from documented live strings. If the fallback path was taken (network blocked / no positive case), note it explicitly and base the slug/wrapper answers on the documented RESEARCH values, labelled as documented-fallback rather than freshly-observed.
  </action>
  <verify>
    <automated>node -e "const s=require('node:fs').readFileSync('spike/findings.md','utf8').toLowerCase(); for(const k of ['wrapper','wasgau','validitydates','rewe','edeka','lidl','kaufland']){ if(!s.includes(k)){ console.error('missing section:',k); process.exit(1);} } console.log('findings ok')"</automated>
  </verify>
  <acceptance_criteria>
    - findings.md states the real response wrapper key (or documented-fallback value, labelled).
    - findings.md contains a slug verdict for all 5 stores (REWE, Edeka, Lidl, Kaufland, Wasgau).
    - findings.md states the Wasgau verdict and explicitly notes OCR is out of scope.
    - findings.md states validityDates granularity and the active-range selection rule.
    - findings.md confirms `price` is decimal (justifying the cents conversion) and records whether a positive 12×1L fixture was captured or must be synthesized.
  </acceptance_criteria>
  <done>spike/findings.md authoritatively answers all four open questions plus the price-type and positive-fixture status, ready for Plans 02 and 03 to freeze against.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| marktguru.de → probe (HTML) | Untrusted homepage HTML parsed for JSON-island keys |
| api.marktguru.de → probe (JSON) | Untrusted third-party API payload written to a committed fixture |
| probe process → repo (fixtures) | Captured data committed to a public repo (must not leak keys/PII) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-01 | Tampering | JSON.parse of homepage script blocks in spike/probe.mjs | mitigate | Wrap each JSON.parse in try/catch; select only the block with `config.apiKey`; never `eval`. Bounded regex (no catastrophic backtracking). |
| T-01-02 | Info disclosure | scraped apiKey/clientKey | mitigate | Keys held in memory only; never logged, never written to fixtures, `*.key`/`.env` gitignored (low-sensitivity public bootstrap values, but still not committed). |
| T-01-03 | Info disclosure | committed raw fixture | mitigate | Raw payload is public offer data (no PII/credentials); checkpoint confirms it is offer JSON, not an auth/error page. |
| T-01-04 | DoS | good-citizen ToS / rate | accept | Single low-volume request, descriptive User-Agent, no loops/parallelism per CLAUDE.md ToS guidance — operational, not a code vulnerability. |
| T-01-SC | Tampering | npm install (zod) | mitigate | zod is a household-name lib (RESEARCH Package Legitimacy Audit: OK, no [SUS]/[SLOP]); pinned to `^3.25`. No [ASSUMED]/[SUS] packages → no blocking legitimacy checkpoint required. |
</threat_model>

<verification>
- `npm test` exits 0 (no tests yet is acceptable for this plan; matcher tests land in Plan 03).
- `spike/fixtures/raw-67105-search.json` exists and is valid JSON (or the fallback note in findings.md explains its absence).
- `spike/findings.md` answers all four open questions + price type + positive-fixture status.
- No apiKey/clientKey value appears anywhere under version control.
</verification>

<success_criteria>
ROADMAP success criterion #1 is satisfied: a live probe (or documented fallback) confirms which of the 5 target stores return the 12×1L case at PLZ 67105, with Wasgau either confirmed or explicitly declared "not automatically available". The real response field names, wrapper key, advertiser slugs, and validityDates shape are recorded in findings.md so Plans 02/03 freeze against real data, not guesses.
</success_criteria>

<output>
Create `.planning/phases/01-data-contract-source-spike/01-01-SUMMARY.md` when done.
</output>
