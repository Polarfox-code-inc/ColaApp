---
phase: quick-260616-ixt
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/public/catlogo.png
  - web/index.html
  - web/src/styles.css
autonomous: true
requirements: [QUICK-260616-ixt]
must_haves:
  truths:
    - "A cat logo image is visible at the very bottom of the PWA page, below the freshness footer"
    - "The logo is centered, width-constrained, and does not break the single-column layout"
    - "The logo loads offline (precached by the service worker) and resolves under the /ColaApp/ subpath with no 404"
  artifacts:
    - path: "web/public/catlogo.png"
      provides: "The cat logo asset served under /ColaApp/ and precached by Workbox"
    - path: "web/index.html"
      provides: "Static <img> markup for the logo at the bottom of the page"
      contains: "catlogo.png"
    - path: "web/src/styles.css"
      provides: "Tasteful, token-based styling for the logo"
      contains: "site-logo"
  key_links:
    - from: "web/index.html"
      to: "web/public/catlogo.png"
      via: "img src resolved against the /ColaApp/ base"
      pattern: "catlogo\\.png"
---

<objective>
Add the cat logo image to the very bottom of the ColaApp PWA page as a static, decorative, centered, size-constrained element.

Purpose: A small personalization touch for a single-user hobby PWA. The user expressed no styling preference, so sensible defaults apply.
Output: `web/public/catlogo.png` (copied asset), a static `<img>` in `web/index.html` below the footer, and minimal token-based CSS in `web/src/styles.css`.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@web/index.html
@web/vite.config.js
@web/src/styles.css
@web/src/main.js
</context>

<tasks>

<task type="auto">
  <name>Task 1: Copy the cat logo asset into web/public/</name>
  <files>web/public/catlogo.png</files>
  <action>Copy the source PNG from `D:/codingprojects/carddesigner/cardkartoffel/resources/catlogo.png` to `web/public/catlogo.png`. Use a binary-safe copy (PowerShell `Copy-Item` or the Bash `cp`); do NOT round-trip it through any image tool. The cardkartoffel repo is only the source location — make no changes there. Placing the file in `web/public/` means Vite serves it at the build base (`/ColaApp/catlogo.png` per vite.config.js `base`) and Workbox `generateSW` precaches it via the existing glob `**/*.{js,css,html,svg,png,ico,webmanifest}` (so it works offline). Do NOT import the image through JS and do NOT add any npm dependency.</action>
  <verify>
    <automated>test -f web/public/catlogo.png && node -e "const s=require('fs').statSync('web/public/catlogo.png'); process.exit(s.size>300000 && s.size<320000 ? 0 : 1)"</automated>
  </verify>
  <done>`web/public/catlogo.png` exists and is the ~308 KB source file (size between 300 KB and 320 KB confirms a clean binary copy).</done>
</task>

<task type="auto">
  <name>Task 2: Add static logo markup and token-based styling</name>
  <files>web/index.html, web/src/styles.css</files>
  <action>In `web/index.html`, add a static `<img>` for the logo immediately AFTER the `<footer id="footer">…</footer>` line but still INSIDE `<main class="app">` (i.e. as the last child of `<main>`, after the four existing sections). Wrap it for styling/spacing, e.g. `<div class="site-logo"><img class="site-logo__img" src="catlogo.png" alt="" width="640" height="480" loading="lazy" decoding="async" /></div>`. Use a RELATIVE `src="catlogo.png"` (no leading slash) so it resolves under the `/ColaApp/` Pages subpath exactly like the relative `start_url`/`scope` already do (RESEARCH Pitfall 4). Use `alt=""` because the logo is purely decorative (keeps it out of the accessibility tree; do not invent meaning). Include the intrinsic `width`/`height` (640×480) to reserve layout space and avoid CLS. This is STATIC markup only — it must NOT go through main.js's data-driven, textContent-only render path, which keeps it XSS-safe by construction.

In `web/src/styles.css`, append a small block (after the existing footer styles) using ONLY existing `:root` tokens: `.site-logo` centers the image (`text-align: center` or `display:flex; justify-content:center`) and adds vertical breathing room above it (e.g. `margin-top: var(--space-xl)`); `.site-logo__img` constrains size responsively (`max-width: 200px; width: 60%; height: auto; display: block; margin-inline: auto`) so it stays tasteful within the 480px `--content-max-width` column and never overflows on a phone. Respect the dark PWA chrome but keep the body's neutral light theme — do not introduce new colors or hex values. Do NOT alter the manifest `start_url`/`scope` or the existing icons.</action>
  <verify>
    <automated>grep -q 'catlogo.png' web/index.html && grep -q 'site-logo' web/src/styles.css && node -e "const h=require('fs').readFileSync('web/index.html','utf8'); const m=h.indexOf('id=\"footer\"'); const i=h.indexOf('catlogo.png'); process.exit(i>m && i>-1 ? 0 : 1)"</automated>
  </verify>
  <done>`web/index.html` contains a static `<img>` referencing `catlogo.png` positioned AFTER `<footer id="footer">`; `web/src/styles.css` contains a `.site-logo` rule block using only existing tokens. No manifest/icon changes.</done>
</task>

<task type="auto">
  <name>Task 3: Build and verify the asset resolves under /ColaApp/</name>
  <files>web/index.html</files>
  <action>Run the production build from the `web/` directory (`cd web; npm run build`) and confirm it succeeds with no errors. Then verify the build output: `dist/catlogo.png` exists (Vite copied the public asset) and `dist/index.html` references the logo such that it resolves to `/ColaApp/catlogo.png` under the Pages base (Vite rewrites the relative `catlogo.png` against `base:'/ColaApp/'` during the build). Confirm there is no 404 path mismatch. Do not modify the data contract, scraper, or CI pipeline. If the build surfaces the logo as not precached, confirm `catlogo.png` is matched by the existing Workbox glob (it is a `.png`) — no config change should be needed.</action>
  <verify>
    <automated>cd web && npm run build && test -f dist/catlogo.png && grep -q 'catlogo.png' dist/index.html</automated>
  </verify>
  <done>`npm run build` succeeds; `web/dist/catlogo.png` exists; `web/dist/index.html` references the logo resolving to `/ColaApp/catlogo.png` (no 404). The build's precache includes the PNG via the existing glob.</done>
</task>

</tasks>

<verification>
- `web/public/catlogo.png` exists (~308 KB clean binary copy).
- `web/index.html` has a static `<img>` (decorative `alt=""`, intrinsic dimensions, relative `src`) positioned after `<footer id="footer">`, inside `<main class="app">`.
- `web/src/styles.css` has a `.site-logo` block using only existing `:root` tokens (centered, width-constrained, dark-theme-respecting).
- `cd web && npm run build` succeeds; `dist/catlogo.png` exists and `dist/index.html` points at `/ColaApp/catlogo.png` with no 404.
- No new npm dependencies; no changes to the data contract, scraper, CI, manifest `start_url`/`scope`, or existing icons.
- The logo is NOT injected through the data-driven, textContent-only render path (it is static markup), preserving the XSS-safe-by-construction property.
</verification>

<success_criteria>
The cat logo appears centered and size-constrained at the very bottom of the PWA page (below the freshness footer), loads correctly under the `/ColaApp/` GitHub Pages subpath, is precached for offline use, and does not break the single-column layout or introduce any new dependencies or contract changes.
</success_criteria>

<output>
Create `.planning/quick/260616-ixt-add-the-cat-logo-image-to-the-bottom-of-/260616-ixt-SUMMARY.md` when done
</output>
