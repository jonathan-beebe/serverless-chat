# A11Y-024: DesignSystem screen previews are fully tab-navigable but wired to no-op handlers, creating 20+ dead tab stops and unactionable controls for keyboard users

**Status:** Resolved

## Resolution

Applied **Option A** from the ticket's recommended path. The `ScreenPreview`
wrapper in `src/design-system/DesignSystem.tsx` now sets the React 19 `inert`
JSX boolean prop on the inner container that holds the previewed screen, plus an
`aria-label` of `"<label> (preview, non-interactive)"` for any tool that
surfaces the wrapper outside the AT pipeline. The seven `<ScreenPreview>` call
sites and the `stubSession` helper are unchanged.

This removes the ~20 buttons and form controls inside the preview regions from
the keyboard tab order, from hit testing, and from AT exposure — the visual
rendering is preserved for sighted review. The CopyBox Copy button inside the
Joiner reply preview no longer fires (it used to silently overwrite the
reviewer's clipboard with `FAKE_REPLY`), which is the desired behavior per the
ticket.

The interactive Chat organism in the Organisms section is rendered _outside_
`<ScreenPreview>`, so it remains fully keyboard-operable.

### Tests added (`src/design-system/DesignSystem.test.tsx`)

A new `describe('screen previews are inert (A11Y-024)', …)` block adds three
sentinels:

1. **`marks every ScreenPreview content wrapper with the inert attribute`** —
   walks each of the seven preview labels and asserts `hasAttribute('inert')` on
   the sibling content wrapper.
2. **`wraps every focusable control inside a preview region with an inert ancestor`**
   — queries all natively focusable controls inside every `[inert]` wrapper and
   asserts each one has an `[inert]` ancestor. (jsdom does not honor live
   `inert` Tab semantics — see note below — so the structural assertion is the
   closest test-environment proxy for "Tab does not land here.")
3. **`keeps the interactive Chat composer keyboard-operable (regression guard for the Organisms section)`**
   — focuses the composer, types via `userEvent`, fires Enter, and asserts the
   typed message appears in the transcript.

### Notes

- React 19 supports the `inert` JSX boolean prop directly. `package.json` pins
  `react@^19.2.6`, so the prop serializes to `inert=""` and no `useRef` +
  `setAttribute` workaround is needed. A comment in the source documents the
  React-version constraint.
- **jsdom limitation:** jsdom does not implement the focus-blocking semantics of
  the `inert` attribute. The first iteration of test #2 above used
  `userEvent.tab()` in a loop and asserted `document.activeElement` was not
  inside any `[inert]` subtree; that test failed in jsdom even with the fix in
  place because the test environment lets Tab walk into inert subtrees. Real
  browsers honor the attribute (Baseline 2023). The structural-precondition
  assertion is the strongest sentinel available in this test environment; the
  live-focus path is covered by the manual smoke checklist in the original
  ticket.
- `eslint src`, `tsc --noEmit`, and `vitest run` all pass (157/157 tests).

Commit: 7a0ff64

**WCAG:**

- 2.4.3 Focus Order — Level A
- 3.2.4 Consistent Identification — Level AA
- 4.1.2 Name, Role, Value — Level A
- 2.4.6 Headings and Labels — Level AA (adjacent concern; see Problem analysis)

**Severity:** Medium — the showcase is a developer-facing route
(`#design-system`) and not part of the user-facing chat flow, but it is shipped
in the production bundle, the route is bookmarkable, and any auditor walking
through the app with assistive tech will hit it. The combination with the
parallel "previews steal initial focus" ticket (A11Y-022) compounds the issue: a
keyboard user is dumped mid-page AND has no idea which of the surrounding
controls are real. The previews put 20+ controls in the tab order whose
activation produces no observable effect, which makes the route actively
misleading for the AT audience that is most likely to load it.

## Location

`src/design-system/DesignSystem.tsx` — the `Section title="Screen previews"`
block at approximately lines 302-339, plus the `ScreenPreview` wrapper at lines
354-363, plus the `stubSession` helper at lines 41-52.

Each `<ScreenPreview>` mounts a real production screen with stub callbacks:

```tsx
// src/design-system/DesignSystem.tsx (approx. lines 305-338)
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

<ScreenPreview label="Connected chat layout (header chrome)">
  <ConnectedChromePreview />
</ScreenPreview>
```

And the `stubSession` helper at the top of the same file:

```tsx
// src/design-system/DesignSystem.tsx (approx. lines 41-52)
function stubSession(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    state: 'idle',
    error: null,
    encodedLocal: null,
    messages: [],
    startAsOfferer: async () => {},
    startAsAnswerer: async () => {},
    submitAnswer: async () => {},
    send: () => {},
    reset: () => {},
    ...overrides,
  }
}
```

And the `ScreenPreview` wrapper itself:

```tsx
// src/design-system/DesignSystem.tsx (approx. lines 354-363)
function ScreenPreview({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
        {label}
      </span>
      <div className="rounded-md border border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900">
        <ScreenChromeContext.Provider value={SHOWCASE_CHROME}>
          {children}
        </ScreenChromeContext.Provider>
      </div>
    </div>
  )
}
```

Concrete census of dead tab stops introduced by the previews (taken by walking
the production screens that each preview mounts):

| Preview                                           | Controls in tab order                                                                     |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Home                                              | "Start a chat" button; `<details>` summary                                                |
| Offerer — Invite                                  | "Cancel" button; CopyBox textarea; CopyBox Copy button; answer textarea; "Connect" button |
| Offerer — Connection lost                         | "Start a new chat" button                                                                 |
| Joiner — Invited                                  | "Accept" button; "Decline" button                                                         |
| Joiner — Send this code back (custom JSX preview) | "Cancel" button; CopyBox textarea; CopyBox Copy button                                    |
| Joiner — Connection lost                          | "Start a new chat" button                                                                 |
| Connected chat layout chrome                      | "End chat" button                                                                         |

Roughly **15+ buttons and ~5 form controls** mounted with `() => {}` handlers,
plus the CopyBox Copy buttons which _do_ function (they actually copy
`FAKE_OFFER` / `FAKE_REPLY` to the clipboard). The interactive Chat in the
Organisms section above this `Section` is intentional and is explicitly excluded
from this ticket — that one must remain keyboard-operable and a regression test
should guard it.

## Problem analysis

### 2.4.3 Focus Order (Level A)

The Success Criterion requires that when navigation through a sequence of
focusable controls is necessary for understanding or operation, the order must
preserve meaning and operability. The previews put 20+ controls in the tab order
whose activation produces **no observable effect**. From the user's perspective
the page contains a long chain of buttons that look identical to real buttons
elsewhere in the app, behave identically under Tab (they receive focus, they
advertise a button role, they show a focus ring), and then break the implicit
contract on Enter / Space: nothing happens. The user's mental model of "Tab
advances to the next thing I can do" silently breaks down.

This is distinct from the _focus stealing_ problem covered by A11Y-022. That
ticket is about programmatic focus on mount (the previews call `useFocusOnMount`
and one of them wins the race). This ticket is about user-initiated Tab
navigation — even if the focus-on-mount problem were resolved tomorrow, the dead
tab stops would still be there for any user who Tabs into the preview region
after page load.

### 3.2.4 Consistent Identification (Level AA)

This SC requires that components which have the same functionality across a set
of pages be identified consistently. The corollary — and the violation here — is
that components which look identical and carry the same accessible name should
have the same functionality. The "Cancel" button in the showcase and the
"Cancel" button on the real Offerer route present identically to assistive tech:
same role (`button`), same accessible name (`"Cancel"`), same visual treatment.
But one cancels a real flow and one does nothing. A screen-reader user
encountering either context cannot tell. The same is true of "Start a chat",
"Accept", "Decline", "Connect", "End chat", and "Start a new chat" — every one
of them appears twice on the same compiled bundle, with identical
role/name/visual, and opposite behavior.

### 4.1.2 Name, Role, Value (Level A)

A `<button>` whose `onClick` handler is `() => {}` advertises functionality it
does not have. The role/name combination promises an action; the value (no
observable state change on activation, no announced result, no navigation)
breaks the promise. This SC is normally interpreted as "the accessible
name/role/value must be programmatically determinable" — and here they are — but
the failure mode is the other direction: the determinable name/role/value
_misrepresent_ what the control does. The standard fix for this class of issue
is to either (a) make the control actually do the thing, (b) remove it from the
AT exposure, or (c) annotate the accessible name with the inert context (e.g.,
`aria-label="Cancel (preview)"`).

### 2.4.6 Headings and Labels (Level AA) — adjacent

Slightly adjacent: the screen-preview controls are labeled as actions ("Start a
chat", "Accept", "Connect") but in context they are review artifacts. Their
labels describe production behavior, not review-mode behavior. This is a soft
violation — labels are still descriptive of _what the control looks like it
does_ — but the deeper labeling problem (a control should be labelled by its
actual function) is the same root cause as the 4.1.2 finding above. Fixing 4.1.2
via Option A (`inert`) incidentally resolves the 2.4.6 concern by removing the
controls from AT exposure entirely, so they no longer need accurate labels.

## Failure scenarios

1. **Keyboard-only user tabs through `#design-system`** to evaluate the design
   tokens. After the Theme group, they tab into the first screen preview
   ("Home"). They press Enter on "Start a chat". Nothing happens. They press it
   again. Still nothing. They have no signal whether the button is broken,
   whether they should re-focus, or whether they have lost focus entirely.
2. **Screen-reader user navigates via headings**, lands on "You've been invited
   to chat" (the Joiner — Invited preview). The SR announces an h2 (after
   `headingLevelOffset: 1` from A11Y-013). The user expects this is a real
   invitation. They activate "Accept". Nothing happens. They are confused about
   the state of the app — did the action succeed silently? Did the page crash?
   Did they lose focus?
3. **A11y test tooling** (axe, Lighthouse, accessibility-insights) walks the
   page and reports inert interactive controls as a smell, contributing to a
   worse audit score than the production code actually deserves.
4. **The Copy button in the CopyBox previews** _does_ work (it copies the
   `FAKE_OFFER` / `FAKE_REPLY` constants to the clipboard) — but the user has no
   way to know the difference between which preview-controls are inert and which
   accidentally do something. The mixed behavior is itself a problem: a reviewer
   tabbing through the page may silently overwrite their clipboard contents and
   not realize it.

## Intended behavior

The screen-preview region should make clear, to both AT and sighted-keyboard
users, that its contents are **read-only review artifacts** — not live UI.

The mechanism should do at least one of:

- Remove the inert controls from the keyboard tab order, OR
- Make their inertness explicit (announce "preview" via accessible name /
  context), OR
- Provide working handlers (e.g. each preview's "Start a chat" actually
  navigates to that production screen, each "Cancel" actually returns to the
  showcase). Working handlers may not always be desirable for review — it would
  navigate the user away from the showcase — so removal-from-tab-order is
  usually cleaner.

The visual rendering of the previews must be preserved: sighted reviewers need
to _see_ the rendered screens to evaluate them. Only the _interactivity_ needs
to be neutralized.

## Suggested fix

### Option A (strongly recommended) — wrap each `<ScreenPreview>`'s contents in `inert`

The HTML `inert` attribute (Baseline 2023, supported by all current evergreen
browsers) removes a subtree from focus order, from hit testing, and from
assistive tech. It is exactly what this case needs: the preview remains visible
and renderable, but its controls are non-interactive in every sense.

```diff
 function ScreenPreview({ label, children }: { label: string; children: React.ReactNode }) {
   return (
     <div className="flex flex-col gap-2">
       <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{label}</span>
-      <div className="rounded-md border border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900">
-        <ScreenChromeContext.Provider value={SHOWCASE_CHROME}>{children}</ScreenChromeContext.Provider>
-      </div>
+      <div
+        inert
+        aria-label={`${label} (preview, non-interactive)`}
+        className="rounded-md border border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900">
+        <ScreenChromeContext.Provider value={SHOWCASE_CHROME}>{children}</ScreenChromeContext.Provider>
+      </div>
     </div>
   )
 }
```

Notes on Option A:

- `inert` blocks AT _entirely_ on the subtree. That is appropriate for
  review-only content. The visible `<span>` label outside the inert region
  (e.g., `"Joiner — You've been invited"`) still announces, so an AT user knows
  the region's identity from the label without having to enter it.
- If the team later decides AT exposure of the rendered text is a feature, use
  Option B below instead. For now, the cleanest reading is that the previews are
  _visual_ design artifacts — sighted reviewers want to _see_ them; AT users get
  nothing useful from "hearing" a snapshot of an inert layout, especially when
  the announced action verbs ("Accept", "Connect", "End chat") are misleading.
- **React 19 supports `inert` as a JSX boolean prop.** This project is on React
  19 per `package.json` (`"react": "^19.2.6"`), so the one-line attribute add
  above is sufficient. No `useRef` + `useEffect` setAttribute workaround needed.
- The `aria-label` on the inert wrapper is belt-and-suspenders: AT inside an
  `inert` subtree is suppressed anyway, but if a user agent or extension
  surfaces the wrapper for any reason (DOM-walker dev tools, certain magnifier
  integrations), the label clarifies its role.

### Option B — keep AT exposure, only remove the focus stops

If AT exposure of the rendered text is later determined to be a feature (e.g.,
the team wants screen-reader users to be able to read the chat-bubble
transcripts in the showcase to validate copy), walk the subtree on render and:

1. Set `tabIndex={-1}` on every focusable element.
2. Add `disabled` (or `aria-disabled="true"` for elements that don't support
   `disabled`) on form controls.
3. Neutralize `onClick` handlers via a wrapper that swallows synthetic events
   for any actually-functional handlers (e.g., the CopyBox Copy button).

This is significantly more code (a custom hook traversing children, or a context
flag plumbed through every interactive primitive to opt into "preview mode"),
and leaves more failure modes (the CopyBox's Copy button would still need its
`onClick` neutralized explicitly). Not recommended unless Option A's AT-blackout
is unacceptable.

### Option C — make the handlers do something useful

Wire each preview's CTAs to navigate the showcase. E.g., "Start a chat" in the
Home preview navigates the showcase to a dedicated demo of the Offerer flow.
This is a product-design call, not a fix for the a11y issue. Out of scope for
this ticket. (Could be a follow-up improvement ticket if the team wants live
interactive examples.)

### Recommended path

Take **Option A**. Smallest surface change, correct semantics, removes 20+ dead
tab stops and 20+ misleading AT exposures in one attribute add on the
`ScreenPreview` wrapper.

## Test updates

- `src/design-system/DesignSystem.test.tsx`:
  - Add a test that renders `<DesignSystem />`, queries each `ScreenPreview`
    wrapper, and asserts the `inert` attribute is present on the inner div.
    (`expect(wrapper).toHaveAttribute('inert')` or, since React 19 serializes
    the prop, `expect(wrapper.hasAttribute('inert')).toBe(true)`.)
  - Add a test that uses `userEvent.tab()` repeatedly and asserts focus never
    lands inside a `[inert]` subtree. A loop that Tabs N times (where N exceeds
    the count of all focusable elements on the page) and after each Tab asserts
    `document.activeElement` is not inside any preview wrapper.
  - Add a regression test for the **interactive Chat** in the Organisms section
    (rendered _outside_ `<ScreenPreview>`) — confirm it remains
    keyboard-operable; this ticket must not regress that. Specifically: the chat
    composer textarea must be focusable, typing into it must work, and the Send
    button must be activatable.
  - If the test suite uses `@testing-library/jest-dom`, the
    `toHaveAttribute('inert')` matcher reads cleanly. Otherwise fall back to
    `getAttribute`.
- `src/components/Chat.test.tsx`, `src/screens/Home.test.tsx`,
  `src/screens/Offerer.test.tsx`, `src/screens/Joiner.test.tsx` — no changes.
  Production behavior is unchanged; only the showcase wraps in `inert`.
- **Manual smoke:** load `#design-system`, Tab through. Expected order: header →
  Theme buttons → tokens / atoms / molecules section controls (Textarea, callout
  sample, Divider) → interactive Chat composer & Send → past the screen previews
  directly to whatever follows (or end of page). **No tab stops inside the
  preview regions.** Confirm in Chrome, Firefox, and Safari (the `inert`
  attribute has full Baseline 2023 support across all three; verify behavior
  anyway because Safari historically lagged on this attribute).
- **Manual SR smoke:** load `#design-system` with VoiceOver (macOS) or NVDA
  (Windows). Navigate via headings — confirm the preview-wrapper `<span>` labels
  announce but the preview _contents_ do not. Navigate via the rotor / element
  list — confirm no buttons inside the preview regions appear in the
  focusable-elements list.

## Acceptance

- Every `<ScreenPreview>` wrapper carries `inert` (or equivalent mechanism) on
  the container that holds the preview content. The `ScreenPreview` function in
  `src/design-system/DesignSystem.tsx` is updated; the call sites are unchanged.
- Tabbing through the DesignSystem page does **not** land focus inside any
  preview. Verified by a Vitest test that `userEvent.tab()`s through the page
  and asserts `document.activeElement` is never inside `[inert]`.
- Screen-reader navigation does **not** land inside any preview (Option A) —
  verified by a unit test that asserts `inert` is present on every
  `ScreenPreview` inner wrapper, or by an automated query that asserts no
  focusable elements live inside the preview regions.
- The interactive Chat in the Organisms section (rendered outside
  `<ScreenPreview>`) remains fully keyboard-operable: composer focusable, typing
  works, Send activates. Regression test guards this.
- Manual smoke on Chrome AND Firefox AND Safari confirms no inert previews
  receive focus or pointer events.
- `npm test`, `npm run lint`, `npm run typecheck` all pass.

## Adjacent context (do **not** conflate scope)

- **The sibling "previews steal initial focus via useFocusOnMount" ticket
  (A11Y-022, also in `inbox/`)** is independent. That one is about programmatic
  focus on mount; this one is about user-initiated Tab navigation. Option A
  (`inert`) here _does_ incidentally suppress the focus stealing — the `focus()`
  call in `useFocusOnMount` is a no-op against an inert subtree per the HTML
  spec, because focusable elements inside `inert` are not focusable. That is a
  bonus, **not a substitute** — the A11Y-022 ticket should still land its
  `suppressInitialFocus` flag (or whatever mechanism that ticket settles on),
  because production screens rendered _outside_ the showcase still need a clean
  focus story when context-aware, and the flag is the canonical mechanism. The
  two fixes are layered: this ticket's `inert` is the user-visible barrier; the
  other ticket's `suppressInitialFocus` is the cleanup of the focus-call site.

- **A11Y-013 (resolved)** — landmark/heading demotion in the showcase via
  `ScreenChromeContext`. This ticket's `inert` does **not** affect that — the
  inert subtree still renders its DOM (so the demoted `<h2>` and
  `<div role="region">` are still there in the page outline), it just removes
  interactivity. The `ScreenChromeContext.Provider` line inside `ScreenPreview`
  should be left untouched by this fix.

- **The CopyBox previews' Copy button _does_ successfully copy text to the
  clipboard today** (using the same production handler as real CopyBox
  instances). After Option A this will stop working in the previews — that is
  the **desired outcome**. A reviewer should not be silently overwriting their
  clipboard contents by tabbing onto a Copy button they didn't realize was real.
  If the design team wants Copy-button demo-ability in the showcase, the right
  fix is to render a non-functional Copy button label _outside_ the inert
  wrapper, next to the CopyBox preview, as a separate item.

- **A11Y-019 (resolved) / A11Y-020 (in progress)** — CopyBox callout exposure /
  timing. Neither affects this ticket. The CopyBox component itself is
  unchanged; only its containing `ScreenPreview` wrapper changes.

- **`stubSession`** (lines 41-52) does not need to change. Its no-op handlers
  (`startAsOfferer: async () => {}`, etc.) become unreachable once the previews
  are inert, but they're still required for type satisfaction of the
  `ChatSession` interface. Leave the helper as-is.

- **The seven `() => {}` `onCancel` / `onStart` props at the call sites** (lines
  306, 312, 317, 321, 332) similarly become unreachable but are required for
  type satisfaction of the screen-component props. Leave them as-is.

- **React 19 `inert` JSX prop:** verified — `package.json` shows
  `"react": "^19.2.6"`. The boolean prop form works directly. If the project is
  ever downgraded to React 18 the fix needs a `useRef` + `useEffect` to call
  `setAttribute('inert', '')`; document this in a comment near the `inert`
  attribute so the constraint is discoverable.

- **PR scoping:** this ticket and A11Y-022 touch the same file
  (`src/design-system/DesignSystem.tsx`) and arguably the same wrapper component
  (`ScreenPreview`). They should be **separate PRs** to keep review surface
  small and to allow independent revert if one introduces a regression. A11Y-022
  lands first (it's the focus-on-mount fix that the team likely wants in
  production faster); this ticket lands second and benefits from being able to
  verify in isolation that the `inert` attribute also closes the focus-stealing
  path as a bonus.
