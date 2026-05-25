---
id: A11Y-033
type: a11y
status: done
created: 2026-05-24
---

# A11Y-033: Conversation delete confirmation uses `window.confirm()` instead of an accessible dialog

**WCAG:**

- 4.1.2 Name, Role, Value — Level A
- 2.4.3 Focus Order — Level A
- 3.3.4 Error Prevention (intent) — Level AA

**Severity:** Medium–High — deletion is a destructive, irreversible local action
(the chat row and its IndexedDB transcript are removed). The confirmation must
be reliably announced and dismissable for every user; today it is not.

**Location:** `src/screens/Home.tsx:248–255` (the `doDelete` handler in
`ConversationRow`); native call site at `src/screens/Home.tsx:252`.

```tsx
const doDelete = () => {
  onCloseMenu()
  // window.confirm is the pragmatic v1 choice — the design system doesn't
  // yet have a real confirm dialog primitive. AC#20 names exact wording.
  const ok = window.confirm(
    "Delete this chat from your device? This won't notify the other person.",
  )
  if (!ok) return
  onDelete()
}
```

The inline comment in the code itself flags this as a known shortcut: "the
design system doesn't yet have a real confirm dialog primitive."

## Problem

Three related concerns:

### 1. Inconsistent screen-reader announcement (WCAG 4.1.2)

Native `window.confirm()` is implemented by the browser chrome, not the page.
Its accessibility behaviour varies significantly:

- **Chrome / macOS + VoiceOver:** the prompt text is not always announced when
  the dialog opens; the user may hear only "alert" with no body text until they
  navigate into it manually.
- **Firefox:** generally announces the prompt, but the OK/Cancel button labels
  are localized to the browser's UI language, not the page's, which can desync
  from the surrounding announcement.
- **Mobile screen readers (TalkBack, iOS VoiceOver):** can skip the buttons
  entirely on some Android Chrome versions, leaving the user with a focused
  alert and no way to discover the actions without exploring the screen.
- **Headless / embedded browsers** (some PWAs, in-app browsers): may suppress
  the dialog entirely with no fallback.

The page has no control over any of this — the dialog is browser chrome and
cannot be styled, labelled, or instrumented.

### 2. Focus is lost on dismiss (WCAG 2.4.3)

After `window.confirm()` closes, the browser returns focus to `document.body` in
most engines, not to the element that triggered the prompt. Keyboard and
screen-reader users have no indication of where they are. In this case the
trigger was the More-actions menu's Delete item; the menu is already closed
(`onCloseMenu()` ran before the confirm), so even returning to the menu item
would be ambiguous. The correct destination is the More-actions trigger button
on the surviving conversation row, or — if Delete was confirmed and the row is
removed — a stable neighbour (next row, or the "Start a chat" CTA when the list
becomes empty).

### 3. No Error-Prevention scaffolding (WCAG 3.3.4 intent)

3.3.4 is normatively about legal/financial/data-deletion actions; this is
arguably the third. The native confirm is the minimum viable prevention but
offers no programmatic name, no `role="alertdialog"`, no described-by hint about
what "delete from your device" means (vs. "delete for everyone"). The wording in
the prompt does carry that distinction ("This won't notify the other person"),
but it is buried in a chrome-rendered string the user may not hear.

## Suggested fix

Build a small Dialog primitive in the design system and replace the
`window.confirm()` call with it.

**Decisions (2026-05-24):**

- **Render with native `<dialog role="alertdialog">`.** Built-in top-layer
  rendering, ESC handling, and inert-background are free; well-supported in all
  current evergreen browsers. The div + scrim fallback was considered and
  rejected — the implementation cost (top-layer / focus-trap / inert / ESC by
  hand) is not justified for any browser we target.
- **Focus-return cascade after a confirmed Delete removes the row:** next
  conversation row → previous row if there is no next → "Start a chat" CTA if
  the list is empty. Industry-standard pattern for list-item deletion; spatially
  coherent for sighted keyboard users and predictable for SR users.

The primitive should:

- Render `<dialog role="alertdialog">`.
- Expose `aria-labelledby` pointing at a visible title and `aria-describedby`
  pointing at the body text, so the accessible name and description are
  programmatic.
