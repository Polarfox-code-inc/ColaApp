# Pitfalls Research

**Domain:** Free auto-updating PWA tracking one fixed SKU (Coca-Cola 12×1L case) across 5 local German stores via GitHub Actions cron scrape → committed data file → GitHub Pages
**Researched:** 2026-06-15
**Confidence:** HIGH (GitHub Actions cron/disable behavior, SW caching, Pages base-path, German scraping law all verified against current sources; store-specific data feasibility MEDIUM — needs the planned per-store probe)

> This builds on PROJECT.md "Known Risks" (per-store feasibility varies, long "no offer" stretches, scrapers are brittle). It does **not** just repeat those three — it goes deep on the *specific* failure modes inside each, and adds the GitHub Actions / PWA / data-integrity traps that PROJECT.md does not cover.

---

## The single most important strategic decision (read first)

**Do not hand-roll five separate store scrapers as the v1 plan.** A public, unauthenticated aggregator endpoint already normalizes most of this: `https://api.marktguru.de/api/v1/offers/search?q=coca+cola&zipCode=67105` (an API key can be auto-fetched from the marktguru homepage; no registration). marktguru aggregates Aldi, Lidl, REWE, Edeka, Kaufland, Netto, Penny offers by postal code and returns structured JSON with price + valid-from/valid-to. This single decision dismantles ~70% of the scraping pitfalls below (regional endpoints, store-selection cookies, headless-browser sites, robots/ToS per store).

Treat per-store direct scraping as a *fallback for gaps* (most likely Wasgau, possibly Edeka Südwest regional offers), not the primary path. The pitfalls below are written assuming aggregator-first, direct-scrape-as-fallback. This belongs in **Phase 1 (Data Source Spike)** — prove the data exists *before* building anything else.

---

## Critical Pitfalls

### Pitfall 1: Wasgau (and any image/PDF-only leaflet) drags you into the OCR trap

**What goes wrong:**
You commit to "all 5 stores" and then discover Wasgau (and possibly Edeka Südwest regional specials) publish offers only as a flipbook/PDF/image leaflet, not as text or JSON. To get the Cola price you reach for OCR (Tesseract) on leaflet images. OCR on dense German promo leaflets is unreliable: it confuses `1,11 €` / `11,1 €`, drops the Pfand line, misreads `12×1L` as `12 x 1 L` or `121`, and can't tell which price belongs to which product on a crowded page. You burn the bulk of the project budget on the *hardest, least valuable* store and still get wrong prices.

**Why it happens:**
"5 stores" feels like one uniform task. In reality each store is a different data-acquisition problem, and the smallest store is the hardest. Sunk-cost sets in once you've started building the OCR pipeline.

**How to avoid:**
- In the Phase 1 spike, classify each of the 5 stores into a tier: (A) aggregator/JSON covers it, (B) scrapable HTML, (C) image/PDF-only.
- For Tier C, explicitly decide **partial coverage is acceptable** (PROJECT.md already accepts long "no offer" stretches and per-store variance). Show "data unavailable for this store" as a first-class UI state, not OCR-at-any-cost.
- If OCR is attempted at all, scope it to *detecting presence of a Cola case offer* (a human then confirms), never to *trusting an OCR'd price* unverified.

**Warning signs:**
Spike reveals a store's only offer artifact is a `.pdf` or an image flipbook (e.g. a `prospekt`/leaflet viewer with no underlying text). Any plan line item that says "OCR the leaflet."

**Phase to address:** Phase 1 (Data Source Spike) — per-store tiering is the *primary deliverable* of that phase.

---

### Pitfall 2: Matching the wrong Cola SKU (false positives) — the core correctness risk

**What goes wrong:**
A query for "Coca-Cola" returns many SKUs: 1.25L 6-packs, 0.33L can trays (24×), 0.5L PET, Zero/light/Cherry variants, and store-brand colas. A naive "contains 'cola' and cheapest" picks the 0.33L can tray at €0.79/can and reports a "great Cola deal" that is **not** the 12×1L case. Because this is the app's entire reason to exist (PROJECT.md Core Value: "accurately, with the price"), a wrong match silently destroys all trust — worse than showing nothing.

**Why it happens:**
Promo titles are inconsistent: "Coca-Cola versch. Sorten", "Coca-Cola 12x1l", "Coca-Cola Kasten", "Coca Cola 1L". The 12×1L attribute may live in a separate `unit`/`description`/`amount` field, not the title. Developers match on title substring and stop.

