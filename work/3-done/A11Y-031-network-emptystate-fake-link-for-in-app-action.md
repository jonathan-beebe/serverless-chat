---
id: A11Y-031
type: a11y
status: abandoned
created: 2026-05-24
abandoned: 2026-05-24
superseded_by: ARCH-001
---

> **Abandoned in favor of ARCH-001.** This ticket's deliverable (confirm the
> EmptyState's `<a href="#">` is honest, add a doc-comment, add a role/href
> test) falls out of ARCH-001's implementation: once the chat surface is
> URL-addressable, the "Back to home" destination is the real home URL, and the
> link/button choice for in-app navigation is settled at the architecture level
> rather than as a one-off cleanup. Implementer should work ARCH-001; any
> residual EmptyState test belongs in that PR.

# A11Y-031: Network EmptyState "Back to home" uses `<a href="#">` for an in-app action

**WCAG:**

- 4.1.2 Name, Role, Value — Level A
- 2.4.4 Link Purpose (In Context) — Level A (intent)

**Severity:** Medium — the anchor advertises navigation semantics (a link to
`#`) that don't match the implicit behavior (hashchange listener routes empty
fragment to Home). SR users hear "Back to home, link" and form expectations
(back-stack push, copy-link, open-in-new-tab) that the element doesn't reliably
honor. Power-user keyboard idioms (Cmd/Ctrl-click, middle-click, "Copy link
address") look broken.

**Location:** `src/network/Network.tsx:237–242` — inside the `EmptyState`
component returned when there's no active session.

```tsx
// lines 237–242
<a
  ref={homeRef}
  href="#"
  className="self-start rounded-md bg-sky-700 px-3 py-2 text-sm font-medium text-white hover:bg-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-50 dark:focus-visible:ring-offset-stone-900">
  Back to home
</a>
```

The element renders a primary-button-shaped surface (sky-700 fill, white text,
rounded-md). Visually it looks like a button; semantically it's an anchor;
behaviorally it's neither well-formed: `href="#"` navigates to "current page
with empty fragment", which the app's hashchange listener in `App.tsx` then
catches and routes home.

A sibling shape lives at `src/network/Network.tsx:269–278`, the main view's
"Back" affordance — but that one is a
`<Button onClick={() => { window.location.hash = '' }}>`. That's the same
logical action (navigate home) with the opposite role mismatch — covered by
ticket #11 in this batch as a separate ticket.

## Problem

`<a href="#">` is a real anchor. Per HTML semantics:

- **Right-click → "Open Link in New Tab"** → opens a new tab on the same URL
  with `#` appended. The new tab loads the app fresh; if the app is served from
  `/`, the hashchange listener catches `#` and routes home, which "works" by
  accident but is a confused user model.
- **Cmd/Ctrl-click** → opens in new tab; same as above.
- **Middle-click** → opens in new tab; same.
- **Shift-click** → opens in new window; same.
- **Right-click → "Copy Link Address"** → copies the current URL with `#`
  appended. The copied URL doesn't reliably round-trip — pasting it in a fresh
  tab loads the app and immediately routes home, which isn't what the user
  expected.
- **Back button** → adds a history entry for `#` then navigates back to the
  previous page; the user's idea of "back to home" doesn't match the browser's
  history behavior.

Per WCAG 4.1.2, an interactive element's accessible role must match its
behavior. `<a>` has implicit role `link`; the AT contract for `link` is
"activating this takes you somewhere, in a way that participates in the
URL/history model." This element does that partially — it does navigate, but its
href ("#") is a placeholder, not a meaningful URL.

### Two coherent fixes; pick one

**Option (a) — keep it a link, but make `href` meaningful.**

The app's existing hashchange listener (in `App.tsx`, established by A11Y-005 /
BUG-001) routes the empty-fragment URL to Home. The current `href="#"` already
does that, but the semantics are clearer if the "home" route has its own
explicit href. Since this app uses hash-routing, the canonical Home URL is the
page with no fragment. `href="#"` produces the equivalent URL; using `href="#"`
is correct for a hash-routed app.

Real fix in this option: keep `<a href="#">` but stop overloading it with
button-shaped styling and click-driven side effects. The user expectation for a
link is "URL navigation"; we already do that. No JavaScript needed.

This option works fine; the open question is only whether the styling makes it
look too button-like to be honest about its role. For consistency with the main
view's "Back" affordance (which is currently a `<Button>`; ticket #11 proposes
converting _that_ to `<a href="#">`), keeping this as `<a href="#">` and
converting the main view's button is the coherent end state.

**Option (b) — keep both as `<Button>` and route the navigation in JS.**

