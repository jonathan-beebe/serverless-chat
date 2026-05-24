# A11Y-013: Multiple `<main>` landmarks and multiple `<h1>` elements on the Design System page

**Status:** Resolved **WCAG:** 1.3.1 Info and Relationships (Level A), 2.4.1
Bypass Blocks (Level A — landmark structure / ARIA Authoring Practices)
**Severity:** Medium **Location:** `src/design-system/DesignSystem.tsx` (lines
98, 100, 122-133, 290, 295, 301, 305, 308, 313, 346, 372);
`src/screens/Home.tsx` (line 14); `src/screens/Offerer.tsx` (lines 85, 111,
129); `src/screens/Joiner.tsx` (lines 71, 96, 113, 134)

## Problem

The `/#design-system` route deliberately renders several real screen components
inside its own `<main>` so reviewers can see them side-by-side. Each rendered
screen contributes its own `<main>` and its own `<h1>` to the host document,
plus the Design System page itself emits additional `<h1>`s for typography demos
and two inline previews (`ConnectedChromePreview`, `JoinerReplyPreview`) that
each render their own `<main>` too.

Where the duplicate landmarks come from:

- `DesignSystem.tsx` line 98 — page `<main>` wrapper.
- `DesignSystem.tsx` line 346 — `ConnectedChromePreview` renders its own
  `<main>`.
- `DesignSystem.tsx` line 372 — `JoinerReplyPreview` renders its own `<main>`.
- `DesignSystem.tsx` lines 290 / 295 / 301 / 305 / 308 / 313 instantiate
  `<Home>`, `<Offerer>`, and `<Joiner>` inside `ScreenPreview` blocks. Each of
  those screens unconditionally renders a `<main>`:
  - `src/screens/Home.tsx` line 14 → 1 `<main>`
  - `src/screens/Offerer.tsx` lines 85, 111, 129 → 1 `<main>` per branch (the
    rendered branch in each preview adds one)
  - `src/screens/Joiner.tsx` lines 71, 96, 113, 134 → 1 `<main>` per branch (the
    rendered branch in each preview adds one)

Where the duplicate `<h1>`s come from:

- `DesignSystem.tsx` line 100 — `<Heading level={1}>Design system</Heading>`
  (the page title).
- `DesignSystem.tsx` lines 123, 126-128, 131-133 — three Typography-row demos
  all use `<Heading level={1}>` to show the page/screen/in-chat h1 styles.
- `DesignSystem.tsx` line 348 — `ConnectedChromePreview` renders
  `<Heading level={1} size="sm">Connected</Heading>`.
- `DesignSystem.tsx` line 375 — `JoinerReplyPreview` renders
  `<Heading level={1}>Send this code back</Heading>`.
- Each previewed screen ships its own `<h1>`:
  - Home: "Serverless P2P Chat" (`Home.tsx` line 15)
  - Offerer awaiting-answer / closed: "Invite your friend" / "Connection lost"
    (`Offerer.tsx` lines 113, 133)
  - Joiner idle / closed: "You've been invited to chat" / "Connection lost"
    (`Joiner.tsx` lines 98, 114, 137)

Result on `/#design-system`:

- ~7+ nested `<main>` landmarks in a single document. HTML5 spec and the W3C
  ARIA Authoring Practices both expect _exactly one_ `<main>` per page. AT users
  navigating by landmark hear "main, main, main…" with no way to distinguish
  them — landmark jump becomes unusable.
- ~10+ `<h1>` elements on a single document. The document outline is
  meaningless; users navigating by heading get a flat list of identically-ranked
  items with no hierarchy.

## Intended behavior

There should be exactly one `<main>` landmark and exactly one `<h1>` per page.
The Design System page should still preview screen components, but those
previews should not promote themselves into top-level page landmarks or
top-level headings on the host document.

## Suggested fix

A few possible directions — let the implementer pick the one that best fits the
codebase:

1. **Demote previewed landmarks/headings from the host document.** Wrap each
   `ScreenPreview` body so the screen's `<main>` doesn't contribute a landmark
   to the showcase page — e.g. render the screen inside a
   `<div role="region" aria-label={label}>` and either (a) override the inner
   `<main>` to render as a `<div>` in preview mode via a prop / context, or (b)
   post-process / strip the role. Simultaneously demote in-preview headings to
   `<h2>`/`<h3>` (or `aria-level={2}`) so the page has one true `<h1>`.

2. **Move the `<main>` wrapper up to App-level.** Refactor
   `Home`/`Offerer`/`Joiner` so the screens render their content but not the
   landmark, and have `App.tsx` provide a single `<main>` per route. The Design
   System page then provides its own single `<main>` and the previewed screens
   drop into plain divs. Pair this with a `headingLevel` prop (or a
   `HeadingLevelProvider` context using `aria-level`) so the in-preview `<h1>`s
   render as `<h2>`/`<h3>` in showcase contexts.

