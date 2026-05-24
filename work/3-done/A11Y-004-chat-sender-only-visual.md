# A11Y-004: Chat message sender conveyed only visually

**Status:** Resolved **WCAG:** 1.3.1 Info and Relationships (Level A), 1.4.1 Use
of Color (Level A) **Severity:** High **Location:** `src/components/Chat.tsx`
(lines 30-46)

## Problem

Each transcript entry renders as:

```tsx
<li className={`flex ${m.from === 'me' ? 'justify-end' : 'justify-start'}`}>
  <span
    className={`... ${m.from === 'me' ? 'bg-sky-600 text-white' : 'bg-slate-700 text-slate-100'}`}>
    {m.text}
  </span>
</li>
```

The `from` property (`'me' | 'them'`) is conveyed only through:

1. Horizontal alignment (`justify-end` vs `justify-start`)
2. Bubble background color (`bg-sky-600` vs `bg-slate-700`)

There is no text, ARIA label, role, or other programmatic signal of who sent
each message. Because the surrounding `<ol>` is `aria-live="polite"`, every new
message is announced as just its text. A screen-reader user listening to a fast
conversation cannot tell which messages are theirs and which are the remote
peer's, and the rendered transcript has no speaker attribution at all on
re-read.

This fails:

- **1.3.1 Info and Relationships** — the speaker relationship is presented
  visually but not programmatically.
- **1.4.1 Use of Color** — color (plus alignment) is the only means of
  distinguishing message authorship.

## Intended behavior

The transcript should communicate who sent each message both visually and
programmatically. Live-region announcements should include speaker context.

## Suggested fix

Add a visually-hidden speaker prefix inside each `<li>` so screen readers
announce attribution but visuals are unchanged:

```tsx
<li ...>
  <span className="sr-only">{m.from === 'me' ? 'You said: ' : 'They said: '}</span>
  <span className={`... ${m.from === 'me' ? 'bg-sky-600 text-white' : 'bg-slate-700 text-slate-100'}`}>
    {m.text}
  </span>
</li>
```

For sighted users who cannot distinguish color (or whose alignment perception is
impaired), also add a small visible attribution (e.g. a "You" / "Them" caption
above the bubble, or a sender avatar) so the distinction is not color-only.

If `sr-only` is not already defined in the Tailwind setup, use Tailwind's
built-in `sr-only` utility class (available by default in Tailwind v4).

## Working notes

- Confirmed the issue is real in `src/components/Chat.tsx` lines 58-67: each
  `<li>` renders a single colored/aligned `<span>` with no programmatic speaker
  signal. The wrapping `<ol>` has `aria-live="polite"` and
  `aria-label="Chat transcript"`, so each new message is announced as just its
  text.
- `ChatMessage.from` is `'me' | 'them'` (`src/core/rtc.ts:18-23`); no
  display-name data exists in this product, so a generic "You" / "Them"
  attribution is the right level.
- Tailwind v4 is in use (`package.json`); the built-in `sr-only` utility is
  already in play in this same file for the chat input's label (line 71), so
  reusing it is consistent.
- Decision: implement the ticket's "Suggested fix" plus the recommended
  sighted-user attribution.
  - Prepend a `<span className="sr-only">You said: </span>` / `Them said: `
    inside each `<li>`. This makes the live-region announcement read e.g. "You
    said: hello", which is the right pattern recommended by the suggested fix
    and avoids changing the live-region semantics (still polite, still bubbles
    up the whole `<li>` text content).
  - Add a small visible caption above each bubble (`You` / `Them`) so sighted
    users who can't distinguish color (or whose alignment perception is
    impaired) still see authorship. Use the same alignment classes already in
    play on the row so it reads "above the bubble" on the correct side.
  - "Them" is slightly awkward but accurate given there is no name; an avatar
    would require more design surface than this ticket warrants. The visible
    caption uses `text-xs text-slate-400` for hierarchy without competing with
    the bubble.
- Tests: `Chat.test.tsx` currently only asserts auto-scroll behavior — no
  DOM-shape assertions to break. Will add one test asserting the sr-only prefix
  is rendered for both `from` values so the announcement contract is locked in.
- The sr-only `<span>` lives _inside_ the `<li>` so the live-region announcement
  includes it. Putting it inside the bubble `<span>` would also work but
  separating it keeps the visual `<span>` purely about the bubble's appearance.

## Resolution

- `src/components/Chat.tsx`: each `<li>` now stacks vertically (`flex-col` +
  `items-end`/`items-start`) and contains three children: an `aria-hidden`
  visible "You"/"Them" caption (`text-xs text-slate-400`), a `sr-only` "You
  said: "/"They said: " prefix that feeds the polite live-region announcement,
  and the original colored bubble `<span>` unchanged.
- `src/components/Chat.test.tsx`: added a `Chat speaker attribution (A11Y-004)`
  describe block with two assertions — one that the transcript text content
  (what the live region reads out) contains "You said: ..." and "They said: ..."
  for the respective speakers, and one that the visible captions "You" and
  "Them" are rendered.
- Verified: `npm test` (44 passed, +2 from the new assertions),
  `npm run typecheck`, `npm run lint` all clean via `./scripts/ci.sh`.
- Commit: 07e2b93
