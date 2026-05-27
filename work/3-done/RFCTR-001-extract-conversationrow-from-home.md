---
id: RFCTR-001
type: refactor
status: resolved
created: 2026-05-27
---

# RFCTR-001: extract conversationrow from home

## Problem

`src/screens/Home.tsx` is 638 lines, of which lines 57–528 (~470 lines, ~74% of
the file) are the inlined `ConversationRow` component plus its dedicated helpers
(`formatRelative`, `autoLabel`, `LIVE_STATES`, `COPY_FLASH_MS`,
`TYPEAHEAD_RESET_MS`, `MENU_ITEM_LABELS`, `RowProps`). The actual `Home` screen
— page title, focus-on-mount, "Start a chat" CTA, the conversations list shell,
the LiveRegion, the InstallPrompt/commit-hash footer — is lines 530–638 (~110
lines). The two responsibilities (entry screen vs. per-row APG menu + rename
editor

- copy-transcript flow + confirm-delete + lifecycle effects) currently share one
  file and one test file (`Home.test.tsx` is 807 lines, of which only the
  focus-on-mount, empty state, Start-a-chat, and build-version blocks are
  screen-level — the rest exercise `ConversationRow`).

## Outcome

`ConversationRow` lives at `src/components/ConversationRow.tsx` with a colocated
`src/components/ConversationRow.test.tsx`; `Home.tsx` no longer contains its
implementation and imports it like the other components in `src/components/`.
Row-specific helpers and constants (`formatRelative`, `autoLabel`,
`COPY_FLASH_MS`, `TYPEAHEAD_RESET_MS`, `MENU_ITEM_LABELS`, `RowProps`) live with
Row. `LIVE_STATES` and the `liveConversationId` derivation stay in Home because
they read `useSession()`. The Row's public surface is the existing per-row prop
bag (`record`, `onRename`, `onDelete`, `onAnnounce`, `isMenuOpen`, `onOpenMenu`,
`onCloseMenu`, `isLive`) — Row does not import `useConversations`, `useSession`,
or `useNavigate`. Existing test coverage is preserved end-to-end; tests that
exercise Row in isolation move to the colocated file, tests that exercise Home
composition (focus-on-mount, Start-a-chat session+navigate, empty-state copy,
past-chats heading, CR-011 culling, commit hash) stay in `Home.test.tsx`.

## Why it matters

Reader cost — anyone opening `Home.tsx` today wades through 470 lines of row
internals before reaching the screen's shape. Testability — Row's APG keyboard
model, type-ahead buffer, two-tier clipboard fallback, and confirm-delete wiring
are independently meaningful and currently can only be reached via a full Home
render with seeded IDB. Test-file size — `Home.test.tsx` at 807 lines mixes
screen composition with row-detail coverage; splitting tracks the implementation
split. Open-source example goal — `src/components/` already shows the canonical
shape (Button, Callout, ConfirmDialog, CopyBox, LiveRegion, ScreenChrome,
UpdatePrompt — each `Foo.tsx` + `Foo.test.tsx`); `ConversationRow` is the
conspicuous holdout living inside a screen.

## Discovery notes

- **Shared between Home and Row today:** nothing structural — Home passes Row a
  per-row prop bag and renders it inside `conversations.map`. Helpers
  `formatRelative`, `autoLabel`, `COPY_FLASH_MS`, `TYPEAHEAD_RESET_MS`,
  `MENU_ITEM_LABELS`, `RowProps` are referenced only inside Row. `LIVE_STATES`
  is referenced only in Home (to compute `liveConversationId`); Row consumes the
  resolved boolean.
- **Imports Row needs and Home does not:** `Link` from `react-router-dom`,
  `Callout`, `ConfirmDialog`, `copyTextToClipboard`, `listMessages`,
  `formatTranscript`.
- **Imports Home keeps:** `useNavigate`, `useConversations`, `useSession`,
  `useScreenChrome`, `useFocusOnMount`, `usePageTitle`, `Heading`, `Button`,
  `InstallPrompt`, `LiveRegion`, `ScreenContainer`.
