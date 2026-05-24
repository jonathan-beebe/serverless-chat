# A11Y-007: Insufficient focus indicator on textareas and inputs

**Status:** Resolved **WCAG:** 2.4.7 Focus Visible (Level AA), 2.4.11 Focus
Appearance (Level AA, WCAG 2.2) **Severity:** Medium **Location:**
`src/components/CopyBox.tsx` (line 38), `src/screens/Offerer.tsx` (line 88),
`src/components/Chat.tsx` (line 60)

## Problem

Every editable field uses the same pattern:

```
focus:outline-none focus:border-sky-500
```

The browser default focus outline is suppressed and replaced with a 1px
border-color change (`border-slate-700` → `border-sky-500`). On the dark
`bg-slate-900` background, a one-pixel hue swap is the entire focus signal.
There is no outline, ring, or thickness change.

For low-vision users this is insufficient under:

- **2.4.7 Focus Visible (AA)** — a focus indicator must be visible. A 1px
  border-color swap of similar luminance is widely judged as too subtle to
  satisfy this in practice.
- **2.4.11 Focus Appearance (AA, WCAG 2.2)** — requires a minimum area and
  contrast change between focused and unfocused states. A single-pixel border
  color change of similar luminance does not meet the contrast-area test.

Buttons in the same UI already use
`focus-visible:ring-2 focus-visible:ring-sky-400`, so the regression is specific
to inputs/textareas.

## Intended behavior

Inputs and textareas should present a clearly visible focus indicator with a
contrast change of at least 3:1 against the unfocused state, covering at least
the WCAG 2.4.11 minimum area.

## Suggested fix

Match the button pattern. For each input/textarea, replace
`focus:outline-none focus:border-sky-500` with:

```
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:border-sky-500
```

(or use
`focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400`
if you prefer outlines to rings). Keep the border-color change as a secondary
cue if desired, but the primary indicator should be a visible ring of ≥2px.

Use `focus-visible:` rather than `focus:` so mouse-clicking the field doesn't
show a ring.

## Working notes

- Confirmed the issue exists at all three reported locations as of HEAD:
  - `src/components/CopyBox.tsx:40` (readonly textarea for invite URL / reply
    code)
  - `src/screens/Offerer.tsx:101` (answer-paste textarea)
  - `src/components/Chat.tsx:88` (chat message input) — ticket said line 60, but
    the field is at line 88; the textContent matches.
- Each had identical `focus:border-sky-500 focus:outline-none`, producing only a
  1px slate→sky border swap on dark `bg-slate-900` — well below WCAG 2.4.7 /
  2.4.11 thresholds.
- Buttons in the same files already use
  `focus-visible:ring-2 focus-visible:ring-sky-400`, so this fix simply brings
  inputs to parity.
- Applied the ticket's suggested fix verbatim on all three elements: swapped
  `focus:` → `focus-visible:` and added
  `focus-visible:ring-2 focus-visible:ring-sky-400`. The border-color cue is
  retained (also under `focus-visible:`) as a secondary indicator. Using
  `focus-visible:` means mouse-click focus stays quiet while keyboard focus
  shows the ring.
- No test changes needed — focus styling is a CSS concern with no
  JSDOM-observable behavior, and existing 45 tests still pass. Typecheck and
  lint clean.