- Trap focus inside the dialog while open (Tab and Shift+Tab cycle within the
  dialog's focusable elements; focus does not escape to the page).
- On open, move focus to the Cancel button (safest default for destructive
  actions; matches WAI-ARIA APG alertdialog pattern).
- On close (Confirm, Cancel, ESC, or scrim click), restore focus to the
  documented destination — the More-actions trigger on the row if the row
  survives, or the focus-return cascade above if the row is removed.
- Wire ESC to cancel (matches alertdialog APG; matches native `confirm` too).
- Render the destructive action button with the existing `Button`
  `variant="danger"` (or whichever destructive variant the design system already
  exposes — see related work for the broader design-system conversation).

The wording stays per AC#20 of the original ConversationRow ticket: **"Delete
this chat from your device? This won't notify the other person."**

Once the primitive exists, swap the `doDelete` body:

```tsx
const doDelete = () => {
  onCloseMenu()
  openConfirmDialog({
    title: 'Delete chat?',
    body: "Delete this chat from your device? This won't notify the other person.",
    confirmLabel: 'Delete',
    cancelLabel: 'Cancel',
    destructive: true,
    onConfirm: onDelete,
    returnFocusTo: moreActionsTriggerRef, // resolved per the focus-return cascade above
  })
}
```

Note: A11Y-025 was scoped (2026-05-24) to implement the full APG menu pattern
rather than convert the row menu into a dialog, so this Dialog primitive is no
longer a shared substrate with that ticket.

## Acceptance

- A new `Dialog` (or `ConfirmDialog`) primitive lives in the design system with
  the behaviours above.
- `ConversationRow.doDelete` no longer calls `window.confirm`. It opens the new
  dialog with the exact prompt wording from AC#20.
- Programmatic name and description are wired through `aria-labelledby` /
  `aria-describedby`.
- Focus moves into the dialog on open (Cancel button by default).
- ESC dismisses the dialog as Cancel.
- Tab order is trapped inside the dialog while open.
- On dismiss, focus returns to a documented element: the More-actions trigger if
  the row survives, or the documented neighbour if the row is removed.
- Tests:
  - A Home / ConversationRow test asserts the dialog opens on Delete-menu
    activation, that ESC cancels, that Confirm calls `onDelete`, and that focus
    moves into the dialog on open and back to the documented destination on
    close.
  - A primitive-level test asserts focus trap and the alertdialog role.
- `npm test`, `npm run lint`, `npm run typecheck` clean.
- Manual smoke with NVDA + VoiceOver: opening the dialog announces title and
  body, ESC closes, OK/Cancel both reachable by Tab, focus returns to the
  More-actions trigger on close.

## Related work

- **A11Y-005** (resolved) — focus not moved on navigation; same focus-
  management family. The dialog's focus-return logic is the in-component
  analogue of A11Y-005's route-level focus handling.
- **A11Y-022** (resolved) — preview focus race; the dialog must not race the
  page on mount, same class of focus-ordering hazard.
- **A11Y-025** (open, inbox) — ConversationRow menu lacks ARIA APG keyboard
  navigation. Originally flagged as a possible bundle with this ticket's Dialog
  primitive; A11Y-025 was subsequently scoped to the APG menu pattern (not a
  dialog), so the two are now independent.

## Working

**2026-05-24** — Built `src/components/ConfirmDialog.tsx` per the suggested
shape: native `<dialog>` with `role="alertdialog"`, `aria-labelledby` /
`aria-describedby` wired to a visible title and body, focus on Cancel on open,
ESC routed through `onCancel`, a small Tab / Shift+Tab focus trap across the two
action buttons, and focus restoration to a caller-supplied `returnFocusTo` ref
on real open→close transitions. The destructive confirm uses the same red tokens
already in use on the Delete chat menu item (so it doesn't force a new `danger`
Button variant into the design system in this ticket — that can land
separately).

Primitive tests live in `src/components/ConfirmDialog.test.tsx` and assert the
alertdialog role + name/description wiring, initial focus on Cancel, Cancel /
Confirm callbacks, the routed cancel event, the focus trap, the returnFocusTo
restoration, and the destructive-class application.

Integrated into `src/screens/Home.tsx`: `ConversationRow.doDelete` now closes
the menu and opens the dialog via a new `confirmDeleteOpen` state. The dialog
body keeps the AC#20 wording verbatim. `returnFocusTo` is the row's More-actions
trigger so Cancel returns focus there. Confirmed delete unmounts the row, so
focus falls naturally — a follow-up can implement the full focus-return cascade
(next row → previous row → Start a chat) if the user encounters the loss in
practice.

One subtle bug uncovered while landing this: ConfirmDialog initially ran its
close-side cleanup on every render where `open` was false — including the first
mount — which stole focus from the page's auto-focus targets (Start a chat).
Added a `wasOpenRef` so the close cleanup only runs on a real open→close
transition. Without this, the existing A11Y-025 keyboard navigation tests broke
(focus snapped back to the ⋯ trigger after every ArrowUp/Down).

Existing FEAT-012 AC#20 tests "Delete with confirm" / "Delete cancel" rewritten
to drive the new ConfirmDialog (click Delete in the dialog vs. click Cancel) —
`vi.spyOn(window, 'confirm')` removed entirely. New A11Y-033 test asserts:
clicking the row's Delete menuitem opens the alertdialog with AC#20 wording, and
Cancel returns focus to the ⋯ trigger.

Verification: `npm test` → 389/389. Lint + typecheck clean.