**How to avoid:**
- Build an explicit **positive matcher**: require evidence of *both* `12` (pack count) AND `1 l`/`1l`/`1,0 l`/`1000 ml` (unit size), tolerant of spacing/`x`/`×`. Parse the structured `unit`/`amount` field when present, not just the title.
- Build an explicit **negative/exclusion list**: reject `1,25`, `0,33`, `0,5`, `1,5`, `2 l`, `dose`/`dosen`, `cherry`, `vanilla`, store brands (`ja!`, `gut&günstig`, `K-Classic`, `River`). Decide up front whether Zero/light count as "Coca-Cola 12×1L" — PROJECT.md says single-product focus; default to **classic only** unless the brother says otherwise.
- Treat ambiguous matches as "no confident match" (false negative) rather than guessing — a missed deal is recoverable, a wrong price is not.
- Keep a tiny fixtures file of real offer payloads (captured in the spike) and assert the matcher against them in CI, so a store wording change that breaks matching fails loudly.

**Warning signs:**
A reported price that is implausibly low for a 12×1L case (e.g. under ~€7). Matcher logic that is a single `.includes('cola')`. No exclusion list. No test fixtures.

**Phase to address:** Phase 2 (Matching & Normalization) — and re-verified every time a new store is added.

---

### Pitfall 3: Pfand and multi-buy mangle the price even when the SKU is right

**What goes wrong:**
You correctly identify the 12×1L case but report the wrong *number*. Two distinct traps:
1. **Pfand (deposit):** German bottle deposit is €0.25/bottle → €3.00 on a 12×1L case, sometimes shown as a separate line, sometimes folded into the shelf price ("inkl. Pfand"), sometimes excluded ("zzgl. €3,00 Pfand"). If you sometimes include and sometimes exclude it, your price history graph (PROJECT.md requirement) gets a phantom €3 sawtooth that looks like price changes but isn't.
2. **Multi-buy:** "2 für 18 €" or "ab 2 Kästen" — the displayed/headline price may be the *per-unit-when-buying-N* price, not the single-case price. Reporting €9 when a single case is €11 misleads.

**Why it happens:**
Price is rarely one clean field. Aggregators and stores represent Pfand and multi-buy inconsistently across sources, so a per-source assumption silently breaks on another source.

**How to avoid:**
- Pick **one canonical price definition** and apply it everywhere: recommended = **price *excluding* Pfand** (the comparable "shelf" price), and store Pfand separately if available. Document the choice; normalize every source to it.
- Detect and flag multi-buy: if the offer text contains `2 für` / `ab 2` / `je` patterns, capture both the multi-buy and (if present) single price; store the **single-case** price as the headline, multi-buy as a note.
- Stamp every stored price with which convention it used (`pfand_included: bool`, `is_multibuy: bool`) so history stays apples-to-apples and you can re-normalize later.

**Warning signs:**
History graph shows clean ~€3 step changes. Two stores in the same week differ by ~€3 for an identical case. Offer text contains `für`/`ab`/`je` but your parser ignored it.

**Phase to address:** Phase 2 (Matching & Normalization).

---

### Pitfall 4: GitHub Actions silently auto-disables your scheduled workflow after 60 days

**What goes wrong:**
On public repos, GitHub **automatically disables a scheduled (`cron`) workflow after 60 days with no repository activity** — and "activity" effectively means *new commits*, not workflow runs. The cruel irony: a low-activity hobby repo that *only* runs a cron is exactly the profile that gets disabled. The app then silently stops updating; the brother sees stale data with no error, possibly for weeks, until someone notices.

**Why it happens:**
The repo's only "activity" is the bot committing the data file — and even that may not reset the timer in all cases, plus if the scrape ever produces no diff there's no commit at all. Nobody is watching the Actions tab on a hobby project.

**How to avoid:**
- Add a **keepalive**: either a second scheduled workflow that makes a trivial commit / touches the repo via the API on a < 60-day cadence, or use an established keepalive action. Simplest robust option: have the data-commit step *always* write a heartbeat (e.g. a `last_run` timestamp in a status file) so every successful run is a real commit and resets the 60-day clock.
- Treat the data file's `last_updated` timestamp as a liveness signal the **frontend checks** (see Pitfall 9) so a disabled workflow surfaces to the user, not just in a tab nobody opens.

**Warning signs:**
GitHub shows the banner "This scheduled workflow is disabled because there hasn't been activity in this repository for at least 60 days." Data `last_updated` is many days old. No commits in the repo's recent history.

**Phase to address:** Phase 3 (Scheduling & Automation).

---

### Pitfall 5: Treating GitHub cron as a precise, guaranteed clock

**What goes wrong:**
You assume the workflow runs at exactly `0 6 * * 1`. GitHub Actions cron is **best-effort, not guaranteed**: runs are routinely delayed 5–60+ minutes under load, and during high-load windows (top of the hour, especially `:00` and midnight UTC) runs can be delayed significantly or **dropped entirely**. If your logic assumes "it ran exactly at 06:00 Monday," date math and "this week's offer" detection drift, and an occasional skipped run can leave a gap with no retry.

**Why it happens:**
cron *looks* like a precise scheduler. The free tier shares a heavily contended queue.

