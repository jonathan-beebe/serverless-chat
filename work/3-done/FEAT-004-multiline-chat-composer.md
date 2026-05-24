# FEAT-004: Multi-line chat composer (Enter sends, Shift+Enter newline)

**Status:** Resolved **Type:** Feature **Area:** Chat / composer

## Summary

Upgrade the chat message composer from a single-line `<input>` to an
auto-growing `<textarea>` where **Enter sends** the message and **Shift+Enter
inserts a newline**. Messages with embedded newlines render with their line
breaks preserved in the transcript. No length cap in v1 beyond what the WebRTC
data channel naturally imposes.

## Customer value

- **Real conversations include lists, code snippets, and paragraphs.** Today,
  the moment a user wants to send a two-line thought (a snippet, an address, a
  numbered list, a multi-step instruction), they hit a wall: there's no way to
  express it in one message. They either send a wall of run-on text or split it
  across many sends.
- **Matches universal muscle memory.** Enter-to-send / Shift-Enter-for-newline
  is the default in Slack, Discord, iMessage, WhatsApp, Signal, Teams,
  Messenger, Linear, GitHub. Departing from it would be the surprise, not the
  norm.
- **Pairs naturally with FEAT-003** (Enter-submits-reply-code) — the
  keyboard-handling rules become consistent across the app's two text-entry
  surfaces.

## Business value

- The composer is the single most-used UI in the app. Lifting it from "one-liner
  only" to "real-message composer" is the highest-leverage UX investment
  available short of new features.
- Closes a credibility gap: a chat app that can't send a two-line message reads
  as a tech demo, not a usable product.
- Implementation is contained — one component (`Chat.tsx`) and a CSS rule on the
  message bubble.

## What a working feature delivers

A user in an active chat session can:

- **Press Enter** to send the current draft, identical to today's submit path.
- **Press Shift+Enter** to insert a newline at the caret position without
  sending.
- **See the composer auto-grow** from a single row up to ~5–6 rows as they type
  or paste multi-line content, then scroll internally beyond that — the
  transcript above stays visible.
