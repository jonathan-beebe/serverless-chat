# A11Y-022: DesignSystem screen previews steal initial keyboard/AT focus from the page heading via competing `useFocusOnMount` calls

**Status:** Resolved

## Working notes / resolution

Confirmed the bug existed exactly as described: `useFocusOnMount` fired
unconditionally in `Home`/`Offerer`/`Joiner`, and the showcase mounted six of
them under one `ScreenChromeContext.Provider` — the last subtree's effect won
the race and stole focus into a preview region.

Implemented the recommended context-flag fix:

- `src/components/ScreenChrome.tsx`: added optional
  `suppressInitialFocus?: boolean` to `ScreenChromeValue`; default context value
  sets it to `false`. Marked optional rather than required so the A11Y-013 era
  provider literals (e.g. in `Heading.test.tsx`) keep compiling without forcing
  explicit `false` everywhere.
- `src/hooks/useFocusOnMount.ts`: accepts an optional second arg
  `{ skip?: boolean }`. When `skip` is true the effect early-returns.
  Backwards-compatible.
- `src/screens/Home.tsx`, `Offerer.tsx`, `Joiner.tsx`: read
  `suppressInitialFocus` from `useScreenChrome()` and pass it through to
  `useFocusOnMount` as `{ skip }`. Each branch-aware screen passes the same gate
  through its single `useFocusOnMount` call (branch deps unchanged).
- `src/design-system/DesignSystem.tsx`: `SHOWCASE_CHROME` now includes
  `suppressInitialFocus: true`. Also wired the page's own
  `<h1>Design system</h1>` through `useFocusOnMount` (it sits outside the
  showcase provider so it sees the default context and focuses normally) so the
  page has a meaningful initial-focus target consistent with every production
  route.

Tests added:

- `DesignSystem.test.tsx`: asserts after mount that `document.activeElement` is
  the page `<h1>` (not nested in any `[role="region"]`).
- `Home.test.tsx` (new), `Offerer.test.tsx`, `Joiner.test.tsx`: paired
  regression tests — default context focuses the `<h1>` (A11Y-005 guard),
  showcase context with `suppressInitialFocus: true` does not.

Verified: `npm test` (147 passing, +8 new), `npm run lint`, `npm run typecheck`
all clean. Committed as `9657837`.

**WCAG:**

- 2.4.3 Focus Order — Level A
- 2.4.6 Headings and Labels — Level AA (adjacent concern; see Problem analysis)

**Severity:** High — affects 100% of keyboard-only and screen-reader users who
land on the `#design-system` route. Focus is silently teleported deep into the
middle of the page on every load, the page's actual `<h1>` ("Design system")
never receives focus despite the new `ScreenChromeContext` (A11Y-013) being
explicitly designed to preserve that semantic, and Shift+Tab from the landing
point has no defined upper bound. This is a regression-class focus-order break:
an AT user who navigates here cannot tell where they are on the page or what the
page is. It is not a workflow-blocker in the sense that the showcase is for
developer review (not an end-user route), but it is a real Level A violation
that ships in the running app, and it actively misleads anyone using the page
for accessibility QA — the surface most likely to be loaded with AT in the first
place.

## Location

`src/design-system/DesignSystem.tsx` — the `Section title="Screen previews"`
block, approximately lines 302-360, which mounts six top-level screens inside
`<ScreenPreview>` wrappers under a single `ScreenChromeContext.Provider`:

```tsx
// src/design-system/DesignSystem.tsx (approx. lines 305-360)
<Section title="Screen previews" ...>
  <ScreenPreview label="Home">
    <Home onStart={() => {}} />
  </ScreenPreview>

  <ScreenPreview label="Offerer — Invite your friend">
    <Offerer
      session={stubSession({ state: 'awaiting-answer', encodedLocal: FAKE_OFFER })}
      onCancel={() => {}}
    />
  </ScreenPreview>

  <ScreenPreview label="Offerer — Connection lost">
    <Offerer session={stubSession({ state: 'closed', encodedLocal: FAKE_OFFER })} onCancel={() => {}} />
  </ScreenPreview>

  <ScreenPreview label="Joiner — You've been invited">
    <Joiner session={stubSession({ state: 'idle' })} offerCode={FAKE_OFFER} onCancel={() => {}} />
  </ScreenPreview>

  <ScreenPreview label="Joiner — Send this code back">
    <JoinerReplyPreview />
  </ScreenPreview>

  <ScreenPreview label="Joiner — Connection lost">
    <Joiner
      session={stubSession({ state: 'closed', encodedLocal: FAKE_REPLY })}
      offerCode={FAKE_OFFER}
      onCancel={() => {}}
    />
  </ScreenPreview>
</Section>
```

