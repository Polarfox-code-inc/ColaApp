# Phase 3: PWA Frontend - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-15
**Phase:** 3-PWA Frontend
**Areas discussed:** Look/layout/language, Hero + store cards, Price-history graph, Freshness & upcoming, PWA identity

---

## Look, Layout & Language

| Question | Option | Selected |
|----------|--------|----------|
| Visual style | Coca-Cola red accent | |
| Visual style | **Neutral / minimal** | ✓ |
| Visual style | Full Coca-Cola branding | |
| Screen order | **Hero → cards → graph → freshness footer** | ✓ |
| Screen order | Hero → freshness → cards → graph | |
| Screen order | Cards-first (no separate hero) | |
| Language | **German throughout** | ✓ |
| Language | English | |
| Formatting | **German locale (`de-DE`)** | ✓ |
| Formatting | Mixed (German dates, plain prices) | |

**Notes:** User chose a utility/minimal look over Coca-Cola branding — the app is a tool, not a marketing page. Coca-Cola red later rejected even as the PWA theme color (chose neutral dark).

---

## Hero + Store Cards

| Question | Option | Selected |
|----------|--------|----------|
| Hero content (active offer) | **Store + price + valid-until + €/l** | ✓ |
| Hero content (active offer) | Store + price only | |
| Hero content (active offer) | Store + price + valid-until (no €/l) | |
| Empty hero | **'kein aktuelles Angebot' + upcoming nudge** | ✓ |
| Empty hero | Plain 'kein aktuelles Angebot' | |
| Card order | **Best-deal-first, then by state** | ✓ |
| Card order | Fixed order (REWE…Wasgau) | |
| Card order | Offers-first, otherwise fixed | |
| Three states | **Color + icon + label, 3 clearly different** | ✓ |
| Three states | Label text only, subtle styling | |
| Three states | Two buckets + tooltip | |

**Notes:** All recommended picks. €/litre kept in the hero despite being redundant for a fixed 12L case. Lowest active price = best deal (price and €/l rank identically).

---

## Price-History Graph

| Question | Option | Selected |
|----------|--------|----------|
| Line content | Single 'best price' line across stores | |
| Line content | Single line, label each point's store | |
| Line content | **All stores as separate lines** | ✓ |
| Sparse-data honesty | **Dots until ≥3 points, then connect; break over gaps** | ✓ |
| Sparse-data honesty | Always a line, gaps break it | |
| Sparse-data honesty | Always connected, markers on points | |
| Window | **All available history** | ✓ |
| Window | Last ~12 weeks (rolling) | |
| Chart library | **uPlot** | ✓ |
| Chart library | Chart.js 4.5 | |
| Chart library | You decide | |

**Notes:** "All stores as separate lines" = HIST-03, a v2 item. Flagged the scope tension to the user (busier phone chart, legend + 5 colors, more work, Wasgau never has a line). **User consciously chose to pull HIST-03 into Phase 3** rather than keep the v1 single best-price line. Requirement mapping to be updated.

### Follow-up — Graph scope (HIST-03)

| Option | Selected |
|--------|----------|
| **Pull HIST-03 into Phase 3 — per-store lines now** | ✓ |
| Keep v1 scope: single best-price line | |
| Best-price line now, per-store as a later toggle | |

---

## Freshness & Upcoming

| Question | Option | Selected |
|----------|--------|----------|
| Stale threshold | 2 days | |
| Stale threshold | **3 days** | ✓ |
| Stale threshold | 7 days | |
| Timestamp display | Relative + absolute on tap | |
| Timestamp display | Relative only | |
| Timestamp display | **Absolute date/time only** | ✓ |
| Stale UI | App-level banner + per-store marker | |
| Stale UI | App-level banner only | |
| Stale UI | **Per-store markers only** | ✓ |
| Upcoming offers | **On the store's card, 'ab DATE' badge** | ✓ |
| Upcoming offers | Separate 'Demnächst' section | |
| Upcoming offers | Both: badge + hero nudge | |

**Notes:** User chose a quieter freshness treatment — 3-day tolerance (rides out cron skips), absolute timestamp, no global stale banner (per-store markers only). Upcoming stays per-store on the card (plus the hero empty-state nudge chosen earlier).

---

## PWA Identity

| Question | Option | Selected |
|----------|--------|----------|
| App name | 'Cola-Angebote' | |
| App name | **'ColaApp'** | ✓ |
| App name | 'Kasten-Radar' | |
| Icon style | Simple bottle/case glyph on a solid tile | |
| Icon style | Bold letter/monogram tile | |
| Icon style | **You decide** | ✓ |
| Theme color | Coca-Cola red as single accent | |
| Theme color | **Neutral dark** | ✓ |
| Theme color | Neutral light | |

**Notes:** Name matches the repo. Theme color neutral dark — consistent with the minimal UI; even the PWA chrome stays unbranded.

## Claude's Discretion

- Icon artwork (trademark-safe simple bottle/case glyph, 192/512 + maskable).
- Frontend component/file decomposition, CSS approach, exact DOM.
- Precise German label wording and color tokens for the three states + stale marker.
- uPlot per-store color palette and narrow-screen legend layout.
- Empty-graph / cold-start ("noch keine Daten") rendering.

## Deferred Ideas

- HIST-04 (all-time-low line) — v2.
- UI-01 (dark mode) — v2.
- OFFR-07 (tiered staleness escalation) — v2.
- DATA-07 (per-store fallback adapter) — v2, scraper concern.
- GitHub Actions cron + Pages serving + keepalive — Phase 4 (INFR-01..03).
- Optional `/gsd-ui-phase 3` deeper visual contract — not required.

**Moved INTO this phase by user decision:** HIST-03 (per-store history lines).