**How to avoid:**
- Schedule at an **odd minute off the hour** (e.g. `17 5 * * *`), not `:00`, to dodge the worst contention.
- Make the job **idempotent and self-healing**, not run-time-dependent: on each run, fetch *current* offers and reconcile against stored data by offer identity + valid-from/valid-to, so a missed or late run is harmless — the next run fills it.
- Run **more often than strictly needed** (e.g. daily, even though offers are weekly) so a dropped run is covered by the next day; free minutes easily allow this (see Pitfall 6).
- Never compute "today is Monday so the offer started today" from the cron time — read dates *from the offer data*.

**Warning signs:**
Logic that branches on the current weekday/time. A gap in history aligned with a single missed run. Workflow run timestamps that wander far from the cron time.

**Phase to address:** Phase 3 (Scheduling & Automation).

---

### Pitfall 6: The commit-back loop — push loops, permissions, and CI re-triggers

**What goes wrong:**
The workflow commits the updated data file back to the repo. Three classic traps:
1. **Push loop / wasted runs:** if the data commit isn't excluded, a `push`-triggered workflow re-fires on the bot's own commit → wasted minutes, potential loop.
2. **Permissions:** the default `GITHUB_TOKEN` needs `contents: write`; without it the push fails with a 403 and the data never updates (often discovered only after the first real offer is missed).
3. **Noise / clock churn:** committing on every run even with no data change spams history (though, per Pitfall 4, a deliberate heartbeat commit is actually desirable — be intentional about which).

**Why it happens:**
Default token scopes tightened over time; default workflow triggers re-fire on pushes. Easy to get working in a manual test and have it silently fail on the scheduled path.

**How to avoid:**
- Grant least-privilege explicitly: `permissions: { contents: write }` in the workflow.
- The data-writing workflow should be triggered **only** by `schedule` (and `workflow_dispatch` for manual test) — not by `push` — which structurally prevents the loop. If any push trigger exists elsewhere, add `[skip ci]` to the bot commit message and/or path filters.
- Decide the commit policy deliberately: commit when data changes **or** when a heartbeat is due (Pitfall 4), not blindly every run.

**Warning signs:**
Actions running back-to-back triggered by the bot's own commits. A 403 "Permission denied" / "remote rejected" in the push step. Data file unchanged for days despite "successful" runs.

**Phase to address:** Phase 3 (Scheduling & Automation).

---

### Pitfall 7: Service worker serves stale data *forever* (the PWA classic)

**What goes wrong:**
You make it a "proper" PWA with a service worker that caches everything cache-first for offline use. The data file (`offers.json`) gets cached on first load and the SW keeps serving the old cached copy — so even though GitHub Actions faithfully updates the data daily, **the brother's installed PWA shows last week's price indefinitely**. This is the most common PWA failure and it's invisible in dev (where you hard-reload).

**Why it happens:**
Default/cache-first SW strategies treat the data file like a static asset. Installed PWAs don't get a normal browser refresh. `Cache-Control: no-cache` is misunderstood ("never cache") when it actually means "revalidate."

**How to avoid:**
- **Split strategy by resource type:** cache-first (with versioned cache names) for the app shell (HTML/CSS/JS); **network-first or stale-while-revalidate for `offers.json`**. For a once-curious-then-closed usage pattern, **network-first for data** is the right default — fresh when online, last-known when offline.
- **Cache-bust the data fetch:** request `offers.json?v=<build-or-timestamp>` or send `cache: 'no-store'` on the fetch, so the browser/SW can't serve a stale copy.
- Version the SW cache and clean old caches on `activate`; ensure a new deploy actually supersedes the old SW (skipWaiting/clientsClaim used deliberately).
- Test the *installed* PWA on a real Android device with airplane-mode toggling — not just desktop hard-reload.

**Warning signs:**
Data updates in the repo / raw file but the installed app doesn't change. It only updates after uninstall/reinstall or clearing site data. SW caches `offers.json` with a cache-first handler.

**Phase to address:** Phase 4 (PWA shell & data wiring) — and explicitly verified on-device in Phase 4 acceptance.

---

### Pitfall 8: GitHub Pages project-site base path breaks the PWA (`/repo/`)

**What goes wrong:**
A project Pages site is served from `https://<user>.github.io/<repo>/`, not the domain root. Absolute paths (`/offers.json`, `/icons/x.png`, `/sw.js`, manifest `start_url: "/"`, SW `scope: "/"`) resolve to the **domain root**, so assets 404, the manifest is invalid, the SW won't control the right scope, and "Add to Home Screen" either fails or installs a broken shell. Plus the data fetch silently hits the wrong URL.

**Why it happens:**
Everything works locally at `localhost:port/` (root), then breaks only after deploy to the `/repo/` subpath. Manifest `start_url`/`scope` and SW registration scope are easy to leave at `/`.

