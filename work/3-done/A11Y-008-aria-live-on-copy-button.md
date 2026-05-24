# A11Y-008: `aria-live="polite"` placed on the interactive Copy button

**Status:** Resolved **WCAG:** 4.1.3 Status Messages (Level AA), 4.1.2 Name,
Role, Value (Level A) **Severity:** Medium **Location:**
`src/components/CopyBox.tsx` (lines 43-49)

## Problem

```tsx
<button type="button" onClick={onCopy} className="..." aria-live="polite">
  {copied ? 'Copied!' : 'Copy'}
</button>
```

`aria-live` is set on the `<button>` itself, and the button's text content flips
between "Copy" and "Copied!" for 1500ms after activation. Placing a live region
on a focusable interactive control is a known misuse pattern:

- Behavior is inconsistent across screen readers. Some announce the whole new
  accessible name; some debounce; some say nothing because the element is
  currently focused.
- After clicking, focus typically stays on the button. The accessible-name
  change from "Copy" → "Copied!" can be heard as the button itself changing
  identity (i.e. the user thinks a different control just appeared under their
  focus).
- The label reverts after 1500ms, which can trigger a second name-change
  announcement.

Per WCAG 4.1.3 Status Messages, success feedback like "copied" should be
conveyed via a status message that does not change focus and does not require
the user to interact with a new control. Per 4.1.2, an interactive element's
accessible name should be stable enough that the user recognizes it across
interactions.

## Intended behavior

The user activates Copy, the contents are copied, and they receive a polite
confirmation that the copy succeeded — without the Copy button itself appearing
to morph into a different control.

## Suggested fix

Keep the button label stable and emit the status from a separate live region:

```tsx
const [copied, setCopied] = useState(false)

return (
  <>
    <button type="button" onClick={onCopy} className="...">
      Copy
    </button>
    <span role="status" aria-live="polite" className="sr-only">
      {copied ? `${label} copied to clipboard` : ''}
    </span>
  </>
)
```

If a visible "Copied!" indication is desired for sighted users, render it as a
sibling badge or icon next to the button rather than by replacing the button
label.

## Working notes

- Confirmed issue still present in `src/components/CopyBox.tsx` at lines 45-51:
  `aria-live="polite"` is on the `<button>` itself and the label flips between
  `Copy` and `Copied!`.
- CopyBox is consumed by `src/screens/Joiner.tsx` and `src/screens/Offerer.tsx`.
  No existing test file targets CopyBox directly, so the change is non-breaking
  for tests.
- Tailwind v4 is in use (see `src/index.css` `@import "tailwindcss"`), which
  provides the `sr-only` utility out of the box (already used in
  `src/components/Chat.tsx`).
- Fix: keep the button label stable as "Copy" and emit the success message from
  a sibling `<span role="status" aria-live="polite" className="sr-only">`. The
  visible "Copied!" affordance for sighted users is preserved as a small badge
  sibling so the visual feedback is not regressed, while the button's accessible
  name stays stable.
- Also removed `aria-live="polite"` from the button to satisfy 4.1.2 (stable
  accessible name) and 4.1.3 (status messages routed through a dedicated live
  region).
