# Feature Research

**Domain:** Single-product, single-user "is it on sale near me" offer-tracker PWA (Coca-Cola 12×1L Kasten, 5 fixed Schifferstadt stores)
**Researched:** 2026-06-15
**Confidence:** HIGH

> Scope note: PROJECT.md is unusually complete and deliberately narrow. This research does not try to broaden it. Its job is to (a) define a faithful v1 feature set, (b) specify *how* the few features should behave (empty states, upcoming view, sparse-history graph, PWA niceties), and (c) name the scope-creep temptations to refuse — including ones not yet listed in Out of Scope. Anything that smells like growing the app is flagged, not recommended.

## Feature Landscape

### Table Stakes (Users Expect These)

For *this* app, "table stakes" means: if missing, the brother opens it and it fails its one job. German offer apps (marktguru, kaufDA) all center on the same primitives — current offer, validity dates, upcoming leaflet — so even a one-product clone must nail those.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Current-offer view: per-store cards** showing store name, price (€), valid-from / valid-to dates | This *is* the app's core value. One glance = "is the Kasten on sale and where" | LOW | 5 fixed cards. Each card: store logo/name, big price, date range, a small "current" badge. Cards with no live offer still render (greyed, "kein Angebot"), so the set always looks complete, not half-loaded |
| **Best-current-deal highlight** across the 5 stores | "Which store is cheapest right now" is the decision he actually makes | LOW | Pick min price among *currently-valid* offers; visually promote that card (border/badge "Bester Preis"). Tie-break: cheapest, then nearest valid-to? Keep simple — cheapest wins, ties show both |
| **Clear "no current offer anywhere" state** | Pinning to exactly 12×1L *will* produce long dry spells (PROJECT.md Known Risk). Must read as "nothing on sale", not "app broken" | LOW–MEDIUM | Deliberate, friendly empty state: headline like "Gerade kein Angebot" + subtext "Zuletzt geprüft: <timestamp>". Still show the 5 store cards in a neutral resting state so the screen has structure. This is a *designed* state, not a fallback — see Dependencies |
| **Upcoming offers (next week)** per store with price + valid-from/valid-to | German leaflets publish ~a week ahead; "next week REWE 11€" is a named user expectation in PROJECT.md and Context | MEDIUM | Separate section/tab below current. Each upcoming offer shows the future date range explicitly so "starts Mon 23rd" is unambiguous. If none known, a quiet "Keine angekündigten Angebote" — not an error |
| **"Last updated" / staleness timestamp** | Auto-fetched data can silently go stale if a scraper breaks (Known Risk). User must trust freshness at a glance | LOW | Show "Zuletzt aktualisiert: vor 3 Std." from the data file's generated-at field. If older than threshold (e.g. >36h), show a subtle stale warning. Single source of truth for the empty-state subtext too |
| **Offline display of last-fetched data** | A PWA opened with no/poor signal must still show the last known answer, not a blank/error | LOW–MEDIUM | Service worker caches the data JSON + shell. Cache-first for shell, stale-while-revalidate for data. Combined with the staleness timestamp, offline is honest: "here's what we last knew, as of X" |
| **Installable to Android home screen (PWA)** | Explicit requirement; "add to home screen, no sideloading" is the entire delivery model | LOW | Web app manifest (name, icons, theme, standalone display) + HTTPS (GitHub Pages gives this) + a service worker. Chrome on Android then offers install |
| **Price-history graph of the 12×1L case over time** | Explicit v1 requirement; lets him judge whether a current price is *actually* good vs. just "an offer" | MEDIUM | See Differentiators for the *shape* of the minimum useful version. It's table stakes that it exists in v1, but its polish level is where judgment applies |

### Differentiators (Competitive Advantage)

