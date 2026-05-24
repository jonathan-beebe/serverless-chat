# FEAT-007: Design system route + extract atomic primitives into shared components

**Status:** Resolved **Type:** Feature **Area:** App-wide / new
`src/design-system/` preview pages + new/extracted primitives in
`src/components/`

## Summary

Build a **design-system preview surface** at `#design-system` that renders, in
one place, every atomic primitive and composite component the app uses — so the
UI can be reviewed, visually regressed, and iterated on without booting the full
peer-to-peer negotiation flow.

In service of that goal, **extract the visual primitives currently open-coded
across `Home`, `Offerer`, `Joiner`, and the existing `Chat` / `CopyBox`
molecules** into their own files in `src/components/`. The design system route
imports and renders the same primitive files that the features consume — there
are no parallel "showcase versions" of components. If a button changes in
`src/components/Button.tsx`, both the design system and every feature pick it up
automatically.

Loosely follows Brad Frost's atomic design vocabulary (atoms → molecules →
organisms), used as an organizing principle for the preview page, not as a
strict taxonomy.

## Customer value

This ticket has **no direct end-user visible behavior change** by design.
Bubbles, buttons, headings, and inputs should render pixel-identically before
and after extraction. The customer-facing payoff is _indirect_:

- **Faster, more consistent UI iteration.** Every screen currently re-derives
  its own button styles (sky-600 primary, slate-bordered secondary, small slate
  pill). Drift between them is already visible — e.g. the "End chat" header pill
  uses different padding/text size from the "Cancel" button on Offerer's invite
  view. Centralizing primitives means a tweak lands everywhere at once and the
  inconsistencies stop accumulating.
- **The dark-mode (FEAT-001), font (FEAT-005), and chat-chrome (FEAT-006) work
  all touched 4–6 files apiece** because the same paragraph/heading/button
  classes were duplicated across screens. Future work in that vein lands in one
  file.
- **Designers (and the user) can see the UI without producing a SDP handshake.**
  Today previewing the "Connection lost" screen requires connecting two
  browsers, sending a message, then closing one tab. The design system makes
  every visual state browsable in seconds.

## Business value

- **Defends the polish gains from FEAT-001 / FEAT-004 / FEAT-005 / FEAT-006.**
  Without a single source of truth, the slate / sky / dark-mode palette will
  silently fragment as new features are added. The design system page is also a
  free visual regression check during PR review.
- **Reduces the cost of every subsequent UI ticket.** Each subsequent ticket
  that touches headings, buttons, or inputs gets cheaper because there's one
  file to change and one place to verify the change in isolation.
- **Always-available in production** (per user direction), so design review can
  happen on the deployed URL without a separate Storybook deploy. Bundle cost is
  small (no story-runner framework, just a React route).

## What a working feature delivers

A user visiting `https://<host>/#design-system` lands on a single-page showcase
that renders, top-to-bottom:

1. **Typography** — every text style in use (page-h1 32px semibold, screen-h1
   24px semibold, section-h1 18px semibold, body, small/help, mono code, sr-only
   sample with a visible note). Each row labels the role and shows the rendered
   text.
2. **Color & surface** — the slate-50 / slate-900 background pair, slate text
   scale, sky-600 brand, emerald-700 success, amber-700 warning, red-300/900
   error — rendered as labeled swatches plus a card surface and a divider
   sample. Renders correctly in both light and dark mode (driven by OS — same
   `prefers-color-scheme` mechanism as FEAT-001).
3. **Atoms** — each in isolation, with every meaningful variant rendered
   side-by-side:
   - `<Button>` — `variant="primary" | "secondary" | "ghost"`, plus `disabled`
     state for each.
   - `<Heading>` — `level={1|2|3}`, with the `tabIndex={-1}` +
     `focus:outline-none` focus-management styling that the screens currently
     inline.
   - `<Textarea>` — the visual chrome of the chat composer / reply-code /
     CopyBox textareas (the _behavior_ — auto-grow, Enter-send, IME guards —
     stays on the feature components that compose it).
   - `<Callout>` — `variant="info" | "success" | "warning" | "error"`, used
     today as the `role="alert"` red error, the amber "Couldn't establish a
     direct connection", and the emerald "Copied!" flash.
   - `<Divider>` — the muted horizontal-rule-with-label treatment used by chat
     date headers.
   - `<LiveRegion>` — `sr-only` `role="status" aria-live="polite"`, used by
     `Offerer`, `Joiner`, and `CopyBox`. The showcase shows a stub note
     explaining what it does (since the element itself is invisible).
