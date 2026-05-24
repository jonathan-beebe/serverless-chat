# IMPRV-004: `Offerer` reads `location` and `import.meta.env` directly, blurring the view/controller boundary

**Status:** Resolved **Severity:** Low **Location:** `src/screens/Offerer.tsx`
(line 44-45)

## Problem

`Offerer` — a screen (view) component — reads two ambient globals to assemble
the invite URL it renders:

```tsx
const offerUrl =
  session.encodedLocal &&
  buildOfferUrl(location.origin, import.meta.env.BASE_URL, session.encodedLocal)
```

This conflicts with the project's stated boundary between view components and
the controllers / api code that glue them together:

- The component now depends on Vite's `import.meta.env.BASE_URL` and the
  browser's `location.origin`, neither of which is a rendering concern.
- Testing the screen in isolation requires stubbing those globals.
  `App.test.tsx` already has to call `history.replaceState` for routing;
  multiplying that surface area across screens makes tests progressively harder
  to write.
- If we ever want the same offer URL elsewhere (a share sheet, the QR code
  suggested in the spike §5, a debug panel), every consumer has to re-import
  these globals.

`buildOfferUrl` in `src/core/url.ts` is correctly pure and well-tested — the
problem is purely where its _inputs_ are read.

## Intended behavior

The view should receive a ready-to-render URL (or `null` while it's not yet
available) and not need to know where it comes from. Origin and base path are
environment concerns owned by the controller layer or by a small helper in
`core/`.

## Suggested fix

Pick one of the following and apply it consistently:

1. **Compute on the controller side.** Have `useChatSession` (or a thin selector
   around it) expose `offerUrl: string | null` derived from `encodedLocal`,
   alongside the existing `encodedLocal`. The view renders the URL it's given.
   This keeps env access in the imperative shell layer where similar concerns
   already live.

2. **Add a `core/url.ts` helper.** Export a no-arg
   `currentOfferUrl(encodedOffer: string)` that reads `location.origin` and
   `import.meta.env.BASE_URL` internally and delegates to `buildOfferUrl`. The
   view stays imperative-shell-thin; the env access is centralised in
   `core/url.ts`, which already owns URL concerns. The existing pure tests for
   `buildOfferUrl` are unaffected.

Option 2 is the smaller diff and matches the existing pattern in `core/url.ts`.
Option 1 is structurally cleaner if we expect more environment-aware derivations
to appear.

Either way, the existing `buildOfferUrl` tests in `src/core/url.test.ts` are
unchanged — only the call site moves.

## Working notes

### Survey of the existing surface

- `src/screens/Offerer.tsx:44-45` is the only consumer of
  `import.meta.env.BASE_URL` outside Vite's own config; it is also the only
  consumer of `location.origin` outside `src/core/url.ts` (where `clearHash`
  reads `location.pathname`/`location.search`).
- `src/core/url.ts` already owns the "URL concerns" surface: pure
  `buildOfferUrl` + `readHashParam`, and one imperative `clearHash` that touches
  `history`/`location`. There is a clear precedent for a thin imperative URL
  helper living next to the pure ones.
- `useChatSession` is intentionally about the WebRTC state machine; it has no
  other "presentation URL" responsibilities. Wiring `offerUrl` into the hook
  would expand its surface for one screen's benefit.
- `Joiner` doesn't need an offer URL — only `Offerer` does. So this is a
  one-call-site concern.

### Decision: Option 2 from the ticket — small helper in `core/url.ts`

The ticket explicitly lists Option 2 as "the smaller diff and matches the
existing pattern." Both `clearHash` (already in `core/url.ts`) and the proposed
`currentOfferUrl` are the same shape: a no-arg imperative wrapper that reads
ambient browser/build globals and delegates to a pure helper. Adding one more
sibling matches the existing pattern; promoting `offerUrl` into `useChatSession`
would invent a new env-aware concern in a hook that currently has none.
CLAUDE.md guidance ("favor existing patterns; don't invent new ones") points the
same way.

Per-project Vite config: `base` is not customized in `vite.config.js`, so
`import.meta.env.BASE_URL` defaults to `'/'`. Both options produce identical
output today; the helper preserves that exactly.

### TDD plan

1. Add a failing test in `src/core/url.test.ts` for a new
   `currentOfferUrl(encodedOffer)` that asserts it returns
   `${location.origin}${BASE_URL}#offer=<payload>` using the ambient jsdom
   `location` (default `http://localhost:3000`) and Vite's default `BASE_URL` of
   `'/'`.
2. Implement `currentOfferUrl` in `src/core/url.ts` as a thin wrapper that reads
   `location.origin` + `import.meta.env.BASE_URL` and delegates to
   `buildOfferUrl`. (Behavior-preserving — same string as before for the same
   input.)
3. Swap the call site in `Offerer.tsx` to
   `currentOfferUrl(session.encodedLocal)`. Drop the now-unused `buildOfferUrl`
   import.
4. Run `npm test`, `npm run typecheck`, `npm run lint`. Existing `buildOfferUrl`
   tests and `App.test.tsx` should remain green untouched.

### Why not a hook / not a prop / not threading config through `App.tsx`

- A `useOfferUrl()` hook would still need to read the same two globals; it just
  adds a layer.
- Injecting `origin` + `basePath` as `Offerer` props pushes the same env reads
  up to `App.tsx`, which then has the same boundary smell — and no other
  consumer is asking for it.
- A small `currentOfferUrl` keeps env reads in one file (`core/url.ts`) that
  already houses them, and the view goes back to being purely presentational.