- **Test migration map (moves to `ConversationRow.test.tsx`):** the FEAT-012
  row-detail block from "renders a row per past conversation" onward (rows
  render, Resume href, peek truncation, Delete confirm/cancel, A11Y-033
  alertdialog, rename editor, A11Y-030 accessible names, A11Y-026 rename
  border), the entire CR-008 menu-dismissal block, the entire CR-009
  Copy-transcript block, the entire A11Y-025 APG keyboard block.
- **Test migration map (stays in `Home.test.tsx`):** the A11Y-005/A11Y-022
  focus-on-mount block, the FEAT-012 AC#19 empty-state copy + the "renders no
  past-chats section" test + the A11Y-032 past-chats-section test, the CR-011
  cull-empty test, the FEAT-012 AC#25/ARCH-001 Start-a-chat test, the IMPRV-018
  commit-hash test.
- **Test mechanics:** Row tests can render
  `<ConversationRow record={…} …callbacks />` directly under `<MemoryRouter>`
  (Row uses `<Link>`); they don't need `SessionContext` or the conversations
  hook. They will still need `fake-indexeddb` for `listMessages` (peek + Copy
  transcript). The `cullEmptyConversations` spy used by CR-011 tests is a
  Home-level concern and goes away from Row tests entirely.
- **Risks:** (1) props-explosion creep — the current 8-prop bag is the floor;
  future row-level state (e.g. a per-row settings affordance) should resist
  adding props by either lifting to Home or passing one callback bundle. (2)
  `LIVE_STATES` is currently exported only via its use in Home; if a future
  caller needs the same predicate, promote it to a small module under
  `src/core/` rather than re-exporting from Home. (3) Row reads `Date.now()`
  inside `formatRelative` during render — moving it doesn't change that, but the
  colocated test should keep using fake timers / fixed `lastActivityAt` deltas
  like `Home.test.tsx` already does. (4) The fallback textarea + LiveRegion
  split (textarea is row-local, LiveRegion is Home-level via `onAnnounce`) is
  load-bearing per CR-009's comments; the extraction must not collapse them.

## Related work

- FEAT-012 — introduced row + rename/delete + peek.
- CR-008 — lifted menu-open to Home, outside-click + Escape.
- CR-009 — Copy transcript, `COPY_FLASH_MS`, fallback textarea, screen-level
  LiveRegion.
- CR-011 — cull empty conversations on mount; tests stub
  `cullEmptyConversations`.
- ARCH-001 — Resume became a real `Link`; `LIVE_STATES` + `isLive` badge; Home
  owns `startAsOfferer` + `navigate`.
- A11Y-025 — APG keyboard model: `TYPEAHEAD_RESET_MS`, `MENU_ITEM_LABELS`,
  `aria-disabled`, roving tabindex.
- A11Y-026 — rename input border tokens.
- A11Y-030 — row-specific accessible names on Resume / More actions.
- A11Y-032 — Past chats heading is the entry point — Home-level, not Row.
- A11Y-033 — `ConfirmDialog` replaced `window.confirm`.
- BUG-006 — `selfPeerId`/`senderId` attribution in `onCopyTranscript`.
- IMPRV-008 / IMPRV-009 — improvements that produced CR-008 / CR-009.

## Working

- Baseline `npm test` green: 36 files, 447 tests.
- Extracting `ConversationRow` to `src/components/ConversationRow.tsx` (Row +
  `formatRelative` + `autoLabel` + `COPY_FLASH_MS` + `TYPEAHEAD_RESET_MS` +
  `MENU_ITEM_LABELS` + `RowProps`).
- `LIVE_STATES` + `liveConversationId` stay in `Home.tsx`.
- Splitting `Home.test.tsx` per the migration map: row-detail blocks move to
  `ConversationRow.test.tsx`; focus-on-mount, empty-state, CR-011 cull,
  Start-a-chat, commit hash stay.
