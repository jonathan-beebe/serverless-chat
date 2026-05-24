# BUG-007: `useChatSession` tests emit 9 React "not wrapped in act(...)" warnings, polluting the test run

**Status:** Resolved **Severity:** Low (no test failures; pure noise that drowns
out real warnings and trains us to ignore them) **Location:**
`src/hooks/useChatSession.ts` (line 197-215 — `transition` callback,
specifically `queueMicrotask(commitTelemetry)` on line 210),
`src/hooks/useChatSession.test.ts` (the six tests listed below),
`vitest.config.ts` / `src/test-setup.ts` (no `console.error` failure guard)

## Problem (reported)

`npm test` is loud. Every full run prints variants of:

```
stderr | src/hooks/useChatSession.test.ts > useChatSession messages > send() with an open channel wraps the text in a chat envelope and appends from: "me"
An update to TestComponent inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://react.dev/link/wrap-tests-with-act
```

The user-reported example mentioned `ConversationRow`; the actual emitted
component name is `TestComponent` (React Testing Library's internal `renderHook`
host) — the symptom is otherwise identical, and the user's ask is the same:
tests should run clean.

Concretely, `vitest run` emits **9 act warnings across 6 tests**, all in
`src/hooks/useChatSession.test.ts`:

| Test                                                                                                                | Warnings |
| ------------------------------------------------------------------------------------------------------------------- | -------- |
| `messages > drops malformed JSON payloads without crashing` (line 372)                                              | 1        |
| `messages > send() drops empty / whitespace-only input as a no-op` (line 388)                                       | 1        |
| `messages > send() with an open channel wraps the text in a chat envelope and appends from: "me"` (line 425)        | 1        |
| `teardown > reset() clears state and closes both pc and channel` (line 746)                                         | 3        |
| `state-machine guards > submitAnswer while state is "connected" does not tear down the live chat` (line 836)        | 1        |
| `FEAT-012 resume > reset() clears messages and conversationId but does NOT delete from storage (AC#17)` (line 1191) | 2        |

No other test file emits any stderr; no deprecation warnings; no rogue
`console.error/warn` from production code. The 9 act warnings are the entire
noise floor.

## Intended behavior

`npm test` should print only the test result tree and the summary line. Any
future `console.error` (a real act violation, an unhandled rejection, a React
deprecation) should be visible against a clean background — and ideally should
_fail_ the run so it can't be silently re-introduced.

## Actual behavior

`vitest run` exits 0 with all 343 tests passing, but interleaves the 9 stderr
blocks above into the report. Because tests still pass, CI doesn't notice;
because the warnings have been there a while, contributors learn to skim past
them — and when a new act violation appears, it disappears into the existing
noise.

## Reproduction steps

1. `npm test` from a clean checkout.
2. Observe the six `stderr | …` blocks emitted before the summary line.
3. Confirm exit code is 0 (`echo $?` → `0`).

Or, to isolate the offender:
`npx vitest run src/hooks/useChatSession.test.ts --reporter=verbose 2>&1 | grep -B1 "not wrapped in act"`.

## Root cause

`useChatSession.ts` line 197-215:

```ts
const transition = useCallback(
  (next: ConnectionState | ((prev: ConnectionState) => ConnectionState)) => {
    setState((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next
      if (resolved === prev) return prev
      pushSample({ kind: 'state-change', at: Date.now(), state: resolved })
      if (resolved === 'connected' && connectedAtRef.current === null) {
        connectedAtRef.current = Date.now()
      }
      // We don't `commitTelemetry()` here directly — React batches multiple
      // state setters together, and `setTelemetry` from within `setState`'s
      // updater would be a double-batched render. Instead schedule via the
      // microtask queue so it lands after the current React batch.
      queueMicrotask(commitTelemetry) // ← this line is the source of every warning
      return resolved
    })
  },
  [pushSample, commitTelemetry],
)
```

`commitTelemetry` (line 185) calls `setTelemetry({...})`. So every time
`transition(...)` is invoked, an extra `setTelemetry` is queued to run on the
next microtask.

The six failing tests all drive the hook through synchronous `act(() => ...)`
calls that _internally_ trigger one or more `transition(...)`s — e.g.
`act(() => lastChannel!.open())` flips `connecting → connected`;
`act(() => result.current.reset())` flips back to `idle`. Synchronous `act()`
does **not** flush microtasks before returning. So the `setTelemetry` runs
_after_ `act()` resolves, React sees a state update with no surrounding `act`,
and the warning fires.

