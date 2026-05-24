# FEAT-002: Keep message input focused

**Status:** Resolved **Type:** Feature **Area:** Chat / input UX

## Summary

The chat message input should be focused whenever the user is reasonably
expected to be typing — after sending a message, when the connection first comes
up, and again after a temporary disconnect that disabled the input. Today, focus
is lost after every mouse/touch send and is never automatically placed on the
input, forcing the user to re-click into the field to continue the conversation.

## Customer value

- **Faster back-and-forth.** The dominant interaction in this app is sending
  short messages in quick succession. Re-clicking the input between each one is
  friction that every mainstream chat app (iMessage, Slack, WhatsApp, Discord,
  Messenger) avoids — falling short of that bar makes the app feel slow.
- **Mobile parity.** On touch devices, tapping Send today dismisses the soft
  keyboard. Keeping the input focused keeps the keyboard up, which is the
  expected behavior on iOS/Android chat apps and roughly halves the taps needed
  to send two messages in a row.
- **No "lost focus" dead end.** Currently, clicking Send (vs. pressing Enter)
  leaves focus on a button that immediately becomes disabled, so keyboard users
  have no obvious next focus target.

## Business value

- Removes friction from the core interaction; no other change is more leveraged
  per line of code.
- Closes a perceived-quality gap against any other modern chat product.
- Implementation cost is trivial (a ref + a couple of effects), with no new
  dependencies or design work.

## What a working feature delivers

A user in an active chat session experiences:

- **After sending a message** (via Enter, Send-button click, or mobile tap), the
  message input remains focused and ready for the next message. Soft keyboards
  on mobile stay up.
- **On initial connect**, once the peer connection is established and the input
  becomes enabled, the input is focused automatically so the user can start
  typing without clicking into it.
- **After a transient disconnect** that disabled the input, when the connection
  recovers and the input is re-enabled, focus returns to the input — provided
  the user had not since clicked into some other focusable element (don't steal
  focus from an explicit user action).
- The input retains its current behavior when the user is intentionally focused
  elsewhere (e.g. scrolling the transcript with the keyboard, tabbing through
  the page) — auto-focus is only applied at the three moments above, not on
  every render.

## Acceptance criteria

1. After submitting a message via the **Enter key**, focus remains on
   `#chat-input`.
2. After submitting a message via **clicking the Send button** (mouse or touch),
   focus returns to `#chat-input` (not the now-disabled button).
3. On **mobile/touch devices**, the soft keyboard remains visible across
   consecutive sends — i.e. the input does not blur between messages.
4. When the chat input transitions from **disabled → enabled** (initial connect
   or reconnect), focus is placed on `#chat-input`.
5. The auto-focus on re-enable does **not** override focus if the user has
   explicitly focused another element since the input was disabled (e.g. they
   tabbed elsewhere or clicked into a different control).
6. No regression in scroll-pin behavior (IMPRV-005) — focusing the input must
   not cause the page or the transcript to scroll unexpectedly. Use
   `{ preventScroll: true }` where supported.
7. No new visible UI; behavior change only.

## Out of scope (v1)

- **Keyboard shortcut to focus the input from anywhere** (e.g. `/` or `Esc`).
  Worth considering once the basics are in place.
- **Focus management on the Setup / Offerer / Joiner screens.** This ticket is
  scoped to the in-session chat input.
- **Restoring focus across full page reloads.** Browser default behavior is
  fine.

## Open questions

- Should we also refocus after the transcript receives a remote message?
  Probably no — that's not user-initiated, and stealing focus on remote events
  risks interrupting the user mid-action elsewhere on the page.
- Is there any case where we should _deliberately_ blur (e.g. an explicit
  "disconnected, conversation over" state)? Likely yes for terminal disconnects;
  treat as out of scope unless the implementer encounters it.

## Notes for the implementer

- Touch-points are all in `src/components/Chat.tsx`. The form's `onSubmit`
  currently does `onSend(draft); setDraft('')` and nothing else — the input
  naturally keeps focus on Enter but loses it on a Send-button click because the
  button disables itself when the draft empties.
- Suggested approach: hold a `ref` to the input element. In `onSubmit`, call
  `inputRef.current?.focus({ preventScroll: true })` after clearing the draft.
  Add a `useEffect` keyed on the `disabled` prop that focuses the input on the
  `true → false` transition, gated on `document.activeElement === document.body`
  (or similar) so we don't steal focus from a user-initiated focus elsewhere.
- Prefer `preventScroll: true` to avoid interacting with the transcript
  scroll-pin logic in `Chat.tsx:28-33` (IMPRV-005).
- Add tests in `src/components/Chat.test.tsx` covering: focus retained after
  Enter-send, focus restored after click-send, focus moved to input on
  `disabled` going false, focus _not_ stolen when another element was focused at
  the moment the input re-enabled.

## Working notes

**Effect-ordering caveat:** React fires child useEffects _before_ parent
useEffects, so a Chat-internal focus-on-mount would be immediately overridden by
`useFocusOnMount` on the parent's `<h1>` in the Connected branch of
Offerer/Joiner. The cleanest fix is to drop `ref={headingRef}` from the
Connected `<h1>`s — Chat owns focus on that branch, and the closed/invite/reply
branches keep the heading-focus-on-mount they need for WCAG 2.4.3.

**Approach:**

- `Chat.tsx`: hold an `inputRef`. In `onSubmit`, after `setDraft('')`, call
  `inputRef.current?.focus({ preventScroll: true })` so Send-button submits
  return focus to the input.
- `Chat.tsx`: `useEffect` keyed on `disabled` — when not disabled, focus the
  input, but gated on `document.activeElement === document.body` so we never
  steal an explicit user focus. This effect fires on mount (initial connect) and
  on every `disabled` flip (reconnect).
- `Offerer.tsx` / `Joiner.tsx`: omit `ref={headingRef}` on the Connected `<h1>`
  — keep it on every other branch. `useFocusOnMount` becomes a no-op on
  Connected (ref.current is null), letting Chat's input-focus stand.

**Tests to add (Chat.test.tsx):**

- Focuses #chat-input on initial mount when enabled.
- Focus stays on #chat-input after Enter-submit.
- Focus returns to #chat-input after Send-button click.
- `disabled: true → false` moves focus to #chat-input.
- `disabled: true → false` does NOT steal focus when another element is focused.

**Existing tests to protect:** Chat auto-scroll & speaker-attribution tests
(unchanged behaviour). App routing/focus tests in `App.test.tsx` only assert h1
focus on Home and the Joiner _invite_ branch, neither of which we touch.
