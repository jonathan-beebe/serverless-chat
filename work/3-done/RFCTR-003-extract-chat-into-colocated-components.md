---
id: RFCTR-003
type: refactor
status: resolved
created: 2026-05-27
---

# RFCTR-003: extract chat into colocated components

## Problem

`src/components/Chat.tsx` is 454 lines in a single component. Responsibility
map:

- **L11–20:** Props interface (`messages`, `onSend`, `disabled`, `hasResumed`).
- **L22–66:** module-scope constants (`NEAR_BOTTOM_THRESHOLD_PX`,
  `COPY_FLASH_MS`) + `TranscriptItem` type + `buildItems()` helper (date
  headers, resume-divider interleaving).
- **L68–96:** `Chat()` opens — local state (`draft`, `includeTimestamps`,
  `copyState`, `resumeBoundary`) + refs (`transcriptRef`, `composerRef`,
  `fallbackTextareaRef`, `flashTimerRef`, `wasNearBottomRef`).
- **L98–102:** `Intl.DateTimeFormat` memos.
- **L104–123:** resume-boundary latch effect + items memo.
- **L125–140:** auto-scroll machinery (IMPRV-005 yank-detect — `useEffect` +
  `onScroll` + threshold).
- **L142–170:** send pipeline (`sendIfValid`, `onSubmit`, `onComposerKeyDown`
  with FEAT-004 IME / Shift+Enter semantics).
- **L172–192:** composer focus effect + flash-timer cleanup effect.
- **L194–230:** copy plumbing (`scheduleCopyFlashDismiss`, `onCopy`).
- **L232–289:** JSX — outer wrapper (CR-007 `flex-1`/`min-h-0`), copy toolbar
  (FEAT-011 / IMPRV-021 `sm:hidden`, A11Y-034 `messages.length > 0` gate,
  A11Y-029 focus tokens), manual-copy callout, hidden fallback textarea,
  LiveRegion.
- **L313–426:** transcript wrapper (A11Y-018 `role=log` + A11Y-021 `tabIndex` /
  `focus-visible` + IMPRV-025 `overscroll-contain`) → empty state OR `<ol>` with
  inline rendering of date / resume / message items including the bubble +
  delivery glyph (FEAT-010).
- **L428–451:** composer `<form>` with `Textarea` + Send `Button`.

## Outcome

After the refactor, `Chat.tsx` is materially shorter and composes one or more
extracted child components that live in `src/components/` as sibling files, each
with a colocated `*.test.tsx` file. The extracted pieces are independently
testable in isolation (no `Chat` shell required) and the load-bearing behaviors
— auto-scroll/yank-detect, IME/Enter handling, copy two-tier fallback,
`role=log` semantics, resume-divider boundary — remain green against
`Chat.test.tsx` (which may itself be split to colocate with the extractions). No
visible UI change.

## Why it matters

Reader cost — 454 lines mixing four orthogonal concerns (composer, copy toolbar,
transcript renderer, message bubble) forces readers to load the whole file to
reason about any one of them. Test isolation — `Chat.test.tsx` (697 lines / 8
describe blocks) currently has to render the full `Chat` with `messages={…}` /
`onSend={…}` to exercise composer behavior, copy plumbing, or bubble rendering
individually; an isolated `Composer` test wouldn't need to stub clipboard or
auto-scroll. Pattern coherence — RFCTR-001 just established the
colocated-component shape (Home + ConversationRow + tests). Chat is the
next-biggest file and the obvious follow-through, otherwise the pattern reads as
a one-off. Open-source-example goal — a portfolio reader scanning the components
directory sees a 454-line outlier next to clean ~150-line siblings.

## Discovery notes

