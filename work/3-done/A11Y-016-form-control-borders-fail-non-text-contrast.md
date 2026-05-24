# A11Y-016: Form control borders fail WCAG 1.4.11 Non-text Contrast (3:1)

**Status:** Resolved **WCAG:**

- 1.4.11 Non-text Contrast — Level AA (UI components must have at least 3:1
  contrast against adjacent colors) **Severity:** High (every textarea on every
  screen is affected, in both light and dark mode) **Location:**
- `src/components/Textarea.tsx` lines 5-6 (`base` className string applied to
  every `<textarea>`)
- `src/components/Button.tsx` lines 16-17 (`variant="secondary"` — same
  `border-slate-300 dark:border-slate-700` token)

Downstream consumers of the affected `Textarea`:

- `src/components/CopyBox.tsx` lines 67-75 (read-only textarea holding the
  invite URL / reply code)
- `src/screens/Offerer.tsx` lines 166-175 (the answer-input form)
- `src/components/Chat.tsx` lines 168-183 (the message composer)

## Problem

The `Textarea` primitive applies this `base` className to every instance:

```ts
const base =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:border-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
```

The 1px border is the **only** visual cue that there is an input field there in
the resting state. Yet the border-against-surface contrast fails 1.4.11 in both
color schemes:

- **Light mode:** `border-slate-300` (`#CBD5E1`) on `bg-white` (`#FFFFFF`).
- **Dark mode:** `dark:border-slate-700` (`#334155`) on `dark:bg-slate-900`
  (`#0F172A`).

### Worked math (WCAG 2.x relative-luminance formula)

Using `contrast = (L_lighter + 0.05) / (L_darker + 0.05)`:

| Mode  | Border                | Surface               | Border L | Surface L | Computed ratio                                      | 1.4.11 (3:1) |
| ----- | --------------------- | --------------------- | -------- | --------- | --------------------------------------------------- | ------------ |
| Light | `slate-300` `#CBD5E1` | white `#FFFFFF`       | ≈ 0.660  | 1.000     | `(1.0 + 0.05) / (0.660 + 0.05)` = **1.48 : 1**      | **FAIL**     |
| Dark  | `slate-700` `#334155` | `slate-900` `#0F172A` | ≈ 0.0518 | ≈ 0.00826 | `(0.0518 + 0.05) / (0.00826 + 0.05)` = **1.75 : 1** | **FAIL**     |

Both ratios are well under the 3:1 floor that 1.4.11 requires for UI components
(interactive controls and their state indicators).

### Why this is a 1.4.11 violation, not just an aesthetic concern

For users with low vision, the resting-state textarea is effectively invisible
against the page surface. The `focus-visible:border-sky-500` rule does raise
contrast on **keyboard** focus, but:

- `focus-visible` does **not** activate on mouse / touch focus, so pointer users
  get no visual delineation at all.
- Even keyboard users only see the field after they've tabbed onto it —
  discovering the field in the first place still requires resolving the failing
  1.48 / 1.75:1 border.

This affects every textarea in the product:

- `src/components/CopyBox.tsx` lines 67-75 — readonly textarea holding the
  invite URL / reply code, present on both Offerer and Answerer flows.
- `src/screens/Offerer.tsx` lines 166-175 — the answer-input form, the only way
  to complete the handshake.
- `src/components/Chat.tsx` lines 168-183 — the message composer, present on
  every connected chat session.

### Related: `<Button variant="secondary">` (same root cause)

`src/components/Button.tsx` lines 16-17:

```ts
secondary:
  'border border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800',
```

The secondary button shares the exact same
`border-slate-300 dark:border-slate-700` token against the same page surfaces,
so it inherits the same 1.48 / 1.75:1 ratios. The button **text** has sufficient
contrast (`text-slate-700` / `dark:text-slate-300`), so 1.4.3 is fine — but the
button's **boundary**, which is the only thing identifying it as a control
rather than a label, fails 1.4.11 with the same numbers as the Textarea. The fix
should be applied here in lockstep to keep the token cohesive and avoid a
partial repaint of the form chrome.

### Explicitly out of scope: decorative borders

The same `border-slate-300 dark:border-slate-700` token is also used in two
places that are **decorative chrome, not UI controls**, and 1.4.11 does not
require 3:1 for purely decorative borders. These should **not** be changed as
part of this ticket unless the implementer separately confirms it improves
rather than muddies the layout:

- `src/screens/Home.tsx` line 25 — the `<details>` "How does this work?"
  disclosure card border. The card is informational scaffolding; the disclosure
  summary is the actual control.
- `src/components/Divider.tsx` line 8 — the `border-t` flank on either side of
  the divider label. Marked `aria-hidden="true"`, purely visual.
- `src/design-system/DesignSystem.tsx` line 71 — the color-swatch chips on the
  `/#design-system` route. Decorative preview blocks.

Note the distinction in the implementation so the fix is **narrowly scoped to
form/control tokens** and doesn't inadvertently bump the visual weight of every
divider and card on the page.

## Intended behavior

Form input borders — and any control whose only resting-state visual delimiter
is a 1px border — should clear **≥ 3:1** contrast against their adjacent page
surface in both light and dark mode, **without** relying on `:focus`, `:hover`,
or `:focus-visible` state to bring them above the threshold.

## Suggested fix

### Light mode

