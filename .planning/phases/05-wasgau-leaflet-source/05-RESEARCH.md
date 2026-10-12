# Phase 5: Wasgau leaflet source - Research

**Researched:** 2026-10-12
**Domain:** Leaflet text-layer extraction (1kcloud ePaper / pdfminer-style coords XML) feeding an existing fault-isolated Node ETL + vanilla-JS PWA
**Confidence:** HIGH for source shape and code integration (live-probed + code read this session); MEDIUM for pairing/date heuristics (proven on 4 real pages of 1 leaflet only); LOW for GitHub-runner reachability (not probed from a runner)

## Summary

The live source matches the roadmap and is simpler to consume than expected. `https://www.wasgau.de/` carries `var wasgau = {"angebotslink":"https://wasgau-dlog.1kcloud.com/ep1rP1V0/"};`. The 1kcloud index page at that URL (~150 KB) lists every page's coords file (`data-textpos="epaper/coords/page_N.xml"`, 26 pages this week). It also embeds a **flattened plain-text copy of every page** (`<div class="text">…`). That changes the "stop early" story. The scraper does not need the ~10 MB of page XML. It can grep the index text for Coca-Cola, then download **only** the pages that mention it: 2 pages this week (p17, p26), ~51 KB and ~130 KB gzipped. Node's `fetch` decompresses gzip transparently, which I verified. A new-leaflet run is then about 4 small sequential requests, and an unchanged-id run (D-05) is 1 request.

You cannot classify the flattened index text, because it concatenates neighbouring products. On p17 the text "Sinalco … je 12 x 1-l" sits right before "Coca Cola … je 6 x 1-l". Classification must run on **reconstructed textboxes** from the coords XML. The XML is pdfminer.six `-t xml` output: `<textbox bbox>` → `<textline bbox>` → one `<text font bbox size>` per character, in PDF points with the origin bottom-left and y pointing up. Prices are clearly typeset: the integer part is size 32.637 and the cents are 21.170. Strike prices ("10.99 -18%") are 11.0, and the unit-price text is 5.8–7.4. **Splitting characters by font size (≥18 = price glyph)** is therefore the robust way to find price tokens. It also handles a real case where pdfminer merged a price into a product textline (p1 box 28). The price is not always on the same side of the product: it was observed **right** (p17), **below** (p26) and **left** (p24). Nearest-box pairing alone mis-pairs. The product's own `1-l-Preis X` (legally mandatory Grundpreis under PAngV) times its litres pins the right price box in every real case probed.

The frozen matcher works unchanged on reconstructed text. I ran it against the real boxes. 6×1L glass → reject (count 6). 0,33 can → reject (WRONG_SIZE `0,33`). 2 L PET → reject. Sinalco 12×1L → reject (no Coca-Cola). A synthesized `Coca Cola… Kiste mit je 12 x 1-l-MW-PET-Flaschen…` → accept, count 12. Leaflet sizes use **comma** decimals (`0,33-l`), so `WRONG_SIZE` matches as-is. Prices and Pfand use dots. One reconstruction rule is mandatory: **de-hyphenate line joins**. A naive space join of `Coca-`/`Cola` gives `Coca- Cola`, which the matcher rejects (verified).

**Primary recommendation:** Add a self-contained `scraper/wasgau/` pipeline that works in five steps. (1) Read the homepage link and validate it against an allow-list (host + id). (2) If the id equals the cached id, re-evaluate the cached candidates and stop. (3) Otherwise fetch the index, take the leaflet window from the page-1 text and pick the Cola pages. (4) Sequentially fetch only those pages' coords XML. (5) Reconstruct the boxes, find price tokens by font size, pair prices by geometry plus the `1-l-Preis` cross-check, resolve the validity window (box > page top-band > leaflet), and write deterministic `data/wasgau-candidates.json`. Each run, shape the candidates into marktguru-like offers and reuse `selectForStore()`. Then apply the probation/ambiguity `needsReview` override and feed the result through a generalized 5-store `mergeWithPrior` with its own try/catch. No new npm dependencies.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Discover current leaflet id (wasgau.de homepage) | Scraper (GitHub Actions, Node) | — | Server-side only; the PWA can't fetch third-party sites (CORS) |
| Page discovery + Cola page selection (1kcloud index text) | Scraper | — | Network + parsing; bounded, sequential |
| Textbox reconstruction, price-token extraction, geometric pairing, date parsing | Scraper (pure modules) | — | Pure transforms, fixture-testable offline |
| Candidate capture + leaflet-id cache | Scraper → `data/wasgau-candidates.json` (repo storage) | GitHub (git history = weekly review log) | D-11: committed JSON, not read by PWA |
| 12×1L classification | `contract/matcher.mjs` (shared contract) | — | D-14: reuse as-is |
| Active/upcoming selection, cents/€-l normalization | Scraper (`select.mjs`/`normalize.mjs`) | — | Reuse after shaping candidates like marktguru offers |
| Fault isolation / carry-forward / timestamps | Scraper (`merge.mjs` + `index.mjs`) | — | D-01/D-03: independent try/catch per source |
| Kill switch + probation flags | Scraper config | PWA (derives "kill switch on" from Wasgau `status==="unavailable"`) | Keeps the frozen contract unchanged; the PWA needs no config |
| Wasgau chart line + legend | PWA (`web/src/chart/history.js`) | `web/src/main.js` passes the Wasgau status | D-16 |
| Commit / deploy | GitHub Actions (`pipeline.yml`) | — | `git add data/` already includes the new file |

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Status semantics & fault isolation
- **D-01:** **Wasgau source failure → `error` + carry-forward**, exactly like the marktguru stores (Phase 2 D-02/D-04): last-known Wasgau entry copied verbatim into `current-offers.json`, Wasgau's per-store `lastUpdated` in `status.json` frozen → PWA shows stale. Covers: angebotslink missing on wasgau.de, 1kcloud shape change, XML fetch/parse failure. Cold start + failure → `error` in status, `no_offer` in current-offers (Phase 2 D-06 path). **This supersedes roadmap SC3's "degrades to `unavailable`" wording** — SC3's intent (Wasgau failure never affects others) is kept.
- **D-02:** **Leaflet parsed successfully, no Cola case → `no_offer`**, and Wasgau's per-store `lastUpdated` bumps (the check succeeded).
- **D-03:** **Fully independent sources.** Separate try/catch paths: a marktguru total failure sweeps only REWE/Edeka/Lidl/Kaufland; a Wasgau failure touches only Wasgau. Replaces Phase 2 D-03 ("Wasgau always unavailable") and the `merge.mjs` hard-coded Wasgau branch.
- **D-04:** **Kill switch.** A config flag forces Wasgau back to the old fixed `unavailable` behaviour (no leaflet fetch at all; PWA shows "nicht automatisch verfügbar", chart legend reverts to greyed). For abandoning the source later without a code change. `unavailable` stays in the frozen status enum — no schema change.

#### Fetch volume & caching
- **D-05:** **Skip re-download when the leaflet id is unchanged.** Every run does the cheap wasgau.de homepage request to read the current 1kcloud id; the ~10 MB page-XML download happens only when the id differs from the last successfully parsed one (≈ once per week instead of ≈ 14×).
- **D-06:** **Cache extracted candidates, not the final entry.** On an unchanged id, reuse the cached reconstructed candidates (product text + paired price(s) + dates + page/bbox) and **re-run matcher + active/upcoming selection against `now` every run** — so matcher changes and expiry (validTo passed → `no_offer`) take effect without a re-download. An unchanged-id run counts as a successful check (Wasgau `lastUpdated` bumps).
- **D-07:** **Current leaflet only.** Use whatever wasgau.de links as `angebotslink`; no hunting for a preview/next-week leaflet. If the link already points at next week, the future `validFrom` surfaces as "upcoming" via existing PWA logic.
- **D-08:** **Validity dates:** leaflet-wide window from page 1 (e.g. `GÜLTIG VOM 12. BIS 17. OKTOBER 2026`) by default; an offer's own window (e.g. `Donnerstag 15.10. bis Samstag 17.10.`) overrides it when present. Stored as `YYYY-MM-DD` Berlin like everything else.
- **D-09:** Good-citizen fetching carried over: native `fetch`, descriptive User-Agent, strictly sequential page requests, retries/timeouts per Phase 2 D-11, no parallelism.

#### Candidate capture & review (no positive Wasgau match has ever been observed)
- **D-10:** **Candidate = any reconstructed textbox mentioning Coca-Cola / Coke** (incl. Zero, mixed-brand bundles, cans, glass, 2 L PET) — captured with page number, bbox, reconstructed text, paired price(s), dates, and the `classify()` verdict. Deliberately wide so near-misses are visible.
- **D-11:** **Candidates are committed as JSON in `data/`** (e.g. `data/wasgau-candidates.json`). The same file holds the last-parsed leaflet id → it **is** the D-05/D-06 cache. A few KB, reviewable week by week in git history on GitHub. Not read by the PWA.
- **D-12:** **Probation mode:** a flag (default ON) forces every Wasgau *accept* to be emitted as `needsReview:true` (amber "bitte prüfen" card, never hero, never history) until the maintainer has eyeballed a real positive and flips the flag off. — **Reversibility:** reversible — single flag.
- **D-13:** **After probation, ambiguous pairing → `needsReview`** (best-guess price shown): e.g. two plausible price boxes next to the product, or the product text's own `1-l-Preis X` cross-check disagrees with the paired price. Only clean, unambiguous pairings become a normal offer. Matches the marktguru review path (Phase 2 D-08, post-04 review card).
- **D-14:** **Matcher reused as-is** (`contract/matcher.mjs` `classify()` on the reconstructed textbox text, broadened post-04 scope: any ≥12×1L PET case including Coca-Cola). Price → integer cents, €/litre over actual bottle count via `caseCount()`, Pfand excluded — same normalization as marktguru offers.
- **D-15:** **Fixtures = trimmed real page XML**: keep only the textboxes around each Cola mention (product box + nearby price/date boxes) plus the page-1 date header, from the real 2026-10-12 leaflet. Must include the known negatives (6×1L glass, 0.33 can, 2 L PET). A positive fixture may be synthesized-from-real (Phase 1 precedent) until a real one is captured.

