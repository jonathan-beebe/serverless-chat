# FEAT-006: WhatsApp-style date headers and per-message timestamps

**Status:** Resolved **Type:** Feature **Area:** Chat UI /
`src/components/Chat.tsx`

## Summary

Replace the per-bubble `You` / `Them` captions in the chat transcript with
**chronological chrome**:

1. A **centered, full date header** (locale-formatted, weekday + date) above the
   first message, marking when the conversation starts.
2. A **per-message time stamp** rendered inside each bubble, bottom-right, in
   small muted type — WhatsApp/iMessage style.
3. **Additional centered date headers** inserted mid-transcript whenever the
   local-calendar day changes between two consecutive messages.

Authorship is still conveyed visually by **bubble alignment + color** (already
in place) and to assistive tech by the existing `sr-only` "You said: …" / "They
said: …" prefixes (preserved unchanged — they were added under A11Y-004).

## Customer value

- **Feels like a real chat app.** The current `You` / `Them` labels read as a
  debug affordance, not a chat product. Date/time chrome is the universal idiom
  every user already knows from WhatsApp, iMessage, Signal, Telegram, Messages,
  Slack DMs — recognition without instruction.
- **"When did they say that?" is answerable.** Right now the transcript is
  timeless. If a session lasts more than a few minutes the user has no way to
  gauge pacing, gaps, or whether a message was just sent or has been sitting
  unanswered for a while.
- **Day-rollover is unambiguous.** A peer-to-peer session left open overnight
  currently looks like one continuous conversation; a centered "Friday, May 22,
  2026" header dropping in at midnight makes the seam obvious without the user
  having to think about it.
- **Less visual noise per bubble.** A 12-character "Them" caption sitting above
  every received message is a lot of pixels for a single bit of information that
  color and alignment already encode.

## Business value

- Closes the perceived-polish gap between this app and the messengers it is
  implicitly compared to on first use. The product's pitch is "no accounts, no
  servers, just share a link" — the chat surface should look like the apps that
  pitch presupposes the user is familiar with.
- Uses data we already capture (`ChatMessage.at: number`, populated as
  `Date.now()` on both send and receive — see `src/hooks/useChatSession.ts:79`
  and `:148`) — no protocol changes, no schema change, no extra wire payload.
- Single-file change, well-bounded blast radius (`Chat.tsx` + its tests).

## What a working feature delivers

When two peers are connected and exchanging messages:

- The **first message** of the conversation is preceded by a
  horizontally-centered date row showing the **weekday, month, day, year** in
  the user's locale (e.g. `Friday, May 22, 2026` on en-US,
  `Freitag, 22. Mai 2026` on de-DE). The row is rendered as part of the
  transcript list, visually separated (muted text, thin divider-style treatment
  so it reads as chrome, not content).
- Every message bubble shows the **time it was created** in the bottom-right
  corner of the bubble, in small muted type. Format is locale-driven short time
  via `Intl.DateTimeFormat(undefined, { timeStyle: 'short' })` — so en-US users
  see `1:23 PM`, en-GB / de-DE users see `13:23`.
- If two consecutive messages span a **calendar-day rollover** (local time), a
  new centered date header is inserted between them. Same formatting as the
  opening header.
- The previous **visible** `You` / `Them` captions above each bubble are
  removed.
- Authorship remains conveyed by bubble alignment (right = me, left = them) and
  color (existing sky-600 vs slate-700), and the existing `sr-only` "You said: "
  / "They said: " prefixes are kept intact so the `aria-live="polite"`
  announcement still names the speaker.
- Empty state ("No messages yet. Say hello.") is unchanged — no date header
  renders until there is at least one message.

Visual sketch (en-US locale):

```
──────────────── Friday, May 22, 2026 ────────────────

  ┌───────────────────────┐
  │ hey, you there?       │
  │              1:23 PM  │
  └───────────────────────┘

                       ┌───────────────────────┐
                       │ yep, just landed      │
                       │              1:24 PM  │
                       └───────────────────────┘

──────────────── Saturday, May 23, 2026 ────────────────

  ┌───────────────────────┐
  │ morning!              │
  │             12:01 AM  │
  └───────────────────────┘
```

## Acceptance criteria

1. **Opening date header.** When the transcript contains at least one message, a
   centered, locale-formatted date row (weekday + full date) is rendered
   immediately before the first message. Format:
   `new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(new Date(message.at))`.
