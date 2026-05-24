# IMPRV-008: Conversation-row "More actions" menu doesn't dismiss on outside click or Escape

**Status:** Resolved **Severity:** Medium **Location:** `src/screens/Home.tsx`
(the `⋯` menu inside `ConversationRow`, roughly lines 60 / 163-193)

## Problem

Each row on the Home screen renders a `⋯` "More actions" trigger that toggles a
small menu (`role="menu"`) with **Rename** and **Delete chat**. The open/close
state is owned by a `useState` flag (`menuOpen`) that today flips in exactly
three places:

- The `⋯` trigger toggles it (`setMenuOpen((v) => !v)` at `Home.tsx:170`).
- `startRename` sets it `false` after the user picks Rename (`Home.tsx:92`).
- `doDelete` sets it `false` after the user picks Delete chat (`Home.tsx:106`).

There is **no outside-click handler and no Escape handler**. Once the user opens
a row's menu, clicking anywhere else on the page — another row, the "Start a
chat" button, the page background, even the same row's "Resume" button — leaves
the menu open. Two papercuts follow:

1. **Two rows can show open menus simultaneously.** Click `⋯` on row A, then `⋯`
   on row B: both menus stay open. The expected disclosure pattern is at most
   one open at a time.
2. **The menu floats over neighboring content with no way to dismiss except
   clicking its trigger again or selecting an item.** Keyboard users in
   particular have no Escape exit, which is a WCAG 2.1 SC 2.1.2 (No Keyboard
   Trap) adjacent concern and breaks the WAI-ARIA Authoring Practices menu
   pattern (Escape closes the menu and restores focus to the trigger).

`<details>` / `<summary>` gives this for free; the row deliberately doesn't use
it because it needs a non-button `aria-haspopup="menu"` trigger with
`role="menuitem"` children. So the dismissal contract has to be added
explicitly.

## Intended behavior

When a row's menu is open, it dismisses on:

1. **Click (pointerdown) outside the menu and its trigger.** The trigger itself
   is excluded so clicking `⋯` while the menu is open continues to act as a
   toggle (don't dismiss-then-reopen on the same gesture).
2. **The `Escape` key.** Focus returns to the row's `⋯` trigger so the user
   isn't dropped to the document root.

Opening one row's menu while another is open should close the other (single-open
invariant). Selecting **Rename** or **Delete chat** continues to close the menu
as it does today — no regression.

## Suggested fix

Lift the "which row's menu is open" state up to `Home` (or share a small
context) instead of per-`ConversationRow` `useState`. The owning state is a
`string | null` (the id of the row whose menu is open). Each row receives:

- `isMenuOpen: boolean`
- `onOpenMenu: () => void` — sets `Home`'s state to this row's id.
- `onCloseMenu: () => void` — sets it back to `null`.

This naturally gives the single-open invariant without any cross-row
coordination logic.

Then add two listeners — both scoped to "menu is open" so they don't run when
nothing's open:

```tsx
// In Home (or in ConversationRow with a ref to the menu wrapper).
useEffect(() => {
  if (openMenuId === null) return
  const onPointerDown = (e: PointerEvent) => {
    const root = menuRefs.current.get(openMenuId)
    if (root && !root.contains(e.target as Node)) setOpenMenuId(null)
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpenMenuId(null)
      triggerRefs.current.get(openMenuId)?.focus()
    }
  }
  document.addEventListener('pointerdown', onPointerDown)
  document.addEventListener('keydown', onKey)
  return () => {
    document.removeEventListener('pointerdown', onPointerDown)
    document.removeEventListener('keydown', onKey)
  }
}, [openMenuId])
```

Notes:

- Use **`pointerdown`**, not `click`. `click` fires after focus moves, which can
  cause focus thrash and (more importantly) lets the menu briefly remain open
  across a re-render. `pointerdown` matches the dismiss timing in every native
  menu / Radix Popover implementation.
- The "root" the handler checks must include **both** the popover and its
  trigger — otherwise clicking `⋯` to close would be intercepted by the
  outside-click handler closing it first, then the toggle re-opening it on the
  next render. Easiest: wrap trigger + menu in a single
  `<div className="relative">` (the structure already exists at `Home.tsx:163`)
  and gate on `containerRef.contains(e.target)`.
- The Escape handler should return focus to the trigger. This restores the
  standard menu pattern and avoids a focus-on-`<body>` jump that screen readers
  announce as "main page".

## Test plan

Add to `src/screens/Home.test.tsx`:

1. **Outside click closes the menu.** Open row A's menu, fire `pointerDown` on a
   sibling element (e.g. another row's text), assert the menu disappears
   (`queryByRole('menu')` returns null).
2. **Escape closes the menu and restores focus to the `⋯` trigger.**
   `keyDown({ key: 'Escape' })` on the document; assert menu gone and
   `document.activeElement === ⋯ button`.
3. **Opening row B's menu closes row A's.** Open A, click B's `⋯`, assert only
   B's menu is in the document.
4. **Toggle behavior on the same trigger still works.** Open via `⋯`, click `⋯`
   again, menu closes (i.e. outside-click does not "double-fire" with the toggle
   and end up re-opening).
5. **Existing tests stay green** — the menu-item path (Rename / Delete chat)
   tests at `Home.test.tsx:139, 154, 168` use the same `menuOpen`
   close-on-select wiring; they must continue to pass after the state lift.

JSDOM dispatches `pointerdown` and `keydown` cleanly; no layout primitives
needed for this one.

## Out of scope

- Full WAI-ARIA menu keyboard navigation (Arrow up/down, Home/End between menu
  items, type-ahead). The menu has only two items; that's a separate
  accessibility ticket if a maintainer wants it.
- Focus trap inside the open menu. Two items don't justify it; Escape +
  outside-click is the standard escape hatch for this size.
- Animating the dismissal. The current open/close is instant; keep it that way.

## Working

Plan (TDD-first, simplest viable approach):

1. Confirmed root cause matches the ticket. `ConversationRow` owns its own
   `menuOpen` `useState` (Home.tsx:60), so there's no cross-row coordination and
   no document-level listener for outside click / Escape.
2. Re-read existing test patterns in `Home.test.tsx` —
   `fireEvent.click(within(row).getByRole('button', { name: /more actions/i }))`
   is the existing trigger pattern; new tests will reuse it. The existing
   menu-item tests (Rename @168, Delete confirm @139, Delete cancel @154)
   already exercise the "select-an-item closes the menu" path implicitly (the
   menu vanishes once Rename's input renders or Delete completes), so the
   lift-state-up refactor must keep that wiring intact.
3. Approach for the fix:
   - Lift the open-row id to `Home` as `openMenuId: string | null`.
   - Pass `isMenuOpen`, `onOpenMenu`, `onCloseMenu` props down to each
     `ConversationRow`.
   - Wrap each row's trigger + popover in a `ref`-tracked container
     `<div className="relative">` (the structure already exists at Home.tsx:163
     — just attach a ref) so the outside-click handler can gate on "contains
     target".
   - Single `useEffect` in `ConversationRow`, gated on `isMenuOpen`, registers
     `pointerdown` + `keydown` listeners on `document`. `pointerdown` outside
     the container closes via `onCloseMenu`. `Escape` closes and returns focus
     to the trigger via a `triggerRef`.
   - Keeping the listeners inside `ConversationRow` (rather than in `Home`)
     avoids needing a `Map` of refs at the parent level and stays closer to the
     existing per-row encapsulation. The single-open invariant is still enforced
     because each row's open state is derived from the shared `openMenuId`.
4. Tests to add to `Home.test.tsx`:
   - Outside `pointerDown` closes the open menu.
   - `Escape` closes the menu AND moves focus back to the `⋯` trigger.
   - Opening row B's menu while row A's is open closes A (only one `role="menu"`
     in the document).
   - Toggle via the same `⋯` trigger still closes (i.e. outside-click handler
     does not race the toggle to re-open).
5. Run the suite, commit, move ticket, log.

### Resolution

- Lifted menu state to `Home` as `openMenuId: string | null`; `ConversationRow`
  now receives `isMenuOpen` / `onOpenMenu` / `onCloseMenu` and exposes its
  trigger+popover wrapper via a `containerRef`.
- Added a single `useEffect` (gated on `isMenuOpen`) that registers
  `pointerdown` and `keydown` listeners on `document`. `pointerdown` outside the
  container closes; `Escape` closes and restores focus to the `⋯` trigger via
  `triggerRef`.
- Single-open invariant is enforced by the shared `openMenuId` — opening one
  row's menu automatically closes any other row's because their `isMenuOpen`
  prop flips to `false`.
- Added 4 new tests to `Home.test.tsx` covering: outside-click dismiss, Escape
  dismiss + focus return, single-open invariant across rows, same-trigger toggle
  behavior. All 165 tests pass; lint + typecheck clean.
