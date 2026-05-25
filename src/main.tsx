import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import './index.css'

// ARCH-001: restore the original deep-link path the GH Pages 404.html stashed
// before it bounced us to /. Cloudflare/Netlify users hit `_redirects` and
// land on the real URL directly, so this short-circuits when there's no
// stashed entry. Done before React mounts so BrowserRouter reads the right
// location on the very first render.
const spaRedirect = sessionStorage.getItem('__spa_redirect')
if (spaRedirect) {
  sessionStorage.removeItem('__spa_redirect')
  try {
    const url = new URL(spaRedirect)
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  } catch {
    // Malformed value (manual sessionStorage edit / cross-origin junk) —
    // discard it and stay on /.
  }
}

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// PWA registration. `prompt` mode means the user gets to choose when to update —
// no surprise reloads in the middle of a chat.
registerSW({ immediate: true })