4. **Molecules** — `CopyBox` (both `variant="url"` and `variant="code"`),
   rendered with realistic-looking but fake content.
5. **Organisms** — the `Chat` component, rendered with a curated 5-message
   fixture (mix of `me` / `them`, a same-day pair, a day-rollover, a multi-line
   message). `onSend` is a no-op stub that appends to local state so the
   component is _interactive_ in the showcase.
6. **Screen previews** — static renders of each "post-connect" / "between
   states" screen body so they can be reviewed without a real handshake:
   - Home screen
   - Offerer "Invite your friend" (with a fake offer URL in the CopyBox)
   - Offerer "Connection lost"
   - Joiner "You've been invited"
   - Joiner "Send this code back"
   - Joiner "Connection lost"
   - The "Connected" Chat layout (with the same fixture as the Chat organism)
   - Each screen is a _real_ render of the screen component where possible,
     wrapped with stubbed `session` / `onCancel` props so it can render
     statically. Where stubbing is awkward (Offerer reading `useChatSession` on
     mount), render the inner JSX directly using the same primitives — the goal
     is fidelity to the shipping UI, not a parallel implementation.

Pinned to the top of the page is a **light/dark mode toggle** with three states:
`System` (default — follows `prefers-color-scheme`, matching FEAT-001 behavior
everywhere else in the app), `Light` (force light), and `Dark` (force dark). The
toggle scopes its override to the design-system page only — leaving the route to
a feature screen drops back to OS-driven theming so FEAT-001's invariant ("the
rest of the app follows the OS") is preserved.

The design system is a single TSX route (no routing library, no per-component
file proliferation in `src/design-system/`). One
`src/design-system/DesignSystem.tsx` page imports primitives and arranges them
with section headings. A small `src/design-system/Section.tsx` helper provides
the standard "section heading + description + grid of examples" wrapper.

## Acceptance criteria

1. **Route reachable.** Navigating to `#design-system` (any path) renders the
   design-system page. The hash router lives in `App.tsx` next to the existing
   `#offer=…` branch. Going back to `#` (or clearing the hash) returns to the
   existing routing (Home / Offerer / Joiner) unchanged.
2. **No regressions in the existing offerer→joiner flow.** Every existing test
   passes unchanged. In particular: the `App.test.tsx` route tests, the
   `Home`/`Offerer`/`Joiner` rendering tests, `Chat.test.tsx` (including
   auto-scroll, sr-only prefix, date headers, per-message time), and
   `CopyBox.test.tsx` all stay green without rewrites beyond import-path updates
   if any primitive is moved.
3. **Atomic primitive files exist and are imported by both surfaces.**
   - `src/components/Button.tsx` —
     `<Button variant?="primary"|"secondary"|"ghost" type? className? children …rest>`
     with the rounded-md / sky-600 (primary), slate-bordered (secondary), and
     small pill (ghost) treatments.
     `focus-visible:ring-2 focus-visible:ring-sky-400` and
     `disabled:cursor-not-allowed disabled:opacity-50` are built in.
   - `src/components/Heading.tsx` — `<Heading level={1|2|3} ref? id? children>`
     renders the matching `<h1|h2|h3>` with the existing slate-900 /
     dark:slate-100 + `tabIndex={-1} focus:outline-none` treatment. Forwards a
     ref so `useFocusOnMount` continues to work.
   - `src/components/Textarea.tsx` — visual-only `<Textarea>` primitive wrapping
     `<textarea>`, with the existing slate-300 border / sky-400 focus-ring /
     dark-mode classes. Accepts all native textarea props (incl. `ref`) — no
     auto-grow logic here.
   - `src/components/Callout.tsx` —
     `<Callout variant="info"|"success"|"warning"|"error" role? children>`
     renders the muted-info paragraph, emerald success, amber warning, red error
     treatment. `role` is opt-in (default unset; `Offerer`/`Joiner` pass
     `"alert"`).
   - `src/components/Divider.tsx` — the centered "line — label — line" treatment
     used by `Chat`'s date headers. Accepts `children` for the centered label.
   - `src/components/LiveRegion.tsx` — `<LiveRegion>{message}</LiveRegion>`
     renders the existing
     `<p role="status" aria-live="polite" className="sr-only">…</p>` pattern.
   - All six are imported and rendered by the three feature screens (`Home.tsx`,
     `Offerer.tsx`, `Joiner.tsx`) AND by `Chat.tsx` / `CopyBox.tsx` AND by the
     design system page. There are no remaining open-coded
     `<button className="rounded-md bg-sky-600 …">` /
     `<h1 className="text-2xl …">` / `<p role="alert" className="…">` instances
     in the four screens/components.