This app has no competitors in the usual sense — it competes against the brother manually checking 5 leaflets. The "differentiator" framing here means: the bits that make it genuinely pleasant and trustworthy rather than just functional. They align with Core Value ("accurately, with the price and the dates") and the "spotting a genuinely good price" rationale for the graph.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Price-history graph — minimum useful version** | Turns "is this on sale" into "is this a *good* price for the year" | MEDIUM | Recommended minimum: a single **best-price-per-week line** (the cheapest of the 5 stores each week), with **markers/dots on weeks that had an actual offer**. This answers the real question ("how does today compare to the usual low?") without the clutter of 5 overlapping store lines. Per-store lines are a v1.x upgrade, not minimum |
| **Sparse-data handling for the graph** | Early on there will be only a few data points; a near-empty chart looks broken | LOW–MEDIUM | When <N weeks of data (e.g. <4), show the points as dots and a caption "Verlauf wächst — noch wenig Daten" instead of a misleading trend line. Plot only weeks with data; don't interpolate across "no offer" gaps (gaps are meaningful). Optionally annotate the all-time-low price so even 3 points are useful |
| **Offer markers / "best ever" reference on the graph** | Context: "11€ is the lowest it's been in months" is more actionable than a raw number | LOW | Dot/flag on offer weeks; a faint horizontal line at the historical minimum. Cheap to add once history exists; high interpretive value |
| **Honest staleness UX (not just a timestamp)** | Trust. If the scraper dies, the app degrades visibly instead of lying with old data shown as current | LOW | Tiered: fresh (silent), aging (subtle "vor X Std."), stale (visible "Daten evtl. veraltet"). Differentiates a trustworthy tool from a stale cache |
| **At-a-glance answer at the top** | He opens it for one second; the answer should be readable before scrolling | LOW | A single hero line: e.g. "REWE — 10,99 € (bis Sa)" or "Aktuell kein Angebot". The cards/graph are the detail beneath. This is layout, near-zero cost, high value |

### Anti-Features (Commonly Requested, Often Problematic)

These restate PROJECT.md Out of Scope and add adjacent temptations that will *feel* reasonable mid-build. Each is a deliberate refusal. The pattern across German offer apps (kaufDA/marktguru ship shopping lists, cashback, favorites, notifications, multi-retailer, multi-product) is exactly the bloat this app exists to avoid — they are the anti-feature catalogue.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **More than the 5 stores** | "Just add Trinkgut/Globus too" | Each store is bespoke scraping + brittleness; breaks the "fixed, known branches" simplicity (PROJECT.md) | Refuse. Scope is intentionally 5. Re-evaluate only as a *separate* future project |
| **Other products** | "Track water / beer / Fanta too" | Multiplies scraping, matching ambiguity, and UI complexity by N; kills the single-glance design | Refuse. Single-product is the design. Out of Scope |
| **Other pack sizes / Cola variants** (1.25L 6-pack, can trays) | "The 6-pack was cheaper this week" | Reintroduces the exact matching ambiguity the 12×1L pin was chosen to eliminate | Refuse. Strictly 12×1L. Out of Scope |
| **Push notifications / alerts** | "Tell me when it drops" | Needs push infra, service-worker push, permission flow, a backend trigger — contradicts "static PWA, he checks himself" | Refuse. He opens and checks. Out of Scope. (The upcoming-offer view already pre-empts most "did I miss it" anxiety) |
| **Accounts / login / personalization** | "Save my preferences" | One user, fixed config. Auth is pure overhead and a privacy surface for nothing | Refuse. Out of Scope. Config is hardcoded |
| **Native app / app store** | "Feels more legit" | Sideloading or store review; PWA install already meets the need | Refuse. PWA add-to-home-screen. Out of Scope |
| **General price comparison beyond Cola** | "Make it a mini-marktguru" | That's literally marktguru/kaufDA; rebuilding them abandons the entire point | Refuse. This is a Cola-Kasten tool, not a comparison platform |
| **Shopping list** | Every German offer app has one | Single product — a list of one item is absurd. Pure feature-cargo-culting | Refuse. New adjacent temptation; name it now |
| **Favorites / multi-store-area selection** | Standard in offer apps | Stores are fixed; nothing to favorite or pick | Refuse. New adjacent temptation |
| **Settings/config screen in the UI** | "Let me tweak thresholds, stores" | Invites scope; config belongs in the repo/data file, edited by the author, not the user | Refuse for v1. Author edits config in source |
| **User-facing manual price entry / correction** | "Let me fix a wrong price" | Re-introduces the manual checking the auto-fetch exists to remove; adds write paths, storage, trust issues | Refuse. If a scraper is wrong, fix the scraper. Data is read-only to the user |
| **Map / directions to the store** | "Show me where REWE is" | He lives there and knows all 5 branches; pure bloat | Refuse. Stores are local and known (PROJECT.md Context) |
| **Cookie/consent banners, analytics, tracking** | "Measure usage" | One known user; GDPR surface and clutter for zero insight value | Refuse. No analytics, no cookies, no consent banner needed |
| **Multi-language / i18n framework** | "Make it translatable" | One German-speaking user; an i18n layer is overhead | Keep copy in German inline. No i18n framework |
| **Dark mode toggle, theming, settings polish** | "Nice to have" | Real time sink for one user. A single clean theme (optionally respecting OS `prefers-color-scheme`) is plenty | At most: honor OS dark preference via CSS. No toggle UI |

## Feature Dependencies

