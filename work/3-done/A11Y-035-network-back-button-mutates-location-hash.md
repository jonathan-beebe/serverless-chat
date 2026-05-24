---
id: A11Y-035
type: a11y
status: abandoned
created: 2026-05-24
abandoned: 2026-05-24
superseded_by: A11Y-036
---

> **Abandoned in favor of A11Y-036.** This ticket was filed under the old
> `/work-define` skill and pre-committed to a specific implementation path
> (inline `<a>` vs shared `<HomeLink>` component). A11Y-036 captures the same
> problem under the new `/work-scope` + `/work-write` flow: problem + observable
> outcome only, with the shared-helper question routed to advisory
> `## Discovery notes`. Implementer should work A11Y-036.

# A11Y-035: Network header "Back" affordance mutates `window.location.hash` instead of using `<a href="#">`

**WCAG:**

- 4.1.2 Name, Role, Value — Level A
- 2.4.4 Link Purpose (In Context) (intent) — Level A

**Severity:** Medium — keyboard / power-user / AT users lose link affordances
(open-in-new-tab, middle-click, copy-link-address, back-stack honesty). The
visible label "Back" is acted on as a navigation, but the underlying element is
a `<button>` — a role/behaviour mismatch.

**Location:** `src/network/Network.tsx:269–278` (the `<Button>` in the Network
main-view header).

```tsx
<Button
  variant="secondary"
  size="sm"
  onClick={() => {
    // Hash-clear nav back home. Same pattern as `clearHash` but
    // avoids importing it here (Network is decoupled from url.ts).
    window.location.hash = ''
  }}>
  Back
</Button>
```

## Problem

The element is rendered as a `<button>` (via the design system `Button`), but
the action it performs is a navigation: clearing the URL hash returns the user
to the Home screen. WCAG 4.1.2 (Name, Role, Value) is normatively about the role
exposed to AT matching the actual semantics of the control. The current
role-vs-behaviour mismatch produces concrete losses for several user groups:

### 1. Lost link affordances (real, observable on every browser)

A `<button>` does not support any of the link interaction patterns power users
and AT users depend on:

- **Right-click → "Open in new tab" / "Open in new window"** — unavailable.
- **Middle-click** — does nothing.
- **Cmd-click (macOS) / Ctrl-click (Windows/Linux)** — does nothing (these open
  links in background tabs).
- **Right-click → "Copy link address"** — unavailable.
- **Drag-to-bookmark** — unavailable.
- **Hover-preview of destination in the status bar** — absent (there is no URL
  to preview).

For a user who wants to keep the Network telemetry view open while also peeking
at Home, the only path today is to memorize the URL pattern and type a new tab
manually.

### 2. Back-stack inconsistency

`window.location.hash = ''` triggers a `hashchange` event and pushes a new
history entry. A real `<a href="#">` does the same — but with an `<a>`, the
user's mental model of "this is a link, the back button will undo it" matches
reality. With a `<button>` styled as a link-like affordance, some users expect a
transient action (a modal close, a setting toggle) rather than a navigation, and
the resulting back-stack mutation surprises them.

### 3. Screen-reader purpose-of-link clarity (2.4.4 intent)

NVDA / VoiceOver announce the current element as "Back, button". A proper link
would announce "Back to home, link" or similar — naming the destination,
matching the SC 2.4.4 intent that link purpose be determinable from the link
text alone (or text + programmatically determinable context). "Back, button"
leaves the user to infer the destination from the surrounding heading ("Network
telemetry") — the heading is the context, but the announcement chain is weaker
than the link form would be.

### 4. Sibling inconsistency

The EmptyState in this same screen already uses `<a href="#">` for its "Back to
home" affordance — see A11Y-031, which proposes the inverse fix (audit the link
choice, ensure honesty). The two affordances on the same screen disagree about
how to go home. Bundling A11Y-031 and this ticket is the natural cleanup.

## Suggested fix

Replace the `<Button>` with a styled `<a href="#">` that visually matches the
existing `Button variant="secondary" size="sm"`:

```tsx
<a href="#" className="<same classes the secondary/sm button produces>">
  Back
</a>
```

Two implementation paths:

**(a) Inline `<a>` with hand-copied classes.** Simple, minimal change to the
design system. The `<a>` carries the same focus ring, border, padding, and color
tokens the button does.

**(b) Extract a shared `<HomeLink>` (or `<BackToHomeLink>`) component.**
A11Y-031 already flagged this possibility — the Network EmptyState affordance
and this header affordance are the two existing call sites with identical intent
("clear the hash, go home, styled like a small secondary button"). A shared
component carries the link semantics, the visual treatment, and any future
centralised behaviour (analytics, prefetch, transitions). Recommended if
A11Y-031 and this ticket are worked together.

In either case, the focus-ring classes the design system already applies to
interactive elements must be preserved so keyboard focus stays visible —
A11Y-029 et al. are the related "focus indicator" family.

The accessible name should read "Back to home" rather than just "Back", matching
the EmptyState's pattern and improving 2.4.4 alignment:

```tsx
<a href="#" ...>Back to home</a>
```

If the visible text needs to stay "Back" (for header compactness), use
`aria-label="Back to home"` so the announcement carries the destination.

## Acceptance

- The `<Button>` at `src/network/Network.tsx:269–278` is replaced with
  `<a href="#">` (or the shared `<HomeLink>` from A11Y-031).
- The visible appearance is unchanged (same border, padding, focus ring,
  hover/active states as `Button variant="secondary" size="sm"`).
- Right-click → "Open in new tab" produces a new tab on the Home screen.
- Middle-click and Cmd/Ctrl-click open the Home screen in a new tab / window
  respectively.
- Right-click → "Copy link address" yields a URL ending in `#` (the home hash).
- The accessible name includes the destination: either visible text "Back to
  home" or `aria-label="Back to home"` if the visible text stays "Back".
- Tests:
  - A Network test asserts the back affordance is an `<a>` with `href="#"`
    (`getByRole('link', { name: /back to home/i })` returns the element).
  - A Network test asserts clicking it returns the user to the Home screen
    (existing back-behaviour test, updated for the new role).
- `npm test`, `npm run lint`, `npm run typecheck` clean.
- Manual smoke: VoiceOver / NVDA announce "Back to home, link"; Cmd-click opens
  Home in a new tab.

## Related work

- **A11Y-005** (resolved) — focus not moved on navigation. This ticket surfaces
  a navigation that today doesn't announce as one; A11Y-005 is the route-level
  focus story.
- **A11Y-031** (open, inbox) — Network EmptyState "Back to home" is
  `<a href="#">` for an in-app action; the sibling affordance on the same
  screen. A shared `<HomeLink>` helper is the natural bundle if both are
  scheduled together (the original A11Y-031 ticket already flagged this).
