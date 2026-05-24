# A11Y-003: Page `<title>` never updates with SPA route changes

**Status:** Resolved **WCAG:** 2.4.2 Page Titled (Level A) **Severity:** Medium
**Location:** `index.html` (line 8), `src/App.tsx`

## Problem

The static title in `index.html` is set once:

```html
<title>P2P Chat</title>
```

`App.tsx` switches between three logical screens — Home, Offerer
(invite/connecting/connected), Joiner (accept/reply-code/connected) — and
additionally toggles state within Offerer/Joiner. `document.title` is never
updated.

Consequences:

- Screen reader users (and browser tab indicators) get no signal that the page
  changed when SPA navigation occurs.
- The tab label is identical across all states, making it impossible to
  distinguish multiple open chats or to know whether a connection has been
  established without bringing the window to the foreground.
- WCAG 2.4.2 requires each web page to have a title that describes its topic or
  purpose. In SPAs this applies per route.

## Intended behavior

The title should reflect the user's current location and state, e.g.:

- Home: `P2P Chat`
- Offerer (gathering / awaiting answer): `Invite a friend · P2P Chat`
- Joiner (accept screen): `You've been invited · P2P Chat`
- Joiner (reply code shown): `Send your reply code · P2P Chat`
- Connected (either side): `Connected · P2P Chat`

## Suggested fix

Introduce a small `usePageTitle(title)` hook that sets `document.title` inside
`useEffect`, and call it from each screen with the appropriate title for its
current state. Alternatively, set `document.title` directly from a `useEffect`
in `App.tsx` keyed on `route.kind` and `session.state`.

```ts
function usePageTitle(title: string) {
  useEffect(() => {
    const prev = document.title
    document.title = title
    return () => {
      document.title = prev
    }
  }, [title])
}
```

## Working notes

- Confirmed the issue is real: `grep -rn 'document.title' src/ index.html`
  returned zero matches; the static `<title>P2P Chat</title>` in `index.html:8`
  is the only place the title is ever set.
- Affected branches by screen/state:
  - `Home` (single render branch) -> `P2P Chat`.
  - `Offerer` lobby
    (`state in {idle, gathering, awaiting-answer, connecting, failed}`) ->
    `Invite a friend - P2P Chat`.
  - `Offerer` connected branch -> `Connected - P2P Chat`.
  - `Joiner` accept prompt (`!accepted`) -> `You've been invited - P2P Chat`.
  - `Joiner` reply-code branch (`accepted && !connected`) ->
    `Send your reply code - P2P Chat`.
  - `Joiner` connected branch -> `Connected - P2P Chat`.
- Decision: implement the ticket's recommended `usePageTitle(title)` hook in
  `src/hooks/usePageTitle.ts` and call it from each screen with the appropriate
  string for the active branch. Placing the call inside each screen (rather than
  centrally in `App.tsx`) keeps the title co-located with the UI state that
  drives it — Offerer/Joiner already branch on `session.state` and `accepted`,
  so the screen is the natural owner.
- The cleanup that restores the previous title is important on unmount: when a
  screen transitions (e.g. Offerer -> Home on cancel), the new screen's effect
  runs and overwrites the title, so the prev-restore is mostly a no-op in the
  happy path but correctly handles the case where the App itself unmounts
  (Strict Mode double-invoke, test teardown).
- Use the en-dash separator chosen in the ticket's "Intended behavior" examples
  (`·`). It's already used in the ticket text and is screen-reader friendly.
- App.test.tsx does not assert on `document.title`, so no test changes are
  forced. Will add a focused assertion on the Home title to lock in the behavior
  at the routing layer; deeper per-state assertions would require mocking the
  full WebRTC session and aren't worth the test surface for a one-line hook.

## Resolution

- Added `src/hooks/usePageTitle.ts`: tiny hook that sets `document.title` inside
  `useEffect` and restores the previous value on cleanup.
- `Home.tsx` -> `usePageTitle('P2P Chat')`.
- `Offerer.tsx` ->
  `usePageTitle(session.state === 'connected' ? 'Connected - P2P Chat' : 'Invite a friend - P2P Chat')`.
- `Joiner.tsx` -> small `joinerTitle(state, accepted)` helper that returns one
  of `Connected - P2P Chat`, `You've been invited - P2P Chat`, or
  `Send your reply code - P2P Chat`; passed into `usePageTitle`.
- Extended `App.test.tsx` with one assertion that `document.title` updates from
  `P2P Chat` (Home) to the Joiner accept-screen title after a `hashchange` into
  `#offer=`.
- Verified: `npm test` (42 passed, +1 from the new assertion),
  `npm run typecheck`, `npm run lint` all clean.
- Commit: 0e98c70
