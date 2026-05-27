import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const commitHash = execSync('git rev-parse --short HEAD 2>/dev/null || echo dev').toString().trim()
const base = process.env.VITE_BASE || '/'

// ARCH-001: GitHub Pages serves `404.html` (relative to the project root) for
// any request that doesn't match a file. By emitting a `404.html` that is
// byte-identical to the built `index.html`, the SPA bundle loads at the same
// asset paths and react-router hydrates against the original `location.pathname`
// — deep links like `/serverless-chat/conversation/<id>` Just Work. The
// alternative (`location.replace('/')` from a stub 404) is broken under any
// non-root deployment because `/` is the github.io ROOT, not the project base.
// Cloudflare/Netlify users hit `public/_redirects` and never see this file.
function spa404Fallback() {
  return {
    name: 'spa-404-fallback',
    apply: 'build',
    closeBundle() {
      const outDir = resolve('dist')
      copyFileSync(resolve(outDir, 'index.html'), resolve(outDir, '404.html'))
    },
  }
}

export default defineConfig({
  base,
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash),
  },
  plugins: [
    react(),
    tailwindcss(),
    spa404Fallback(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'P2P Chat',
        short_name: 'P2P Chat',
        description: 'Serverless peer-to-peer chat over WebRTC. No accounts, no servers — just a shared link.',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        scope: base,
        start_url: base,
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
})