#### PWA presentation
- **D-16:** **Wasgau gets a 5th chart line**: add to `STORES_WITH_LINES` with its own colour/marker; drop the greyed "nicht automatisch verfügbar" legend item (except when the kill switch D-04 is on). The line stays empty until a clean (non-review) Wasgau offer lands in history.
- **D-17:** **Card label stays plain "Wasgau"** (`displayName` unchanged).
- **D-18:** **Reference branch = Wasgau Dudenhofen** wherever a branch must be chosen (store-specific leaflet variant, market selector/cookie on wasgau.de, regional offer differences). There is no Wasgau in Schifferstadt; Dudenhofen is the default "if in doubt".

### Claude's Discretion
- Module layout (e.g. `scraper/wasgau/` with homepage-link / page-fetch / textbox-reconstruct / price-pair / date-parse units), how the kill-switch and probation flags are stored (constants vs. a small config file), exact candidate JSON shape, geometric pairing heuristics, and whether to stop paging early once all relevant data is found are left to research/planning — provided each unit is offline-testable against fixtures.
- How `merge.mjs` / `index.mjs` are reshaped to run two independent sources and still validate-before-write against the frozen contract.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

No requirement IDs are mapped (ROADMAP: "Requirements: TBD"). Coverage source = roadmap success criteria SC1–SC4 + CONTEXT D-01..D-18.

| ID | Description | Research Support |
|----|-------------|------------------|
| SC1 | Wasgau 12×1L Coca-Cola offer appears in `current-offers.json` with correct price (cents) + validity dates via the existing matcher on reconstructed textbox text | §Textbox reconstruction (de-hyphenate + NFKC), §Price tokens & pairing, §Validity windows, §Shaping candidates for `selectForStore`. Matcher verified on real reconstructed text |
| SC2 | Fixtures from real leaflet XML (incl. negatives 6×1L glass, 0.33 can, 2 L PET) cover reconstruction, pairing, date parsing | `research-samples/` holds trimmed real XML for p1/p17/p24/p26 + index/homepage excerpts (see §Real samples captured) |
| SC3 | Any Wasgau-source failure degrades Wasgau alone (`error` + carry-forward per D-01); marktguru stores unaffected | §merge/index reshape, Pitfall "prior `unavailable` carried forward as error data" |
| SC4 | Good-citizen fetching: sequential, descriptive UA, stop early | §Index-driven page selection (≈4 requests per new leaflet, 1 per unchanged-id run) |
| D-01/D-02/D-03 | Status semantics + independent sources | §Generalized `mergeWithPrior`, §`run()` reshape |
| D-04 | Kill switch | §Config flags; PWA derives greyed legend from `status==="unavailable"` |
| D-05/D-06/D-11 | Leaflet-id cache = candidates file; re-evaluate each run | §Candidate file shape, §Flow |
| D-07 | Current leaflet only | Homepage link is global (same id on the Dudenhofen market page, verified) |
| D-08 | Leaflet window default, offer window overrides | §Validity windows (3-level precedence; page-level header format found on p24/p25) |
| D-09 | Native fetch, UA, sequential, retries | Reuse exported `withRetry` from `scraper/fetch.mjs:53` |
| D-10 | Wide Cola candidate capture | Regex `/coca[\s-]*cola|\bcoke\b/i` on NFKC text; capture rejects too |
| D-12/D-13 | Probation + ambiguity → needsReview | §Pairing outcome classes (clean / ambiguous / mismatch / unpaired) |
| D-14 | Matcher as-is | Verified verdicts on real text (Code Examples) |
| D-15 | Real trimmed fixtures | `research-samples/*.trimmed.xml` |
| D-16/D-17 | 5th chart line, plain label | §PWA changes (`STORES_WITH_LINES`, `LINE_COLORS`, `renderLegend`) |
| D-18 | Dudenhofen reference branch | Verified: Dudenhofen market page links the same global leaflet. Branch exclusions exist only as footnotes ("in den Märkten in Limbach und Niederkirchen nicht erhältlich"), not as separate leaflets |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Cost:** entirely free. GitHub Actions + Pages only, no paid APIs. (The approach adds ~4 small requests/week and ~1 request per run.)
- **Hosting:** nothing on the author's machine.
- **Data acquisition:** automatic; a scheduled server-side job produces the data files the PWA reads.
- **Simplicity:** narrow scope is deliberate. Add no framework and no new store.
- **Stack:** Node 22 LTS, native `fetch` (no `axios`/`node-fetch`). Avoid Playwright/Puppeteer, **avoid an OCR pipeline** ("Wasgau leaflet OCR pipeline — PDF/image OCR is fragile, heavy … Use … an explicit 'no offer' state"). This phase uses the PDF *text layer*, not OCR, so it stays consistent.
- **Good citizen:** slow cadence, sane User-Agent, never parallel-hammer.
- **Git:** commit only on change. Use the `concurrency:` group and `git pull --rebase` (already in `pipeline.yml`).
- **No push / no backend.**
- **GSD workflow enforcement:** edits only through GSD commands. Planner/executor concern, not research.
- **Global user instructions (C:\Users\Ben\.claude\CLAUDE.md):** keep changes surgical and the code minimal (no speculative configurability). Write meaningful intention comments. Goal-driven: tests first or tests that prove behaviour.

## Live Source Findings (probed 2026-10-12)

All of these come from requests made this session (curl/node from the dev machine, UA `colaapp-scraper/0.1 (personal, low-volume; research probe)`). Requests were strictly sequential.

### 1. Homepage → leaflet link `[VERIFIED: live probe of https://www.wasgau.de/]`
- `HTTP/2 200`, LiteSpeed/WordPress, ~152 KB.
- Exact markup:
  ```html
  <script id="wa-prospekt-links-js-extra">
  var wasgau = {"angebotslink":"https://wasgau-dlog.1kcloud.com/ep1rP1V0/"};
  //# sourceURL=wa-prospekt-links-js-extra
  </script>
  ```
- The link also appears as `<a … href="https://wasgau-dlog.1kcloud.com/ep1rP1V0/">Zum Prospekt</a>` (5 occurrences of the id on the page).
- `wa-prospekt-link.js` is fully commented out, so there is **no client-side per-market rewriting** of the link.
- The **Dudenhofen market page** (`/maerkte/wasgau-frischemarkt-dudenhofen/`) carries the identical `var wasgau = {"angebotslink":"https://wasgau-dlog.1kcloud.com/ep1rP1V0/"}`. It also links a second, unrelated 1kcloud doc (`ep1TikJ3`, title "Bewerbung Fruchtpreis WASGAU Husterhoehe", Last-Modified 2024). **So never take "the first 1kcloud link on a page"; read the `var wasgau` JSON only.**
- `robots.txt` on wasgau.de: `User-agent: *` / `Disallow:` (empty, so nothing is disallowed).
- The homepage also exposes `var wasgauVars = {"mapboxToken":…,"apiBase":"https://www.wasgau.de/wp-json/wasgau/v1"}`. That API has `/products`, `/markets`, `/search` routes but **no offers route**. `/products?search=coca` returned `{"items":[],"total":0,…}`. It is not an alternative source. Do not log homepage contents (they contain a third-party token).

### 2. 1kcloud index page (the leaflet root URL) `[VERIFIED: live probe of https://wasgau-dlog.1kcloud.com/ep1rP1V0/]`
- `200 text/html`, ~152 KB, nginx, `Last-Modified: Mon, 05 Oct 2026 07:40:27 GMT`. The leaflet valid from 12.10 was **published a week earlier**.
- `<title>WASGAU Prospekt ab 12.10.</title>`.
- One block per page, which is the **page list** (26 this week):
  ```html
  <div class="searchable" data-textpos="epaper/coords/page_1.xml">
      <div class="text">GÜLTIG VOM 12. BIS 17. OKTOBER 2026 GOLDENER HERBST, … </div>
  ```
  The `.text` content is a flattened, whitespace-joined copy of all of that page's textboxes. Size is 183–2693 chars per page.
- Searching all 26 page texts for `coca|coke` hits **page 17 and page 26 only**.
- Other resources exist (`epaper/ausgabe.pdf`, `epaper/pages/…jpg`, `hires`, `thumbs_big`, `pages_500`) but are not needed.
- `https://wasgau-dlog.1kcloud.com/robots.txt` → **404**: no robots.txt observed. That is an absence and grants nothing either way.

### 3. coords XML per page `[VERIFIED: live probe of epaper/coords/page_{1,17,24,26}.xml]`
- `Content-Type: application/xml`, `Content-Encoding: gzip`. p17 is 51,163 B gzipped and 230,492 B decoded. p1 is 357,807 B decoded and p26 is 600,929 B decoded.
- Node 24 `fetch` returned `200 gzip 51163 decoded chars 230483 ms 455`, so transparent decompression works. Node 22 uses the same undici fetch `[ASSUMED: same behaviour on Node 22]`.
- Format = pdfminer.six `pdf2txt -t xml`:
  ```xml
  <?xml version="1.0" encoding="utf-8" ?>
  <pages>
  <page id="1" bbox="0.000,0.000,476.220,841.890" rotate="0">
  <textbox id="1" bbox="111.954,467.494,150.334,500.131">
  <textline bbox="111.954,467.494,150.334,500.131">
  <text font="XQCOEE+Interstate-BlackCondensed" bbox="111.954,467.494,128.348,500.131" size="32.637">0</text>
  <text font="XQCOEE+Interstate-BlackCondensed" bbox="127.838,467.494,135.661,500.131" size="32.637">.</text>
  <text font="XQCOEE+Interstate-BlackCondensed" bbox="129.067,476.817,139.700,497.987" size="21.170">8</text>
  <text font="XQCOEE+Interstate-BlackCondensed" bbox="139.700,476.817,150.334,497.987" size="21.170">8</text>
  <text>
  </text>
  </textline>
  </textbox>
  ```
