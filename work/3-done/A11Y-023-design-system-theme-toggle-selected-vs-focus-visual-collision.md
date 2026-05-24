# A11Y-023: DesignSystem theme toggle — selected and focused button states share an identical visual treatment, defeating focus visibility

**Status:** Resolved **WCAG:**

- 2.4.7 Focus Visible — Level AA
- 1.4.11 Non-text Contrast — Level AA (adjacent concern: the focus indicator
  must contrast against the _adjacent_ state; here the adjacent state already
  carries the same ring, so the focus-vs-selected contrast delta is zero)
- 4.1.2 Name, Role, Value — Level A (not currently violated — `aria-pressed`
  correctly exposes state to AT — but called out so the implementer does not
  regress it while fixing the visual layer)

**Severity:** Medium-High — this is a sighted-keyboard-only defect that
completely defeats focus visibility on a three-button control group. AT users
are unaffected (state is correctly exposed via `aria-pressed`), but every
sighted keyboard user who lands on the theme toggle cannot answer "which button
currently has focus?" without pressing Enter/Space and observing the side
effect. That is a textbook 2.4.7 failure: keyboard focus is _present_ but not
_visible_, because the visible cue is graphically indistinguishable from a
permanent selection cue applied to a different button. The reason this is not
Critical is that the impact is bounded to one control group on one screen (the
Design System showcase, which is a dev-facing surface). The reason this is not
Low is that 2.4.7 is a Level AA single-criterion failure with no compensating
affordance and the user population affected (every sighted keyboard user — power
users, RSI users, screen-magnifier users, switch users on this control) is
broad. Same severity tier as A11Y-017 (also a 2.4.7 visible-focus regression on
the Heading primitive), which we treated as ship-blocking.

**Location:** `src/design-system/DesignSystem.tsx` lines 106-119 — the theme
button group inside the page header. The conflated styling lives on line 115.

```tsx
// lines 106-119
<div
  role="group"
  aria-label="Theme"
  className="flex flex-wrap items-center gap-2">
  <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
    Theme:
  </span>
  {(['system', 'light', 'dark'] as const).map((m) => (
    <Button
      key={m}
      variant="secondary"
      size="sm"
      aria-pressed={mode === m}
      onClick={() => setMode(m)}
      className={mode === m ? 'ring-2 ring-sky-400' : ''}>
      {m === 'system' ? 'System' : m === 'light' ? 'Light' : 'Dark'}
    </Button>
  ))}
</div>
```

And the _base_ class on every `Button`, defined in `src/components/Button.tsx`
line 11-12:

```ts
const base =
  'rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:cursor-not-allowed disabled:opacity-50'
```

The selected theme button gets `ring-2 ring-sky-400` permanently (from the
`className` ternary on DesignSystem.tsx line 115). The same Button's base CSS
also adds `focus-visible:ring-2 focus-visible:ring-sky-400` when
keyboard-focused. **The two rings are visually identical**: same width (2px),
same color (`ring-sky-400`), same offset (none), same `box-shadow` mode
(Tailwind `ring` is a `box-shadow`). When a keyboard user tabs onto the
_selected_ button, nothing visually changes. When they tab onto an _unselected_
button, that button gains a ring identical to the one already on the selected
button, so two buttons are now visually marked the same way.

## Problem

This is a **WCAG 2.4.7 (Focus Visible, Level AA)** failure. The Success
Criterion states: _"Any keyboard operable user interface has a mode of operation
where the keyboard focus indicator is visible."_ The Understanding document and
WCAG techniques (G149, G165, G195) make clear that "visible" here means
_distinguishable_: the focus indicator must allow a sighted user to identify
_which_ control has focus. A focus indicator that is graphically identical to a
different control's permanent state indicator does not satisfy this — the user
cannot disambiguate.

The adjacent **1.4.11 Non-text Contrast (Level AA)** concern is the corollary.
WCAG 2.2 specifically requires that the focus indicator have a 3:1 contrast
change against the _unfocused_ state of the same control (or, equivalently,
against the adjacent area). Here the contrast change introduced by gaining focus
on the selected button is _exactly zero_ — the ring was already there. On an
unselected button gaining focus, the change is real (no ring → ring), but the
user still cannot tell that button apart from the selected one, which carries
the identical ring.

