---
id: FEAT-015
type: feature
status: resolved
created: 2026-05-27
---

# FEAT-015: install pwa cta and standalone detection

## Problem

The app captures no PWA install signal. `src/main.tsx` registers the service
worker via `useRegisterSW` (inside `src/components/UpdatePrompt.tsx`) but no
listener exists for `window.addEventListener('beforeinstallprompt', …)` and the
`BeforeInstallPromptEvent` is never preserved. `src/screens/Home.tsx` ends at
the commit-hash text node (line 625) and surfaces no "Install" affordance near
the primary "Start a chat" Button (line 579) or anywhere else. The app also has
no runtime awareness of standalone-vs-tab; `vite.config.js:49` declares
`display: 'standalone'` in the manifest but nothing reads
`matchMedia('(display-mode: standalone)')`, so other surfaces (e.g., the
IMPRV-022 update banner) cannot specialize on install state.

## Outcome

On Chrome/Edge desktop + Android, when the browser fires `beforeinstallprompt`,
the user sees an "Install" affordance on Home that, when activated, invokes the
captured event's `prompt()` and resolves the user's choice; on acceptance the
affordance disappears and does not return for this install. On iOS Safari (no
`beforeinstallprompt`), in already-installed standalone mode, and on any browser
that never fires the event, the affordance is absent — no broken button, no dead
prompt. The system also exposes installed/standalone state (via
`matchMedia('(display-mode: standalone)').matches` plus its `change` listener)
in a place other components can read, so future surfaces can branch on it.

## Why it matters

Users on installable browsers currently have to discover the URL bar's install
icon themselves — a near-zero discovery rate. An in-app affordance closes the
install loop the same way IMPRV-022 closed the update loop. As an open-source
reference, the repo benefits from demonstrating a complete PWA lifecycle
(manifest → install prompt capture → update prompt → standalone detection)
rather than only half of it.

## Discovery notes

- `beforeinstallprompt` fires once on Chromium-based browsers (Chrome
  desktop/Android, Edge, Brave, Samsung Internet) when install criteria are met;
  default-prevent it to hold the event, then call `evt.prompt()` later. Firefox
  and iOS Safari never fire it.
- `appinstalled` window event fires after a successful install across all
  PWA-capable browsers; this is the reliable signal to clear any captured prompt
  and hide the CTA.
- Standalone detection is cross-browser via
  `window.matchMedia('(display-mode: standalone)').matches`; iOS Safari
  additionally exposes the non-standard `navigator.standalone` boolean — using
  both as a union covers iOS-installed PWAs that Chrome's media query misses.
- The captured `BeforeInstallPromptEvent` is consumable once per session; after
  `userChoice` resolves it cannot be re-prompted, so the affordance must drop
  after either outcome until the event fires again.
- `useRegisterSW` already runs at the AppShell level; a new `useInstallPrompt`
  hook or `<InstallPrompt />` component can mount alongside it without
  re-architecting registration.
- `vite.config.js:49` already sets `display: 'standalone'`; no manifest change
  is required for this feature.

## Related work

- IMPRV-022 — UpdatePrompt component; canonical pattern for capturing a PWA
  browser event, gating display on route, dismiss-per-session, LiveRegion
  announcement.
- IMPRV-018 — commit-hash on Home; precedent for a small, quiet status surface
  on Home and the "render at bottom of ScreenContainer" placement convention.

## Working

Mechanism: two hooks + one component.

- `src/hooks/useInstallPrompt.ts` — captures the `beforeinstallprompt` event
  (default-prevent so the captured event is re-prompt-able), exposes
  `{ canInstall, promptInstall }`. Clears state on `appinstalled` and after
  `userChoice` resolves. Single subscribe at mount; cleans up on unmount.
- `src/hooks/useDisplayModeStandalone.ts` — reads
  `matchMedia('(display-mode: standalone)').matches || navigator.standalone`,
  subscribes to the media query's `change` event so other surfaces can branch on
  standalone state in real time (e.g. add-to-Home-screen on iPad without
  reload). Exposes a boolean.
- `src/components/InstallPrompt.tsx` — owns the UI. Mounted in `Home.tsx` near
  the commit-hash footer (per IMPRV-018 "quiet status surface" precedent) so the
  CTA doesn't compete with "Start a chat." Renders only when
  `canInstall && !standalone`. LiveRegion announcement on visibility, focus-
  visible ring on the button. Dismiss is implicit via accept/dismiss of the
  native prompt — once `userChoice` resolves, the hook clears state and the CTA
  disappears.

Why split UpdatePrompt vs InstallPrompt: different lifecycle (browser event vs
SW state), different surface (inline footer vs fixed banner), different gating
(canInstall+!standalone vs needRefresh+route). Sharing would force shape
compromises on both.

Tests: dedicated mocks via `window.dispatchEvent` of a fake
`BeforeInstallPromptEvent`-shaped object. No new mock module needed — listeners
attach to real `window` and we synthesize events in `act(...)`.

Resolution: 19 new tests across the two hooks and the component. The
`Event('beforeinstallprompt')` constructor defaults to non-cancelable; tests
pass `{ cancelable: true }` so `evt.preventDefault()` actually flips
`defaultPrevented` (the real browser event ships cancelable). `npm run ci` is
all green.