2. **Per-message time.** Every `ChatMessage` bubble shows its `at` timestamp in
   the bottom-right corner of the bubble, formatted via
   `new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(new Date(message.at))`.
   The time sits **inside** the bubble (not below it), is visually smaller and
   lower-contrast than the message body, and does not overlap message text on
   multi-line bubbles (long messages push the time to its own line at the
   bottom-right; short messages may flow time alongside the last line of text —
   either is acceptable as long as the time is not clipped or visually
   colliding).
3. **Day-change headers.** For any pair of consecutive messages `[m_i, m_{i+1}]`
   where
   `new Date(m_i.at).toDateString() !== new Date(m_{i+1}.at).toDateString()`
   (i.e. local-calendar date differs), a centered date row formatted the same
   way as the opening header is rendered between them.
4. **Visible `You` / `Them` captions are removed.** No bubble renders a visible
   `You` or `Them` label.
5. **Screen-reader announcement preserved.** The `aria-live="polite"` transcript
   still produces, for each new message, an announcement containing
   `You said: <text>` or `They said: <text>` (i.e. the `sr-only` prefix spans
   from the current implementation are kept). The per-message time inside the
   bubble is marked `aria-hidden="true"` so it is not added to every live-region
   announcement (the time would be noisy and not useful read aloud per message).
6. **Date headers are not announced as messages.** The date-header `<li>` is
   marked `aria-hidden="true"` (or wrapped so it is not picked up by the polite
   live region), so a date rollover does not produce a spoken interruption.
7. **Locale correctness.** Rendering on `en-US`, `en-GB`, and `de-DE` (mocked
   via `Intl.DateTimeFormat` arguments in tests) produces:
   - en-US: `1:23 PM`, `Friday, May 22, 2026`
   - en-GB: `13:23`, `Friday, 22 May 2026`
   - de-DE: `13:23`, `Freitag, 22. Mai 2026`
8. **Test updates.**
   - `Chat.test.tsx` `msg(…)` helper now supplies a deterministic non-zero `at`
     (e.g. a fixed UTC millis value) so assertions on rendered time strings are
     stable.
   - The existing **auto-scroll** tests pass unchanged.
   - The existing **`'You said:' / 'They said:'`** screen-reader-prefix
     assertion passes unchanged.
   - The existing **"renders a visible speaker caption"** test is replaced with
     a test that asserts the visible `You` / `Them` caption is **absent**, and
     that an opening date header (matching the configured locale's full-date
     format) is **present**.
   - New tests:
     - asserts the per-message time appears in each bubble for both `me` and
       `them` messages;
     - asserts that two messages on the same local day produce exactly one date
       header (the opener);
     - asserts that two messages straddling a local-midnight boundary produce
       two date headers, with the second header text matching the second day.
9. **Auto-scroll regression-free.** Inserting date-header rows into the `<ol>`
   does not break the `wasNearBottomRef` logic — the existing
   `NEAR_BOTTOM_THRESHOLD_PX` heuristic must continue to pin the user to the
   latest message under the same conditions as today (covered by the existing
   auto-scroll tests in `Chat.test.tsx`).

## Out of scope (v1)

- **Grouping consecutive same-author messages** under a single timestamp (à la
  iMessage). Every bubble shows its own time, matching WhatsApp's behavior.
- **Relative times** ("just now", "2 min ago", "Today"/"Yesterday" shortcuts).
  Always render the absolute clock time and the full date — no relative
  phrasing. Predictable and locale-clean.
- **Timezone or UTC display.** All times are rendered in the local browser
  timezone via `Intl.DateTimeFormat` defaults. No timezone abbreviation is
  shown.
- **Read / delivered indicators** (single tick, double tick, "Read at …"). The
  data channel does not yet emit acks; this is a separate ticket if/when it
  does.
- **Hover-for-full-timestamp tooltip** on each bubble. Defer —
  `Intl.DateTimeFormat` short time is sufficient on its own.
- **Persisting the transcript across reloads.** Conversation remains ephemeral,
  as today.