4. **Pixel-identical rendering of every feature screen, light and dark.** The
   Home, Offerer (all 3 branches), and Joiner (all 4 branches) screens render
   with the same visible layout, spacing, colors, and typography as on `main`
   before this ticket. Verified manually by stepping through each screen pre-
   and post-refactor — capture screenshots in the PR description if practical,
   otherwise note that manual comparison was done and which screens were
   checked.
5. **Design-system page renders all sections** listed under "What a working
   feature delivers" (typography, color, atoms, molecules, organisms, screen
   previews). Section headers are real `<h2>` elements (use the new `<Heading>`
   primitive at `level={2}`) so the page is keyboard- and
   screen-reader-navigable.
6. **Dark mode works on the design system page.** Toggling the OS color scheme
   correctly re-themes the showcase. (Existing `prefers-color-scheme` mechanism
   applies elsewhere in the app — see AC #11 for the design-system-only force
   toggle.)
7. **Light/dark force toggle on the showcase page.** The design system page
   renders a three-state toggle (`System` / `Light` / `Dark`) pinned to the top
   of the page. Default is `System` (no override). Selecting `Light` or `Dark`
   forces that theme for the entire showcase regardless of OS preference, by
   scoping a `light` / `dark` class to the design-system route's root element
   and driving Tailwind's `dark:` variant from that class for the duration of
   the override. The override does **not** affect any other route — navigating
   away from `#design-system` and back to `#` returns the rest of the app to
   OS-driven theming (no global state mutation, no localStorage persistence
   required for v1; the toggle resets to `System` on reload).
8. **Always available in production.** The `#design-system` route is included in
   `npm run build` output (not gated behind `import.meta.env.DEV`). Bundle-size
   impact is acceptable (no story-runner library, no MDX, no extra deps).
9. **`Chat` interactive in the showcase.** The Chat organism preview accepts a
   real `messages` array and an `onSend` that appends to local component state,
   so the user can type into the composer and see their message render in the
   bubble — without needing a peer connection. Day-rollover and multi-line
   messages are present in the seed fixture.
10. **Page title.** Visiting `#design-system` sets `document.title` to
    `Design system · P2P Chat` via the existing `usePageTitle` hook.
11. \*\*`pnpm run lint`, `pnpm run typecheck`, and `pnpm run test` (read:
    `npm run lint`/`typecheck`/`test`, this project uses npm) all pass.

## Out of scope (v1)

- **Storybook, Ladle, Histoire, or any story-runner framework.** A single
  hand-rolled React page is enough at this size. Revisit if the showcase grows
  past ~30 components.
- **MDX / docs-with-code-examples.** Each example is JSX rendered alongside a
  short label. No "copy-paste-able usage snippet" generation. If a designer/dev
  wants the source, the page itself is the source.
- **Visual-regression snapshot testing** (Chromatic, Percy, Playwright
  screenshot diffs). Out of scope; the existing unit tests cover behavior, and
  human review of the design system page covers visual drift for now.
