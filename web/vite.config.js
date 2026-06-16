// web/vite.config.js
// Vite build + VitePWA generateSW config (D-19..D-22 / PWA-01/02/03).
// Source: vite-pwa-org.netlify.app/guide + /workbox/generate-sw.html (RESEARCH Pattern 6).
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Phase 4 sets base:'/ColaApp/' for the GitHub Pages subpath. Keep start_url/scope
  // relative ('./') so the shell stays subpath-safe (RESEARCH Pitfall 4).
  base: '/ColaApp/', // D-08: served at https://polarfox-code-inc.github.io/ColaApp/
  server: {
    // Allow importing the frozen ../../contract/*.mjs from web/ in dev (RESEARCH Pitfall 7).
    fs: { allow: ['..'] },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate', // shell updates without a prompt (PWA-03, T-03-01)
      injectRegister: 'auto',
      manifest: {
        name: 'ColaApp', // D-19
        short_name: 'ColaApp', // D-19
        description: 'Wo der 12×1-l-Coca-Cola-Kasten in Schifferstadt im Angebot ist',
        lang: 'de', // D-03
        display: 'standalone', // D-21
        start_url: './', // relative => survives a Pages base subpath (Pitfall 4)
        scope: './', // caching-only, narrow scope (T-03-02 / D-22)
        theme_color: '#1A1D21', // D-20 neutral dark
        background_color: '#FFFFFF',
        icons: [
          // Three SEPARATE entries — never combine both purposes on one (Pitfall 4 / D-21).
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the app shell (HTML/JS/CSS/icons/manifest) (D-22 / PWA-02).
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        runtimeCaching: [
          {
            // Function urlPattern matches on url.pathname => robust under a Pages subpath
            // (Pitfall 4). Matches data/*.json and data/*.jsonl.
            urlPattern: ({ url }) => /\/data\/.*\.(json|jsonl)$/.test(url.pathname),
            handler: 'StaleWhileRevalidate', // offline last-data (PWA-02) + bg refresh (PWA-03). NOT CacheFirst (T-03-01).
            options: {
              cacheName: 'cola-data',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: true }, // exercise the SW in dev
    }),
  ],
});
