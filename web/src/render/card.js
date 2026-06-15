// web/src/render/card.js
// The store-card render module (OFFR-02/03/04 / D-08/09/10/13/18). Renders all
// five stores in the given sorted order, each carrying ONE of the unmistakable
// states — active / upcoming / no_offer / unavailable / error — via the
// color + icon + label triple from the UI-SPEC State-chips table (state is never
// color-only — WCAG 1.4.1). Active cards add the price row; upcoming cards show
// the "demnächst — ab {…}" badge instead; a per-store stale store adds a
// "⚠ veraltet" chip in Row 1 (D-18, per-store only — no global banner).
//
// XSS rule (T-03-07 / ASVS V5): EVERY value — data (displayName, price, dates)
// and the fixed German labels/glyph icons alike — is written via textContent on a
// createElement node. This module never assigns innerHTML at all.
//
// State derivation: active/upcoming come from derive.isActive/isUpcoming against
// the threaded `today`; staleness from derive.isStale against the per-store status
// and the threaded `now`. Everything funnels through the pure layer so a
// needsReview offer can never present as active/upcoming.

import { isActive, isUpcoming, isStale, berlinToday } from "../derive/derive.js";
import {
  formatPrice,
  formatPerLitre,
  formatValidUntil,
} from "../format/format.js";

// Hardcoded German chip labels (D-03 — verbatim from the UI-SPEC Copywriting Contract).
const LABEL = {
  active: "aktiv",
  no_offer: "kein Angebot",
  unavailable: "nicht automatisch verfügbar",
  error: "Fehler",
  stale: "veraltet",
};

// Fixed inline-SVG / glyph icon literals per state (never data). Each pairs with
// the color + label so the state is unmistakable beyond color alone (D-10).
const ICON = {
  active: "✓",
  upcoming: "→",
  no_offer: "–",
  unavailable: "i",
  error: "!",
  stale: "⚠",
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// A state chip: icon span (fixed glyph) + label span (fixed German literal). The
// data-state attribute drives the semantic color/tint from styles.css (never
// inline hex — UI-SPEC token contract).
function chip(state, label) {
  const c = el("span", "chip");
  c.dataset.state = state;
  c.appendChild(el("span", "chip__icon", ICON[state]));
  c.appendChild(el("span", "chip__label", label));
  return c;
}

// Map a non-active/non-upcoming raw status to its card state + label. A
// quarantined/expired offer falls back to no_offer (mirrors derive's bucket).
function rawState(status) {
  if (status === "unavailable") return "unavailable";
  if (status === "error") return "error";
  return "no_offer";
}

/**
 * Render the five store cards into `mount`, in the given sorted order.
 * @param {HTMLElement} mount the #cards section
 * @param {Array<object>} sortedStores StoreOffer[] already sorted by derive.sortCards
 * @param {Record<string, object>} statusByStore store -> StoreStatus (for staleness)
 * @param {Date} now the single captured clock instant (threaded, never re-read)
 */
export function renderCards(mount, sortedStores, statusByStore, now) {
  mount.replaceChildren();
  const today = berlinTodayFromNow(now);
  for (const store of sortedStores ?? []) {
    mount.appendChild(renderCard(store, statusByStore, now, today));
  }
}

// renderCards receives `now` (the single captured Date) and converts it ONCE to
// the Berlin `today` string the active/upcoming predicates need — this is a pure
// conversion of the threaded clock, not a second clock read (no new Date()).
function berlinTodayFromNow(now) {
  return berlinToday(now);
}

function renderCard(store, statusByStore, now, today) {
  const card = el("article", "card");

  const active = isActive(store, today);
  const upcoming = isUpcoming(store, today);

  // data-state drives the 1px left state-edge color (UI-SPEC token contract).
  const state = active ? "active" : upcoming ? "upcoming" : rawState(store.status);
  card.dataset.state = state;

  // --- Row 1: store name + state chip (+ optional veraltet chip) ---
  const row1 = el("div", "card__row card__row--head");
  row1.appendChild(el("h3", "card__store", store.displayName));

  const chips = el("div", "card__chips");
  if (active) {
    chips.appendChild(chip("active", LABEL.active));
  } else if (upcoming) {
    // Upcoming uses the info badge as its primary chip (see Row 2 below too).
    chips.appendChild(upcomingBadge(store));
  } else {
    chips.appendChild(chip(state, LABEL[state]));
  }

  // Per-store stale marker (D-18) — only when this store's own lastUpdated is old.
  const storeStatus = statusByStore?.[store.store];
  if (storeStatus && isStale(storeStatus, now)) {
    chips.appendChild(chip("stale", LABEL.stale));
  }

  row1.appendChild(chips);
  card.appendChild(row1);

  // --- Row 2: active price row, OR upcoming badge line, OR nothing ---
  if (active) {
    card.appendChild(activePriceRow(store));
  } else if (upcoming) {
    card.appendChild(upcomingLine(store));
  }

  return card;
}

// Active Row 2: accent-green price + €/l + "gültig bis {…}" (all muted but price).
function activePriceRow(store) {
  const row = el("div", "card__row card__row--price");
  row.appendChild(el("span", "card__price price", formatPrice(store.price)));
  row.appendChild(el("span", "card__perlitre", formatPerLitre(store.pricePerLitre)));
  row.appendChild(
    el("span", "card__validity", `gültig bis ${formatValidUntil(store.validTo)}`),
  );
  return row;
}

// The upcoming chip shown in Row 1: "demnächst — ab {Wochentag TT.MM.}" (info).
function upcomingBadge(store) {
  const c = el("span", "chip");
  c.dataset.state = "upcoming";
  c.appendChild(el("span", "chip__icon", ICON.upcoming));
  c.appendChild(
    el("span", "chip__label", `demnächst — ab ${formatValidUntil(store.validFrom)}`),
  );
  return c;
}

// Upcoming Row 2: the announced price as a look-ahead (muted, not accent green —
// it is not actionable today). Mirrors the active row shape without affirmation.
function upcomingLine(store) {
  const row = el("div", "card__row card__row--upcoming");
  row.appendChild(el("span", "card__price price", formatPrice(store.price)));
  row.appendChild(el("span", "card__perlitre", formatPerLitre(store.pricePerLitre)));
  return row;
}
