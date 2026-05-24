# IMPRV-007: Connected chat page scrolls in addition to the transcript — `Chat`'s outer wrapper isn't bounded inside its flex-column parent

**Status:** Resolved **Severity:** Medium **Location:**
`src/components/Chat.tsx:118` (outer wrapper
`<div className="flex h-full flex-col gap-3">`); surfaces as a layout bug on
`src/screens/Offerer.tsx:88` and `src/screens/Joiner.tsx:74` (the two
`<ScreenContainer>`s with `h-[calc(100vh-3rem)] flex flex-col`).

## Problem

On the connected screen (both Offerer and Joiner), the page itself scrolls _in
addition to_ the transcript inside `<Chat>`. The two scroll surfaces fight each
other: the wheel/trackpad will scroll the document until it's pinned, then start
scrolling the inner transcript — and on touch, the rubber-band bounces happen on
the wrong element. Only the transcript inside `<Chat>` should scroll; the
surrounding chrome (heading, "End chat" button, composer) should stay locked to
the viewport.

Why it happens — the layout chain on the connected branch:

```tsx
// Offerer.tsx:84-103 (Joiner.tsx:70-91 is identical in shape)
<ScreenContainer
  label="Connected"
  className="mx-auto flex h-[calc(100vh-3rem)] max-w-xl flex-col gap-3 px-4 py-6">
  {liveStatus}
  <header className="flex items-center justify-between">…</header>
  <Chat messages={session.messages} onSend={session.send} />
</ScreenContainer>
```

```tsx
// Chat.tsx:117-118
return (
  <div className="flex h-full flex-col gap-3">
    <div
      ref={transcriptRef}
      …
      className="flex-1 overflow-y-auto rounded-md …"
    >
      …
    </div>
    <form …>…</form>
  </div>
)
```

The `<main>` is a flex-column with a bounded height (`calc(100vh - 3rem)`),
which is correct. Its direct children are `<LiveRegion>` (sr-only, ~0px),
`<header>` (intrinsic height), and `<Chat>`'s outer `<div>`. That outer `<div>`
uses `h-full` — but on a flex-column item, `h-full` resolves against the
parent's _content area_, which is itself determined by the children. Crucially,
the outer `<div>` has no `flex-1` and no `min-h-0`, and flex children default to
`min-height: auto` (≈ their intrinsic content height). So once the transcript
accumulates enough messages, Chat's intrinsic content height exceeds the slot
`h-full` would have given it; the flex container honors the larger intrinsic
min, Chat overflows the bottom of `<main>`, the document grows past `100vh`, and
**the viewport scrolls** even though the transcript also has its own
`overflow-y-auto` ready to handle the same content.

Symptoms a user actually sees:

1. After enough messages, the page gains a viewport-level scrollbar in addition
   to the transcript's inner scrollbar.
2. Scrolling near the composer scrolls the _page_, not the transcript — so the
   composer can drift off-screen.
3. The transcript's "near-bottom auto-scroll" (`Chat.tsx:63-68`) keeps pinning
   the inner element to the bottom, but the document above it is now offset, so
   the composer can sit below the visible viewport on smaller screens.
4. On touch devices, pull-down from the transcript top sometimes bounces the
   _document_ rather than rubber-banding the transcript.

The transcript's own scroll behavior (IMPRV-005 scroll-pin, A11Y-018
`role="log"` on the scroll container) is correct. The bug is upstream: Chat's
outer wrapper doesn't participate in the parent's flex distribution, so it can't
be the bounded "fills remaining space" child the layout assumes.

## Intended behavior

On the connected screen:

- The `<main>`/`<ScreenContainer>` fills the viewport (minus the existing
  top/bottom padding) and never causes the document to scroll.
- `<Chat>` occupies all remaining vertical space between the header and the
  bottom of the screen — no more, no less.
- The transcript inside `<Chat>` is the _only_ scrollable surface on the page.
  Wheel/trackpad/touch interactions over the heading, the composer, or any
  margin around them do not move anything.
- The composer stays visible at the bottom of the viewport regardless of how
  many messages are in the transcript.

The fix should hold for both Offerer and Joiner connected branches, which share
the same layout shape.

## Suggested fix

Change Chat's outer wrapper to participate in its parent's flex column properly,
instead of relying on `h-full`:

```diff
- <div className="flex h-full flex-col gap-3">
+ <div className="flex min-h-0 flex-1 flex-col gap-3">
```

- `flex-1` makes Chat consume the remaining height in the parent flex column
  (the slot left over after `<header>` is laid out).
- `min-h-0` overrides the flex default of `min-height: auto`, so the
  transcript's content height can't push Chat past its allotted slot. This is
  the same pattern the transcript itself already relies on internally via
  `flex-1 overflow-y-auto`.

