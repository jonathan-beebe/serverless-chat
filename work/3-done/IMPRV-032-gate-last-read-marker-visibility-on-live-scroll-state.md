---
id: IMPRV-032
type: improvement
status: resolved
created: 2026-05-27
resolved: 2026-05-27
---

# IMPRV-032: gate last-read marker visibility on live scroll state so it hides at-bottom and shows when scrolled back

## Problem

The transcript's "Last read" marker visibility is decoupled from live scroll
state. `src/components/ChatTranscript.tsx:77-79` inserts the marker whenever
`lastReadIndex !== null && i < messages.length - 1` — purely a cursor-vs-newest
decision. With the IMPRV-031 3-second dwell, a new message arriving while the
user is pinned at the bottom paints the marker between the prior cursor and the
newest message for up to 3 seconds before the cursor catches up and the marker
disappears. The "at-bottom = caught up" semantic exists in the user's mental
model but isn't encoded in the render path. Rules 1 and 2 (stay-at-bottom /
anti-yank scrollback) are already encoded by IMPRV-005 + IMPRV-028; rules 3 and
4 (marker visibility tied to scroll state) are the gap.

## Outcome

- When the user is within the existing 32px near-bottom threshold, the "Last
  read" divider is not rendered, regardless of where the persisted cursor sits
  in the messages list.
- When the user is scrolled back beyond the threshold AND the persisted cursor
  is not at the newest message, the "Last read" divider renders at its cursor
  position.
- Scrolling from "scrolled back" down past the threshold removes the marker in
  the same frame the threshold is crossed.
- Scrolling back up past the threshold (with cursor < newest) restores the
  marker.
- The persisted read cursor continues to advance via the IMPRV-031
  IntersectionObserver+3s dwell in the background — including while at-bottom —
  so a reload still lands the user at their last-read position if they later
  scroll back.
- IMPRV-029 "N new messages" pill behavior is unchanged (still appears when
  scrolled-back + new arrivals; tap-only dismissal).

## Why it matters

The marker is a wayfinding aid for catching up; there is nothing to catch up to
when the user is already at the end. The current code conflates two questions —
"have all messages been observed?" (cursor) and "should we draw a marker right
now?" (UX state). Decoupling them eliminates the 3-second flash on every new
arrival while at-bottom and makes the four-rule mental model literally visible
in the render code.

## Discovery notes

- Near-bottom state lives in a ref (`ChatTranscript.tsx:95`) updated by
  `onScroll` (`:264-269`). Refs don't trigger re-render, so the render-time
  marker gate needs the value mirrored into state.
- Marker insertion is a single conditional in `buildItems` (`:77-79`); the gate
  is one more boolean term on the if.
- IMPRV-029 pill counter already lives in state and reads scroll-state — same
  plumbing pattern.
- `onNewMessagesClick` (`:281-293`) already falls back to `scrollHeight` when no
  marker is rendered, so the pill's scroll target stays correct in the
  caught-up-at-bottom case.
- Initial mount with persisted history: `wasNearBottomRef.current = true` is the
  default, and the messages-effect auto-scrolls to bottom — so the at-bottom
  state applies on first paint and the marker stays suppressed until the user
  moves. No flash on resume mount.
- `DesignSystemChat` route (`src/design-system/DesignSystemChat.tsx`) currently
  keeps the marker visible at `ds-4` via a no-op `markRead` stub. With this
  change the marker is suppressed at-bottom — so the demo route either needs the
  user pre-scrolled above the threshold or a route-local override to keep the
  marker visible for visual review. Open call for the maker; not a blocker.

## Recommendation

- Add a piece of state `isNearBottom: boolean` (initial value `true`)
  co-existing with `wasNearBottomRef`. `onScroll` continues updating the ref
  synchronously (the messages-effect's auto-scroll branch keeps reading from the
  ref), and additionally calls
  `setIsNearBottom(distanceFromBottom < NEAR_BOTTOM_THRESHOLD_PX)` to mirror it
  for render consumers.
