---
id: IMPRV-019
type: improvement
status: resolved
created: 2026-05-25
resolved: 2026-05-25
---

# IMPRV-019: mock connected-chat route at /design-system/chat for mobile testing

## Problem

The design system at /design-system today previews the connected chat surface
two incomplete ways: (a) the "Chat — interactive" Organism row at
DesignSystem.tsx:354 mounts the Chat component in a 384×fluid box with no header
chrome, and (b) the "Connected chat layout (header chrome)" ScreenPreview at
DesignSystem.tsx:412 renders the chrome inside an `inert` wrapper with no actual
Chat instance. Neither matches the production connected screen — full-viewport
ScreenContainer, h-[calc(var(--vvh)-3rem)], header + End-chat pill, and an
interactive Chat — so verifying mobile-only behavior (IMPRV-017's visualViewport
binding, iOS keyboard, near-bottom auto-scroll) still requires negotiating a
real SDP handshake between two devices.

## Outcome

- Visiting /design-system/chat in a browser (including mobile) renders the exact
  connected-state UI that Offerer.tsx renders when session.state ===
  'connected': full-viewport shell bound to --vvh, "Connected" h1, End-chat
  button, the Chat transcript pre-populated with the existing showcase fixture,
  and the focused composer.
- The composer is interactive: typing + send appends a "me" message to the
  transcript (same behavior as today's interactive Chat organism preview). No
  simulated peer replies.
- The route does not require, mutate, or depend on the live useChatSession hook
  — a stubbed ChatSession at state 'connected' drives the render.
- The existing inert "Connected chat layout (header chrome)" ScreenPreview at
  DesignSystem.tsx:412 is removed; /design-system/chat is the canonical
  connected-screen preview.
- The /design-system index page links to /design-system/chat from the
  screen-previews section.

## Why it matters

- Mobile is the dominant usage mode (per IMPRV-017's framing). The recent
  visualViewport / keyboard work landed without a fast loop for verifying it on
  a real iPhone — the only way to reach the connected screen is to open two
  browsers and complete a handshake.
- Future work on the connected shell (transcript, composer, keyboard, responsive
  layout) will inherit the same friction unless a no-handshake surface exists.
- The current inert preview misleads — it looks like the connected screen but
  you can't tab into it, can't type, and has no Chat instance. Replacing it with
  the real thing closes that gap.

## Discovery notes

- DesignSystem.tsx already has a usable `stubSession()` helper (line 49) and a
  `buildChatFixture()` (line 29). A connected-state stub is one call:
  `stubSession({ state: 'connected', messages: showcaseMessages, send: ... })`.
- The connected branch in Offerer.tsx:196–215 is the exact JSX to mirror.
  Extracting it into a shared `ConnectedShell` component would let both Offerer
  and the new route render the same source — but that's a refactor; the simpler
  path is to render Offerer directly with a stub session at state 'connected'.
- The route lives inside AppShell today (App.tsx:37–43). AppShell wraps the
  outlet in SessionContext.Provider with the live useChatSession — the new route
  either (i) sits inside AppShell and replaces context with its own stub, or
  (ii) sits as a sibling route outside AppShell. Both work; the inside-AppShell
  option is one line.
- ScreenChromeContext is what the existing previews use to demote landmarks and
  headings (A11Y-013, A11Y-022). The new route is a top-level page, not a
  preview-inside-a-page, so it should NOT use the showcase chrome — it should
  render with the production chrome so the document outline matches the real
  screen.

## Recommendation

- Add a new route `/design-system/chat` in src/App.tsx alongside the existing
  `/design-system` route.
- The route component lives in src/design-system/ (e.g. DesignSystemChat.tsx).
  It builds a local stub session at state 'connected' with the
  buildChatFixture()/onShowcaseSend handlers already present in DesignSystem.tsx
  (extract or copy — small enough to copy), then renders
  `<Offerer session={stub} conversationId={DS_PREVIEW_CONV_ID} onCancel={() => navigate('/design-system')} />`.
  The 'connected' branch in Offerer is what paints.
- Do NOT wrap in ScreenChromeContext — this is a standalone page, so the default
  chrome (real `<main>`, real h1, useFocusOnMount) is correct.
- Remove the "Connected chat layout (header chrome)" ScreenPreview at
  DesignSystem.tsx:412 and its supporting `ConnectedChromePreview` component at
  DesignSystem.tsx:513. Add a single link in the "Screen previews" section
  pointing to /design-system/chat ("Open in a real route →") so the existing
  surface stays self-documenting.
- Test coverage: a small render test that mounts AppRoutes at
  /design-system/chat, asserts the "Connected" heading is present, the composer
  is reachable, and sending a message appends to the transcript.

## Related work

- FEAT-007 — design system route + preview infrastructure.
- FEAT-013, IMPRV-017 — mobile responsive + visualViewport keyboard binding (the
  immediate motivator).
- IMPRV-005, IMPRV-007 — transcript auto-scroll + body-lock pattern that the
  connected shell relies on.
- A11Y-013, A11Y-022, A11Y-024 — showcase landmark/heading demotion + inert
  previews (the chrome that today's previews live under).