Each `Home` / `Offerer` / `Joiner` instance internally constructs a heading ref
via:

```ts
// src/hooks/useFocusOnMount.ts
export function useFocusOnMount<T extends HTMLElement>(
  deps: DependencyList = [],
) {
  const ref = useRef<T | null>(null)
  useEffect(() => {
    ref.current?.focus({ preventScroll: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return ref
}
```

And the page's own `<Heading level={1}>Design system</Heading>` in
`src/design-system/DesignSystem.tsx` (in the header block beginning around
line 100) has **no ref and no `useFocusOnMount` call** — it relies on browser
default focus behavior (which is `<body>` on initial load).

The showcase mounts the previews under:

```tsx
// src/design-system/DesignSystem.tsx
const SHOWCASE_CHROME: ScreenChromeValue = {
  landmark: 'region',
  headingLevelOffset: 1,
}
```

…which correctly demotes the nested `<main>` → `<div role="region">` and the
nested `<h1>` → `<h2>` (per A11Y-013), but does **not** suppress the
programmatic focus call.

## Problem analysis

Each `Home` / `Offerer` / `Joiner` is designed as a top-level screen and assumes
it owns the document focus. When mounted, its `useFocusOnMount` effect fires
unconditionally on mount and calls `.focus({ preventScroll: true })` on its
`<h1>` (now rendered as `<h2>` in the showcase, but the demotion is purely a tag
swap — the ref and the `.focus()` call are identical). When multiple screens
mount in the same render — the showcase mounts six — every effect fires.

React runs child effects bottom-up before parent effects, but the _order across
sibling subtrees is mount order_: each `<ScreenPreview>` subtree commits its
effects in document order, so the last `<ScreenPreview>` in the JSX wins the
focus race. With the JSX as it stands, that is the "Joiner — Connection lost"
preview's heading.

The result is non-deterministic in spirit (depends on the order of the JSX in
`DesignSystem.tsx`, which a refactor or sort would silently change), and even
when deterministic it lands focus _inside a preview_. The page's own `<h1>`
never receives focus, even though the new `ScreenChromeValue` context
(`headingLevelOffset: 1`) is explicitly designed to demote the previews'
headings to `<h2>` so the page's `<h1>` can remain the canonical document
heading.

This violates **WCAG 2.4.3 Focus Order (Level A)**:

> If a Web page can be navigated sequentially and the navigation sequences
> affect meaning or operation, focusable components receive focus in an order
> that preserves meaning and operability.

The initial focus position is the start of the user's tab sequence. Placing it
in the middle of the page — past the entire header, past the Theme controls,
past the Atoms, Molecules, and Organisms sections — breaks the meaning of the
sequence: the user has no way, from focus position alone, to know they are not
at the top of the page. Shift+Tab from a programmatically-focused `<h2>` deep
inside a `<div role="region">` does not go to the page's `<h1>`; it goes to the
previous focusable element in document order, which depending on the preview is
somewhere inside the prior preview's interactive surface.

This is also adjacent to **WCAG 2.4.6 Headings and Labels (Level AA)**: the page
has its own `<h1>` ("Design system") that should be the meaningful starting
point, but the previews' h1s (demoted to h2 by `headingLevelOffset: 1`)
programmatically steal that role on every load — the document outline says one
thing, the focus behavior says another, and the AT user is told the latter.

This is the same class of issue **A11Y-013** partially addressed for
landmarks/headings (one `<main>`, one `<h1>` per page), but it stops short of
solving the _focus management_ side. The previews have correct heading semantics
now; they still misbehave on focus.

## Root cause

`useFocusOnMount` was introduced in **A11Y-005** as a single-purpose hook: when
a screen mounts (because the SPA swapped subtrees on a button click), focus the
screen's `<h1>` so keyboard and SR users get a meaningful starting point on the
new screen. That was correct for production routes, where exactly one screen
mounts at a time.

The hook has no awareness of whether it is being invoked in a showcase context,
and the showcase context (`ScreenChromeContext`, introduced in A11Y-013) has no
signal for "do not move focus." So the focus-move behavior, which is desired in
production and undesired in the showcase, fires unconditionally.

