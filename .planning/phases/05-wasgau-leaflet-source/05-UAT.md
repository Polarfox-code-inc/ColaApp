---
status: complete
phase: 05-wasgau-leaflet-source
source: [05-VERIFICATION.md]
started: 2026-10-12T18:50:00Z
updated: 2026-10-12T20:08:38.327Z
---

## Current Test

[testing complete]

## Tests

### 1. Visual — teal Wasgau chart line and legend swatch are distinguishable on a real phone screen
expected: Wasgau's line and legend swatch (#00838F) read as a distinct colour from REWE/Edeka/Lidl/Kaufland and from the amber #9a5b00 warning colour, and its solid-filled markers are visibly different from the other stores' markers.
result: pass

### 2. Live runner reachability — after pushing to master, the Wasgau source works on GitHub Actions
expected: (1) Run the "diagnose" workflow — no "WASGAU FAILED:" line; data/wasgau-candidates.json has a leafletId matching wasgau.de's current leaflet, colaPages listing real Coca-Cola pages, and candidates with paired prices. (2) After the push-triggered "pipeline" run is green, data/status.json shows Wasgau as "offer" or "no_offer", not "error". (3) The live PWA's Wasgau card no longer reads "nicht automatisch verfügbar" and the legend lists Wasgau with a teal swatch. If (1)/(2) show an error, set `enabled: false` in scraper/wasgau/config.mjs (kill switch) and report the logged message.
result: pass

## Summary

total: 2
passed: 2
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
