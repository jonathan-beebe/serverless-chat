# FEAT-005: Use system-only fonts (native-feel typography)

**Status:** Resolved **Type:** Feature **Area:** Styling / typography

## Summary

Drop the explicit `font-family` override in `src/index.css` and rely on Tailwind
v4's preflight stack so the app renders in **whatever the host OS uses for its
own UI**. macOS/iOS get San Francisco; Windows gets Segoe UI Variable; Android
gets Roboto; Linux gets whatever the user's desktop has configured. Same rule
applies to the monospace code-blob textareas — system mono (SF Mono / Menlo /
Cascadia / Consolas) only.

No web fonts. No `@font-face`. No font CDN requests on load or at runtime.

## Customer value

- **Feels native on each platform.** A peer-to-peer chat app pitched on "no
  accounts, no servers, just a shared link" should also feel like it belongs on
  the device. Using each OS's own UI font is the lowest-effort, highest-fidelity
  way to do that — the type matches the surrounding OS chrome (window titlebars,
  menus, system notifications) instead of looking like a generic web app.
- **Pairs with the privacy story.** This app never makes a network round-trip
  for content; it shouldn't make one for the typeface either. Zero font fetches
  keeps the "serverless" pitch literal — open the page on a flaky connection and
  the text is legible immediately, no FOUT.
- **Faster first paint.** Skipping web font download/parse removes
  ~tens-to-hundreds of ms from cold load on a slow link, and removes any
  FOUT/FOIT flash.

## Business value

- The current setup is _almost_ system-only already (no `<link>` to Google
  Fonts, no `@font-face` — see `index.html` and `src/index.css`). This ticket
  exists to **lock that as a design rule** and remove the explicit stack
  override that's adding nothing over Tailwind v4's defaults.
- Smaller surface area: one fewer place in the codebase where someone could
  later drop in a webfont "just for this heading."
- Trivial implementation (delete one CSS block) with a clear, testable guarantee
  (zero font network requests).

## What a working feature delivers

A user loading the app on any platform sees:

- **UI text** rendered in the platform's native UI font — San Francisco on
  Apple, Segoe UI Variable on Windows 11, Roboto on Android, the configured
  desktop font on Linux.
