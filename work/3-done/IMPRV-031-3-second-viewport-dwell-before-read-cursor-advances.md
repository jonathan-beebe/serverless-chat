---
id: IMPRV-031
type: improvement
status: resolved
created: 2026-05-27
resolved: 2026-05-27
---

# IMPRV-031: 3-second viewport dwell before the read cursor advances

## Problem

The IntersectionObserver in `src/components/ChatTranscript.tsx:142-167` (shipped
in IMPRV-030, commit a5308a3) fires `onMarkRead(messageId)` the instant a bubble
becomes intersecting. Two unintended consequences: (1) on a fresh mount of a
resumed conversation whose newest message is incidentally in the viewport, the
observer fires for that bubble within the first paint, advancing the cursor past
the persisted "you saw up to here" value before any human could perceive the
marker; (2) during fast scrollback through history, every bubble that passes
through the viewport advances the cursor, racing ahead of the user's actual
reading. The DesignSystemChat demo route patched this by neutering `markRead` to
a no-op (commit d143bb6), but that workaround is route-local; the production
behavior still flashes-and-clears the marker on real conversation mounts.

## Outcome

- A message bubble that becomes visible in the transcript viewport advances the
  read cursor only AFTER it has remained continuously visible for at least 3
  seconds.
- A bubble that scrolls into and out of the viewport in less than 3 seconds does
  NOT advance the cursor; the marker stays put.
- Opening a conversation whose persisted cursor is older than the
  currently-visible bubbles renders the "Last read" marker, and the marker
  remains visible for at least 3 seconds before the cursor begins to advance
  through those bubbles.
- The forward-only contract of the hook's `markRead` is preserved: once a bubble
  has satisfied the dwell condition, the cursor advances to that bubble's id
  only if it sits at a higher index than the current cursor; otherwise it stays
  put.
- The marker still clears once the cursor reaches the newest message (IMPRV-030
  caught-up condition unchanged).

## Why it matters

The IMPRV-030 marker exists to help the user pick up where they left off — a
wayfinding aid that survives reload and across-session resume. Without a dwell
gate the marker is visible for at most one paint frame on the most common
open-an-existing-conversation path (the persisted cursor is immediately consumed
by the IntersectionObserver firing for the same bubbles the user is just landing
on), which defeats its purpose. Fast scrollback exhibits the same failure mode
in a more user-driven way: scrolling fast through history to find a quote
shouldn't claim "I read all of those". A 3-second dwell encodes a sensible "you
actually looked at this" semantic without requiring eye-tracking or explicit
gestures.

## Discovery notes

- The IntersectionObserver setup lives at `ChatTranscript.tsx:142-167`. The
  callback dispatches `onMarkRead` immediately for every intersecting entry.
- Per-bubble dwell tracking is the natural primitive: a
  `Map<messageId, timerId>` stored in a ref. On `isIntersecting` →
  setTimeout(3000) → call `onMarkRead` → remove from map. On `!isIntersecting` →
  clearTimeout + remove from map. The forward-only filter in the hook's
  `markRead` (`useChatSession.ts:233`) stays as a final guard; the dwell gate is
  purely a "should we even ask the hook to advance?" pre-filter.
- The 3-second threshold should live in a named constant alongside
  `NEAR_BOTTOM_THRESHOLD_PX` (`ChatTranscript.tsx:18`) so future tuning is one
  edit, not a magic number scattered in the observer wiring.
- On unmount, all pending dwell timers must be cleared (the observer's
  `disconnect()` does NOT cancel `setTimeout`, and a fired timer on a dead
  component would call into a stale `onMarkRead` ref).
- The IntersectionObserver's `delay` option (paired with
  `trackVisibility: true`) is the closest spec-blessed alternative but is meant
  for visibility-correctness ("is this element actually painted under another?")
  not dwell time, and carries documented performance costs. Plain
  `setTimeout`-per-bubble is simpler.
- Tests use the existing per-file IntersectionObserver mock at
  `ChatTranscript.test.tsx:7-50`; new tests will use `vi.useFakeTimers()` +
  `vi.advanceTimersByTime(3000)` to assert dwell-then-mark, scroll-past-no-mark,
  and unmount-cancels-timer.
- Open question for the maker: whether to revert the DesignSystemChat no-op
  (commit d143bb6) after this lands — with the dwell gate the demo marker is
  visible for the first 3 seconds of viewing, which may be enough for a visual
  review. Not a blocker either way.

