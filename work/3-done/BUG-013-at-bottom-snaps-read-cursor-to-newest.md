---
id: BUG-013
type: bug
status: resolved
created: 2026-05-27
resolved: 2026-05-27
---

# BUG-013: at-bottom snaps the read cursor to the newest message so the marker stops surfacing above already-read content

## Problem

Scrolling up past the 32px threshold reveals the "Last read" marker above the
most recent 1-2 messages even after the user was pinned at the bottom long
enough to perceive the conversation as caught-up. The persisted read cursor is
advanced today via two paths — IMPRV-031's 3-second IntersectionObserver dwell
(`src/components/ChatTranscript.tsx:160-213`) and explicit `markRead` calls from
the hook's forward-only filter (`src/hooks/useChatSession.ts:306-322`) — neither
of which snap the cursor to the newest message when the user is at-bottom. When
messages arrive while pinned at the bottom, their dwell timers are ticking but
cancel as soon as the user scrolls up, leaving the cursor stranded behind the
bottom 1-2 messages. IMPRV-032 hid the marker WHILE at-bottom, but the cursor
lag became visible on the very next scroll-up.

## Outcome

- While the user is within the 32px near-bottom threshold, the persisted
  `lastReadMessageId` tracks the newest message in the conversation. New
  messages arriving while at-bottom advance the cursor on the same commit, with
  no 3-second wait.
- Scrolling up from at-bottom to scrolled-back without any intervening new
  arrivals leaves the cursor at the newest message — so the "Last read" marker
  does NOT reveal (caught-up: nothing to mark).
- If new messages arrive while the user is scrolled back, the marker reveals
  between the cursor (= the message that was newest when the user was last
  at-bottom) and the new arrivals.
- The IMPRV-031 dwell mechanism still applies for scrollback advancement — a
  bubble visible during scrollback for 3+ seconds still advances the cursor
  forward through history. At-bottom snap and dwell are additive, not
  replacement.
- Reload-resume is unchanged: a user who was caught-up at-bottom in the previous
  session reopens the conversation with the cursor at the newest message.

## Why it matters

The marker is meant to be a reliable wayfinding aid — "where I left off." Today
it surfaces in a state the user's mental model says is impossible ("I was at the
bottom; I saw everything"), so it reads as a "did the 3-second timer happen to
fire?" indicator instead. The four-rule model IMPRV-032 encoded for VISIBILITY
(at-bottom = caught up) is exactly the contract the cursor's DATA half should
obey — this bug is the data half not matching the render half.

## Discovery notes

- The `isNearBottom` state added by IMPRV-032 (`ChatTranscript.tsx:96-103`) is
  the natural hook for an at-bottom-snap effect: a useEffect with deps
  `[isNearBottom, messages, lastReadMessageId, onMarkRead]` that calls
  `onMarkRead(newestId)` whenever
  `isNearBottom && messages.length > 0 && newestId !== lastReadMessageId`.
- The hook's `markRead` (`useChatSession.ts:306-322`) is already forward-only,
  so calling it with the newest id while at-bottom is idempotent once the cursor
  lands at newest (no extra writes, no render churn).
- Reproduction: at-bottom, peer sends 2 messages back-to-back, scroll up within
  ~3 seconds. The marker reveals above both newcomers because their dwell timers
  cancelled on scroll-away.
- This is the 6th change to the chat scroll/cursor surface in rapid succession
  (IMPRV-005, -028, -029, -030, -031, -032). Each ticket has been a small
  additive tweak; the system is converging on the four-rule model but piecewise.
  The maker may want to surface a research or architecture ticket after this bug
  ships to take a holistic pass — not a blocker.

## Recommendation

- Add a useEffect to `ChatTranscript.tsx` near the existing IntersectionObserver
  wiring with deps `[isNearBottom, messages, lastReadMessageId, onMarkRead]`.
  Body: if `isNearBottom && messages.length > 0`, read
  `messages[messages.length - 1].id`; if it differs from `lastReadMessageId`,
  call `onMarkRead?.(newestId)`. The hook's forward-only filter handles
  idempotency.
- Leave IMPRV-031 dwell intact — it still has utility for scrollback advancement
  (the cursor tracks message-by-message as the user reads through history
  forward).
- Tests: at-bottom + new arrivals → cursor advances to newest immediately (no
  fake timers needed); scrolled-back + new arrivals → cursor stays put; user
  at-bottom, scrolls up, no arrivals → no marker (IMPRV-032 regression guard);
  user at-bottom, scrolls up, then new arrival → marker reveals between
  previous-newest and new arrival; reload-resume after at-bottom snap → cursor
  persists as newest.

## Related work

- IMPRV-032 — scroll-gated marker visibility (this defect surfaced when the
  scroll-gate exposed the cursor lag)
- IMPRV-031 — 3-second dwell (its semantic doesn't account for the at-bottom
  case)
- IMPRV-030 — persistent read cursor + Last read divider (where the cursor
  lives)
- IMPRV-029 — N new messages pill (parallel scroll-state affordance)
- IMPRV-028 — bottom-anchored geometry
- IMPRV-005 — anti-yank `wasNearBottomRef`, 32px threshold

## Working

Took the recommendation verbatim.

- Added a useEffect to `src/components/ChatTranscript.tsx` next to the
  IntersectionObserver wiring with deps
  `[isNearBottom, messages, lastReadMessageId, onMarkRead]`. Body: bail if
  `!isNearBottom`, bail if `messages.length === 0`, read the newest id, bail if
  it equals `lastReadMessageId`, otherwise call `onMarkRead?.(newestId)`. The
  hook's `markRead` (`useChatSession.ts:306-322`) is forward-only and
  idempotent, so a repeat call with the same id is a no-op.
- The IMPRV-031 IntersectionObserver+dwell wiring is untouched — it still fires
  for bubbles that satisfy 3s of viewport visibility. In practice the snap
  effect runs first (at-bottom is the steady state), so the dwell matters mainly
  for scrollback advancement, which is consistent with the ticket's "snap and
  dwell are additive, not replacement."

Test changes in `src/components/ChatTranscript.test.tsx`:

- New `describe('ChatTranscript at-bottom cursor snap (BUG-013)')` block with
  five cases: snap fires on initial mount when at-bottom; snap fires on the
  arrival commit while at-bottom; snap does NOT fire when scrolled back +
  arrival; caught-up + scroll-up shows no marker (end-to-end regression guard
  for IMPRV-032 + BUG-013); snap fires when the user scrolls back down to
  at-bottom after being scrolled away.
- The five existing IMPRV-031 dwell tests now interleave an
  `onMarkRead.mockClear()` between `render(...)` and the dwell-specific
  assertions. Reason: the snap effect now fires `onMarkRead(newest)` on initial
  mount, which is correct production behavior but pollutes the dwell tests'
  "before the dwell, nothing has fired" assertion. mockClear isolates the dwell
  mechanic for testing without changing the dwell's shipped semantics.

**Verification**: full suite 504/504. Typecheck + lint + format clean. The
DesignSystemChat test still passes because the route's no-op `markRead` keeps
the cursor stranded at `ds-4` — the snap effect calls `onMarkRead('ds-5')` on
mount but the stub doesn't advance the state.

**Follow-up**: per `types/bug.md`'s guidance ("if you discovered any potential
for refactoring or architecture work to help ensure a category of bugs never
happens again, suggest a research task and drop it in 0-refine"), filed
`RSRCH-004` in `work/0-refine/`. The pattern: seven consecutive tickets on the
same scroll/cursor surface, one of them a regression from another. The four-rule
model is stable; the code wants a consolidation pass.
