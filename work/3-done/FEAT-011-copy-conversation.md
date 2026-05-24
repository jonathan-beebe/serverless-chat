# FEAT-011: Copy the chat transcript to the clipboard as markdown, with a toggle for date headers and per-message timestamps

**Status:** Resolved **Type:** Feature **Area:** `src/components/Chat.tsx`, new
`src/core/transcript.ts` + tests, possible small extraction of the CopyBox
clipboard fallback into a shared helper

## Summary

Add a **Copy** button + adjacent **"Include timestamps"** toggle to the chat
surface. Clicking Copy writes the entire current transcript to the clipboard as
markdown. The toggle controls whether the output includes the `#` / `##` date
headers and the `**Name** · time` lines, or just bold names with bodies.

Reuses the existing FEAT-006 timestamp data (`ChatMessage.at`) — no
wire-protocol change, no schema change.

## Format — toggle ON (timestamps + date headers)

```
# Thursday, May 23, 2026

**You** · 3:42 PM
Hey! Did you finish the report?

**Them** · 3:44 PM
Almost done. Just polishing the conclusion.

Should have it by 5pm.

**You** · 3:45 PM
Perfect, thanks!

## Friday, May 24, 2026

**Them** · 9:15 AM
Sent it over. Let me know what you think.
```

Rules:

- `#` header is the conversation start date in locale-full form (e.g.
  `Thursday, May 23, 2026` on en-US, `Freitag, 23. Mai 2026` on de-DE). Format
  via `new Intl.DateTimeFormat(undefined, { dateStyle: 'full' })`.
- `##` subheader inserted before the first message of each new local-calendar
  day. Skip entirely if the whole transcript is same-day.
- Each turn: `**You** · {time}` or `**Them** · {time}` on its own line, then
  message body on the next line(s).
- Middle dot is U+00B7 (`·`) with a space on each side. Literal character, not
  the entity.
- Time format follows the existing chat UI:
  `new Intl.DateTimeFormat(undefined, { timeStyle: 'short' })` (en-US →
  `3:42 PM`, en-GB / de-DE → `15:42`). Matching the rendered bubble time keeps
  the copy congruent with what the user is reading on screen.
- Multi-paragraph message body (i.e. the user pressed Shift+Enter and then
  sent): preserve as hard line breaks. Implementation detail in "Notes for the
  implementer."
- Blank line between turns; blank line after each `#` / `##` header.

## Format — toggle OFF (just names + bodies)

```
**You**
Hey! Did you finish the report?

**Them**
Almost done. Just polishing the conclusion.

Should have it by 5pm.

**You**
Perfect, thanks!
```

Rules:

- No `#` or `##` date headers anywhere.
- Each turn: bold name on its own line, message body on the next line(s).
- Blank line between turns.
- Multi-paragraph bodies preserved the same way.

## Customer value

- **A working "save my chat" affordance.** Today the only way to preserve a
  conversation is screenshots or hand-selecting text in the transcript and
  copying — which gives them an ugly inline blob with bubble alignment lost and
  timestamps mashed into the message text. A single-click copy that produces
  clean, pasteable markdown is a meaningful quality-of-life upgrade.
- **Clean output that pastes into anything sensible.** The format renders well
  in GitHub issues, Notion, Obsidian, Discord, Slack, and any plain-text editor.
  The user's choice of `**bold name**` + middle dot follows widely-recognized
  chat conventions.
- **Choice over verbosity.** When pasting into a casual chat, the timestamps are
  noise; when archiving for reference, they're load-bearing. A single toggle
  covers both modes without burying either behind a menu.

## Business value

- **Trivial, high-perceived-value polish.** Implementation is small (one
  component change + a pure formatter), but the feature is the kind of thing
  users notice and remember. Pairs well with the product's "no accounts, no
  servers" pitch — _your_ conversation, in _your_ clipboard, in your hands.
