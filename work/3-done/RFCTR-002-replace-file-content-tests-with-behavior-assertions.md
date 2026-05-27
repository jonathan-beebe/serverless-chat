---
id: RFCTR-002
type: refactor
status: resolved
created: 2026-05-27
---

# RFCTR-002: replace file-content tests with behavior assertions

## Problem

`src/mobile-responsive.test.tsx` (213 lines, 16 `it` blocks) is structured as
`readFileSync('index.html' | 'src/index.css' | 'src/screens/Offerer.tsx' | 'src/screens/Joiner.tsx' | 'src/components/Chat.tsx' | 'src/components/UpdatePrompt.tsx' | 'src/hooks/useVisualViewportHeight.ts')`
followed by `expect(content).toMatch(/.../)` against the raw source bytes. The
two sibling files use the same pattern: `src/dark-mode.test.tsx` (42 lines, 3
`it` blocks — two file-content, one render-with-providers),
`src/typography.test.tsx` (55 lines, 3 `it` blocks — all file-content, including
a recursive walk of `src/` + `public/`). During IMPRV-025, a positional
Tailwind-utility regex against `Chat.tsx`'s time/delivery span broke because
Prettier reordered tokens inside the className template literal; the workaround
now in-tree at `mobile-responsive.test.tsx:193-196` finds the span via a
load-bearing token (`self-end`) and asserts other tokens separately, with an
inline comment "Token order inside the literal is not load-bearing — Prettier
may reorder Tailwind utilities". Other tests in the file still embed positional
matchers (e.g. `pt-6` then `pb-[max(...)]` adjacency, `flex-1` then
`overflow-y-auto` then `overscroll-contain` ordering inside a single regex at
line 178) and remain fragile.

## Outcome

Reordering Tailwind utility tokens inside any className, reflowing whitespace
inside a `<div className="…">` block, restating a CSS declaration order inside a
rule, or moving a comment does not break any test in
`mobile-responsive.test.tsx` / `dark-mode.test.tsx` / `typography.test.tsx`.
Tests fail only when the observable behavior (attribute presence on a rendered
element, an `env(safe-area-inset-*)` token actually appearing in a className, a
CSS property holding a particular value on the document) changes. A
`prettier --write` over the whole repo with no other change runs the suite
green.

## Why it matters

Every mobile/CSS refactor pays a tax in false test failures — IMPRV-025 already
burned that toll once mid-ticket. The repo is positioned as an open-source PWA
exemplar; the existing pattern teaches readers to assert source-file substrings,
which is the wrong shape for behavior coverage. Each false positive costs a
context switch to confirm the failure is cosmetic, and the recovery (broaden the
regex) tends to erode the test's signal over time.

## Discovery notes

- **Per-assertion triage of the 16 `it` blocks in
  `mobile-responsive.test.tsx`:**
  - **(a) Behavior-testable via render: 7 blocks** — the four Offerer/Joiner
    `useVisualViewportHeight` mount + `h-[var(--vvh)]` + `pt-6` +
    `pb-[max(...)]` + `pb-1`-absent assertions (render the connected branch with
    stub session in `state: 'connected'`, read the wrapper's `className`); the
    `Chat.tsx` toolbar `hidden sm:flex` + transcript `overscroll-contain` +
    message-text `select-text` + time-span `select-none` + Home "Copy
    transcript" not-`hidden` assertions (render `<Chat>` / `<Home>` with a stub
    session containing ≥1 message, query by role/testid, read `className`).
  - **(b) Static-asset / document-state assertable: 6 blocks** — `index.html`
    viewport-meta and CSS rules in `index.css`
    (`@media (hover:none)(pointer:coarse) { input { font-size: 16px } }`,
    `:root { --vvh: 100dvh }`, `body { overscroll-behavior-y: contain }`,
    `html { -webkit-tap-highlight-color: transparent }`,
    `button [role=button] { touch-action: manipulation }`). `index.html` meta is
    straightforwardly assertable by parsing `document.documentElement.outerHTML`
    after a jsdom load OR by reading the file (no Prettier reorder risk on
    `<meta>`). `index.css` rules are NOT computed onto elements by jsdom — jsdom
    parses `<style>` tags but Vite's CSS pipeline never feeds `index.css` into
    the test environment, so
    `getComputedStyle(document.body).overscrollBehaviorY` returns `''` in the
    current setup. Two routes available: (i) read the CSS file once and parse it
    via a real CSS parser (postcss / `CSSStyleSheet`) then assert on the AST so
    ordering/whitespace/comments don't matter; (ii) inject the stylesheet into
    jsdom during the test and read `document.styleSheets[i].cssRules`. Both are
    robust against Prettier reorder; neither requires raw-string regexes.
  - **(c) Build-output / unconvertible: 3 blocks** — the
    `useVisualViewportHeight` `export function` signature assertion (file
    existence + named export is testable via `import()` instead of regex;
    trivial), the `useVisualViewportHeight` "does NOT contain
    `safe-area-inset-bottom`" negative guard (testable by reading the hook's
    emitted `--vvh` value on a rendered host element — but that crosses into
    jsdom's lack of `window.visualViewport` and would require a polyfill; the
    cheapest robust alternative is keeping a file-content check on this single
    hook), and the Offerer/Joiner negative guards for pre-IMPRV-020
    `calc(... -3rem)` shapes (subsumed by the positive className assertion under
    approach (a) — once `h-[var(--vvh)]` is asserted directly, the absence of
    competing utilities follows; the negative guards become redundant, not
    unconvertible).
