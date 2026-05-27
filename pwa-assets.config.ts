import { defineConfig } from '@vite-pwa/assets-generator/config'

// IMPRV-023: drive `pwa-assets-generator` from `public/favicon.svg` to emit
// committed raster icons referenced by the vite-plugin-pwa manifest. Naming
// and padding deliberately diverge from the built-in `minimal2023Preset`:
//
//   - `pwa-192x192.png` / `pwa-512x512.png` use the SVG edge-to-edge (the
//     source already paints its own rounded `#0f172a` plate, so any padding
//     would shrink the brand mark inside a redundant outer margin).
//   - `pwa-maskable-512x512.png` insets the artwork ~10% so an Android
//     adaptive-icon mask can crop into the safe zone without clipping the
//     brand circles. We also paint a `#0f172a` background so the masked
//     corners match the rest of the plate.
//   - `apple-touch-icon.png` is edge-to-edge at 180x180; iOS itself rounds
//     the corners, so any pre-rounding from us would just doubly inset.
//
// The `favicon.ico` favicons entry from `minimal2023Preset` is omitted —
// `index.html` already references `favicon.svg` and the modern Safari/Chrome
// behavior is to prefer the SVG.
export default defineConfig({
  preset: {
    transparent: {
      sizes: [192, 512],
      favicons: [],
      padding: 0,
      resizeOptions: { fit: 'contain', background: 'transparent' },
    },
    maskable: {
      sizes: [512],
      padding: 0.1,
      resizeOptions: { fit: 'contain', background: '#0f172a' },
    },
    apple: {
      sizes: [180],
      padding: 0,
      resizeOptions: { fit: 'contain', background: '#0f172a' },
    },
    assetName(type, size) {
      switch (type) {
        case 'transparent':
          return `pwa-${size.width}x${size.height}.png`
        case 'maskable':
          return `pwa-maskable-${size.width}x${size.height}.png`
        case 'apple':
          return `apple-touch-icon.png`
      }
    },
  },
  images: ['public/favicon.svg'],
})
