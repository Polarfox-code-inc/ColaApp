# Stack Research

**Domain:** Free auto-updating single-product price-tracker PWA (German supermarket offers), GitHub Actions scraper + GitHub Pages frontend
**Researched:** 2026-06-15
**Confidence:** HIGH (overall stack), MEDIUM (data-source longevity — see per-store verdicts)

---

## TL;DR Recommendations (read this first)

1. **Aggregator over per-store scrapers — decisively.** Use the **marktguru.de unofficial JSON API** as the single data source for all 5 store groups. It covers REWE, Edeka, Netto, Lidl, Kaufland, Aldi, Penny **and Wasgau** (Wasgau has a live retailer page with leaflets on marktguru). One endpoint, one auth scheme, plain JSON, filterable by `zipCode` (67105 Schifferstadt) and search term (`q=coca cola`). Per-store direct APIs are individually harder, individually brittle, and several are now actively defended (REWE moved to Cloudflare mTLS in 2024). **Do not build 5 scrapers when 1 aggregator returns all 5.**
2. **Plain `fetch` + JSON — NO headless browser.** marktguru returns JSON from a documented-by-reverse-engineering REST endpoint. **Playwright is not needed** and would be a liability (slower, heavier, more breakable, ~300MB browser download in CI). Reserve Playwright only as a contingency if marktguru hardens against header-only auth.
3. **Node.js (not Python)** for the scraper — keeps the whole project one language, native `fetch` (Node 22 LTS), trivial `git commit` of the data file, and Cheerio available as an HTML fallback if ever needed.
4. **Vanilla JS + Vite (no framework)** for the PWA. The app is one screen: a "best deal" panel, a per-store list, and one chart. Preact/Svelte add tooling for nothing. Use **`vite-plugin-pwa`** for the manifest + service worker (offline-last-data), and **uPlot** (or Chart.js if you want batteries-included) for the price-history graph.
5. **GitHub Actions free + unlimited for public repos** (standard runners). The real caveats are **cron unreliability (10–30 min late, occasional skips)** and the **60-day-inactivity auto-disable** — both have standard mitigations below.

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Node.js** | 22 LTS ("Jod") | Scraper runtime in GitHub Actions | One language for scraper + frontend. Native `fetch`/`undici` (no `axios` needed). `actions/setup-node@v4` is first-class. Python would split the toolchain for no benefit here. |
| **marktguru.de unofficial API** | `api.marktguru.de/api/v1` | Single data source for all 5 store groups | Returns current + upcoming weekly offers as JSON, filtered by `zipCode` and search term. Covers REWE/Edeka/Netto/Lidl/Kaufland/Aldi/Penny **and Wasgau**. Replaces 5 separate brittle scrapers with one call per store. |
| **GitHub Actions** | `schedule:` cron workflow | Scheduled scrape + commit | Free & unlimited minutes on public repos (standard runners). Commits `data.json` + history back to the repo. No server, no local machine. |
| **GitHub Pages** | static hosting | Serves the PWA | Free, HTTPS by default (required for service workers / installability), reads the committed data file directly. |
| **Vite** | 7.x | Frontend build + dev server | Tiny config, fast, the canonical base for `vite-plugin-pwa`. Outputs static assets Pages can serve. |
| **vite-plugin-pwa** | 1.x (Workbox 7) | Manifest + service worker | Zero-config PWA: generates `manifest.webmanifest`, registers SW, precaches the shell, and (with a runtime route for `data.json`) gives offline "last-known data". Handles install prompt plumbing. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **uPlot** | 1.6.x | Price-history time-series chart | **Primary chart recommendation.** ~15–25 KB, canvas, extremely fast, perfect for a single line of weekly prices. Sparse docs but the use case is simple. |
| **Chart.js** | 4.5.0 | Alternative chart | Use instead of uPlot if you want friendlier docs/tooltips/legends out of the box and don't mind ~60 KB. Pair with `chartjs-adapter-date-fns` 3.x + `date-fns` for the time axis. |
| **Cheerio** | 1.2.0 | HTML parsing | **Contingency only.** If a store ever needs HTML scraping (e.g. marktguru gap for Wasgau), Cheerio parses leaflet/offer HTML. Bundles `undici` 7.x. Not needed for the JSON-API path. |
| **date-fns** | 3.x/4.x | Date math/formatting | Format `validFrom`/`validTo` ranges; required by the Chart.js date adapter if you pick Chart.js. Tree-shakeable. |
| **zod** | 3.x | Validate scraped JSON before commit | Optional but recommended: guards against marktguru silently changing shape, so a malformed scrape fails loudly instead of corrupting `data.json`/history. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `actions/checkout@v4` | Check out repo in CI | Needed before committing data back. |
| `actions/setup-node@v4` | Provision Node 22 | Cache npm for faster runs. |
| `git` (in-workflow) | Commit `data.json` + history | Use a "commit only if changed" guard (`git diff --quiet || git commit`) to avoid empty commits; this commit also resets the 60-day inactivity clock. |
| Cron monitor (optional) | Detect missed runs | A "dead man's switch" (e.g. healthchecks.io free tier, or a check that data freshness < N days) catches GitHub's silent cron skips. |

