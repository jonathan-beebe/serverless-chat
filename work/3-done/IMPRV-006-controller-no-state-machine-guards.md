# IMPRV-006: `useChatSession` has no internal state-machine guards — leaks PCs on re-entry and pushes invariants onto the view

**Status:** Resolved **Severity:** Medium **Location:**
`src/hooks/useChatSession.ts` (`startAsOfferer` lines 91-105, `startAsAnswerer`
lines 107-125, `submitAnswer` lines 127-140)

## Problem

The controller's three "begin" actions all unconditionally proceed regardless of
the current `state`:

```ts
const startAsOfferer = useCallback(async () => {
  setError(null)
  setState('gathering')
  try {
    const session = await createOffer()
    pcRef.current = session.pc           // ← overwrites any existing pc
    if (session.channel) wireChannel(session.channel)
    wirePc(session.pc)
    setEncodedLocal(session.encodedLocal)
    setState('awaiting-answer')
  } catch (err) { … }
}, [wireChannel, wirePc])
```

```ts
const submitAnswer = useCallback(async (answerCode: string) => {
  if (!pcRef.current) {
    setError('No active connection — start a chat first.')
    return
  }
  setError(null)
  setState('connecting')                 // ← will run even if state was 'connected'
  try {
    await acceptAnswer(pcRef.current, answerCode)
  } catch (err) { … }
}, [])
```

Three concrete failure modes follow:

1. **PeerConnection leak on re-entry into `startAsOfferer` /
   `startAsAnswerer`.** A second call before the first resolves overwrites
   `pcRef.current` — the first `RTCPeerConnection` is now orphaned, never
   closed, and continues to hold STUN bindings and candidate-gathering state.
   The hook's unmount-time `teardown` only closes what's currently in the refs.
2. **Crossing roles silently swaps connections.** Nothing prevents
   `startAsAnswerer` from being called after a `startAsOfferer` is already in
   flight (or vice-versa). The losing role's PC is leaked the same way as case
   1, and the channel wired by the first call is orphaned with its listeners
   still attached.
3. **`submitAnswer` while `'connected'` can tear down a live chat.** If the user
   is already in the `connected` state and `submitAnswer` runs again (a stale
   form submit, an Enter on a re-shown reply textarea, an external caller, a
   Strict-Mode effect re-fire), the controller sets state back to `'connecting'`
   and calls `pc.setRemoteDescription(answer)` on a connection whose signaling
   state is already `'stable'`. The browser rejects that with
   `InvalidStateError`; the catch branch then transitions to `'failed'`, killing
   the active chat.

Right now the only thing protecting users is the view layer:

- `Offerer.tsx:60` —
  `if (session.state === 'idle') void session.startAsOfferer()`
- `Joiner.tsx:54-56` —
  `if (accepted && session.state === 'idle') void session.startAsAnswerer(offerCode)`
- `Offerer.tsx:76-77` —
  `if (!answerDraft.trim() || session.state === 'connecting') return`

That inverts the project's stated layering: the imperative shell is enforcing
the controller's state-machine invariants. The principle in `README.md` is "keep
strong architectural boundaries… the controllers that glue them together [own
the state machine]." A new caller (a future debug panel, a "regenerate invite"
affordance, a deep-linked retry button) would have to re-discover these
invariants from the call sites; forgetting one re-introduces the leak or the
chat-killing path.

There are also **no tests for any of these re-entry / wrong-state scenarios**.
IMPRV-003's working notes explicitly flagged the double-start race as "an actual
bug" deferred to its own ticket — this is that ticket.

## Intended behavior

The controller owns its state machine and refuses operations that aren't valid
for the current state. View components can keep their UI-level disabled flags
(those are still the right UX), but they must not be the _only_ line of defense.

Concretely:

- `startAsOfferer()` and `startAsAnswerer()`: no-op when state is anything other
  than `'idle'`. Optionally surface a dev-only `console.warn` so accidental
  re-entry is visible during development. Do not transition state, do not call
  `createOffer` / `acceptOffer`, do not allocate a new PC.
- `submitAnswer()`: no-op (or set a clear error) when state is not
  `'awaiting-answer'`. The existing `!pcRef.current` guard handles only the
  cold-start case; the live-chat tear-down case is what's missing.
- `reset()` remains the explicit way to return to `'idle'` so a re-attempt after
  `'failed'` / `'closed'` keeps working — no behavior change there.

## Suggested fix

A small set of valid-state checks at the top of each action. The state machine
is already enumerated in `core/rtc.ts:ConnectionState`; we just need to express
which transitions are legal.

```ts
const startAsOfferer = useCallback(async () => {
  if (state !== 'idle') return          // ← guard
  setError(null)
  setState('gathering')
  …
}, [state, wireChannel, wirePc])

const startAsAnswerer = useCallback(
  async (offerCode: string) => {
    if (state !== 'idle') return        // ← guard
    setError(null)
    setState('gathering')
    …
  },
  [state, wireChannel, wirePc],
)

const submitAnswer = useCallback(
  async (answerCode: string) => {
    if (state !== 'awaiting-answer' || !pcRef.current) {
      // Cold-start case keeps its existing error message; in-progress /
      // already-connected case is a no-op (the live channel is fine as-is).
      if (!pcRef.current) setError('No active connection — start a chat first.')
      return
    }
    setError(null)
    setState('connecting')
    …
  },
  [state],
)
```