- **Send a multi-line message** and see those line breaks preserved in the
  rendered message bubble (both their own and the peer's).
- **Receive a multi-line message** from the peer and read it with the line
  breaks intact.

Additional guarantees:

- IME composition is respected — confirming a composing CJK character with Enter
  does **not** submit (use `event.isComposing` / `keyCode === 229`).
- Pressing Enter with an empty/whitespace-only draft does nothing (no send, no
  newline).
- Pressing Enter while `disabled` (no peer connection) does nothing.
- No regression to the scroll-pin behavior (IMPRV-005) when the composer
  grows/shrinks — the transcript should not jump.
- No regression to FEAT-002 focus behavior — the textarea is the new focus
  target, with the same auto-focus moments.

## Acceptance criteria

1. **Enter** on a non-empty trimmed draft with `disabled === false` calls
   `onSend(draft)` and clears the draft. The default newline insertion is
   suppressed.
2. **Shift+Enter** inserts a newline at the caret; the form is not submitted.
3. **Enter** with an empty/whitespace-only draft does nothing (no send, no
   newline added).
4. **Enter** while `disabled` is true does nothing.
5. **Enter during IME composition** does not submit and does not interfere with
   the IME.
6. The composer starts at 1 visible row, grows up to a maximum of ~5–6 rows as
   content/line-wrapping requires, then scrolls internally beyond that. Shrinks
   back when content is deleted.
7. Messages containing `\n` characters render with line breaks preserved in the
   bubble (sender and receiver bubbles both).
8. Sending a message resets the composer to its 1-row default height.
9. Mouse/touch behavior is unchanged: clicking Send still works exactly as
   today.
10. No regression to FEAT-002 focus rules or IMPRV-005 transcript scroll-pin
    behavior.

## Out of scope (v1)

- **Markdown rendering** (bold, italics, code blocks, links). Send plain text;
  render plain text. Whitespace preservation only.
- **Explicit length cap or character counter.** WebRTC's data channel will throw
  at its own limit; defer policy until we see real abuse.
- **Rich paste handling** (paste image, paste table). Plain text only.
- **Mentions, emoji picker, attachments, drafts persisted across reloads.**
  Separate features.
- **Mobile-specific keyboard quirks** (e.g. some on-screen keyboards have a
  dedicated Send key) — rely on the standard `keydown` Enter handler; address
  device-specific issues only if they surface in testing.

## Open questions

- **Auto-grow technique:** measure scrollHeight via a hidden mirror element, or
  just use `field-sizing: content` (CSS) where supported with a JS fallback?
  Recommend `field-sizing: content` first — it's now supported in Chrome 123+
  and Safari 18+, falling back to a one-effect measurement on input for older
  browsers. Implementer's choice.
- **Should we trim leading/trailing newlines on send?** Recommend yes — strip
  leading/trailing `\s+` before sending so a stray Shift+Enter at the end
  doesn't produce a bubble with awkward trailing whitespace.

## Notes for the implementer

- Touch-points are all in `src/components/Chat.tsx`:
  - Replace the `<input id="chat-input">` with a
    `<textarea id="chat-input" rows={1}>`.
  - Add an `onKeyDown` handler implementing the gating from FEAT-003 (Enter +
    !shift + !isComposing + non-empty + !disabled → submit).
  - The message bubble `<span>` at `Chat.tsx:60-65` needs `whitespace-pre-wrap`
    (Tailwind) so embedded `\n` renders as line breaks. Verify that
    `break-words` or equivalent is present so long un-spaced lines still wrap.
  - For auto-grow, prefer the CSS `field-sizing: content` approach; if going JS,
    key the height adjustment off `draft` in a layout effect so the height
    settles before paint and the scroll-pin effect (`Chat.tsx:28-33`) sees a
    stable layout.
- Test coverage to add in `src/components/Chat.test.tsx`:
  - Enter on a non-empty draft sends and clears.
  - Shift+Enter inserts a newline and does not send.
  - Enter on empty/whitespace draft does nothing.
  - Enter while `disabled` does nothing.
  - Enter during IME composition does not send (simulate `isComposing: true`).
  - A message containing `\n` is rendered with line breaks preserved (assert on
    the rendered bubble, not the raw string).
  - Composer height resets after a send.
- Coordinate with FEAT-002 (keep-input-focused) — both touch the same textarea
  ref and focus rules. If FEAT-002 lands first, this ticket only swaps the
  element type; if this lands first, FEAT-002's implementer should treat the new
  textarea as the target.

## Working notes

**FEAT-002 has already landed**, so this ticket just swaps the `<input>` for a
`<textarea>` and re-points the existing `inputRef` (rename → `textareaRef`). The
focus rules, the post-send refocus, and the FEAT-002 tests all carry over
unchanged in intent.

**Approach:**

- `Chat.tsx`: replace the single-line `<input>` with `<textarea rows={1}>` and
  add an `onKeyDown` handler that calls `onSend` when Enter is pressed without
  modifier, IME composition is inactive, the draft is non-empty after trim, and
  `disabled` is false. Click-Send keeps using the form's `onSubmit`; both paths
  share a small `sendIfValid` helper. Send trims the draft (open question's
  recommendation — strip stray leading/trailing whitespace).
- Auto-grow: CSS-only via `field-sizing: content` with a `max-h-*` cap and
  `overflow-y-auto` so the textarea scrolls internally past ~5 lines. jsdom
  doesn't compute height so the cap is asserted visually, not in tests.
- Message bubble: add `whitespace-pre-wrap break-words` so embedded `\n` renders
  and long un-broken strings still wrap.
- The transcript scroll-pin effect already keys off `messages` so it's
  untouched. The auto-focus effect already keys off `disabled` so it's
  untouched.

**Tests to add (`Chat.test.tsx`):**

- Composer is a `<textarea>`, not an `<input>`.
- Enter on a non-empty draft sends (trimmed) and clears.
- Shift+Enter does NOT send.
- Enter on empty / whitespace-only draft does NOT send.
- Enter while `disabled` does NOT send.
- Enter during IME composition does NOT send.
- Message bubble preserves embedded `\n` via `whitespace-pre-wrap`.

**Existing tests to protect:** Chat scroll-pin tests, speaker-attribution tests,
FEAT-002 focus tests. The FEAT-002 "keeps focus on #chat-input after submitting
via Enter" test currently fires `submit` on the form to simulate Enter — with a
textarea, Enter no longer fires form-submit natively, so I'll re-aim that test
at `keyDown(Enter)`. Click-Send and disabled→enabled focus tests are unaffected.
