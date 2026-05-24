# BUG-003: `wireChannel` misses `onopen` when answerer's channel is already open at attach time

**Status:** Resolved **Severity:** Medium **Location:**
`src/hooks/useChatSession.ts` (lines 47-55); related: `src/core/rtc.ts` (lines
74-93)

## Problem

`wireChannel` attaches an `onopen` handler unconditionally, without first
checking whether the channel has already transitioned to `'open'`:

```tsx
const wireChannel = useCallback((channel: RTCDataChannel) => {
  channelRef.current = channel
  channel.onopen = () => setState('connected')
  channel.onclose = ...
  channel.onmessage = ...
}, [])
```

For the **offerer** this is safe — `createOffer` calls
`pc.createDataChannel('chat')` synchronously in the same call site and wires it
before any async hop, so `readyState` is guaranteed to be `'connecting'` at
attach time.

For the **answerer** it is NOT safe. The channel arrives via `pc.ondatachannel`:

```tsx
// src/core/rtc.ts
pc.ondatachannel = (event) => {
  channel = event.channel
  onChannel(event.channel) // → wireChannel
}
```

`ondatachannel` is queued and dispatched by the browser; there is no guarantee
about _when_ relative to the channel transitioning to `'open'`. In the common
case the event fires while the channel is still `'connecting'` and the
late-attached `onopen` does fire. But if the JS task queue is starved (slow
device, long sync work, dev-tools paused at a breakpoint, GC pause) the event
can be delivered after the channel has already opened — and the handler never
runs.

The inline comment in `acceptOffer` is overconfident:

> *"caller wires up listeners via `onChannel` *before* the SDP exchange
> completes so the `open` event isn't missed."*

Wiring `pc.ondatachannel` before the SDP exchange does not guarantee that
`ondatachannel` _itself_ is dispatched before the channel opens. Only checking
`readyState === 'open'` at handler-attach time closes the race.

## Intended behavior

After both sides have exchanged SDPs and the channel reaches `'open'` on the
answerer, `session.state` should transition to `'connected'` and the `Joiner`
should render the chat.

## Actual behavior

In the racy case, `session.state` stays at `'connecting'` indefinitely with no
error. Same observable symptom as BUG-002 ("stuck on the spinner") but with a
different root cause and a different fix. The user has no recovery beyond a full
page reload.

## Reproducibility

Intermittent; environment-dependent. Likely paths:

- Slow mobile devices on first navigation (cold caches, GC).
- Dev-tools open with a breakpoint paused on the answerer side during SDP
  exchange.
- Heavy synchronous work scheduled around the SDP exchange.

Hard to repro on a fast desktop with no contention.

## Suggested fix

Check `readyState` at attach time and short-circuit if already open:

```tsx
const wireChannel = useCallback((channel: RTCDataChannel) => {
  channelRef.current = channel
  if (channel.readyState === 'open') {
    setState('connected')
  } else {
    channel.onopen = () => setState('connected')
  }
  channel.onclose = (...)
  channel.onmessage = (...)
}, [])
```

Also worth updating the inline comment in `acceptOffer`
(`src/core/rtc.ts:73-77`) — wiring `pc.ondatachannel` early reduces the race
window but does not eliminate it; the readyState check inside the handler is
what makes the handoff safe.

A regression test is awkward because jsdom does not implement RTCDataChannel,
but the unit can be tested in isolation: pass a stub channel with
`readyState: 'open'` to `wireChannel` and assert `setState('connected')` was
called synchronously.

## Working notes

- Confirmed the bug is still present on `main` — `wireChannel` in
  `src/hooks/useChatSession.ts:49-61` only attaches `onopen` and never checks
  `readyState`. The misleading comment in `acceptOffer`
  (`src/core/rtc.ts:82-87`) also still claims that wiring listeners early is
  sufficient.
- Wrote a regression test (`src/hooks/useChatSession.test.ts`) that drives the
  answerer flow: extended the `FakePeerConnection` fake with `ondatachannel` +
  `createAnswer` + an `emitDataChannel` test helper, then encoded a real offer
  payload so `acceptOffer` can decode it. The test calls `startAsAnswerer`,
  waits for state to settle on `'connecting'`, then synthesises a delayed
  `ondatachannel` event whose channel is already in `readyState: 'open'`.
  Without the fix the test fails with `state === 'connecting'`; with the fix it
  transitions to `'connected'`.
- An earlier attempt that simulated the race through the offerer flow did not
  repro: the trailing `setState('awaiting-answer')` in `startAsOfferer`
  clobbered the synchronous `setState('connected')` set by `wireChannel`. The
  answerer flow only sets `'connecting'` (intentionally lower than
  `'connected'`) after `acceptOffer` returns, which matches the real race window
  where `ondatachannel` is delivered post-resolve.
- Fix is surgical: a single
  `if (channel.readyState === 'open') setState('connected'); else channel.onopen = …`
  branch in `wireChannel`. No change to `onclose` (BUG-002's widened escalation
  is preserved untouched, leaving room for BUG-005 to introduce a separate
  `'closed'` terminal state).
- Also tightened the doc comment on `acceptOffer` to call out that early
  `ondatachannel` wiring narrows but does not close the race — the readyState
  check inside the callback is what makes the handoff safe.
- Full test suite (`npx vitest run`): 48/48 passing. `npx tsc --noEmit` and
  `npx eslint` clean on touched files.
