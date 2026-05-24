# FEAT-003: Enter submits the reply code

**Status:** Resolved **Type:** Feature **Area:** Offerer / connect form

## Summary

On the Offerer screen, after pasting the friend's reply code into the textarea,
the user should be able to press **Enter** to submit and start the connection —
without reaching for the mouse to click "Connect". **Shift+Enter** continues to
insert a newline (standard Slack/Discord/GitHub convention) so the textarea
behavior isn't surprising.

## Customer value

- **Removes the most common stumbling point in the join flow.** The whole
  interaction is "paste the long string, press the obvious key." Today the
  obvious key inserts a newline instead, and the user has to hunt for the
  Connect button. Even for people who notice the button, it's an unnecessary
  tab-or-click between paste and connect.
- **Matches user muscle memory.** Every modern messaging/code-paste field people
  use daily (Slack, Discord, GitHub PR comments, Linear, chat boxes everywhere)
  treats Enter as submit and Shift+Enter as newline. Diverging from that here
  makes the app feel idiosyncratic at the _first_ interaction many users have
  with it.
- **Faster, cleaner handoff.** Combined with FEAT-002 (auto-focus after
  connect), the entire "paste → connect → chat" sequence becomes keyboard-only.

## Business value

- The Offerer screen is the narrowest part of the funnel — every two-person
  session passes through it exactly once. Reducing friction here has outsized
  impact on whether someone completes their first chat.
- Tiny implementation surface (one keydown handler on one textarea); near-zero
  risk of regression.
- No new design, no new UI affordance, no docs to update.

## What a working feature delivers

A user on the Offerer screen who has pasted a reply code into the "Paste their
reply code" textarea experiences:

- **Enter** submits the form, kicking off `session.submitAnswer(...)` — the same
  code path as clicking the Connect button.
- **Shift+Enter** inserts a newline in the textarea (default browser behavior
  preserved).
- Enter does **not** submit when the form would otherwise be unsubmittable:
  empty/whitespace-only draft, or `session.state === 'connecting'` (mirrors the
  existing button-disabled conditions in `Offerer.tsx:93`).
- IME composition is respected — pressing Enter to confirm a composing character
  (e.g. CJK input methods) does **not** submit. Use `event.isComposing` /
  `event.keyCode === 229` to gate.
- No change to mouse/touch behavior — clicking Connect still works exactly as
  today.

## Acceptance criteria

1. Pressing **Enter** while focused in the reply-code textarea, with non-empty
   content and `state !== 'connecting'`, submits the form and triggers
   `session.submitAnswer(...)`.
2. Pressing **Shift+Enter** in the same textarea inserts a newline; the form is
   **not** submitted.
3. Pressing **Enter** with an empty or whitespace-only draft does nothing (does
   not submit, does not error, default newline insertion is suppressed to match
   the empty-form behavior — or simply allowed, see _Open questions_).
4. Pressing **Enter** while `state === 'connecting'` does nothing (no
   double-submit).
5. Pressing **Enter** during IME composition does not submit and does not
   interfere with the IME.
6. Clicking the Connect button continues to work identically to today (no
   regression).

## Out of scope (v1)

- Generalizing this to other textareas. The chat message input (`Chat.tsx`) is
  already an `<input>` and submits on Enter via native form behavior — no change
  needed there. No other paste-a-code field exists today.
- Replacing the textarea with an `<input>`. The textarea is intentional (large
  paste target, multi-line code wrap visualization) and not worth changing here.
- A visible "Press Enter to connect" hint near the textarea. Consider in a
  follow-up if telemetry suggests users still don't discover it.

## Open questions

- When the draft is empty and the user presses Enter, should we **swallow** the
  keystroke (no newline either) or let the default newline insertion happen?
  Mild preference: let the default through — there's no harm in a newline in an
  empty textarea, and intercepting it adds code for no win.

## Notes for the implementer

- The form is in `src/screens/Offerer.tsx:79-98`. Submit logic is the existing
  `onSubmit` handler at `Offerer.tsx:23-27`.
- Suggested approach: add an `onKeyDown` to the textarea that calls
  `e.preventDefault()` + `onSubmit(e)` (or the same logic factored out) when:
  - `e.key === 'Enter'`, **and**
  - `!e.shiftKey`, **and**
  - `!e.nativeEvent.isComposing`, **and**
  - the same enabled-conditions as the Connect button (non-empty trimmed draft,
    `state !== 'connecting'`).
- Add test coverage in a co-located test file for the Offerer screen (create one
  if it doesn't exist):
  - Enter on a non-empty textarea submits.
  - Shift+Enter inserts a newline and does not submit.
  - Enter on an empty/whitespace draft does not submit.
  - Enter while `state === 'connecting'` does not submit.
  - Enter during IME composition does not submit.

## Working notes

**Approach:** add an `onKeyDown` to the reply-code textarea in `Offerer.tsx`. It
fires `session.submitAnswer(...)` and calls `e.preventDefault()` only when all
of these are true: `key === 'Enter'`, `!shiftKey`, `!nativeEvent.isComposing`,
the draft is non-empty, and `state !== 'connecting'`. For all other keystrokes
we let the default through — including bare Enter on an empty draft (per open
question, no value in suppressing the newline).

**Tests to add (`src/screens/Offerer.test.tsx`):**

- Enter on a non-empty textarea triggers `session.submitAnswer(draft)` and calls
  `preventDefault`.
- Shift+Enter does NOT submit (default behavior preserved).
- Enter on a whitespace-only draft does NOT submit.
- Enter while `state === 'connecting'` does NOT submit (no double-fire).
- Enter while `nativeEvent.isComposing` is true does NOT submit (IME).
- Clicking the Connect button still submits (regression guard).

**Existing tests to protect:** `Offerer.test.tsx` post-connect-drop and
failed-state regression tests are untouched by the new handler.
