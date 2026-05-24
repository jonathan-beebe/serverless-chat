# A11Y-018: Chat transcript uses `aria-live="polite"` on an `<ol>` instead of `role="log"`

**Status:** Open **WCAG:**

- 4.1.2 Name, Role, Value — Level A
- 4.1.3 Status Messages — Level AA (ARIA Authoring Practices guidance for chat /
  IM / log surfaces)

**Severity:** High — every message in the chat flows through this region; the
wrong role and the live-region noise it picks up (date dividers, empty-state
placeholder, full bubble subtree) affect every screen-reader user of the chat
for the entire session.

**Location:**

- `src/components/Chat.tsx` lines 115-120 — the `<ol>` itself:
  ```tsx
  <ol
    ref={transcriptRef}
    onScroll={onScroll}
    aria-label="Chat transcript"
    aria-live="polite"
    className="flex-1 space-y-2 overflow-y-auto rounded-md border border-slate-300 bg-white/50 p-3 dark:border-slate-700 dark:bg-slate-900/50">
  ```
- `src/components/Chat.tsx` lines 121-123 — the empty-state `<li>` rendered
  _inside_ the live region:
  ```tsx
  {
    messages.length === 0 && (
      <li className="text-sm text-slate-600 dark:text-slate-400">
        No messages yet. Say hello.
      </li>
    )
  }
  ```
- `src/components/Chat.tsx` lines 124-134 — the date-divider
  `<li aria-hidden="true">` rendered as a sibling of message items inside the
  same live region:
  ```tsx
  return (
    <li
      key={item.key}
      aria-hidden="true"
      data-testid="date-header"
      className="py-1">
      <Divider>
        <time dateTime={item.date.toISOString().slice(0, 10)}>
          {dateFmt.format(item.date)}
        </time>
      </Divider>
    </li>
  )
  ```
- `src/components/Chat.tsx` lines 138-160 — the message `<li>` whose
  `<time aria-hidden="true">` (lines 150-157) sits in the same subtree the SR
  may re-read.

**Related (resolved) tickets — read first:**

- `__local__/work/accessibility/resolved/A11Y-004-chat-sender-visual-only.md` —
  added the `sr-only` "You said:" / "They said:" prefix to each message `<li>`.
  That prefix is read out via the same live region this ticket targets, so the
  fix must preserve it.
- `__local__/work/accessibility/resolved/A11Y-008-aria-live-on-copy-button.md` —
  established the project rule: `aria-live` belongs on a dedicated, persistent,
  sibling status node, not on the element that produces the change.
- `__local__/work/accessibility/resolved/A11Y-012-connection-state-not-announced.md`
  — introduced the persistent `LiveRegion` (`role="status" aria-live="polite"`)
  for _connection_ state. That region and a `role="log"` for the chat transcript
  compose cleanly: `status` for ephemeral session state, `log` for the
  historical message stream.

## Problem

The chat transcript is a chronologically-appended list of messages — exactly the
use case ARIA defines `role="log"` for. The current implementation puts
`aria-live="polite"` directly on an `<ol>`, which is semantically wrong and
produces several conformance and UX issues.

### 1. Wrong role exposed to AT (4.1.2)

Screen readers expose the `<ol>` as a _list_ with N items, not as a _log_.
Implications:

- Users who navigate by role/landmark (NVDA "R" key, JAWS region nav, VoiceOver
  rotor) cannot jump to the chat as a "log" surface, because no element
  advertises itself with that role. They will only find a generic "list".
- Tools that scan a page for log/feed structures (browser extensions,
  automation, accessibility tree dumps) will not recognize this region as a
  chat.
- The list semantics implicitly announce a count ("list, 2 items") on initial
  focus, which is meaningful for, say, a navigation list but is meaningless and
  noisy for a streaming message log.

WCAG 4.1.2 requires that the role of a component match the pattern it
implements; ARIA Authoring Practices explicitly recommends `role="log"` for chat
/ IM / status-history surfaces. `role="log"` already implies
`aria-live="polite"`, `aria-atomic="false"`, and `aria-relevant="additions"` —
which is exactly the desired behavior, and the right _typed_ signal for AT to
specialize on (some screen readers throttle / batch / prefix log announcements
differently from a generic polite region).

### 2. Excessive / spurious announcements (4.1.3)

The `<ol>` currently contains **three** kinds of children, _all_ of which are
part of the live region:

- **Empty-state `<li>`** (line 121-123): `"No messages yet. Say hello."` This is
  rendered as a _child of the live region_. As soon as the first message
  arrives, the empty-state `<li>` is removed and the first message `<li>` is
  added — both mutations occur inside a polite live region in the same tick.
  NVDA + JAWS both announce additions to polite regions; the removal vs addition
  handling is implementation-dependent. At minimum the first message arrival
  produces an inconsistent announcement experience; at worst the placeholder
  text is re-announced as it leaves.

- **Date-divider `<li aria-hidden="true">`** (line 124-134). The inline comment
  on line 126-127 explicitly states this is "Chrome, not content. `aria-hidden`
  keeps the polite live region from announcing day rollovers as if they were
  messages." That assumption is wrong in practice:
  - `aria-hidden` on a node inside a live region does **not** reliably suppress
    live-region announcements in all screen readers. The live region tracks
    subtree mutations; `aria-hidden` is a tree-pruning hint for the
    accessibility tree, not a mutation-observer filter. JAWS in particular is
    known to still announce additions to a live region even when the added node
    is `aria-hidden`.
  - Even when SRs _do_ skip the hidden node text, they may still announce the
    structural change ("list now has 3 items") or emit a brief jitter on the
    announcement queue.
  - The `Chat.test.tsx` test at lines 319-331 already locks in the _current_
    (broken) approach, asserting that the date `<li>` and bubble `<time>` carry
    `aria-hidden="true"` and treating that as sufficient for "live-region
    updates stay quiet." That assumption needs to be revisited as part of the
    fix — see "Test updates" below.

- **Message `<li>` with a nested `<time aria-hidden="true">`** (lines 138-160).
  Because the live region is on the parent `<ol>`, when an `<li>` is inserted
  the SR may compute the announcement text from the entire newly-inserted
  subtree. SRs differ on whether `aria-hidden` _descendants_ are excluded from a
  live-region read:
  - VoiceOver tends to honor `aria-hidden` on descendants.
  - NVDA mostly honors it but has shipped bugs where the full subtree text is
    read.
  - JAWS has shipped behavior in both directions across versions. Behavior is
    per-SR / per-version and not something we should be depending on.

### 3. `<ol>` + raw `aria-live` is not a documented pattern

WAI-ARIA Authoring Practices 1.2 documents `role="log"` (with implicit
`aria-live="polite"`, `aria-atomic="false"`, `aria-relevant="additions"`) for
exactly this scenario. Mixing a list element with a raw `aria-live` attribute is
non-idiomatic, depends on per-SR implementation, and forfeits the typed-role
specialization log regions can get.

### 4. The right composition with the existing `LiveRegion`