- In `buildItems` (or at the call site computing `lastReadIndex`), add a
  `suppressLastRead: boolean` term. When `isNearBottom` is true, treat
  `lastReadIndex` as `null` for the purpose of marker insertion. The persisted
  cursor itself does not change.
- Leave IMPRV-031 dwell mechanics intact; cursor still advances in the
  background while at-bottom so reload-resume continues to work.
- Tests: marker hidden when at-bottom + cursor < newest (new); marker shown when
  scrolled-back + cursor < newest; marker hidden when scrolled-back + caught up;
  marker disappears when scrolling down across the threshold; marker reappears
  when scrolling up across the threshold (cursor < newest); existing IMPRV-031
  dwell tests still pass — cursor advancement is unchanged.

## Related work

- IMPRV-005 — anti-yank `wasNearBottomRef`, 32px threshold (already encodes
  rules 1 & 2)
- IMPRV-028 — bottom-anchored geometry (the layout this lives on)
- IMPRV-029 — N-new-messages pill (parallel scroll-state-dependent affordance;
  unchanged)
- IMPRV-030 — persistent read cursor + "Last read" divider (renders the marker
  today)
- IMPRV-031 — 3-second dwell (source of the visible flash when at-bottom)

## Working

Took the recommendation verbatim.

- Added `isNearBottom: boolean` state to `ChatTranscript`
  (`src/components/ChatTranscript.tsx`), initial value `true` — matches the
  `wasNearBottomRef = true` default so the marker is suppressed on first paint
  (consistent with the auto-scroll snapping to bottom).
- `onScroll` now updates both `wasNearBottomRef.current` (synchronous, source of
  truth for the auto-scroll branch) and `setIsNearBottom(nearBottom)` (state
  mirror, source of truth for the marker render branch). React's setState bails
  out on equal primitives, so scrolls that don't cross the 32px threshold don't
  re-render.
- `lastReadIndex` `useMemo` gained an `isNearBottom` short-circuit: returns
  `null` when the user is at-bottom, suppressing marker insertion in
  `buildItems` via the existing null-check. Persisted cursor state is untouched
  — the IMPRV-031 IntersectionObserver+dwell still advances `lastReadMessageId`
  in the background.

Test changes in `src/components/ChatTranscript.test.tsx`:

- New `describe('ChatTranscript scroll-gated marker visibility (IMPRV-032)')`
  block with five cases: hidden on initial mount (default at-bottom) with cursor
  < newest; revealed when scrolling past 32px; hidden again on scroll-down
  across the threshold; hidden during the IMPRV-031 dwell window when at-bottom
  with a fresh arrival; cursor advancement still fires `onMarkRead` after dwell
  while at-bottom (background advancement intact).
- Two existing IMPRV-030 tests ("renders a Last read divider…" and "renders the
  divider with role=presentation…") required a scrollback simulation before
  asserting marker presence — added a `stubScroll` + `fireEvent.scroll` shim to
  each. The tests' intent (marker content + a11y attributes) is preserved.

DesignSystemChat (`src/design-system/DesignSystemChat.tsx`):

- The route's no-op `markRead` stub stays — it prevents the cursor from
  advancing past `ds-4` when the user does scroll back. But the marker is no
  longer visible on first paint because the auto-scroll snaps to bottom and
  IMPRV-032 suppresses it there. Comment updated to acknowledge the IMPRV-032
  invariant; no bypass prop added (the route now reflects production behavior).
- Test rewritten (`src/design-system/DesignSystemChat.test.tsx`): test 1 asserts
  the marker is hidden on initial mount per IMPRV-032; test 2 simulates a
  scrollback (local `stubScroll` + `fireEvent.scroll` helpers) and asserts the
  marker position between `ds-4` and `ds-5`.

**Verification**: full suite 499/499 (5 new tests added). Typecheck + lint +
format clean.