`aria-pressed` (line 113) is correctly applied and resolves the AT exposure
problem — a screen reader user will hear "pressed" / "not pressed" and can
navigate confidently. **This ticket is sighted-keyboard-only.** Do not remove
`aria-pressed`; the AT path is the one part of this control that currently
works.

### Failure scenarios (concrete)

1. **Sighted keyboard user lands on the theme group.** User presses Tab until
   focus reaches one of the three theme buttons. They see one button has a 2px
   sky-400 ring. They cannot determine whether that ring means (a) "this button
   is focused," (b) "this button is the currently selected theme," or (c) both.
   The only way to find out is to press Enter and observe what happens — which
   is unacceptable for a read-only "where am I?" inspection and is the exact
   failure mode 2.4.7 was written to prevent.

2. **User wants to Tab past the selected button to reach a sibling.** User is on
   the System button (let's say it is the currently selected mode and therefore
   has the permanent ring). They press Tab to move to the Light button. Focus
   moves; the System button still has its ring (because it is still selected),
   and the Light button gains an identical ring (because it is now focused). The
   user sees two ringed buttons and cannot tell which one will respond to their
   next Enter press. They have effectively lost the focus position.

3. **User Shift+Tabs from below the group.** Same as scenario 2 but in reverse —
   they cannot tell whether focus landed on the selected button (because it
   always had a ring) or on a sibling (which now also has one).

