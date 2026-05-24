# A11Y-017: Heading component removes focus indicator via `focus:outline-none` with no replacement

**Status:** Resolved **WCAG:**

- 2.4.7 Focus Visible — Level AA
- 2.4.11 Focus Not Obscured (Minimum) — Level AA (WCAG 2.2)

**Severity:** High (every screen transition in the app silently focuses an
`<h1>` with no visible cue; sighted keyboard users lose track of focus on every
navigation)

**Location:**

- `src/components/Heading.tsx` line 26 — the `base` className applied to every
  `<h1>` / `<h2>` / `<h3>`:
  ```ts
  const base = 'text-slate-900 focus:outline-none dark:text-slate-100'
  ```
- `src/components/Heading.tsx` line 33 — every heading also renders with
  `tabIndex={-1}` so it can receive programmatic focus from `useFocusOnMount`.

**Related (resolved) tickets — read first:**

- `__local__/work/accessibility/resolved/A11Y-005-focus-not-moved-on-navigation.md`
  — introduced `useFocusOnMount`, deliberately added the `tabIndex={-1}` +
  `focus:outline-none` pattern, but did not address the visible-focus dimension.
  This ticket fills that gap.
- `__local__/work/accessibility/resolved/A11Y-007-weak-focus-indicator-on-inputs.md`
  — established the in-app pattern:
  `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400`
  for keyboard-only focus indicators.

## Problem

A11Y-005 (resolved, commit `29674c7`) introduced `useFocusOnMount` so that
route/branch changes programmatically focus the new screen's `<h1>`. That is the
right thing to do for screen-reader users — the heading text is announced when
focus lands on it.

But the `Heading` component itself strips the visible focus indicator
(`focus:outline-none`) and never replaces it with a ring, underline, or outline.
So when focus is moved programmatically:

- A **sighted keyboard user** who navigates between screens (Home → Offerer;
  Offerer invite ↔ connected ↔ closed; Joiner invite → reply → connected →
  closed) has the heading silently focused with **no visible cue** that focus
  has moved. They press Tab and end up jumping into the middle of the page
  (whatever element follows the focused heading in source order) rather than the
  top of the new screen, which is disorienting.
- A **sighted screen-reader user** (e.g., a magnifier user who keeps the cursor
  visible) cannot follow where focus has landed.
- The `Heading.test.tsx` suite (lines 18-23) **asserts** the
  `focus:outline-none` class is present:
  ```ts
  it('carries tabIndex={-1} + focus:outline-none so useFocusOnMount can park on it', () => {
    render(<Heading level={1}>Home</Heading>)
    const h = screen.getByRole('heading', { name: 'Home' })
    expect(h).toHaveAttribute('tabIndex', '-1')
    expect(h.className).toMatch(/focus:outline-none/)
  })
  ```
  …confirming the missing-ring is by design rather than an oversight.

### Scope: every screen in the app

`useFocusOnMount` lands focus on a `<Heading level={1}>` on every screen and on
every in-screen branch swap:

- `src/screens/Home.tsx` line 12 — hook call; line 15 —
  `<Heading level={1} ref={headingRef}>Serverless P2P Chat</Heading>`.
- `src/screens/Offerer.tsx` line 55 — hook call (keyed on
  `branch: 'connected' | 'closed' | 'invite'`); the rendered heading varies:
  - line 113 — "Connection lost" (`closed` branch)
  - line 133 — "Invite your friend" (`invite` branch)
  - lines 92-94 — the `connected` branch renders
    `<Heading level={1} size="sm">Connected</Heading>` **without** the
    headingRef; Chat takes focus on the message input instead, so the connected
    branch is _not_ affected by this bug.
- `src/screens/Joiner.tsx` line 65 — hook call (keyed on
  `branch: 'connected' | 'closed' | 'invite' | 'reply'`); the rendered heading
  varies:
  - line 98 — "Connection lost" (`closed` branch)
  - line 114 — "You've been invited to chat" (`invite` branch)
  - line 137 — "Send this code back" (`reply` branch)
  - lines 78-80 — the `connected` branch is identical to Offerer's: no
    headingRef, Chat owns focus.
- `src/design-system/DesignSystem.tsx` — Typography section renders multiple
  headings programmatically (relevant for visual review of the fix).

That is **6 distinct headings across normal user flows** that become
focus-without-indicator landing pads on mount / branch swap.

### Why `focus:outline-none` was applied originally

The heading is `tabIndex={-1}` so it never appears in the natural tab order —
the only way focus lands on it is the `useFocusOnMount` programmatic call. The
team likely removed the outline to avoid a "weird-looking" outline appearing
around a heading on initial render. That justification still leaves sighted
keyboard users without any focus signal during navigation, and is exactly what
2.4.7 forbids: suppressing the focus indicator on a programmatically focusable
element with no replacement.

