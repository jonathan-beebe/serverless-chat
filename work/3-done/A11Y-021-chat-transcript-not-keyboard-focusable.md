# A11Y-021: Chat transcript scrollable region is not keyboard-focusable; Firefox/Safari users cannot scroll history with the keyboard alone

**Status:** Resolved **WCAG:**

- 2.1.1 Keyboard — Level A
- 2.4.11 Focus Not Obscured (Minimum) — Level AA (WCAG 2.2, adjacent concern)

**Severity:** High — keyboard-only users on Firefox and Safari cannot access any
chat history that has scrolled out of the viewport. This is a Level A blocker
for a real and broad user population. It also blocks screen-magnifier users (who
navigate by keyboard so the magnifier follows focus) and switch / sip-and-puff
users (who use keyboard emulation). The defect is fully invisible to a developer
testing only in Chrome — Chromium's "Keyboard-focusable scroll containers"
feature (shipped in M126, mid-2024) silently auto-promotes scroll containers to
focusable, masking the bug.

**Location:** `src/components/Chat.tsx` lines 130-138 — the wrapper
`<div role="log">` that A11Y-018 introduced as the transcript surface. This
`<div>` is both the AT-exposed log region _and_ the scroll container (per the
A11Y-018 comment at lines 119-129, the wrapper consolidates those two roles
intentionally).

```tsx
// lines 130-138
<div
  ref={transcriptRef}
  onScroll={onScroll}
  role="log"
  aria-label="Chat transcript"
  aria-live="polite"
  aria-relevant="additions"
  aria-atomic="false"
  className="flex-1 overflow-y-auto rounded-md border border-slate-300 bg-white/50 p-3 dark:border-slate-700 dark:bg-slate-900/50">
```

The element is a scroll container (`overflow-y-auto`, `flex-1` inside a
`flex-col`) but it carries no `tabIndex={0}`, no other focusable affordance
inside it, and no programmatic focus path that would let a keyboard-only user
land inside it to scroll. `role="log"` is not a focusable role and does not
imply a tab stop.

> Note on the originally reported location: the issue was reported against the
> `<ol>` "around line 142" with `aria-live="polite"`. That shape is from before
> A11Y-018 landed. A11Y-018 (commit `fa9d48e`) moved the live-region attributes
> and the scroll container onto a wrapper `<div role="log">`, and the inner
> `<ol>` (now at line 144) is just a plain list with no ARIA. The
> keyboard-focusability defect transferred cleanly with that refactor — it now
> lives on the wrapper `<div>`, which is what this ticket targets.

## Problem

WCAG 2.1.1 (Keyboard, Level A) requires that **all functionality** be operable
through a keyboard interface. Reading prior chat messages **is functionality**:
the transcript stores user-visible content that, once scrolled off-screen, can
only be retrieved by scrolling the transcript back. If the only ways to scroll
the transcript are mouse wheel, touch, and trackpad gestures, a keyboard-only
user cannot reach content that has scrolled out of the viewport. That is a Level
A failure.

### Why this is a real bug despite Chrome appearing to work

- **Chrome M126 (mid-2024) shipped "Keyboard-focusable scroll containers."** On
  Chromium-based browsers, an `overflow:auto` element without a `tabindex`
  automatically becomes focusable and accepts Arrow / PageUp / PageDown / Home /
  End as scroll commands. This is a Chromium-only convenience layer. It masks
  the bug for any developer testing in Chrome / Edge / Brave / Arc.
- **Firefox has not shipped this.** As of 2026-05, Firefox keeps the legacy
  behavior: a plain `<div overflow:auto>` is not focusable. Arrow keys move the
  document's caret-browsing caret (or do nothing in default mode); PageUp /
  PageDown scroll the _document_, not the transcript.
- **Safari/WebKit has not shipped this.** Same story: the `<div>` is not
  focusable; arrow keys do not scroll the container.
- **The project's `README.md` describes the supported targets as evergreen
  browsers generally** (Chrome, Firefox, Safari, Edge). Firefox and Safari users
  are in scope; this is not a "we only support Chromium" project.

### Concrete failure scenarios