This is a one-line change in `src/components/Chat.tsx`. No screen-side changes
are required — Offerer.tsx:88 and Joiner.tsx:74 already give Chat a properly
bounded flex-column parent; they just need a child that respects the bound.

The non-connected branches of Offerer/Joiner (invite, reply-code, closed) don't
render `<Chat>` and don't use `h-[calc(100vh-3rem)]`, so they're unaffected by
this change.

## Test plan

JSDOM doesn't lay out scrollable elements (see the comment block at
`Chat.test.tsx:6-14`), so a strict "document didn't grow past viewport"
assertion isn't reliably testable in unit-land. The verification mix:

1. **Unit (class assertion).** Add a small test to `Chat.test.tsx` asserting the
   outer wrapper carries `flex-1` and `min-h-0` (and no `h-full`). This pins the
   contract that callers depend on — that `<Chat>` is a flex-1 child of a
   bounded flex-column — so a future refactor can't quietly regress it.
2. **Manual (browser).** With `npm run dev`, open the connected screen on both
   Offerer and Joiner, paste/send ~50 messages, and confirm:
   - The document does not gain a viewport-level scrollbar.
   - Only the transcript scrolls; the header and composer stay pinned.
   - Resizing the viewport down to ~600px tall keeps the composer visible.
   - The transcript's existing scroll-pin / read-up behavior (IMPRV-005) still
     works.
3. **Regression guard.** Existing Chat tests (initial-render auto-scroll,
   near-bottom pin, scrollback preservation) must remain green — none of them
   depend on the outer wrapper's height utility.

## Working

Plan (TDD-first, minimal change):

1. Confirmed root cause matches the ticket's analysis. `Chat.tsx:118` outer
   wrapper uses `flex h-full flex-col gap-3`. Inside its flex-column parent
   (`ScreenContainer` on `Offerer.tsx:96` and `Joiner.tsx:84` with
   `flex h-[calc(100vh-3rem)] flex-col gap-3`), this child has no `flex-1` and
   no `min-h-0`, so its intrinsic content can push past the bounded slot once
   enough messages accumulate. The transcript's own `flex-1 overflow-y-auto`
   (line 145) is correct — the bug is purely the outer wrapper failing to
   participate in the parent flex distribution.
2. Add a class-contract test to `Chat.test.tsx` asserting the outer wrapper
   carries `flex-1` and `min-h-0` and does NOT carry `h-full`. JSDOM can't lay
   out scroll, but this pins the contract that callers depend on. Pattern
   mirrors the existing A11Y-021 class-presence assertions in the same test
   file.
3. Apply the one-line fix in `Chat.tsx`: `flex h-full flex-col gap-3` →
   `flex min-h-0 flex-1 flex-col gap-3`.
4. Run the full test suite to confirm no regressions in the existing Chat suite
   (scroll-pin, FEAT-002 focus, FEAT-004 Enter/Shift+Enter, FEAT-006 date
   headers, A11Y-018 log surface, A11Y-021 focusability).
5. Commit, move ticket, update log.

Confirmed test pattern lives at `Chat.test.tsx:429-439` (A11Y-021 class-presence
assertions) — same approach for the new contract test.

### Resolution

- Added new describe block "Chat outer wrapper layout contract (IMPRV-007)" in
  `src/components/Chat.test.tsx` with a single class-contract test asserting the
  outer wrapper carries `flex-1` and `min-h-0` and does NOT carry `h-full`.
  Confirmed it failed against the old shape (red phase), then passed after the
  fix (green phase).
- Applied the suggested one-line fix in `src/components/Chat.tsx:117-126`: outer
  wrapper changed from `flex h-full flex-col gap-3` to
  `flex min-h-0 flex-1 flex-col gap-3`, with an inline comment explaining the
  flex-participation contract.
- All 161 tests pass across the suite (19 files). `npm run typecheck` and
  `npm run lint` clean.
- No screen-side changes needed: `Offerer.tsx:96` and `Joiner.tsx:84` already
  give `<Chat>` a properly bounded flex-column parent.

## Out of scope

- Locking the document/body from scrolling with `overflow: hidden` on
  `html`/`body`/`#root`. Useful as belt-and-suspenders but a broader behavioral
  change; this ticket targets the actual root cause in `Chat.tsx`.
- Auditing non-connected screens (invite, reply, closed, Home) for similar
  `100vh` / overflow patterns. They don't exhibit this bug today; if a sibling
  case appears, it can have its own ticket.
- Restructuring `ScreenContainer` to own the "bounded flex column" contract for
  chat-bearing screens. The current per-screen `className` works; a primitive
  would be premature given two callers.
- Any change to the transcript's own scroll behavior (IMPRV-005 pin, A11Y-018
  `role="log"`). Those are correct; the bug is purely the outer wrapper's flex
  participation.
