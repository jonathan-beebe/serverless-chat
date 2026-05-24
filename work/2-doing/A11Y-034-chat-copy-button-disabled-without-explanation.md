---
id: A11Y-034
type: a11y
status: in-progress
created: 2026-05-24
---

# A11Y-034: Chat "Copy" button is disabled with no programmatic explanation when transcript is empty

**WCAG:**

- 3.3.2 Labels or Instructions — Level A

**Severity:** Low–Medium — does not block use of the chat, but leaves
screen-reader users guessing why a control is dimmed. Sighted users can infer
the reason from the empty transcript above; SR users hear "Copy, button, dimmed"
with no explanation.

**Location:** `src/components/Chat.tsx:273` (the Copy button in the
copy-transcript toolbar).

```tsx
<Button
  variant="primary"
  size="md"
  onClick={onCopy}
  disabled={messages.length === 0}>
  Copy
</Button>
```

The surrounding toolbar lives at `src/components/Chat.tsx:249–277` and includes
an "Include timestamps" checkbox immediately to the left of the button which
remains enabled even when `messages.length === 0`.

## Problem

When the transcript is empty (`messages.length === 0`), the Copy button is
rendered with `disabled`. A screen-reader user encountering the toolbar hears
something like "Copy, button, dimmed" (NVDA) or "Copy, dimmed, button"
(VoiceOver) with no indication of _why_ the button is disabled.

Two compounding issues:

### 1. No programmatic reason for the disabled state

3.3.2 (Labels or Instructions) requires that when input is required from the
user, labels or instructions are provided. A disabled control without an
accompanying explanation is the inverse of that principle — the user is
prevented from acting, and there is no programmatic instruction telling them how
to enable the control (post a first message). Sighted users see the empty
transcript and the placeholder ("No messages yet. Say hello.") immediately below
the toolbar and can join the dots. SR users navigating controls-only (e.g. with
the Tab key or the form-controls list) never see the placeholder; they hit a
dimmed Copy button and a dimmed Copy button only.

### 2. Inconsistent disabled state vs. the sibling toggle

The "Include timestamps" checkbox immediately to the left of the Copy button is
**not** disabled when the transcript is empty (it just has no effect because
there is nothing to copy). The asymmetry makes the Copy button's disabled state
look arbitrary rather than rule-driven — the user sees one enabled control and
one disabled control in the same toolbar with no programmatic signal explaining
the difference.

## Suggested fix

**Decision (2026-05-24): hide the entire toolbar when no messages.** Render the
Copy button and the Include-timestamps toggle only once `messages.length > 0`.
The alternative — keep the controls rendered with `disabled` plus an sr-only
`aria-describedby` hint — was considered and rejected; absent controls don't
need explanation, and the empty-state placeholder already tells every user the
surface is empty.

```tsx
{
  messages.length > 0 && (
    <div className="flex items-center justify-end gap-3">
      {/* Include-timestamps toggle */}
      {/* Copy button */}
    </div>
  )
}
```

Rationale:

- The empty-state placeholder right below the toolbar ("No messages yet. Say
  hello.") already tells every user the surface is empty. The toolbar has
  nothing useful to offer in that state.
- It removes a dead control for every user, not just SR users — sighted keyboard
  users tab past two no-op controls today.
- It cleans up the toolbar height; the composer is closer to the top of the
  visible chat area in the empty state.
- It removes the need for an sr-only hint; absent controls don't need
  explanation.
- It matches the same "don't render controls that can't act" principle the
  design system already follows elsewhere.

## Acceptance

- When `messages.length === 0`, the entire toolbar `<div>` at
  `src/components/Chat.tsx:249–277` is not rendered (or its inner contents are
  not rendered, preserving the empty layout).
- When the first message arrives, the toolbar appears (no animation required for
  v1; just conditional rendering).
- The empty-state placeholder below remains as the only thing shown above the
  composer when the transcript is empty.
- Tests:
  - A Chat test asserts that with `messages={[]}`, neither the Copy button nor
    the Include-timestamps checkbox is present
    (`queryByRole('button', { name: /copy/i })` returns null,
    `queryByRole('checkbox', { name: /include timestamps/i })` returns null).
  - A Chat test asserts that once a message is appended, both controls appear.
- `npm test`, `npm run lint`, `npm run typecheck` clean.
- Manual smoke with NVDA / VoiceOver on an empty chat: tabbing from the page
  lands on the composer next, not on a dimmed Copy button.
- VoiceOver / NVDA announce "Copy, button, dimmed, No messages to copy yet" when
  the button receives focus.

## Related work

- **A11Y-008** (resolved) — live region on copy button; the announcement flow
  for the _success_ path. This ticket is the _empty-state_ sibling: same
  control, opposite end of the state machine.
- **FEAT-011** (resolved) — copy-transcript toolbar; the feature that introduced
  this Copy button and the Include-timestamps toggle.

## Working

**2026-05-24** — Wrapped the entire toolbar `<div>` in `src/components/Chat.tsx`
in `{messages.length > 0 && (...)}` and dropped the now-redundant
`disabled={messages.length === 0}` from the Copy button. The empty-state
placeholder below already tells every user the surface is empty; absent controls
don't need an SR explanation.

Test fallout: the existing FEAT-011 "Copy button is disabled when messages is
empty" test was inverted — it now asserts both controls are absent when empty
and present once the first message arrives.

Bundled de-flake: while running the full suite, the A11Y-025 keyboard nav
effect's deps `[isMenuOpen, hasMessages]` caused activeIndex to reset to 0 every
time the row's async messages-load effect resolved (flipping `hasMessages` true
mid-test). The reset stomped the user's keyboard navigation. Gated the
auto-focus / reset branches on a `prevMenuOpenRef` so they fire only on real
open ↔ close transitions, not on incidental `hasMessages` changes while the menu
is open. Three consecutive `npm test` runs now go 389/389. Lint + typecheck
clean.