Bump `border-slate-300` → `border-slate-400` for form/control tokens.

- `slate-400` = `#94A3B8`, luminance ≈ 0.30.
- Contrast vs white = `(1.0 + 0.05) / (0.30 + 0.05)` = **3.00 : 1** — meets the
  1.4.11 floor (just barely).
- For comfortable margin, consider `border-slate-500` (`#64748B`, luminance ≈
  0.151) → vs white = `(1.0 + 0.05) / (0.151 + 0.05)` ≈ **5.22 : 1**.
  (Originally estimated at 4.83:1; either way, well clear.)

Recommendation: start with `slate-400` for visual subtlety; if QA / design feels
the border still reads too lightly, step up to `slate-500`.

### Dark mode

Bump `dark:border-slate-700` → `dark:border-slate-500` for form/control tokens.

- `slate-500` = `#64748B`, luminance ≈ 0.151.
- `slate-900` luminance ≈ 0.00826.
- Contrast = `(0.151 + 0.05) / (0.00826 + 0.05)` ≈ **3.45 : 1** — passes 1.4.11.

### Apply to `<Button variant="secondary">`

Update `src/components/Button.tsx` lines 16-17 in the same change to use the new
control-border tokens. Same root cause, same fix; splitting the change would
leave the secondary button still failing.

### Verification step

After bumping the form/control tokens, visually inspect the three
decorative-only consumers (`Home <details>`, `Divider`, `DesignSystem` color
swatch) to make sure the change didn't bleed in (since those use the same
Tailwind utility class). If the decorative usages happen to inherit the change
and look heavy, narrow the fix by either:

- Introducing a new explicit token (e.g. a wrapper className) for form/control
  borders, leaving the decorative call sites on `slate-300 / slate-700`, **or**
- Hand-applying the bumped class only at the four control sites (`Textarea.tsx`,
  `Button.tsx` secondary, plus any future inputs).

The simpler global swap is fine if the decorative call sites still look right.

## Acceptance

- Resting-state `<textarea>` borders clear **≥ 3:1** contrast against the page
  surface in light mode (`bg-white`) and dark mode (`dark:bg-slate-900`).
- Resting-state `<Button variant="secondary">` borders clear **≥ 3:1** against
  the same surfaces.
- Existing `focus-visible:border-sky-500` +
  `focus-visible:ring-2 focus-visible:ring-sky-400` focus indicator behavior is
  preserved (do not regress A11Y-007).
- Decorative borders in `src/screens/Home.tsx` line 25,
  `src/components/Divider.tsx` line 8, and `src/design-system/DesignSystem.tsx`
  line 71 either remain on the original token, or were intentionally bumped
  after visual review — not changed by accident.
- Verified with an automated checker (axe DevTools / Chrome DevTools color
  picker / Wave) against:
  - `CopyBox` on the Offerer and Answerer screens
  - The `Offerer` answer-input textarea
  - The `Chat` composer textarea
  - A `<Button variant="secondary">` example (the `/#design-system` route
    renders one) in both light and dark mode (toggle via OS appearance setting —
    see commit `be3732b` for how OS-driven dark mode is wired up).
- No regressions in `Textarea.test.tsx`, `Button.test.tsx`, or any design-system
  tests; if a test asserts the literal `border-slate-300` /
  `dark:border-slate-700` class on a control, update it to the new token.

## Working notes

### Reproduction confirmed

The failing tokens were still in place at `src/components/Textarea.tsx:6` and
`src/components/Button.tsx:17` exactly as described. The same
`slate-300 / slate-700` token also appears at several decorative call sites
(Divider flank, Home `<details>`, DesignSystem color swatch, DesignSystem
`<Section>` rule, Chat transcript scroll container, dashed empty-state in
DesignSystem) — left untouched per the ticket's explicit scope.

### Fix applied

- `src/components/Textarea.tsx`: `border-slate-300 dark:border-slate-700` →
  `border-slate-400 dark:border-slate-500`. Comment added explaining the math +
  the scoping decision.
- `src/components/Button.tsx` (`secondary` variant): same swap, in lockstep,
  with a matching comment.
- Tests updated to assert the new tokens (and to explicitly verify
  `dark:border-slate-500`, which wasn't covered before):
  - `src/components/Textarea.test.tsx`
  - `src/components/Button.test.tsx`

### Resulting contrast ratios

- Light: `slate-400` (#94A3B8, L≈0.30) on white → `(1.0 + 0.05) / (0.30 + 0.05)`
  = **3.00 : 1** PASS.
- Dark: `slate-500` (#64748B, L≈0.151) on `slate-900` (L≈0.00826) →
  `(0.151 + 0.05) / (0.00826 + 0.05)` ≈ **3.45 : 1** PASS.
- Focus ring (`focus-visible:border-sky-500` +
  `focus-visible:ring-2 focus-visible:ring-sky-400`) is preserved — only the
  resting-state token moved, so A11Y-007 is not regressed.

### Verification

- `npm test` → 125/125 pass (18 files).
- `npm run typecheck` → clean.
- `npm run lint` → clean.
- Decorative call sites (Divider, Home `<details>`, DesignSystem swatch /
  Section / dashed empty-state, Chat transcript container) were inspected and
  intentionally left on `slate-300 / slate-700` so they continue to read as
  subtle chrome and don't visually compete with the now-stronger control
  borders.