## Recommendation

- Define `READ_DWELL_MS = 3000` near `NEAR_BOTTOM_THRESHOLD_PX` at the top of
  `ChatTranscript.tsx`.
- Replace the immediate-fire branch in the observer callback with a per-bubble
  `setTimeout(READ_DWELL_MS)` that calls `onMarkReadRef.current?.(id)` and
  removes itself from the timer Map.
- When an entry transitions to `!isIntersecting`, clear the pending timer for
  its `messageId` (if any) and remove it from the Map.
- In the observer effect's cleanup, iterate the Map and `clearTimeout` every
  pending timer so unmount doesn't fire dead callbacks.
- The hook's `markRead` (`useChatSession.ts:233`) stays as-is — its forward-only
  check is the safety net for any race where multiple bubbles satisfy the dwell
  condition in the same microtask.
- Tests should cover: bubble visible <3s → no `markRead`; bubble visible ≥3s →
  `markRead` fires with the right id; bubble visible 2s, exits, re-enters,
  visible 2s more → no `markRead` (the dwell resets, not cumulative); unmount
  with pending timers → no spurious `markRead` fires; the existing IMPRV-030
  tests that assert "observer entries fire onMarkRead" need to be updated to
  advance fake timers.

## Related work

- IMPRV-030 — Read cursor with "Last read" divider (commit a5308a3)
- IMPRV-029 — N new messages pill (the pill's scroll target depends on the
  marker still being rendered)
- IMPRV-028 — bottom-anchored transcript (geometric model the observer reasons
  about)
- IMPRV-005 — chat auto-scroll yanks scrollback (anti-yank precedent for "don't
  act on transient state")
- A11Y-018 — chat transcript `role="log"` (the dwell gate doesn't change the
  live-region story)

## Working

Took the recommendation verbatim.

- Added `READ_DWELL_MS = 3000` next to `NEAR_BOTTOM_THRESHOLD_PX` at the top of
  `src/components/ChatTranscript.tsx`.
- Added `dwellTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>`
  alongside `observerRef` / `bubbleRefs`. Keyed by `messageId`.
- Rewrote the observer callback: on `isIntersecting`, schedule a
  `setTimeout(READ_DWELL_MS)` if no timer is already pending for that id (the
  `timers.has(id)` guard makes re-entries non-cumulative — the new visit's dwell
  starts fresh). When the timer fires, it removes itself from the Map and calls
  `onMarkReadRef.current?.(id)`. On `!isIntersecting`, clear the pending timer
  (if any) and delete the entry.
- Observer effect's cleanup iterates the Map and `clearTimeout`s every pending
  timer before clearing it. `disconnect()` stops further intersection callbacks
  but does NOT cancel scheduled timeouts; without this, a fired timer on a dead
  component would call into a stale `onMarkReadRef` and could race a fresh
  observer on the next mount.
- Hook's `markRead` left untouched — its forward-only check is the safety net
  for any race where multiple bubbles satisfy the dwell condition in the same
  microtask.

Test updates in `src/components/ChatTranscript.test.tsx`:

- The existing IMPRV-030 "observer entries fire onMarkRead" test was re-shaped
  to drive `vi.useFakeTimers()` + `vi.advanceTimersByTime` — pre-dwell no fire;
  advance 2999ms still no fire; cross 3s → fire once.
- New: bubble visible <3s then exits → no `markRead`, even after wall- clock 5s
  elapses.
- New: re-entry resets dwell (2s visible → exit → re-enter → 2s visible → no
  fire; another 1s → fire once).
- New: unmount with pending timer → no spurious `markRead` after 5s of
  wall-clock.

Test infrastructure: tests wrap each block in `vi.useFakeTimers()` /
`vi.useRealTimers()` (via try/finally) so a single failure doesn't leak fake
timers into the rest of the suite. The existing per-file
`MockIntersectionObserver` (lines 7-50) needed no changes — its `fire()` helper
drives the observer callback synchronously, which is exactly what we need to
assert dwell timing.

DesignSystemChat no-op (commit d143bb6) left in place — the dwell gate covers
the production flash-and-clear, but the design-system fixture is small enough
that a 3-second visit on a static page would still eventually advance past
`ds-4`. Keeping the no-op preserves the marker indefinitely for visual review,
which the route exists for. A maker revisiting the demo can revert the no-op if
they want the dwell to be exercised on the demo route too.

**Verification**: full suite 494/494. Typecheck + lint clean.
