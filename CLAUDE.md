<!-- GSD:project-start source:PROJECT.md -->
## Project

**ColaApp**

A tiny, single-purpose web app (PWA) that tells one person — the author's brother — where the **Coca-Cola 12×1-litre case (Kasten)** is currently or soon on sale among **5 fixed supermarket stores in Schifferstadt, Germany** (REWE, Edeka/Netto, Lidl/Kaufland, Aldi/Penny, Wasgau). He adds it to his Android home screen, opens it when curious, and sees which store has the best deal — plus a price-history graph over time.

**Core Value:** When the 12×1L Coca-Cola case goes on sale at one of the 5 Schifferstadt stores, the app shows it — accurately, with the price and the dates it's valid. If that one thing works, the app is worth having.

### Constraints

- **Cost**: Must be entirely free to run — no paid hosting, no paid APIs/tiers. — Personal hobby project for one person.
- **Hosting**: Nothing hosted on the author's own local machine. Chosen path is free cloud: GitHub Actions (scheduled scrape) + GitHub Pages (serves the PWA). Netcup server is a fallback only. — User requirement.
- **Delivery**: Must be installable without sideloading — PWA "add to home screen" on Android. — User requirement.
- **Data acquisition**: Offers must be fetched automatically (no relying on someone manually spotting and entering them). A phone PWA can't read store sites directly (CORS), so a scheduled server-side job produces a data file the PWA reads. — Follows from auto-fetch choice.
- **Simplicity**: The app must stay simple to build and use; the narrow scope is a deliberate constraint, not a temporary one.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## TL;DR Recommendations (read this first)
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
# Scraper (repo root or /scraper)
# Frontend (/web)
# --- OR, if you prefer Chart.js over uPlot ---
## Per-Store Data-Source Feasibility (the critical question)
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
## marktguru API — integration notes (for the roadmap)
- **Base:** `https://api.marktguru.de/api/v1`
- **Endpoint:** `GET /offers/search?as=web&q=coca%20cola&zipCode=67105&limit=200&offset=0`
- **Auth:** two headers, `x-apikey` and `x-clientkey`. These are **not from a registration** — they are embedded in marktguru.de's homepage bootstrap JSON and scraped at runtime, then cached (~6h). The scraper must fetch the homepage, extract the keys, then call the API.
- **Filtering:** filter results client-side by `advertisers[].name`/`uniqueName` to keep only the 5 target store groups; filter by product text to isolate the **12×1L case** (exclude 1.25L 6-packs, can trays, etc. per scope).
- **Useful response fields (reverse-engineered, verify exact names at build time):** product `title`/`description`, `price`, `advertisers[0].name` (store), validity dates (commonly `validFrom`/`validTo`, sometimes surfaced as an `expires` date — **confirm field names live**), optional image URL pattern `https://mg2de.b-cdn.net/api/v1/offers/{id}/images/default/0/{size}.jpg`.
- **Upcoming offers:** German offers are announced ~a week ahead; marktguru exposes future-dated `validFrom`, satisfying the PROJECT's "current and upcoming" requirement.
- **Legality / ToS:** This is an **unofficial, undocumented** API. Personal, single-user, low-volume use is the realistic risk profile here, but it can change or be blocked without notice. **Be a good citizen:** run on a slow cadence (1–4×/day is plenty for weekly offers — see cron note), send a sane `User-Agent`, cache the homepage keys, never parallel-hammer. Do not redistribute the data as a service. Treat breakage as expected, not exceptional (matches PROJECT "scrapers are brittle" risk).
## Data File Format (decouples scraper from frontend)
## GitHub Actions: free-tier & scheduled-cron caveats (must-address)
| Caveat | Reality (2026) | Mitigation |
|--------|----------------|------------|
| **Cost / minutes** | Standard runners are **free and unlimited on public repos** (Jan 2026 pricing update reduced paid rates but kept free quotas; private repos get 2,000 free min/month on Free plan). | Keep the repo **public** → unlimited. Scrape job is seconds-long anyway. |
| **Cron is not punctual** | `schedule:` triggers run **10–30 min late** under load and occasionally **skip entirely**; not guaranteed. Reports of worsening delays through early 2026. | Weekly-offer data tolerates this fine. Schedule a few times/day (e.g. `0 4,12 * * *`) so a skipped run is covered by the next. Don't depend on exact timing. |
| **60-day inactivity auto-disable** | GitHub **disables scheduled workflows after 60 days with no repo activity** (one email warning, then silent stop). | The scrape job **commits `data.json`/`history.jsonl` when data changes** → that commit is repo activity and resets the clock indefinitely. As belt-and-suspenders, add a periodic no-op commit or use a keepalive action. (A repo that only ever produces *empty* diffs could still drift toward disable — hence "commit on change" plus occasional forced touch.) |
| **Silent missed runs** | You won't be alerted if cron skips. | Frontend should show **data freshness** ("updated 2 days ago"); optionally a free dead-man's-switch (healthchecks.io) pinged each run. |
| **Concurrent runs / git races** | Overlapping scheduled runs could collide on the commit. | Add `concurrency:` group to the workflow so only one run commits at a time; `git pull --rebase` before push. |
## PWA installability & offline-last-data
- **Manifest:** `vite-plugin-pwa` generates `manifest.webmanifest` — set `display: "standalone"`, `start_url`, name, theme color, and provide **192px + 512px (incl. maskable) icons**. These are the concrete requirements for Android "Add to Home screen" / install prompt eligibility. HTTPS is mandatory and GitHub Pages provides it.
- **Service worker strategy:** use Workbox via `vite-plugin-pwa` `generateSW`. Precache the app shell (HTML/JS/CSS/icons). Add a **runtime caching route for `data.json`/`history.jsonl`** using **StaleWhileRevalidate** (or NetworkFirst with cache fallback) → the brother always sees **last-known data offline**, and gets fresh data when online. This directly satisfies "offline-last-data".
- **No push:** out of scope per PROJECT — do **not** add push/notifications permissions; keep the SW to caching only. Simpler, fewer permission prompts, fully matches "he opens and checks himself".
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
- Single Node `fetch` scraper → marktguru JSON → filter to 5 stores + 12×1L → write `data.json` + append `history.jsonl` → commit on change.
- Because: minimum surface, all stores uniform, no browser, no OCR.
- Add a targeted per-store fallback: **Aldi Süd own JSON** first (cleanest), REWE-group via the community mTLS approach only if essential.
- Because: keep aggregator for the majority; surgically patch the one gap.
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
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