- **Sets up future export paths.** Once a pure formatter exists, follow-up
  tickets ("download as .md", "share via mailto", "paste into a
  Claude-compatible transcript loader") are trivial extensions.

## What a working feature delivers

When two peers are connected and have exchanged messages:

1. A small **toolbar row** appears above the transcript in `Chat.tsx`,
   containing:
   - An **"Include timestamps"** checkbox/toggle (default: checked).
   - A **Copy** button.
2. Clicking **Copy** writes the entire current `messages` array to the clipboard
   as markdown, formatted per the rules above (with or without timestamps
   depending on the toggle).
3. A short **"Copied!" badge** appears next to the button for ~1500 ms (same
   Callout pattern as `CopyBox`).
4. A **live-region announcement** ("Transcript copied to clipboard") fires for
   assistive tech, same pattern as `CopyBox`.
5. If the async clipboard API fails (HTTP context, sandboxed iframe, permission
   denied), the implementation falls back to selecting the rendered markdown in
   a hidden textarea and using `document.execCommand('copy')`. If both fail, a
   brief "Press Ctrl+C / Cmd+C to copy" hint appears next to the button — but
   the chat itself is unaffected.
6. When the transcript is empty (zero messages), the Copy button is
   **disabled**. The toggle remains operable so the user can pre-set their
   preference before the conversation starts.
7. The toggle state persists within the session (a `useState` on `Chat`). It
   does **not** persist across reloads — matches the rest of the app's "no
   localStorage" stance.

## Acceptance criteria

### Formatter — pure module

1. **`src/core/transcript.ts`** exports a pure function:
   ```ts
   formatTranscript(messages: ChatMessage[], opts: { includeTimestamps: boolean }): string
   ```
   No DOM access, no `Date.now()` reads, no globals beyond
   `Intl.DateTimeFormat(undefined, …)`. Deterministic for a given input +
   locale.
2. **Authorship labels.** `from: 'me'` → `**You**`. `from: 'them'` → `**Them**`.
   Hardcoded — the app has no per-user name concept, and the labels match the
   existing A11Y-004 `sr-only` "You said:" / "They said:" announcements.
3. **`includeTimestamps: true` output** matches the rules in the "Format —
   toggle ON" section above:
   - First line is `# {locale-full date of first message}`, followed by a blank
     line.
   - Inline date rollovers produce a `## {locale-full date}` heading flanked by
     blank lines.
   - If the whole transcript is same-day, no `##` rollover headings are emitted
     (only the opening `#`).
   - Each turn renders as `**{Name}** · {locale-short time}\n{body}` followed by
     a blank line.
4. **`includeTimestamps: false` output** matches the rules in the "Format —
   toggle OFF" section above:
   - No `#` or `##` headers anywhere — output starts directly with the first
     `**Name**` line.
   - Each turn renders as `**{Name}**\n{body}` followed by a blank line.
5. **Day-rollover detection.** Same comparison used in `Chat.tsx`'s `buildItems`
   — `new Date(m.at).toDateString()` compared `!==` against the running
   last-day. (Don't re-implement; share the comparison if practical, or
   replicate it inline — local-calendar accuracy is what matters.)
6. **Body line-break handling.** A `\n` inside `m.text` (from a Shift+Enter in
   the composer per FEAT-004) is preserved as a markdown **hard line break** —
   render as `  \n` (two trailing spaces + newline) so markdown renderers treat
   it as an in-paragraph line break rather than swallowing it as a soft wrap. A
   literal `\n\n` (paragraph break) in `m.text` is passed through as `\n\n`.
   Either way, the next `**Name**` line still unambiguously marks the turn
   boundary.
7. **Empty-input behavior.** `formatTranscript([], …)` returns an empty string
   (not a header, not whitespace). The caller is expected to disable the Copy
   button in this state, but the formatter handles it defensively.
8. **Trailing newline.** Output ends with a single newline (POSIX file
   convention). No trailing blank lines, no trailing whitespace.
9. **Middle dot is the literal U+00B7 character**, with a regular space on each
   side. Not `&middot;`, not `&#183;`. Source-code spelling: `·` or the literal
   character in a UTF-8 source file.

### UI — copy toolbar in `Chat.tsx`

10. **Toolbar placement.** A new `<div>` rendered as the first child of the
    existing `flex h-full flex-col gap-3` root, above the `<ol>` transcript.
    Right-aligned (`justify-end`) with the toggle on the left and the button on
    the right.
11. **Toggle control.** A standard `<input type="checkbox">` with a visible
    `<label>` reading "Include timestamps", `aria-describedby`-linked to a small
    `sr-only` hint that explains the effect. Default `defaultChecked={true}`.
    Stored as `useState<boolean>`.
12. **Copy button.** Uses the existing `<Button>` primitive with
    `variant="primary"` and `size="md"` (matching `CopyBox`). Label: `Copy` when
    idle. Disabled (`disabled={messages.length === 0}`) when the transcript is
    empty.
13. **"Copied!" feedback.** When the clipboard write succeeds, render the same
    `<Callout variant="success" aria-hidden="true">Copied!</Callout>` pill next
    to the button for 1500 ms, identical to `CopyBox`. Use a `setTimeout`
    cleared on unmount.
14. **Manual-copy fallback.** Same two-tier fallback as `CopyBox`:
    - First try `navigator.clipboard.writeText(markdown)`.
    - If that throws or rejects, render the markdown into a hidden `<textarea>`,
      `select()` it, and call `document.execCommand('copy')`.
    - If both fail, surface a
      `<Callout variant="warning">Press Ctrl+C / Cmd+C to copy</Callout>` next
      to the button and leave the (now-selected) hidden textarea focused so a
      single keystroke completes the copy.
15. **Live-region announcement.** Use the existing `<LiveRegion>` component to
    announce `Transcript copied to clipboard` on success and
    `Transcript selected. Press Control C or Command C to copy.` on fallback.
    Identical pattern to `CopyBox`.
16. **Focus behavior on copy.** After a successful clipboard write, focus
    returns to the message composer textarea (via the existing `composerRef`).
    Rationale: parallel to the FEAT-002 "keep input focused" principle — the
    Copy action is incidental, the composer is the user's primary surface.
17. **Toolbar layout stability.** The Copy button's enable/disable transition
    (empty → first message arriving) must not shift the transcript or the
    composer. Reserve the badge slot with a fixed-width inline container so the
    "Copied!" appearing/disappearing doesn't cause horizontal layout jitter.

### Accessibility

18. **Toggle and button are reachable via Tab** in keyboard reading order
    _before_ the transcript (because they appear above it in the DOM). The
    toggle is a real `<input type="checkbox">` with a real `<label>`. The button
    uses the existing `<Button>` primitive (already keyboard-accessible).
19. **The hidden fallback textarea** is `aria-hidden="true"` and positioned
    offscreen (`sr-only`-style or `position: absolute; left: -9999px`) so it
    doesn't appear in tab order or visual layout. Only focused programmatically
    in the fallback path.
20. **The "Copied!" badge** is `aria-hidden="true"` — assistive tech learns
    about the success via the LiveRegion announcement, not via a duplicate
    role="status" inside the badge.
21. **Toggle change** does not produce a polite live-region announcement on its
    own (no copy has occurred yet); the toggle's visible state change is
    sufficient feedback.

### Quality

22. **Tests for `src/core/transcript.ts`** (new file
    `src/core/transcript.test.ts`):
    - With `includeTimestamps: true`:
      - Single same-day conversation → one `#` header at top, no `##` headers.
      - Multi-day conversation → `#` opening + a `##` header before the first
        message of each subsequent day.
      - Each turn line follows `**You** · {time}` or `**Them** · {time}`.
      - Middle dot is the literal U+00B7 character (assert by codepoint or by
        hex regex).
      - Trailing newline present; no trailing whitespace.
    - With `includeTimestamps: false`:
      - No `#`/`##` headers anywhere.
      - Each turn is `**Name**\n{body}`.
      - Multi-day input produces identical output to single-day input (modulo
        bodies) — date data is fully suppressed.
    - Body handling:
      - `\n` inside `m.text` becomes `  \n` (markdown hard break).
      - `\n\n` inside `m.text` is preserved verbatim.
      - Long single-line bodies pass through unchanged.
    - Empty input → empty string.
    - Locale stability: tests construct `Intl.DateTimeFormat` with explicit
      locale args or assert via substring shapes (`/\d{1,2}:\d{2}/`, `/2026/`)
      so CI passes regardless of host locale.
23. **Tests for the UI in `Chat.test.tsx`**:
    - Copy toolbar renders with checkbox + button.
    - Checkbox defaults to checked.
    - Button is disabled when `messages.length === 0`, enabled with ≥1 message.
    - Clicking Copy invokes `navigator.clipboard.writeText` with the result of
      `formatTranscript(messages, { includeTimestamps: true })` when the toggle
      is on.
    - Clicking Copy with the toggle off invokes `writeText` with
      `formatTranscript(messages, { includeTimestamps: false })`.
    - On successful copy, the "Copied!" badge appears, then disappears after
      ~1500 ms (use fake timers).
    - On `writeText` rejection, fallback path runs (mock `document.execCommand`
      to return `true`) and badge still appears.
    - On both paths failing, the warning callout renders.
    - Focus returns to the composer after a successful copy.
    - Existing tests (auto-scroll, sr-only prefixes, FEAT-006 date headers +
      per-bubble times, FEAT-004 textarea behavior) all continue to pass.
24. **`npm run lint`, `npm run typecheck`, `npm run test` pass.**

## Out of scope (v1)

- **Custom participant names.** Hardcoded **You** / **Them** in v1. A "Set your
  name" affordance is a possible follow-up — but the app currently has no name
  concept anywhere, so introducing one starts with that surface, not with the
  copy feature.
- **Download as `.md` file.** Clipboard only in v1. A "Download" button is a
  one-line addition using the existing formatter
  (`new Blob([markdown], { type: 'text/markdown' })` + an anchor click), but
  it's a separate UX surface and not what the user asked for.
- **Sharing via `navigator.share` or `mailto:`.** Same reasoning — uses the same
  formatter, but a separate UX surface.
- **Partial-range copy** ("copy just the last N messages", "copy the selected
  range"). The whole transcript only.
- **Format selection beyond timestamps on/off.** No "include markdown / plain
  text only", no "include date headers but not per-message times", no "include
  sender clocks vs receiver clocks". Two formats only.
- **Persisting the toggle preference across reloads.** Lives in component state
  for the session. localStorage is consistent with the rest of the app's stance
  — not used in v1.
- **Copying with attached metadata** (session ID, peer connection info, network
  telemetry from FEAT-010). The copy is _the conversation_, not a debug bundle.
  The `#network` diagnostic page from FEAT-010 is the surface for that.
- **Internationalizing the bold labels** (e.g. **Du** / **Sie** for de-DE). The
  labels stay English — they match the English `sr-only` prefixes from A11Y-004.
  If/when those get internationalized, this ticket follows.
- **Sanitizing markdown-special characters in message text.** If a user types
  `**hello**` it'll render as bold when the markdown is pasted into a renderer.
  Accept this — the input is already markdown-flavored on the composer side (no
  escaping done there either), and pre-escaping makes the plain-text output
  noisy.
- **A "preview" of the copy output.** The toggle's effect is visible the next
  time the user pastes; no in-app preview pane.

## Open questions

- **Time format: locale-driven (matches the UI) or hardcoded en-US `h:mm AM/PM`
  (matches the spec the user wrote)?** The user's example markdown uses
  `3:42 PM` (en-US 12-hour). The existing chat UI uses
  `Intl.DateTimeFormat(undefined, { timeStyle: 'short' })` per FEAT-006, which
  is locale-driven (en-GB / de-DE / fr-FR users see 24-hour times in their
  bubbles). Two viable answers:
  - **(a) Locale-driven** (recommended): copy mirrors what the user sees on
    screen. A de-DE user sees `15:42` in both the bubble and the copy.
  - **(b) Hardcoded en-US**: copy is always `3:42 PM` regardless of locale.
    Predictable across recipients but inconsistent with the rendered UI.
  - **Recommendation: (a)** — the copy is for the _user_ in front of the screen,
    and they expect the times in the copy to match the times they were reading.
    If a future use case calls for cross-locale-stable output, add an explicit
    "format options" surface then.

- **Date format in `#` / `##` headers: same locale-driven question.** Recommend
  the same answer — `Intl.DateTimeFormat(undefined, { dateStyle: 'full' })`,
  matching the FEAT-006 in-bubble date row. en-US gets `Thursday, May 23, 2026`,
  de-DE gets `Donnerstag, 23. Mai 2026`.

- **Where exactly does the toolbar sit?** Three reasonable placements:
  - **(a) Above the transcript, inside `Chat.tsx`** (recommended). Always
    visible, easy to find, doesn't grow the parent screens.
  - **(b) In the Offerer/Joiner screen header** (next to the page title).
    Cleaner for the chat surface itself, but duplicated wiring in two screens.
  - **(c) Floating in the corner of the transcript scroll container.**
    Overengineered for the small button it is.
  - **Recommendation: (a)**.

- **Toggle as a checkbox or a switch?** Checkbox is the most accessible,
  framework-free option (native `<input type="checkbox">` works everywhere,
  screen readers handle it correctly, no extra primitive). A "switch" would need
  a new design-system primitive. Recommendation: checkbox.

- **Default for the toggle: ON or OFF?** Recommend **ON** — matches the visible
  UI (timestamps are rendered in every bubble) and the longer format is more
  useful as the default for archival. A user pasting into a chat will untoggle
  once and the session-state preference holds.

- **Should single newlines (`\n`) in message text become markdown hard breaks
  (`  \n`) or paragraph breaks (`\n\n`)?** FEAT-004 lets users press Shift+Enter
  to insert a single `\n` — and these render as line breaks in the bubble via
  `whitespace-pre-wrap`. In raw markdown a single `\n` is a soft break and
  collapses to a space in most renderers, which loses fidelity. Two options:
  - **(a) Hard break: `  \n`** (recommended) — single newlines stay as single
    newlines after rendering. Most faithful to the on-screen bubble.
  - **(b) Paragraph break: `\n\n`** — visually bigger gap than the user typed.
    Simpler to write but distorts intent.
  - **Recommendation: (a)**.

- **No timezone annotation in the header — confirm.** Every `ChatMessage.at` in
  the app is `Date.now()` on the _receiver's_ machine (FEAT-006 notes this
  explicitly), and FEAT-010 commits to keeping the displayed timestamp as the
  receiver's local clock. So every time in the transcript is in the copier's
  single local timezone — no cross-zone ambiguity to disclose. Recommendation:
  no TZ annotation. Revisit only if a future ticket starts rendering
  sender-clock times in the visible bubble (FEAT-010 explicitly does not).

## Notes for the implementer

- **Order of work:**
  1. Write `src/core/transcript.ts` + `src/core/transcript.test.ts` first.
     Pure-function, fast to test, no DOM, no clipboard mocks. Get this exactly
     right before touching the UI.
  2. Add the toolbar row to `Chat.tsx`. Wire the checkbox state, the button
     onClick, and the formatter call.
  3. Implement the clipboard write + fallback. Strong candidate for extracting
     `CopyBox`'s `onCopy` body into a shared `src/core/clipboard.ts` helper that
     both components use — same two-tier fallback, same flash-copied pattern.
     Don't grow `CopyBox`'s API; the helper just becomes its implementation.
  4. Wire the LiveRegion announcement and the "Copied!" badge. Mirror `CopyBox`
     exactly.
  5. Tests in `Chat.test.tsx` for the new UI.

- **Don't duplicate the day-rollover logic.** `Chat.tsx`'s `buildItems` already
  walks `messages` and emits date items at day boundaries. The formatter's walk
  is the same shape — consider exporting a small
  `walkTranscript(messages, { onDate, onMessage })` helper from `transcript.ts`
  and having `Chat.tsx` consume it for its `buildItems`. Optional refactor; only
  do it if the duplication ends up obviously parallel. If it's awkward, just
  replicate the comparison — six lines duplicated is not a crisis.

- **Reuse `<Divider>` only where divider is the visual.** The markdown formatter
  doesn't render — it produces text. Don't import `<Divider>` for this; the `#`
  / `##` headings are the chrome.

- **`navigator.clipboard.writeText` may throw synchronously OR reject — wrap in
  `try/await/catch`.** The `CopyBox` implementation handles both paths
  correctly; copy that pattern.

- **Hidden fallback textarea**: render it inside the toolbar `<div>` but
  visually offscreen. Keep it always-present (not conditionally rendered) so the
  ref is stable across the lifecycle of the copy action. Set its `value` to the
  formatted markdown right before falling back to `execCommand('copy')` — don't
  keep it in sync on every keystroke or every message arrival; that's wasted
  work.

- **Don't keep the formatted markdown in React state.** Compute it lazily inside
  the click handler. The transcript can be long; recomputing on every render is
  wasteful for a value that's only needed on click.

- **Locale-stable tests.** Same approach as FEAT-006: either pass an explicit
  locale to `Intl.DateTimeFormat` in tests, or assert on substring shapes
  (`/\d{1,2}:\d{2}/`, `/2026/`, `/You/`, `/Them/`). Avoid asserting on
  full-locale exact strings.

- **The `m.id`-based React key on bubbles** is unchanged. The formatter never
  touches `id`.

- **CR / LF endings.** Use `\n` only. Don't emit `\r\n` even on Windows — the
  clipboard layer normalizes, and `\n` is portable.

- **Sanity-check the U+00B7 character on copy.** Write the dot as a literal `·`
  in source code, not `·`, for readability — but verify it survives source-file
  UTF-8 → JS string → clipboard intact. If the build/test toolchain ever
  surprises us here, fall back to `·` in source. (Vite + Vitest + TypeScript all
  handle BMP characters cleanly today; this is belt-and-braces.)

## Coordination with prior tickets

- **FEAT-002 (keep input focused):** the new toolbar adds a new tab stop above
  the transcript. The composer-focus principle still holds — after a successful
  copy, focus returns to the composer (AC #16).
- **FEAT-004 (multi-line composer):** Shift+Enter line breaks in `m.text` need
  the markdown hard-break treatment (AC #6, open question).
- **FEAT-006 (chat timestamps):** the copy reuses `m.at` and the same
  locale-driven formatters. The visible bubble timestamp and the copied
  per-message timestamp will agree by construction. The `#` / `##` headers use
  the same `dateStyle: 'full'` formatter as the in-transcript date row.
- **FEAT-007 (design system):** the toolbar uses existing `<Button>` and
  `<Callout>` primitives. The toggle is a native checkbox with a real `<label>`
  — no new primitive introduced in this ticket. If "switch" eventually becomes a
  design-system primitive in a separate ticket, swap the checkbox for it then.
- **FEAT-008 (polite peer):** no interaction — the copy button is on the chat
  surface, which only renders once a session is `connected` or `closed`. The
  polite-peer flow happens before that.
- **FEAT-009 (stone palette):** any new UI introduced here (the toolbar row, the
  warning Callout) uses `stone-*` for neutral grays. If this ticket lands before
  FEAT-009 merges, write `slate-*` and FEAT-009 will sweep it; if FEAT-009 lands
  first, write `stone-*` directly.
- **FEAT-010 (network telemetry):** unrelated surfaces. The copy operation is
  local-only and writes only `m.text`, `m.from`, and `m.at` — never any
  envelope/telemetry data. Network diagnostics live in `#network`, not in the
  clipboard.
- **A11Y-004 (sr-only authorship prefixes):** the **You** / **Them** labels in
  the markdown match the existing `sr-only` "You said:" / "They said:" speech
  announcements, preserving a single source of truth for "what we call each
  speaker." If A11Y-004 is ever internationalized (German "Du sagtest:" / "Sie
  sagten:" etc.), the copy labels should follow in lockstep.

## Working notes

- Wrote `src/core/transcript.ts` first (pure, no DOM, locale-driven) plus
  `src/core/transcript.test.ts` covering: same-day → single `#` header;
  multi-day → `##` rollovers; `**You**` / `**Them**` labels; literal U+00B7
  middle dot; single `\n` body → markdown hard break (`  \n`); `\n\n` paragraph
  break passthrough; empty input → empty string; trailing newline; toggle-off
  path suppresses all date data.
- Added the toolbar to `Chat.tsx`: `<input type="checkbox">` ("Include
  timestamps", default checked, sr-only describedby hint),
  `<Button>Copy</Button>` (disabled when messages empty),
  `<Callout variant="success" aria-hidden>` "Copied!" pill in a fixed-width
  slot, hidden offscreen `<textarea>` for the legacy fallback, and a
  `<LiveRegion>` for AT announcements.
- Two-tier clipboard: `navigator.clipboard.writeText` first, then
  hidden-textarea + `document.execCommand('copy')`, then a
  `<Callout variant="warning">Press Ctrl+C / Cmd+C to copy</Callout>` if both
  fail. Mirrors `CopyBox`.
- Auto-dismiss of the "Copied!" badge after 1500 ms via `setTimeout`, cleared on
  unmount (FEAT-011 AC #13). Note: this deviates from the post-A11Y-020
  `CopyBox` policy (no wall-clock dismissal). The ticket explicitly mandates the
  timer; AT path is the LiveRegion (badge is `aria-hidden`), so the sighted-only
  auto-dismiss doesn't violate WCAG 2.2.1 the way the prior CopyBox `aria-live`
  confirmation did. If a future a11y sweep wants to remove this, the LiveRegion
  already carries the load.
- After a successful copy, focus returns to the composer via
  `composerRef.current?.focus({ preventScroll: true })`, parallel to FEAT-002.
- Did not extract a shared `src/core/clipboard.ts` helper — `CopyBox` and `Chat`
  have meaningfully different surfaces (CopyBox has a visible textarea bound to
  the copied value; Chat has a hidden offscreen one bound at click-time). The
  duplication is ~25 lines of similar shape; extracting now would force one or
  the other into the wrong abstraction. Left as a possible follow-up.
- All 249 tests pass (16 new in `transcript.test.ts`, 12 new in the
  `Chat copy-transcript toolbar (FEAT-011)` describe block). `npm run lint`,
  `npm run typecheck`, `npm run build` all clean.