```
[Scheduled scraper → data JSON file]   (the data contract; from PROJECT.md, not a UI feature)
        │ everything below reads this one file
        ├──enables──> [Current-offer per-store cards]
        │                   └──requires──> [Best-current-deal highlight]
        │                   └──requires──> ["No current offer" empty state]
        ├──enables──> [Upcoming-offers view]   (reads future-dated entries)
        ├──enables──> [Price-history graph]
        │                   └──requires──> [Sparse-data handling]
        │                   └──enhanced by──> [Offer markers / all-time-low line]
        └──provides──> [generated-at timestamp]
                            └──enables──> ["Last updated" / staleness indicator]
                            └──feeds────> [Empty-state subtext "zuletzt geprüft"]

[Service worker]
        └──enables──> [Offline display of last-fetched data]
        └──requires-for──> [PWA installability]   (manifest + SW + HTTPS)
        └──interacts-with──> [Staleness indicator]   (cached data must show ITS age, not "now")

[Push notifications] ──conflicts──> [Static PWA / "he checks himself" model]   (deliberately excluded)
```

### Dependency Notes

- **Everything UI depends on the data file's shape.** The single biggest design lever is the JSON schema the scraper emits: it must carry, per store, current offer (price, valid_from, valid_to), upcoming offer(s), and a top-level `generated_at`. Plus an append-only history series for the graph. Get this contract right and every UI feature is a thin read. This belongs in ARCHITECTURE/STACK research, but FEATURES depends on it.
- **Best-deal highlight requires the current-offer cards** and a defined notion of "currently valid" (today within valid_from..valid_to). Upcoming offers must be excluded from "best current deal" or it lies.
- **The "no offer" empty state is a first-class state, not error handling.** It depends only on the data file resolving to "zero currently-valid offers" — distinct from "fetch failed" (which is a *staleness* problem). The two must look different: empty = "nothing on sale (and that's normal)"; stale/failed = "data may be old".
- **Staleness indicator + offline display are coupled.** When the SW serves cached data offline, the displayed `generated_at` age is what makes it honest. Don't show cached data as if fresh.
- **Sparse-data handling enhances (is required for) the graph at launch.** History starts empty; without sparse handling the flagship graph looks broken on day one. It must ship *with* the graph, not after.
- **Push conflicts with the whole model.** Listed to document the deliberate exclusion for roadmap clarity.

## MVP Definition

### Launch With (v1)

Minimum viable product — validates "when the Kasten is on sale, the app shows it accurately."

- [ ] **Scheduled scraper → single data JSON** (current + upcoming + history + generated_at) — every UI feature reads this; without it there's no app
- [ ] **Per-store current-offer cards** (price + valid-from/valid-to, all 5 stores always rendered) — the core view
- [ ] **Best-current-deal highlight** — the actual decision he makes
- [ ] **Designed "no current offer anywhere" state** — required because long dry spells are expected, not exceptional
- [ ] **Upcoming-offers view** (next-week offers with future date ranges) — named user expectation; German leaflet cadence
- [ ] **"Last updated" / staleness indicator** — trust in auto-fetched data
- [ ] **Offline display of last-fetched data** (service worker cache) — PWA must show last-known answer
- [ ] **PWA installability** (manifest + SW + HTTPS) — the entire delivery model
- [ ] **Price-history graph — minimum version** (best-price-per-week line + offer markers) — explicit v1 requirement
- [ ] **Sparse-data handling for the graph** — must ship with the graph or it looks broken at launch
- [ ] **At-a-glance hero answer at top** — near-zero cost, large usability win for a one-second open

### Add After Validation (v1.x)

Add once the core is confirmed useful — only if the brother actually wants more detail.

- [ ] **Per-store history lines** (toggle to overlay all 5 stores) — trigger: he asks "which store is usually cheapest", not just "what's the low"
- [ ] **All-time-low reference line + "X% below average" label on the graph** — trigger: enough history accumulated to be meaningful (months)
- [ ] **OS dark-mode respect via `prefers-color-scheme`** — trigger: only if he mentions it; pure polish
- [ ] **Tiered staleness escalation** (subtle → visible "Daten veraltet" banner) — trigger: a real scraper outage happens and old data was shown too quietly

### Future Consideration (v2+)

Deferred — and most should stay deferred permanently per the narrow-scope mandate.

