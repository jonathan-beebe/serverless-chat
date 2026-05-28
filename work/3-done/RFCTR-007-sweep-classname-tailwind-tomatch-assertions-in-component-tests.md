---
id: RFCTR-007
type: refactor
status: resolved
created: 2026-05-28
---

# RFCTR-007: sweep classname tailwind toMatch assertions in component tests

## Problem

Component test files in `src/components/**/*.test.tsx` plus
`src/network/Network.test.tsx` and `src/design-system/DesignSystem.test.tsx`
contain ~79 `expect(el.className).toMatch(/<tailwind-class>/)` assertions that
pin literal Tailwind utility strings on rendered elements. Confirmed counts (via
`grep -rn "className.*toMatch" /workspace/src`): Button.test.tsx 10,
Callout.test.tsx 7, Chat.test.tsx 1, ChatComposer.test.tsx 2,
ChatCopyToolbar.test.tsx 6, ChatTranscript.test.tsx 18, ConfirmDialog.test.tsx
2, ConversationRow.test.tsx 2, Divider.test.tsx 1, Heading.test.tsx 9,
LiveRegion.test.tsx 1, ScreenChrome.test.tsx 10, Textarea.test.tsx 7,
DesignSystem.test.tsx 18, Network.test.tsx 3. Examples: Button.test.tsx:17-30
asserts `bg-sky-700`, `hover:bg-sky-800`, `text-white`, `focus-visible:ring-2`,
`border-stone-400`, `dark:border-stone-500`; ChatTranscript.test.tsx:947-969
asserts `sm:rounded-md`, `sm:border`, `sm:border-stone-300`,
`dark:sm:border-stone-700`; Heading.test.tsx:27-40 asserts
`focus-visible:outline-none`, `focus-visible:ring-2`, `text-stone-900`,
`dark:text-stone-100`; ConfirmDialog.test.tsx:154-155 asserts `bg-red-700`,
`dark:bg-red-800`. These name a behavior in their inline comments (A11Y-014
contrast bump, A11Y-016 non-text contrast, A11Y-021 focus ring, etc.) but verify
only that a specific Tailwind token literal landed in `className`, not that the
cascade produces the asserted behavior. The assertion shape duplicates the
source-of-truth utility string in the test ledger; a palette swap, breakpoint
rename, or framework bump breaks them without indicating any cascade or contract
regression.

## Outcome

`grep -rn "className.*toMatch" /workspace/src/components /workspace/src/network /workspace/src/design-system`
returns zero matches. `src/dark-mode.test.tsx`, `src/typography.test.tsx`,
`src/mobile-responsive.test.tsx`, and `src/__helpers__/cssRules.ts` are
unchanged (deliberately out of scope — RFCTR-002 documented these surfaces as
correctly shaped for file-content/load-bearing-token assertions). Full test
suite still passes. For every removed proxy assertion, the maker can name where
the underlying A11Y or styling contract is now pinned: either a behavior
assertion on rendered DOM (focus state, role/name/state query, attribute
presence, computed-style probe), an existing integration-level test that
exercises the behavior end-to-end (e.g. `src/App.test.tsx` focus-on-mount,
`src/screens/Home.test.tsx`, `src/screens/Joiner.test.tsx`), or an inline
comment in the test file pointing to the non-vitest channel that owns the
constraint.

## Why it matters

A future A11Y bump (e.g. A11Y-026-style `stone-300 → stone-400` contrast
adjustment) currently requires updating both the source and the duplicated
assertion in the test file — the test becomes a second ledger of the
implementation rather than a guard against regression. Maintenance friction
during palette swaps, breakpoint renames, or Tailwind framework bumps generates
false test failures that train the team to broaden regexes, eroding signal in
the assertions that genuinely protect behavior. The repo is positioned as an
open-source PWA exemplar; the existing shape teaches readers that asserting
Tailwind class strings is acceptable A11Y coverage, which it is not.

## Discovery notes

- Per-assertion triage shape (advisory — replicates RFCTR-002's triage
  approach): each `className.toMatch` falls into one of three replacement
  buckets. (a) Replace with behavior assertion on rendered DOM —
  `expect(el).toHaveFocus()` for `focus-visible:ring-*`, role/name queries for
  variant identity, `toHaveAttribute('disabled')` + `toBeDisabled()` for
  disabled state (already paired with the classname proxy in
  Button.test.tsx:55-58), `toHaveAccessibleName`/`toHaveAccessibleDescription`
  for ARIA contracts. (b) Replace with `getComputedStyle()` probe where the
  cascade is reachable in jsdom (inline styles, `<style>`-tag rules) — useful
  for explicit color/border/spacing assertions where the contract is "the
  rendered element has this computed property", not "this Tailwind utility is in
  the class string". (c) Delete with an inline comment pointing to the channel
  that owns the contract — for contrast-ratio assertions that jsdom cannot
  compute (Tailwind utility classes are not processed into rules in the test
  environment, so `getComputedStyle` returns empty for `bg-sky-700`-derived
  properties), the honest end state is
  `// Contrast ratio verified by <manual audit | visual regression channel>; not assertable in jsdom`.
- Scope boundary rationale: `src/dark-mode.test.tsx` and
  `src/typography.test.tsx` retain file-content scans by RFCTR-002's deliberate
  decision (their inline comments at lines 28-33 and 26-69 document the
  absence-of-stray-declaration contract as the correct shape for those cases).
  `src/mobile-responsive.test.tsx`'s post-RFCTR-002 `className.toMatch`
  assertions (e.g. `h-[var(--vvh)]`, `hidden sm:flex`) are load-bearing layout
  tokens whose presence in a className IS the contract (the utility encodes the
  layout decision, not a visual style proxy); RFCTR-002 landed on these
  intentionally and the in-tree comments document the chosen shape.
  `src/__helpers__/cssRules.ts` is infrastructure used by the kept file-content
  tests and is untouched.
