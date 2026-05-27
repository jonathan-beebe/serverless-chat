import { useDisplayModeStandalone } from '../hooks/useDisplayModeStandalone'
import { useInstallPrompt } from '../hooks/useInstallPrompt'
import { Button } from './Button'
import { LiveRegion } from './LiveRegion'

// FEAT-015: small "Install" affordance for installable browsers.
//
// Render contract: visible only when the browser has fired
// `beforeinstallprompt` (captured by `useInstallPrompt`) AND the app isn't
// already running in standalone mode. The hook clears `canInstall` after the
// native prompt resolves (accept or dismiss) and on `appinstalled`, so the
// CTA self-removes — no per-session dismiss state needed.
//
// Placement is by the parent (Home renders this near the commit-hash footer
// per IMPRV-018's "quiet status surface" precedent). Inline button, not a
// fixed banner — the update prompt is fixed/bottom because reload is high-
// stakes and the user's attention is required. Install is opt-in and can sit
// quietly below the fold until the user notices it.
//
// A11y: glyph-free label so the visible text "Install app" is the accessible
// name (WCAG 2.5.3 honored by default); focus-visible ring inherited from
// Button; LiveRegion announces availability so screen-reader users hear the
// transition without needing to land on the button.
export function InstallPrompt() {
  const { canInstall, promptInstall } = useInstallPrompt()
  const standalone = useDisplayModeStandalone()

  const visible = canInstall && !standalone

  return (
    <>
      <LiveRegion>{visible ? 'Install available' : ''}</LiveRegion>
      {visible && (
        <Button variant="secondary" size="sm" onClick={() => void promptInstall()}>
          Install app
        </Button>
      )}
    </>
  )
}
