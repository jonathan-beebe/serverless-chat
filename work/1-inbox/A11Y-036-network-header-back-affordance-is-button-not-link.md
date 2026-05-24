---
id: A11Y-036
type: a11y
status: open
created: 2026-05-24
---

# A11Y-036: Network header Back affordance is a button, not a link

## Problem

The "Back" affordance in the Network telemetry main-view header
(`src/network/Network.tsx:269–278`) is a `<button>` whose `onClick` writes `''`
to `window.location.hash`. The action is a navigation (it returns the user to
Home) but the element's role is button. The sibling EmptyState affordance on the
same screen uses `<a href="#">` for the same destination — the two disagree
about how to go home.

## Outcome

The Network header "Back" affordance behaves as a link to Home: right-click →
"Open in new tab", middle-click, and Cmd/Ctrl-click all open Home in a new
tab/window; right-click → "Copy link address" yields the home URL; screen
readers announce it as a link with a purpose that names the destination ("Back
to home"). The EmptyState and header affordances behave the same way as each
other.

## Why it matters

WCAG 4.1.2 (Name, Role, Value, Level A) — the exposed role must match the
control's actual semantics. Keyboard and AT users lose the link-interaction
patterns they depend on for working in parallel tabs. SR purpose-of-link (2.4.4
intent) is weaker than it could be: "Back, button" vs "Back to home, link". The
within-screen inconsistency with the EmptyState affordance is its own usability
papercut.

## Discovery notes

The header affordance and the EmptyState affordance have identical intent
("clear the hash, go home, styled like a small secondary button"). A11Y-031
already flagged a shared helper as a possible cleanup — work-start may want to
bundle.

## Related work

- A11Y-031 (open, inbox) — sibling EmptyState "Back to home" affordance on the
  same screen; natural bundle candidate.
- A11Y-005 (resolved) — focus-on-navigation; this ticket surfaces a navigation
  that doesn't announce as one.
- BUG-008 (open, inbox) — back-from-network loses live session; adjacent but a
  separate root cause (routing state, not affordance role).