## Installation

```bash
# Scraper (repo root or /scraper)
npm install zod            # optional: schema-validate marktguru responses
npm install -D cheerio     # contingency HTML-parse fallback only

# Frontend (/web)
npm install -D vite vite-plugin-pwa
npm install uplot          # primary chart choice
# --- OR, if you prefer Chart.js over uPlot ---
npm install chart.js chartjs-adapter-date-fns date-fns
```

> Node 22 LTS provides global `fetch`; no HTTP client dependency is required for the marktguru JSON path.

---

## Per-Store Data-Source Feasibility (the critical question)

Verdict scale: **REACHABLE** (stable JSON via aggregator), **HARD** (direct API exists but defended/brittle), **LEAFLET-ONLY** (PDF/image, OCR territory).

| Store (group) | Via marktguru aggregator | Direct source if you bypassed marktguru | Verdict | Confidence |
|---------------|--------------------------|------------------------------------------|---------|------------|
| **REWE** | Listed retailer, offers in JSON | `mobile-api.rewe.de/.../all-offers` — **now Cloudflare mTLS-protected since 2024** (needs extracted client cert + password; community keeps it alive but fragile) | **REACHABLE via marktguru** (direct = HARD) | MEDIUM |
| **Penny** (REWE group) | Listed retailer (`/r/penny`), offers in JSON | Same REWE-group infra; same mTLS pain | **REACHABLE via marktguru** | MEDIUM |
| **Edeka** | Listed retailer, offers in JSON | Regional Edeka sites vary; no clean national API | **REACHABLE via marktguru** | MEDIUM |
| **Netto Marken-Discount** (Edeka group) | Listed retailer, offers in JSON | Own app API exists but undocumented/brittle | **REACHABLE via marktguru** | MEDIUM |
| **Lidl** | Listed retailer, offers in JSON | No public API; product/leaflet endpoints exist but change | **REACHABLE via marktguru** | MEDIUM |
| **Kaufland** (Schwarz group, w/ Lidl) | Listed retailer, offers in JSON | Own offer endpoints exist, undocumented | **REACHABLE via marktguru** | MEDIUM |
| **Aldi Süd** (Schifferstadt is Süd territory) | Listed retailer, offers in JSON | Aldi Süd publishes structured offer JSON on its site (historically scrapable) | **REACHABLE via marktguru** (direct also plausible) | MEDIUM |
| **Wasgau** (regional Pfalz chain) | **Live retailer page on marktguru** (`/r/wasgau`, `/rl/wasgau/...` city pages, Bäckerei/Metzgerei leaflets present) — confirmed offers indexed | Wasgau's own site: **leaflet PDFs/images only** | **REACHABLE via marktguru** (direct = LEAFLET-ONLY, would need OCR) | MEDIUM-LOW |

**Headline:** marktguru collapses the hardest problem (Wasgau, REWE mTLS) into one uniform JSON call. The risk is concentrated — if marktguru changes/breaks, you lose all stores at once — but the maintenance surface is 1 integration instead of 8, and the worst-case fallback (Wasgau leaflet OCR) is avoided entirely.

