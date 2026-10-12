# Phase 5: Wasgau leaflet source - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-12
**Phase:** 05-wasgau-leaflet-source
**Areas discussed:** Failure & status semantics, Fetch volume & caching, Candidate capture & review (incl. uncertain parses), PWA presentation of Wasgau

---

## Failure & status semantics

| Option | Description | Selected |
|--------|-------------|----------|
| error + carry-forward | Same as marktguru stores; last-known kept, lastUpdated frozen → stale | ✓ |
| unavailable (as roadmap SC3) | Fall back to "nicht automatisch verfügbar" | |

| Option | Description | Selected |
|--------|-------------|----------|
| no_offer | Parsed fine, no cola → kein Angebot, lastUpdated bumps | ✓ |
| Keep unavailable | Only switch when an offer is found | |

| Option | Description | Selected |
|--------|-------------|----------|
| Fully independent | Separate failure paths for marktguru and Wasgau | ✓ |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Retire unavailable for Wasgau | Never emitted again | |
| Kill switch | Config flag forces Wasgau back to unavailable | ✓ |

---

## Fetch volume & caching

| Option | Description | Selected |
|--------|-------------|----------|
| Skip if leaflet id unchanged | Cheap homepage check, full download only on new id | ✓ |
| Re-download every run | Stateless, ~20 MB/day | |
| Re-download, stop early | Stop after first hit page | |

| Option | Description | Selected |
|--------|-------------|----------|
| Current leaflet only | Use angebotslink as-is | ✓ |
| Hunt for next week | Probe for preview leaflet | |

| Option | Description | Selected |
|--------|-------------|----------|
| Extracted candidates | Re-run matcher + selection each run | ✓ |
| Final Wasgau entry | Copy last entry | |

**Notes:** User then asked to explore candidate capture and review, since nobody knows yet what a positive Wasgau match looks like.

---

## Candidate capture & review

| Option | Description | Selected |
|--------|-------------|----------|
| Any Coca-Cola mention | Wide net incl. near-misses | ✓ |
| Matcher accept/review only | Narrower | |

| Option | Description | Selected |
|--------|-------------|----------|
| Committed JSON in data/ | Doubles as id cache, reviewable in git | ✓ |
| CI artifact / log only | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Force needsReview at first (probation) | Until maintainer confirms a real positive | ✓ |
| Trust the matcher immediately | | |

| Option | Description | Selected |
|--------|-------------|----------|
| needsReview | Ambiguous pairing → amber card | ✓ |
| Drop → no_offer | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Trimmed page XML | Textboxes around Cola mentions + date header | ✓ |
| Full page XML | ~400 KB each | |
| You decide | | |

---

## PWA presentation of Wasgau

| Option | Description | Selected |
|--------|-------------|----------|
| Give Wasgau a 5th line | Own colour/marker, legend note removed | ✓ |
| Keep it out for now | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Plain "Wasgau" | No change | ✓ |
| "Wasgau (Böhl-Iggelheim)" | | |

**Notes:** At the final check the user added: "Use Dudenhofen if in doubt" → Dudenhofen is the reference branch wherever a branch must be picked.

## Claude's Discretion

- Module layout, flag storage, candidate JSON shape, pairing heuristics, early-stop paging, merge/index restructuring.

## Deferred Ideas

None.