- **Persisting the theme-toggle choice across reloads.** The toggle resets to
  `System` on every page load. localStorage / URL-param persistence is a
  follow-up if reviewer ergonomics demand it.
- **A global theme toggle in the app chrome.** FEAT-001's invariant — _the app
  follows the OS, with no in-app toggle_ — stands. The toggle introduced here is
  scoped to the design-system route and does not leak into the rest of the app.
- **Locale switcher** for previewing `Chat` date/time formatting in en-US /
  en-GB / de-DE simultaneously (per FEAT-006). The Chat organism preview shows
  whichever locale the browser is running.
- **A `<TextInput>` primitive** (single-line `<input>`). The app currently uses
  only `<textarea>` — there's no single-line input to extract. Add when the
  first feature needs one.
- **An `<IconButton>` primitive.** No icons in the app yet.
- **A `<Link>` primitive.** No in-app navigation links yet (only the
  hash-router-driven view swap). Defer.
- **Splitting feature components like `Chat` / `CopyBox` into smaller atoms.**
  Chat's transcript / composer split is plausible but is a separate refactor;
  this ticket extracts only the _open-coded_ atoms (buttons, headings, callouts,
  etc.) and leaves the existing molecules intact.
- **Showing every CSS-utility combination** (every padding, every gap, every
  flex direction). The design system shows the _variants the app uses_, not the
  Tailwind palette in full.
- **A nav / sidebar / TOC for the design system page.** Long single-scroll page
  is fine at v1 scale; anchor links can be a follow-up.

## Open questions

- **Where should screens be rendered statically in the showcase?** `Home` is
  trivial to render — it takes `onStart`, no session state. `Offerer` reads
  `session.state` to branch (gathering / awaiting-answer / connecting /
  connected / closed). Two options:
  - (a) **Stub `session` props** with hand-rolled minimal `ChatSession`-shaped
    objects for each branch. Faithful to the real component, but the stub
    interface must be kept in sync with `ChatSession` as it evolves.
  - (b) **Extract each screen's branch-body JSX** into smaller exported
    functions (e.g. `OffererInviteBody`, `OffererConnectedBody`,
    `OffererClosedBody`) so the showcase can render the body without supplying a
    session. More refactor scope but cleaner long-term.
  - **Recommendation:** start with (a) — minimal `session` stubs in the showcase
    file. If the stubs accumulate enough conditionals to feel fragile, escalate
    to (b) in a follow-up. Mention the choice in the PR description.
- **`Button`'s "ghost" variant vs. an existing dedicated `<a>`-styled link.**
  Today the "End chat" / "Cancel" header buttons share styling. Are these one
  variant (`ghost`) or two (`ghost-pill` for the small one, `secondary` for the
  larger paragraph-row Cancel button on the Joiner accept screen)? Reviewing the
  existing screens, **they're the same treatment at different padding**
  (`px-3 py-1` vs `px-5 py-2.5`). Treat as a single `variant="secondary"` with
  size driven by a `size?: "sm"|"md"` prop, or accept the inconsistency for v1
  and revisit when more buttons appear. **Recommendation:** add
  `size?: "sm"|"md"` (default `"md"`); both Offerer's "End chat" and Joiner's
  "Decline" map to `secondary` with different sizes.
- **`Heading`'s `level` vs the rendered visual size.** Today every screen's
  primary heading is an `<h1>` regardless of visual scale (32px on Home, 24px on
  Offerer/Joiner branch headings, 18px on the in-chat "Connected"). That's
  semantically correct (one h1 per screen). Should `<Heading>` decouple semantic
  level from visual size, e.g. `<Heading level={1} size="lg|md|sm">`?
  **Recommendation:** yes — `level` controls the rendered tag for screen-reader
  semantics, `size` controls the visual treatment. Default `size` to match the
  typical pairing for each `level` to keep call sites short.

## Notes for the implementer

- **Inventory the open-coded styles first.** Before extracting, grep for
  `bg-sky-600`, `border-slate-300`, `role="alert"`, `aria-live="polite"`,
  `text-3xl|2xl|lg font-semibold`, etc., across `src/screens/` and
  `src/components/`. The extraction should retire every duplicate; document any
  that you intentionally leave inline (and why) in the PR description.