The same context that demotes the heading tag and the landmark wrapper is the
natural place to also suppress the focus call — the production routes pass the
default context (`suppressInitialFocus: false`), the showcase passes a context
with the flag set, and every existing screen continues to focus its `<h1>` on
real navigation.

## Concrete failure scenarios

1. **Keyboard-only user opens `#design-system` directly** (URL bar → Enter).
   Browser sets focus to `<body>`. React mounts, all six preview screens run
   `useFocusOnMount` in their child effects, last one wins — focus lands inside
   the "Joiner — Connection lost" preview's `<h2>` ("Connection lost"). The
   user, who expected to land on or above the "Design system" `<h1>`, has been
   silently teleported deep into the page. The page title "Design system · P2P
   Chat" no longer matches where focus is. Shift+Tab from here goes… wherever —
   possibly back into earlier previews, never to the top.

2. **Screen-reader user navigates to `#design-system`** (same path). The SR
   announces the focused element ("Connection lost, heading level 2") instead of
   "Design system, heading level 1". The user has no spatial sense of where on
   the page they are, and no audible signal that the page they actually loaded
   is the design system index — they hear a deep-context heading from inside one
   of several previews.

3. **The page's theme toggle group is positioned in the header**, above all
   previews. A keyboard user expecting to tab from the top of the page to reach
   the Theme controls instead starts mid-page and has to Shift+Tab past the
   entire showcase — through interactive elements (textareas, buttons) in every
   preview — before reaching the controls.

4. **Refactor regression risk.** Because the focus winner is determined by JSX
   order, any future refactor that reorders the previews, or sorts them
   alphabetically, or wraps them in a Suspense boundary, will silently change
   which preview steals focus. The current "Joiner — Connection lost" landing
   point is incidental; a reviewer cleaning up the order would not realise they
   changed focus behavior.

## Why the previously-shipped fix is insufficient

**A11Y-013** introduced `ScreenChromeContext` so the showcase can demote nested
`<main>` → `<div role="region">` and demote `<h1>` → `<h2>`. That fixed the
_semantic_ duplication (the document outline is now correct). It did not address
focus: every demoted `<h1>` (now rendered as `<h2>`) still has `tabIndex={-1}`
(from `Heading.tsx:63`) and still receives the `useFocusOnMount`-driven
`.focus()` call.

**A11Y-017** then added the focus-visible ring to the `Heading` primitive. The
ring is correct for production — when a screen mounts and its `<h1>` gets focus,
the ring is now visible — but in the showcase it makes the problem _more_
visible: every load lights up the ring around whichever preview won the focus
race, drawing the eye to exactly the wrong place.

The fix needs to extend the same context-aware approach to the focus call
itself: the showcase already opts out of `<main>` and opts out of the `<h1>`
tag, and should be able to opt out of the focus call by the same mechanism.

## Intended behavior

- On initial mount of the DesignSystem page, focus must NOT be moved away from
  the user's natural landing point (`<body>` for fresh navigation, or wherever
  the browser restores it for back-button navigation).
