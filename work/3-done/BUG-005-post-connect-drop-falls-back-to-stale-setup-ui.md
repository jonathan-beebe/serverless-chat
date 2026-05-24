# BUG-005: Post-connect channel drop renders stale setup UI instead of a "connection lost" screen

**Status:** Resolved **Severity:** Medium-High **Location:**
`src/screens/Offerer.tsx` (line 27), `src/screens/Joiner.tsx` (line 21); also
`src/hooks/useChatSession.ts` (lines 47-55)

## Problem

Both connected screens gate the chat view strictly on
`session.state === 'connected'`:

```tsx
// Offerer.tsx
if (session.state === 'connected') {
  return (... <Chat ...> ...)
}
// otherwise: invite-URL + "Paste their reply code" textarea + answer form

// Joiner.tsx — analogous structure
```

When the data channel drops _after_ a successful connect, `wireChannel.onclose`
flips state from `'connected'` → `'failed'`:

```tsx
channel.onclose = () =>
  setState((prev) => (prev === 'connected' ? 'failed' : prev))
```

Each screen re-renders, the `state === 'connected'` branch no longer matches,
and they fall through to their pre-connection layout — but with
`session.encodedLocal` still populated from the original SDP exchange.

What the user actually sees:

- **Offerer**: the original invite URL CopyBox, the "Paste their reply code"
  textarea (empty), a Connect button, and an amber "Couldn't establish a direct
  connection. Try a different network." message at the bottom.
- **Joiner**: the original "Send this code back" screen with the stale reply
  code in the CopyBox, plus the same amber message.

There is no signal that the chat _was_ working and just ended. There is no
"Start over" or "Return home" affordance distinct from the per-screen "Cancel"
button. Worst of all, both screens implicitly invite the user to retry the SDP
exchange using codes that can no longer work: Alice's offer is bound to a
now-closed `RTCPeerConnection`, and Bob's answer is similarly tied to a
torn-down session.

## Intended behavior

When a chat ends — peer closed the tab, network died, ICE failed mid-session —
the user should see a dedicated "post-mortem" view:

- A clear message: "Connection lost." or "Your friend disconnected."
- A single primary action: "Start a new chat" (which calls `session.reset()` and
  routes back home).
- No stale SDP codes displayed, since they cannot be reused.

## Actual behavior

The screens revert to setup UI with stale state, presenting an invitation to
repeat an exchange that will not succeed. The amber "Couldn't establish a direct
connection. Try a different network." copy is also misleading post-connect — a
direct connection _was_ established and then lost; the network suggestion is
irrelevant.

## Root cause

`ConnectionState` collapses two semantically different failure modes into a
single `'failed'`:

1. Setup-time failure: SDP exchange or ICE never completed.
2. Runtime failure: connection was established, then dropped.

The screens have no way to distinguish (1) from (2), so they apply the same
fallback ("show setup UI + try-different-network message") to both. For (1)
that's still wrong but less harmful (no chat to lose); for (2) it's actively
confusing.

## Suggested fix

Two viable shapes:

**Option A — separate terminal states.** Extend `ConnectionState` with a
`'closed'` (or `'ended'`) variant that means "connection ended after being
established":

```tsx
export type ConnectionState =
  | 'idle'
  | 'gathering'
  | 'awaiting-answer'
  | 'connecting'
  | 'connected'
  | 'failed'
  | 'closed'

// wireChannel:
channel.onclose = () =>
  setState((prev) => (prev === 'connected' ? 'closed' : 'failed'))
```

Then in both screens, branch on `state === 'closed'` to render a dedicated
end-of-chat view with a single "Start a new chat" CTA (calls the parent's
`onCancel`, which already calls `session.reset()` and goes home).

**Option B — `wasConnected` flag.** Track a `useRef<boolean>` inside
`useChatSession` flipped to `true` the first time state reaches `'connected'`,
and surface it on the returned `ChatSession`. Screens render the post-mortem
view when `wasConnected && (state === 'failed' || state === 'closed')`.

Option A is cleaner and aligns with the state-machine flavour the file already
uses.

## Order of operations

BUG-002 must be fixed first (pre-connect failures are currently silently
swallowed and never reach `'failed'`). Once BUG-002 lands, this bug becomes the
next visible regression on the failure path.

## Test plan

- Mock a chat session, advance to `state === 'connected'`, then synthetically
  call the channel's `onclose` handler. Assert the screen renders "Connection
  lost" copy and a "Start a new chat" button, not the invite/reply-code UI.
- Assert the stale `encodedLocal` is not present in the rendered DOM.
- Assert clicking "Start a new chat" calls `session.reset()` and routes home.

## Related

- BUG-002 — pre-connect failures don't reach `'failed'` (must fix first).
- The "Try a different network" copy is correct for setup-failure, misleading
  for runtime drop — this bug's fix should disambiguate the messaging.

## Working notes

- Confirmed the bug still exists in `main` after BUG-001..BUG-004 landed:
  `useChatSession`'s `channel.onclose` (post-BUG-002) escalates _every_
  non-terminal state to `'failed'`, so a post-connect drop also lands in
  `'failed'`. Both screens' guards on `state === 'connected'` then fall through
  to the setup UI with stale `encodedLocal`.
- Went with Option A from the ticket: added a `'closed'` terminal state.
  - `src/core/rtc.ts`: extended `ConnectionState` with `'closed'`, with a
    comment distinguishing setup-time `'failed'` from post-connect `'closed'`.
  - `src/hooks/useChatSession.ts`: `channel.onclose` now branches —
    `prev === 'connected'` → `'closed'`, any other non-terminal → `'failed'`.
    `'closed'` is preserved alongside `'idle'`/`'failed'` so a redundant close
    event can't downgrade `'closed'` to `'failed'`.
  - `src/screens/Offerer.tsx` & `src/screens/Joiner.tsx`: added a dedicated
    "Connection lost" branch with a single "Start a new chat" CTA wired to the
    existing `onCancel` (which calls `session.reset()` + routes home). No
    `encodedLocal` rendered. Updated `statusMessage` and the page title for the
    new state, and refocus the heading on branch swap.
- Tests:
  - `useChatSession.test.ts`: new test asserts `connected → close → 'closed'`
    (separate from the existing BUG-002 test that pins pre-connect
    `close → 'failed'`).
  - `src/screens/Offerer.test.tsx` (new): asserts the closed view renders, the
    stale `encodedLocal` doesn't leak into the DOM, the "Connect"/answer
    textarea/"Try a different network" copy are gone, and the CTA invokes
    `onCancel`. A regression test pins the `'failed'` branch still shows "Try a
    different network".
  - `src/screens/Joiner.test.tsx` (new): asserts the closed view renders, the
    stale reply-code CopyBox is gone, and the CTA invokes `onCancel`.
- All 57 tests pass; `tsc --noEmit` clean; `eslint src` clean.
