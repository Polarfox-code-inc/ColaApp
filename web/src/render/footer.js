// web/src/render/footer.js
// The freshness footer (OFFR-06 / D-17/D-18). Renders the centered, muted
// "zuletzt aktualisiert: {…} Uhr" line from the FILE-level lastUpdated — the
// "job is alive" timestamp (Phase 2 D-05). Per-store staleness lives on the cards
// (D-18), NOT here; this footer never reads a per-store lastUpdated.
//
// XSS rule (T-03-07 / ASVS V5): the timestamp is written via textContent.

import { formatTimestamp } from "../format/format.js";

const PREFIX = "zuletzt aktualisiert";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/**
 * Render the freshness footer into `mount`.
 * @param {HTMLElement} mount the #footer element
 * @param {string|null} fileLastUpdated the file-level ISO-UTC lastUpdated, or null
 */
export function renderFooter(mount, fileLastUpdated) {
  mount.replaceChildren();
  // Degrade honestly if the file-level timestamp is missing (degraded load).
  const stamp = fileLastUpdated ? formatTimestamp(fileLastUpdated) : "unbekannt";
  mount.appendChild(el("p", "footer__updated", `${PREFIX}: ${stamp}`));
}