A11Y-012 (resolved) introduced `src/components/LiveRegion.tsx` — a
`<p role="status" aria-live="polite" className="sr-only">` — for _connection_
state announcements ("Preparing your invite.", "Connected. You can start
chatting."). That `role="status"` is the right tool for ephemeral session state.

The chat transcript needs a parallel but **distinct** channel: a `role="log"`
surface for historical message additions. The two surfaces have different
semantics and can both be present without conflict — `status` is "current
state", `log` is "history of additions". AT users will benefit from the role
distinction (status messages preempt log messages on many screen readers'
announcement queues).

## Intended behavior

A screen-reader user joining a live chat should:

1. Be able to find the chat as a log/feed surface by role navigation (NVDA "R",
   VoiceOver rotor → "Logs", JAWS region nav).
2. Hear _only_ meaningful additions announced: "You said: hello", "They said: hi
   back". Specifically:
   - No "list 2 items" count noise on focus.
   - No date-divider text on day rollover.
   - No empty-state text announced on first-message arrival.
   - No re-reading of the per-bubble `<time>` text (which is decorative —
     sighted users see the timestamp, SR users get the live-region announcement
     and don't need it spelled out again).
3. Be able to navigate the prior message history with normal reading commands
   (arrow keys, virtual cursor) without the cursor being "trapped" in a live
   region.

## Suggested fix

### Step 1 — Swap `aria-live="polite"` for `role="log"` on the transcript container

In `src/components/Chat.tsx` lines 115-120:

```tsx
<ol
  ref={transcriptRef}
  onScroll={onScroll}
  aria-label="Chat transcript"
  role="log"
  aria-live="polite"        // keep explicit for older AT
  aria-relevant="additions" // explicit for older AT
  aria-atomic="false"        // explicit; matches log's implicit default
  className="flex-1 space-y-2 overflow-y-auto rounded-md border border-slate-300 bg-white/50 p-3 dark:border-slate-700 dark:bg-slate-900/50">
```

Notes:

- `role="log"` already implies `aria-live="polite"`,
  `aria-relevant="additions"`, `aria-atomic="false"` in the ARIA spec. Including
  them explicitly is a deliberate belt-and-braces for older AT that doesn't
  fully resolve implicit values; this matches the same pragmatic redundancy
  other AAA-conformant chat apps ship.
- `aria-label="Chat transcript"` stays so the log surface has a stable
  accessible name.
- Putting `role="log"` on the `<ol>` itself overrides the implicit `list` role.
  That's the desired semantic swap. If keeping the list semantics for sighted
  assistive tech matters (it probably doesn't — sighted users already see the
  bubbles visually), an alternative is to wrap the `<ol>` in a
  `<section role="log" aria-label="Chat transcript" aria-live="polite">` and
  drop the role override on the `<ol>`. The wrapper-vs-override choice is left
  to the implementer; the wrapper is the safer pattern. See "Implementation
  option B" below.

### Step 2 — Move the empty-state out of the live region

The empty-state placeholder must not sit _inside_ the log region — its insertion
and removal both create live-region noise. Two patterns work:

- **A (recommended).** Render the empty-state as a sibling above/below the
  `<ol>` (or instead of it), so it never enters the log surface. The list is
  created with zero `<li>` children when there are no messages; the empty-state
  copy lives in a non-live sibling node.

  ```tsx
  {messages.length === 0 ? (
    <p className="text-sm text-slate-600 dark:text-slate-400">No messages yet. Say hello.</p>
  ) : null}
  <ol role="log" …>
    {items.map(…)}
  </ol>
  ```

  (Flex layout will need a quick check — the current `<ol>` is the flex-1
  element; the sibling `<p>` should be either a peer that doesn't grow, or both
  should be wrapped in a `flex-1` container.)

- **B.** Keep the empty-state inside the `<ol>` but mark it `aria-hidden="true"`
  _and_ render it only on initial empty state (already the case). This is weaker
  than A because the _removal_ of the node when the first message arrives may
  still register as a mutation in some AT.

Prefer A.

### Step 3 — Pull date dividers out of the live region

The current `aria-hidden="true"` on the date `<li>` (line 129) is not a reliable
suppressor inside a live region (see Problem section). Options:

- **A (recommended).** Restructure the transcript so dates are non-live
  separators _between_ groups of messages, not children of the same `<ol>` that
  owns `role="log"`. For example, render a list of date-grouped `<ol>` blocks
  inside a wrapper `<div role="log">`:

  ```tsx
  <div
    role="log"
    aria-label="Chat transcript"
    aria-live="polite"
    aria-relevant="additions"
    aria-atomic="false"
    ref={transcriptRef}
    onScroll={onScroll}
    className="…">
    {groups.map((group) => (
      <Fragment key={group.day}>
        <div aria-hidden="true" className="py-1">
          <Divider>
            <time dateTime={group.date.toISOString().slice(0, 10)}>
              {dateFmt.format(group.date)}
            </time>
          </Divider>
        </div>
        <ol
          className="space-y-2"
          aria-label={`Messages from ${dateFmt.format(group.date)}`}>
          {group.messages.map(renderBubble)}
        </ol>
      </Fragment>
    ))}
  </div>
  ```

  Even though the date `<div>` is still _technically_ a descendant of the
  `role="log"`, in this shape the mutation that arrives on a day rollover is the
  insertion of a _whole group block_ (date + first message). With
  `aria-relevant="additions"` the live-region read should pick up the message
  subtree; the `aria-hidden` divider should be excluded. The reason this is
  better than the current shape: today, a day rollover produces _two_ discrete
  mutations (a date `<li>` insertion followed shortly by a message `<li>`
  insertion), each of which is its own announcement event. Grouping them into a
  single subtree insertion gives the SR one event to handle.

- **B (minimal change).** Keep dividers in the `<ol>` but add
  `role="presentation"` to the divider `<li>` in addition to
  `aria-hidden="true"`. `role="presentation"` removes the divider from the list
  count (so the SR doesn't say "list, 4 items" when 2 of them are dividers) and
  is the spec's documented way to neutralize a list item structurally. This
  still doesn't fully solve live-region mutation noise but it does fix the
  spurious count.

Prefer A for completeness; B is acceptable as an interim if the restructure is
too large for one ticket.

### Step 4 — Confirm the per-bubble `<time>` is not re-announced

The `<time aria-hidden="true">` on lines 150-157 sits inside the `<li>` that
gets inserted on each new message. Per the per-SR variability described above,
this is currently a gamble. With `role="log"` + `aria-relevant="additions"` and
the `<time>` continuing to carry `aria-hidden="true"`, the expectation is:

- VoiceOver: time text not announced (descendant `aria-hidden` honored).
- NVDA recent: time text not announced.
- JAWS recent: time text may still be read.

If JAWS reads the time inline, the announcement becomes "You said: hello five
thirty seven PM" — annoying but not incorrect. Acceptable for an interim. If the
verification step (below) reveals it as a problem, a follow-up ticket can move
the `<time>` out of the bubble subtree (e.g., into a separate
visually-positioned span outside the `<li>` via absolute positioning, or render
the `<time>` only into the DOM after the announcement window passes).

### Step 5 — Make sure the announced text is still the sr-only speaker prefix + message text only

Per A11Y-004 (resolved), each message `<li>` begins with a
`<span className="sr-only">{isMe ? 'You said: ' : 'They said: '}</span>` (line
141). That sr-only prefix **must remain** — the log announcement should be
exactly:

> "You said: hello world"

…and nothing else. The fix should preserve the prefix and ensure nothing in the
bubble subtree is announced _in addition to_ it.

### Implementation option B (wrapper instead of role-on-ol)

If overriding the `<ol>`'s implicit `list` role with `role="log"` feels too
aggressive (some teams prefer to keep native semantics intact for
testing-library `getByRole('list', …)` queries — note that `Chat.test.tsx` line
28 currently does exactly this), wrap the list:

```tsx
<div
  ref={transcriptRef}
  onScroll={onScroll}
  role="log"
  aria-label="Chat transcript"
  aria-live="polite"
  aria-relevant="additions"
  aria-atomic="false"
  className="flex-1 overflow-y-auto rounded-md border border-slate-300 bg-white/50 p-3 dark:border-slate-700 dark:bg-slate-900/50">
  {messages.length === 0 ? (
    <p className="text-sm text-slate-600 dark:text-slate-400">No messages yet. Say hello.</p>
  ) : (
    <ol className="space-y-2">
      {items.map(…)}
    </ol>
  )}
</div>
```

In this shape:

- The `<ol>` keeps its native list semantics for navigation.
- The `role="log"` is on the scroll container, which is the surface AT navigates
  to anyway.
- The empty-state is naturally a sibling of the `<ol>`, not a child.
- Date dividers can remain inside the `<ol>` (with `aria-hidden="true"` +
  `role="presentation"` per Step 3 option B) without changing the surrounding
  shape.
- The `transcriptRef`/`onScroll` move from the `<ol>` to the wrapper `<div>`
  (still the scroll container, so the existing auto-scroll logic at lines 59-71
  needs the scroll-metrics reads to come from the same element — keep them
  aligned).

This option is the most surgical. **It is the recommended implementation path**
unless the team specifically wants the role swap on the `<ol>`.

## Test updates

Several tests in `src/components/Chat.test.tsx` will need to be updated after
the fix:

- Line 28 — `getTranscript()` currently calls
  `screen.getByRole('list', { name: /chat transcript/i })`. With option B
  (wrapper), the `role="list"` query still finds the inner `<ol>`, but the
  `aria-label="Chat transcript"` moves to the wrapper. Either:
  - Change the helper to
    `screen.getByRole('log', { name: /chat transcript/i })`, OR
  - Add a `data-testid="chat-transcript"` to the wrapper and query by that.
- Lines 319-331 — the
  `marks date headers and per-bubble <time>s as aria-hidden so live-region updates stay quiet`
  test encodes the _current_ (broken) assumption. Replace with assertions that
  match the new model:
  - The wrapper has `role="log"`.
  - The wrapper carries `aria-label="Chat transcript"`, `aria-live="polite"`,
    `aria-relevant="additions"`, `aria-atomic="false"`.
  - Date dividers carry `aria-hidden="true"` AND (per Step 3 option B)
    `role="presentation"`.
  - The empty-state node is not a descendant of the `role="log"` wrapper when
    messages exist.
- Lines 243-254 — A11Y-004 attribution test
  (`includes a visually-hidden speaker prefix`) must continue to pass unchanged.
  The sr-only prefix is what carries the announcement; the fix must not regress
  it.
- Auto-scroll tests (lines 31-92) — they reference `transcript.scrollTop` /
  `scrollHeight`. If implementing option B, the scroll surface becomes the
  wrapper `<div>`, so `getTranscript()` should now resolve to that node. Update
  the helper consistently.

## Acceptance

- `src/components/Chat.tsx` no longer applies `aria-live="polite"` directly to
  an `<ol>`. The chat transcript advertises `role="log"` (either on the `<ol>`
  directly or on a wrapper, with the latter preferred per option B).
- `role="log"` element carries explicit `aria-label="Chat transcript"`,
  `aria-live="polite"`, `aria-relevant="additions"`, and `aria-atomic="false"`
  (the last two for older-AT robustness).
- The empty-state copy ("No messages yet. Say hello.") is rendered **outside**
  the `role="log"` subtree.
- Date dividers are either (a) outside the `role="log"` subtree, or (b) marked
  `aria-hidden="true"` _and_ `role="presentation"` so they don't contribute to
  the list count.
- The A11Y-004 sr-only speaker prefix (`"You said: "` / `"They said: "`)
  remains, and a new message announcement contains exactly that prefix + the
  message text — verified manually with NVDA + Firefox and VoiceOver + Safari at
  minimum.
- `Chat.test.tsx` updated:
  - Lookup helper resolves the new log surface (by `role="log"` and label, not
    `role="list"`).
  - The date-header / time aria-hidden test is replaced (not just edited) with
    assertions about the new structure.
  - All existing attribution, focus, Enter-handling, auto-scroll, date-rollover
    tests continue to pass.
- Manual SR verification (at minimum NVDA + VoiceOver) of the following:
  - Send a message → exactly one announcement, of the form `"You said: hello"`
    (or `"They said: …"`). No "list 2 items" preamble. No timestamp inline.
  - Cross a day boundary mid-conversation → the date-divider text is NOT
    announced. The first message on the new day is announced normally.
  - First message after an empty state → exactly one announcement (the message).
    The "No messages yet…" placeholder is not re-announced as it leaves.
  - Navigate to the chat via role navigation (NVDA "R") → the chat is reachable
    and announced as a log labeled "Chat transcript".
- A11Y-012's connection-state `LiveRegion` (`role="status"`) continues to
  function and is not double-announced by the new log region — they are distinct
  surfaces and should not conflict. Specifically, the "Connected. You can start
  chatting." status message and any chat-message log announcement that
  immediately follows do not stomp each other.
- `npm test`, `npm run lint`, `npm run typecheck` (or whichever the project
  uses; see existing CI) all clean.

## Working notes

- Verified the issue still exists in `src/components/Chat.tsx`: `<ol>` carries
  `aria-live="polite"` directly, empty-state `<li>` sits inside the live region,
  date dividers are `<li aria-hidden="true">` siblings of message `<li>` inside
  the same live region.
- Plan: implement Option B (wrapper `<div role="log">` around the `<ol>`):
  - Move `ref={transcriptRef}` (changed to `HTMLDivElement`), `onScroll`,
    `aria-label`, `aria-live="polite"`, `aria-relevant="additions"`,
    `aria-atomic="false"` onto the wrapper `<div>`.
  - Render the empty-state `<p>` as a child of the wrapper _but not inside the
    `<ol>`_, conditional on `messages.length === 0`. Since the empty-state's
    insertion happens once at first render and removal happens with the first
    message, mark it `aria-hidden="true"` as belt-and-braces so AT doesn't read
    it as a live-region addition during the initial paint or as a removal/jitter
    when messages first arrive.
  - Keep `<ol>` for native list semantics. Date dividers remain inside `<ol>`
    but get `role="presentation"` in addition to `aria-hidden="true"` so they
    don't contribute to the list count.
  - Per-bubble `<time aria-hidden="true">` stays as-is (acknowledged variance
    documented in ticket; acceptable for interim).
  - sr-only `"You said: " / "They said: "` prefix from A11Y-004 preserved.
- Test updates:
  - `getTranscript()` helper switched to query by `role="log"` + name
    `/chat transcript/i`. This is the wrapper `<div>` (also the scroll element).
  - Scroll/auto-scroll tests continue to operate on the same `getTranscript()`
    (now the wrapper) since `transcriptRef` moves to it; this matches
    `scrollHeight`/`scrollTop` usage.
  - The
    `marks date headers and per-bubble <time>s as aria-hidden so live-region updates stay quiet`
    test is replaced with assertions covering: (a) wrapper role=log + correct
    aria-\*, (b) `<ol>` is inside the log wrapper, (c) date `<li>` has
    `aria-hidden="true"` + `role="presentation"`, (d) bubble `<time>` keeps
    `aria-hidden="true"`, (e) empty-state is not a descendant of the log wrapper
    when messages exist (covered by inspecting both states).
  - A11Y-004 attribution test still uses `getTranscript()` — `textContent` of
    the wrapper transitively contains the `<ol>`'s text, so the assertion is
    unaffected.
