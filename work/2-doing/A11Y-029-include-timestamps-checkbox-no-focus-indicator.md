---
id: A11Y-029
type: a11y
status: in-progress
created: 2026-05-24
---

# A11Y-029: Chat "Include timestamps" checkbox has no visible focus indicator

**WCAG:**

- 2.4.7 Focus Visible — Level AA
- 2.4.11 Focus Not Obscured (Minimum) — Level AA (WCAG 2.2, adjacent)

**Severity:** Medium — keyboard users tabbing through the chat toolbar (toggle →
Copy button → transcript → composer) get no signal when focus lands on the
"Include timestamps" checkbox. The visible state of the checkbox (checked /
unchecked) is observable, but the focused-vs-not state is invisible because
Tailwind v4 preflight resets the browser default focus outline and
`accent-sky-700` only colors the check fill.

**Location:** `src/components/Chat.tsx:251–257` — the native checkbox inside the
"Include timestamps" label, just above the chat transcript.

```tsx
// lines 251–257
<input
  type="checkbox"
  checked={includeTimestamps}
  onChange={(e) => setIncludeTimestamps(e.target.checked)}
  aria-describedby={copyHintId}
  className="h-4 w-4 cursor-pointer accent-sky-700"
/>
```

## Problem

Tailwind v4's preflight (`@tailwindcss/preflight`) resets `outline: none` on all
elements implicitly, and our app then opts back in to a custom focus-visible
style on every other interactive element. This checkbox didn't opt back in:

- `h-4 w-4 cursor-pointer` is geometry + cursor only.
- `accent-sky-700` changes the **check fill color** (the painted check inside
  the box when `checked={true}`). It does **not** add a focus indicator.
- No `focus`, `focus-visible`, `outline`, or `ring` utilities are present.

So when a keyboard user tabs to the checkbox, the browser's default focus ring
is suppressed by preflight, and nothing else paints. The checkbox is focused —
Space toggles it — but the user has no visual signal that focus has landed.

A11Y-017 (resolved, commit e72672b) standardized the app's focus-visible
treatment as:

```
focus-visible:outline-none
focus-visible:ring-2 focus-visible:ring-sky-400
focus-visible:ring-offset-2
focus-visible:ring-offset-stone-50 dark:focus-visible:ring-offset-stone-900
```

That pattern is now on Button (since A11Y-007), Heading (since A11Y-017), the
Textarea primitive (A11Y-007), the chat transcript wrapper (A11Y-021), and the
EmptyState "Back to home" link in Network.tsx (`focus-visible:` classes at line
240). It is the canonical token for "this element has keyboard focus."

This checkbox is the same shape of interactive element with the same keyboard
contract; it needs the same indicator.

## Suggested fix

Add the canonical focus-visible ring tokens to the checkbox's `className`:

```diff
  <input
    type="checkbox"
    checked={includeTimestamps}
    onChange={(e) => setIncludeTimestamps(e.target.checked)}
    aria-describedby={copyHintId}
-   className="h-4 w-4 cursor-pointer accent-sky-700"
+   className="h-4 w-4 cursor-pointer accent-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-50 dark:focus-visible:ring-offset-stone-900"
  />
```

That's the entire change. The ring renders around the 16×16 (h-4 w-4) checkbox
square; the 2px offset gives the ring breathing room from the checkbox's border
so it stays visible on both light and dark surfaces. The ring-offset-color
matches the page surface tokens established by A11Y-017.

### Why `focus-visible` (not `focus`)

`focus-visible` only paints when the user is in a keyboard interaction context,
not when the checkbox is clicked. That matches every other interactive in the
app and avoids the mouse-user noise of a persistent focus ring after click. Same
idiom as Button / Heading / Textarea / chat transcript.

### Why not extract to a Checkbox primitive

Eventually, yes — the design system should have a `Checkbox` primitive that
bakes the token discipline in (same argument as the `Input` primitive mentioned
in A11Y-026). Out of scope for this ticket; capture as a separate IMPRV
follow-up if the design-system team agrees.

## Acceptance

- The `<input type="checkbox">` at `src/components/Chat.tsx:251–257` carries
  `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-50 dark:focus-visible:ring-offset-stone-900`
  (in addition to its existing `h-4 w-4 cursor-pointer accent-sky-700`).
- The checkbox's `type`, `checked`, `onChange`, and `aria-describedby` are
  preserved unchanged.
- A test in `src/components/Chat.test.tsx` asserts the focus-visible classes are
  present on the checkbox (pattern matches the A11Y-021 / A11Y-017 focus-visible
  token assertions).
- The existing FEAT-011 toolbar tests (checkbox toggles state, Copy uses
  `includeTimestamps`) pass unchanged.
- `npm test`, `npm run lint`, `npm run typecheck` clean.
- Manual smoke: open the chat surface (Design System Chat preview or a live
  Connected session). Tab to the checkbox. Confirm a visible sky-400 focus ring
  with 2px offset against both light and dark page surface.

## Related work

- **A11Y-017** (resolved, commit e72672b) — established the canonical
  focus-visible ring token used here.
- **A11Y-007** (resolved, commit c33fc06) — focus-visible on textareas / inputs;
  same pattern.
- **A11Y-021** (resolved, commit ac5c085) — focus-visible on the chat transcript
  wrapper.
- **FEAT-011** (resolved) — introduced this checkbox as part of the
  copy-transcript toolbar.

## Working

**2026-05-24** — Token-level fix per the suggested diff. The checkbox at
`src/components/Chat.tsx:251–257` now appends the canonical A11Y-017
focus-visible tokens
(`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-50 dark:focus-visible:ring-offset-stone-900`)
to its existing className. Added a Chat test that asserts each of the six token
fragments. `npm test` → 378/378. Lint + typecheck clean.