- **`<page id="1">` in every file.** Each file is a single-page split, so the page number must come from the filename/URL, not the XML.
- Element counts (p17): `textbox` 58 (28 with content plus 30 self-closing `<textbox id=".." bbox=".." />` inside the trailing `<layout><textgroup>` section), `textline` 74, `text` 1175, plus `figure`/`image`/`rect`/`curve`.
- Bare `<text> </text>` (space, no attributes; pdfminer `LTAnno`) and `<text>\n</text>` (line end) occur. Entities are escaped (`&amp;` seen on p26). No `colourspace` attributes appear in these files.
- **Coordinate system:** origin bottom-left, y up. On p1 the leaflet header "GÜLTIG VOM…" is at y 821–831 (top of an 841.89-high page), and the p17 footer "wasgau.de 17" is at y 14–29. pdfminer docs: "Each character has an x-coordinate and a y-coordinate for its bottom-left corner and upper-right corner" `[CITED: pdfminersix.readthedocs.io/en/latest/topic/converting_pdf_to_text.html]`.
- **Font-size classes observed (p17):** price integer + "." `32.637`, price cents `21.170`, strike/discount line `11.026` ("10.99 -18%"), product name `9.801`, body `7.441`, unit price `5.847`, section header 12.0. Elsewhere: header/feature words 13–42.6, "%" badge 116.7 (not a price pattern).

### 4. Reconstructed Cola boxes on this week's leaflet `[VERIFIED: local reconstruction script over the live XML]`

| Page | Box | bbox (x0,y0,x1,y1) | Reconstructed text | Price box | Relation | Cross-check |
|------|-----|-------------------|--------------------|-----------|----------|-------------|
| 17 | 14 | 23,216,101,268 | `*Coca Cola1) oder *Coca Cola Zero 1) und weitere Sorten je 6 x 1-l-MW-Glasflaschen, zzgl. 2.40 Pfand, 1-l-Preis 1.50, 1)koffeinhaltig` | `8.99` (box 15, 111,229,149,261); strike `10.99 -18%` (box 16, size 11) | right, gap 10 | 6 L × 1.50 = 9.00 ≈ 8.99 ✓ |
| 17 | 17 | 176,215,250,269 | `Coca Cola1), Fanta oder Mezzo Mix1) und weitere Sorten je 0,33-l-Dose, zzgl. 0.25 Pfand, 1-l-Preis 2.39 1)koffeinhaltig` | `0.79` (box 18, 418,213,456,246) | right, **gap 168**. `8.99` is CLOSER (left, gap 27) | 0.33 × 2.39 = 0.79 ✓ (8.99 ✗) |
| 26 | 36 | 405,141,452,211 | `Coca Cola 1) versch. Sorten, je 2-l-PET-Flasche, zzgl. 0.25 Pfand, 1-l-Preis 0.75, 1) koffeinhaltig KNÜLLER` | `1.49` (box 37, 414,107,446,140); strike `2.19 -31%` | **below**, gap 2 | 2 × 0.75 = 1.50 ≈ 1.49 ✓ |

