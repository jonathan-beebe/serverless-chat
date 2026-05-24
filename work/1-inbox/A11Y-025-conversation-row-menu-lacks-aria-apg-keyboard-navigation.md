---
id: A11Y-025
type: a11y
status: open
created: 2026-05-24
---

# A11Y-025: ConversationRow row menu lacks ARIA APG keyboard navigation

**WCAG:**

- 2.1.1 Keyboard — Level A
- 4.1.2 Name, Role, Value — Level A

**Severity:** Medium — the menu opens and Escape dismisses, but advertising
`role="menu"` while not implementing the WAI-ARIA Authoring Practices menu
pattern misleads assistive tech and keyboard users into expecting interactions
(arrow-key navigation, type-ahead, auto-focus of the first item, focusable
disabled items) that the component doesn't provide.

**Location:** `src/screens/Home.tsx`

- Line 319 — the popover advertises `role="menu"`.
- Lines 321–327 — Rename `<button role="menuitem">`.
- Lines 332–339 — Copy transcript
  `<button role="menuitem" disabled={!hasMessages}>`.
- Lines 340–346 — Delete chat `<button role="menuitem">`.

The trigger at lines 307–316 already wires `aria-haspopup="menu"`,
`aria-expanded={isMenuOpen}`, and `aria-label="More actions"`. The
outside-click + Escape dismiss path lives in the `useEffect` at lines 115–133
(landed as part of CR-008 / IMPRV-008).

## Problem

The popover claims to be an ARIA menu (`role="menu"` with `role="menuitem"`
children) but only implements a subset of the
[WAI-ARIA APG menu pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/):

- **No arrow-key navigation.** Up / Down / Home / End do nothing. Sighted
  keyboard users and screen-reader users in focus mode have no way to traverse
  the items without Tab — and Tab in a `role="menu"` is supposed to leave the
  menu entirely, not move between items.
- **No type-ahead.** Pressing "R" should focus Rename; pressing "D" should focus
  Delete. APG menus support this; this one doesn't.
- **No auto-focus of the first item on open.** Opening the menu via the trigger
  leaves focus on the trigger, so a keyboard user has to Tab into the menu —
  which traverses into the popover via normal DOM order, not the menu pattern.
  Screen-reader users using browse mode hear the menu surface but receive no
  signal that an item is ready to activate.
- **Disabled items use `disabled` instead of `aria-disabled="true"`.** The
  Copy-transcript item at line 335 sets `disabled={!hasMessages}`, which removes
  it from the focus order entirely. In an APG menu, disabled items must still be
  focusable so screen-reader users discover them and learn the state. The
  current pattern silently omits the item from the menu's "active" element
  cycle, so users with no messages never see Copy transcript exists.

Escape is handled. The outside-click dismiss is handled. The trigger-to-popover
wiring is correct (`aria-haspopup` / `aria-expanded` line up). The defect is
that the popover's contract with AT (`role="menu"` → implement APG menu) is
incomplete.

## Suggested fix

**Decision (2026-05-24): implement the full APG menu pattern.** The popover
keeps `role="menu"` / `role="menuitem"` and the `aria-haspopup="menu"` trigger,
and the missing behaviours are added so the contract is honoured end-to-end. The
alternative — stripping the menu role and exposing plain buttons — was
considered and rejected; the menu role is the right model for a keyboard-driven
row-action surface and the cost of implementing the pattern correctly is paid
once.

Required behaviours:

- On open, programmatically focus the first non-`aria-disabled` `menuitem`.
- Wire `onKeyDown` on the popover for:
  - **Down**: focus next item, wrap to first at end.
  - **Up**: focus previous item, wrap to last at start.
  - **Home**: focus first item.
  - **End**: focus last item.
  - **Type-ahead**: focus the first item whose label starts with the typed
    character (case-insensitive). Standard APG idiom: accumulate keystrokes for
    ~500ms, then reset.
  - **Escape**: close menu, restore focus to trigger (existing behavior at
    `src/screens/Home.tsx:121–125` — preserve).
  - **Tab / Shift+Tab**: close menu, let natural tab order take over (Tab from a
    menu is supposed to leave the menu entirely).
- Replace `disabled={!hasMessages}` on the Copy transcript button with
  `aria-disabled={!hasMessages}` plus an `onClick` guard that no-ops when
  disabled — so the item remains focusable per APG (SR users discover it and
  hear the state).
- Implement the roving-tabindex idiom: `tabIndex={-1}` on every `menuitem`
  except the currently active one (which gets `tabIndex={0}`); the active index
  moves with arrow / Home / End / type-ahead.

The outside-click and Escape dismiss paths (`useEffect` at lines 115–133) and
the existing `aria-expanded` / `aria-label="More actions"` trigger wiring are
preserved unchanged.

## Acceptance

- The popover at `src/screens/Home.tsx:319` retains `role="menu"`; the three
  buttons retain `role="menuitem"`; the trigger retains `aria-haspopup="menu"`
  and `aria-expanded={isMenuOpen}`.
- On open, focus moves to the first non-disabled `menuitem` (Rename, in the
  current layout).
- Arrow Down / Up cycle through the items with wrap.
- Home / End jump to the first / last item.
- Type-ahead: pressing "R" focuses Rename; "C" focuses Copy transcript; "D"
  focuses Delete chat (case-insensitive, ~500ms reset window).
- Escape closes the menu and returns focus to the trigger (existing behavior
  preserved).
- Tab / Shift+Tab close the menu and move focus to the next / previous element
  in the natural tab order.
- The Copy transcript item uses `aria-disabled={!hasMessages}` (not native
  `disabled`) with an `onClick` guard; it remains focusable when disabled.
- Roving tabindex: at any moment, exactly one `menuitem` has `tabIndex={0}` (the
  active item); the other two have `tabIndex={-1}`.
- New tests in the Home tests assert: auto-focus first item on open; arrow-key
  cycling (with wrap); Home / End; type-ahead for the three letters;
  `aria-disabled` items remaining focusable; roving tabindex invariant.
- Existing tests for outside-click dismiss (IMPRV-008), Escape dismiss, and the
  Copy transcript flow (IMPRV-009) pass unchanged.
- `npm test`, `npm run lint`, `npm run typecheck` clean.

## Related work

- **IMPRV-008** (resolved) — added outside-click + Escape dismiss for this menu;
  lifted `openMenuId` state to `Home` for single-open invariant.
- **IMPRV-009** (resolved) — added Copy transcript action to this menu.
- **A11Y-008** (resolved) — Copy button live-region pattern; the `onAnnounce`
  plumbing here mirrors it.
- **A11Y-020** (resolved) — CopyBox callout dismissal pattern; informs the "menu
  dismissal contract" thinking.
- **A11Y-022** (resolved) — focus race in DesignSystem previews; relevant
  precedent for "we promise AT something we don't deliver."