- **Suggested order of work:**
  1. Add the six primitive files in `src/components/` with their existing styles
     literally copied off the source screen (no behavior change, no class
     drift).
  2. Replace open-coded usages in `Home.tsx`, `Offerer.tsx`, `Joiner.tsx`,
     `Chat.tsx`, `CopyBox.tsx` one screen at a time. Run tests after each screen
     — they should stay green without modification.
  3. Add the hash route branch in `App.tsx`. The existing `routeFromHash`
     function in `src/App.tsx:10-13` only checks for `offer`; extend it to a
     discriminated union with a `'design-system'` kind. Make sure the existing
     same-tab hash-change listener (`src/App.tsx:22-29`) also handles routing
     _to_ `#design-system` (the current listener only routes _to_ joiner —
     that's intentional for the offer-link case but we'll want a separate
     trigger for the design system).
  4. Write `src/design-system/DesignSystem.tsx` and
     `src/design-system/Section.tsx`. Compose primitives + screens.
  5. Pixel-compare each feature screen pre/post in both light and dark. Capture
     screenshots.
- **Hash routing edge cases.** `clearHash()` in `src/core/url.ts` is called in
  `App.tsx:37` when entering the joiner branch — make sure it does NOT fire when
  entering the design-system branch, or the user will be bounced back to home on
  first render. The simplest fix: the existing effect's
  `if (route.kind === 'joiner')` guard already short-circuits other kinds, so
  it's safe — but verify.
- **`Heading`'s ref forwarding.** Use `React.forwardRef` (or React 19's
  `ref`-as-prop) so `useFocusOnMount<HTMLHeadingElement>()` continues to work on
  the extracted heading. Existing call sites in `Offerer.tsx:50,116,142`,
  `Joiner.tsx:61,101,124,155`, and `Home.tsx:10-15` all attach a ref.
- **`Callout` and `role="alert"`.** The current usage at `Offerer.tsx:200` /
  `Joiner.tsx:188` puts `role="alert"` on the error `<p>`. `Callout` should
  default to _no_ role and let the caller opt in via prop
  (`<Callout variant="error" role="alert">`), because not every red banner
  should be an interrupting live region — and the current "Couldn't establish a
  direct connection" amber notice intentionally uses `role="alert"` too.
- **`LiveRegion` and stable identity.** `Offerer` and `Joiner` render the
  live-region message via a JSX const (`liveStatus`) defined once and embedded
  into each branch's return — the wrapping
  `<p role="status" aria-live="polite">` is a stable element across re-renders,
  which is required for the polite-announce to work. Make sure `<LiveRegion>`
  returns the same element shape (a stable `<p>` whose only changing child is
  the text content) — don't conditionally render the wrapper based on whether
  the message is empty, or screen readers will lose the live region across state
  transitions.
- **`Divider`'s use in `Chat`.** Today `Chat.tsx:130-134` open-codes the
  centered date row with two `<span>` borders. Extracting this to
  `<Divider>{<time>…</time>}</Divider>` should produce identical DOM (the
  `aria-hidden="true"` on the outer `<li>` stays in `Chat`; the new `Divider` is
  just the visual treatment).
- **The Chat organism preview needs an interactive `onSend`.** Wire it to
  `useState<ChatMessage[]>` in the design system page; on send, append
  `{ id: crypto.randomUUID(), from: 'me', text, at: Date.now() }`. Seed with 5
  fixture messages including a day-rollover and a multi-line entry so the date
  header and `whitespace-pre-wrap` paths are visible without typing.
- **Manual verification checklist (capture in PR):** Home, Offerer-invite,
  Offerer-connected (mid-chat), Offerer-closed, Joiner-invite, Joiner-reply,
  Joiner-connected (mid-chat), Joiner-closed — all 8 screens — light and dark —
  confirmed visually identical pre/post.