Other layout facts from the probed pages:
- p24 box 8 (Jumbo-Schnitzel, x 272–369) → price `0.99` at x 221–258: the price is to the **left**.
- p1 box 28: pdfminer merged `je 150-g-Packung, kg-Preis 9.93` **and** the big `1.49` into one textline. The price glyphs (sizes 32.637/21.170) sit inside the product box.
- p1 box 37 (Bitburger, two variants in one box: `Kiste mit je 24 x 0,33-l… oder Kiste mit je 20 x 0,5-l…`) has **two** adjacent big prices (`10.99` box 38, `11.99` box 40) plus a small `1-l-Preis ab 1.10` box 39. This is the real-world "ambiguous pairing" shape.
- p17 box 10 (Sinalco, `je 12 x 1-l-MW-Flaschen`, `1-l-Preis 0.42`) has `4.99` (gap 14, ✓ 12 × 0.42 = 5.04) **and** `1.69` (gap 27, granini's price) adjacent. Only the cross-check separates them.

### 5. Validity date formats found in this leaflet `[VERIFIED: index text of all 26 pages]`
- Leaflet-wide (p1, top band y≈821): `GÜLTIG VOM 12. BIS 17. OKTOBER 2026`. The "from" side has no month.
- **Page-wide** (p24 and p25, top band y 814–827, size 13): `VOM DONNERSTAG 15. BIS SAMSTAG 17. OKTOBER`. Weekday names, no year. Every offer on those weekend pages is Thu–Sat only.
- Box-local, not page-wide: p1 box 4 `Donnerstag 15.10. / bis Samstag 17.10.` (y 594–617). This is the **app-coupon window**, not a window for neighbouring products.
- Box-local monthly: p8 `GÜLTIG VOM 1. BIS 31. OKTOBER` ("Knaller des Monats"), no year.
- Not windows: `Ab 28.10. geht's los` (p21), `ERHÄLTLICH ab DIENSTAG` (p8), `KW 42 | 2026` (p1 footer, usable as a sanity check).
- **Glyph dropout exists:** p20 reads `Aktionszeitrum: 2.0. – 7.0.2026 Beim Kuf von Produkten der Mrken …`. One font has no Unicode mapping for some glyphs ('a', '1'). The text layer is not guaranteed complete.

### Real samples captured (for fixtures, D-15)
Saved verbatim (only the listed textboxes kept, inside the original `<pages><page>` wrapper) under `.planning/phases/05-wasgau-leaflet-source/research-samples/`:

| File | Size | Content / purpose |
|------|------|-------------------|
| `wasgau-homepage.excerpt.html` | 0.3 KB | the `var wasgau = {"angebotslink":…}` script block |
| `wasgau-ep1rP1V0-index.excerpt.html` | 8 KB | `<title>` + `searchable`/`text` divs for pages 1, 2, 17, 26 (page discovery, leaflet window, Cola page selection) |
| `wasgau-ep1rP1V0-page_1.trimmed.xml` | 45 KB | boxes 0 (leaflet header), 4 (coupon window, must NOT apply page-wide), 27–28 (price merged into product line), 37–40 (Bitburger two-price ambiguity) |
| `wasgau-ep1rP1V0-page_17.trimmed.xml` | 44 KB | boxes 9–18: **negatives** 6×1L glass (14→15), 0,33 can (17→18 with closer wrong 8.99), Sinalco 12×1L non-Coca-Cola (10→11, extra 1.69 box 9) |
| `wasgau-ep1rP1V0-page_24.trimmed.xml` | 30 KB | box 0 page-level window header; right-side (3→4) and **left-side** (8→6) price layouts |
| `wasgau-ep1rP1V0-page_26.trimmed.xml` | 14 KB | **negative** 2 L PET (36) with price **below** (37) |

The executor should copy the needed ones into `test/fixtures/wasgau/` (`.xml`/`.html` are not picked up as tests; see Pitfall 9). The positive fixture should be **synthesized from real**: copy p17 box 10 (Sinalco 12×1L + price box 11 + strike 12) and rewrite only the characters of the product name to `Coca Cola1), Fanta, Sprite oder Mezzo Mix1)` and the unit price to a consistent value (e.g. price `9.99` → `1-l-Preis 0.83`). The geometry stays real. Phase 1 used the same precedent.

## Standard Stack

### Core (all already in the repo; no new packages)
| Library / API | Version | Purpose | Why |
|---------|---------|---------|--------------|
| Node.js native `fetch` (undici) | Node ≥22 (`engines` in package.json; CI `node-version: 22`) | homepage, index, coords XML requests; transparent gzip | CLAUDE.md "no axios/node-fetch"; gzip decode verified |
| `scraper/fetch.mjs` `withRetry` | in-repo | per-attempt fresh `AbortSignal.timeout`, backoff, shared deadline | D-09 reuses the Phase 2 D-11 policy |
| `contract/matcher.mjs` `classify`/`caseCount` | in-repo (frozen) | 12×1L gate + litres | D-14 |
| `scraper/select.mjs` `selectForStore` + `normalize.mjs` `toStoreOffer`/`berlinDay` | in-repo | active/upcoming ranking, cents, €/l, Berlin dates | D-06 |
| `zod` | ^3.25.76 (already the only dependency) | validate `wasgau-candidates.json` on read (cache) and before write | same validate-before-write discipline as the frozen contract |
| `scraper/io.mjs` `writeAtomic` | in-repo | atomic candidates-file write | DATA-05 pattern |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| A linear regex scanner for the pdfminer XML | `fast-xml-parser` (npm) | A generic XML parser is the textbook "don't hand-roll". But this input is one machine-generated, flat, fully-escaped format (5 entity forms, no CDATA/namespaces/DTD), and the project deliberately has a single dependency. A ~40-line scanner with fixture tests is smaller than the integration. **Recommendation: scanner, no new dependency.** If the planner prefers a library, run the package-legitimacy gate on it first; it is not audited here because it is not recommended. |
| Index-text page selection | Download all 26 `page_N.xml` (~10 MB) | Simpler mentally but ~25× the traffic every new leaflet. The index text comes from the same PDF text layer, so it adds no new failure surface beyond "index shape changed", which maps to `error` anyway. |
| Leaflet window from page-1 index text | Download `page_1.xml` (358 KB decoded) for the header box | The XML gives geometry (top band) but costs a request. The index text contains the same `GÜLTIG VOM … 2026` string. Use the index. Fetch p1 XML only if p1 itself is a Cola page. |
| `epaper/ausgabe.pdf` + a PDF lib | — | Heavy dependency, bigger download; the coords XML *is* the parsed PDF text. Rejected. |

**Installation:** none.

## Package Legitimacy Audit

This phase installs **no external packages**. All functionality uses Node built-ins and in-repo modules, plus the already-installed `zod`.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| *(none added)* | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
 GitHub Actions cron/push ──> node scraper/index.mjs  run({ now, dataDir, fetchOffers, wasgau:{ fetchText, config } })
                                   │
          ┌────────────────────────┴─────────────────────────────┐
          │ try { marktguru }                                     │ if config.enabled:  try { Wasgau }   (sequential, AFTER marktguru)
          ▼                                                       ▼
  fetchOffers() → filter → classify → selectForStore     (1) GET www.wasgau.de/  → parse `var wasgau = {...}`
  catch → overrides[REWE..Kaufland]="error"                     → validate host/id allow-list   ──fail──> throw (shape)
          │                                              (2) read data/wasgau-candidates.json (zod) 
          │                                                   id == cached.leafletId ? ──yes──> skip to (6)
          │                                              (3) GET <link> (index) → page list + page texts
          │                                                   leaflet window ← page-1 text "GÜLTIG VOM … BIS … YYYY" ──none──> throw
          │                                                   colaPages ← pages whose text ~ /coca[\s-]*cola|\bcoke\b/i (cap N)
          │                                              (4) for p of colaPages (sequential): GET <link>epaper/coords/page_p.xml
          │                                                   reconstruct textboxes  (char runs; size≥18 → price tokens)
          │                                              (5) candidates = Cola boxes → pair price (geometry + 1-l-Preis)
          │                                                   → window (box > page-top-band > leaflet) → candidatesDoc (new id)
          │                                              (6) evaluate(candidatesDoc, now, config)  [pure, every run]
          │                                                   shape → selectForStore → probation/ambiguity → needsReview
          │                                                   accept/review with no price → "unpaired" → error
          │                                              catch → overrides.Wasgau = "error"
          ▼                                                       ▼
                 mergeWithPrior(storeResults, overrides, prior, now, { wasgauEnabled })   (5 stores, same 3 paths)
                                   │
                    validate (frozen schema) ──drift──> writeErrorStatus (Wasgau "error" or "unavailable" if disabled) + rethrow
                                   │
        writeAtomic current-offers.json → status.json → (candidates file if produced) → append history (clean offers only)
                                   │
        pipeline.yml: diff → heartbeat → git add data/ (includes wasgau-candidates.json) → commit/push → deploy (copies only 3 files)
```

### Recommended module layout
```
scraper/
├── index.mjs            # run(): adds an independent Wasgau try/catch + candidates write (modified)
├── merge.mjs            # generalized to 5 stores; Wasgau "unavailable" only when disabled (modified)
├── fetch.mjs            # export UA (and optionally a fetchText helper) for reuse (small change)
└── wasgau/
    ├── config.mjs       # ENABLED (kill switch, D-04) + PROBATION (D-12) defaults; overridable via run() opts
    ├── source.mjs       # network seam: homepage → link, index, page XML (withRetry, deadline, size caps, allow-list)
    ├── index-page.mjs   # pure: parse 1kcloud index → [{page, text}], title; pick Cola pages
    ├── coords.mjs       # pure: pdfminer XML → [{id, bbox, text, priceTokens:[{cents,bbox}]}]  (reconstruction)
    ├── pair.mjs         # pure: product box ↔ price token (geometry + 1-l-Preis cross-check) → {cents, status}
    ├── dates.mjs        # pure: German window phrases → {from,to} YYYY-MM-DD; precedence resolution
    ├── candidates.mjs   # pure: build candidatesDoc; zod schema; evaluate(doc, now, config) → StoreOffer|no_offer|throw
    └── build.mjs        # orchestrates source + pure units + cache decision → { result, candidatesDoc|null }
test/
├── scraper.wasgau.coords.test.mjs / .pair.test.mjs / .dates.test.mjs / .candidates.test.mjs / .source.test.mjs
├── scraper.run.test.mjs # every run() call must inject the Wasgau seam (see Pitfall 1)
└── fixtures/wasgau/     # *.xml / *.html copied from research-samples (+ synthesized positive)
```
This is a recommendation within Claude's discretion. Fewer files are fine (e.g. merge `index-page`+`source`), as long as every pure unit is fixture-testable.

### Pattern 1: Index-driven page selection (stop early, D-09/SC4)
**What:** Parse `data-textpos="epaper/coords/page_(\d+)\.xml"` + the following `<div class="text">…</div>` into `[{page, text}]`. Then:
- **Page list missing or empty** → throw (shape change → `error`).
- **Leaflet window** = first match of the leaflet-window regex in the **page-1** text that carries a year → else throw.
- **Cola pages** = pages whose NFKC-normalized text matches `/coca[\s-]*cola|\bcoke\b/i`, sorted ascending, capped (e.g. ≤ 8; more is implausible and indicates a bad parse).
- **Zero Cola pages** → valid leaflet, empty candidates → `no_offer` (D-02). No XML downloaded at all.

**Request budget:** a new leaflet costs homepage + index + k Cola pages (k=2 this week). An unchanged id costs the homepage only.

### Pattern 2: Textbox reconstruction with font-size price tokens
**What:** For each content `<textbox id bbox>…</textbox>` (skip the self-closing ones in `<layout>`), for each `<textline>`, walk `<text …>c</text>` in document order:
- A char **with** `size >= 18` belongs to a *price run*. Extend the run text and union its bbox.
- Any other char (including attribute-less `<text> </text>` / newline nodes) closes the current run. If the run text matches `/^\d{1,3}\.\d{2}$/`, emit a price token `{ cents: Math.round(Number(s)*100), bbox }`. Then append the char to the line text.
- Strip `\r`/`\n`. Join lines: if the accumulated text ends with `<letter>-`, append the next line **without** a space (keeps `Coca-Cola`, `0,5-l-MW-Flaschen`); otherwise join with one space. Then `.normalize("NFKC")` (ligatures `ﬂ`/`ﬁ` → `fl`/`fi`) and collapse whitespace.
- Price tokens are collected **page-wide**, whether they come from a standalone price box or from inside a product box (p1 box 28).

### Pattern 3: Price pairing (geometry + 1-l-Preis cross-check)
Prototyped on p1/p17/p24/p26; produced the correct price for all 3 Cola boxes and all cross-checkable products.

```
adjacent(P) = price tokens T with ONE-axis overlap with P.bbox and edge gap ≤ MAX_GAP (200 pt ≈ 42% page width):
              dx = max(0, T.x0-P.x1, P.x0-T.x1); dy = max(0, T.y0-P.y1, P.y0-T.y1)
              require (dx==0 || dy==0) && dx+dy ≤ MAX_GAP; sort by dx+dy
litres(P)   = caseCount-style "N x V-l" → N·V, else "V-l" (not followed by "-Preis") → V   (V with comma decimal)
lpp(P)      = /1-l-Preis\s+(ab\s+)?(\d+\.\d{2})/   ("ab" ⇒ multi-variant ⇒ treat as no clean cross-check)
consistent  = adjacent filtered by |lppCents·litres − T.cents| ≤ ceil(0.5·litres) + 2
```
Outcome classes (stored per candidate):
| Class | Condition | Emitted |
|-------|-----------|---------|
| `clean` | lpp present (no "ab") and **exactly one** consistent token | that price; normal offer after probation |
| `ambiguous` | ≥2 consistent tokens (pick nearest), or lpp absent/"ab" and ≥1 adjacent (pick nearest) | best guess, `needsReview:true` (D-13) |
| `mismatch` | lpp present, 0 consistent, ≥1 adjacent | nearest, `needsReview:true` (D-13) |
| `unpaired` | 0 adjacent tokens | no price. If the candidate's verdict is accept/review → Wasgau **`error`** (SC3 "no price pairing") |

**Do NOT** use "mutual-nearest exclusion" (drop a token if another product box is closer) as the primary rule. In the prototype it stole granini's `1.69` for Sinalco and left granini unpaired. Use it at most as a tie-breaker inside `ambiguous`. A 12×1L Cola case always has `litres` (from `caseCount`, ≥12). PAngV makes the per-litre price mandatory in retail advertising `[CITED: verbraucherzentrale.de Grundpreis article; IHK Grundpreisangabe]`, so for real positives the cross-check is expected to be present.

### Pattern 4: Validity window resolution (D-08)
Precedence: **(a)** a window phrase inside the candidate's own box text → **(b)** a window phrase in a textbox in the page's **top band** (`y0 ≥ 0.9 × pageHeight`, from `<page bbox>`) of that Cola page (p24/p25 style) → **(c)** the leaflet window from the page-1 index text. Boxes elsewhere on the page are ignored (the p1 coupon box 4 must not leak).

Parse two families (case-insensitive, NFKC text, bounded quantifiers):
- Word-month: `(?:GÜLTIG\s+)?VOM\s+(?:[A-ZÄÖÜa-zäöü]{2,10}\s+)?(\d{1,2})\.\s*(?:([A-Za-zÄÖÜäöü]{3,9})\s*(\d{4})?\s*)?BIS\s+(?:[A-ZÄÖÜa-zäöü]{2,10}\s+)?(\d{1,2})\.\s*([A-Za-zÄÖÜäöü]{3,9})\s*(\d{4})?`
- Numeric: `(\d{1,2})\.(\d{1,2})\.(\d{2,4})?\s*(?:bis|–|-)\s*(?:[A-Za-zäöü]{2,10}\s+)?(\d{1,2})\.(\d{1,2})\.(\d{2,4})?`

Rules:
- German month map: januar…dezember, incl. `märz`/`maerz`.
- A missing "from" month inherits the "to" month. If fromDay > toDay in that case, step back one month ("VOM 28. BIS 3. OKTOBER" → 28 Sept).
- A missing year comes from the leaflet window. Pick the year in {Y-1, Y, Y+1} closest to the leaflet `from` (handles the Dec/Jan rollover).
- Reject windows with `to < from` or a length > 31 days (→ fall to the next precedence level; a leaflet-level failure → throw).
- Output `YYYY-MM-DD`. These are already Berlin calendar dates; never pass them through a UTC slice.

### Pattern 5: Shaping candidates for the existing selector (D-06/D-14)
`selectForStore(candidates, now)` classifies via `normalize(offer)` (brand.name + product.name + product.description + description). It reads decimal-euro `price` and ISO `validityDates[].from/to` through `berlinDay()`. So shape each candidate as:
```js
{ store: "Wasgau", description: c.text, price: c.priceCents / 100,
  validityDates: [{ from: `${c.validFrom}T12:00:00Z`, to: `${c.validTo}T12:00:00Z` }] }
```
Noon UTC is the same calendar day in Europe/Berlin under both CET and CEST, so `berlinDay()` round-trips the date exactly. Then:
1. Drop candidates whose verdict is `reject`, or which have no `priceCents`.
2. If any **accept/review** candidate is `unpaired` → throw (error).
3. Run `selectForStore` on the `clean` accepts first. If none yields an offer, run it on the remaining (ambiguous/mismatch accepts + reviews) and force `needsReview: true`.
4. If `config.probation` → force `needsReview: true` on any offer.

`needsReview` offers are excluded from history by `dedup.mjs:35` (`.filter((o) => o.status === "offer" && !o.needsReview)`) and from the hero by `derive.js:36` (`const isCleanOffer = (o) => o?.status === "offer" && !o?.needsReview;`) `[VERIFIED: both read this session]`.

### Pattern 6: Candidate/cache file (D-10/D-11), deterministic for clean diffs
Recommended shape (validated by a local zod schema on read and before write; an invalid/missing file = cache miss, never an error):
```json
{
  "leafletId": "ep1rP1V0",
  "leafletUrl": "https://wasgau-dlog.1kcloud.com/ep1rP1V0/",
  "title": "WASGAU Prospekt ab 12.10.",
  "leafletWindow": { "from": "2026-10-12", "to": "2026-10-17" },
  "colaPages": [17, 26],
  "candidates": [
    { "page": 17, "box": 14, "bbox": [23.0, 216.2, 101.3, 268.0],
      "text": "*Coca Cola1) oder *Coca Cola Zero 1) und weitere Sorten je 6 x 1-l-MW-Glasflaschen, …",
      "priceCents": 899, "pairing": "clean", "adjacentCents": [899],
      "unitPriceCents": 150, "litres": 6,
      "validFrom": "2026-10-12", "validTo": "2026-10-17", "windowSource": "leaflet",
      "verdict": "reject" }
  ]
}
```
- **No per-run timestamps.** The file changes only when the leaflet id or a recomputed `verdict` changes. `verdict` is rewritten each run from the current matcher (D-06 keeps it truthful); with an unchanged matcher the bytes are identical, so there is no git churn.
- Sort candidates by (page, box). Use fixed key order, 2-space indent, trailing newline (matches the other `data/*.json`).
- Write the file whenever a leaflet was parsed successfully, **including** when evaluation yields `error` due to an unpaired accept. The maintainer then sees the near-miss, and the cache stops 14 re-downloads/week of a broken parse.
- Never write it when fetching/parsing the new leaflet failed. The old cache (old id) stays, and the next run retries the download.

### Pattern 7: Generalized merge (D-01/D-03) and run() reshape
- `mergeWithPrior(storeResults, statusOverrides, prior, now, { wasgauEnabled = true } = {})` loops over all 5 stores with the existing three paths (warm error / cold error / refresh). When `!wasgauEnabled`, Wasgau keeps the old fixed-`unavailable` behaviour (`merge.mjs:90-98` today).
- **Treat a prior Wasgau entry whose `status === "unavailable"` as "no prior"** (cold-start path). Otherwise the first post-deploy Wasgau error would carry `unavailable` verbatim into current-offers next to `error` in status (Pitfall 2).
- `run()` in `index.mjs`: after the marktguru loop, `if (wasgauCfg.enabled)`, call `buildWasgau(...)` in its own try/catch. The catch logs `err.message` and sets `statusOverrides.Wasgau = "error"`. When the result is fine, set `storeResults.Wasgau = result`. Thread `wasgauEnabled` into merge and into `writeErrorStatus` (Wasgau `"error"` when enabled, `"unavailable"` when disabled).
- Write order: `current-offers.json` → `status.json` → `wasgau-candidates.json` (if produced) → history append. Validation of the two frozen docs still precedes **all** writes.

### Pattern 8: Config flags (D-04/D-12)
**Recommendation:** `scraper/wasgau/config.mjs` exporting `export const WASGAU_DEFAULTS = { enabled: true, probation: true }`, overridable through `run({ wasgau: { config } })` for tests. Flipping a flag is a one-line commit in the GitHub web editor. The push trigger then runs the pipeline immediately.
- CONTEXT D-04 says "without a code change". If the user reads that strictly, use the alternative: read `process.env.WASGAU_ENABLED` / `WASGAU_PROBATION` in `pipeline.yml` from GitHub repository **variables** (`${{ vars.WASGAU_ENABLED }}`), with unset meaning the defaults. That is a UI toggle with no commit. It also adds hidden, non-versioned state, so it is flagged as an assumption (A3) for confirmation.

### PWA changes (D-16/D-17)
- `web/src/chart/history.js:35`: `export const STORES_WITH_LINES = ["REWE", "Edeka", "Lidl", "Kaufland"];` → add `"Wasgau"`.
- Add `Wasgau` to `LINE_COLORS` (`history.js:130-135`: `REWE: "#C2143C"`, `Edeka: "#1B5FB0"`, `Lidl: "#0B7A3B"`, `Kaufland: "#7A3FB0"`). Pick a colour distinguishable from those four and from the amber warning token `--color-warning: #9a5b00` (`styles.css:22`). A teal like `#00838F` is one option `[ASSUMED: aesthetic choice, UI checker/user to confirm]`.
- Pass the kill-switch state from data, not config. In `web/src/main.js:106`, replace `await renderHistory(graph, data.history ?? []);` with a call that also passes `{ wasgauUnavailable: stores.find((s) => s.store === "Wasgau")?.status === "unavailable" }`.
  - When it is true: exclude Wasgau from the series and render the existing greyed legend item (`history.js:214-228`).
  - When it is false: Wasgau is a normal swatch item.
  - `prepareChartData` needs a parameter (or a `lineStores()` helper) for the 4-vs-5 store list.
- Card label: `toStoreOffer` sets `displayName: store` (`normalize.mjs:49`), so it is plain "Wasgau" automatically (D-17).
- `?state=unavailable` dev fixture (`main.js:47`) keeps demonstrating the kill-switch look.

### Anti-Patterns to Avoid
- **Classifying the index `.text` (flattened page text):** it merges neighbours. On p17 it would see the Sinalco "12 x 1-l" next to "Coca Cola". Use it for page discovery and the leaflet window only.
- **Nearest-box-only pairing:** fails the 0,33 can (wrong 8.99 is closer) and steals neighbours' prices.
- **Using the strike price:** `10.99 -18%` is size 11 and lives in its own box. The size threshold excludes it. Never pick "the first number in a nearby box".
- **Taking any 1kcloud link from the page:** the Dudenhofen page links an unrelated 2024 doc.
- **Per-run timestamps in the candidates file:** guaranteed churn commits and noisy history.
- **Calling the network in default test paths:** existing `run()` tests don't inject a Wasgau seam (Pitfall 1).
- **Editing the frozen contract:** not needed. `unavailable` stays, Wasgau is already a `StoreKey`, `needsReview` exists.

## Integration Points (exact, read this session)

| File | Lines | Current (verbatim) | Change |
|------|-------|--------------------|--------|
| `scraper/index.mjs` | 45-47 | `// The four marktguru-fed stores swept on a total fetch failure (Wasgau is fixed` / `// "unavailable" and never an error — D-03).` / `const MARKTGURU_STORES = ["REWE", "Edeka", "Lidl", "Kaufland"];` | keep the list; update the comment (Wasgau now independent) |
| `scraper/index.mjs` | 86-99 | `writeErrorStatus`: `{ store: "Wasgau", status: "unavailable", lastUpdated: nowIso }, // fixed (D-03)` | Wasgau `"error"` when enabled, `"unavailable"` when disabled |
| `scraper/index.mjs` | 110-114 | `export async function run({ now = systemNow(), dataDir = DEFAULT_DATA_DIR, fetchOffers = realFetchOffers, } = {})` | add a `wasgau = {}` option (`{ fetchText, config }`) |
| `scraper/index.mjs` | 151-157 | `mergeWithPrior(storeResults, statusOverrides, prior, now)` | insert the Wasgau try/catch before it; pass `{ wasgauEnabled }` |
| `scraper/index.mjs` | 188-199 | write order current-offers → status → `appendLines(historyPath, lines)` | add the candidates-file write before the history append |
| `scraper/merge.mjs` | 28-29 | `const MARKTGURU_STORES = ["REWE", "Edeka", "Lidl", "Kaufland"];` | loop over all 5 (import `STORES` from `contract/schema.mjs:20`: `export const STORES = ["REWE", "Edeka", "Lidl", "Kaufland", "Wasgau"];`) |
| `scraper/merge.mjs` | 58-76 | warm-error path: `if (priorOffer) { offerStores.push({ ...priorOffer }); …` | add the guard `priorOffer && priorOffer.status !== "unavailable"` |
| `scraper/merge.mjs` | 90-98 | `offerStores.push({ store: "Wasgau", displayName: "Wasgau", status: "unavailable" });` … `lastUpdated: priorWasgau?.lastUpdated ?? nowIso` | only when `!wasgauEnabled` |
| `scraper/fetch.mjs` | 20, 27, 32, 53 | `const UA = "colaapp-scraper/0.1 (personal, low-volume)";` · `const PER_ATTEMPT_TIMEOUT_MS = 10_000;` · `const TOTAL_DEADLINE_MS = 20_000;` · `export async function withRetry(fn, { retries = 2, baseMs = 1000, deadline } = {})` | export `UA` for reuse. The Wasgau source uses its own deadline (e.g. 60 s); per-attempt 10 s suffices (p17 took 455 ms) |
| `scraper/filter.mjs` | 6-17 | `SLUG_TO_STORE = { rewe: "REWE", edeka: "Edeka", lidl: "Lidl", kaufland: "Kaufland", }` | **no change** (Wasgau stays absent; only the comment's D-03 wording becomes stale) |
| `scraper/select.mjs` | 67 | `export function selectForStore(candidates, now)` | reuse as-is |
| `scraper/dedup.mjs` | 35 | `.filter((o) => o.status === "offer" && !o.needsReview) // Pitfall 4` | reuse as-is (needsReview never in history) |
| `contract/schema.mjs` | 20, 25 | `STORES = ["REWE", "Edeka", "Lidl", "Kaufland", "Wasgau"]` · `STATUS_VALUES = ["offer", "no_offer", "unavailable", "error"]` | **no change** |
| `contract/matcher.mjs` | 57, 67, 71 | `NX1L = /(^|[^\d])(\d{1,2})\s*x\s*(je\s*)?1\s*-?\s*l(iter)?\b/` · `WRONG_SIZE = /(1,25|0,5|0,33|0,2|\bdose\b|\bds\.)/` · `COCA_COLA_BRAND = /coca[\s-]?cola/` | **no change** (D-14). Note `[\s-]?` allows ONE separator, hence the de-hyphenation rule |
| `web/src/chart/history.js` | 35, 130-135, 137-139, 193-231, 248-249 | `STORES_WITH_LINES`, `LINE_COLORS`, `const WASGAU = "Wasgau";`, `renderLegend(container)`, `renderHistory(container, historyLines)` | 5th line, colour, conditional legend |
| `web/src/main.js` | 106 | `await renderHistory(graph, data.history ?? []);` | pass the Wasgau-unavailable flag |
| `.github/workflows/pipeline.yml` | 70, 85, 134 | `if git diff --quiet -- data/ ':!data/heartbeat.json'; then` · `git add data/` · `cp data/current-offers.json data/status.json data/price-history.jsonl web/public/data/` | **No functional change required.** `git add data/` already commits the new file, and the deploy copies only the 3 PWA files. Optional: add `':!data/wasgau-candidates.json'` to the diff for intent clarity. In practice `status.json`'s top-level `lastUpdated` bumps every run (`merge.mjs:100-102`), so `data_changed` is already true on every successful run |
| `test/scraper.merge.test.mjs` | 96-115 | "Wasgau stays unavailable under a total-failure override map (D-03)", "Wasgau per-store lastUpdated carries from prior…" | rewrite for D-01/D-03/D-04 semantics |
| `test/scraper.run.test.mjs` | 68-77, 169, 190, 241 | `assert.equal(find(co, "Wasgau").status, "unavailable");` (cases A, D, E, G) | inject the Wasgau seam; add Wasgau cases |
| `web/test/chart.test.mjs` | 76-81 | `"prepareChartData lines up four line-stores and excludes Wasgau"`, `assert.equal(out.data.length, 5);` | 5 line-stores → `data.length` 6; kill-switch variant keeps 4 |
| `.planning/REQUIREMENTS.md` | 32 | HIST-03 "…Wasgau has none — always unavailable" | doc amendment (Wasgau line, kill-switch exception) |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP retries/timeouts | a new retry loop | `withRetry` (`scraper/fetch.mjs:53`) + `AbortSignal.timeout` deadline | already handles the fired-signal reuse bug (undici #1926) and the deadline |
| gzip decoding | `zlib` plumbing | native `fetch` auto-decode | verified on the live endpoint |
| 12×1L decision | a Wasgau-specific regex | `classify()` / `caseCount()` | D-14; the verdicts on real text are verified |
| Active/upcoming/lowest selection + cents/€-l | a Wasgau selector | `selectForStore` / `toStoreOffer` via offer shaping | one ranking rule for all stores |
| Atomic writes | `fs.writeFile` directly | `writeAtomic` (`scraper/io.mjs:67`) | crash-safe |
| Cache/candidate validation | ad-hoc `typeof` checks | a zod schema (dependency already present) | a tampered/corrupt cache becomes a cache miss, deterministically |
| OCR / PDF parsing | tesseract, pdf.js | the 1kcloud coords XML (already the PDF text layer) | CLAUDE.md forbids OCR; the text layer is present |

**Key insight:** the "hard" parts (classification, selection, normalization, carry-forward) already exist. This phase is an adapter plus a geometry heuristic. Keep the new code to the adapter and prove the heuristic on real fixtures.

## Common Pitfalls

### Pitfall 1: Existing `run()` tests silently hit the network
**What goes wrong:** cases A–G call `run({ now, dataDir, fetchOffers })` without a Wasgau seam. With the source enabled by default, they would fetch wasgau.de in CI tests (flaky, slow, impolite).
**How to avoid:** give `run()` a `wasgau: { fetchText, config }` option and update **every** existing call (or add a tiny default stub in the test file, e.g. `fetchText` that throws or serves fixtures). Add an explicit test asserting that the default test path never calls the real network. The simplest guard is a stub that records URLs.
**Warning signs:** `npm test` slower than ~5 s, or failing offline.

### Pitfall 2: Prior `unavailable` carried forward as error data
**What goes wrong:** the warm-error path copies the prior entry verbatim. The committed `data/current-offers.json` has Wasgau `{"status":"unavailable"}` today, and `data/status.json` has Wasgau `lastUpdated: "2026-06-15T04:00:00Z"` `[VERIFIED: read this session]`. If the first post-deploy Wasgau run fails, current-offers keeps `unavailable` while status says `error`. That is inconsistent, and the card would show "nicht automatisch verfügbar".
**How to avoid:** treat prior `unavailable` as no prior → cold-start error (`no_offer` + `error`, synthetic `lastUpdated: now`). Unit-test it.

### Pitfall 3: Line-join hyphenation breaks the brand gate
**What goes wrong:** `COCA_COLA_BRAND = /coca[\s-]?cola/` allows one separator. `Coca- Cola` (naive space join) → reject. Verified: `NAIVE-SPACE-JOIN reject` vs `HYPH Coca-Cola Zero je 12 x 1-l-PET-Flaschen accept`.
**How to avoid:** join without a space after a trailing `<letter>-`. Fixture-test a split `Coca-`/`Cola` box.

### Pitfall 4: Picking the nearest price box
**What goes wrong:** 0,33 can → 8.99 (the glass price) because it is closer. A Bitburger-style 2-variant box has two prices.
**How to avoid:** use the 1-l-Preis cross-check first (Pattern 3). Classify as `ambiguous`/`mismatch` → needsReview instead of guessing silently.

### Pitfall 5: Price glyphs merged into product boxes
**What goes wrong:** pdfminer sometimes puts the big price in the same textline as product text (p1 box 28). A "price box = box whose whole text is a price" rule misses it.
**How to avoid:** extract price tokens at the char level by `size >= 18`. Remove them from the product text.

### Pitfall 6: Coupon/monthly windows applied to the wrong offers
**What goes wrong:** p1 has `Donnerstag 15.10. bis Samstag 17.10.` (app coupon) mid-page, and p8 has `GÜLTIG VOM 1. BIS 31. OKTOBER` (monthly special). Applying any date found on the page would mis-date neighbours.
**How to avoid:** use only (a) the candidate's own box text, (b) the page top band (y0 ≥ 0.9·H), (c) the leaflet window.

### Pitfall 7: Glyph dropout in the text layer
**What goes wrong:** some fonts lack Unicode maps (p20: `Aktionszeitrum`, `Kuf`, `2.0.`). A Cola offer set in such a font is invisible, which gives a false `no_offer`. A dropped digit in a price gives a cross-check `mismatch`.
**How to avoid:** this cannot be fixed without OCR (out of scope). The cross-check turns a corrupted price into needsReview instead of a wrong clean price. Document it as a residual risk.

### Pitfall 8: CRLF in fixtures on the Windows dev machine
**What goes wrong:** `git config core.autocrlf` is `true` here `[VERIFIED]`. Committed LF `.xml` fixtures check out as CRLF on Windows, while CI (Linux) and live data are LF. Text nodes like `<text>\r\n</text>` would leave `\r` in the reconstructed text.
**How to avoid:** normalize input with `xml.replace(/\r\n?/g, "\n")` at parse entry, and/or add `.gitattributes` (`test/fixtures/** -text`).

### Pitfall 9: Helper `.mjs` files under `test/` run as tests
**What goes wrong:** the root `npm test` = `node --test`, whose default patterns include `**/test/**/*.{cjs,mjs,js}` `[CITED: nodejs.org/docs/latest-v22.x/api/test.html]`. A `test/fixtures/wasgau/build-positive.mjs` helper would execute as a test file. Root `node --test` currently runs 169 tests, which **includes the 57 `web/test` tests** `[VERIFIED: ran both suites this session]`.
**How to avoid:** fixtures as `.xml`/`.html`/`.json` only. Put helpers in a `*.test.mjs` file or outside `test/`.

### Pitfall 10: Cache poisoning / stale cache on partial failure
**What goes wrong:** writing the new `leafletId` before all Cola pages parsed means a later run skips the download and reuses an incomplete candidate list.
**How to avoid:** produce the candidatesDoc only after every selected page parsed. Write it through `writeAtomic` in the orchestrator write phase. Any throw before that leaves the old cache, and the next run retries.

### Pitfall 11: Untrusted link → arbitrary fetch
**What goes wrong:** the angebotslink comes from a third-party page. Following it blindly lets a hijacked page steer the runner anywhere.
**How to avoid:** allow-list `^https://wasgau-dlog\.1kcloud\.com/([A-Za-z0-9]{4,32})/$`. Build all further URLs from the validated id plus integer page numbers (1..200). Cap response sizes (e.g. reject a decoded body > 5 MB) and the page count.

### Pitfall 12: Leaflet published ahead of validity
**What goes wrong:** the index `Last-Modified` was 05.10 for a 12.10 leaflet. If the homepage switches early, the parsed window is in the future.
**How to avoid:** nothing special. `selectForStore` treats it as upcoming and the PWA shows it as upcoming (D-07). Test an upcoming fixture.

## Code Examples

### Homepage link extraction (pattern)
```js
// Source: live markup on https://www.wasgau.de/ (2026-10-12), see research-samples/wasgau-homepage.excerpt.html
const LINK_RE = /var\s+wasgau\s*=\s*(\{[^<;]{0,500}\})\s*;/;      // bounded, linear
const ALLOWED = /^https:\/\/wasgau-dlog\.1kcloud\.com\/([A-Za-z0-9]{4,32})\/$/;
export function parseLeafletLink(html) {
  const m = html.match(LINK_RE);
  if (!m) throw new Error("wasgau.de: angebotslink script not found");
  const link = JSON.parse(m[1])?.angebotslink;                     // never eval
  const id = typeof link === "string" ? link.match(ALLOWED)?.[1] : null;
  if (!id) throw new Error("wasgau.de: angebotslink not an allowed 1kcloud URL");
  return { id, url: `https://wasgau-dlog.1kcloud.com/${id}/` };
}
```

### Index page → page texts
```js
// Source: research-samples/wasgau-ep1rP1V0-index.excerpt.html (real)
const PAGE_RE = /data-textpos="epaper\/coords\/page_(\d{1,3})\.xml">\s*<div class="text">([^<]*)<\/div>/g;
export function parseIndex(html) {
  const pages = [...html.matchAll(PAGE_RE)].map((m) => ({ page: Number(m[1]), text: decode(m[2]).normalize("NFKC") }));
  if (!pages.length) throw new Error("1kcloud index: no searchable pages");
  return pages; // decode = the 5 XML/HTML entities + numeric refs
}
```

### Reconstruction core (prototype that produced the findings tables)
```js
// Source: prototype run this session against live page_{1,17,24,26}.xml
const PRICE_MIN_SIZE = 18;
for (const box of xml.matchAll(/<textbox id="(\d+)" bbox="([^"]+)">([\s\S]*?)<\/textbox>/g)) {
  for (const line of box[3].matchAll(/<textline bbox="[^"]+">([\s\S]*?)<\/textline>/g)) {
    for (const t of line[1].matchAll(/<text(?: font="[^"]*" bbox="([^"]*)" size="([^"]*)")?>([\s\S]*?)<\/text>/g)) {
      // size >= 18 → extend price run (union bbox); else close run (emit if /^\d{1,3}\.\d{2}$/) and append char
    }
  }
}
// line join: /[A-Za-zÄÖÜäöüß]-$/.test(acc) ? acc + next : acc + " " + next; then .normalize("NFKC")
```
Note: the `<text>` attribute order observed is `font`, `bbox`, `size`. Make the scanner attribute-order-tolerant (parse attributes with a small `/(\w+)="([^"]*)"/g` loop) so a pdfminer version bump does not break it.