- **Three plausible extraction seams, in descending order of clarity:**
  1. **Copy toolbar** (L242–312 in JSX + L194–230 handlers + L74–90 state/refs +
     `COPY_FLASH_MS`): cleanest seam. Owns its own state (`includeTimestamps`,
     `copyState`), refs (`fallbackTextareaRef`, `flashTimerRef`), and LiveRegion
     message. Only external dependency is `messages` (for `formatTranscript`)
     and a way to refocus the composer on success — that's the one prop-thread
     question (pass `composerRef` or expose `onCopied` callback). Tests at
     L485–674 in `Chat.test.tsx` (the entire "Chat copy-transcript toolbar
     (FEAT-011)" describe, ~190 lines, 10 tests) migrate verbatim. Naming
     options: `CopyTranscriptToolbar`, `ChatCopyToolbar`,
     `TranscriptCopyToolbar`.
  2. **Composer** (L428–451 JSX + L69 `draft` state + L82 `composerRef` +
     L142–170 send pipeline + L172–180 disabled-change focus effect): tight,
     self-contained. Owns `draft` state, IME/Enter semantics, focus restoration.
     External surface is `onSend` and `disabled`. Tests at L97–244 in
     `Chat.test.tsx` ("Chat input focus" + "Chat composer Enter / Shift+Enter" —
     2 describes, ~150 lines, 11 tests) migrate cleanly. Naming options:
     `Composer`, `ChatComposer`, `MessageComposer`.
  3. **Transcript** (L313–426 JSX + L81 `transcriptRef` + L96
     `wasNearBottomRef` + L101–102 `Intl` memos + L104–123 resume-boundary
     latch + L125–140 auto-scroll machinery + L37–59 `buildItems` +
     `TranscriptItem` type): the heaviest extraction. Auto-scroll observer +
     IMPRV-005 yank-detect + A11Y-018 `role=log` + A11Y-021 `tabIndex` +
     IMPRV-025 `overscroll-contain` are interconnected and MUST stay together —
     fragmenting them risks subtle scroll-pin regressions. The resume-boundary
     latch effect depends on `hasResumed` prop; clean to lift. Tests at L34–95
     ("Chat auto-scroll"), L246–257 ("speaker attribution"), L259–335 ("date
     headers"), L337–407 ("log surface"), L409–447 ("keyboard focusability"),
     L449–483 ("delivery indicator") = ~370 lines / 6 describes migrate. Naming
     options: `Transcript`, `ChatTranscript`, `MessageLog`.

- **A fourth seam (`Bubble` / `MessageItem`** — the per-message `<li>` at
  L385–422) is technically separable but probably not worth its own file: it's
  ~38 lines of pure markup with no state, used only inside Transcript, and the
  FEAT-010 delivery-indicator tests would have to know about it via the parent
  anyway. Could extract as a non-exported helper inside Transcript instead.
- **Shared-state tradeoffs:**
  - CopyToolbar pulls `messages` (read-only) and needs to call
    `composerRef.current?.focus()` on success. Options: (a) thread `composerRef`
    down, (b) emit an `onCopySuccess` callback the parent uses to refocus, (c)
    the parent retains the click handler and toolbar is purely presentational.
    Option (b) keeps the toolbar self-contained without leaking refs.
  - Transcript owns `hasResumed` → `resumeBoundary` latch. Could either receive
    `hasResumed` (recompute the latch internally) or receive precomputed
    `items`. Internal latch keeps Chat thin.
  - Composer is the easiest — no shared state with parent except `onSend`
    callback and `disabled` flag.
- **Risks:**
  - Auto-scroll: don't split the four pieces (`wasNearBottomRef`, `onScroll`,
    `useEffect` on `messages`, the `role=log` wrapper that is also the scroll
    container). They co-evolved and the IMPRV-005 / A11Y-018 / A11Y-021 /
    IMPRV-025 layers all touch the same element.
  - CR-007 wrapper contract: the outer `flex-1`/`min-h-0` wrapper (L241) has a
    regression test (L685–696). Any reshape must preserve that wrapper's classes
    at the `Chat.tsx` level (extractions live inside it, not as replacements for
    it).
  - Tab order: toolbar → transcript → composer is a tested contract (L516–518,
    L419–427). Source-order assertions will need to be re-pointed if children
    become opaque.
  - `useId()` for `copyHintId` (L76) lives inside Chat today; moves with the
    toolbar.
  - Module-scope constants belong with whichever component uses them
    (`NEAR_BOTTOM_THRESHOLD_PX` → Transcript; `COPY_FLASH_MS` → CopyToolbar).
- **Test file rebalancing:** `Chat.test.tsx`'s 8 describe blocks map roughly
  one-to-one with extraction candidates. The CR-007 wrapper test (L676–697)
  stays with `Chat.test.tsx` since it's about the parent shell's contract.
- **Sizing intuition (rough):** post-extraction, `Chat.tsx` likely lands in the
  80–150-line range depending on which of the three seams are taken. Taking all
  three plus inlining the Bubble inside Transcript would leave Chat as primarily
  JSX composition + the resume-boundary latch (or that moves into Transcript
  too).

## Related work

- RFCTR-001 — colocated-component precedent (`ConversationRow` extraction from
  `Home`).
- FEAT-004 — Enter / Shift+Enter / IME composer semantics, in
  `onComposerKeyDown`.
- FEAT-006 — date headers + per-message `<time>`.
- FEAT-010 — delivery glyph on outgoing bubbles.
- FEAT-011 — copy-transcript toolbar (checkbox, copy button, copied / manual
  states, LiveRegion, fallback textarea).
- FEAT-012 — resume-divider rendering, `hasResumed` prop, `resumeBoundary`
  latch.
- FEAT-013 — mobile layout.
- IMPRV-005 — scrollback yank-detect (`wasNearBottomRef` + 32px threshold).
- IMPRV-020 — `svh`/`vvh` sizing on parent `ScreenContainer`; Chat consumes via
  `flex-1`.
- IMPRV-021 — `hidden sm:flex` on copy toolbar.
- IMPRV-025 — `overscroll-contain` + `select-text` / `select-none` on
  transcript.
- A11Y-018 — `role="log"` on the scroll wrapper.
- A11Y-021 — `tabIndex={0}` + `focus-visible` on transcript.
- A11Y-029 — `focus-visible` ring tokens on `includeTimestamps` checkbox.
- A11Y-034 — toolbar hidden when messages empty.
- BUG-006 — `senderId` attribution; surfaces in the bubble's `isMe` via the
  parent hook.

## Working

- 2026-05-27: Baseline `npm test` is green (447 / 447). Proceeding with all
  three seams per the spec — `ChatCopyToolbar`, `ChatComposer`,
  `ChatTranscript`. Toolbar surfaces `onCopySuccess` (option b). Transcript
  receives `hasResumed` and computes the latch internally. Composer is `onSend`
  / `disabled` only.