- Optionally, the page's own `<h1>Design system</h1>` may carry its own
  `useFocusOnMount` so that focus lands on it instead of `<body>` (consistent
  with the production screens' pattern). Either way: the previews must not steal
  focus.
- The previews remain semantically correct (`<h2>` due to offset, in labeled
  `<div role="region">` landmarks).
- The previews remain interactive (the showcase's value depends on it) — this
  ticket is about focus, not interactivity. The interactivity concern (the no-op
  handlers `() => {}` wired into Cancel / Accept / Decline / Connect) is filed
  separately as a sibling ticket in this same audit.
- Production routes (Home / Offerer / Joiner rendered directly as the top-level
  screen, not nested in the showcase) continue to focus their `<h1>` on mount
  and on relevant branch swaps — A11Y-005's contract must not regress.

## Suggested fix

Extend `ScreenChromeContext` with a `suppressInitialFocus: boolean` flag,
default `false`. Each screen reads the flag and passes it to `useFocusOnMount`,
which gates the focus call.

This option is the minimal surface change that respects the existing
`ScreenChromeContext` pattern and matches the shape of the A11Y-013 fix: same
context, same provider site, same opt-in-by-the-showcase model.

### Diff: context

```diff
// src/components/ScreenChrome.tsx
 export interface ScreenChromeValue {
   landmark: 'main' | 'region'
   headingLevelOffset: 0 | 1 | 2
+  // When true, screens render in a showcase / preview context and must NOT
+  // call programmatic focus on their h1 on mount — the host page owns
+  // initial focus. Production routes leave this false so A11Y-005's
+  // screen-transition focus behavior continues to fire.
+  suppressInitialFocus?: boolean
 }

-const DEFAULT: ScreenChromeValue = { landmark: 'main', headingLevelOffset: 0 }
+const DEFAULT: ScreenChromeValue = {
+  landmark: 'main',
+  headingLevelOffset: 0,
+  suppressInitialFocus: false,
+}
```

### Diff: hook

```diff
// src/hooks/useFocusOnMount.ts
-export function useFocusOnMount<T extends HTMLElement>(deps: DependencyList = []) {
+interface Options {
+  // When true, the focus call is skipped. Used by screens rendering inside
+  // a showcase / preview context so they don't steal focus from the host
+  // page. See A11Y-021.
+  skip?: boolean
+}
+
+export function useFocusOnMount<T extends HTMLElement>(
+  deps: DependencyList = [],
+  options: Options = {},
+) {
   const ref = useRef<T | null>(null)
   useEffect(() => {
+    if (options.skip) return
     ref.current?.focus({ preventScroll: true })
     // eslint-disable-next-line react-hooks/exhaustive-deps
   }, deps)
   return ref
 }
```

### Diff: each screen reads the flag

```diff
// e.g. src/screens/Home.tsx
+import { useScreenChrome } from '../components/ScreenChrome'
 ...
 export function Home({ onStart }: Props) {
   usePageTitle('P2P Chat')
-  const headingRef = useFocusOnMount<HTMLHeadingElement>()
+  const { suppressInitialFocus } = useScreenChrome()
+  const headingRef = useFocusOnMount<HTMLHeadingElement>([], {
+    skip: suppressInitialFocus,
+  })
   ...
```

Apply the same change in `src/screens/Offerer.tsx` and `src/screens/Joiner.tsx`.
If either screen calls `useFocusOnMount` more than once (e.g., one call per
heading for branch swaps), each call site needs the same gate.

### Diff: showcase passes the flag

```diff
// src/design-system/DesignSystem.tsx
-const SHOWCASE_CHROME: ScreenChromeValue = { landmark: 'region', headingLevelOffset: 1 }
+const SHOWCASE_CHROME: ScreenChromeValue = {
+  landmark: 'region',
+  headingLevelOffset: 1,
+  suppressInitialFocus: true,
+}
```

### Optional diff: give the page's own h1 proper focus management

This is recommended but not strictly required. It makes the DesignSystem page
consistent with every other route in the app (whose `<h1>` is focused on mount)
and provides a clean, predictable landing point for keyboard and AT users.

```diff
// src/design-system/DesignSystem.tsx
 export function DesignSystem() {
   usePageTitle('Design system · P2P Chat')
+  const headingRef = useFocusOnMount<HTMLHeadingElement>()
   const [mode, setMode] = useState<ThemeMode>('system')
   ...
-          <Heading level={1}>Design system</Heading>
+          <Heading level={1} ref={headingRef}>Design system</Heading>
```

Note: the page's `<h1>` is **outside** the `ScreenChromeContext.Provider` that
wraps the previews, so it sees the default context
(`suppressInitialFocus: false`) and its `useFocusOnMount` call will fire
normally. Verify in the test pass.

### Alternatives considered (not recommended for this ticket)

- **Option B — pull the focus call out of the screens entirely** and have the
  App-level router invoke focus on route change instead. Cleaner architecturally
  but a much bigger refactor; not in scope.
- **Option C — render the previews under a wrapper that uses the `inert`
  attribute or disables focus** at the DOM level. Solves focus _and_
  interactivity (the parallel ticket) at once, but neutralises the showcase's
  value as an interactive review tool. Worth discussing as a follow-up; not
  appropriate here.

The recommended path is the context-flag approach: minimal surface, matches the
existing pattern, and explicitly preserves production behavior.

## Test updates

`src/design-system/DesignSystem.test.tsx`:

- Add: render `<DesignSystem />`, wait for all preview mounts to settle (a
  microtask flush plus `await screen.findByText('Design system')` should be
  enough), then assert `document.activeElement` is either the page's own `<h1>`
  (if the optional page-h1 ref is taken) or `document.body` (if not). Either
  way, assert `document.activeElement` is NOT inside any element matching
  `[role="region"]` — use `.closest('[role="region"]')` on the active element
  and expect `null`.
- Add: assert that no element matching `[role="region"] >> h2` (i.e., a
  preview's heading) receives focus during the mount sequence. A simple
  "snapshot `document.activeElement` after `await waitFor(...)`" suffices.

`src/screens/Home.test.tsx` / `Offerer.test.tsx` / `Joiner.test.tsx`:

- Regression: confirm that when rendered WITHOUT the showcase context (i.e., the
  default `ScreenChromeContext` value), `useFocusOnMount` still fires and the
  screen's `<h1>` receives focus. This guards the A11Y-005 contract.
- Add: a paired test that wraps the screen in
  `<ScreenChromeContext.Provider value={{ landmark: 'region', headingLevelOffset: 1, suppressInitialFocus: true }}>`
  and asserts the heading is NOT focused (active element remains `<body>`, or
  whatever the test environment's default is).

`src/hooks/useFocusOnMount.test.ts` (or wherever the hook is unit-tested; create
if absent):

- Add: with `options.skip = true`, calling the hook does not move focus when the
  returned ref is attached to a focusable element and the effect runs. With
  `options.skip = false` (or omitted), focus moves as before.

`src/components/ScreenChrome.test.tsx` (if it exists; otherwise extend whatever
covers the context):

- Add: `useScreenChrome()` default returns `suppressInitialFocus: false`. A
  provider with `suppressInitialFocus: true` propagates the flag to consumers.

## Acceptance criteria

- On loading `#design-system`, no preview screen's heading receives programmatic
  focus. Verified by a Vitest test asserting `document.activeElement` is not
  inside any `[role="region"]`.
- `ScreenChromeValue` carries an explicit `suppressInitialFocus` flag (or an
  equivalent mechanism that achieves the same semantic), and the showcase's
  provider passes `suppressInitialFocus: true`.
- `useFocusOnMount` accepts an option that, when set, suppresses the focus call.
  The hook signature change is backwards-compatible (the new options argument is
  optional and defaults to `{}`).
- Each of `Home`, `Offerer`, `Joiner` reads `suppressInitialFocus` from
  `useScreenChrome()` and passes it through to its `useFocusOnMount` call(s).
- Production routes (Home / Offerer / Joiner directly, not inside the showcase)
  continue to focus their `<h1>` on mount — A11Y-005 regression coverage is
  preserved.
- A regression test exists for each of the three screens, asserting both
  behaviors: default context → heading focuses on mount; showcase context →
  heading does not focus on mount.
- `npm test`, `npm run lint`, `npm run typecheck` pass.
- Manual smoke: navigate to `#design-system`, observe focus. With the optional
  page-h1 addition, focus is on the "Design system" `<h1>` (visible focus ring
  per A11Y-017). Without, focus is at `<body>` and the first Tab moves to the
  Theme toggle group. Either way, focus is NOT inside a preview. Repeat with
  VoiceOver / NVDA — the first announcement on page load is "Design system,
  heading level 1" (with the optional addition) or whatever the AT's
  body-landing announcement is (without).

## Adjacent context (do NOT conflate scope)

- **A11Y-005 (resolved)** — added `useFocusOnMount` for screen transitions. This
  ticket modifies that hook's signature to accept an optional skip flag; the
  production behavior (no flag, or `skip: false`) must not regress. Re-run
  A11Y-005's regression tests after the change.
- **A11Y-013 (resolved)** — introduced `ScreenChromeContext` for
  landmark/heading demotion. This ticket extends the same context with a focus
  flag. Same shape, same provider site, same opt-in-by-the-showcase model. Read
  `src/components/ScreenChrome.tsx` and follow the same pattern.
- **A11Y-017 (resolved)** — added the focus-visible ring on `<Heading>`.
  Unrelated to the fix; do not touch the heading's focus styling. Note that the
  ring currently makes the bug _more visible_ (lights up on whichever preview
  wins the race), so verifying the fix is partly a matter of confirming no ring
  appears on any preview's heading on load.
- **Parallel ticket in this same audit (separate file)** — covers the broader
  problem that the previews are fully interactive with no-op handlers (Cancel /
  Accept / Decline / Connect all wired to `() => {}`). That ticket is
  independent — the interactivity concern is about handler wiring, this ticket
  is about programmatic focus on mount. They could be closed together but should
  be reviewed and merged separately to keep the diffs small and the revert blast
  radius narrow.
- **Production routing** — `App.tsx` (or equivalent) renders exactly one of
  `Home`, `Offerer`, `Joiner` at a time as the top-level screen, under the
  default `ScreenChromeContext`. Do not move the focus call to `App.tsx` for
  this ticket; that is the Option B alternative and is out of scope.
