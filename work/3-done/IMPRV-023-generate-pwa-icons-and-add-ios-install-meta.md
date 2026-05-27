---
id: IMPRV-023
type: improvement
status: resolved
created: 2026-05-27
---

# IMPRV-023: generate pwa icons and add ios install meta

## Problem

`vite.config.js:52-68` declares manifest icons at `pwa-192x192.png` and
`pwa-512x512.png`, but `public/` contains only `favicon.svg` and `_redirects` —
no raster icons exist. The Workbox precache glob (`vite.config.js:72`) silently
skips the missing PNGs, so a built manifest points at 404s and install prompts
(Chrome/Android, iOS Add-to-Home) fall back to a generic glyph. `index.html`
(lines 1-20) has no `<link rel="apple-touch-icon">`, no
`<meta name="apple-mobile-web-app-capable">`, and no
`<meta name="apple-mobile-web-app-status-bar-style">`, so iOS Add-to-Home shows
a screenshot thumbnail instead of an app icon and the status bar reverts to the
default opaque treatment instead of matching the `#0f172a` theme. The
maskable-icon entry (lines 64-68) reuses the same 512 source that doesn't exist,
so even when assets do land an Android adaptive-icon mask will crop the existing
artwork incorrectly unless drawn with a safe zone.

## Outcome

After install on Android/Chrome, the launcher tile shows the P2P Chat brand mark
(the two-circle motif from `favicon.svg`) at 192px and 512px. After iOS
Add-to-Home, the home-screen icon shows the same brand mark (not a page
screenshot) and launching it presents a status bar styled to match the dark
`#0f172a` theme rather than the default light bar. Lighthouse's PWA
installability audit reports all icon checks passing; no 404s for `pwa-*.png`
appear in the network panel on first load. The brand mark inside an Android
maskable mask is not cropped at the edges (safe-zone respected).

## Why it matters

This is a static SPA the user is expected to install (per IMPRV-022's
update-banner work, the project is explicitly investing in standalone PWA UX). A
generic icon and the wrong iOS status-bar treatment make an installed instance
look broken or untrusted on the device the user spends most time on, undermining
the "real app" framing the rest of the install flow has set up. Manifest 404s
also fail Lighthouse PWA-installability and can suppress Chrome's install prompt
entirely on some Android versions.

## Discovery notes

- `public/favicon.svg` is a 64x64 viewBox with three primitives (rounded square
  `#0f172a`, two circles `#0ea5e9`/`#38bdf8`, white connector) — clean enough to
  rasterize at arbitrary sizes without manual cleanup.
- `vite-plugin-pwa` reads files placed in `public/` at build time and emits them
  under the configured `base`; it does not rasterize SVGs.
  `includeAssets: ['favicon.svg']` (`vite.config.js:42`) precaches the SVG but
  does not generate the PNGs.
- Apple Safari never reads `manifest.webmanifest` for the home-screen icon — it
  requires `<link rel="apple-touch-icon">` in HTML; the canonical size is
  180x180 (one entry suffices).
- `apple-mobile-web-app-status-bar-style="black-translucent"` is the iOS
  analogue of the existing `theme-color` meta (`index.html:9-10`).

## Recommendation

Generate `pwa-192x192.png`, `pwa-512x512.png`, a separate maskable
`pwa-maskable-512x512.png` (artwork inset ~10% for the Android safe zone), and
`apple-touch-icon.png` (180x180) from `public/favicon.svg`. Either (a) use
`vite-plugin-pwa`'s built-in `pwa-assets` generator
(`@vite-pwa/assets-generator`) driven from `favicon.svg` for a reproducible
build-time pipeline, or (b) rasterize once with `sharp` / `resvg` and commit the
PNGs to `public/`. Option (a) keeps the repo small and avoids drift; option (b)
avoids a new devDependency. Split the maskable icon into its own `src` so the
standard icons keep edge-to-edge artwork. Add three lines to `index.html`
`<head>`: `apple-touch-icon` link, `apple-mobile-web-app-capable=yes`,
`apple-mobile-web-app-status-bar-style=black-translucent`. Verify via Lighthouse
PWA audit and a real iOS Add-to-Home pass.

## Related work

- IMPRV-022 — wires `useRegisterSW` + update banner; same VitePWA config block
  (`vite.config.js:40-74`) is the install-asset surface.
- IMPRV-018 — Home-screen commit-hash badge; same "this is a real installed app"
  framing.
- FEAT-005 — system-font stance; same minimal-asset philosophy this ticket
  should honor.
- ARCH-001 — GitHub Pages base-path deployment; icon paths in the manifest are
  resolved against `base`, so any new asset must be referenced as a
  root-relative path the plugin can rewrite.

## Working

- 2026-05-27:08:44:54 — started
- Chose option (a): added `@vite-pwa/assets-generator` as a devDependency with a
  `pwa-assets.config.ts` driving it from `public/favicon.svg`, plus
  `scripts.generate:icons` (`npm run generate:icons`). Committed the PNGs to
  `public/` for reproducibility — Vite already copies `public/` verbatim into
  `dist/`, so the manifest icons resolve at build time without re-running the
  generator. Built-in `minimal2023Preset` was close but emits an unwanted
  `favicon.ico` and prepends `apple-touch-icon-180x180.png`; the config
  overrides `assetName` and zeroes `padding` for the transparent/apple icons
  (the SVG paints its own `#0f172a` plate) while keeping `padding: 0.1` and a
  `#0f172a` background on maskable so the Android adaptive-icon safe zone is
  honored.
- Generated icons (all PNG, edge-to-edge except maskable):
  `public/pwa-192x192.png` (192x192), `public/pwa-512x512.png` (512x512),
  `public/pwa-maskable-512x512.png` (512x512, 10% inset), and
  `public/apple-touch-icon.png` (180x180).
- `vite.config.js` manifest now splits the maskable entry to its own
  `pwa-maskable-512x512.png` `src` (was aliasing `pwa-512x512.png`).
- `index.html` head additions: `<link rel="apple-touch-icon">` with a
  root-relative `/apple-touch-icon.png` (HTML link is left as-written by Vite;
  the manifest's relative `src` values are the ones the plugin rewrites under
  `base`, so a root-relative path here is intentional under the default `/` base
  and remains valid behavior under the GH Pages base — the link is purely
  iOS-facing and absolute-from-root is the conventional spelling),
  `<meta name="apple-mobile-web-app-capable" content="yes" />`, and
  `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />`.
- Tests live in `src/pwa-icons.test.ts` (node env via pragma): one asserts the
  three iOS meta lines in `index.html`, the other parses the icons array out of
  `vite.config.js` and verifies every `src` resolves to an existing file in
  `public/` and that the maskable `src` no longer aliases the standard 512.
- `npm run ci` green. `npm run build` emits all four PNGs into `dist/` and the
  built `dist/manifest.webmanifest` references `pwa-maskable-512x512.png` for
  the maskable entry.
- 2026-05-27:08:49 — done
