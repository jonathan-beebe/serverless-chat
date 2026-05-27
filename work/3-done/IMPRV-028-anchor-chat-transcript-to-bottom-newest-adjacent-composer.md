---
id: IMPRV-028
type: improvement
status: resolved
created: 2026-05-27
resolved: 2026-05-27
---

# IMPRV-028: Anchor chat transcript to bottom so newest message sits adjacent to composer

## Problem

`src/components/ChatTranscript.tsx` renders messages top-down inside a
`flex-1 overflow-y-auto` container — the first message sits at the top of the
transcript with whitespace filling the rest of the scroll viewport beneath it.
The intended visual model is inverted: messages anchored to the bottom (adjacent
to the composer), whitespace above when content is short, older messages
scrolling off the top once content exceeds the viewport.

## Outcome

- With zero messages, the empty-state placeholder sits at the bottom of the
  transcript area, just above the composer.
- With one message, that message sits at the bottom of the transcript area; the
  space above it is empty.
- With two messages, the newer message sits at the bottom and the older message
  sits directly above it; the space above both is empty.
- When cumulative message height exceeds the transcript viewport, the newest
  message remains visible at the bottom adjacent to the composer and the oldest
  messages scroll off the top (accessible by scrolling up).
- When the user has scrolled up to read older messages and a new message
  arrives, the visible older messages do not move (IMPRV-005 anti-yank behavior
  preserved, mirrored for the inverted geometry).
- DOM/source order is preserved: messages remain in chronological order from
  first to last (no `role="log"` / `aria-live` regressions; A11Y-018 contract
  intact).

## Why it matters

Bottom-anchored stacking is the dominant chat-app convention (iMessage,
WhatsApp, Slack DMs, SMS). The current top-anchored layout puts the first
message visually far from the composer, leaving a strange empty gap between the
most recent message and the input where the user's attention is focused.
Anchoring to the bottom collapses that gap and makes the spatial relationship
between "what was just said" and "what I am typing" immediate.

## Discovery notes

- Current scroll container: `src/components/ChatTranscript.tsx:142`
  (`flex-1 overflow-y-auto overscroll-contain`).
- Current message list: `src/components/ChatTranscript.tsx:148`
  (`<ol className="space-y-2">`).
- Empty-state placeholder currently rendered with `aria-hidden="true"` outside
  the live region — placement should stay aria-hidden when moved.
- Auto-scroll logic at `ChatTranscript.tsx:96-108` uses
  `distanceFromBottom < 32`; `scrollHeight` / `scrollTop` / `clientHeight` math
  is independent of the CSS anchoring approach, but tests asserting specific
  `scrollTop` values for the initial-fill case will need updating.
- Tests pinning current top-anchored ordering:
  `src/components/ChatTranscript.test.tsx:34-95` (auto-scroll describe block).

## Recommendation

- Two viable mechanisms; maker's call:
  1. `margin-top: auto` on the `<ol>` (or wrap it in a flex column and put
     `mt-auto` on the list). Keeps chronological DOM order, keeps `<ol>`
     semantics, simplest a11y story. Preferred.
  2. `flex-col-reverse` on the `<ol>`. Visually inverts, but introduces a
     source-vs-visual order mismatch that complicates `aria-live` and keyboard
     navigation given A11Y-018. Probably wrong here.
- Lean toward option 1. Keep messages first→last in DOM; let the flex container
  do the visual anchoring.
- Verify in the design-system mock chat route (per IMPRV-019) with 0, 1, 2, and
  overflow-many message states.

## Related work

- IMPRV-005 — chat auto-scroll yanks scrollback (anti-yank `wasNearBottomRef`
  pattern, 32px threshold)
- IMPRV-007 — connected screen page scrolls with transcript (transcript is the
  single scroll surface)
- IMPRV-020 — connected chat container fills vvh, pins composer bottom
- IMPRV-026 — lift composer off viewport bottom on wide screens
- IMPRV-027 — hide chat transcript border below sm breakpoint
- A11Y-018 — chat transcript `aria-live` on `<ol>` instead of `role="log"`
- A11Y-021 — chat transcript not keyboard focusable

## Working

Took option 1 (mt-auto on the child) from the recommendation. The scroll wrapper
at `src/components/ChatTranscript.tsx:142` already carried
`flex-1 overflow-y-auto overscroll-contain ...`; flipped it to
`flex flex-1 flex-col overflow-y-auto ...` so the wrapper is itself a flex
column whose only child (either the empty-state `<p>` or the message `<ol>`)
carries `mt-auto`. Auto top margin absorbs the slack when content is shorter
than the viewport (bottom-anchors the content adjacent to the composer);
collapses once content overflows so normal scrolling takes over with the newest
message pinned at the bottom.

- DOM order untouched: oldest→newest, `<ol>` semantics intact, `role="log"` /
  `aria-live` contract preserved (A11Y-018 regression guards still green).
- Existing auto-scroll math at `ChatTranscript.tsx:96-108` independent of the
  anchoring CSS — `scrollHeight` / `scrollTop` / `clientHeight` reasoning
  unchanged. IMPRV-005 anti-yank tests still pass without modification (the
  `wasNearBottomRef` threshold logic is layout-agnostic).
- Empty-state placeholder kept `aria-hidden="true"` and lives outside the
  message `<ol>`; just added `mt-auto` so it bottom-anchors too.

Tests added under `describe('ChatTranscript bottom anchoring (IMPRV-028)')` in
`src/components/ChatTranscript.test.tsx`:

1. wrapper is `flex flex-col` (and explicitly NOT `flex-col-reverse`).
2. `<ol>` carries `mt-auto`.
3. empty-state `<p>` carries `mt-auto`.
4. chronological DOM order preserved (oldest first, newest last) — guards
   against an accidental `flex-col-reverse` regression that would still look
   right visually but desync A11Y-018 live-region additions.

Full suite: 462/462 passing. Typecheck + lint clean. Dev server boots without
errors; the change is a standard Tailwind flex-column + mt-auto pattern so
visual behavior in the design-system mock chat route at `/design-system/chat`
should match the four outcome states verbatim — but I cannot drive a browser
from this environment, so visual confirmation of the four states (0 / 1 / 2 /
overflow-many) is left to the human reviewer.
