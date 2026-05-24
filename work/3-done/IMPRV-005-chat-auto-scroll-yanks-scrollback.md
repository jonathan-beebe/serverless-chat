# IMPRV-005: `Chat` always scrolls to the bottom on every new message, yanking users out of scrollback

**Status:** Resolved **Severity:** Low **Location:** `src/components/Chat.tsx`
(lines 14-19)

## Problem

The transcript effect blindly forces the scroll position to the bottom every
time the `messages` array updates:

```tsx
useEffect(() => {
  const el = transcriptRef.current
  if (!el) return
  el.scrollTop = el.scrollHeight
}, [messages])
```

If the user has scrolled up to re-read earlier messages and a new message
arrives (incoming or outgoing), they are yanked back to the bottom and lose
their place. This is the well-known "chat scroll" antipattern; most chat UIs
only auto-scroll when the user is _already_ near the bottom.

It also fights with screen-reader and keyboard users who Tab through the list —
moving focus into a list item that is then scrolled out of view by the next
incoming message.

## Intended behavior

Auto-scroll only when the user is already pinned at (or near) the bottom of the
transcript. If they have scrolled up, leave their scroll position alone.
Optionally, surface a "new messages ↓" affordance that jumps them back.

## Suggested fix

Track whether the user is near the bottom _before_ the new messages render, and
only scroll if they were:

```tsx
const transcriptRef = useRef<HTMLOListElement | null>(null)
const wasNearBottomRef = useRef(true)

useEffect(() => {
  const el = transcriptRef.current
  if (!el) return
  if (wasNearBottomRef.current) el.scrollTop = el.scrollHeight
}, [messages])

const onScroll = () => {
  const el = transcriptRef.current
  if (!el) return
  const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
  wasNearBottomRef.current = distanceFromBottom < 32
}

// …
<ol ref={transcriptRef} onScroll={onScroll} …>
```

The 32-px threshold forgives small mis-clicks while still respecting an
intentional scroll-up. The "new messages" affordance is a nice-to-have; the core
fix is the conditional auto-scroll.

Add a `Chat.test.tsx` integration test (using the existing
`@testing-library/react` setup) that asserts both:

1. New message while pinned to bottom → scroll position moves to bottom.
2. New message while scrolled up → scroll position is unchanged.

JSDOM's layout primitives are limited but `scrollTop`, `scrollHeight`, and
`clientHeight` can all be stubbed on the element under test.

## Working notes

### Survey

- `src/components/Chat.tsx` is the only component with auto-scroll logic; the
  bug is exactly as described — `useEffect` on `[messages]` unconditionally
  writes `scrollTop = scrollHeight`.
- No existing `Chat.test.tsx`. `App.test.tsx` and `useChatSession.test.ts` show
  the project's testing style (Vitest + RTL + minimal stubs, with explanatory
  comments on _why_, not _what_).
- The transcript element is already keyed by `aria-label="Chat transcript"`,
  which makes RTL's `getByRole('list', { name: ... })` straightforward.

### Timing of the "was-at-bottom" capture

By the time `useEffect` on `[messages]` runs, React has already committed the
new message to the DOM — `scrollHeight` includes the new content. So we cannot
reliably ask "is the user near the bottom?" _inside_ the effect: the
just-rendered message moved the goalposts.

The ticket's `onScroll`-driven ref is the correct pattern: scroll events fire
only on actual user scroll input, so `wasNearBottomRef.current` is always the
user's intent as of the _last_ render. When new messages arrive (controller
pushes), the ref still reflects the pre-update state. `useLayoutEffect` doesn't
help — it also runs after commit.

Initial mount: the ref defaults to `true` so the first render still scrolls to
the bottom — preserves the existing behaviour for the most common case (joining
an in-progress chat).

### Threshold

32px matches the ticket suggestion. Small enough that "I scrolled up to read"
registers immediately; large enough to forgive a single trackpad tap or one
elastic-bounce pixel. Not exposed as a prop — only one call site, no signal that
any other consumer cares.

### Plan

1. Write `Chat.test.tsx` covering: (a) initial render scrolls to bottom, (b)
   pinned-to-bottom → auto-scroll on new message, (c) scrolled up → scroll
   preserved, (d) within-threshold treated as pinned. Stub
   `scrollHeight`/`clientHeight` via `Object.defineProperty`. Confirm (c) fails
   against current code.
2. Add `wasNearBottomRef` and `onScroll` handler to `Chat.tsx`; gate the
   existing effect on it.
3. `npm test` / `typecheck` / `lint`.
4. Commit, mark resolved, move file, update log.

Out of scope: the "new messages ↓" affordance is called out as a nice-to-have in
the ticket but not part of the core fix. Skipping it per "keep changes minimal."
