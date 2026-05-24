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

Two viable directions; option (b) is likely the right call for this app's
complexity.

**Option (a) — implement the full menu role contract.** Adopt the APG menu
pattern end-to-end:

- On open, programmatically focus the first non-`aria-disabled` `menuitem`.
- Wire `onKeyDown` on the popover for: Down (next item, wrap), Up (previous
  item, wrap), Home (first), End (last), type-ahead (first item whose label
  starts with the typed character), Escape (already handled, restore focus to
  trigger — already handled), Tab (close menu, let the natural tab order take
  over).
- Replace `disabled={!hasMessages}` on the Copy transcript button with
  `aria-disabled={!hasMessages}` plus an `onClick` guard that no-ops when
  disabled — so the item remains focusable but doesn't fire.
- Add `tabIndex={-1}` to every menu item except whichever one is "active" (the
  one focus is on), per APG's roving-tabindex idiom.

**Option (b) — drop `role="menu"` / `role="menuitem"` and expose the items as
plain buttons under the trigger.** The popover already behaves like a small
button cluster: three actions, no submenus, no separators, no checkbox / radio
items. Removing the menu role contract means:

- Strip `role="menu"` from the popover wrapper (line 319) — it becomes a generic
  styling container.
- Strip `role="menuitem"` from each of the three buttons. They stay as
  `<button type="button">` and inherit native button semantics.
- Strip `aria-haspopup="menu"` from the trigger (line 312); leave
  `aria-expanded={isMenuOpen}` so AT still announces open/closed state via the
  disclosure idiom.
- Optionally: focus the first button on open so keyboard users land inside the
  popover. (Even without this, Tab from the trigger lands on the first button
  next, which is acceptable for a 3-item popover.)
- Optionally: convert `disabled={!hasMessages}` on Copy transcript to
  `aria-disabled={!hasMessages}` so SR users still hear the item; keep the
  visual disabled styling. Or keep the native `disabled` — for a plain button
  (not a menuitem) hiding it from focus is acceptable, just less discoverable.

Option (b) keeps the dismiss-on-outside-click and Escape paths exactly as they
are (they don't depend on the menu role), and shrinks the surface area of
"things AT promises but we don't deliver" to zero.

## Acceptance

For option (b) (recommended):

- The popover wrapper at `src/screens/Home.tsx:319` no longer carries
  `role="menu"`.
- None of the three buttons inside the popover (Rename, Copy transcript, Delete
  chat) carry `role="menuitem"`.
- The trigger button at line 312 no longer carries `aria-haspopup="menu"`;
  `aria-expanded={isMenuOpen}` is preserved.
- Outside-click and Escape dismiss continue to work (existing `useEffect` at
  lines 115–133 is untouched).
- Focus returns to the trigger when Escape closes the menu (existing behavior,
  lines 121–125, preserved).
- Either: the Copy transcript button keeps native `disabled={!hasMessages}`
  (acceptable for a plain button), OR it switches to
  `aria-disabled={!hasMessages}` with an `onClick` guard if discoverability
  matters more.
- A new test in `src/screens/Home.test.tsx` (or wherever Home tests live)
  asserts the popover has no `role="menu"` and the items have no
  `role="menuitem"`.
- Existing tests for outside-click dismiss (IMPRV-008), Escape dismiss, and the
  Copy transcript flow (IMPRV-009) all pass unchanged.
- `npm test`, `npm run lint`, `npm run typecheck` clean.

If option (a) is chosen instead, add tests for: auto-focus first item on open,
arrow-key cycling, Home/End, type-ahead, and `aria-disabled` items remaining
focusable.

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