1. **Long-running chat, keyboard-only Firefox user.** User has been in a session
   for an hour. 30+ messages exist; the viewport fits ~8. They want to re-read
   an earlier message. They press Tab from the End-chat button in the header →
   focus lands on the composer textarea (skipping the transcript entirely
   because nothing in it is focusable). Tab again → focus lands on Send. Tab
   again → focus leaves the chat shell. There is no key combination that scrolls
   the transcript. The earlier messages are _visually_ present but
   _functionally_ inaccessible.
2. **Reconnect during an active conversation, keyboard-only Safari user.** Same
   shape — the auto-scroll-to-bottom on mount drops them at the latest message;
   the prior 22 are above the fold and unreachable.
3. **Screen-magnifier user (ZoomText / macOS Zoom / Windows Magnifier).**
   Magnifier viewports show a small fraction of the page; the magnifier's anchor
   point is typically the focused element or the caret. With no way to focus the
   transcript, the magnifier user cannot anchor the magnifier on the transcript
   and pan within it via keyboard — they must use a mouse to scroll, then chase
   the moving content with the magnifier separately. That is the exact
   double-input-modality cost WCAG 2.1.1 exists to prevent.
4. **Switch user (single-switch scanning, sip-and-puff, head-tracker with
   keyboard emulation).** The switch device cycles through focusable elements.
   The transcript is invisible to that cycle, so it is invisible to the user.
   They cannot read history.

### Why the existing `aria-live` / `role="log"` is not a substitute

- `aria-live="polite"` and `role="log"` announce _new additions_ to the
  transcript as they arrive. They do not allow re-reading older content. A
  screen-reader user can navigate the past with their AT's own browse mode (NVDA
  browse, JAWS virtual cursor, VoiceOver cursor), but **sighted** keyboard-only
  users have no equivalent affordance — and they are precisely the population
  this ticket is about.
- The blocked population here is **sighted keyboard-only users, screen-magnifier
  users, and switch users.** Screen-reader users are _not_ the affected
  population for this defect; they have their own mechanism for traversing the
  message list.

## Adjacent context (do **not** conflate scope)

- **A11Y-018 (resolved, in `resolved/`)** — moved the live-region attributes
  onto the wrapper `<div>` and added `role="log"`. That ticket addressed
  _exposure_ and _announcement_ semantics. This ticket addresses _keyboard
  reachability of the scroll viewport_. They are independent. A11Y-018's fix is
  already landed and this ticket builds on top of its DOM shape.
- **A11Y-017 (resolved, in `resolved/`)** — established the app's canonical
  focus-visible treatment:
  `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400`
  (plus `focus-visible:ring-offset-2` and ring-offset-color tokens where the
  surface contrast warrants it). This ticket adopts the same pattern for
  consistency.
- **A11Y-005 (resolved)** — `useFocusOnMount` already focuses the screen's
  `<h1>` on navigation. The new tab stop introduced by this ticket sits between
  the header content and the composer; it does not interfere with the on-mount
  heading focus.
- **A11Y-007 (resolved)** — focus indicators on textareas / inputs use the same
  `focus-visible:ring-2 focus-visible:ring-sky-400` pattern this ticket adopts.

This ticket explicitly does **not**:

- Change `role`, `aria-live`, `aria-relevant`, `aria-atomic`, or `aria-label` on
  the transcript wrapper (A11Y-018 is done; do not re-litigate).
- Touch the inner `<ol>` or any `<li>` inside it (date-divider `<li>`, message
  `<li>`, empty-state `<p>` sibling).
- Modify the composer / Send button / auto-focus behavior in `Chat.tsx`.

Scope is exactly: add `tabIndex={0}` to the transcript wrapper `<div>` at line
130 and add a focus-visible style consistent with the rest of the app.

## Intended behavior

The transcript should be a focusable scroll region. After the fix, a
keyboard-only user can:

1. **Tab to the transcript.** Adding `tabIndex={0}` inserts one tab stop in the
   natural source order — between whatever focusable elements precede the Chat
   component (e.g., the screen's "End chat" header button) and the composer
   textarea.
2. **Use Arrow Up / Arrow Down to scroll line-by-line.** This is native browser
   behavior on every engine once the scroll container is focused.
3. **Use PageUp / PageDown to scroll by viewport.** Native browser behavior on a
   focused scroll container.
4. **Use Home / End to jump to the first / last message.** Native browser
   behavior on a focused scroll container.
5. **See a visible focus indicator when the transcript has focus.** Matches the
   app pattern (`focus-visible:ring-2 focus-visible:ring-sky-400`), so the user
   can tell at a glance which element will receive their key presses.

Notes on interaction with existing behavior:

- **Initial focus on mount remains on the composer.** The `useEffect` at lines
  110-115 calls `composerRef.current?.focus({ preventScroll: true })` on mount
  and on disabled→enabled. Adding `tabIndex={0}` to the wrapper does not change
  that — the effect runs after render and explicitly focuses the composer.
- **The "don't steal focus" guard at lines 112-113
  (`if (active && active !== document.body) return`) already covers the case
  where a user has manually focused the transcript and then a `disabled` flip
  happens.** Once the transcript has focus, `document.activeElement` is the
  transcript, not `document.body`, so the auto-focus-the-composer effect bails
  out. No additional guard work needed.
- **Auto-scroll-to-latest continues to work.** `wasNearBottomRef` is updated
  from `onScroll` (lines 70-75). Arrow-key, PageDown, and End all fire native
  `scroll` events identical to wheel/touch input, so the "pinned-to-bottom"
  heuristic in the auto-scroll effect (lines 63-68) sees the same `scrollTop`
  deltas it always has.
- **`preventScroll: true`** on the composer-focus calls (lines 90 and 114) is
  preserved unchanged. It already prevents the composer-focus path from
  scrolling the transcript out from under the user; that property is unaffected
  by the wrapper becoming focusable.

## Suggested fix

Add `tabIndex={0}` to the wrapper `<div role="log">` at line 130, and add the
standard app focus-visible style to its `className`. The style additions match
the `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400`
pattern from A11Y-007 and A11Y-017.

```diff
  <div
    ref={transcriptRef}
    onScroll={onScroll}
    role="log"
    aria-label="Chat transcript"
    aria-live="polite"
    aria-relevant="additions"
    aria-atomic="false"
+   tabIndex={0}
-   className="flex-1 overflow-y-auto rounded-md border border-slate-300 bg-white/50 p-3 dark:border-slate-700 dark:bg-slate-900/50">
+   className="flex-1 overflow-y-auto rounded-md border border-slate-300 bg-white/50 p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 dark:border-slate-700 dark:bg-slate-900/50">
```

That is the entire code change for this ticket. Two added utility classes and
one new attribute.

### Why `tabIndex={0}` and not `tabIndex={-1}` plus a button

A `tabIndex={-1}` element is programmatically focusable but skipped by Tab. That
helps the magnifier-user case (you could `focusEl.focus()` from a button) but
does not help the keyboard-only user who has no such button. `tabIndex={0}`
makes the transcript a natural tab stop, which is what the failure scenarios
require. There is no need for a separate "Scroll transcript" button — the
wrapper itself becoming a tab stop _is_ the affordance.

### Why not just rely on the inner `<ol>` becoming focusable

`<ol>` has implicit list semantics. Adding `tabIndex={0}` to a `<ol>` makes the
entire list a single tab stop while still exposing list-item semantics to AT —
which is fine — but the **scroll container is the wrapper `<div>`, not the
`<ol>`**. Native scroll-by-keyboard behavior triggers on the focused element's
nearest scroll ancestor; if the focused element _is_ the scroll container, the
behavior is direct and predictable on every engine. Putting the tab stop on the
wrapper is the simplest model and keeps the AT-exposed log surface and the focus
target as the same element (matching the wrapper's existing dual
scroll-container-plus-log role from A11Y-018).

### Comment to add above the wrapper (optional but recommended)

The A11Y-018 comment at lines 119-129 already explains why the wrapper is both
the scroll container and the log. Append (or add a new sibling paragraph) a
short note about why it is also a tab stop, so a future reader doesn't try to
"clean up" the `tabIndex`:

```tsx
// A11Y-021: `tabIndex={0}` makes the scroll container reachable by keyboard
// on Firefox and Safari (Chromium auto-promotes scroll containers since M126,
// but Gecko and WebKit do not). Lets keyboard-only / screen-magnifier / switch
// users scroll the transcript with Arrow / PageUp / PageDown / Home / End.
```

## Test updates

`src/components/Chat.test.tsx` already has an `A11Y-018` `describe` block (lines
337-407) covering the wrapper's ARIA. Add a new `A11Y-021` `describe` block
alongside it, with the following tests:

1. **`tabIndex` is `0` on the transcript wrapper.**

   ```ts
   it('exposes the transcript as a keyboard tab stop (A11Y-021)', () => {
     render(<Chat messages={[msg('a', 'hi', 'them')]} onSend={() => {}} />)
     const log = getTranscript()
     expect(log.tabIndex).toBe(0)
   })
   ```

2. **Tab order: composer → transcript is reachable.** The simplest reliable
   JSDOM assertion is that the transcript's `tabIndex` is `0` _and_ the element
   is in the document before the composer. (`userEvent.tab()` works in JSDOM but
   the order assertion above is the contract; tab-traversal tests in JSDOM are
   flaky because focus visibility / scrolling don't apply.)

   ```ts
   it('places the transcript tab stop before the composer in source order (A11Y-021)', () => {
     render(<Chat messages={[msg('a', 'hi', 'them')]} onSend={() => {}} />)
     const log = getTranscript()
     const composer = screen.getByLabelText(/message/i)
     // Bitmask 4 = DOCUMENT_POSITION_FOLLOWING — composer follows the log in source order.
     expect(log.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
   })
   ```

3. **Focus-visible utility classes are present.** Guards against a future
   refactor accidentally dropping the visible focus indicator. We can't render
   real focus styles in JSDOM, so we assert the Tailwind classes are on the
   element (same pattern A11Y-007 / A11Y-017 tests use).

   ```ts
   it('carries the app focus-visible style (A11Y-021)', () => {
     render(<Chat messages={[msg('a', 'hi', 'them')]} onSend={() => {}} />)
     const log = getTranscript()
     expect(log.className).toContain('focus-visible:outline-none')
     expect(log.className).toContain('focus-visible:ring-2')
     expect(log.className).toContain('focus-visible:ring-sky-400')
   })
   ```

4. **Auto-focus-the-composer-on-mount still wins.** Regression guard so the new
   tab stop doesn't accidentally steal initial focus from the composer.

   ```ts
   it('does not steal initial focus from the composer (A11Y-021 regression of FEAT-002)', () => {
     render(<Chat messages={[msg('a', 'hi', 'them')]} onSend={() => {}} />)
     // The composer-focus useEffect should still run; the transcript becoming
     // a tab stop does not change initial-focus policy.
     expect(screen.getByLabelText(/message/i)).toHaveFocus()
   })
   ```

5. **(Optional) Scroll-state heuristic still observes scroll events on the
   focused transcript.** This is a documentation test more than a behavioral one
   — JSDOM doesn't run native scroll-by-key, so we synthesize a `scroll` event
   on the focused transcript and assert `wasNearBottom`-style behavior continues
   to work (i.e., the existing auto-scroll-to-bottom tests still pass with the
   wrapper now `tabIndex={0}`). The four existing tests in the
   `Chat auto-scroll` describe (lines 34-95) are the regression guard here; they
   should pass unchanged.

No existing test should require modification — `getTranscript()` (line 27) finds
the wrapper by role `log`, and that wrapper's role / aria attrs are unchanged.
The two added utility classes do not break the `aria-live="polite"` /
`role="log"` assertions in the existing A11Y-018 tests.

## Acceptance

- The transcript wrapper `<div>` in `src/components/Chat.tsx` (lines 130-138)
  carries `tabIndex={0}`.
- The same element carries the app focus-visible utilities:
  `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400`.
- The wrapper's existing `role="log"`, `aria-label="Chat transcript"`,
  `aria-live="polite"`, `aria-relevant="additions"`, `aria-atomic="false"`, and
  the `flex-1 overflow-y-auto rounded-md border ... p-3` layout classes are
  preserved unchanged.
- The inner `<ol>` and its `<li>` children (date dividers, message bubbles,
  empty-state `<p>`) are untouched.
- Initial focus on Chat mount remains on the composer textarea (the auto-focus
  `useEffect` at lines 110-115 still wins; verified by the regression test above
  and by the existing `'focuses #chat-input on initial mount...'` test).
- Tabbing through the Connected screen, in source order, produces: header
  content (including any "End chat" button rendered upstream of `<Chat>`) →
  transcript region (one stop) → composer textarea → Send button. Verified by
  source-order assertion + manual smoke.
- A new `A11Y-021` `describe` block in `src/components/Chat.test.tsx` asserts:
  `tabIndex === 0`, source-order ahead of the composer, focus-visible classes
  present, and that the composer still receives initial focus.
- The four existing `Chat auto-scroll` tests (lines 34-95) pass unchanged — the
  `wasNearBottomRef` / auto-scroll-to-latest behavior is unaffected by the
  wrapper becoming a tab stop.
- All existing `A11Y-018` `describe` tests (lines 337-407) pass unchanged —
  `role`, `aria-live`, `aria-relevant`, `aria-atomic`, `aria-label`, the
  no-`aria-live`-on-`<ol>` guard, the empty-state-outside-`<ol>` guard, and the
  date-divider `role="presentation"` guard all still hold.
- `npm test`, `npm run lint`, `npm run typecheck` clean.
- **Manual smoke (required) on Firefox AND Safari** (the two engines where the
  bug actually manifests):
  - Open the Design System Chat preview (or a real Connected screen with 30+
    messages).
  - Press Tab until focus lands on the transcript. Confirm the focus ring is
    visible (`ring-2 ring-sky-400`).
  - Press Arrow Up — transcript scrolls up one line. Press Arrow Down —
    transcript scrolls down one line.
  - Press PageUp — transcript scrolls up by approximately one viewport. Press
    PageDown — same, down.
  - Press Home — transcript jumps to the first message. Press End — jumps to the
    last.
  - Confirm none of the above scrolls the _document_ (only the transcript
    moves).
- **Manual smoke on Chrome** to confirm no regression: same Tab → transcript →
  arrow-keys flow works (Chrome was already auto-promoting the scroll container,
  so the only change visible to Chrome users is the explicit focus ring, which
  is a strict improvement).

## Working

- Verified the issue still exists at `src/components/Chat.tsx` lines 130-138:
  the wrapper `<div role="log">` has no `tabIndex`, no inner focusable
  affordance, and no programmatic focus path. Confirmed lines match the ticket
  exactly (wrapper opens at line 130, closes at 138).
- Applied the minimal fix exactly as the ticket prescribed:
  - Added `tabIndex={0}` to the wrapper `<div>`.
  - Added
    `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400`
    to the wrapper's `className` (between the `p-3` and `dark:border-...`
    segments, preserving sort order).
  - Appended the recommended explanatory comment to the existing A11Y-018
    comment block so a future reader doesn't strip the `tabIndex` while "tidying
    up."
- Added a new `Chat transcript keyboard focusability (A11Y-021)` describe block
  in `src/components/Chat.test.tsx` with four tests: `tabIndex === 0`,
  source-order ahead of the composer, focus-visible classes present, composer
  still wins initial focus.
- Verification:
  - `npm test -- --run src/components/Chat.test.tsx` → 31/31 pass (4 new tests
    included).
  - `npm test -- --run` (full suite) → 139/139 pass across 18 files.
  - `npm run lint` → clean.
  - `npm run typecheck` → clean.
- Existing `Chat auto-scroll` (lines 34-95) and
  `Chat transcript log surface (A11Y-018)` (lines 337-407) tests all still pass
  — `role`, `aria-live`, `aria-relevant`, `aria-atomic`, `aria-label`, and the
  `wasNearBottomRef`/auto-scroll behavior are unaffected by the wrapper becoming
  a tab stop, as the ticket predicted.
- Manual smoke on Firefox / Safari deferred to a human verifier — the unit-test
  source-order + tabIndex assertions plus the documented native browser behavior
  on focused scroll containers cover the contract; visual focus ring rendering
  and engine scroll-key behavior are out of scope for JSDOM.