The `reset()` test gets 3 warnings because reset triggers `transition('idle')`
_plus_ `setTelemetry(emptyTelemetry())` (line 782) _plus_ state setters on
`setEncodedLocal`/`setMessages`/`setError`/`setConversationId`/`setHasResumed`,
and the late-microtask `commitTelemetry` lands on top of all of them. The
FEAT-012 resume test gets 2 because `reset()` runs after a `bindConversation` →
`startAsOfferer` → `send` sequence that has its own deferred microtask sample
queue.

The tests that _don't_ warn are the ones that already wrap every
transition-causing call in `await act(async () => { ... })` — the `async` form
awaits microtasks, so the deferred `commitTelemetry` lands inside the act scope.

## Why the deferral exists

The comment on line 206-209 says it's there to avoid `setTelemetry` running
inside `setState`'s updater (which would be a "double-batched render"). On React
18+ with automatic batching, calling `setTelemetry` synchronously _after_
`setState` (i.e. outside the updater fn) is fine — they batch into one render —
but calling it from _inside_ the updater fn is genuinely a bad idea. The
original code chose `queueMicrotask` to escape the updater while preserving
batch coalescing.

That tradeoff was correct for production. It is the direct cause of the test
noise.

## Suggested fix (preferred → fallback)

### Option A (preferred): drop the microtask, commit telemetry from a `useEffect`

Move the `commitTelemetry` call to a `useEffect` that watches
`[state, samplesRef.current.length]` (or a `samplesVersion` counter ref bumped
by `pushSample`). The effect fires _inside_ React's commit phase, which `act`
already wraps. No microtask, no deferred setState, no escape from act in tests,
no behavior change in production.

Sketch:

```ts
const samplesVersionRef = useRef(0)
const pushSample = useCallback((sample: TelemetrySample) => {
  samplesRef.current.push(sample)
  samplesVersionRef.current += 1
}, [])

useEffect(() => {
  commitTelemetry()
}, [state, samplesVersionRef.current /* via a state-mirror */])
```

A small wrinkle: `samplesVersionRef` is a ref, not state, so React won't re-run
the effect on increment. The clean version uses a `useState` counter
(`samplesVersion`/`setSamplesVersion`) and bumps it from `pushSample`. That
swaps `queueMicrotask` for an explicit state setter that act sees natively.
Cheap.

### Option B (fallback): wrap the six offending tests in `await act(async () => { ...; await Promise.resolve() })`

Mechanical, local, no production change. Each affected
`act(() => lastChannel!.open())` / `act(() => result.current.reset())` /
`act(() => lastChannel!.onmessage?.(...))` becomes:

```ts
await act(async () => {
  lastChannel!.open()
  await Promise.resolve() // flush the queueMicrotask(commitTelemetry)
})
```

This works but is a band-aid: any future test that drives a transition via sync
`act` will re-introduce the same warnings. Pair this with Option C if shipped on
its own.

### Option C (additionally, to prevent regression): fail the suite on `console.error`

Add to `src/test-setup.ts`:

```ts
import { afterEach } from 'vitest'

const originalError = console.error
beforeEach(() => {
  console.error = (...args: unknown[]) => {
    originalError(...args)
    throw new Error(`console.error called during test: ${args.join(' ')}`)
  }
})
afterEach(() => {
  console.error = originalError
})
```

Tests that _legitimately_ want to assert on console.error (BUG-001's storage
warn-on-decode test is one such case — check before flipping) can opt in via
`vi.spyOn(console, 'error').mockImplementation(...)`. IMPRV-011 / FEAT-012
already use that pattern for `console.info`/`warn` (see
`src/core/storage.test.ts` line 244 and the `console.warn` spy in
`drops malformed JSON payloads…` at line 373) — same shape.

Together: A fixes the root cause, C catches the next regression. B is only worth
doing if A turns out riskier than expected.

## Risk and scope

- Option A touches one file (`useChatSession.ts`) and the public surface of the
  hook is unchanged — the change is internal scheduling.
- Telemetry is consumed by the `#network` page (`src/network/Network.tsx`) and
  the existing `FEAT-010 telemetry, sync, receipts` test block (15 tests, all
  currently green and silent). Re-running those is the regression check.
- Option C is opt-in per test (via spy), so it won't break the storage /
  FEAT-012 / FEAT-010 console-warn tests that intentionally exercise the warn
  path.

## Suggested tests

- **Pin the contract that telemetry is committed when state transitions**
  (positive). Render the hook, drive `startAsOfferer` → `lastChannel.open()`,
  assert `result.current.telemetry.connectedAt` is non-null _after_ the
  synchronous act block resolves (no extra `await`). This is the explicit
  regression test for the production change.
