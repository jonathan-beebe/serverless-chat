---
id: RSRCH-004
type: research
status: open
created: 2026-05-27
---

# RSRCH-004: consolidate the chat scroll/cursor implementation behind the now-stable four-rule model

## Problem

The chat scroll/cursor logic in `src/components/ChatTranscript.tsx` has
accumulated state, effects, and refs across seven successive tickets (IMPRV-005,
IMPRV-028, IMPRV-029, IMPRV-030, IMPRV-031, IMPRV-032, BUG-013). The last was a
regression caused by an incomplete model in the second-to-last: IMPRV-032 gated
the marker's _visibility_ on scroll state but left the cursor's _data half_
advancing only via the IMPRV-031 3-second dwell, so scrolling away from the
bottom within the dwell window left the cursor stranded behind the bottom 1-2
messages. BUG-013 added a separate at-bottom snap to close that gap. The
four-rule mental model (at-bottom anchors, scrollback releases, scrolled-back
shows marker, at-bottom hides marker + snaps cursor) is now stable, but the
implementation reflects the chronology of fixes rather than the model.

## Outcome

A written investigation answering: what is the simplest implementation shape
that encodes the four-rule model? Which existing state slots / refs / effects
are redundant (`wasNearBottomRef` vs `isNearBottom` are now two-source-of-truth
for the same fact)? Where should the boundary between `ChatTranscript` (layout +
items) and a separate cursor/scroll module sit? The deliverable is a
recommendation captured in a follow-up RFCTR or ARCH ticket — NOT a code change.

## Why it matters

Six consecutive incremental tickets touched the same file, and BUG-013 was a
regression from IMPRV-032's incomplete model. The cost of future changes scales
with the layered complexity; the next corner case (e.g., peer typing indicator,
multi-cursor presence, mention highlights) is likely to slip through again. A
research pass now is cheaper than the eventual seventh or eighth regression
caught in production. Pattern-matches the retro guidance from RSRCH-001 —
"recurrence blindness: N≥2 prior tickets touching the same surface."

## Discovery notes

- Accumulated state, refs, and effects in `ChatTranscript.tsx` today:
  `transcriptRef`, `wasNearBottomRef`, `isNearBottom` state, `dateFmt` /
  `timeFmt`, `resumeBoundary` state + effect, `lastReadIndex` memo,
  `onMarkReadRef`, `observerRef`, `bubbleRefs`, `dwellTimersRef`, observer-setup
  effect, snap effect (BUG-013), `registerBubble`, `newMessagesCount` state,
  `prevMessagesLengthRef`, messages-effect (auto-scroll + newcomer count),
  `onScroll`, `onNewMessagesClick`.
- The four-rule model: (1) at-bottom anchors and auto-scrolls new arrivals; (2)
  manual scrollback releases the anchor; (3) scrolled-back AND cursor < newest
  shows the marker; (4) at-bottom hides the marker AND snaps the cursor to
  newest. The IMPRV-031 dwell still applies but is now scrollback-only in effect
  (at-bottom always snaps before dwell could matter).
- A natural decomposition to evaluate: `useChatScrollState` (returns
  `isNearBottom` + a stable `onScroll` handler, owns the 32px threshold and the
  ref/state mirror) + `useChatCursorAdvance` (handles snap + dwell + the
  IntersectionObserver wiring) + `ChatTranscript` for layout and items
  rendering. The research should evaluate this alternative against keeping it
  inline.
- Two-source-of-truth scent: `wasNearBottomRef` and `isNearBottom` both track
  the same scroll-state fact. Refs were chosen for the messages-effect's
  synchronous read; state was added for the marker render branch. A single
  primitive might serve both with the right pattern.
- This ticket was dropped into `0-refine/` per `types/bug.md`'s guidance: "if
  you discovered any potential for refactoring or architecture work to help
  ensure a category of bugs never happens again, suggest to the agent it run
  /work-scope for a research task, no human intervention."

## Related work

- IMPRV-005, IMPRV-028, IMPRV-029, IMPRV-030, IMPRV-031, IMPRV-032 — incremental
  tweaks to chat scroll/cursor across May 2026
- BUG-013 — regression from IMPRV-032 that triggered this consolidation
  suggestion
- RSRCH-001 — workflow retro that flagged "recurrence blindness" (N≥2 prior
  tickets touching the same surface) as a failure mode