Reading `state` inside the callbacks means the `useCallback` dependency lists
grow (`state` is added). That's fine — the view consumes the returned function
from the new object each render anyway, so referential stability isn't
load-bearing for any consumer today (`Offerer` and `Joiner` both call through
`session.startAsOfferer()` etc., not memoized handlers downstream).

The view-side guards in `Offerer.tsx` and `Joiner.tsx` can stay — they still
drive UI affordances like the disabled Connect button — but they're now
correctness-redundant rather than correctness-critical.

## Test plan

Add tests to `src/hooks/useChatSession.test.ts` using the existing
`FakePeerConnection` + `FakeDataChannel` harness. These should fail against
current code and pass after the guard is added:

1. `startAsOfferer()` called twice in rapid succession: only one
   `RTCPeerConnection` is constructed (assert via the `lastPc` capture + a
   counter on the fake constructor), and the second call resolves without
   overwriting `pcRef`.
2. `startAsAnswerer()` after `startAsOfferer()` is in flight: second call is a
   no-op, no second `setRemoteDescription` is performed on a fresh pc, state
   stays on the offerer track.
3. `submitAnswer()` while state is `'connected'`: state stays `'connected'`,
   `setRemoteDescription` is **not** called a second time, the active channel is
   untouched, `messages` is preserved.
4. `submitAnswer()` while state is `'gathering'` (pre-`awaiting-answer`): no-op;
   state doesn't regress to `'connecting'`.
5. Regression guard: after `reset()`, `startAsOfferer()` works again — the guard
   keys on `'idle'` and reset returns to `'idle'`.

Existing tests for the happy-path transitions and for the `!pcRef.current`
cold-start case must remain green.

## Out of scope

- The view-side guards in `Offerer.tsx` / `Joiner.tsx`. They drive UI
  affordances (disabled button, only-fire-on-idle effect) and removing them
  would regress UX feedback. Leave them in place; the controller-side guard is
  additive.
- Surfacing a user-visible message when an invalid call is rejected. Silently
  no-op is fine — these are programmer errors, not user errors. A dev-only
  `console.warn` is optional and can be added if it helps during development.
- Restructuring the state machine into an `xstate` / reducer shape. The
  project's principle is "favor simple, straightforward solutions" — a handful
  of `if (state !== …)` checks is the smallest change that fixes the bugs and
  pins the invariants.

## Working notes

### Investigation

- `useChatSession` is the controller; UI screens in `Offerer.tsx` / `Joiner.tsx`
  enforce the "only call when idle" / "not while connecting" rules at the view
  layer. That inverts the layering: the imperative shell shouldn't be the only
  thing protecting the state machine.
- `ConnectionState` (in `src/core/rtc.ts`) already names every valid state:
  `idle | gathering | awaiting-answer | connecting | connected | failed | closed`.
- Existing tests in `useChatSession.test.ts` use a `FakePeerConnection` wrapped
  in a constructor shim that captures `lastPc` per `new`. To detect "no second
  PC constructed" we need either a counter on the shim or to assert `lastPc` is
  unchanged after the second call.

### Approach

1. Extend the test harness with a `pcConstructorCount` counter so a "no extra
   PC" assertion is unambiguous.
2. Add failing tests covering the five test-plan scenarios. Verify they fail
   against current code.
3. Add the three guards as suggested:
   - `startAsOfferer`: early return if `state !== 'idle'`.
   - `startAsAnswerer`: early return if `state !== 'idle'`.
   - `submitAnswer`: early return if `state !== 'awaiting-answer'`. Preserve the
     cold-start error message (state would be `'idle'` with no `pcRef`, but the
     guard covers it; if `pcRef` is null we keep the existing error string for
     parity with the existing cold-start test).
4. Add `state` to the relevant `useCallback` dependency lists.
5. Re-run tests — all should pass; existing happy-path tests stay green.

### Notes on the cold-start error message

The existing test `'without an active connection sets error and stays in idle'`
expects `error === 'No active connection — start a chat first.'` when
`submitAnswer` is called with no `pcRef`. With the guard keyed on
`state !== 'awaiting-answer'`, the cold-start path (state `idle`, no pcRef) will
fail the guard. To keep that test green, the guard body keeps the existing error
path when `!pcRef.current`. The other invalid-state cases (`connected`,
`gathering`) are silent no-ops, matching the ticket's "no user-visible message"
out-of-scope note.

### Resolution

- Added a `pcConstructorCount` counter to the fake-PC constructor shim and reset
  it in `beforeEach`.
- Added 5 tests under a new `useChatSession state-machine guards` describe
  block. All 5 failed against the un-guarded controller and pass after the fix.
- Added three single-line guards to `useChatSession.ts`. Added `state` to the
  dependency lists of all three callbacks.
- Full vitest run: 220 tests passing. `npm run ci` (format:check + typecheck +
  lint + test + build) passes.