### Verified matcher verdicts on real reconstructed text
```
p17 box10 reject count 12   | Sinalco Aquintéll* verschiedene Sorten, je 12 x 1-l-MW-Flaschen, zzgl. 3.30 Pfand, 1-l-Preis 0.42
p17 box14 reject count 6    | *Coca Cola1) oder *Coca Cola Zero 1) und weitere Sorten je 6 x 1-l-MW-Glasflaschen, …
p17 box17 reject count null | Coca Cola1), Fanta oder Mezzo Mix1) und weitere Sorten je 0,33-l-Dose, …
p26 box36 reject count null | Coca Cola 1) versch. Sorten, je 2-l-PET-Flasche, zzgl. 0.25 Pfand, 1-l-Preis 0.75, …
SYNTH accept 12             | Coca Cola1), Fanta, Sprite oder Mezzo Mix1) und weitere Sorten, Kiste mit je 12 x 1-l-MW-PET-Flaschen, …
```
`[VERIFIED: node script importing contract/matcher.mjs, run this session]`

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Wasgau fixed `unavailable` (Phase 2 D-03) | Leaflet text-layer source with `offer`/`no_offer`/`error` + kill switch | This phase | merge/index/web/tests change; contract unchanged |
| Download all leaflet pages | Index-text page discovery, then only Cola pages | Research finding | ~25× less traffic per new leaflet |

