# IMPRV-002: Module-level mutable `messageCounter` violates functional core / imperative shell

**Status:** Resolved **Severity:** Medium **Location:**
`src/hooks/useChatSession.ts` (lines 21-25)

## Problem

`useChatSession` generates chat-message IDs with a module-scoped mutable
counter:

```ts
let messageCounter = 0
function nextId(): string {
  messageCounter += 1
  return `${Date.now()}-${messageCounter}`
}
```

Concerns:

1. **Hidden global state.** The counter is shared across every consumer of this
   module — including tests that exercise the hook multiple times — and never
   resets. A test asserting "the first message has id `…-1`" would pass on first
   run and fail on the next.
2. **Not affected by `reset()`.** When `reset()` clears the messages array (line
   128), the counter keeps incrementing. Surprising for any future code that
   assumes session-local ID space.
3. **Functional core / imperative shell.** ID generation is a pure concern. The
   shell should either delegate to a stable Web API or hold the state in a
   `useRef` so it lives with the component instance, not the module.
4. **No tests guard this.** There are no tests around message handling at all
   (see [[IMPRV-003]]), so the fragility is invisible.

## Intended behavior

Each new message gets an ID that is unique within a session and stable for the
lifetime of that message. The mechanism should be testable in isolation and
should not depend on module load order or accumulate across sessions.

## Suggested fix

Prefer `crypto.randomUUID()` — available in all evergreen browsers and Node ≥
19:

```ts
function nextId(): string {
  return crypto.randomUUID()
}
```

No module-level `let`. No reset bookkeeping. Tests can assert "ids are unique
strings" without depending on an internal counter.

If a sortable id is preferred (e.g. for future transcript ordering), combine
`Date.now()` with a short random suffix — but the simple `randomUUID()` form is
enough for the current use, which is purely React's `key=` prop. Either way,
drop the module-level state.

## Working notes

- Confirmed the ID is consumed exclusively as a React `key` prop in
  `Chat.tsx:37` (`<li key={m.id} …>`). No ordering or persistence depends on the
  ID value. So the simplest correct solution is the one the ticket suggests:
  `crypto.randomUUID()`.
- `crypto.randomUUID()` is available globally in browsers (secure contexts) and
  in Node ≥ 19, which matches our Vite/Vitest toolchain. jsdom (the Vitest env)
  also exposes `crypto.randomUUID`. No polyfill needed.
- Took the simpler `crypto.randomUUID()` route over the sortable
  `Date.now()+suffix` form. There is no current need for sortable IDs — messages
  are already kept in insertion order via the
  `setMessages((prev) => [...prev, …])` append pattern. Adding sortability would
  be speculative.
- Considered moving the counter into a `useRef` (as the ticket mentions). That
  works, but `crypto.randomUUID()` is strictly simpler: zero state, zero
  bookkeeping in `reset()`, and the test can assert "unique strings" without
  depending on a counter format. Aligned with "functional core / imperative
  shell" — ID generation becomes a pure call to a stable Web API.
- TDD plan:
  1. Add `src/hooks/useChatSession.test.ts` with two tests:
     - Sending two messages yields two distinct, non-empty string IDs.
     - IDs do not collide across separate hook instances (renders), guarding
       against the module-level shared-state bug.
  2. Tests render the hook with `@testing-library/react`'s `renderHook` and use
     `act()` to drive `send()`. They will need to stub a minimal data channel
     via `startAsOfferer` — but that requires `RTCPeerConnection`. Simpler: only
     test the public `send()` path by short-circuiting through the channel ref.
     Actually simplest: assign messages via the receive path is internal. The
     cleanest TDD-friendly approach is to drive `send()` after stubbing
     `RTCPeerConnection` & data channel, mirroring `App.test.tsx`'s
     `FakePeerConnection`.
  3. Once tests are red against the current counter (they'll actually pass on
     the counter too since the counter does produce unique ids within one module
     load, but they'll fail across module loads only if we explicitly test reset
     semantics). Reframe: write tests that pass with either implementation but
     **prove** the post-change behavior — i.e. "ids are unique non-empty strings
     within a session" and "after reset(), new messages still get unique ids".
     These protect business value (React keys never collide) regardless of
     underlying mechanism.
  4. Change `nextId()` to return `crypto.randomUUID()` and drop the module-level
     `let messageCounter`. Verify green.
- Scope of test file: minimal — just enough to lock in the unique-ID contract.
  Comprehensive `useChatSession` tests are deferred to IMPRV-003.