- **Backfilling `at` for messages with `at: 0`.** Production code paths already
  populate `at` with `Date.now()`; the zero-`at` case only exists in the test
  fixture and will be updated as part of test updates (AC #8).
- **Internationalizing the empty-state copy** ("No messages yet. Say hello.").
  Locale-aware copy is a separate concern; this ticket only switches _date/time
  formatting_ to locale-driven.

## Open questions

- **A11Y-004 visible-caption regression.** A11Y-004
  (`src/components/Chat.tsx:60-63`) deliberately added the visible `You` /
  `Them` caption so that "authorship is not conveyed by color and alignment
  alone" — a concession for users with color-vision differences or reduced
  spatial perception. Dropping that caption is a deliberate visual tradeoff the
  user has requested; the _screen-reader_ path is preserved (sr-only prefixes
  still announce the speaker), but the _low-vision sighted_ path now relies on
  alignment + color only.
  - **Recommendation:** accept the regression as a deliberate design call for
    v1, on the basis that (a) the WhatsApp/iMessage idiom is what users expect
    and those apps do the same, and (b) sky-600 vs slate-700 against a slate-900
    background remains a high-contrast pair even under the common color-vision
    deficiencies (deuteranopia/protanopia/tritanopia). If a future a11y pass
    disagrees, the recovery is cheap: a small directional indicator (e.g. a
    colored dot before each bubble, or a one-character author glyph in the
    bottom-left of the bubble alongside the time) can re-establish the
    non-color, non-alignment signal without bringing back the verbose `You` /
    `Them` text. Capture as a follow-up only if real user feedback surfaces.
- **Where does the time sit inside the bubble on long, wrapping messages?** Two
  patterns are common: (a) WhatsApp floats the time bottom-right with the text
  reserving an em-dash-wide space on the last line; (b) iMessage drops the time
  to its own line at the bottom of the bubble for any multi-line message. Both
  pass AC #2. Implementer's call — recommend (b) for simplicity (a flex column
  with the message body on top, the time as a smaller right-aligned row at the
  bottom), since it avoids the float/reserved-space CSS trick.

## Notes for the implementer

- **Single touch-point for rendering:** `src/components/Chat.tsx`. The
  transformation from `messages: ChatMessage[]` to "messages interleaved with
  date headers" should happen once per render (a small `useMemo` or just inline
  `.reduce` is fine — the list is small).
- **Suggested render shape.** Replace the current `messages.map` body with a
  derived array of items of shape
  `{ kind: 'date', label: string, key: string } | { kind: 'message', message: ChatMessage }`.
  Walk `messages` once, tracking `lastDateString = null` initially; for each
  message compare `new Date(m.at).toDateString()` against `lastDateString` and
  emit a date item whenever it changes (including the first message). Then
  render each item as an `<li>` — date rows get centered styling (e.g.
  `flex justify-center`, muted text, optional thin divider lines via flanking
  `<span>`s or CSS borders), message rows get the existing bubble treatment
  minus the visible caption, plus an inner `<time>` element for the timestamp.
- **Use `<time dateTime={new Date(m.at).toISOString()}>`** for both the bubble
  time and the date header. This is the correct semantic element and gives
  consumers a machine-parseable timestamp without needing custom `data-`
  attributes.
- **`Intl.DateTimeFormat` is cheap but not free** — construct the two formatters
  (`{ dateStyle: 'full' }` and `{ timeStyle: 'short' }`) once per render via
  `useMemo`, not once per message.
- **Date-equality comparison: use `.toDateString()` not `.getDate()`.**
  `getDate()` returns 1–31 and collides across months/years. `toDateString()`
  returns e.g. `"Fri May 22 2026"` and is safe to compare with `!==`. (Slight
  perf irrelevance for a chat transcript.)
- **Auto-scroll heuristic.** The existing `NEAR_BOTTOM_THRESHOLD_PX = 32` logic
  measures from `scrollHeight - scrollTop - clientHeight` and does not care what
  the list items are. Date rows are just additional `<li>` content; the existing
  tests in `Chat.test.tsx` cover the regression surface. No change needed to the
  scroll effect itself.