- **`dark-mode.test.tsx`:** 2 of 3 are file-content (color-scheme CSS rule +
  dual theme-color meta), 1 already renders Home with providers — same triage as
  above: CSS rule via stylesheet parse, meta via HTML parse,
  render-and-className stays.
- **`typography.test.tsx`:** 3 of 3 are file-content. The "no `font-family:` in
  index.css" + "no font CDN in index.html" + "no `@font-face` under src/public"
  are absence-tests — file-content scanning is the correct shape here because
  the assertion is over the entire source tree, not over a rendered element.
  Strongest candidate to stay file-content (category c by intent, even if not by
  output target).
- **Test infrastructure ready for behavior tests:** `src/test-utils.tsx` exports
  `renderWithProviders` with `MemoryRouter` + `SessionContext` +
  `makeStubSession({ state: 'connected', messages: [...] })`. The Offerer/Joiner
  connected branches and Chat already render under it (see
  `src/screens/Offerer.test.tsx` 443 lines and `src/components/Chat.test.tsx`
  697 lines for the precedent). `test-setup.ts` installs `fake-indexeddb`,
  `@testing-library/jest-dom/vitest`, per-test DOM cleanup, and a
  `console.error`-throws guard from BUG-007 — behavior tests must not emit React
  warnings.
- **jsdom limits:** `getComputedStyle()` returns values only from inline `style`
  attributes and `<style>` tags present in the test DOM; it does NOT process
  `src/index.css` (Vite's CSS pipeline is bypassed in vitest). Asserting
  "overscroll-behavior-y resolves to contain on body" therefore requires either
  parsing the CSS file independently OR injecting the file's contents into a
  `<style>` tag before assertion. Both are robust to Prettier reorder.
- **Net count of assertions across the three files:** ~30 `expect()` calls; ~17
  convert cleanly to render-and-read-className, ~10 convert to CSS-AST or
  HTML-AST parse, ~3 (typography absence-tests
  - the hook negative guard) stay file-content with documented justification.

## Related work

- IMPRV-024 — added 3 new file-content assertions + amended one to
  `mobile-responsive.test.tsx` for safe-area insets.
- IMPRV-025 — added 5 new file-content assertions; first to hit the
  Prettier-reorder false positive and switch to token-presence.
- IMPRV-017 — introduced `--vvh` hook + CSS fallback assertions.
- IMPRV-020 — introduced the `h-[var(--vvh)]` + `pt-6 pb-1` assertions.
- IMPRV-021 — introduced the `hidden sm:flex` + Home menu-item assertions.
- FEAT-013 — origin of the file; established the file-content-against-source
  convention.
- BUG-007 — the `console.error` noise-floor guard in `test-setup.ts`; relevant
  because behavior tests that trigger React warnings would now fail, raising the
  bar for rendered alternatives.

## Working

- Baseline: 23 tests pass across the three target files (16
  `mobile-responsive.test.tsx` + 3 `dark-mode.test.tsx` + 3 + 1
  `typography.test.tsx` = 23 — the `typography` count includes the implicit
  `walk` helper; vitest reports 23).
- `postcss` is already present in `node_modules` as a transitive dep (8.5.15,
  via tailwindcss/vite). Use it for CSS-rule parsing — keeps zero new direct
  deps and beats hand-injecting `<style>` tags into jsdom.
- Plan: introduce `src/__helpers__/cssRules.ts` since `index.css` parsing now
  spans 6 assertions in `mobile-responsive.test.tsx` + 1 in `dark-mode.test.tsx`
  - 1 negative absence in `typography.test.tsx` (kept file-content). The
    `walkDecls` helper returns an array of `{ selector, prop, value, media }`
    records so each test asserts "there exists a record matching X".
- Render shape for connected Offerer/Joiner:
  `renderWithProviders(<Offerer session={makeStubSession({ state: 'connected', conversationId: TEST_CONV_ID })} conversationId={TEST_CONV_ID} onCancel={() => {}} />)`.
  Wrapper element is the `<section aria-label="Connected">` from
  `ScreenContainer`, queryable by `role="region"` + name.
- Chat behavior assertions ride on the existing `role="log"` and
  `data-testid="message-text-*"` / `data-testid="delivery-*"` hooks already in
  the file.
