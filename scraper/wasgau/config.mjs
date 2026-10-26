// scraper/wasgau/config.mjs
//
// Wasgau leaflet source switches (Phase 5). This header is the maintainer manual.
//
//   enabled   Kill switch (D-04). `false` means: no leaflet request at all,
//             Wasgau goes back to the fixed "unavailable" in current-offers.json
//             and status.json (exactly as before Phase 5), and the PWA greys
//             the Wasgau legend item.
//
//   probation Forces every Wasgau offer to needsReview (D-12), so it never
//             headlines the hero and never enters price-history.jsonl. Flip it
//             to `false` only after checking a real `verdict: "accept"`
//             candidate in data/wasgau-candidates.json against the leaflet image
//             (price, size 12 x 1 l, dates).
//             Status: lifted 2026-10-26 after checking the page-1 accept
//             candidate of leaflet ep1rP1V0 ("WASGAU Prospekt ab 26.10.") against
//             the leaflet image: 10.99 EUR, Kiste 12 x 1-l-MW-Flaschen, valid
//             26.-31.10. Set it back to `true` if a mis-parsed Wasgau price ever
//             reaches the hero or price-history.jsonl.
//
// Flipping either flag is a one-line commit (the GitHub web editor is enough);
// the pipeline's push trigger then runs the scrape immediately.
//
// Why a committed constant and not GitHub repository variables (RESEARCH Open
// Question 1 / A3): it is versioned, visible in git history next to the change
// that motivated it, and adds no hidden state outside the repo.
//
// Tests override these per run via run({ wasgau: { config } }).

export const WASGAU_CONFIG = Object.freeze({ enabled: true, probation: false });