- **A11Y wiring.**
  - Keep both existing `sr-only` `<span>` prefixes ("You said: " / "They said:
    ") on every message — they are what A11Y-004 / aria-live depend on.
  - Remove the existing `aria-hidden="true"` visible caption span entirely.
  - Mark the inner `<time>` inside each bubble `aria-hidden="true"` so the
    polite live region doesn't read it on every send/receive.
  - Mark the date-header `<li>` `aria-hidden="true"` (or render it outside the
    live region — but keeping it inside the `<ol>` with `aria-hidden` is simpler
    and preserves the visual ordering).
- **Test fixture update.** `Chat.test.tsx`'s `msg(…)` helper currently sets
  `at: 0`. Replace with a small helper that accepts an optional ISO-date or
  epoch-ms argument and defaults to a deterministic fixed time. Suggested:
  `Date.UTC(2026, 4, 22, 17, 23)` (May is month index 4) for a known
  `1:23 PM UTC` reference, and supply a second timestamp 24h+ later in the
  day-rollover test. To keep locale-dependent assertions stable in CI, either
  (a) set the test process locale via `Intl.DateTimeFormat`'s explicit-locale
  arg in the assertion side (recommended), or (b) assert on substring shape
  (`/\d{1,2}:\d{2}/`) rather than exact string match.
- **Coordinate with FEAT-001 (Dark mode):** the date header's "muted text + thin
  divider" treatment needs to land on a palette that works in both light and
  dark. Tailwind `text-slate-400` on the divider and date label is a safe pick
  in both modes given the existing component already targets slate.
- **Coordinate with FEAT-004 (Multi-line composer):** unrelated surface, no
  interaction expected — the composer is below the transcript and is not touched
  by this ticket.
- **Coordinate with A11Y-004:** as noted in Open Questions, this ticket
  consciously regresses the _visible_ portion of A11Y-004 while preserving the
  _screen-reader_ portion. Mention this explicitly in the PR description so the
  regression is intentional, documented, and reviewable rather than slipping in
  silently.

## Working notes

**Approach:**

- In `Chat.tsx`, transform `messages` into an `items` array of
  `{kind:'date'} | {kind:'message'}` via `useMemo`. Walk once, comparing
  `new Date(m.at).toDateString()` against a running `lastDay`; emit a date item
  every time it changes (including before the first message).
- Render date items as a centered `<li aria-hidden="true">` with muted text +
  flanking divider lines (`flex items-center gap-3` + `flex-1 border-t` spans).
  The `<li>` is aria-hidden so polite live-region updates don't announce day
  rollovers.
- Render message items the same as today minus the visible "You/Them" caption.
  The `sr-only` "You said:" / "They said:" prefix stays (A11Y-004 SR path). Add
  an inner `<time aria-hidden="true">` with the locale-short time in the
  bottom-right of the bubble.
- Construct the two `Intl.DateTimeFormat` instances once per render via
  `useMemo`.
- Use `<time dateTime={iso}>` for both the header and the per-bubble time —
  correct semantic element + machine-parseable.

**Bubble layout choice (open question):** go with iMessage-style — the time
drops to its own row at the bottom-right of the bubble. Simpler than WhatsApp's
float trick and avoids reserved-width hacks; renders cleanly for both 1-line and
N-line messages.

**Tests to add (and adjust) in `Chat.test.tsx`:**

- Update `msg()` to default `at` to a deterministic fixed UTC millis
  (`Date.UTC(2026, 4, 22, 17, 23)` = 2026-05-22T17:23Z).
- Replace the "renders a visible speaker caption" test with: visible
  `You`/`Them` captions are absent + an opening date header is present.
- New: per-message `<time>` element appears in each bubble (assert via
  `role="time"` is not standard — query by the `<time>` tagName or by formatted
  string).
- New: two same-day messages produce exactly ONE date header.
- New: two messages straddling local-midnight produce TWO date headers and the
  second one labels the new day.
- New: date-header items carry `aria-hidden="true"`.
- New: per-bubble time elements carry `aria-hidden="true"`.

**Existing tests to protect:**

- Auto-scroll tests (`Chat auto-scroll` block) — date `<li>`s are still just
  `<li>`s; no scroll logic change.
- "You said: / They said:" sr-only prefix test (A11Y-004 SR path) — preserve
  verbatim.
- FEAT-002 focus tests — composer untouched.
- FEAT-004 textarea + Enter-send + whitespace-pre-wrap tests — composer
  untouched; bubble class still carries `whitespace-pre-wrap`.

**Locale stability:** tests will assert on substring shapes (`/\d{1,2}:\d{2}/`
for time; "Friday" + "2026" presence for the en-US date) rather than exact
full-locale strings, so CI works regardless of host locale.

**A11Y-004 visible-caption tradeoff:** explicitly accepted per ticket's Open
Question. SR users still hear "You said:" / "They said:"; sighted users rely on
alignment + sky-600 vs slate-200/slate-700 color contrast.