**How to avoid:**
- Use **relative paths** throughout (`./offers.json`, `./sw.js`, `./icons/...`), or set a `<base href="/repo/">`.
- Manifest: `start_url: "."` (or `./`) and `scope: "./"`; register the SW from within the subpath so its scope is the subpath.
- Easiest sidesteps: deploy to a **user/org Pages site** (`<user>.github.io`, served at root) or attach a custom domain → no subpath, the whole class of bug vanishes. Worth considering for this one-user app.
- Verify the deployed manifest with Chrome DevTools "Application → Manifest" and Lighthouse PWA install check *on the live Pages URL*, not locally.

**Warning signs:**
Works on localhost, 404s on the live Pages URL. DevTools manifest panel shows errors / no install prompt. SW "scope" doesn't include the page. `offers.json` fetch 404s in the Network tab on the deployed site.

**Phase to address:** Phase 4 (PWA shell), specifically deploy verification.

---

### Pitfall 9: Stale data served silently — the "looks fine but it's lying" failure

**What goes wrong:**
Any upstream break (scraper broke, workflow disabled, marktguru changed, store redesigned) means the data file stops updating — but the PWA happily renders the last-known offer with no indication it's old. The brother acts on a price that expired weeks ago. For a price-tracking app this is the *worst* failure because it's indistinguishable from working.

**Why it happens:**
The happy path renders whatever's in `offers.json`. Freshness is invisible unless explicitly surfaced. PROJECT.md "Known Risks" says "keep serving last-known data" — but serving it *silently* is the trap.

**How to avoid:**
- Every data file carries `generated_at` (UTC) and per-store `last_seen` / `fetch_status` (ok / failed / unavailable).
- Frontend computes data age and shows an explicit banner when stale (e.g. "Daten vom 12.06. — evtl. nicht aktuell" beyond a threshold tied to the run cadence). Make "no current offer" and "data is old" two clearly different states (PROJECT.md already wants "no current offer" to be a clear non-broken state — extend that to staleness).
- Per-store status so one broken store (e.g. Wasgau) degrades to "unavailable" without poisoning the others.

**Warning signs:**
UI never shows a date or freshness indicator. No `generated_at` in the data. You can't tell from the screen whether the pipeline is alive.

**Phase to address:** Phase 4 (frontend) for display; data shape defined in Phase 2/3.

---

### Pitfall 10: Append-only history accumulating duplicates and gaps