- [ ] (Intentionally near-empty.) The roadmap should *resist* a v2 feature list. The honest "future" answer for most additions is "no" — that's the anti-feature table. Anything genuinely new (more stores, more products) is a **separate project**, not a v2 of this one.
- [ ] Possible exception worth only *noting*: if Wasgau (Known Risk: PDF/image-only leaflets) proves unscrapeable, a deliberately-degraded "Wasgau: nicht automatisch verfügbar" card is a v1.x honesty feature, not a v2 ambition.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Per-store current-offer cards | HIGH | LOW | P1 |
| Best-current-deal highlight | HIGH | LOW | P1 |
| "No current offer" designed empty state | HIGH | LOW | P1 |
| Upcoming-offers view | HIGH | MEDIUM | P1 |
| "Last updated" / staleness indicator | HIGH | LOW | P1 |
| Offline display of last-fetched data | MEDIUM | LOW–MEDIUM | P1 |
| PWA installability | HIGH | LOW | P1 |
| Price-history graph (minimum: best-price line + markers) | HIGH | MEDIUM | P1 |
| Sparse-data handling for graph | MEDIUM | LOW–MEDIUM | P1 (ships with graph) |
| At-a-glance hero answer | MEDIUM | LOW | P1 |
| Per-store overlay history lines | MEDIUM | MEDIUM | P2 |
| All-time-low / below-average labels | MEDIUM | LOW | P2 |
| OS dark-mode respect | LOW | LOW | P3 |
| Tiered staleness escalation banner | MEDIUM | LOW | P2 |
| Shopping list / favorites / accounts / push / more stores / more products | NEGATIVE | — | Anti-feature (do not build) |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when validated
- P3: Nice to have, future consideration

## Competitor Feature Analysis

The "competitors" are full German offer apps. The instructive finding: they share a feature core this app *should* mirror (current offer, validity dates, upcoming leaflet) and a feature bloat this app *should* drop (lists, cashback, favorites, notifications, multi-retailer). The brother's true competitor is manually flipping 5 leaflets.

| Feature | marktguru | kaufDA | Our Approach |
|---------|-----------|--------|--------------|
| Current offers w/ validity dates | Yes, across many retailers | Yes, weekly ads | **Yes** — but only Cola 12×1L at 5 fixed stores |
| Upcoming / next-week leaflets | Yes (browse future Prospekte) | Yes (swipe weekly ads) | **Yes** — dedicated upcoming section, the key expectation |
| Price history over time | Limited / not a focus | No | **Yes** — our differentiator; minimum = best-price-per-week + markers |
| Best-deal-for-this-product highlight | Via product search across stores | Via search | **Yes, built-in** — it's the whole home screen, no search needed |
| Shopping list | Yes | Yes | **No** — single product; absurd here (anti-feature) |
| Cashback / receipt scanning | Yes | No | **No** — out of scope |
| Push notifications / favorites | Yes | Yes | **No** — static PWA, he checks himself |
| Accounts / login | Yes | Yes | **No** — one user, hardcoded config |
| Multi-retailer / multi-product breadth | Yes (their entire value) | Yes | **No** — narrow by design; breadth is the anti-pattern |
| Installable without store | App-store native | App-store native | **PWA add-to-home-screen** — no sideloading, no store |

**Takeaway for roadmap:** copy the *information design* of the current/upcoming offer view from these apps (it's a solved, familiar pattern German users already read fluently), and explicitly refuse their growth features. The app's edge over both is that it answers one precise question with zero search and adds a price-history graph they don't emphasize.

## Sources

- [kaufDA: Einkaufsliste & Deals — Google Play](https://play.google.com/store/apps/details?id=com.bonial.kaufda&hl=en) — feature set: weekly ads, deals, shopping list (the bloat to avoid)
- [marktguru — leaflets & offers — Google Play](https://play.google.com/store/apps/details?id=com.marktguru.mg2.de&hl=en_US) — current/upcoming leaflets, product search, favorites, cashback (core to mirror vs. features to drop)
- [marktguru Prospekte & Angebote — App Store](https://apps.apple.com/de/app/marktguru-prospekte-angebote/id1064025602) — confirms current+upcoming leaflet model and German weekly cadence
- [Caching strategies in PWA: cache-first, network-first, stale-while-revalidate — Borstch](https://borstch.com/blog/caching-strategies-in-pwa-cache-first-network-first-stale-while-revalidate-etc) — basis for offline display + staleness coupling (cache shell, stale-while-revalidate data)
- [Best Practices for PWA Offline Caching Strategies — PixelFreeStudio](https://blog.pixelfreestudio.com/best-practices-for-pwa-offline-caching-strategies/) — freshness/staleness handling for cached data
- PROJECT.md (Core Value, Active requirements, Out of Scope, Context, Known Risks) — primary source for scope boundaries and the deliberate-narrowness mandate

---
*Feature research for: single-product single-user offer-tracker PWA (Coca-Cola 12×1L, Schifferstadt)*
*Researched: 2026-06-15*