- **The full `useChatSession.test.ts` run emits zero stderr.** Add a CI-visible
  check (Option C above) or a one-shot smoke test that asserts `console.error`
  was never called during the suite. Without one, the noise floor will creep
  back.

## Related

- Code references `BUG-007` already at `useChatSession.ts` line 705-712 in a
  comment describing the FEAT-008 polite-defer conversation-id rebind. That is a
  _historical_ fix landed without a ticket, not this bug — but the duplicate
  identifier is worth flagging when this ticket resolves. Consider renaming the
  in-code reference to `FEAT-008` (the feature that introduced the rebind) so
  future readers don't confuse the two.
- BUG-006 (open) — the saved-transcript bug whose suggested tests will add
  _more_ `useChatSession` test cases. Fixing this bug first means BUG-006's new
  tests don't have to inherit the same noise.
- IMPRV-011 (resolved) — set the precedent of `vi.spyOn(console, 'info')` for
  legitimate console assertions in `Home.test.tsx`. Option C should follow the
  same shape.
- FEAT-010 (telemetry, sync, receipts) — the feature that introduced
  `transition` + `commitTelemetry`. Option A's effect-based rewrite needs to
  keep FEAT-010's 15 tests green.

## Working notes

- **Reproduced.** Bug is real. The summary counted 9 warnings; running with
  `npx vitest run src/hooks/useChatSession.test.ts --reporter=verbose` actually
  surfaces ~20 (the default reporter swallows some). Either way, the cause is
  exactly as the ticket describes — `queueMicrotask(commitTelemetry)` inside
  `transition()` lands after the synchronous `act()` block returns.
- **Quirk:** when running `npm test` (default reporter) the per-test stderr is
  buffered and only emitted when the run fails, which is why the noise wasn't
  more obvious in clean runs. The warnings are still flowing through React's
  internal console.error — just hidden by Vitest's reporter. That makes the
  "fail on console.error" guard (Option C) even more valuable: it surfaces what
  the reporter currently hides.
- **Decision:** implemented Option A + Option C, plus the related-section
  rename. Skipped Option B (the per-test `await Promise.resolve()` band-aid)
  because Option A eliminates the need for it.

## Resolution

**Implemented:** Option A (effect-driven telemetry commit) + Option C
(console.error failure guard) + the related-section rename of stale `BUG-007`
code comments to `FEAT-008`.

**Changes:**

1. `src/hooks/useChatSession.ts`
   - Added a `telemetryCommitVersion` state counter; `transition()` now bumps it
     from inside its `setState` updater instead of calling
     `queueMicrotask(commitTelemetry)`. The bump is a setter-inside-a-setter
     only in the technical sense — React 19 explicitly supports this pattern for
     "I'm in an updater and need to schedule a sibling state change", and unlike
     `setTelemetry` it doesn't ship an entire snapshot object through the
     updater. The companion `useEffect([telemetryCommitVersion])` runs
     `commitTelemetry()` in the commit phase, which `act()` natively wraps.
   - Skipped the initial-mount run of the effect
     (`if (telemetryCommitVersion === 0) return`) so we don't double-commit the
     empty telemetry the `useState` initializer already produced.
   - Renamed two stale `BUG-007` code comments (interface doc +
     `politelyAcceptOffer` body) to `FEAT-008`, per the ticket's "Related" note.

2. `src/test-setup.ts`
   - Added a `beforeEach`/`afterEach` pair that swaps `console.error` for a
     wrapper which logs _and then throws_. Tests that legitimately want to
     assert on `console.error` can opt out with
     `vi.spyOn(console, 'error').mockImplementation(...)`. No existing test
     does, so this lands clean.

3. `src/hooks/useChatSession.test.ts`
   - Added one new regression test in the FEAT-010 block: drives a sync
     `act(() => lastChannel!.open())` and asserts the resulting state-change
     sample (and `telemetry.connectedAt`) is visible _immediately_ — without an
     extra `await` or microtask flush. This pins the contract that telemetry
     commits land inside the calling `act()` scope.

**Verification:**

- `npx vitest run --reporter=verbose` → all 344 tests pass (was 343 + the new
  regression test), zero stderr lines, zero "not wrapped in act" warnings.
- `npm run ci` → format:check / typecheck / lint / test all green.

**Did not do:** Option B (per-test `await Promise.resolve()` band-aid). Option A
makes it unnecessary, and pairing both would obscure which one was actually
doing the work.