> **Wasgau caveat (verify in build phase):** marktguru clearly indexes Wasgau *Bäckerei/Metzgerei* leaflets. Confirm during implementation that the **12×1L Coca-Cola case** specifically surfaces for Wasgau at zip 67105 — regional beverage offers may be thinner than bakery/butcher. If Wasgau Cola coverage is genuinely empty, treat "no Wasgau offer" as a valid empty state (the PROJECT already accepts long no-offer stretches) rather than building an OCR pipeline.

---

## marktguru API — integration notes (for the roadmap)

- **Base:** `https://api.marktguru.de/api/v1`
- **Endpoint:** `GET /offers/search?as=web&q=coca%20cola&zipCode=67105&limit=200&offset=0`
- **Auth:** two headers, `x-apikey` and `x-clientkey`. These are **not from a registration** — they are embedded in marktguru.de's homepage bootstrap JSON and scraped at runtime, then cached (~6h). The scraper must fetch the homepage, extract the keys, then call the API.
- **Filtering:** filter results client-side by `advertisers[].name`/`uniqueName` to keep only the 5 target store groups; filter by product text to isolate the **12×1L case** (exclude 1.25L 6-packs, can trays, etc. per scope).
- **Useful response fields (reverse-engineered, verify exact names at build time):** product `title`/`description`, `price`, `advertisers[0].name` (store), validity dates (commonly `validFrom`/`validTo`, sometimes surfaced as an `expires` date — **confirm field names live**), optional image URL pattern `https://mg2de.b-cdn.net/api/v1/offers/{id}/images/default/0/{size}.jpg`.
- **Upcoming offers:** German offers are announced ~a week ahead; marktguru exposes future-dated `validFrom`, satisfying the PROJECT's "current and upcoming" requirement.
- **Legality / ToS:** This is an **unofficial, undocumented** API. Personal, single-user, low-volume use is the realistic risk profile here, but it can change or be blocked without notice. **Be a good citizen:** run on a slow cadence (1–4×/day is plenty for weekly offers — see cron note), send a sane `User-Agent`, cache the homepage keys, never parallel-hammer. Do not redistribute the data as a service. Treat breakage as expected, not exceptional (matches PROJECT "scrapers are brittle" risk).

---

## Data File Format (decouples scraper from frontend)

Two files committed by the Action; the PWA reads both as static assets:

**`data.json`** — current state (small, overwritten each run):
```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-06-15T04:07:00Z",
  "product": "Coca-Cola 12×1L Kasten",
  "zip": "67105",
  "stores": [
    {
      "store": "REWE",
      "onOffer": true,
      "price": 9.99,
      "currency": "EUR",
      "validFrom": "2026-06-16",
      "validTo": "2026-06-21",
      "upcoming": false,
      "source": "marktguru",
      "offerTitle": "Coca-Cola versch. Sorten 12 x 1 L"
    },
    { "store": "Wasgau", "onOffer": false, "price": null, "validFrom": null, "validTo": null }
  ],
  "bestDeal": { "store": "REWE", "price": 9.99, "validTo": "2026-06-21" }
}
```

**`history.jsonl`** — append-only price history (one JSON object per line; never rewritten, so diffs are clean and the file grows slowly):
```json
{"date":"2026-06-15","store":"REWE","price":9.99,"validFrom":"2026-06-16","validTo":"2026-06-21"}
{"date":"2026-06-15","store":"Lidl","price":11.49,"validFrom":"2026-06-16","validTo":"2026-06-21"}
```

Rationale: `data.json` drives the "best deal + per-store" view and is cheap to refetch; `history.jsonl` feeds the chart and is append-only so each scrape produces a minimal, conflict-free git diff. `schemaVersion` lets the frontend evolve independently. The frontend never knows marktguru exists — it only knows this shape. (For the chart, the frontend can transform `history.jsonl` into per-store series; keep raw history dumb and do shaping client-side.)

---

## GitHub Actions: free-tier & scheduled-cron caveats (must-address)