**Deprecated/outdated in-repo comments to update:** `scraper/filter.mjs` header (D-03 wording), `scraper/index.mjs:45-46`, `scraper/merge.mjs:23-24`, `web/src/chart/history.js:12-13,29-32,129,137`. The `contract/schema.mjs:12` comment ("Wasgau absent -> status unavailable") is in the frozen contract. Leave it, or edit the comment only with a note.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | wasgau.de and wasgau-dlog.1kcloud.com are reachable from GitHub-hosted runners (Azure IPs). Probed only from the dev machine; marktguru famously 403s some environments | Environment | Wasgau would be `error` every run; needs a `workflow_dispatch` verification run before closing the phase |
| A2 | The index `.text` divs and `data-textpos` attributes stay present in future weekly leaflets (one leaflet observed) | Pattern 1 | Shape change → `error` (fail-loud, D-01); fallback is fetching all pages |
| A3 | The kill switch / probation as a committed config constant satisfies D-04 "without a code change" (vs. GitHub repo variables) | Pattern 8 | If the user wants a no-commit toggle, switch to `vars.*` env in `pipeline.yml` |
| A4 | A real Wasgau 12×1L Coca-Cola offer will be typeset like the other Getränkemarkt items (product box + size-32.6 price + `1-l-Preis`) | Pattern 3 | Pairing may fall into `ambiguous`/`unpaired`. Probation (D-12) + candidates file make this visible |
| A5 | Price glyph sizes stay ≥18 pt and match `\d{1,3}\.\d{2}` (one leaflet observed: 32.637/21.170) | Pattern 2 | A different template → `unpaired` → `error` (loud). Threshold is one constant |
| A6 | Node 22's undici fetch auto-decodes gzip like the probed Node 24 | Live Findings §3 | Garbled XML → parse error → `error`; trivially caught by the first CI run |
| A7 | Teal `#00838F` (or similar) is an acceptable 5th line colour | PWA changes | Cosmetic only |
| A8 | `MAX_GAP` 200 pt and the cross-check tolerance `ceil(0.5·L)+2` cents generalize beyond the 4 probed pages | Pattern 3 | Mis-classification → needsReview (safe direction), not a wrong clean price |

