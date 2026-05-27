---
id: BUG-011
type: bug
status: open
created: 2026-05-27
---

# BUG-011: end chat does not close channel so peer stays connected

## Problem

When the local peer triggers End chat / Cancel / Return home
(`Offerer.tsx:216, 241, 262, 316`; `Joiner.tsx:141, 165, 186, 203`), the handler
is `onCancel`, which in production is wired in
`src/routes/ConversationRoute.tsx:58,77,122` to `() => navigate('/')` — nothing
else. No `session.reset()`, no `teardown()`, no `channel.close()`. Because the
chat session lives in `AppShell` (`src/App.tsx:17–28`) and survives every route
change via `SessionContext`, navigating to `/` does NOT unmount
`useChatSession`. The data channel and `RTCPeerConnection` therefore stay open
on the leaving peer. The remote peer never receives a `channel.onclose` event,
so the prev-aware classifier in `src/hooks/useChatSession.ts:617–626` (which
would correctly transition `connected → 'closed'`) never runs. The remote screen
stays on the `connected` branch indefinitely (`Offerer.tsx:196` /
`Joiner.tsx:122`) and the user can continue typing into a transcript the peer
will never receive. Stale comments at `Offerer.tsx:230` and `Joiner.tsx:154`
still claim "onCancel resets the session and routes home" — that contract was
lost.

## Outcome

When one client ends the chat (End chat button, Return home, or unmounting the
tab), the local hook tears down its `RTCPeerConnection` / `RTCDataChannel`. The
remote peer observes `channel.onclose` within a few seconds, the hook
transitions `connected → 'closed'`, and the remote screen renders the existing
"Connection lost" branch (`Offerer.tsx:225–246` / `Joiner.tsx:150–170`) with the
"Return home" CTA from IMPRV-010. No more indefinite "still connected" mirage on
the remote side.

## Why it matters

Regression introduced by ARCH-001 (commit `30fcaa2`, 2026-05-25). Before
ARCH-001 the App-level `goHome()` called `session.reset()` before re-routing;
ARCH-001 deleted `goHome` and inlined `navigate('/')` at every call site without
restoring the reset. User impact: the remote peer keeps the chat screen live,
types messages that vanish into the void, and has no signal that the other side
has left. The very point of the post-connect `'closed'` terminal state (BUG-005)
and the "Return home" CTA (IMPRV-010) — telling the remote peer the session
ended — is silently bypassed. Trust in the app's connection signaling erodes;
the post-connect-drop UI is dead code for the most common case (deliberate
hangup).

## Discovery notes

Failure mode is (a) from the scope prompt: the closing peer never closes the
channel locally. Confirmed by grep — `session.reset()` is called in zero
production files (only test fixtures and a stale comment in
`ChatTranscript.tsx`); `teardown()` is internal to the hook and only invoked by
`politelyAcceptOffer`, `reset`, and the unmount effect (line 281). The unmount
effect doesn't fire because `AppShell` keeps the hook mounted across
`navigate('/')`. The hook's `wireChannel.onclose` classifier (lines 617–626) is
correct and battle-tested — `connected` → `'closed'`, terminal states preserved,
`deliberateTeardownRef` short-circuit only fires during polite-defer. If the
local peer actually closed the channel, the remote would already see the right
thing. Test infrastructure: `FakeDataChannel.close()` in
`useChatSession.test.ts:30–31` only fires `onclose` if `readyState` was `'open'`
— which is the correct simulation of the WebRTC spec — but there is currently NO
test that exercises the cross-peer scenario (peer A's `reset()` → peer B's
`'closed'` transition). The existing "channel onclose after onopen transitions
to closed" test (line 282–297) is the single-side proof and would remain green;
we need a two-side fixture (cf. `useChatSession.bug6-twoside.test.ts`, 245
lines, for the pattern) to capture the regression. Window-level `beforeunload` /
`pagehide` cleanup is also absent — closing the tab doesn't close the channel
either; the browser's GC eventually does, but not within "a few seconds".

This is the SECOND symptom of the same ARCH-001 root cause — BUG-012
(cancel-restart shows NotFound) is the first; both fix together if
`session.reset()` is restored before navigation.

## Recommendation

Start at `src/routes/ConversationRoute.tsx:58,77,122`. Replace
`onCancel={() => navigate('/')}` with a handler that calls `session.reset()`
(which already invokes `teardown()` at line 916 and is safe in every state per
CR-006) before `navigate('/')`. The hook's `reset()` already clears `roleRef`,
`selfPeerIdRef`, `knownIdsRef`, etc. — no new logic needed in the hook itself.
Add a `beforeunload` / `pagehide` listener (probably in `useChatSession` next to
the existing unmount effect at line 281) that calls `teardown()` for the
close-tab case so the channel ships an SCTP `CLOSE` before the browser kills the
process. Update the stale comments at `Offerer.tsx:230` and `Joiner.tsx:154`.
Write the failing test FIRST: a two-side `renderHook` fixture (mirror
`useChatSession.bug6-twoside.test.ts`) that connects two hooks via paired
`FakeDataChannel`s, asserts both at `'connected'`, calls
`result.current.reset()` on side A, fires the paired channel's `onclose` on side
B (the fake needs cross-wiring — currently each `FakeDataChannel` is
independent), and asserts side B reaches `'closed'`. The fake-PC sharing problem
(IMPRV-003's deferred work) is now load-bearing for this bug's regression
coverage.

## Related work

- ARCH-001 (`30fcaa2`) — moved session to `AppShell`, deleted `goHome()` /
  `session.reset()`. Direct cause.
- BUG-008 (abandoned, superseded by ARCH-001) — established "session survives
  navigation" invariant. The fix must preserve that for `/network` round-trips
  while still tearing down for terminal exits.
- BUG-002 (`1ad3af2`) — pre-connect onclose → 'failed'.
- BUG-005 (`83d70dd`) — post-connect onclose → 'closed'; added the "Connection
  lost" branch the remote should land on.
- FEAT-008 (`03f5f33`) — added `deliberateTeardownRef` so polite-defer's own
  `teardown()` doesn't poison the in-progress role swap. The fix here will fire
  another `teardown()` and must NOT trip this flag — `deliberateTeardownRef` is
  only set during politely-accept.
- IMPRV-010 — wording of the "Return home" CTA in the `'closed'` branch.
- IMPRV-006 / CR-006 (`e2f65e0`) — state-machine guards that make `reset()` safe
  at any state.
- BUG-007 (`9ad239b`) — `act()` warnings on teardown; relevant if a test for
  cross-peer close needs `act` wrapping.
- BUG-012 — sibling symptom of the same ARCH-001 regression.