| Caveat | Reality (2026) | Mitigation |
|--------|----------------|------------|
| **Cost / minutes** | Standard runners are **free and unlimited on public repos** (Jan 2026 pricing update reduced paid rates but kept free quotas; private repos get 2,000 free min/month on Free plan). | Keep the repo **public** → unlimited. Scrape job is seconds-long anyway. |
| **Cron is not punctual** | `schedule:` triggers run **10–30 min late** under load and occasionally **skip entirely**; not guaranteed. Reports of worsening delays through early 2026. | Weekly-offer data tolerates this fine. Schedule a few times/day (e.g. `0 4,12 * * *`) so a skipped run is covered by the next. Don't depend on exact timing. |
| **60-day inactivity auto-disable** | GitHub **disables scheduled workflows after 60 days with no repo activity** (one email warning, then silent stop). | The scrape job **commits `data.json`/`history.jsonl` when data changes** → that commit is repo activity and resets the clock indefinitely. As belt-and-suspenders, add a periodic no-op commit or use a keepalive action. (A repo that only ever produces *empty* diffs could still drift toward disable — hence "commit on change" plus occasional forced touch.) |
| **Silent missed runs** | You won't be alerted if cron skips. | Frontend should show **data freshness** ("updated 2 days ago"); optionally a free dead-man's-switch (healthchecks.io) pinged each run. |
| **Concurrent runs / git races** | Overlapping scheduled runs could collide on the commit. | Add `concurrency:` group to the workflow so only one run commits at a time; `git pull --rebase` before push. |

---

## PWA installability & offline-last-data

- **Manifest:** `vite-plugin-pwa` generates `manifest.webmanifest` — set `display: "standalone"`, `start_url`, name, theme color, and provide **192px + 512px (incl. maskable) icons**. These are the concrete requirements for Android "Add to Home screen" / install prompt eligibility. HTTPS is mandatory and GitHub Pages provides it.
- **Service worker strategy:** use Workbox via `vite-plugin-pwa` `generateSW`. Precache the app shell (HTML/JS/CSS/icons). Add a **runtime caching route for `data.json`/`history.jsonl`** using **StaleWhileRevalidate** (or NetworkFirst with cache fallback) → the brother always sees **last-known data offline**, and gets fresh data when online. This directly satisfies "offline-last-data".
- **No push:** out of scope per PROJECT — do **not** add push/notifications permissions; keep the SW to caching only. Simpler, fewer permission prompts, fully matches "he opens and checks himself".

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| **marktguru aggregator** | Per-store direct APIs (REWE mobile-api, Aldi Süd JSON, etc.) | Only if marktguru blocks header auth or drops a needed store. Aldi Süd's own JSON is the most viable single direct fallback; REWE-group direct needs Cloudflare mTLS cert juggling and is the least pleasant. |
| **Plain `fetch` + JSON** | Playwright/Puppeteer headless browser | Only if a target switches to JS-rendered, anti-bot-protected pages with no JSON endpoint. Heavy (~300MB browser in CI), slower, more breakable — avoid until forced. |
| **Node.js scraper** | Python (`httpx` + `BeautifulSoup`) | If you'd rather do OCR-heavy leaflet parsing (Python's OCR/ML ecosystem is richer). Not needed on the marktguru path; would split the toolchain. |
| **Vanilla JS + Vite** | Preact / Svelte | If the UI grows beyond ~2 screens with real interactivity. For one screen + one chart, vanilla is less code and zero framework runtime. |
| **uPlot** | Chart.js 4.5 | Pick Chart.js if you want built-in tooltips/legends/axes and easier docs and don't mind ~60 KB. Pick uPlot for minimum bytes + max performance. |
| **GitHub Actions cron** | External cron (cron-job.org) → `repository_dispatch` | If GitHub's cron skips become intolerable, trigger the workflow from a reliable external cron via the API. Adds a moving part; only if needed. |
| **JSONL history file** | SQLite committed to repo / external DB | Avoid: a DB is overkill for one product × 5 stores × weekly, breaks the "static file the PWA reads directly" model, and complicates git diffs. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **Playwright/Puppeteer (by default)** | ~300MB browser download per CI run, slow, brittle, anti-bot cat-and-mouse — unjustified when marktguru returns JSON. | Native `fetch` against the marktguru JSON endpoint. |
| **Building 5–8 separate per-store scrapers** | 8× the maintenance surface, 8× the breakage, includes the genuinely hard ones (REWE mTLS, Wasgau leaflet OCR). | One marktguru integration covering all groups. |
| **REWE direct `mobile-api` as primary** | Cloudflare mTLS since 2024 → needs an extracted client certificate + password that can be rotated/revoked any time. | marktguru (which surfaces REWE/Penny offers without the cert dance). |
| **Wasgau leaflet OCR pipeline** | PDF/image OCR is fragile, heavy, and low-accuracy for prices — disproportionate for one product. | marktguru's Wasgau retailer feed; if empty, an explicit "no offer" state. |
| **A frontend framework (React/Vue/etc.)** | Runtime + build weight for a one-screen, single-user app. | Vanilla JS + Vite. |
| **Push notifications / a backend server** | Explicitly out of scope; adds permissions, infra, cost. | Pull-on-open PWA + freshness indicator. |
| **`axios`/`node-fetch`** | Unneeded dependency on Node 22 (global `fetch`/`undici` built in). | Native `fetch`. |
| **Plotly / large charting libs** | Hundreds of KB for one line chart. | uPlot (or Chart.js). |
| **Rewriting `history` file each run** | Produces giant noisy git diffs and merge risk. | Append-only `history.jsonl`. |