**What goes wrong:**
The price-history feature (PROJECT.md requirement) stores a record per run. Naively appending creates: **duplicates** (same weekly offer re-recorded every daily run → the graph shows 7 identical points per week, or a flat line that's really one offer), and **gaps/garbage** (a failed fetch appends a `null`/€0 row, putting a fake dip in the graph). Over a year this makes the history graph noisy and untrustworthy — the one feature meant to reveal "is this genuinely a good price."

**Why it happens:**
"Append every run" is the obvious implementation, but offers are weekly while runs are daily, and failure isn't distinguished from "no offer."

**How to avoid:**
- Model history by **distinct offer**, keyed by (store, price, valid-from, valid-to), not by run. Upsert: a run that sees the same offer updates `last_seen`, it does not append a new point.
- **Never write a price row for a failed fetch.** Failure updates `fetch_status`, not the price series. Distinguish three states explicitly: *offer present*, *confirmed no offer this week*, *fetch failed/unknown*.
- Decide how the graph represents "no offer" weeks (gap vs. baseline regular price) — don't let absence read as €0.
- Because runs are idempotent (Pitfall 5), a missed day doesn't create a gap in the *offer* timeline, only in observation cadence.

**Warning signs:**
History grows by N points per day. Graph has €0 spikes or 7× duplicate weekly points. Can't distinguish "no offer" from "fetch failed" in the stored data.

**Phase to address:** Phase 2 (data model) and Phase 3 (write logic).

---

### Pitfall 11: Timezone & German weekly-cycle date handling

**What goes wrong:**
Offers run Mon–Sat/Sun on a German weekly cycle, with "next week" offers announced ahead (PROJECT.md Context explicitly wants upcoming offers surfaced). GitHub runners are **UTC**. Mixing UTC run-time with local valid-from/valid-to dates causes off-by-one errors: an offer that's valid "from Monday" shows as already active Sunday night, or "current vs upcoming" flips at the wrong hour. German DST (CET/CEST) makes the UTC offset shift twice a year, breaking naive `+1`/`+2` hour fixes.

**Why it happens:**
Runner is UTC, store is Europe/Berlin, dates are date-only (no time). Developers compare a UTC `now` against a Berlin calendar date.

**How to avoid:**
- Store valid-from/valid-to as **date-only** values in the store's local sense, and compute "current vs upcoming" against **Europe/Berlin** wall-clock date (use a TZ-aware comparison, e.g. `Intl.DateTimeFormat`/`Temporal` or set `TZ=Europe/Berlin` in the job), never a hand-rolled offset.
- Define "current offer" precisely: valid-from ≤ today(Berlin) ≤ valid-to. "Upcoming" = valid-from > today(Berlin). Drive the UI's current/upcoming split (PROJECT.md requirement) from this, not from run timing.
- Don't rely on the cron firing exactly Monday 00:00 to flip state (ties to Pitfall 5) — derive state from the dates.

**Warning signs:**
Offer appears active a day early/late. Current/upcoming split changes around midnight UTC (01:00/02:00 Berlin). Behavior shifts after a DST change.

**Phase to address:** Phase 2 (date normalization) and Phase 4 (current/upcoming display).

---

### Pitfall 12: Brittle scrapers break silently; no loud-enough failure for a solo maintainer

**What goes wrong:**
A store redesign or marktguru change breaks a scraper. Without notification, the only signal is stale data (Pitfall 9) — which on a hobby project nobody checks. The app rots. The opposite failure also hurts: notifications so noisy (every transient 500) that the author mutes them and then misses the real break.

**Why it happens:**
PROJECT.md "no push notifications" applies to the *user*, but the *maintainer* still needs to know when the pipeline breaks. Solo hobby projects default to zero observability.

**How to avoid:**
- **Fail loudly to the maintainer, quietly to the user.** On the data side: when a fetch fails or a store yields zero matches *for several consecutive runs* (not one transient), trigger a signal the author actually sees — e.g. the workflow `exit 1` so the Actions run goes red and GitHub emails the repo owner on failed scheduled runs, and/or open/update a GitHub Issue via the API.
- **Debounce** alerts (consecutive-failure threshold) so a one-off network blip doesn't cry wolf.
- Distinguish "store has genuinely no Cola offer this week" (normal, no alert) from "scraper returned nothing parseable / structure changed" (alert) — e.g. detect when a previously-working store stops returning *any* parseable offers at all, which signals a redesign rather than a quiet week.
- Snapshot a small fixture in CI (Pitfall 2) so structural changes can fail a test loudly.

**Warning signs:**
You only learn it's broken because the brother mentions it. Workflow stays green even when it scraped nothing. Either no alerts, or so many you ignore them.

**Phase to address:** Phase 3 (failure handling/alerting) and Phase 5 (hardening/monitoring).

---

### Pitfall 13: Scraping legality / ToS / rate-limit blocks from shared runner IPs

**What goes wrong:**
Direct-scraping a German retailer can conflict with the site's AGB (terms) and the database-producer right (§87b UrhG / DB right). Ignoring `robots.txt` isn't itself a crime but is read as evidence of *intentional* misuse and weakens your position. Separately, GitHub Actions runners use **shared, well-known cloud IP ranges** that stores' anti-bot/CDN (Cloudflare etc.) may rate-limit or block outright — so a scraper that works from your home IP returns 403/429/JS-challenge pages from the runner.

**Why it happens:**
Scope is "auto-fetch from 5 stores" without distinguishing a *cooperative aggregator* from *adversarial direct scraping*. Runner IP reputation is invisible until you deploy there.

**How to avoid:**
- **Prefer the aggregator (marktguru) and any official/store-published JSON endpoints** over scraping rendered store pages — these are public, postal-code-parameterized, and far less adversarial both legally and technically. This is the single biggest mitigation.
- Be a polite client: realistic `User-Agent`, low frequency (daily is plenty for weekly offers), respect `robots.txt`, no auth-circumvention or anti-bot evasion. This is a private 1-user hobby tool reading publicly displayed prices — keep it that way; do not redistribute scraped data or scale up.
- If a direct-scrape target blocks runner IPs, that's a strong signal to fall back to the aggregator or accept partial coverage for that store rather than escalating to proxies/headless evasion.
- Avoid headless-browser scraping where possible (heavier, more fragile, more "evasion-looking"); only consider it for a store that genuinely needs JS rendering, and weigh it against just using the aggregator.

**Warning signs:**
Scraper gets 403/429/Cloudflare challenge from the runner but works locally. A store's AGB explicitly forbids automated access. You're reaching for rotating proxies/CAPTCHA-solving — stop and reconsider scope.

**Phase to address:** Phase 1 (Data Source Spike — pick cooperative sources) and a quick legal/ToS sanity check before committing to any direct-scrape target.

---

### Pitfall 14: Regional offer variance (Edeka Südwest, Aldi Süd vs Nord) yields wrong-region prices

**What goes wrong:**
Edeka is a federation of regional companies (Schifferstadt → **Edeka Südwest**), and Aldi splits into **Süd vs Nord** (Schifferstadt/Pfalz is Aldi **Süd** territory). Offers and prices differ by region. A scraper hitting a national page, or an aggregator query without the right postal code, can report a *Hamburg/Aldi-Nord* price that doesn't apply in Schifferstadt — quietly wrong for the one location that matters.

**Why it happens:**
National-looking URLs hide regional segmentation; the region is selected by cookie, postal code, or subdomain. Easy to miss when PROJECT.md's whole premise is fixed local stores.

**How to avoid:**
- Always pass **PLZ 67105** (or the specific store) to every source — the aggregator's `zipCode` param handles this for covered chains. Verify in the spike that results actually change with postal code (proof the region is being honored).
- For direct scrapes, identify the regional entity up front: Edeka **Südwest**, Aldi **Süd**, and the specific Penny/Netto/Lidl/Kaufland/Wasgau branch; capture the store-selection mechanism (cookie/param) in Phase 1.
- Pin and document the exact store identity per source so a later change is detectable.

**Warning signs:**
Price doesn't change when you change the postal code. A store's offer matches a different region's leaflet. Edeka results look "national" rather than Südwest.

**Phase to address:** Phase 1 (Data Source Spike — capture per-store regional/store-selection mechanism).

---

### Pitfall 15: Store-selection cookies / JS-rendered offer pages defeat a plain HTTP fetch

**What goes wrong:**
Some store sites show offers only after a branch is selected (stored in a cookie/localStorage) and/or render the offer list **client-side via JS/XHR**. A plain `curl`/`fetch` from the runner gets an empty shell or a "please select your store" page — so the scraper "succeeds" (200 OK) but extracts nothing, silently yielding no Cola offer.

**Why it happens:**
The page looks static in a browser but is hydrated by JS, or gated behind a store-selection step. A 200 with empty results reads as "no offer this week."

**How to avoid:**
- In the spike, open DevTools → Network and find the **underlying XHR/JSON endpoint** the page calls (often the real, parseable data source, parameterized by store/PLZ) — hit *that* directly instead of the rendered HTML. This usually avoids needing a headless browser at all.
- Capture and replay the required store-selection cookie/param.
- Add a **sanity assertion**: a "successful" fetch that returns zero parseable products from a store that normally has them should be treated as a *failure/alert* (ties to Pitfall 12), not a quiet "no offer."

**Warning signs:**
200 OK but empty/zero matches. Page HTML contains a store-selector or `__NEXT_DATA__`/JS-app root instead of offer markup. Works in a browser, returns nothing from the runner.

**Phase to address:** Phase 1 (spike — find real endpoints) and Phase 3 (zero-result-as-failure guard).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Match on `title.includes('cola')` only | Fast to write | Wrong-SKU false positives destroy trust (Pitfall 2) | **Never** — positive+negative matcher is the core value |
| Append a history row every run | Trivial write logic | Duplicate/€0-spike-ridden history graph (Pitfall 10) | Never — upsert by offer identity instead |
| Cache-first service worker for everything | Simple, offline-friendly | Stale data served forever (Pitfall 7) | Only if `offers.json` is explicitly network-first/bust-cached |
| Absolute paths (`/offers.json`) | Works on localhost | 404s on `/repo/` Pages (Pitfall 8) | Only on a root-served (user/custom-domain) Pages site |
| Hand-roll all 5 store scrapers in v1 | Feels "complete" | Maximal brittleness + Wasgau OCR trap (Pitfall 1) | Never as v1 — aggregator-first, scrape only gaps |
| Skip a maintainer alert path | Less to build | Silent rot; you learn from your brother (Pitfall 12) | Never — red Actions run + email is nearly free |
| Naive `+2h` for German time | Quick fix | Breaks at DST twice a year (Pitfall 11) | Never — use TZ-aware comparison / `TZ=Europe/Berlin` |
| OCR the Wasgau leaflet for the price | "Full coverage" | Unreliable prices, huge effort sink (Pitfall 1) | Only for *presence detection* + human confirm, never trusted price |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| marktguru API | Assuming it's a stable contract; no `zipCode`; ignoring its ToS | Pass `zipCode=67105`; fetch the auto key from homepage; treat as undocumented (snapshot fixtures, alert on shape change); stay private/low-volume |
| GitHub Actions cron | Expecting exact, guaranteed timing | Best-effort only; odd minute off the hour; idempotent reconcile; run daily for slack (Pitfalls 5, 4) |
| `GITHUB_TOKEN` commit-back | Default scope can't push; push re-triggers CI | `permissions: contents: write`; schedule-only trigger or `[skip ci]` (Pitfall 6) |
| GitHub Pages project site | Root-absolute paths + `start_url:"/"` | Relative paths / `<base>`; `start_url:"."`, `scope:"./"`; or use root-served Pages (Pitfall 8) |
| Service worker + data file | One cache strategy for shell and data | Cache-first shell, network-first/SWR + cache-bust for `offers.json` (Pitfall 7) |
| Store site (direct scrape) | Plain fetch of JS-rendered/store-gated page | Find the underlying XHR/JSON endpoint; pass store/PLZ; treat empty as failure (Pitfall 15) |

## Performance Traps

(Single user, tiny data — classic scale traps don't apply. The relevant "scale" axis is **time/accumulation**, not concurrency.)

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| History file grows unbounded with per-run rows | `offers.json`/history balloons; graph laggy & noisy | Upsert by offer identity; keep history compact (one row per distinct offer) | Months of daily runs |
| Free Actions minutes overrun | Build minutes near cap | Public repo = unlimited free Actions minutes; even private's 2,000/mo dwarfs a daily ~1-min job | Effectively never at daily cadence — but verify repo is public for true zero-cost |
| Pages CDN/propagation delay treated as a bug | New data not visible for a few minutes after push | Expect short propagation; rely on data freshness timestamp, not instant CDN update | Always present; only a problem if you assume instant |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Committing a marktguru/store key or cookie into the public repo | Public exposure of a credential; possible ToS/abuse issue | Fetch keys at runtime (marktguru's key is public-from-homepage); never commit secrets; use Actions Secrets if any are needed |
| Over-broad `GITHUB_TOKEN`/PAT scopes | A compromised workflow could alter the repo broadly | Least privilege: `permissions: contents: write` only; avoid a PAT unless required (Pitfall 6) |
| Trusting scraped HTML/JSON into the DOM unsanitized | Reflected/stored content from a third party rendered as HTML | Render offer text as text, not `innerHTML`; the data file is third-party-derived |
| Mixed content on the PWA | Install/HTTPS requirements fail; resources blocked | Everything over HTTPS (Pages is HTTPS by default) — no `http://` asset/data URLs (PWA install requires secure context) |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| "No offer" rendered as an error/blank | Looks broken; brother thinks app is dead | Explicit, friendly "no current 12×1L offer" state (PROJECT.md already wants this) |
| Stale data shown as if current | Acts on an expired price | Freshness banner + `generated_at` date; clearly distinct from "no offer" (Pitfall 9) |
| One broken store blanks the whole app | Loses 4 working stores over 1 failure | Per-store status; degrade just the broken store to "unavailable" |
| Best-deal highlight points at a wrong-SKU false positive | Confidently wrong; total trust loss | Only highlight confidently-matched 12×1L cases; suppress on low confidence (Pitfall 2) |
| Pfand inconsistency makes prices non-comparable | Confusing ±€3 swings | One canonical price convention shown everywhere; note Pfand separately (Pitfall 3) |
| No install affordance / broken manifest | Can't "add to home screen" (core requirement) | Valid manifest (name, icons ≥192&512, `display: standalone`, correct `start_url`/`scope`), HTTPS, verified on Android Chrome (Pitfall 8) |

## "Looks Done But Isn't" Checklist

- [ ] **Matcher:** Often missing the exclusion list — verify it rejects 1.25L/0.33L/Zero/store-brand against real captured fixtures, and reports "no confident match" rather than guessing.
- [ ] **Price:** Often missing Pfand/multi-buy normalization — verify one canonical convention and `pfand_included`/`is_multibuy` flags stored.
- [ ] **Service worker:** Often missing data-file freshness — verify the *installed* PWA on a real Android phone shows new data after a deploy (not just desktop hard-reload).
- [ ] **Pages deploy:** Often missing base-path correctness — verify manifest/SW/assets/`offers.json` load on the live `/repo/` URL (DevTools Application panel), not just localhost.
- [ ] **Scheduling:** Often missing the 60-day keepalive — verify a heartbeat commit lands within <60 days and the workflow stays enabled.
- [ ] **Commit-back:** Often missing `permissions: contents: write` — verify the scheduled (not just manual) run actually pushes.
- [ ] **Freshness UI:** Often missing a staleness indicator — verify the screen shows data age and a distinct "old data" state.
- [ ] **History:** Often missing dedupe/failure-handling — verify weekly offers produce one point (not 7) and failed fetches produce no €0 row.
- [ ] **Failure alerting:** Often missing — verify a forced scraper failure turns the Actions run red / emails the owner.
- [ ] **Regional pinning:** Often missing — verify results change with PLZ and reflect Edeka Südwest / Aldi Süd.
- [ ] **Timezone:** Often missing TZ-awareness — verify current/upcoming split is correct around midnight Berlin and survives a DST boundary (test with a faked date).

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Scheduled workflow auto-disabled (60d) | LOW | Re-enable in Actions UI; add keepalive heartbeat commit so it can't recur (Pitfall 4) |
| Stale data shipped silently for weeks | LOW–MED | Add `generated_at` + freshness banner now; backfill is impossible (data is gone) — accept gap, prevent recurrence |
| Wrong-SKU prices already in history | MEDIUM | History is re-derivable only if raw payloads were snapshotted; otherwise prune bad rows manually and add matcher fixtures so it can't recur |
| SW serving stale data on installed app | LOW (code) / MED (user) | Fix cache strategy + bump cache version + cache-bust data; user may need one online open or reinstall to pick up new SW |
| Pages base-path 404s after deploy | LOW | Switch to relative paths / add `<base>` / move to root-served Pages; redeploy |
| A store redesigned, scraper dead | MED | Per-store degrade to "unavailable" keeps app alive; re-find the new XHR endpoint or fall back to aggregator for that store |
| Pfand convention inconsistent in history | MEDIUM | If `pfand_included` flag was stored, re-normalize programmatically; if not, history is ambiguous — re-baseline going forward |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1 — Wasgau/OCR trap | Phase 1 (Data Source Spike) | Per-store tier (A/B/C) documented; OCR explicitly out of trusted-price path |
| 2 — Wrong-SKU match | Phase 2 (Matching) | Matcher passes real fixtures incl. 1.25L/0.33L/Zero/store-brand negatives |
| 3 — Pfand & multi-buy | Phase 2 (Matching) | One canonical price; `pfand_included`/`is_multibuy` flags present |
| 4 — 60-day auto-disable | Phase 3 (Scheduling) | Keepalive/heartbeat commit lands < 60 days; workflow stays enabled |
| 5 — Cron not precise | Phase 3 (Scheduling) | Job is idempotent; runs daily; logic reads dates from data, not cron time |
| 6 — Commit-back loop/perms | Phase 3 (Scheduling) | `permissions: contents: write`; schedule-only trigger; scheduled push succeeds |
| 7 — SW stale data | Phase 4 (PWA shell) | Installed Android PWA shows new data post-deploy without reinstall |
| 8 — Pages base path | Phase 4 (PWA shell/deploy) | Manifest/SW/assets/data load on live `/repo/` URL |
| 9 — Silent stale serving | Phase 2/3 (data shape) + Phase 4 (UI) | `generated_at` present; staleness banner shows; distinct from "no offer" |
| 10 — History dupes/gaps | Phase 2 (model) + Phase 3 (write) | Weekly offer = 1 point; failed fetch = no price row |
| 11 — Timezone/weekly cycle | Phase 2 + Phase 4 | Current/upcoming correct around Berlin midnight & across DST |
| 12 — Brittle, silent failure | Phase 3 (alerting) + Phase 5 (hardening) | Forced failure → red run/owner email; debounced; redesign distinguishable from quiet week |
| 13 — Legality/ToS/IP blocks | Phase 1 (source choice) | Aggregator-first; polite client; no evasion; ToS sanity-checked per direct target |
| 14 — Regional variance | Phase 1 (spike) | Results change with PLZ; Edeka Südwest / Aldi Süd confirmed |
| 15 — Store cookies/JS rendering | Phase 1 (spike) + Phase 3 | Underlying XHR endpoint used; zero-result-from-known-good-store = failure |

## Sources

- GitHub Docs — Disabling and enabling a workflow (60-day inactivity auto-disable of scheduled workflows): https://docs.github.com/actions/managing-workflow-runs/disabling-and-enabling-a-workflow — **HIGH** (official)
- GitHub Community discussions on the 60-day disable & keepalive workarounds (#57858, #32197; keepalive/immortality actions): https://github.com/orgs/community/discussions/57858 — **HIGH** (widely corroborated)
- GitHub Community discussions on cron unreliability/delays/drops under load (#147369, #156282, #52477): https://github.com/orgs/community/discussions/156282 — **HIGH** (widely corroborated, consistent with official "best effort" stance)
- web.dev — Service worker caching and HTTP caching (cache strategy by resource type; `no-cache` = revalidate): https://web.dev/articles/service-worker-caching-and-http-caching — **HIGH** (official)
- PWA caching strategy guides (network-first vs SWR vs cache-first; cache-bust dynamic data): https://borstch.com/blog/caching-strategies-in-pwa-cache-first-network-first-stale-while-revalidate-etc — **MEDIUM** (community, consistent)
- GitHub Community #188844 + base-path guides (project-site `/repo/` absolute-path 404s; manifest `start_url`/`scope`): https://github.com/orgs/community/discussions/188844 — **HIGH** (official discussion + corroborated)
- German web-scraping legal landscape (AGB, robots.txt as intent signal, §87b UrhG database right, TDM opt-out): https://www.dury.de/onlinerecht-blog-menue/731-webscraping-screenscraping-und-das-datenbankurheberrecht and Uni Hamburg handreichung — **MEDIUM/HIGH** (legal commentary; not legal advice)
- marktguru aggregator (postal-code offer search across Aldi/Lidl/REWE/Edeka/Kaufland/Netto/Penny; `api.marktguru.de/api/v1/offers/search?zipCode=`, auto-fetched key): https://www.marktguru.de/ + community usage examples — **MEDIUM** (undocumented/unofficial endpoint; verify in spike)
- Regional retail structure (Edeka Südwest as Schifferstadt region; Aldi Süd vs Nord territory) — **MEDIUM** (general domain knowledge; confirm exact branch mapping in spike)
- PROJECT.md "Known Risks" (per-store feasibility, long no-offer stretches, scraper brittleness) — **HIGH** (project ground truth)

---
*Pitfalls research for: free auto-updating local-grocery price-tracking PWA (GitHub Actions + Pages)*
*Researched: 2026-06-15*