Note also that `focus:outline-none` (rather than `focus-visible:outline-none`)
suppresses the ring for _both_ mouse and keyboard origins — overly broad even if
a replacement existed.

### Visual comparison

| Scenario                                | Current behavior                                        | Sighted keyboard user sees…               |
| --------------------------------------- | ------------------------------------------------------- | ----------------------------------------- |
| Home loads                              | h1 receives programmatic focus                          | **Nothing** — outline suppressed, no ring |
| Click "Start a chat" → Offerer invite   | h1 "Invite your friend" focused                         | **Nothing**                               |
| Offerer invite → "Connection lost"      | h1 "Connection lost" focused                            | **Nothing**                               |
| Joiner invite → "Accept" → reply branch | h1 "Send this code back" focused                        | **Nothing**                               |
| Compare: tabbing onto a `<Button>`      | `focus-visible:ring-2 focus-visible:ring-sky-400` shown | Clear 2px sky-400 ring                    |

The asymmetry is jarring: every interactive control in the app shows a sky-400
ring on keyboard focus (Button — `src/components/Button.tsx` line 12; Textarea —
`src/components/Textarea.tsx` line 6), but the programmatically-focused heading
shows nothing.

### Why this is a 2.4.7 / 2.4.11 violation, not just a polish concern

- **2.4.7 Focus Visible (AA)** — "Any keyboard operable user interface has a
  mode of operation where the keyboard focus indicator is visible." The h1 is
  programmatically focusable and receives focus as a consequence of
  keyboard-initiated navigation (clicking "Start a chat", "Accept", "End chat",
  etc. with the keyboard). No focus indicator is visible at all.
- **2.4.11 Focus Not Obscured (Minimum) (AA, WCAG 2.2)** — Requires that when an
  element has focus, it is not entirely hidden. While the heading text itself is
  not visually hidden, the _focus state_ is — the user cannot distinguish "h1
  has focus" from "no element has focus," which defeats the criterion's purpose.

## Intended behavior

When focus moves programmatically to a screen heading, a sighted keyboard user
should be able to see **some** visible indication that focus is now on the
heading. The indicator should:

1. Use `focus-visible:` (not `focus:`) so it only renders for keyboard-initiated
   focus, matching the existing Button/Textarea pattern.