## Open Questions (RESOLVED)

1. **Kill-switch storage (D-04 "without a code change").**
   - What we know: a constant/JSON flag needs a commit (web editor, one line); repo variables need no commit but add hidden state.
   - Recommendation: constant in `scraper/wasgau/config.mjs` (A3). Confirm with the user at plan review.
   - RESOLVED: committed constant `WASGAU_CONFIG = Object.freeze({ enabled: true, probation: true })` in `scraper/wasgau/config.mjs` (Plan 05-03 Task 1, D-04/D-12); its header comment records the versioned-over-hidden-state rationale and the one-line flip procedure.
2. **Runner reachability (A1).**
   - Recommendation: the final plan includes a `workflow_dispatch` run of `pipeline.yml` (or a temporary `diagnose.yml` step running only the Wasgau source and printing the candidates) as a human-verify checkpoint.
   - RESOLVED: Plan 05-05 Task 2 makes `diagnose.yml` print `data/wasgau-candidates.json` and carries the end-of-phase `<human-check>` (diagnose run + post-push pipeline run + live PWA), with the kill switch as the fallback.
3. **What a real positive looks like (CONTEXT "specifics").**
   - Recommendation: probation ON by default. Plan a later manual task: "after the first real candidate with verdict accept appears in `data/wasgau-candidates.json`, verify it against the leaflet image and flip probation off". This is not part of this phase's automated scope.
   - RESOLVED: probation defaults ON (D-12, `WASGAU_CONFIG.probation`, Plan 05-03); flipping it off after eyeballing a real accept candidate is a post-phase maintainer action documented in the `config.mjs` header, not phase scope.
