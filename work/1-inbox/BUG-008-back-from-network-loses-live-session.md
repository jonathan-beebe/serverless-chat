---
id: BUG-008
type: bug
status: open
created: 2026-05-24
---

# BUG-008: Navigating from a live chat to `#network` and back to home strands the user on the conversation list

## Problem

Reproduction:

1. Start a chat (Offerer or Joiner). Wait for `connected` — the Chat UI is on
   screen, hash is empty.
2. Manually navigate to `#network` (type it in the URL bar, paste a bookmark,
   etc).
3. Click the "Back" button on the Network screen (`src/network/Network.tsx:275`
   does `window.location.hash = ''`).

Expected: I'm back in my live chat — the conversation is still going.

Actual: I'm dropped onto the Home screen (conversation list). The live
`useChatSession` hook is still running in the background (the data channel is
still open, telemetry is still ticking), but there's no UI surfacing it — to get
back in I'd have to pick the conversation from Home and Resume, which would also
re-route through Offerer setup.

## Root cause

`App.tsx` keeps `route` and `session` as independent state. The hashchange
listener (`src/App.tsx:43-52`) treats `''` as
`routeFromHash() → { kind: 'home' }` and calls `setRoute({ kind: 'home' })`
unconditionally:

```tsx
useEffect(() => {
  const onHashChange = () => {
    const next = routeFromHash()
    if (next.kind === 'joiner' || next.kind === 'design-system' ||
        next.kind === 'network' || next.kind === 'home') {
      setRoute(next)
    }
  }
  window.addEventListener('hashchange', onHashChange)
  ...
}, [])
```

So:

- The `offerer` / `joiner` route (which is what hosts the connected Chat UI) is
  **never restored** by hashchange — neither route appears in the
  `routeFromHash()` outputs (offerer has no hash; joiner is reached via
  `#offer=…`). Once you leave it via a hashchange, you can't get back to it via
  a hashchange.
- The session-reset path (`goHome()` at `src/App.tsx:64-67`) is only invoked by
  explicit "Cancel" / "End chat" / "Start a new chat" buttons. The Network
  "Back" button bypasses it and just clears the hash, so `session.reset()` isn't
  called and the session lingers.

The same shape applies to any non-`offerer`/non-`joiner` route entered during a
live session (today only `#network` and `#design-system` exist, and
`#design-system` has no in-app link from a live chat, but the bug would
reproduce identically for it).

## Intended behaviour

While a session is live (anything other than `idle` / `closed` / `failed`, or
more narrowly `connected`), navigating back to the empty hash should return the
user to the screen that hosts their live chat — not the Home list. The session
must remain intact (no reset), and the conversation must stay bound to the same
`conversationId`.

Home should only show when the user is genuinely "outside" any session — i.e. no
live `useChatSession` activity.

## Suggested directions

A couple of plausible shapes (decide at work-start):

**Option A — App detects an active session and overrides the `home` route.**

In the `case 'home'` switch arm, if `session.state` indicates a live session (at
minimum `'connected'`; arguably also
`'gathering' | 'awaiting-answer' | 'connecting'`), render the screen that owns
it instead of `<Home>`. Needs the `conversationId` and the offerer-vs-joiner
side to be derivable from `session`. Today `useChatSession` exposes neither
directly — would need to either:

- Stash the most-recent `{ kind: 'offerer' | 'joiner', conversationId }` in a
  ref/state inside App whenever we route into one of those screens, then use it
  as the "fallback route" while the session is alive, OR
- Surface `conversationId` and side on the `ChatSession` itself (the hook
  already knows both — `startAsOfferer` / `acceptOffer` / `politelyAcceptOffer`
  receive them).

This is the cleanest user-facing fix: "home means home, but only if you're
actually free."

**Option B — Network's Back button knows where it came from.**

Track the route the user was on when they entered `#network` (e.g. an in-memory
`previousRoute` ref in App, populated in the hashchange handler before
overwriting `route`). The Back button (or, more generally, a hash-clear from
`#network`) restores `previousRoute` instead of falling through to Home.

Less invasive but only fixes the Network path; doesn't help if a future route is
added with the same shape, and doesn't help if the user uses the browser's URL
bar to clear the hash directly.

**Option C — Block the lossy navigation.**

Confirm-before-leaving prompt when entering `#network` from a live session.
Worst of the three — punishes the user for using a feature that's supposed to be
a debugging aid.

Option A is probably right (session ownership is the truth, not the hash
history), but it carries the most thinking about which session states should
override home and how the side/conversationId get plumbed.

## Test plan

- Boot App with no hash; programmatically transition `useChatSession` into
  `connected` (the existing fake-PC pattern in `App.test.tsx` covers this).
  Assert Chat UI is rendered.
- Fire `hashchange` with `location.hash = '#network'`. Assert Network is
  rendered and the session is unchanged.
- Fire `hashchange` clearing the hash. Assert we're back on Chat UI (not Home),
  `session.state === 'connected'`, and `session.reset` was not called.
- Regression: with no live session, `#network` → back-to-`''` still lands on
  Home (existing behaviour must hold).
- Regression: explicit End-chat / Cancel still resets the session and routes to
  Home (BUG-005 / IMPRV-010 contract).

## Related work

- BUG-001
  (`work/3-done/BUG-001-clearhash-effect-misses-joiner-to-joiner-transition.md`)
  — prior hashchange-routing bug; same `App.tsx` surface. Established that the
  hashchange listener is the authority on route transitions and shouldn't be
  worked around at call sites.
- BUG-005
  (`work/3-done/BUG-005-post-connect-drop-falls-back-to-stale-setup-ui.md`) —
  added the `'closed'` terminal state. Useful precedent for "session-state
  drives screen choice, not the other way around."
- FEAT-010 (`work/3-done/FEAT-010-network-telemetry.md`) — introduced the
  `#network` route. Network is intentionally session-scoped, so the live session
  needs to outlast a visit to it (which it does at the hook level — this bug is
  about the _UI_ losing the thread).
- IMPRV-010
  (`work/3-done/IMPRV-010-connection-lost-cta-should-say-return-home.md`) —
  "Return home" CTA wording; confirms the explicit go-home affordance is the
  only legitimate path to drop a session.
- FEAT-012 (`work/3-done/FEAT-012-resume-conversation.md`) — conversation IDs
  are App-owned and forwarded into Offerer; relevant for whichever option
  threads `conversationId` back into the restored route.
