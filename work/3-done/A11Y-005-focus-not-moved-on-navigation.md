# A11Y-005: Focus is not moved when navigating between screens

**Status:** Resolved **WCAG:** 2.4.3 Focus Order (Level A) **Severity:** High
**Location:** `src/App.tsx` (lines 42-49), `src/screens/Home.tsx`,
`src/screens/Offerer.tsx`, `src/screens/Joiner.tsx`

## Problem

`App.tsx` swaps the whole tree on a button click:

```tsx
switch (route.kind) {
  case 'home':
    return <Home onStart={() => setRoute({ kind: 'offerer' })} />
  case 'offerer':
    return <Offerer session={session} onCancel={goHome} />
  case 'joiner':
    return (
      <Joiner session={session} offerCode={route.offerCode} onCancel={goHome} />
    )
}
```

When the user clicks "Start a chat", "Accept", "Decline", "Cancel", or "End
chat", the button they pressed is unmounted with the old screen. Browsers then
drop focus to `document.body`. There is no focus management on:

- Home → Offerer
- Joiner accept screen → Joiner reply-code screen (state-only transition inside
  `Joiner`)
- Offerer → Connected
- Joiner → Connected
- Connected (either side) → Home via "End chat"

Consequences:

- A keyboard-only user has to Tab from the top of the document to reach the new
  primary action.
- A screen-reader user gets no signal that the page changed (compounded by the
  static `<title>`, A11Y-003), because focus is on `<body>` and nothing is
  announced.
- "Decline" and "End chat" exhibit the same problem in reverse, dumping the user
  back to the body of the Home screen.

## Intended behavior

After a route or state transition that replaces the primary content, focus
should land on a meaningful starting point on the new screen — typically the new
`<h1>` (programmatically focusable) or the primary action/input.

## Suggested fix

Pick one consistent pattern and apply it everywhere:

1. **Focus the new h1** — give each screen's `<h1>` a `ref` and `tabIndex={-1}`,
   then call `ref.current?.focus()` in a `useEffect` keyed on the relevant state
   (`route.kind`, `accepted`, `session.state === 'connected'`).
2. **Focus the primary control** — e.g., focus the Copy button on Offerer's
   invite view, focus the chat input when entering the Connected view, focus
   "Start a chat" when returning Home.

Option 1 is more general and pairs naturally with A11Y-002 (adding `<main>`) and
A11Y-003 (updating `<title>`).

Add `outline-none` only with `focus-visible:` so the programmatic focus doesn't
show a ring when triggered without keyboard intent.

## Working notes

- Confirmed the issue still exists: `App.tsx` swaps subtrees (`Home` → `Offerer`
  → `Joiner`), and each screen also has internal branches (Offerer invite ↔
  connected; Joiner invite → reply → connected). None of these call `.focus()`
  on the new tree, so the browser drops focus to `<body>`.
- No prior focus-management code lives in `src/` (verified with a `focus` /
  `tabIndex` grep), so this is a new pattern, not a regression.
- Chose option 1 from the ticket: focus the new `<h1>`. It's the most general
  approach and composes with the `<main>` landmark (A11Y-002) and dynamic title
  (A11Y-003) already in place.
- Added a small `useFocusOnMount<T>(deps?)` hook so the rule is encoded once.
  Callers pass a discriminator (e.g. `[isConnected]` on Offerer, `[branch]` on
  Joiner) to re-focus when an in-component branch swap mounts a different
  heading.
- Each `<h1>` now carries `ref={headingRef}` + `tabIndex={-1}` +
  `focus:outline-none`. The negative tabindex keeps the heading out of the
  natural tab order; `focus:outline-none` suppresses the ring on the
  programmatic focus (the interactive controls below still use `focus-visible:`
  for keyboard intent).
- `useFocusOnMount` uses `focus({ preventScroll: true })` so the focus call
  can't fight React's commit-at-top behavior on a fresh screen.
- Added an App-level test asserting focus lands on the Home `<h1>` on mount and
  on the Joiner `<h1>` when a hash arrives. Locks in the navigation-focus
  contract.
- `npm test` → 45 passing (was 44). `npm run lint` and `npm run typecheck`
  clean.

## Files changed

- `src/hooks/useFocusOnMount.ts` — new hook.
- `src/screens/Home.tsx` — focus h1 on mount.
- `src/screens/Offerer.tsx` — focus h1 on mount and when invite ↔ connected
  flips.
- `src/screens/Joiner.tsx` — focus h1 on mount and when invite → reply →
  connected flips.
- `src/App.test.tsx` — new test for the focus-on-navigation contract.