- **Code-blob textareas** (the offer/answer SDP boxes in `CopyBox` and
  `Offerer`'s answer-input) rendered in the platform's native monospace — SF
  Mono on macOS, Cascadia Mono / Consolas on Windows, Menlo / DejaVu Mono on
  Linux.
- **Zero font requests** in the DevTools Network panel — on initial load, on
  screen transitions, on chat send/receive.
- **No FOUT / FOIT flash** — text is legible the instant the page paints.

Additional guarantees:

- The `body` font-family override in `src/index.css` is removed; the page picks
  up Tailwind v4 preflight's `--default-font-family` set on `html`.
- `font-mono` Tailwind utilities (currently used in
  `src/components/CopyBox.tsx:40` and `src/screens/Offerer.tsx:131`) continue to
  resolve to Tailwind v4's `--font-mono` default — a system-only mono stack.
- `index.html` continues to contain no
  `<link rel="preconnect|preload" href="…fonts…">`, no
  `<link href="https://fonts.googleapis.com/…">`, and no inlined `@font-face`.

## Acceptance criteria

1. The explicit `body { font-family: … }` block in `src/index.css` is removed
   (or replaced with `font-family: var(--font-sans)` if a body-scoped rule is
   still wanted for clarity). The body's effective `font-family` resolves to
   Tailwind v4 preflight's system-only stack
   (`ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"`).
2. On macOS, the resolved UI font in DevTools → Computed → `font-family` for
   `<body>` is San Francisco / `.AppleSystemUIFont` (whichever `system-ui`
   resolves to on the test machine). On Windows it resolves to Segoe UI
   Variable. (Spot-check on whichever platform the implementer has; document
   both in the PR.)
3. Code textareas (`CopyBox`, `Offerer` answer input) keep their monospace
   appearance and the resolved font-family is a system mono (`SFMono-Regular`,
   `Menlo`, `Consolas`, or `ui-monospace`).
4. No `@font-face` declarations exist anywhere under `src/` or `public/`.
5. No `<link>` to `fonts.googleapis.com`, `fonts.gstatic.com`,
   `use.typekit.net`, or any other font CDN exists in `index.html` or any built
   asset.
6. DevTools → Network panel, filtered to "Font", records **zero requests**
   during: initial load of `/`, navigating into Offerer, navigating into Joiner,
   opening a chat, sending and receiving messages, and toggling system dark mode
   (FEAT-001 once landed).
7. No visual regression to the existing screens: headings, body copy, buttons,
   and code blobs all render and remain legible. Cross-platform screenshots in
   the PR description (at least macOS + one of Windows/Android/Linux)
   demonstrate the platform-native rendering.

## Out of scope (v1)

- **Custom brand typeface, web font, or variable font.** Explicitly rejected —
  this ticket is the opposite direction.
- **Tailwind `@theme` customization of `--font-sans` / `--font-mono`.** We're
  accepting Tailwind v4's defaults as the canonical stack. If we ever want to
  deviate, it's a separate ticket.
- **Tabular-numeral or other OpenType feature opt-ins**
  (`font-variant-numeric: tabular-nums`, `font-feature-settings`). Defer until
  we have a screen where digit alignment matters.
- **Linting or CI enforcement** of "no webfont" (e.g., a Stylelint rule banning
  `@font-face`, or a build-time check that `index.html` contains no `fonts.`
  host). Nice-to-have, but not blocking this ticket — capture as a follow-up if
  drift becomes a concern.
- **`font-display` tuning** — N/A without web fonts.

## Open questions

- **Keep a body-scoped rule or rely on inheritance?** Tailwind v4 preflight sets
  `font-family` on `html`, and `body` inherits. The cleanest move is to delete
  the body rule entirely. The only reason to keep one would be to make the rule
  discoverable when grepping `src/` for font config. Recommend deleting it and
  adding a one-line comment in `src/index.css` noting that font-family is
  intentionally inherited from Tailwind preflight. Implementer's call.
- **Do we need a regression test?** The change is so small (delete a CSS block)
  that a unit test feels heavy. A simple option: add a CSS-text assertion in an
  existing test that asserts `document.body`'s computed `font-family` does
  **not** contain `Roboto` as a hard-coded entry (since the current explicit
  stack lists it, and the new state should not). Or skip and rely on the manual
  cross-platform screenshot check in the PR. Recommend skip — the manual check
  is sufficient for a typography rule.

## Notes for the implementer

- **Single touch-point:** `src/index.css:9-19`. The `body` rule currently sets
  `background-color`, `color`, and `font-family`. Keep the first two; remove the
  `font-family` declaration.
- **Tailwind v4 default stack reference:** see
  `node_modules/tailwindcss/theme.css:2-8` (`--font-sans`, `--font-mono`) and
  `node_modules/tailwindcss/preflight.css:28-46` (the `html, :host` rule that
  applies `--default-font-family`). Both are system-only.
- **`font-mono` usages already resolve correctly** via Tailwind v4's
  `--font-mono` default — no change needed to `CopyBox.tsx` or `Offerer.tsx`.
  Verify by inspecting computed `font-family` on the textarea after the change.
- **Verify zero font requests:** open DevTools → Network → filter "Font",
  reload, navigate every screen, send a message. Expect an empty list.
- **Cross-platform check:** if you only have one OS available, use the Chrome
  DevTools "Show user agent shadow DOM" / device emulator isn't enough —
  `system-ui` resolves against the host OS, not the emulated one. Just note in
  the PR which platform(s) you verified and we accept the rest on the strength
  of `system-ui`'s spec.
- **Coordinate with FEAT-001 (Dark mode):** no interaction expected — font and
  color are independent — but worth a glance since both touch `src/index.css`.
- **Coordinate with the A11Y series (A11Y-010, A11Y-011 on text contrast):**
  font-family change does not affect contrast ratios. No re-audit needed.

## Working notes

**Single change:** delete the `font-family` declaration from the `body` rule in
`src/index.css`. Keep `background-color` and `color` (they were updated by
FEAT-001 and are now split across a light-default and a
`@media (prefers-color-scheme: dark)` block). Add a one-line comment noting the
inheritance from Tailwind v4 preflight so future maintainers don't reintroduce
an override.

**Tests:** the ticket's open question recommends skipping a unit test ("manual
check is sufficient"). I'll add a small regression guard anyway — three cheap
file-content assertions that pin the rule:

- `src/index.css` body block no longer hardcodes `font-family`.
- `index.html` contains no `<link>` to a font CDN (`fonts.googleapis.com`,
  `fonts.gstatic.com`, `use.typekit.net`).
- No `@font-face` rule anywhere under `src/` or `public/`.

That's the lock the ticket asks for ("lock that as a design rule"). The
visual-rendering check across platforms stays manual.

**Existing tests to protect:** `src/dark-mode.test.tsx` reads `src/index.css` to
assert the `color-scheme` and dark `@media` block; those are untouched.