4. **Multi-variant Cola box ("6 x 1-l-Glas … oder Kiste mit je 12 x 1-l-PET").**
   - What we know: `classify` uses the **first** `NX1L` match, so such a box would read as count 6 → reject. That is a false negative, still captured in candidates as a near-miss.
   - Recommendation: accept for now (D-14 "matcher as-is"). The candidates file makes it visible. Revisit only if observed.
   - RESOLVED: accepted as-is (D-14, matcher unchanged); Plan 05-01 Task 2 records the assumption in the `scraper/wasgau/leaflet.mjs` header comment, and the near-miss stays visible in `data/wasgau-candidates.json`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | scraper + tests | ✓ (dev) / ✓ CI via `actions/setup-node@v6` `node-version: 22` | dev v24.15.0; CI 22 | — |
| npm / zod | candidates schema | ✓ | zod ^3.25.76 | — |
| Network: www.wasgau.de | link discovery | ✓ from dev machine (HTTP/2 200) | — | none; failure → `error` (D-01) |
| Network: wasgau-dlog.1kcloud.com | index + coords XML | ✓ from dev machine (200, gzip) | — | none; failure → `error` |
| GitHub runner → both hosts | production | **unverified** (A1) | — | verify via workflow_dispatch |

**Missing dependencies with no fallback:** none locally. Runner reachability is unverified.
**Missing dependencies with fallback:** none.

## Validation Architecture

> `.planning/config.json` has `workflow.nyquist_validation: false`. This section is included anyway because the orchestrator explicitly requested it.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node built-in test runner (`node:test` + `node:assert/strict`) |
| Config file | none (`package.json` `"test": "node --test"`; `web/package.json` `"test": "node --test"`) |
| Quick run command | `node --test test/scraper.wasgau.*.test.mjs` (root) |
| Full suite command | `npm test` (root; also discovers `web/test`, 169 tests today) and `cd web && npm test` (57 tests) |

### Phase Requirements → Test Map
| Req | Behavior | Test Type | Automated Command | File Exists? |
|-----|----------|-----------|-------------------|-------------|
| SC1 | synthesized-from-real 12×1L Coca-Cola box → offer with correct cents, €/l (caseCount), window | unit + run() e2e | `node --test test/scraper.wasgau.candidates.test.mjs test/scraper.run.test.mjs` | ❌ Wave 0 |
| SC2 | p17/p26 negatives reconstruct + pair (899, 79, 149) + reject; p1 merged price token; p24 left/right pairing; Bitburger → ambiguous | unit | `node --test test/scraper.wasgau.coords.test.mjs test/scraper.wasgau.pair.test.mjs` | ❌ Wave 0 |
| SC2 | leaflet window `GÜLTIG VOM 12. BIS 17. OKTOBER 2026` → 2026-10-12..17; p24 top-band page window; p1 coupon box NOT applied; cross-month/year rollover | unit | `node --test test/scraper.wasgau.dates.test.mjs` | ❌ Wave 0 |
| SC3/D-01 | Wasgau seam throws → Wasgau error, marktguru stores unaffected; warm carry-forward; prior `unavailable` → cold-start path | unit (merge) + e2e | `node --test test/scraper.merge.test.mjs test/scraper.run.test.mjs` | ✅ (needs edits) |
| D-03 | marktguru total failure → Wasgau unaffected | e2e | same | ✅ (edit) |
| D-04 | kill switch → no fetch calls, Wasgau `unavailable` both files, writeErrorStatus uses unavailable | e2e | same | ✅ (edit) |
| D-05/D-06 | unchanged id → exactly 1 request (homepage); re-evaluation vs `now` expires an offer → `no_offer`; lastUpdated bumps | e2e with URL-recording stub | `node --test test/scraper.run.test.mjs` | ❌ new cases |
| D-11 | candidates file deterministic (byte-identical on rerun), zod-valid, written only after a full parse | unit + e2e | `node --test test/scraper.wasgau.candidates.test.mjs` | ❌ Wave 0 |
| D-12/D-13 | probation → needsReview; ambiguous/mismatch → needsReview; needsReview not in history | unit + e2e | same | ❌ Wave 0 |
| SC4 | requests strictly sequential, UA header set, only Cola pages fetched, allow-list rejects foreign host | unit (source with fake fetch) | `node --test test/scraper.wasgau.source.test.mjs` | ❌ Wave 0 |
| D-16 | 5 line-stores; kill-switch flag → 4 + greyed legend | unit | `cd web && npm test` | ✅ (edit `chart.test.mjs:76-81`) |
| A1 | live runner reachability + real parse | manual / CI | `workflow_dispatch` pipeline run, inspect `data/wasgau-candidates.json` | manual checkpoint |

### Sampling Rate
- **Per task commit:** the quick command for the touched unit + `node --test test/scraper.run.test.mjs`
- **Per wave merge:** `npm test` (root, includes web) and `cd web && npm test`
- **Phase gate:** both suites green, plus one live `workflow_dispatch` run before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/fixtures/wasgau/` — copy from `research-samples/` + a synthesized-from-real positive (`page_17` box 10 geometry, Coca-Cola text, consistent 1-l-Preis)
- [ ] `test/scraper.wasgau.coords.test.mjs`, `…pair.test.mjs`, `…dates.test.mjs`, `…candidates.test.mjs`, `…source.test.mjs`
- [ ] URL-recording `fetchText` stub inside `test/scraper.run.test.mjs` (not a separate `.mjs` under `test/`, see Pitfall 9)
- [ ] `.gitattributes` entry or CRLF normalization (Pitfall 8)

## Security Domain

`security_enforcement: true`, ASVS level 1.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | public, unauthenticated endpoints; no credentials involved |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | **yes** | untrusted HTML/XML: bounded linear regexes (no nested quantifiers, ReDoS), `JSON.parse` never `eval`, host/id allow-list, integer page bounds, response size cap, zod schema for the candidates file on read and write, frozen-schema validation before writing the PWA docs |
| V6 Cryptography | no | — |
| V7 Error/Logging | yes | log `err.message` only. Never log homepage HTML (it contains a third-party Mapbox token) or full XML |
| V12 Files/Resources | yes | URLs built only from the validated id + integer page; atomic writes only inside `dataDir` |
| V14 Configuration | yes | no new secrets; kill-switch/probation are non-secret |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Hijacked/altered homepage steers the fetch (SSRF-like) | Tampering / Elevation | strict allow-list `wasgau-dlog.1kcloud.com/<[A-Za-z0-9]{4,32}>/`; no redirects to other hosts (check `res.url` host, or `redirect: "error"`) |
| Oversized / decompression-bomb response | DoS | per-attempt timeout (10 s), total deadline, decoded-length cap (e.g. 5 MB), page-count cap |
| ReDoS via crafted text | DoS | linear regexes with bounded classes (`[^<]*`, `{1,3}`), as the matcher already does |
| Poisoned cache file in repo | Tampering | zod-validate on read; invalid → cache miss → re-download; candidates never reach the PWA |
| Leaflet text injected into the PWA | XSS | StoreOffer has no free-text fields; the PWA is textContent-only; the candidates file is not served (deploy copies only 3 files, `pipeline.yml:134`) |
| Impolite load on a third party | (ToS/abuse) | sequential requests, descriptive UA (reuse `colaapp-scraper/0.1 (personal, low-volume)`, optionally add the repo URL as contact), id-cache (1 request/run), index-driven page selection |

## Sources

### Primary (HIGH confidence)
- Live probes this session: `https://www.wasgau.de/`, `/maerkte/wasgau-frischemarkt-dudenhofen/`, `/robots.txt`, `/wp-json/wasgau/v1/` (+ `/products?search=coca`, `/markets`), `wa-prospekt-link.js`; `https://wasgau-dlog.1kcloud.com/ep1rP1V0/` (index), `epaper/coords/page_{1,17,24,26}.xml`, `/robots.txt` (404)
- Code read this session: `scraper/{index,merge,fetch,select,normalize,filter,dedup,io,clock}.mjs`, `contract/{schema,matcher}.mjs`, `contract/types.d.ts`, `web/src/chart/history.js`, `web/src/main.js`, `web/src/render/card.js` (labels), `web/src/derive/derive.js` (isCleanOffer), `web/src/styles.css` (tokens), `.github/workflows/{pipeline,diagnose}.yml`, `scripts/{heartbeat,diagnose}.mjs`, `test/scraper.{run,merge}.test.mjs`, `web/test/chart.test.mjs`, `data/{current-offers,status,heartbeat}.json`
- Matcher verdicts + pairing prototype executed locally against the live XML (scripts in the session scratchpad; reproducible from `research-samples/`)
- Node.js 22 test runner docs, default patterns: https://nodejs.org/docs/latest-v22.x/api/test.html

### Secondary (MEDIUM confidence)
- pdfminer.six "Converting a PDF file to text" (char bbox = bottom-left + upper-right corners; chars → lines → boxes): https://pdfminersix.readthedocs.io/en/latest/topic/converting_pdf_to_text.html
- PAngV Grundpreis obligation in retail advertising: https://www.verbraucherzentrale.de/wissen/vertraege-reklamation/kundenrechte/pflicht-zur-angabe-des-grundpreises-ermoeglicht-direkten-preisvergleich-10621 ; https://www.ihk.de/bremen-bremerhaven/beraten-informieren2/recht2/gewerberecht/grundpreisangabe-5019626

### Tertiary (LOW confidence)
- None relied upon.

## Metadata

**Confidence breakdown:**
- Source shape (homepage var, index text, coords XML, coordinates, font sizes): HIGH. Live-probed and reconstructed.
- Code integration points: HIGH. Every cited line was read this session; values are quoted verbatim.
- Pairing heuristic + date precedence: MEDIUM. Correct on all probed cases from one leaflet; generalization is assumed (A4, A5, A8). The failure direction is safe (needsReview/error).
- Runner reachability: LOW until a CI run (A1).

**Research date:** 2026-10-12
**Valid until:** ~2026-11-12 for code integration. The 1kcloud/wasgau.de shape is weekly-volatile; re-probe if the planning slips past a few weeks.