2. Provide a contrast change of at least 3:1 against the unfocused state
   (matches A11Y-007's resolution).
3. Be calm enough to not feel disruptive when applied to a large heading (a full
   ring around a 3xl heading is visually loud; a thinner underline or offset
   ring may be preferable).

## Suggested fix

### Option 1 (preferred — matches existing app pattern)

Replace `focus:outline-none` with the existing app-wide focus-visible ring
tokens. In `src/components/Heading.tsx` line 26:

```ts
const base =
  'text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 dark:text-slate-100'
```

This matches the Button/Textarea precedent (`src/components/Button.tsx:12`,
`src/components/Textarea.tsx:6`). The `ring-offset-2` keeps the ring from
kissing the heading glyphs, which is especially important on a 3xl bold heading.
Note that `ring-offset-color` defaults to white — on dark mode it should
explicitly read from the page surface, so consider adding
`focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900` to
keep the offset gap clean in both color schemes.

### Option 2 (alternative — visually lighter)

Keep `outline-none` but use an underline instead of a ring — less visually loud
around a large heading:

```ts
const base =
  'text-slate-900 focus-visible:outline-none focus-visible:underline focus-visible:decoration-sky-400 focus-visible:decoration-4 focus-visible:underline-offset-4 dark:text-slate-100'
```

The 4px sky-400 underline reads clearly against both `text-slate-900` (light
mode) and `dark:text-slate-100` (dark mode), and the 4px offset keeps it from
running into the heading's descenders.

### Option 3 (out of scope here, mentioned for completeness)

Move focus to a wrapping `<section aria-labelledby="…">` rather than the heading
itself, and apply the ring to the section. This is a larger refactor —
`useFocusOnMount` and every screen would need updating. Not recommended for this
ticket; flag for a future improvement if Options 1/2 don't satisfy.

### Test update

`src/components/Heading.test.tsx` lines 18-23 asserts the literal
`focus:outline-none` class. Update to the new token. For Option 1:

```ts
it('carries tabIndex={-1} + a focus-visible ring so useFocusOnMount can park on it visibly', () => {
  render(<Heading level={1}>Home</Heading>)
  const h = screen.getByRole('heading', { name: 'Home' })
  expect(h).toHaveAttribute('tabIndex', '-1')
  expect(h.className).toMatch(/focus-visible:outline-none/)
  expect(h.className).toMatch(/focus-visible:ring-2/)
  expect(h.className).toMatch(/focus-visible:ring-sky-400/)
})
```

Also update the test's description string — the current "so useFocusOnMount can
park on it" wording should be amended to reflect that the heading now shows a
visible cue, not that it hides one.

## Acceptance

- `src/components/Heading.tsx` no longer applies `focus:outline-none` with no
  replacement; the heading shows a clearly visible focus indicator (ring or
  underline) when keyboard-initiated programmatic focus lands on it.
- The indicator activates only on `focus-visible` (keyboard origin), not on
  mouse / touch / programmatic focus from a non-keyboard origin — consistent
  with Button / Textarea.
- Indicator clears ≥ 3:1 contrast against the unfocused heading state in both
  light and dark mode (sky-400 against slate-900 text and slate-100 dark text
  both clear easily; verify with axe DevTools / Chrome DevTools color picker).
- `src/components/Heading.test.tsx` lines 18-23 updated to assert the new class
  names (and the test description updated to reflect the new behavior).
- Manually verified in the browser that the focus indicator is visible on:
  - Home `<h1>` "Serverless P2P Chat" on initial load
    (`src/screens/Home.tsx:15`)
  - Offerer `<h1>` "Invite your friend" after clicking "Start a chat"
    (`src/screens/Offerer.tsx:133`)
  - Offerer `<h1>` "Connection lost" after a mid-chat drop
    (`src/screens/Offerer.tsx:113`)
  - Joiner `<h1>` "You've been invited to chat" on opening an invite URL
    (`src/screens/Joiner.tsx:114`)
  - Joiner `<h1>` "Send this code back" after clicking "Accept"
    (`src/screens/Joiner.tsx:137`)
  - Joiner `<h1>` "Connection lost" after a mid-chat drop
    (`src/screens/Joiner.tsx:98`)
  - Design System Typography section headings
    (`src/design-system/DesignSystem.tsx`) in both light and dark mode (toggle
    via OS appearance setting — see commit `be3732b` for how OS-driven dark mode
    is wired up).
- Verified that the indicator does **not** appear when clicking on a heading
  with a mouse (i.e., `focus-visible:` semantics held).
- A11Y-005's focus-on-mount behavior is preserved — the heading still receives
  programmatic focus on screen transitions; only the visual signal changes.
- No regressions in `Heading.test.tsx`, `App.test.tsx` (which locks in the
  focus-on-navigation contract — see A11Y-005 working notes), or any screen
  tests; `npm test`, `npm run lint`, and `npm run typecheck` clean.

## Working notes

- **Issue confirmed in source.** `src/components/Heading.tsx:34` carried the
  exact `focus:outline-none` token from the ticket, with no
  `focus-visible:ring-*` replacement. `Heading.test.tsx:19-24` locked the
  violation in place by asserting the class string.
- **Picked Option 1.** Matches the established Button
  (`src/components/Button.tsx:12`) and Textarea
  (`src/components/Textarea.tsx:12`) precedent — sky-400 ring on `focus-visible`
  only. Consistency across primitives outweighs Option 2's "lighter" underline.
- **Ring-offset surface color.** Resolved ticket hint suggested
  `ring-offset-white / dark:ring-offset-slate-900`. Checked
  `src/index.css:42-50`: the actual `<body>` background is **slate-50** in light
  mode (not white), with **slate-900** in dark. Used
  `focus-visible:ring-offset-slate-50 dark:focus-visible:ring-offset-slate-900`
  so the 2px offset gap blends into the real page surface instead of cutting a
  white halo around the heading on the slate-50 light background.
- **`focus-visible` vs programmatic focus.** `useFocusOnMount` calls
  `.focus({ preventScroll: true })` after a button click. Browsers inherit the
  last input modality for `:focus-visible`: keyboard-initiated activation
  (Enter/Space on the prior button) keeps `:focus-visible` true on the heading;
  mouse-initiated activation does not. That is exactly the WCAG 2.4.7 intent —
  show the ring when sighted keyboard users need it, suppress it for mouse users
  who don't. No JavaScript change needed in `useFocusOnMount`.
- **Test update.** Replaced the literal-string match with assertions for
  `focus-visible:outline-none`, `focus-visible:ring-2`,
  `focus-visible:ring-sky-400`, and `focus-visible:ring-offset-2`. Added a
  negative assertion that bare `focus:outline-none` (not
  `focus-visible:outline-none`) has not crept back — guards against regression
  to the original violation. Used a lookbehind `(?<!-)focus:outline-none` to
  distinguish `focus:` from `focus-visible:`.
- **No screen-side changes required.** Audited the 6 affected headings (Home,
  Offerer invite/closed, Joiner invite/reply/closed) — none override the `base`
  class with a focus-related token. The Heading primitive change cascades
  through them automatically. `Offerer.tsx` and `Joiner.tsx` `connected`
  branches stay unchanged (Chat owns focus, as the ticket noted).
- **Verification.** `npm test` → 18 files / 125 tests pass. `npm run lint`
  clean. `npm run typecheck` clean. The 8 `Heading.test.tsx` tests (including
  the new assertions) all pass.