## Stack Patterns by Variant

**If marktguru stays healthy (expected baseline):**
- Single Node `fetch` scraper → marktguru JSON → filter to 5 stores + 12×1L → write `data.json` + append `history.jsonl` → commit on change.
- Because: minimum surface, all stores uniform, no browser, no OCR.

**If marktguru hardens auth or drops a store:**
- Add a targeted per-store fallback: **Aldi Süd own JSON** first (cleanest), REWE-group via the community mTLS approach only if essential.
- Because: keep aggregator for the majority; surgically patch the one gap.

**If a store becomes leaflet-only with no aggregator coverage (worst case, mainly Wasgau):**
- Do **not** build OCR for v1. Mark that store "no data / check manually" in the UI.
- Because: PROJECT already accepts partial coverage and long no-offer stretches; OCR cost ≫ value for one product.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `vite-plugin-pwa@1.x` | `vite@7`, Workbox 7, Node ≥18 | Use `generateSW` strategy; add runtime route for the data files. |
| `cheerio@1.2.0` | Node ≥20.18.1 (bundles `undici@7`) | Contingency only; fine on Node 22. |
| `chartjs-adapter-date-fns@3.x` | `chart.js@4.x` + `date-fns@3.x` | Only if you choose Chart.js over uPlot. |
| `actions/setup-node@v4` | Node 22 LTS | Pin Node 22 in the workflow for reproducibility. |

## Sources

- GitHub Actions pricing/billing (GitHub Changelog 2025-12-16; GitHub Docs billing & hosted-runners) — public-repo standard runners free & unlimited in 2026 — **HIGH**
- GitHub community discussions #156282/#194300 + DEV/CronSignal guides — cron delays (10–30 min), skips, 60-day inactivity auto-disable — **HIGH** (well-corroborated, official-doc-backed behavior)
- marktguru unofficial API: `sydev/marktguru` source (base URL `api.marktguru.de/api/v1`, `x-apikey`/`x-clientkey` scraped from homepage, `/offers/search` params), `Nusscookie/offers-api`, `manmal/marktguru-cli` — **MEDIUM** (reverse-engineered, multiple independent corroborating repos; exact field names verify at build time)
- marktguru.de retailer pages for **Wasgau** (`/r/wasgau`, `/rl/wasgau/...`, Bäckerei/Metzgerei leaflets) and **Penny** (`/r/penny`) — confirms aggregator coverage incl. the regional chain — **MEDIUM**
- `ByteSizedMarius/rewerse-engineering`, `foo-git/rewe-discounts` issues — REWE `mobile-api` + Cloudflare mTLS (2024) — **MEDIUM** (direct-API difficulty is well-documented by community)
- npm/GitHub for `cheerio@1.2.0` (Jan 2026, Node ≥20.18.1, undici 7), `chart.js@4.5.0` (Jun 2025), `vite-plugin-pwa@1.x`/Workbox 7, uPlot bundle-size comparisons — **HIGH** (package registries/release notes)

---
*Stack research for: free auto-updating German-supermarket Coca-Cola price-tracker PWA*
*Researched: 2026-06-15*
