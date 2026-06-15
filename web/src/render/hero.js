// web/src/render/hero.js
// The hero render module (OFFR-01 / D-05/06/07). Builds the "Bestes Angebot"
// section: either the active best-deal affirmation (big accent-green price + store
// + valid-until + €/litre, 3px accent left edge) or the honest empty state
// ("Kein aktuelles Angebot") with an upcoming nudge when one exists.
//
// XSS rule (T-03-07 / ASVS V5): every data value is written via textContent on a
// createElement node — NEVER innerHTML. Store names additionally come from the
// frozen STORES allow-list upstream, but textContent is the hard guard here.
//
// Because Plan-02 bestDeal is active-now ONLY (D-06), this module never receives a
// future-validFrom offer as bestDeal — it can only render an upcoming via the
// soonestUpcoming nudge in the empty state.

import {
  formatPrice,
  formatPerLitre,
  formatValidUntil,
} from "../format/format.js";

// Hardcoded German copy (D-03 — verbatim from the UI-SPEC Copywriting Contract).
const COPY = {
  title: "Bestes Angebot",
  empty: "Kein aktuelles Angebot",
  none: "Zurzeit ist der 12×1-l-Kasten nirgends im Angebot.",
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/**
 * Render the hero into `mount`. Clears the mount first so re-renders are clean.
 * @param {HTMLElement} mount the #hero section
 * @param {{ bestDeal: object|null, soonestUpcoming: object|null }} view
 *   bestDeal — the cheapest ACTIVE offer (D-06; never a future offer), or null.
 *   soonestUpcoming — the earliest upcoming offer for the empty-state nudge, or null.
 */
export function renderHero(mount, { bestDeal, soonestUpcoming } = {}) {
  mount.replaceChildren();

  // Section label (always present).
  mount.appendChild(el("h2", "hero__title", COPY.title));

  if (bestDeal) {
    renderActive(mount, bestDeal);
  } else {
    renderEmpty(mount, soonestUpcoming);
  }
}

// Active best-deal card: accent-green price, store name, and the muted
// "gültig bis {…} · {€/l}" supporting line, with a 3px accent left edge (via class).
function renderActive(mount, deal) {
  const card = el("div", "hero__card hero__card--active");

  const price = el("p", "hero__price price", formatPrice(deal.price));
  const store = el("p", "hero__store", deal.displayName);

  const validUntil = formatValidUntil(deal.validTo);
  const perLitre = formatPerLitre(deal.pricePerLitre);
  const support = el(
    "p",
    "hero__support",
    `gültig bis ${validUntil} · ${perLitre}`,
  );

  card.appendChild(price);
  card.appendChild(store);
  card.appendChild(support);
  mount.appendChild(card);
}

// Empty state: "Kein aktuelles Angebot" + an upcoming nudge if one exists, else
// the "nirgends im Angebot" line. Neutral surface (no accent green).
function renderEmpty(mount, soonestUpcoming) {
  const card = el("div", "hero__card hero__card--empty");

  card.appendChild(el("p", "hero__empty", COPY.empty));

  let body;
  if (soonestUpcoming) {
    const when = formatValidUntil(soonestUpcoming.validFrom);
    body = el(
      "p",
      "hero__body",
      `Nächstes Angebot ab ${when} bei ${soonestUpcoming.displayName}.`,
    );
  } else {
    body = el("p", "hero__body", COPY.none);
  }
  card.appendChild(body);
  mount.appendChild(card);
}