- **Don't grow scope.** If a primitive turns out to need more than a
  copy-of-existing-classes (e.g. a button hover state isn't centralized today),
  keep the v1 extraction faithful and file a follow-up improvement ticket. The
  design-system page itself doesn't change visible behavior; that's the
  contract.
- **Theme-toggle mechanics (AC #11).** Tailwind v4's `dark:` variant defaults to
  `@media (prefers-color-scheme: dark)` — i.e. it can't be class-driven out of
  the box. Two viable approaches:
  1. **Custom variant in CSS.** In `src/index.css`, register a custom dark
     variant that ALSO triggers when an ancestor has `.dark` (and a light
     variant for `.light`), e.g.
     `@custom-variant dark (&:where(.dark, .dark *));` (Tailwind v4 syntax).
     This lets the design-system page wrap itself in
     `<div className={mode === 'dark' ? 'dark' : mode === 'light' ? 'light' : ''}>`
     and the `dark:` classes already on every primitive will respect it.
  2. **Inline-style `color-scheme` + a wrapping `<div data-theme="…">`** with
     explicit selectors. Heavier, less idiomatic — prefer option (1).
  - Whichever option lands, verify on every feature screen that the original
    OS-driven dark mode still works (i.e. without `.dark`/`.light` ancestors,
    `prefers-color-scheme` still flips the theme). The custom-variant approach
    is additive — `(&:where(.dark, .dark *))` adds class-based triggering
    without removing the media-query trigger — so this should be safe; confirm
    during manual QA.
  - Toggle UI uses the new `<Button>` primitive (`variant="secondary"`,
    `size="sm"`), three buttons side-by-side with the active mode visually
    marked (e.g. an `aria-pressed` true/false + a ring) and labelled "Theme:
    System / Light / Dark" for screen readers.

## Coordination with prior tickets

- **FEAT-001 (Dark mode):** every primitive must carry both light + `dark:`
  classes (already true in the open-coded versions — preserve them verbatim
  during extraction).
- **FEAT-005 (System-only fonts):** font is inherited globally; no primitive
  should set `font-family`. Don't reintroduce a font override during extraction.
- **FEAT-006 (Chat date headers / per-message time):** the `<Divider>` primitive
  must support the centered-label-with-flanking-lines layout the chat date
  header relies on. The Chat showcase fixture must include a day-rollover so
  this path is exercised.
- **FEAT-002 (focus on composer):** `Chat`'s focus effects must keep working
  unchanged after the `<Textarea>` extraction. The composer ref must still
  resolve to the underlying `<textarea>` — forward the ref through the
  primitive.
- **A11Y-004 (sr-only "You said:" / "They said:"):** unchanged. The `Chat`
  organism still emits the sr-only prefix; the primitive extraction doesn't
  touch this.

## Working notes

### Test strategy

**New tests (TDD-first for primitives + route):**

1. `src/components/Button.test.tsx` — variant/size class wiring, default
   `type="button"`, `disabled` styling, `focus-visible:ring-*` carried, `dark:`
   classes preserved, extra `className` merges.
2. `src/components/Heading.test.tsx` — `level={1|2|3}` renders the matching tag;
   `tabIndex={-1}` + `focus:outline-none`; ref forwarding (the heading element
   is what comes back); `size` decoupling from `level`.
3. `src/components/Textarea.test.tsx` — renders `<textarea>` with the
   established slate-300 / sky-400 / dark classes; ref forwarding to the
   underlying `<textarea>`; native props (`rows`, `id`, `value`, etc.) pass
   through.
4. `src/components/Callout.test.tsx` — variant=info/success/warning/error class
   wiring; `role` opt-in (default has no `role`, explicit `role="alert"` lands
   on the DOM); stable wrapping element across re-renders.
5. `src/components/Divider.test.tsx` — produces a
   centered-label-with-flanking-lines DOM (two `aria-hidden` flank `<span>`s, a
   centered slot for the label).
6. `src/components/LiveRegion.test.tsx` —
   `<p role="status" aria-live="polite" className="sr-only">` shape; same
   element instance across re-renders even when the message changes (no
   conditional unmount).
7. `src/App.test.tsx` — extend the existing routing tests with:
   - `#design-system` renders the design system page (heading "Design system").
   - Going from `#design-system` to `#` returns to Home.
   - Visiting `#design-system` sets `document.title` to
     `Design system · P2P Chat`.
   - Entering the design-system branch does NOT scrub the hash (the user lands
     there intentionally).
8. `src/design-system/DesignSystem.test.tsx` — sections render (Typography,
   Color & surface, Atoms, Molecules, Organisms, Screen previews); Chat organism
   in showcase appends to local state on send (interactive without a peer);
   theme toggle has three buttons; choosing Dark applies a `.dark` class to the
   showcase root and choosing Light applies `.light`; default `System` applies
   neither.

**Existing-test protection:**

All 11 test files (85 tests) must keep passing. The refactor of `Home`,
`Offerer`, `Joiner`, `Chat`, `CopyBox` is structural — same DOM, same classes —
so the existing assertions (heading text, role queries, class regexes like
`dark:text-`, the FEAT-006 `data-testid="date-header"` / `message-bubble`
selectors) should hold without changes. The `dark-mode.test.tsx` Home
`dark:text-` class assertion in particular pins down that the heading still
carries a dark-mode override after extraction.

### Open-coded style inventory (to retire during extraction)

- **Primary button** (sky-600 / px-5 py-2.5 / focus-visible ring): `Home:23-28`,
  `Offerer:124-129` (Start a new chat), `Joiner:111-117` (Start a new chat),
  `Joiner:134-139` (Accept).
- **Primary button — sm** (sky-600 / px-4 py-2): `Offerer:190-195` (Connect),
  `Chat:185-190` (Send), `CopyBox:80-85` (Copy, px-3 py-1.5).
- **Secondary button — sm pill** (slate border / px-3 py-1):
  `Offerer:94-99,151-156`, `Joiner:81-86,165-170` (End chat / Cancel).
- **Secondary button — md** (slate border / px-5 py-2.5): `Joiner:140-145`
  (Decline).
- **Headings**
  (`<h1 tabIndex={-1} className="text-… font-semibold text-slate-900 focus:outline-none dark:text-slate-100">`):
  Home:13-18 (3xl), Offerer:91,115-119,141-145,
  Joiner:78,101-105,123-127,155-159 (lg / 2xl).
- **Textarea** (slate border / sky focus ring / dark): `Offerer:180-189`
  (answer-input), `CopyBox:63-70`, `Chat:169-184` (composer carries extra
  behavior — `field-sizing`, auto-grow).
- **Callout/error** (`role="alert"` red): `Offerer:199-205`, `Joiner:187-192`.
  **Amber warning**: `Offerer:208-211`, `Joiner:195-198`. **Emerald success**:
  `CopyBox:75-78` ("Copied!"). **Info paragraph** (muted): assorted
  `text-sm text-slate-600 dark:text-slate-400` paragraphs.
- **Divider** (centered label between flanking lines): `Chat:130-134` (date
  header).
- **LiveRegion** (`<p role="status" aria-live="polite" className="sr-only">`):
  `Offerer:76-80`, `Joiner:63-67`, `CopyBox:97-103`.

### Decisions taken (per recommendations in the ticket)

- `Button` ships `variant: 'primary' | 'secondary' | 'ghost'` +
  `size: 'sm' | 'md'` (default `md`). `ghost` is reserved for future zero-chrome
  buttons (header pills today land as `secondary size="sm"`).
- `Heading` ships `level: 1 | 2 | 3` (semantic tag) + `size: 'sm' | 'md' | 'lg'`
  (visual scale: lg = 32px, md = 24px, sm = 18px). Default `size` matches the
  typical pairing.
- `Callout` defaults to no `role`; callers explicitly opt in to `role="alert"`.
- Screen-preview rendering uses approach (a): stub minimal `ChatSession` shapes
  per branch in the showcase. If stubs grow brittle, escalate to (b) (export
  branch bodies) in a follow-up.
- Theme toggle uses Tailwind v4 custom variants in `index.css`:
  `@custom-variant dark (&:where(.dark, .dark *))` so a `.dark` ancestor flips
  the existing `dark:` utility classes (additive to `prefers-color-scheme`).