3. **Iframe the previews.** Render each screen preview inside an
   `<iframe srcdoc=…>` (or a same-origin route iframe) so each preview owns its
   own document outline. This is the cleanest semantic isolation — every iframe
   is its own document, so each can legitimately have a `<main>` and an `<h1>`.
   Downsides: larger refactor, has to load Tailwind/styles into the iframe, may
   interact awkwardly with the theme toggle, and event handlers passed to
   previews can't cross the frame boundary without messaging.

Notes / context for the implementer:

- A11Y-002 (resolved, commit 5cabcf8) intentionally added the per-screen
  `<main>` because each route renders exactly one screen at a time — its working
  notes explicitly say "Each route renders exactly one `<main>` (only one screen
  mounts at a time via the switch in `App.tsx`), so we won't trip the 'multiple
  main landmarks' rule." The Design System route violates that assumption by
  mounting many screens at once. Option 2 reverses that decision globally;
  option 1 keeps it but adds a preview-mode escape hatch. Option 3 sidesteps
  both.
- A11Y-005 (resolved, commit 29674c7) added `useFocusOnMount` that targets the
  screen `<h1>` via `headingRef` to move focus on navigation. Any heading-level
  demotion (option 1's aria-level approach, or option 2's `headingLevel` prop)
  must preserve that focus target — i.e. the previewed heading still needs to be
  a real DOM element with the same ref shape, just at a different semantic
  level.
- The Design System route is itself a developer/review tool (see
  `src/design-system/DesignSystem.tsx`), not a user-facing page, but it is
  reachable from production builds via the hash route and is also linked
  publicly. It should not violate WCAG A criteria.
- The Typography section (lines 122-133) renders three `<Heading level={1}>`
  elements purely as visual style swatches. These should likely become
  non-semantic — e.g. render a span/div with the same Tailwind classes, or pass
  an `as` prop to `Heading` so the swatches don't pollute the heading outline.
  (Same fix could be reused for the in-preview screens if `Heading` is extended
  with `as`/`level` separation.)
- Two inline preview components in `DesignSystem.tsx` (`ConnectedChromePreview`
  line 344, `JoinerReplyPreview` line 370) also render `<main>` + `<h1>`
  directly. Whatever fix is chosen must address these as well — they are local
  to the showcase file, so a quick swap to `<div>` + lower-level heading is
  straightforward there.

## Acceptance

- `/#design-system` contains exactly one `<main>` landmark (verified via DOM
  inspection or `document.querySelectorAll('main').length === 1`).
- `/#design-system` contains exactly one `<h1>` (verified via
  `document.querySelectorAll('h1').length === 1`).
- Screen previews still render visually as they do today (Home, Offerer
  awaiting-answer, Offerer closed, Joiner idle, Joiner reply, Joiner closed,
  Connected chrome).
- The real production routes (`/`, Offerer flow, Joiner flow) still expose
  exactly one `<main>` and one `<h1>` each — A11Y-002 and A11Y-005 invariants
  preserved.
- Heading-focus-on-mount (A11Y-005) still works on real routes.
- Existing tests (`App.test.tsx`, design-system tests if any) still pass.

## Working notes

Confirmed the issue: `/#design-system` mounts 7 screens at once, each rendering
its own `<main>` + `<h1>`, plus the Design System page emits its own `<main>` +
`<h1>` and three Typography-row `<Heading level={1}>` swatches and two inline
preview components (`ConnectedChromePreview`, `JoinerReplyPreview`) each
rendering `<main>` + `<h1>`.

Chosen approach: a hybrid of options 1 + 2 from the ticket, scoped narrowly.

1. Introduce a `ScreenChromeContext` with two props: `landmark`
   (`'main' | 'region'`) and `headingLevelOffset` (0 or 1). Default is
   `{ landmark: 'main', headingLevelOffset: 0 }` so all production routes behave
   exactly as today.
2. Add a `ScreenContainer` primitive used by Home / Offerer / Joiner in place of
   the raw `<main>` tag. In default context it renders `<main>`; in showcase
   context it renders `<div role="region" aria-label={label}>` so the landmark
   doesn't pollute the host document.
3. Extend `Heading` to consult the context — `level=1` inside an offset-1
   showcase context renders as `<h2>` (and so on). `tabIndex={-1}` and the focus
   class stay so `useFocusOnMount` still works.
4. Add an `as` prop to `Heading` so the Typography-row swatches can render the
   level-1/level-2 styles in a `<p>` instead of a real heading, removing those
   from the document outline entirely.
5. In `DesignSystem.tsx`: wrap each `ScreenPreview` body in a
   `ScreenChromeContext.Provider value={{ landmark: 'region', headingLevelOffset: 1 }}`,
   swap the two inline preview components (`ConnectedChromePreview`,
   `JoinerReplyPreview`) to use `<div>` + lower-level `Heading`, and switch the
   three Typography-row swatches to use `as="p"`.

This preserves every invariant called out in the ticket: production routes
unchanged (default context), heading-focus-on-mount still works (heading is
still a real element with the same ref shape), and the showcase still visually
renders every screen.

Implemented & verified — all 122 tests pass, including 4 new tests covering the
showcase landmark/heading invariants and the `as` prop.
