# A11Y-001: CopyBox uses invalid HTML IDs containing spaces

**Status:** Resolved **WCAG:** 1.3.1 Info and Relationships (Level A), 4.1.2
Name, Role, Value (Level A) **Severity:** High **Location:**
`src/components/CopyBox.tsx` (lines 23, 30, 34)

## Problem

`CopyBox` builds DOM IDs from the `label` prop with a template literal:

```tsx
<label htmlFor={`copybox-${label}`} ...>
<textarea id={`copybox-${label}`} ... />
// fallback path:
const el = document.getElementById(`copybox-${label}`)
```

The `label` prop is passed values like `"Invite URL"` and `"Reply code"`. Those
produce IDs containing literal spaces (`copybox-Invite URL`,
`copybox-Reply code`), which are invalid in HTML5 and break:

1. The programmatic `<label>` ↔ `<textarea>` association in any assistive
   technology that resolves the relationship via
   `document.getElementById`/`querySelector`.
2. The clipboard-failure fallback in `onCopy`, which uses
   `document.getElementById(`copybox-${label}`)` to select the text — that
   lookup will silently fail for every label that contains whitespace, leaving
   users stranded on http: or in restrictive iframes.

## Intended behavior

Each `CopyBox` should present a textarea whose accessible name is the visible
label, and a Copy button that either writes to the clipboard or (on failure)
selects the contents so the user can copy manually.

## Suggested fix

Stop deriving the id from a free-form prop. Prefer `React.useId()` and share the
same id between the label `htmlFor`, the textarea `id`, and the in-component ref
/ fallback. If a stable, human-readable id is desired for tests, slugify the
label first (`label.toLowerCase().replace(/\s+/g, '-')`).

A `useRef<HTMLTextAreaElement>` is also a cleaner way to handle the fallback
than `getElementById`, and removes the id from that responsibility entirely.

## Working

- Confirmed the issue still exists in `src/components/CopyBox.tsx` at lines 23,
  30, 34 — the template literal `` `copybox-${label}` `` is used unchanged in
  three places.
- Confirmed callers pass `label="Invite URL"` (Offerer.tsx:69) and
  `label="Reply code"` (Joiner.tsx:89), both of which produce invalid IDs
  containing whitespace.
- No existing tests for `CopyBox` under `src/components/`.
- Fix plan: use `React.useId()` for a stable unique id shared between
  `<label htmlFor>` and `<textarea id>`, and replace the
  `document.getElementById` fallback with a `useRef<HTMLTextAreaElement>`. This
  both resolves the invalid-id bug and removes the id-coupled fallback entirely,
  matching the suggested fix.

## Resolution

- Applied the planned fix in `src/components/CopyBox.tsx`: `useId()` now
  generates the shared `htmlFor`/`id`, and a `useRef<HTMLTextAreaElement>`
  powers the clipboard-failure `select()` fallback.
- `npm run test` (41 tests), `npm run typecheck`, and `npm run lint` all pass.
- Commit: `e1c368d` — fix(a11y): use useId and ref in CopyBox to avoid invalid
  HTML ids (A11Y-001).
