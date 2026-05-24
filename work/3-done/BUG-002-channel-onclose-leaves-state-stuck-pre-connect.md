# BUG-002: Data-channel `onclose` leaves session stuck when connection fails before open

**Status:** Resolved **Severity:** High **Location:**
`src/hooks/useChatSession.ts` (lines 47-55)

## Problem

`wireChannel` attaches an `onclose` handler that only escalates to `'failed'`
when the previous state was `'connected'`:

```tsx
const wireChannel = useCallback((channel: RTCDataChannel) => {
  channelRef.current = channel
  channel.onopen = () => setState('connected')
  channel.onclose = () => setState((prev) => (prev === 'connected' ? 'failed' : prev))
  channel.onmessage = (event) => { ... }
}, [])
```

If the data channel closes BEFORE it ever opened — while state is `'gathering'`,
`'awaiting-answer'`, or `'connecting'` — the conditional returns `prev`
unchanged. The state never transitions to `'failed'`, no error is surfaced
through `session.error`, and the user is stranded on the spinner.

## Intended behavior

When the peer connection fails to establish, both sides should land in
`'failed'` so the UI can:

- show the "Couldn't establish a direct connection. Try a different network."
  fallback (`Offerer.tsx:105` / `Joiner.tsx:101`), and
- let the user reset and try a fresh invite exchange.

This is consistent with the design comment on `pc.onconnectionstatechange`:
_"`failed` is terminal; ICE has given up. Surface it to the UI so the user knows
they need a fresh invite exchange."_

## Actual behavior

The UI sits on the in-flight copy forever:

- Offerer: `"Preparing invite (gathering network candidates)…"`
- Joiner: `"Preparing reply (gathering network candidates)…"` or the reply-code
  screen
- Neither screen reaches the `state === 'failed'` branch, because `state` is
  still `'gathering'` / `'awaiting-answer'` / `'connecting'`.

## Repro paths

1. **NAT/firewall mismatch** — Bob's browser cannot reach any of Alice's ICE
   candidates (symmetric NAT, restrictive corporate firewall). The peer
   connection's ICE phase eventually gives up; on some browsers the channel
   closes before it ever opened. State stays at `'connecting'` indefinitely.
2. **Underlying transport drops during the answerer's setup window** —
   channel.onclose fires from `'connecting'`, conditional swallows it.
3. **StrictMode double-mount in dev** — `useChatSession`'s teardown effect fires
   on the first (discarded) mount, closing the just-created channel before its
   `onopen` ever ran. Combined with re-mount, the second mount can race and
   observe stuck state.

## Root cause

The conditional `prev === 'connected' ? 'failed' : prev` was likely added to
avoid clobbering a deliberate teardown (e.g., `reset()` → `teardown()` while
`prev` is already `'idle'`). But it's overly restrictive: it ignores _every_
pre-open close, including the legitimate "connection failed to establish" case.

`pc.onconnectionstatechange` covers some of these via
`pc.connectionState === 'failed'`, but not all — the data channel can close on
its own without `connectionState` transitioning to `'failed'` (e.g., remote-side
`pc.close()`, transport SCTP errors), and the channel-close path is the only one
wired here.

## Suggested fix

Widen the transition: any close from a non-terminal state should land in
`'failed'`. Only `'idle'` (already torn down) and `'failed'` (already there)
should be preserved:

```tsx
channel.onclose = () =>
  setState((prev) => (prev === 'idle' || prev === 'failed' ? prev : 'failed'))
```

For completeness, also handle `pc.connectionState === 'disconnected'` and
`'closed'` in `wirePc` if the same failure modes need to be surfaced.

Add a regression test: simulate a channel that closes while
`state === 'connecting'`, assert `session.state` becomes `'failed'` and the
"Couldn't establish a direct connection" message renders.

## Working

- Confirmed the conditional `prev === 'connected' ? 'failed' : prev` still lives
  at `src/hooks/useChatSession.ts:52`; pre-open closes are silently swallowed
  from `'gathering'`, `'awaiting-answer'`, and `'connecting'`.
- Added a hook-level regression test
  (`channel onclose before onopen transitions state to "failed"`): start as
  offerer (state lands on `'awaiting-answer'`), fire `lastChannel.onclose()`
  directly to simulate a pre-open transport failure, assert state becomes
  `'failed'`. Verified the test fails against the original handler.
- Applied the ticket's suggested fix: invert the guard so any non-terminal state
  escalates to `'failed'`, while `'idle'` (post-teardown) and `'failed'`
  (already there) are preserved. This keeps `reset()` from being clobbered into
  a spurious error screen.
- Left `wirePc` alone — handling `connectionState === 'disconnected' | 'closed'`
  is broader scope and would overlap with BUG-005's post-connect drop work.
- Full suite (47 tests across 6 files) plus lint and typecheck all pass.

## Resolution

- `src/hooks/useChatSession.ts` — widened the `channel.onclose` transition so
  any pre-terminal state escalates to `'failed'`.
- `src/hooks/useChatSession.test.ts` — added regression test covering pre-open
  close.
