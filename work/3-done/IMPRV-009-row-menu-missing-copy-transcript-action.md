# IMPRV-009: Conversation-row "More actions" menu is missing a "Copy transcript" action

**Status:** Resolved **Severity:** Low **Location:** `src/screens/Home.tsx` (the
`⋯` menu inside `ConversationRow`, roughly lines 163-193). Reuses
`src/core/transcript.ts` (`formatTranscript`) and the clipboard fallback already
implemented in `src/components/Chat.tsx` (FEAT-011, lines 204-256).

## Problem

FEAT-011 added "Copy transcript" as a markdown export, but the affordance only
exists _inside_ the live chat (the toolbar at the top of `<Chat>`). The Home
screen lists past conversations and offers `Resume`, `Rename`, and `Delete chat`
— but no way to export a transcript without first re-resuming the conversation.
That's friction for what should be a one-click action, and it's especially
awkward when the goal is "grab the transcript and walk away" without
re-establishing a peer connection.

The data is already on disk: `core/storage.listMessages(conversationId)` returns
the persisted `ChatMessage[]` for a row (FEAT-012), and
`core/transcript.formatTranscript` already turns that into markdown. The copy
mechanism (modern clipboard API with a hidden-textarea + `execCommand('copy')`
fallback) also already exists inside `Chat.tsx`. Nothing about copying a row's
transcript is new — the action just isn't wired up.

## Intended behavior

The `⋯` menu on each Home conversation row gets a third item, **Copy
transcript**, sitting between Rename and Delete chat (Delete is a destructive
action and should stay last). Clicking it:

1. Loads the conversation's messages from IndexedDB.
2. Formats them via `formatTranscript(messages, { includeTimestamps: true })` —
   matching Chat's default. There is no toggle UI on the row menu; a single
   click does a single thing.
3. Writes the markdown to the clipboard via the same two-tier fallback the
   in-chat copy uses.
4. Surfaces success / failure feedback using the same patterns already in the
   codebase (LiveRegion announcement + transient inline confirmation; see
   below).
5. Closes the menu.

If the conversation has zero persisted messages, **Copy transcript** is disabled
(or omitted) — there's nothing to copy, and silently succeeding with an empty
clipboard is a worse UX than the menu item just not firing.

## Suggested fix

**Step 1 — extract the clipboard helper.** `Chat.tsx:217-256` open-codes the
two-tier copy. Lift it to `src/core/clipboard.ts` as:

```ts
export type ClipboardResult = 'copied' | 'manual'

// Writes text to the clipboard using the modern API first, falling back to a
// hidden-textarea + execCommand for http: / sandboxed-iframe contexts. The
// caller passes its own textarea ref so the "select + Ctrl+C" manual path
// stays focusable in the calling component's DOM.
export async function copyTextToClipboard(
  text: string,
  fallbackTextarea: HTMLTextAreaElement | null,
): Promise<ClipboardResult> { … }
```

Both call sites then share the same logic. The user's instruction was
_"literally reuses the existing copy function"_ — that requires either the
extraction above, or routing the row-menu copy through a shared module. Don't
duplicate the fallback logic; that's a guaranteed drift point.

**Step 2 — wire the row menu.** Inside `ConversationRow`:

```tsx
const onCopyTranscript = async () => {
  setMenuOpen(false)
  const msgs = await listMessages(record.id)
  if (msgs.length === 0) return // disabled state should also prevent this
  const markdown = formatTranscript(msgs, { includeTimestamps: true })
  const result = await copyTextToClipboard(
    markdown,
    fallbackTextareaRef.current,
  )
  // announce via LiveRegion + transient inline badge (see "Feedback" below)
}
```

Add the menu item between Rename and Delete:

```tsx
<button type="button" role="menuitem" onClick={() => void onCopyTranscript()} …>
  Copy transcript
</button>
```

**Step 3 — feedback.** Two paths in the existing codebase:

- The in-chat copy uses an inline "Copied!" badge that auto-dismisses after
  `COPY_FLASH_MS` (`Chat.tsx:196-202`).
- `LiveRegion` already exists for AT announcements
  (`src/components/LiveRegion.tsx`).

For the row menu, prefer a small inline confirmation near the row (e.g. a
transient "Copied transcript" message under the row label, mirroring the badge
pattern) plus an AT announcement via `LiveRegion`. On failure (the `'manual'`
return), surface the same "Press Ctrl+C / Cmd+C to copy" hint that Chat surfaces
today, and keep the fallback textarea selected. Don't use `window.alert` — Home
already avoids it (the rename/delete paths use confirm only for destructive
ops).

**Disabled state.** A `useEffect` already runs on mount to load the last-message
preview (`Home.tsx:66-87`). Extend it to also track `messageCount` (or just
`messages.length > 0`) so the menu can render the **Copy transcript** item as
disabled when the conversation has no messages. Cheap, and avoids a second
IndexedDB hit at click time.

## Test plan

Add to `src/screens/Home.test.tsx` (the file already mocks `core/storage` for
the preview test at `Home.test.tsx:85`):

1. **Menu shows Copy transcript between Rename and Delete chat.**
2. **Click Copy transcript →** mocked `listMessages` returns 2 messages → assert
   `navigator.clipboard.writeText` was called with the expected
   `formatTranscript` output (with timestamps).
3. **Empty-conversation row** → menu item is disabled (or absent), click is a
   no-op, clipboard is not invoked.
4. **Fallback path** → mock `navigator.clipboard.writeText` to reject; assert
   `document.execCommand('copy')` is invoked (via the same fallback textarea
   pattern Chat uses). Existing `Chat.test.tsx` already shows the spy shape.
5. **Failure surfacing** → both paths fail → assert the manual-copy hint is
   announced via `LiveRegion`.
6. **Menu closes after copy.** Matches the Rename/Delete pattern.

Add a quick unit test for the extracted `copyTextToClipboard`:

7. Modern path success → returns `'copied'`, no DOM touched.
8. Modern path throws → falls through to `execCommand` → returns `'copied'`.
9. Both fail → returns `'manual'`, textarea is selected.

## Out of scope

