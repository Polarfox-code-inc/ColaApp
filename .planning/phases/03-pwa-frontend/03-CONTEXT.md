# Phase 3: PWA Frontend - Context

**Gathered:** 2026-06-15
**Status:** Ready for planning

<domain>
## Phase Boundary

An installable, offline-capable PWA — built with Vite + `vite-plugin-pwa` (vanilla JS) **against the Phase 1 mocks/contract**, no live backend — that answers "where is the 12×1L Coca-Cola case cheapest right now" at a glance for one German user on his Android phone, and renders every offer / history / freshness state honestly.

**In scope (this phase's requirements):** OFFR-01..06, HIST-01, HIST-02, PWA-01, PWA-02, PWA-03 — hero best-deal, 5 always-present store cards with three distinct empty/unavailable/error states, upcoming offers, the price-history graph, the freshness/staleness display, installability, and offline-last-data + fresh-when-online.

**Scope change agreed in this discussion:** **HIST-03 (per-store history overlay lines) is consciously pulled forward from v2 into Phase 3** (see D-12). Phase 3 now also satisfies HIST-03. The requirement mapping in REQUIREMENTS.md/ROADMAP.md should be updated to reflect this.

**Out of scope (later / other):** the scraper and any live data production (Phase 2, done); GitHub Actions cron + GitHub Pages serving + end-to-end loop + keepalive (Phase 4, INFR-01..03); the data contract itself is **frozen** by Phase 1 and is NOT re-opened here. The PWA only **reads** the three `data/*.json(l)` files and **derives** the time-relative views (`upcoming`, `stale`) client-side (Phase 1 D-12).

</domain>

<decisions>
## Implementation Decisions

### Look, Layout & Language
- **D-01:** **Neutral / minimal visual style** — utility look, NOT Coca-Cola-branded. (Coca-Cola red is used only as the home-screen/PWA accent — see D-15 — not in the UI body.)
- **D-02:** **Single scrolling screen, ordered top→bottom: hero → 5 store cards → price-history graph → freshness footer.** The best-deal answer is the first thing seen.
- **D-03:** **German throughout.** All labels hardcoded German ("Bestes Angebot", "kein Angebot", "nicht automatisch verfügbar", "Fehler", "zuletzt aktualisiert", "demnächst / ab DATE"). No i18n framework (REQUIREMENTS out-of-scope).
- **D-04:** **German (`de-DE`) number/date formatting** via `Intl.NumberFormat`/`Intl.DateTimeFormat`: prices as `€10,99` (comma decimal), €/litre as `0,83 €/l`, dates as `16.06.2026` / short weekday form like `Mo 21.06.`. Price source is integer cents (Phase 1 D-09); PWA divides/formats on display.

### Hero — "Best deal right now" (OFFR-01)
- **D-05:** **Hero shows store + price + valid-until + €/litre** when ≥1 store has an **active-now** offer (e.g. "REWE — €9,99 — gültig bis Sa 21.06. — 0,83 €/l"). Because every offer is the same 12×1L case, lowest price = lowest €/litre (they rank identically), so "best deal" = lowest active price.
- **D-06:** **Hero is active-now only.** An offer whose `validFrom` is in the future (derived `upcoming`) does NOT win the hero; upcoming surfaces on cards (D-13).
- **D-07:** **Empty hero = "kein aktuelles Angebot" + upcoming nudge.** When no store has an active offer (the common real-world case), show an honest no-offer message; if an upcoming offer exists, add a nudge like "Nächstes Angebot ab Mo 23.06." `needsReview` entries are filtered out of the brother-facing view (Phase 1 D-08/D-13) and never reach the hero.

### Store Cards & The Three States (OFFR-02/03/04)
- **D-08:** **All 5 stores always rendered as cards** (fixed set — Phase 1 D-05).
- **D-09:** **Card ordering: best-deal-first, then by state.** Active offers sorted cheapest-first at the top, then upcoming, then `no_offer`, then `unavailable`/`error` at the bottom. Actionable deals float up; dead states sink.
- **D-10:** **Three visually distinct states via color + icon + label:**
  - `no_offer` → "kein Angebot", muted/grey neutral.
  - `unavailable` (Wasgau, never auto-fetchable) → "nicht automatisch verfügbar", info/blue with an "i" (expected, not broken).
  - `error` (fetch failed) → "Fehler", amber/warning.
  These three must be unmistakable (OFFR-03/04). An active offer card shows price, €/litre, and valid dates.

### Price-History Graph (HIST-01, HIST-02, + HIST-03 pulled in)
- **D-11:** **Chart library: uPlot** (~15–25 KB, canvas). CLAUDE.md's primary pick; our use (sparse weekly lines, gaps, markers, few axis labels) is simple.
- **D-12:** **Per-store separate lines (HIST-03 pulled into v1, user-confirmed).** One colored line per store with offer history: REWE, Edeka, Lidl, Kaufland. **Wasgau has no line** (always `unavailable`). Needs a legend + a stable per-store color mapping. The lowest line at any date is visually the best price (covers HIST-01).
- **D-13-graph:** **Honest sparse/gap handling (HIST-02), applied per line:** with 1–2 points for a store, show **markers only** (no trend line); from **3+ points**, connect them; where a store has a stretch with **no qualifying offer, break the line** (gap) — never interpolate a slope across a no-offer gap.
- **D-14:** **Default window = all available history.** Show everything collected (tiny dataset: ≤5 stores, weekly). No pan/zoom/window concept in v1.

### Upcoming Offers (OFFR-05)
- **D-13:** **Upcoming offers surface on the store's own card as an "ab Mo 23.06." badge** (derived: `validFrom` in the future), visually distinct from an active offer ("demnächst"). Card-sorting floats an upcoming offer above `no_offer`. (Plus the hero empty-state nudge from D-07; no separate "Demnächst" section.)

### Freshness & Staleness (OFFR-06)
- **D-16:** **Stale threshold = 3 days.** A store whose per-store `lastUpdated` (Phase 2 D-05) is older than 3 days is marked stale. Tolerant of occasional GitHub cron skips/weekends while still catching a genuinely dead store/pipeline. Derived client-side so it stays correct while the PWA sits open offline (Phase 1 D-12).
- **D-17:** **Timestamp display = absolute date/time only** (e.g. "15.06.2026 06:00 Uhr"), `de-DE` formatted. (No relative "vor 2 Stunden" form.)
- **D-18:** **Stale indication = per-store markers only** (no global app-level banner). Each store whose own `lastUpdated` is stale gets a marker on its card; freshness footer shows the file/last-updated time.

### PWA Home-Screen Identity (PWA-01)
- **D-19:** **App name: "ColaApp"** (matches repo). `short_name` can be a trimmed form if needed.
- **D-20:** **PWA theme color: neutral dark** (dark grey / near-black) for status-bar tint, splash, app-switcher accent — consistent with the minimal UI (D-01).
- **D-21:** **Manifest essentials:** `display: standalone`, `start_url`, 192 + 512 + maskable icons (per CLAUDE.md), HTTPS (provided by Pages in Phase 4).

### Offline & Freshness Plumbing (PWA-02, PWA-03)
- **D-22:** **`vite-plugin-pwa` `generateSW` (Workbox 7).** Precache the app shell (HTML/JS/CSS/icons). Add a **runtime caching route for the `data/*.json(l)` files using StaleWhileRevalidate** (or NetworkFirst with cache fallback) → offline shows last-fetched data (PWA-02), online pulls fresh rather than serving stale prices indefinitely (PWA-03). **No push/notifications** permissions (out of scope) — SW is caching-only.

### Claude's Discretion
- **Icon artwork** — user said "you decide": produce a **simple, trademark-safe** icon (e.g. a generic bottle/12-pack-case silhouette on a solid tile, NOT the real Coca-Cola logo) at 192/512 + maskable.
- **Component/file decomposition** of the vanilla-JS frontend (modules for hero / card / graph / freshness), CSS approach, and exact DOM structure — open, as long as it matches the decisions above and stays framework-free per CLAUDE.md.
- **Exact wording/iconography** of German labels and the precise color tokens for the three states (D-10) and stale marker — propose against the intent (clearly distinct, neutral palette).
- **uPlot per-store color palette** and legend layout on a narrow phone screen — choose for legibility.
- **Empty-graph / cold-start rendering** (when `price-history.jsonl` has 0 points) — show an honest "noch keine Daten" state rather than an empty axis.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The frozen contract (the hard constraint — read first)
- `contract/schema.mjs` — the zod schemas the PWA consumes: `CurrentOffersSchema`, `HistoryLineSchema`, `StatusFileSchema`, the `STORES` allow-list, `STATUS_VALUES`. The PWA reads files conforming to these.
- `contract/types.d.ts` — TypeScript types mirroring the schema (`StoreOffer`, `CurrentOffers`, `HistoryLine`, `StoreStatus`, `StatusFile`) for editor types **without importing zod at runtime** — built specifically for this PWA phase. `status` enum is `offer|no_offer|unavailable|error`; `needsReview` must be filtered out of the brother-facing view; price is integer cents; `pricePerLitre` integer cents/litre; dates `YYYY-MM-DD` Berlin; `lastUpdated` ISO-UTC.
- `mocks/current-offers.{offer,no_offer,upcoming,error,stale,unavailable}.json` + `mocks/status.stale.json` — **the PWA is built against these six UI-state mocks** (one per state). Every UI state must render correctly from these without a live scraper.
- `data/current-offers.json`, `data/status.json`, `data/price-history.jsonl` — the real current output shape (also usable as fixtures).

### Prior decisions the PWA must honor (derivation rules)
- `.planning/phases/01-data-contract-source-spike/01-CONTEXT.md` — D-08 (`needsReview` filtered from view), **D-12** (PWA DERIVES `upcoming` = future `validFrom` and `stale` = age of `lastUpdated`; scraper states facts only), D-13 (date semantics + ISO-UTC `lastUpdated` for precise staleness math), D-14 (history line shape powering the graph).
- `.planning/phases/02-core-scraper/02-CONTEXT.md` — **D-05** (two timestamp meanings: file-level `lastUpdated` always bumps = "job is alive"; per-store `lastUpdated` frozen on error/unavailable = what powers honest per-store staleness, D-16/D-18), D-03 (Wasgau always `unavailable` → never a graph line, D-12), D-07 (active-first/upcoming selection that the hero/cards reflect).

### Requirements & scope
- `.planning/REQUIREMENTS.md` — OFFR-01..06, HIST-01/02 (**and HIST-03, now pulled into this phase**), PWA-01..03 (this phase's mapped requirements). Note the **Out of Scope** table (no push, no accounts, single product/language) and **v2** items (HIST-04 all-time-low line, UI-01 dark mode, OFFR-07 tiered staleness) that stay deferred.
- `.planning/ROADMAP.md` — Phase 3 goal + 5 success criteria (the acceptance bar) and the **UI hint: yes** marker (a deeper visual contract can optionally be produced via `/gsd-ui-phase 3`).

### Stack & PWA guidance
- `CLAUDE.md` — **TL;DR/Recommended Stack** (Vite 7 + `vite-plugin-pwa` 1.x/Workbox 7, vanilla JS), **uPlot** vs Chart.js (uPlot chosen, D-11), **"PWA installability & offline-last-data"** (manifest requirements, StaleWhileRevalidate runtime route for the data files, no push — D-21/D-22), and **"What NOT to Use"** (no framework, no push/backend, no heavy charting libs).
- `package.json` — current toolchain: ESM, Node ≥22, `type: module`, zod dep, `node --test`. The frontend is a new `web/` (Vite) workspace added under this repo.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `contract/types.d.ts` — import for editor types in the PWA (no runtime zod). Single source of the data shapes.
- `contract/schema.mjs` — optional runtime validation of fetched data before render (defensive; the contract is shared with the scraper).
- `mocks/*.json` + `data/*.json(l)` — ready-made fixtures for every UI state; the PWA is developed entirely against these (no live backend in this phase).

### Established Patterns
- ESM, Node ≥22, native tooling, zero-framework. The frontend adds a Vite build (`web/`) but stays vanilla JS — no React/Vue (CLAUDE.md "What NOT to Use").
- Repo uses `node --test`; the PWA's logic units (derivation of `upcoming`/`stale`, best-deal selection, sparse/gap graph prep, `de-DE` formatting) should be unit-testable in the same style.

### Integration Points
- The three `data/*.json(l)` files are the sole producer→consumer interface; **this phase is the consumer**. It reads the files (served as static assets) and renders. Nothing wires to live data until Phase 4 (cron + Pages). Until then it reads committed `data/` and/or `mocks/`.
- A new `web/` directory (Vite project) is the home of the PWA; its build output is what Phase 4 will serve via GitHub Pages.

</code_context>

<specifics>
## Specific Ideas

- **Honesty over polish** drove most picks: three genuinely-distinct store states (D-10), no trend line from <3 points and no interpolation across no-offer gaps (D-13-graph), per-store staleness markers (D-18), and a clear empty-hero (D-07). The data model deliberately encodes these distinctions; the UI must not blur them.
- **Utility, not a brand showcase** (D-01) — neutral UI body, with Coca-Cola red reserved only as a home-screen accent decision the user ultimately set to **neutral dark** (D-20). The app should feel like a tool he checks, not a marketing page.
- User **consciously expanded** the graph to per-store lines (D-12) over the recommended single best-price line — they want to see each store's price trajectory, accepting the busier phone chart.
- "Show the deal he can act on today" (carried from Phase 2 D-07): hero = active-now only (D-06), upcoming as a look-ahead badge (D-13), never a substitute.

</specifics>

<deferred>
## Deferred Ideas

- **HIST-04** — all-time-low reference line on the graph — stays **v2**.
- **UI-01** — dark mode via `prefers-color-scheme` — stays **v2** (this phase ships a single neutral theme; D-20 theme color is the PWA chrome, not an in-app dark mode).
- **OFFR-07** — tiered staleness escalation (fresh → aging → prominent banner) — stays **v2**. This phase uses a single 3-day per-store stale marker (D-16/D-18), no global banner.
- **DATA-07** — per-store direct fallback adapter — **v2**, and a scraper concern, not PWA.
- **GitHub Actions cron + GitHub Pages serving + end-to-end loop + keepalive** — **Phase 4** (INFR-01..03). This phase is built against committed `data/`/`mocks/`, not a live feed.
- **Optional `/gsd-ui-phase 3`** — a deeper visual design contract (exact spacing, color tokens, typography) could be generated before/after planning given the ROADMAP "UI hint: yes". Not required; the decisions above are sufficient to plan.

None of these are scope creep into Phase 3 — they are correctly downstream. (HIST-03 is the one item deliberately moved **into** this phase by user decision — see D-12.)

</deferred>

---

*Phase: 3-PWA Frontend*
*Context gathered: 2026-06-15*