Drop the `<a>` here; make it
`<Button onClick={() => { window.location.hash = '' }}>`. Mirrors the main
view's existing pattern. Loses link semantics (no open-in-new-tab, no
copy-link); gains semantic honesty (it really is a button — it changes app state
via JS).

This option is what ticket #11 explicitly _rejects_ for the main view's Back
affordance: open-in-new-tab is a power-user idiom worth preserving. Same
argument applies here.

### Recommended direction

**Make both the EmptyState's "Back to home" and the main view's "Back" use
`<a href="#">`.** Bundle the two fixes if a shared "back to home" helper falls
out naturally (e.g., a tiny `<HomeLink>` component exported from
`src/components/`, styled like the existing button-shaped primary so the visual
treatment matches but the semantics are honest).

That direction keeps the link semantics (open-in-new-tab works, copy-link works,
browser history is clean) and unifies the two affordances behind one shape.

For _this_ ticket — just the EmptyState site — the minimal change is:

- Confirm `<a href="#">` is the right choice (it is — the app is hash-routed,
  `#` is the canonical "home" URL).
- Confirm the styling is honest: a button-shaped anchor is fine as long as the
  implicit semantics (link) match the contract (URL navigation). No change
  needed if option (a).
- If the project consensus is option (b), swap to `<Button>`.

The ticket lands on option (a) — keep `<a href="#">`, no code change to behavior
— but pairs with ticket #11 (Network main-view "Back" button → `<a href="#">`)
so the two affordances land together.

### Wait — is there a real defect here at all?

Yes: the `<a href="#">` exists, but the visual styling makes it look like a
primary-button-shaped action, and that styling is currently shared with the main
view's `<Button>` Back affordance. The mismatch is across the two sibling
affordances, not inside this single one.

Concretely, this ticket's deliverable is **document and confirm** that
`<a href="#">` is correct, and ensure the styling is consistent with ticket
#11's converted `<a href="#">` once that lands. If the consensus after review is
that the EmptyState should _also_ be a button, swap here.

## Suggested fix

Land alongside ticket #11 (A11Y-035, Network main-view "Back" → `<a href="#">`).
For this ticket, the minimal change set is:

1. **Verify the role.** The element at lines 237–242 is `<a href="#">`. No
   change needed if option (a) (the recommended direction).
2. **Verify the focus styling.** The existing `focus-visible:` classes already
   match A11Y-017's canonical pattern. No change needed.
3. **Extract a shared helper** (optional, recommended): a tiny `<HomeLink>`
   component in `src/components/` that renders `<a href="#">` with the standard
   primary-button styling. Both this ticket's site and ticket #11's site consume
   it. Eliminates drift between the two.
4. **Add an a11y test** that asserts the element has role `link` and `href="#"`.
   Guards a future refactor that might convert it to a button.
5. **Document the rationale inline** with a code comment:

   ```tsx
   // A11Y-031: this is an <a href="#"> (not a button) so power-user idioms
   // — Cmd/Ctrl-click, middle-click, "Copy Link Address" — work as
   // expected. The app's hashchange listener catches the empty fragment
   // and routes home; `href="#"` is the canonical Home URL in a
   // hash-routed app.
   ```

## Acceptance

- The `EmptyState`'s "Back to home" affordance at
  `src/network/Network.tsx:237–242` is (or remains) an `<a href="#">` with the
  existing button-shaped primary styling.
- An inline comment documents the rationale (link vs button choice).
- A test asserts the rendered element has role `link` and `href="#"`, guarding a
  future refactor that might convert it back to a button.
- (Optional) A `<HomeLink>` shared component in `src/components/` is introduced
  and consumed here; the same component is consumed by ticket #11's converted
  main-view affordance.
- The main-view "Back" `<Button>` at lines 269–278 is _not_ changed by this
  ticket (ticket #11 owns that).
- `npm test`, `npm run lint`, `npm run typecheck` clean.
- Manual smoke: from a fresh tab, navigate directly to `#network` (no active
  session). Confirm the EmptyState renders. Right-click "Back to home" → "Copy
  Link Address" → paste in a new tab → confirm the new tab loads Home.
  Cmd/Ctrl-click → confirm new tab opens to Home.

## Related work

- **A11Y-005** (resolved) — focus is moved on navigation; relevant for both Home
  and the EmptyState's focused link.
- **BUG-001** (resolved) — `clearHash` effect dep widening; the hashchange
  routing path this ticket depends on.
- **Ticket #11 in this batch** (A11Y-035 — Network header "Back" →
  `<a href="#">`) — sibling fix, coordinate landing order.
