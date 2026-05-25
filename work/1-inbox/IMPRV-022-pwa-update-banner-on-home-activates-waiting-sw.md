---
id: IMPRV-022
type: improvement
status: open
created: 2026-05-25
---

# IMPRV-022: PWA update banner on Home prompts user to activate waiting service worker

## Problem

vite-plugin-pwa is installed and configured at vite.config.js:40-74 with
`registerType: 'prompt'`, but the React-side wiring is missing. main.tsx:18
calls only `registerSW({ immediate: true })` (the non-React entry, no
`onNeedRefresh` callback), no source file imports `useRegisterSW` from
`virtual:pwa-register/react` (the React stub in
src/**mocks**/virtual-pwa-register-react.ts is referenced only by
vitest.config.ts:12), and no banner / prompt component exists. When a new build
deploys, the service worker downloads it in the background and parks in the
"waiting" state; the user is never told and the new version never activates
until every tab of the app is fully closed and reopened.

## Outcome

When a new service worker reaches the `waiting` state, a small banner appears at
the bottom of the viewport on the Home screen only, reading something like "A
new version is available" with an Update button and a Dismiss affordance.
Tapping Update activates the waiting SW and reloads the page on the new build.
Tapping Dismiss hides the banner for the rest of the session; the waiting SW
stays queued and the banner re-appears on the next page load if the user still
hasn't updated. On the connected chat surface (Offerer/Joiner `connected`
branch) and on the setup branches (invite/reply/closed), the banner does not
render, so an in-progress WebRTC session is never disrupted by an update prompt.
After a successful update + reload, the new build's commit hash (rendered on
Home per IMPRV-018) changes — verifying the update actually landed.

## Why it matters

The app is a static SPA on GitHub Pages with a long-lived service worker.
Without an in-app update path, fixes (including the bug/improvement tickets this
project ships almost daily) reach users only when they happen to close every tab
— which on iOS standalone PWAs may be never. The mechanism for prompting already
exists in `registerType: 'prompt'`; only the UI surface that closes the loop is
missing.

## Discovery notes

- `registerType: 'prompt'` is already the right config for this UX —
  `autoUpdate` would silently swap the SW and skip the banner entirely, which is
  what we don't want.
- The React entry point is
  `import { useRegisterSW } from 'virtual:pwa-register/react'`. It exposes
  `{ needRefresh: [bool, setBool], offlineReady, updateServiceWorker(reloadPage?: boolean) }`.
  `updateServiceWorker(true)` is the one-call "skip waiting + reload" path.
- The current `registerSW({ immediate: true })` call in main.tsx becomes
  redundant once `useRegisterSW` is mounted at the app root — pick one path,
  don't run both.
- The "Home only" rule maps to App.tsx's route shape: the banner can be rendered
  inside the Home screen, or rendered at the App level and gated on route.
  Either is fine; the maker decides.
- The dismiss-per-session state lives in component memory only (matches the rest
  of the app's "no localStorage" stance — same call as FEAT-011's timestamp
  toggle).
- vitest aliases the React entry to the mock, so existing tests keep working.
  New tests for the banner mount the real component and drive `needRefresh` via
  the mock's exported setters — extend the mock if it needs to be more
  spy-friendly.

## Recommendation

- Replace `registerSW({ immediate: true })` in `src/main.tsx` with a small
  `<UpdatePrompt />` component mounted near the App root that calls
  `useRegisterSW({ immediate: true })` from `virtual:pwa-register/react`.
- Render the banner only when `needRefresh[0] === true` AND the current route is
  Home (gate on route via react-router's `useLocation`, or render inside
  `Home.tsx` and let the hook live there — whichever falls out cleaner).
- Banner UX: bottom-fixed (`fixed inset-x-0 bottom-0`), uses existing
  `<Callout>` / `<Button>` primitives, contains a short message + an Update
  primary button + a Dismiss secondary button. Update calls
  `updateServiceWorker(true)`. Dismiss flips a local `useState` to hide for this
  session.
- The dismissed state is component-local (no localStorage); on next page load
  the hook re-evaluates `needRefresh` and the banner returns if the new SW is
  still waiting.
- Use `<LiveRegion>` to announce "App update available" when the banner appears
  (parallels FEAT-011's announcement pattern; A11Y-012 sets the precedent for
  connection-state announcements).
- Extend `src/__mocks__/virtual-pwa-register-react.ts` so tests can flip
  `needRefresh` and observe `updateServiceWorker` calls. Add a small test
  asserting: banner is absent when `needRefresh=false`; banner appears on Home
  when `needRefresh=true`; banner does not appear on connected chat; clicking
  Update calls `updateServiceWorker(true)`; clicking Dismiss hides the banner
  for the session.
- Don't bundle: changing `registerType` to `autoUpdate`. The "user-controlled"
  UX is the whole point of this ticket.

## Related work

- ARCH-001 — GitHub Pages SPA routing + `_redirects`, defines the deployment
  context this update flow runs in.
- IMPRV-018 — Home shows the short commit SHA; gives the user (and triage) an
  at-a-glance way to confirm the update reloaded them onto the new bundle.
- vite.config.js:40-74 — existing VitePWA config; `registerType: 'prompt'`
  already opts out of silent auto-update.
- src/main.tsx:18 — current `registerSW({ immediate: true })` call; the place
  wiring is missing.
- src/**mocks**/virtual-pwa-register-react.ts — pre-stubbed `useRegisterSW`
  shape, ready for a real consumer to import.