- A toggle for `includeTimestamps` on the row menu. The user explicitly asked
  for the single-click reuse of the existing function; no new UI surface.
  (Default matches Chat's default of `true`.)
- Bulk copy / export-multiple-conversations. Not part of the ask; can be a
  separate feature ticket if needed.
- Sharing transcripts via the Web Share API. Same — separate feature, not an
  improvement.
- Reworking the FEAT-011 in-chat toolbar. The extraction in Step 1 is the only
  change to `Chat.tsx`; its UI stays as-is.

## Working

**Research notes:**

- `Chat.tsx:217-256` open-codes the two-tier clipboard logic. Lifting to
  `src/core/clipboard.ts` is straightforward — the function is purely about the
  copy mechanism; state/UI feedback stays in the caller. `Chat.tsx`
  post-extraction switches the body of `onCopy` to call
  `copyTextToClipboard(...)` and then dispatches on the returned tag.
- `formatTranscript` consumes `ChatMessage[]` (uses only `.from`, `.text`, `.at`
  — structurally compatible with `MessageRecord` from storage since `delivery?`
  is optional; tests already use plain `{id, from, text, at}` shape).
- `useEffect` in `ConversationRow` (Home.tsx:101-122) already does
  `listMessages(record.id)` for the preview. The cleanest extension: track
  `hasMessages` alongside `preview` (single derived `messages.length > 0`) so we
  don't double-hit IDB at click time. Reuses the same fetched array.
- `LiveRegion` is module-mounted-per-component; for Home, the simplest plumbing
  is one `LiveRegion` at the screen level (`Home`) tied to a state like
  `copyAnnouncement: string`. Avoids per-row mounting churn — the live region
  must stay stable across renders for AT to announce changes.
- Feedback pattern: ticket calls for an inline "Copied!" badge near the row,
  mirroring `Chat`'s pattern with auto-dismiss after `COPY_FLASH_MS` (1500). On
  `'manual'`, surface the same "Press Ctrl+C / Cmd+C to copy" warning hint near
  the row.
- Fallback textarea: lift to the row level (one per row) — keeps the selected
  textarea in DOM near the trigger so `Ctrl+C/Cmd+C` is the next keystroke.
  Mirrors the `Chat.tsx` pattern of an always-mounted hidden textarea.
- Test infra: `Home.test.tsx` already wires `fake-indexeddb` per-test and seeds
  via `appendMessage`. Mocking `navigator.clipboard.writeText` /
  `document.execCommand` follows the same shape as `Chat.test.tsx:491-503`.

**Plan:**

1. Create `src/core/clipboard.ts` exporting
   `copyTextToClipboard(text, fallbackTextarea): Promise<ClipboardResult>` and
   `ClipboardResult = 'copied' | 'manual'`.
2. Add `src/core/clipboard.test.ts` covering the three paths (success on modern,
   fallthrough to execCommand, both fail → 'manual' + textarea selected).
3. Refactor `Chat.tsx:onCopy` to use the new helper. Keep all UI/state in place
   — only the inner mechanism changes. Existing tests should still pass
   unchanged.
4. Extend `Home.tsx` `ConversationRow`:
   - Track `hasMessages` from the preview-load effect.
   - Add `onCopyTranscript` handler that loads messages, formats, copies, and
     updates a copy-feedback state.
   - Render "Copy transcript" menuitem between Rename and Delete; disabled when
     `!hasMessages`.
   - Inline "Copied transcript" badge + manual-copy hint near the row (mirrors
     `Chat.tsx`).
   - Hidden fallback textarea per row.
   - Lift the `LiveRegion` to `Home` itself (single instance), with a state
     announcing the copy outcome.
5. Add tests to `Home.test.tsx` per the ticket's test plan.

**Decisions / departures from the ticket:**

- The ticket suggests tracking `messageCount` separately; I'll track a simple
  `hasMessages: boolean` derived from the same fetched preview — same effect,
  fewer dimensions.
- Per the ticket: "disabled state should also prevent" the click. I'll implement
  disabled-button behavior, and the handler also guards (cheap belt-and-braces).
- LiveRegion at `Home` level (one instance) rather than per row — avoids
  mount/dismount churn that would silence AT announcements.
- Default `includeTimestamps: true` matches Chat's default (no toggle UI per
  ticket).

## Resolution

- Extracted the two-tier clipboard write to `src/core/clipboard.ts` (new module:
  `copyTextToClipboard(text, fallbackTextarea): Promise<'copied' | 'manual'>`);
  added unit tests in `src/core/clipboard.test.ts` covering the modern path,
  fallback path, both-paths-fail, and edge cases (undefined
  `navigator.clipboard`, throwing `execCommand`, no textarea provided).
- Refactored `src/components/Chat.tsx`'s `onCopy` to delegate to the helper;
  existing FEAT-011 tests pass unchanged (47/47).
- Added the "Copy transcript" menuitem to `src/screens/Home.tsx`'s
  `ConversationRow`, sitting between Rename and Delete. Wires through
  `formatTranscript(msgs, { includeTimestamps: true })` and
  `copyTextToClipboard`. Tracks `hasMessages` alongside the existing
  preview-load effect (single IDB read), and disables the item for empty
  conversations. Inline `Callout` for "Copied transcript" / manual-copy hint,
  hidden fallback textarea per row, screen-level `LiveRegion` for AT
  announcements.
- Added 7 new Home tests covering: menu order (Rename / Copy transcript / Delete
  chat), markdown content of the copied text, menu close after click,
  execCommand fallback path, manual-hint surface + AT announcement, success AT
  announcement, and disabled-state for empty rows.
- Full suite: 329/329 passing. Type-check + lint clean.
