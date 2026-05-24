# IMPRV-012: Copied transcript repeats the author label on every consecutive same-sender message

**Status:** Resolved **Severity:** Low **Location:** `src/core/transcript.ts`
(the `for (const m of messages)` loop, ~lines 40-55); tests in
`src/core/transcript.test.ts`

## Problem

The FEAT-011 transcript formatter emits a fresh `**You**` / `**Them**` heading
for every message, even when the same author sent five in a row. Real chats are
bursty — one person fires off three short thoughts, the other replies — so the
copied markdown reads as a wall of repeated labels rather than the conversation
the user just had.

### Today

Names-only mode:

```
**You**
message A

**You**
message B

**Them**
message C

**Them**
message D

**Them**
message E
```

Timestamped mode:

```
# Friday, May 22, 2026

**You** · 14:05
message A

**You** · 14:07
message B

**Them** · 14:08
message C

**Them** · 14:09
message D

**Them** · 14:11
message E
```

### After this CR

Names-only mode:

```
**You**
message A

message B

**Them**
message C

message D

message E
```

Timestamped mode (only the first message in a run keeps its time — the run's
"start" time):

```
# Friday, May 22, 2026

**You** · 14:05
message A

message B

**Them** · 14:08
message C

message D

message E
```

Per-message timestamps for the 2nd-Nth message in a run are dropped
intentionally. The grouped form trades per-message-time precision for
readability; users who want every timestamp inspect the live transcript (where
each bubble still shows its own time) or the underlying data, not the
copy-to-markdown output.

## Intended behavior

1. **Consecutive messages from the same `from` value get one author heading.**
   Subsequent messages in the run drop the heading entirely and render as their
   own paragraph, separated from the previous body by a blank line.

2. **An author change breaks the run.** First message after the change gets a
   fresh `**You**` / `**Them**` heading, same as today.

3. **A date rollover (`## {date}` insertion) breaks the run too.** After the
   `##` header, the next author heading reappears even if the same sender
   continued past midnight. Mirrors the live chat surface's date-divider
   behavior and keeps the "first message in this day from this author at this
   time" reading intact for the timestamped mode.

4. **Timestamps:** in the timestamped mode, only the first message of a run
   carries the `· {time}` suffix (it's effectively the run-start time). 2nd-Nth
   messages render body-only, no per-message time.

5. **Body rendering unchanged.** `renderBody` still converts in-paragraph `\n`
   to a markdown hard break (`  \n`); paragraph `\n\n` still passes through. The
   "blank line between messages" separator that today sits between every message
   stays — that's how the 2nd-Nth body in a run gets its own paragraph.

6. **Single-message conversations are unaffected.** A one-message transcript
   renders identically before and after this change.

## Suggested fix

`src/core/transcript.ts` — change the loop to track the previous emitted
message's `from` value and whether the previous iteration emitted a date header.
Emit the author heading only when:

```ts
// pseudocode
const isAuthorChange = m.from !== prevFrom
const isFirst = parts.length === 0 // captured before the date header push
const writeAuthorHeading = isFirst || isAuthorChange || isDayChange
```

If `writeAuthorHeading` is false, skip the `parts.push(heading)` line; jump
straight to `parts.push(renderBody(m.text))` and the trailing blank. Update
`prevFrom` after every message; reset it to `null` when a `##` rollover is
emitted so the post-rollover message always gets a heading regardless of author
continuity.

`src/core/transcript.test.ts` — extend with cases below.

## Test plan

Add to `src/core/transcript.test.ts`:

1. **Names-only mode: consecutive same-author messages share one heading.**
   Three "me" messages followed by two "them" messages should produce exactly
   one `**You**` heading and one `**Them**` heading in the output (regex
   `out.match(/^\*\*You\*\*$/gm).length === 1`, same for Them). Bodies appear in
   order.

2. **Names-only mode: alternating senders still get one heading per turn.**
   `me, them, me, them` → two `**You**` and two `**Them**` headings, in order.
   Regression guard for the original behavior.

3. **Timestamped mode: only the first message of a run keeps its time.** Same
   three-then-two sequence; assert the output contains exactly one
   `**You** · {time-of-first-me}` and one `**Them** · {time-of-first-them}`
   heading, and the subsequent bodies render without their own time prefix.

4. **Date rollover breaks the run even if the author didn't change.** Two
   same-author messages straddling local midnight: assert the post-rollover
   message gets a fresh `**You**` (or `· {time}`) heading after the `## {date}`
   rollover line, not just a bare body.

5. **Single message is unchanged.** One-message transcript output is
   byte-identical before and after the change for both toggle modes.

6. **Hard-break bodies survive grouping.** A run with a Shift+Enter body in the
   middle still renders its `  \n` hard break correctly.

7. **Existing tests stay green.** No change to date-header emission, no change
   to body rendering, no change to the trailing single-newline normalization.

## Out of scope

- **Visual grouping in the live chat surface.** This CR only touches the
  copy-to-markdown formatter. The bubble-by-bubble layout in `Chat.tsx` already
  groups visually via the bubble color + side; no change there.
- **Per-message time on 2nd-Nth messages.** Decided against in this CR's design
  — see Intended behavior #4. If a user reports they need per-message times in
  grouped runs, layer that on as a separate option (e.g. `groupAuthors: false`)
  rather than restoring the today-style repetition.
- **Configurable run-collapse threshold.** No "only group runs of N+ messages"
  option; runs of 2 collapse just like runs of 5.
- **Time-gap-based regrouping.** If two same-author messages are 6 hours apart,
  the formatter still treats them as one run. The chat surface itself doesn't
  split on time gaps either, so the markdown follows suit.
- **Per-author label customization.** Still hardcoded `**You**` / `**Them**`
  matching the A11Y-004 speaker labels.

## Working notes

- `src/core/transcript.ts` is a pure function, easy TDD target. Existing loop
  pushes `heading`, `renderBody(m.text)`, `''` for every message.
- Plan: track `prevFrom` across iterations; reset to `null` whenever we emit a
  `##` date rollover header. The `#` opening header is the first-of-input case
  (`parts.length === 0` before the push), and is already inherently a "new run"
  because there's nothing before it. So the rule simplifies to "skip the heading
  push when `m.from === prevFrom` AND we did not just emit a date header".
- Easier framing matching the suggested-fix pseudocode: compute
  `writeAuthorHeading = prevFrom === null || m.from !== prevFrom`. After
  emitting a `##` rollover, set `prevFrom = null` so the next message always
  gets a heading. Initialize `prevFrom = null` at the start so the first message
  always gets a heading.
- The blank-line separator between turns already exists (the trailing
  `parts.push('')` per iteration). When we omit the heading on 2nd-Nth in a run,
  the rendered output becomes `<body of N-1>` `<blank>` `<body of N>` `<blank>`,
  which is the desired "blank line between messages" layout.
- Trailing-newline normalization (`out.replace(/\n+$/, '') + '\n'`) is
  unaffected.
- Tests to add (per Test plan #1-6). The existing "## rollover" three-day test
  (#168-180) already pins date-header counts; need to add a "## rollover same
  author" assertion for #4.
- Edge cases verified:
  - First message of input: `prevFrom` is `null`, so heading emits. Good.
  - Author change mid-day: `prevFrom !== m.from`, heading emits. Good.
  - Same author after `##` rollover: we set `prevFrom = null` after the rollover
    push, so the next iteration sees `prevFrom === null` and emits a heading.
    Good.
  - Names-only (no day header emitted): same-author run never resets `prevFrom`,
    so subsequent messages skip the heading. Good.
