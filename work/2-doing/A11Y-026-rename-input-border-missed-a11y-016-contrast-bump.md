---
id: A11Y-026
type: a11y
status: in-progress
created: 2026-05-24
---

# A11Y-026: Rename input border in ConversationRow fails 1.4.11 non-text contrast (missed by A11Y-016)

**WCAG:**

- 1.4.11 Non-text Contrast — Level AA

**Severity:** Medium — the rename input is a real form control whose border must
clear 3:1 against the page surface so users can perceive its boundary. A11Y-016
already paid the cost of getting the Textarea primitive and Button secondary
borders right; this raw `<input>` was missed because it's not the primitive.

**Location:** `src/screens/Home.tsx:266–281` — the inline rename `<input>`
rendered when the user clicks Rename in the row's More-actions menu. The
relevant border classes are at line 280:

```tsx
className =
  'flex-1 rounded border border-stone-300 bg-white px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-800'
```

## Problem

A11Y-016 (resolved, commit 7008835) bumped form-control resting-state border
tokens from `slate-300 / slate-700` (≈1.48 / ≈1.75:1) to `slate-400 / slate-500`
(≈3.00 / ≈3.45:1) so control boundaries clear WCAG 1.4.11's 3:1 non-text
contrast floor in light and dark mode. The bump landed on the Textarea primitive
and Button (secondary). Then FEAT-009 migrated `slate-*` → `stone-*` across the
whole app (commit at the journal entry on 2026-05-23), so the post-fix tokens
are now `stone-400 / stone-500`.

The rename input at `src/screens/Home.tsx:280` uses `border-stone-300` (light)
and `dark:border-stone-600` (dark):

- `border-stone-300` against the `bg-white` input surface is ≈1.48:1 — fails AA
  3:1 by a wide margin.
- `dark:border-stone-600` against `dark:bg-stone-800` is ≈2.4:1 — still fails AA
  3:1.

This control was missed because it's not the shared Textarea primitive — it's a
raw `<input>` declared inline inside `ConversationRow`. When A11Y-016 swept the
design-system controls, it only touched the primitives in `src/components/`.

Functionally the input works, but users with reduced contrast sensitivity
(common with age-related vision change and low-vision conditions) can't see the
input boundary clearly, particularly in light mode where the border is nearly
invisible against the white field.

## Suggested fix

**Minimal fix:** bump the border tokens to match the post-A11Y-016 form-control
tokens:

```diff
- className="flex-1 rounded border border-stone-300 bg-white px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-800"
+ className="flex-1 rounded border border-stone-400 bg-white px-2 py-1 text-sm dark:border-stone-500 dark:bg-stone-800"
```

That's the entire change. `stone-400` on white is ≈3.00:1, `stone-500` on
`stone-800` is ≈3.45:1 (the same numbers A11Y-016 computed for the slate
variants, which carry to stone since the perceptual lightness curve is identical
between the two Tailwind neutrals).

**Decision (2026-05-24): no `Input` primitive follow-up.** The rename input is
the only raw `<input>` site in the app today; extracting a primitive on a single
consumer is YAGNI. File the primitive when a second consumer appears.

Note: the rename input also lacks the
`focus-visible:ring-2 focus-visible:ring-sky-400` treatment A11Y-007 / A11Y-017
standardized for form controls. That defect is out of scope for this ticket
(which is specifically the 1.4.11 contrast regression); a separate A11Y issue
should capture it if the gap matters.

## Acceptance

- The rename input border at `src/screens/Home.tsx:280` uses `border-stone-400`
  (light) and `dark:border-stone-500` (dark).
- The other classes on the input
  (`flex-1 rounded bg-white px-2 py-1 text-sm dark:bg-stone-800`) are preserved
  unchanged.
- A test in the Home tests asserts the rename input carries `border-stone-400`
  and `dark:border-stone-500` so a future tweak that drops back to `stone-300` /
  `stone-600` regresses loudly. (Same shape as A11Y-016's `Textarea` token
  assertion.)
- `npm test`, `npm run lint`, `npm run typecheck` clean.
- Manual smoke (light + dark): focus into a conversation row → click ⋯ → click
  Rename → verify the input border is clearly visible against both the white
  field (light) and stone-800 field (dark). The border should be perceptible at
  a normal viewing distance without zooming.

## Related work

- **A11Y-016** (resolved, commit 7008835) — bumped form-control borders to the
  3:1-passing tokens. Missed this site.
- **FEAT-009** (resolved) — migrated `slate-*` → `stone-*` across the app; the
  post-A11Y-016 tokens are now `stone-400 / stone-500`.
- **A11Y-007** (resolved) — established the form-control focus-visible treatment
  that the future `Input` primitive should also adopt.
- **A11Y-017** (resolved) — Heading focus-visible token discipline; same pattern
  argues for a shared `Input` primitive over inline classNames.

## Working

**2026-05-24** — Minimal token bump. `src/screens/Home.tsx` rename input
className changed `border-stone-300 → border-stone-400` and
`dark:border-stone-600 → dark:border-stone-500`. Added a Home test asserting the
new tokens (mirrors the Textarea / Button A11Y-016 assertions). `npm test` →
374/374 pass. Lint + typecheck clean.