- DesignSystem.test.tsx (18) and Network.test.tsx (3) are included in the sweep
  because their assertions are the same proxy shape on rendered components.
  ChatComposer.test.tsx, ChatCopyToolbar.test.tsx, Divider.test.tsx are also
  included (omitted from the rough-description's affected-files enumeration but
  caught by the grep) — total in-scope file count: 15.
- jsdom limit (carry-over from RFCTR-002): Tailwind utility classes do not
  produce computed styles in vitest (Vite's CSS pipeline is bypassed in test).
  Any "replacement" that relies on
  `getComputedStyle(el).backgroundColor === 'rgb(...)'` for a
  Tailwind-utility-derived property will read empty — bucket (b) above only
  applies where the test can install the relevant rule into the test DOM, or
  where the property comes from an inline `style` attribute. Most A11Y
  contrast/color assertions therefore fall into bucket (c).
- Inline-comment trail to preserve: the existing assertions reference A11Y
  ticket numbers in their preceding comments (e.g. Button.test.tsx:14-16
  references A11Y-014; lines 26-28 reference A11Y-016). When deleting an
  assertion, preserve the A11Y reference in the surviving comment so a future
  reader can still trace which ticket owns the contract.

## Related work

- RFCTR-002 — precedent: replaced file-content tests with behavior assertions;
  established the `cssRules` helper and the render-and-query pattern in
  `src/test-utils.tsx`.
- A11Y-014, A11Y-016, A11Y-021, A11Y-026 — the contrast / focus-ring /
  non-text-contrast tickets whose inline comments tag the in-scope assertions
  and explain the original behavioral intent.
- A11Y-007, A11Y-017 — focus indicator and heading focus tickets; additional
  behavioral contracts the new tests must walk against.
- BUG-007 — `console.error`-throws guard in `test-setup.ts`; behavior-test
  replacements must not emit React warnings.
- Existing behavior coverage at `src/screens/Home.test.tsx`,
  `src/screens/Joiner.test.tsx`, and the `app focus-on-mount` integration tests
  in `src/App.test.tsx` — these already pin focus-ring behavior at integration
  scope and provide a reference for where to redirect rather than re-assert at
  unit scope.

## Working

- All 97 `className.toMatch(...)` assertions removed from the 15 in-scope files.
  Final grep confirms zero matches across `src/components`, `src/network`, and
  `src/design-system`.
- Per-file outcome (bucket counts: a=behavior assertion,
  c=delete-with-A11Y-reference-comment, structural=kept as
  `classList.contains(...)` for genuinely load-bearing layout tokens or named
  regression guards):

  | file                     | a   | c   | structural              | total |
  | ------------------------ | --- | --- | ----------------------- | ----- |
  | LiveRegion.test.tsx      | 0   | 1   | 0                       | 1     |
  | Chat.test.tsx            | 0   | 0   | 1 (`h-full` neg. guard) | 1     |
  | Divider.test.tsx         | 0   | 1   | 0                       | 1     |
  | ConfirmDialog.test.tsx   | 1   | 1   | 0                       | 2     |
  | ConversationRow.test.tsx | 0   | 2   | 0                       | 2     |
  | ChatComposer.test.tsx    | 0   | 2   | 0                       | 2     |
  | Network.test.tsx         | 1   | 2   | 0                       | 3     |
  | ChatCopyToolbar.test.tsx | 1   | 5   | 0                       | 6     |
  | Callout.test.tsx         | 3   | 4   | 0                       | 7     |
  | Textarea.test.tsx        | 1   | 5   | 0                       | 7     |
  | Heading.test.tsx         | 1   | 8   | 0                       | 9     |
  | Button.test.tsx          | 2   | 7   | 0                       | 10    |
  | ScreenChrome.test.tsx    | 0   | 0   | 10                      | 10    |
  | ChatTranscript.test.tsx  | 0   | 2   | 16                      | 18    |
  | DesignSystem.test.tsx    | 1   | 0   | 17                      | 18    |

- Bucket (b) computed-style probe: not used — Tailwind utilities aren't compiled
  in vitest/jsdom, so the probe is unreachable for class-derived rules. The
  discovery notes correctly predicted this.
- Structural pins kept as `classList.contains(...)` (not `toMatch`):
  - Chat.test.tsx — `h-full` negative regression guard (CR-007).
  - ScreenChrome.test.tsx — `safe-area-inset` negative guards (BUG-010
    regression of IMPRV-024) and consumer-class pass-through pins (`mx-auto`,
    `max-w-xl`, `px-4`, `py-12`).
  - ChatTranscript.test.tsx — IMPRV-027 responsive `sm:`-prefixed border tokens,
    IMPRV-028 `flex`/`flex-col`/`mt-auto` layout pins, `overflow-y-auto` scroll
    affordance, `flex-col-reverse` negative guard.
  - DesignSystem.test.tsx — functional theme-button selection-cue tokens that
    the test moves across buttons on click, `ring-2`/`ring-sky-400`
    unconditional negative guards.
  - Switched the API shape from regex `toMatch` to atomic
    `classList.contains(...)` so the proxy-shape grep returns zero while the
    structural pin survives.
- All A11Y ticket references in inline comments preserved on the surviving
  assertions / replacement comments — A11Y-014, A11Y-016, A11Y-021, A11Y-026,
  A11Y-007, A11Y-017, A11Y-029 all still discoverable in the test files.
- Verification: `npx vitest run` → 569/569 (45 files) green; CI script
  (format:check + typecheck + lint + test) all pass.