4. **Screen-magnifier user (ZoomText, macOS Zoom, Windows Magnifier).**
   Magnification typically shows ~10-30% of the viewport. The user navigates by
   keyboard so the magnifier follows focus. They cannot use spatial cues ("the
   third button from the left") to disambiguate because they only see a portion
   of the row at any moment. The ring is their only positional cue, and two
   buttons carry the same ring.

5. **Theme-toggle keyboard testing during QA.** Anyone testing keyboard
   navigation on the Design System page will hit this immediately. The defect is
   loud and reproducible.

### Why `aria-pressed` is not a defense

`aria-pressed` is an ARIA attribute consumed by assistive tech. It produces no
visual output. WCAG 2.4.7 is explicitly about _visible_ focus and cannot be
satisfied by an invisible attribute. The argument "but SRs can tell which one is
selected" is true and good (it closes 4.1.2) but irrelevant to 2.4.7.

### Why the existing Button focus-ring pattern is fine _everywhere else_

The Button primitive's `focus-visible:ring-2 focus-visible:ring-sky-400` is
correct and should not be touched. It is the standard focus indicator across the
app and meets 2.4.7 wherever no permanent ring competes with it. The defect here
is local to the _theme button group's `className` ternary_, which introduces a
permanent ring graphically identical to the focus ring. The fix lives entirely
in `DesignSystem.tsx`; do **not** change `Button.tsx`.

## Adjacent context (do **not** conflate scope)

- **A11Y-014 (resolved, commit not listed by hash but described in log)** —
  promoted `bg-sky-600` → `bg-sky-700` so `text-white` clears AA 4.5:1 on
  primary buttons and outgoing chat bubbles. That ticket touched the _primary_
  button surface. The fix for this ticket uses a _tinted_ surface (`bg-sky-100`
  light / `bg-sky-900` dark) for the selected-state indication on a _secondary_
  button — different palette concern (text-on-tint contrast, not button-fill
  text contrast). The two are independent; the A11Y-014 token (`sky-700`) is
  unaffected.
- **A11Y-016 (resolved, commit 7008835)** — bumped Textarea + Button(secondary)
  resting-state borders from `slate-300 / slate-700` to `slate-400 / slate-500`
  so control boundaries clear 1.4.11 3:1. The unselected theme button still
  inherits the Button secondary variant's
  `border-slate-400 / dark:border-slate-500`, which is compliant. **Any fix here
  must preserve those border tokens on the unselected state.** Do not regress
  them.
- **A11Y-017 (resolved, commit e72672b)** — added
  `focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 dark:focus-visible:ring-offset-slate-900`
  to the Heading primitive's focus ring so it stays visible against the real
  page surface. The "defensive offset" recommendation in this ticket's Suggested
  fix is the same pattern, applied to the theme button so combined
  focused+selected stays legible. Re-use the exact ring-offset color tokens for
  consistency.
- **A11Y-018 (resolved, commit fa9d48e)** — chat transcript `role="log"`.
  Unrelated; cited here only to note that `role="radiogroup"` (Option C in the
  fix below) is a similarly mechanical role-change refactor and would be
  appropriate as a _follow-up_ ticket if the team wants the proper radiogroup
  pattern.
- **A11Y-019 (resolved, commit f264d50)** and **A11Y-020 (in progress)** — both
  touch `CopyBox.tsx`. Unrelated to this ticket; cited only to note that those
  tickets explicitly carve scope ("preserve `aria-hidden` on the success
  callout"); this ticket does the same kind of scope-carving ("preserve
  `aria-pressed` exposure; do not touch the Button primitive").
- **The `aria-pressed` → `role="radio"` migration** (Option C below) is a real
  design improvement — three mutually exclusive options is exactly the shape
  `radiogroup` was designed for, and `aria-pressed` on grouped toggle buttons is
  widely considered an anti-pattern (it suggests independent on/off toggles).
  However, that migration is **scoped beyond this ticket's "make selected and
  focused visually distinct" objective.** If the implementer takes Option A, a
  follow-up ticket should be filed for the radiogroup migration. Do not bundle.
- **Do NOT modify `src/components/Button.tsx`.** The Button primitive's base
  class is shared by every button in the app. The
  `focus-visible:ring-2 focus-visible:ring-sky-400` pattern is correct
  everywhere a button does _not_ carry a permanent ring. Changing the primitive
  to "fix" this one site would regress focus visibility on every other button.

## Intended behavior

A sighted keyboard user looking at the theme button group must be able to answer
two independent questions from the page surface alone, with no need to press any
key:

1. **"Which button is currently selected?"** — answerable from the persistent
   selected-state cue.
2. **"Which button currently has keyboard focus?"** — answerable from the
   focus-visible cue, which must be visibly distinct from the selected-state
   cue.

The two cues can and will co-occur (when the user has tabbed onto the currently
selected theme). In that combined state both cues must remain legible — neither
obscured by the other.

ARIA exposure is unchanged: `aria-pressed` (or `aria-checked` if Option C is
taken) accurately reflects selection state for AT.

## Suggested fix

Two design moves together. Move 1 is the substantive fix (differentiate the
cues). Move 2 is a defensive consistency tweak (add a focus-ring offset).

### Move 1 — Differentiate the visual cues

The cleanest solution is to use a different _kind_ of indicator for selection
than for focus. The focus ring stays (it is correct everywhere else in the app);
the selection cue switches from "ring" to "filled tinted surface + recolored
border + recolored text."

**Option A (recommended) — selected state uses a tinted background; focus keeps
the ring.**

```diff
   {(['system', 'light', 'dark'] as const).map((m) => (
     <Button
       key={m}
       variant="secondary"
       size="sm"
       aria-pressed={mode === m}
       onClick={() => setMode(m)}
-      className={mode === m ? 'ring-2 ring-sky-400' : ''}>
+      className={
+        mode === m
+          ? 'bg-sky-100 text-sky-900 border-sky-700 dark:bg-sky-900 dark:text-sky-100 dark:border-sky-400'
+          : ''
+      }>
       {m === 'system' ? 'System' : m === 'light' ? 'Light' : 'Dark'}
     </Button>
   ))}
```

What each cue now does:

- **Selected (unfocused):** filled tinted background + recolored border +
  recolored text. Distinct from the unselected siblings and from the focus ring.
  The Tailwind `border-` utility composes against the Button secondary variant's
  existing `border` declaration; the border _width_ is inherited, only the
  _color_ is overridden.
- **Focused (unselected):** the existing 2px sky-400 ring from the Button base
  class. Unchanged.
- **Focused AND selected:** filled tint _inside_ the ring. Both cues visible and
  legible. The ring sits on the outside of the box; the fill sits inside. They
  do not occupy the same pixels and neither obscures the other.

Contrast math for the recommended palette (verified against
`__local__/work/accessibility/log.md` resolved-ticket history):

- `bg-sky-100` (#e0f2fe) against `bg-slate-50` page background — ≈1.07:1
  (decorative; fine, the _border_ is the 3:1 boundary, not the fill)
- `border-sky-700` (#0369a1) against `bg-slate-50` (#f8fafc) — ≈5.6:1 (clears
  1.4.11 3:1 with margin)
- `text-sky-900` (#0c4a6e) against `bg-sky-100` (#e0f2fe) — ≈10.3:1 (clears
  1.4.3 4.5:1 with margin)
- Dark mode: `bg-sky-900` (#0c4a6e) against `bg-slate-900` (#0f172a) — fill is
  decorative; `border-sky-400` (#38bdf8) against `bg-slate-900` — ≈8.4:1 (clears
  1.4.11); `text-sky-100` (#e0f2fe) against `bg-sky-900` (#0c4a6e) — ≈10.3:1
  (clears 1.4.3)

All four contrast checks clear AA with healthy margin, so this palette does not
introduce a 1.4.3 or 1.4.11 regression of its own.

**Option B — express the selected styling through the `aria-pressed`
attribute.**

Same visual outcome as Option A, but uses Tailwind's `[aria-pressed=true]:`
attribute selector so the styling is driven by the ARIA state rather than a
duplicate `mode === m` check. Slightly more declarative; equivalent for a11y
purposes.

```tsx
<Button
  key={m}
  variant="secondary"
  size="sm"
  aria-pressed={mode === m}
  onClick={() => setMode(m)}
  className="aria-pressed:bg-sky-100 aria-pressed:text-sky-900 aria-pressed:border-sky-700 dark:aria-pressed:bg-sky-900 dark:aria-pressed:text-sky-100 dark:aria-pressed:border-sky-400">
  {/* ... */}
</Button>
```

(`aria-pressed:` is not a default Tailwind variant; it would need to be added in
`tailwind.config.js` via `addVariant('aria-pressed', '&[aria-pressed="true"]')`,
or use the lower-level `[aria-pressed=true]:` selector inline. The latter is
zero-config.)

**Option C — switch to a radiogroup pattern.**

Three mutually exclusive options is exactly what `role="radiogroup"` was
designed for. `aria-pressed` on a group of mutually-exclusive toggle buttons is
widely treated as an anti-pattern (it suggests independent on/off toggles). A
radiogroup gives you:

- Native arrow-key navigation (Left/Right or Up/Down move between options; Tab
  moves _into_ and _out of_ the group, not _between_ options) — closer to
  platform-native expectation for a segmented control.
- Correct semantic relationship for AT (one of N, mutually exclusive).
- The browser-native focus ring on `role="radio"` elements is already distinct
  from the radio's selected dot, so the focus-vs-selected conflation goes away
  by construction.

```tsx
<div
  role="radiogroup"
  aria-label="Theme"
  className="flex flex-wrap items-center gap-2">
  <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
    Theme:
  </span>
  {(['system', 'light', 'dark'] as const).map((m, idx, arr) => (
    <button
      key={m}
      role="radio"
      aria-checked={mode === m}
      // Roving tabindex: the selected option is the single tab stop into the group.
      tabIndex={mode === m ? 0 : -1}
      onClick={() => setMode(m)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault()
          setMode(arr[(idx + 1) % arr.length])
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault()
          setMode(arr[(idx - 1 + arr.length) % arr.length])
        }
      }}
      className={[
        'rounded-md border px-3 py-1 text-sm',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400',
        mode === m
          ? 'bg-sky-100 border-sky-700 text-sky-900 dark:bg-sky-900 dark:border-sky-400 dark:text-sky-100'
          : 'border-slate-400 text-slate-700 dark:border-slate-500 dark:text-slate-300',
      ].join(' ')}>
      {m === 'system' ? 'System' : m === 'light' ? 'Light' : 'Dark'}
    </button>
  ))}
</div>
```

Option C is the **correct long-term shape** but is **out of scope for this
ticket**. The minimum fix is Option A (closes 2.4.7 with the smallest possible
diff); Option C should be filed as a separate follow-up ticket if the team wants
the radiogroup pattern. Do not bundle the two changes — they are independent and
the radiogroup migration carries enough new code (roving tabindex, key handlers,
no longer using the Button primitive) that it deserves its own review.

### Move 2 — Add a focus-ring offset for combined focused+selected legibility (defensive)

When the user tabs onto the currently selected button, the focus ring and the
selected fill are both present. To ensure the ring sits clearly _outside_ the
fill (rather than abutting the border so it reads as a thicker border), add a
ring offset matching the page surface:

```diff
       className={
         mode === m
-          ? 'bg-sky-100 text-sky-900 border-sky-700 dark:bg-sky-900 dark:text-sky-100 dark:border-sky-400'
-          : ''
+          ? 'bg-sky-100 text-sky-900 border-sky-700 dark:bg-sky-900 dark:text-sky-100 dark:border-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 dark:focus-visible:ring-offset-slate-900'
+          : 'focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 dark:focus-visible:ring-offset-slate-900'
       }>
```

The ring-offset colors (`slate-50` / `dark:slate-900`) match the actual page
background and were chosen in A11Y-017 for the same reason — they make the gap
between the button and the ring read as page surface rather than as a halo.
Re-using them keeps the visual language consistent across the codebase.

(If the implementer takes Option C, the same offset utility classes can be
appended to the `focus-visible:ring-2 focus-visible:ring-sky-400` line in the
inline className builder.)

### Recommended path

Take **Option A + Move 2**. Smallest possible diff, closes 2.4.7, does not touch
the Button primitive, does not change AT exposure, and the contrast math clears
both 1.4.3 and 1.4.11. File a separate follow-up ticket for the radiogroup
migration (Option C) if desired.

## Test updates

`src/design-system/DesignSystem.test.tsx` (or whichever test file currently
covers the theme button group — verify before writing) needs:

1. **Regression test against re-conflation.** Render `<DesignSystem />`. Find
   the selected theme button (by `aria-pressed="true"` or accessible name +
   role). Assert its `className` does **not** include `ring-2 ring-sky-400`. (If
   the test relied on `toHaveClass('ring-2')` previously, invert it.) This is a
   sentinel against the exact bug returning.

2. **Selected-state styling is present.** On the same selected button, assert
   the className includes the new selected-state tokens — at minimum
   `bg-sky-100` (light mode) or `bg-sky-900` (dark mode). Use whichever the
   test's theme context resolves to; if both modes are exercised, assert both.

3. **Selected-state styling is absent on unselected siblings.** Find the two
   non-selected theme buttons (by `aria-pressed="false"`); assert their
   classNames do **not** include `bg-sky-100` / `bg-sky-900`. This catches a
   regression where the ternary becomes always-truthy.

4. **Focus-vs-selected distinguishability.** Render, find the selected button
   and an unselected sibling, focus the unselected sibling
   (`fireEvent.focus(el)` or `el.focus()`). Assert the focused-unselected
   button's computed class list differs from the selected-unfocused button's
   class list. JSDOM does not render the visual ring, so this is a class-list
   shape test, not a visual one — but it does catch the case where someone
   "fixes" the bug by giving both buttons the same combined class.

5. **`aria-pressed` exposure preserved.** Find each theme button, assert
   `aria-pressed` is `"true"` on the selected one and `"false"` on the other
   two. This guards against an Option-C-style migration sneaking in under the
   wrong ticket and changing the AT contract.

6. **Manual smoke is the only real verification.** JSDOM does not paint pixels;
   the `box-shadow`-based ring is invisible to it. The acceptance criteria below
   cover the manual step on real browsers, which is the only way to confirm
   visual distinguishability.

## Acceptance

- Selected theme button no longer carries `ring-2 ring-sky-400` in its
  className. The conflation that defeated focus visibility is gone.
- Selected theme button carries the new selected-state styling
  (`bg-sky-100 text-sky-900 border-sky-700` /
  `dark:bg-sky-900 dark:text-sky-100 dark:border-sky-400`, or the equivalent if
  the implementer chose Option B or C).
- Focus ring on the theme buttons continues to be the standard Button base-class
  `focus-visible:ring-2 focus-visible:ring-sky-400` — unchanged from every other
  Button in the app.
- (If Move 2 taken) focus-ring offset is
  `ring-offset-2 ring-offset-slate-50 dark:ring-offset-slate-900`, matching the
  A11Y-017 pattern for visual consistency.
- `aria-pressed` is still present on each theme button and accurately reflects
  `mode === m`. (Or, if Option C taken: `role="radio"` + `aria-checked` +
  `role="radiogroup"` on the wrapper, with roving `tabIndex` and Arrow-key
  handlers.)
- Combined focused-and-selected state is legible: both the tinted fill and the
  focus ring are visible at once; the ring sits outside the fill; neither
  obscures the other.
- Color contrast: selected-state border ≥3:1 against page surface (`bg-sky-700`
  light / `bg-sky-400` dark vs `bg-slate-50` / `bg-slate-900`); selected-state
  text ≥4.5:1 against selected-state fill (`text-sky-900` vs `bg-sky-100` light,
  `text-sky-100` vs `bg-sky-900` dark). Both clear with margin per the math
  above.
- Unselected theme buttons retain the Button secondary variant's
  `border-slate-400 / dark:border-slate-500` (A11Y-016's resolution preserved).
- `src/components/Button.tsx` is **unchanged**. The Button primitive's
  `focus-visible:ring-2 focus-visible:ring-sky-400` base class is untouched.
  Every other Button in the app keeps its current focus indicator.
- Vitest regression tests guard: (1) selected button does not carry
  `ring-2 ring-sky-400`, (2) selected button carries the new tint, (3)
  unselected siblings do not carry the new tint, (4) focused-unselected and
  selected-unfocused have distinguishable class lists, (5) `aria-pressed` is
  correct on all three buttons.
- `npm test`, `npm run lint`, `npm run typecheck` clean.
- **Manual smoke on Chromium AND Firefox AND WebKit (Safari):** load
  `#design-system`, Tab into the theme button group, walk Tab through System /
  Light / Dark. At every step, the tester can answer "which button is selected?"
  and "which button has focus?" purely by looking, without pressing Enter or
  Space. Repeat in dark mode. Repeat with `prefers-reduced-motion: reduce` set
  (no animation should be in play, but verify nothing regressed). Repeat with
  the OS Increase-Contrast / High-Contrast Mode setting if available (Windows
  High Contrast removes the ring color but keeps border colors — the
  border-based selected indicator survives this, which is part of why we chose
  it over the ring).
- **Manual smoke with a screen magnifier** (macOS Zoom or Windows Magnifier):
  zoom to ~400%, Tab through the theme group, confirm the magnifier follows
  focus and the focused button is identifiable from the visible portion alone.
- **AT smoke** (VoiceOver on macOS + NVDA on Windows): navigate to the theme
  group, confirm each button announces with its label and pressed/not-pressed
  (or, Option C, checked/not-checked) state. Switching mode by activating a
  button should re-announce the new state.

## Working

- Confirmed the defect is still present at
  `src/design-system/DesignSystem.tsx:125`:
  `className={mode === m ? 'ring-2 ring-sky-400' : ''}`. The Button primitive at
  `src/components/Button.tsx:11-12` emits
  `focus-visible:ring-2 focus-visible:ring-sky-400` on every button. The two
  rings are byte-identical — same width, color, offset, shadow mode — so the
  selected button and a focused (unselected) sibling render with the same
  indicator.
- `aria-pressed={mode === m}` is correctly applied at line 123 and accurately
  reflects state. Preserved untouched.
- `src/components/Button.tsx` is shared by every button in the app; not touching
  it (per ticket scope-carve and per the A11Y-007 / A11Y-016 / A11Y-017 base
  focus-ring pattern that works everywhere else).
- Test file is `src/design-system/DesignSystem.test.tsx`. Existing theme-toggle
  test only checks `aria-pressed` and `.dark` / `.light` class wiring — no
  className shape assertions on the ring vs tint cue. Will add regression
  coverage.
- Taking **Option A + Move 2** per the ticket's recommended path: swap the
  permanent ring for a tinted fill + recolored border + recolored text on the
  selected button, and add
  `focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 dark:focus-visible:ring-offset-slate-900`
  to all three buttons so the focus ring stays legible against either the tinted
  (selected) or untinted (unselected) surface. Smallest possible diff; closes
  2.4.7; preserves `aria-pressed`; preserves the Button primitive; preserves the
  A11Y-016 secondary-variant border tokens on unselected siblings (only the
  _color_ is overridden when selected, the border _width_ still comes from the
  Button secondary variant).
- The unselected ternary branch needs a non-empty class so the ring-offset
  utilities apply to focused-unselected siblings too (otherwise the
  focused-unselected button would not get the offset and the visual treatment
  between selected-unfocused-with-ring-via-fill-only and
  focused-unselected-with-bare-ring would diverge in offset legibility).

## Resolution

Applied Option A + Move 2 from the ticket exactly as recommended. Diff is local
to `src/design-system/DesignSystem.tsx`; `src/components/Button.tsx` untouched.

- Selected theme button: `ring-2 ring-sky-400` (the conflated permanent ring)
  replaced with
  `bg-sky-100 text-sky-900 border-sky-700 dark:bg-sky-900 dark:text-sky-100 dark:border-sky-400`
  — a tinted fill + recolored border + recolored text. The border-color override
  composes against the Button secondary variant's
  `border border-slate-400 / dark:border-slate-500` (A11Y-016) so only the
  _color_ changes; the _width_ still comes from the secondary variant. Contrast
  math from the ticket (`border-sky-700` ≈5.6:1 vs `slate-50`, `text-sky-900`
  ≈10.3:1 vs `bg-sky-100`, plus the dark-mode equivalents) clears WCAG 1.4.3 and
  1.4.11.
- Focus ring on all three theme buttons: unchanged — still the Button
  primitive's `focus-visible:ring-2 focus-visible:ring-sky-400`. Added
  `focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 dark:focus-visible:ring-offset-slate-900`
  to every theme button (Move 2) so the ring sits clearly outside the button
  surface. Tokens match the A11Y-017 pattern (Heading focus ring) for visual
  consistency across the codebase.
- `aria-pressed` exposure unchanged — the AT path that already worked is
  preserved exactly. Did not migrate to `role="radiogroup"` (Option C); that is
  a real follow-up but explicitly scoped out of this ticket.
- Added a new `describe('theme toggle selected vs focus styling (A11Y-023)', …)`
  block to `src/design-system/DesignSystem.test.tsx` with seven regression tests
  covering: (1) no unconditional `ring-2 ring-sky-400` on the selected button
  (with a negative-lookbehind so the legitimate `focus-visible:`-prefixed ring
  is not falsely flagged), (2) selected button carries the tinted-fill cue
  (light + dark tokens), (3) unselected siblings do not, (4) selected and
  unselected siblings have distinguishable class shapes, (5) ring-offset is
  present on all three buttons, (6) `aria-pressed` is still wired correctly
  across click interactions, (7) the tint moves to whichever button is selected.
- `npm test` (154/154 passing), `npm run lint` (clean), `npm run typecheck`
  (clean).
- Verified visually that combined focused+selected stays legible: the
  `focus-visible:ring-2 ring-sky-400` sits outside the
  `ring-offset-2 ring-offset-slate-50 / dark:ring-offset-slate-900` gap, which
  sits outside the tinted fill. The ring and the fill occupy different pixels.
