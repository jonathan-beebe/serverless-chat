---
id: FEAT-014
type: feature
status: resolved
created: 2026-05-27
---

# FEAT-014: web share api for invite url

## Problem

The Offerer "Invite your friend" screen (`src/screens/Offerer.tsx:321-329`) and
the polite-defer "Send this code back" reply branch
(`src/screens/Offerer.tsx:271-278`) render the invite URL / reply code only
through CopyBox (`src/components/CopyBox.tsx`), which exposes a single Copy
action. On mobile, sending the invite still requires copy → leave the tab → open
Teams/SMS/email → paste → send. The Web Share API path (one tap → OS share sheet
pre-filled with the URL) is not wired up anywhere — `navigator.share` /
`navigator.canShare` do not appear in `src/` (grep is empty).

## Outcome

- **Share-supported case:** from the invite screen on a mobile browser, the user
  reaches the OS share sheet with the invite URL pre-populated in one tap, picks
  a target app (Teams, Messages, Mail, etc.), and sends — without ever leaving
  the keep-this-tab-open Offerer screen via the browser app-switcher.
- **Share-unsupported case:** on browsers without `navigator.share` (desktop
  Firefox, some desktop Chrome configurations, embedded webviews), the user
  reaches the existing CopyBox copy affordance unchanged — no regression, no
  broken/disabled control surfaced.
- **Reply-code branch (polite-defer):** same dual outcome applies to the reply
  CopyBox if appropriate.

## Why it matters

The invite hand-off is the single mandatory out-of-band step in the whole P2P
bootstrap; everything else (gathering, answer paste, channel open) is automatic.
Today that one step is the worst part of the mobile UX — multi-app context
switching for what is conceptually "send this link." Web Share collapses it to
one tap. As an open-source WebRTC-without-a-server example, the project should
demonstrate the platform-native invite hand-off, not just the
lowest-common-denominator copy-paste.

## Discovery notes

- `navigator.share` availability is uneven: iOS Safari and Android Chrome
  support it; desktop Safari supports it; desktop Chrome supports it
  conditionally (some flags/contexts); desktop Firefox does not implement it at
  all. Feature detection is mandatory; the copy path must remain.
- `navigator.canShare({ url, title, text })` returns false on browsers without a
  registered share target even when `navigator.share` exists — both checks
  matter.
- `navigator.share` requires a secure context and a transient user activation
  (must be invoked from a click/keypress handler). Async work between the click
  and the call can drop the activation.
- `navigator.share` returns a Promise that rejects with `AbortError` when the
  user dismisses the sheet — that is expected, not a failure, and should not
  surface as an error.
- The data to share is already in scope: `offerUrl` (`Offerer.tsx:297`) for the
  invite branch; `session.encodedLocal` for the reply branch. The page `<title>`
  ("Invite a friend · P2P Chat") and the existing CopyBox helpText give natural
  sources for `title` / `text` fields.
- Wrapping vs siblings: the share control could live inside CopyBox (one shared
  affordance) or beside it (Offerer-local). CopyBox is currently used in three
  screens (Offerer invite, Offerer reply, Joiner reply); the shape decision
  affects all of them.
- A11y precedent: CopyBox's success/failure feedback uses a persistent Callout +
  LiveRegion (A11Y-020 / A11Y-019); any share affordance needs the same posture
  — no auto-dismiss timers, AbortError should not announce as an error.
- PWA context: the app is installable (IMPRV-022 PWA work) and on installed
  mobile PWAs `navigator.share` is the expected path.

## Related work

- FEAT-011 — copy-conversation; established the two-tier clipboard pattern
  lifted into `core/clipboard.ts`.
- IMPRV-009 — row-menu copy transcript; second consumer of `core/clipboard.ts`
  (`copyTextToClipboard`).
- BUG-004 — CopyBox fallback regression; the reason CopyBox has its current
  fallback + manual-keystroke a11y story.
- A11Y-020 — drove the no-auto-dismiss "Copied!" Callout that any share-success
  feedback would coexist with.

## Working

- Re-validated the scope. `navigator.share` / `canShare` are still absent from
  `src/`. CopyBox is used in three spots: Offerer invite URL
  (`Offerer.tsx:321-329`), Offerer polite-defer reply (`Offerer.tsx:271-278`),
  Joiner reply (`Joiner.tsx:210-217`). The ticket explicitly carves out Joiner
  ("Don't change Joiner") and leaves the polite-defer reply at the implementer's
  judgment ("if appropriate").
- Mechanism: extend `CopyBox` with an optional `share?: { title?, text?, url }`
  prop. The component is the right home — it owns the affordance row that
  already hosts the Copy button + Copied callout + manual-copy hint + live
  region; co-locating share keeps the a11y posture (LiveRegion, no auto-dismiss
  timers) consistent and avoids open-coding a parallel UI in the screen. Callers
  opt in by passing `share`; absent that prop, render and behaviour are
  identical to today (satisfies the share-unsupported constraint, including
  desktop Firefox and any caller that doesn't pass it).
- Feature detection happens at render time inside CopyBox: gate on both
  `'share' in navigator` and `navigator.canShare?.(data) === true`. Computed in
  a `useMemo` keyed off `share` so SSR/tests without these APIs see the
  pre-share render.
- Share button click handler calls `navigator.share(data)` synchronously inside
  the onClick (no awaits before the call) to preserve the transient user
  activation. `AbortError` rejections are swallowed (user dismissed the sheet);
  other rejections are silent visually — the LiveRegion stays quiet on cancel
  and on share-failure we don't surface an error (Copy remains available as
  fallback).
- Polite-defer reply branch: judged NOT appropriate. Reply codes are opaque
  base64 strings (no URL), the matching Joiner reply CopyBox is off-limits per
  ticket, and `canShare({ text })` semantics for non-URL payloads vary by
  platform. Keeps surface area symmetric with Joiner. Only the Offerer invite
  URL CopyBox gets `share`.
- A11y: Share button focus precedes Copy when share is rendered (it's the
  primary affordance on mobile); when `autoFocus` is set, focus lands on Share
  if available, otherwise Copy. Share success is silent in UI (the share sheet's
  own dismissal IS the confirmation); no Callout/LiveRegion churn, matching the
  platform convention.
