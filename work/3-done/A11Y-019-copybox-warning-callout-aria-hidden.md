# A11Y-019: CopyBox warning callout marked `aria-hidden="true"` hides actionable instruction from assistive tech

**Status:** Resolved **WCAG:**

- 1.3.1 Info and Relationships — Level A
- 3.3.2 Labels or Instructions — Level A
- 4.1.2 Name, Role, Value — Level A

**Severity:** High — when the fallback fires, screen-reader users cannot
complete the copy workflow by normal navigation. The instruction is _visible_ in
the DOM and visually unmistakable, but `aria-hidden="true"` removes it from the
accessibility tree, so AT users have no durable way to discover it. They are
dependent on a single live-region announcement firing at the right moment.

**Location:** `src/components/CopyBox.tsx` lines 92-96

```tsx
{
  needsManualCopy && (
    <Callout
      variant="warning"
      aria-hidden="true"
      className="text-xs font-medium">
      Press Ctrl+C / Cmd+C to copy
    </Callout>
  )
}
```

The live-region sibling that carries the parallel announcement is at lines
97-104:

```tsx
{
  /* Status message announced to AT without disturbing the button's name or focus. */
}
;<LiveRegion>
  {copied
    ? `${label} copied to clipboard`
    : needsManualCopy
      ? `${label} selected. Press Control C or Command C to copy.`
      : ''}
</LiveRegion>
```

The companion success callout at lines 79-83 is intentionally **out of scope**
for this ticket — see "Scope: the success callout stays as-is" below.

**Related (resolved) tickets — read first:**

- `__local__/work/accessibility/resolved/A11Y-006-placeholder-as-instruction.md`
  — established the project principle that an **actionable instruction** must be
  a _persistent, programmatically-associated_ part of the accessibility tree,
  not a transient surface. That ticket fixed the same anti-pattern by adding a
  visible `<p id="answer-help">` and wiring it via `aria-describedby`. The fix
  here is the symmetric move: stop hiding a persistent actionable instruction
  from AT.
- `__local__/work/accessibility/resolved/A11Y-008-aria-live-on-copy-button.md` —
  established the project rule that a live region belongs on a dedicated,
  persistent, sibling status node, not on the element that produces the change.
  The `LiveRegion` on lines 98-104 follows that rule correctly. This ticket does
  **not** touch that pattern; it adds a durable visual instruction _alongside_
  the live region.
- `__local__/work/accessibility/resolved/A11Y-001-copybox-invalid-html-ids.md` —
  the same component (`CopyBox`) was already fixed once for the `useId()` /
  `useRef` issue. `textareaId` (line 20) and `textareaRef` (line 21) are already
  in scope and reusable if the fix takes the `aria-describedby` route (see
  Suggested fix option C).

## Problem

The component handles three clipboard-write outcomes (lines 29-60):

1. **Success via `navigator.clipboard.writeText`** (lines 30-38) — primary
   modern path.
2. **Success via `document.execCommand('copy')`** after selecting the textarea
   (lines 40-54) — legacy fallback for environments where `writeText` is
   blocked.
3. **Both paths fail** (lines 56-60) — the textarea is already selected, but the
   user must press Ctrl+C / Cmd+C themselves to complete the copy. This is the
   path that sets `needsManualCopy = true`.

Path 3 is not theoretical — the inline comments on lines 36-37 and 89-91
enumerate real triggers: `http:` origins, sandboxed iframes (e.g. Teams Web),
and denied clipboard permissions. In any of these contexts the only way for the
user to complete the workflow is to read the instruction and press the
keystroke. **This is actionable, recovery-critical content.**

The current implementation renders that instruction in two places:

- **A visible `<Callout variant="warning">`** at lines 92-96 — but it is marked
  `aria-hidden="true"`, which removes it from the accessibility tree. Screen
  readers do not expose it; users cannot navigate to it with Tab, browse mode,
  or a virtual cursor; it does not appear in any reading order or rotor listing.
  It is a _visual-only_ affordance.

- **A `<LiveRegion>` (sr-only `role="status" aria-live="polite"`)** at lines
  98-104 — fires _one_ announcement at the moment `needsManualCopy` flips from
  `false` to `true`. After that moment, the live region is empty content again
  (the ternary returns `''` on the third branch).

A live-region announcement is an _attention-getter_, not a _durable surface_. A
WCAG-conformant pattern uses it to _alert_ the user to a change, not to _carry_
the only AT-accessible copy of an actionable instruction. The current
implementation does the latter, and as a result several realistic situations
leave a screen-reader user unable to recover the instruction:

1. **The announcement is preempted.** If another polite live region (e.g., the
   A11Y-012 connection-state `LiveRegion` on the same screen) updates within the
   same announcement window, the SR may drop or truncate one of them. JAWS in
   particular batches polite announcements aggressively.
2. **The user has verbosity tuned down.** Many screen-reader users routinely
   lower verbosity to reduce announcement chatter; polite live regions are often
   the first thing throttled.
3. **The user was mid-utterance.** If the SR was reading other content when
   `needsManualCopy` flipped, the announcement is queued behind that utterance
   and may be dropped if the user interrupts (e.g., presses Ctrl to stop speech)
   before it speaks.
4. **The user returns to the page.** Switching tabs, returning from a screen
   lock, or refocusing the window does not re-fire the live region. The
   component is in the `needsManualCopy === true` state, the visible UI says
   "Press Ctrl+C / Cmd+C to copy", but the AT tree is silent. The user sees no
   path forward.
5. **The user navigates back over the region.** Browse mode / virtual-cursor
   users routinely re-read sections. The visible instruction sits in the DOM but
   is invisible to the cursor. There is no way to re-discover it.

In all five scenarios the failure mode is the same: the workflow becomes
uncompletable for an AT user, even though the visible UI clearly shows how to
complete it.

### Why this is the same anti-pattern A11Y-006 fixed (and not A11Y-008)

A11Y-006 resolved a similar bug on the Offerer answer-input: an actionable
instruction was held in a _transient_ surface (the placeholder, which disappears
on first keystroke). The fix moved the instruction into a **persistent,
programmatically-associated** node (`<p id="answer-help">` +
`aria-describedby`). The principle that fix established: _actionable
instructions must be durable in the accessibility tree._

This ticket is the same shape. The instruction is held in a transient AT surface
(a one-shot live region) while a persistent visible copy exists in the DOM but
is `aria-hidden`. The fix is symmetric: make the persistent visible copy
AT-visible.

A11Y-008 is distinct — that was about _where_ live regions live (sibling, not on
the interactive element). The live region in `CopyBox` already follows A11Y-008
correctly and should not change. This ticket is about the **static
instruction**, not the live region.

### Scope: the success callout stays as-is

The companion `<Callout variant="success" aria-hidden="true">Copied!</Callout>`
on lines 79-83 also carries `aria-hidden="true"` and also has a live-region
partner ("`${label} copied to clipboard`"). It looks like the same anti-pattern,
but it is materially different and should **not** be changed in this ticket:

- "Copied!" is a _confirmation_, not an _instruction_. No further recoverable
  action depends on it. Seeing "Copied!" again later confers no additional
  capability to the user.
- The live region carries the equivalent message and that single announcement is
  sufficient for the confirmation use case (the same way a transient toast is
  sufficient).
- A separate task already tracks the auto-dismiss timing of the success callout
  (the 1500ms `setTimeout` on line 26). Don't conflate scopes — this ticket
  changes only the warning callout.

So: the warning callout (lines 92-96) is the only thing this ticket touches.

## Intended behavior

A screen-reader user who reaches the `needsManualCopy === true` state should be
able to:

1. **Hear the initial alert** via the live region (current behavior — keep it).
2. **Discover the instruction text afterwards** by ordinary navigation — Tab
   moves them past the Callout, browse mode / virtual cursor lands on it, the
   rotor lists it. The instruction is part of the accessibility tree as long as
   `needsManualCopy` is true.
3. **Re-read the instruction** at any point while it is visible. If they switch
   tabs and return, or interrupt speech, or scroll away and back, the
   instruction is still there in the AT tree.
4. **(Optionally) Have the instruction tied to the textarea's accessible
   description** so it is announced as part of the textarea on focus, since the
   textarea is the control the instruction is about.

## Suggested fix

Three concrete options, in increasing order of integration. Option A is the
minimum change and resolves the WCAG violation; Option C is the most
semantically correct and is recommended.

### Option A — Drop `aria-hidden="true"` from the warning Callout (minimum change)

```diff
  {needsManualCopy && (
-   <Callout variant="warning" aria-hidden="true" className="text-xs font-medium">
+   <Callout variant="warning" className="text-xs font-medium">
      Press Ctrl+C / Cmd+C to copy
    </Callout>
  )}
```

Pros:

- One-line change. No DOM restructuring. No risk to surrounding layout / focus
  order.
- The instruction is now a durable part of the accessibility tree exactly as
  long as `needsManualCopy` is true.

Cons:

- Some AT may now read both the live-region announcement _and_ the static
  Callout when the state flips (the live-region fires once, then a browse-mode
  user navigating into the region reads it again). This is acceptable —
  duplication of an _important recovery instruction_ is generally preferred over
  loss — but Option B addresses it directly.

### Option B — Option A + slim the LiveRegion message to an attention-getter

If duplicate utterance feels noisy, change the live-region text for the
`needsManualCopy` branch to a short cue and let the Callout carry the full
instruction:

```diff
  <LiveRegion>
    {copied
      ? `${label} copied to clipboard`
      : needsManualCopy
-       ? `${label} selected. Press Control C or Command C to copy.`
+       ? `Copy failed. ${label} is selected — see instructions below.`
        : ''}
  </LiveRegion>
```

This keeps the live region acting as an _attention-getter_ ("something happened,
look here") and the static Callout acting as the _content_ ("here is what to
do"). It matches the project rule that live regions alert and static text
instructs.

The wording above is illustrative — the implementer can tune it. The constraint
is: the live region should _direct attention_ to the Callout, not duplicate the
full keystroke instruction.

### Option C — Option A + wire the Callout via `aria-describedby` on the Textarea (recommended)

The instruction is _about the textarea_ — it tells the user what keystroke to
send to that control. Tying it to the textarea's accessible description makes
the relationship explicit and means SRs will announce the instruction on
textarea focus, which is the most useful moment:

```tsx
const calloutId = `${textareaId}-manual-copy`

return (
  <div className="flex flex-col gap-2">
    <label htmlFor={textareaId} ...>{label}</label>
    <Textarea
      id={textareaId}
      ref={textareaRef}
      readOnly
      value={value}
      rows={variant === 'url' ? 2 : 6}
      className="resize-none font-mono text-xs"
      onFocus={(e) => e.currentTarget.select()}
      aria-describedby={needsManualCopy ? calloutId : undefined}
    />
    {/* ...action row unchanged... */}
    {needsManualCopy && (
      <Callout id={calloutId} variant="warning" className="text-xs font-medium">
        Press Ctrl+C / Cmd+C to copy
      </Callout>
    )}
    <LiveRegion>{/* ...kept as-is or slimmed per Option B... */}</LiveRegion>
  </div>
)
```

Pros:

- The instruction is announced on textarea focus, which is the moment it is most
  actionable (the textarea is already `select()`-ed at that point, so the
  keystroke immediately works).
- The Callout is exposed by ordinary navigation _and_ tied to the control it
  concerns.
- `textareaId` is already available (line 20) — no new IDs to invent. The
  Callout component needs to forward an `id` prop; check its current API and add
  one if absent.
- `aria-describedby` is conditional — when `needsManualCopy` is false, no
  dangling reference exists and no description is announced. The same pattern
  A11Y-009 used for `aria-describedby="answer-help answer-error"`.

Cons:

- Requires confirming `<Callout>` forwards `id` (and adding it if not). The
  `Callout` component lives in `src/components/Callout.tsx`; this is a small
  interface change at most.

### Recommended path

Take Option C if the `<Callout>` already forwards `id` (or the change is
trivial), and pair it with Option B's slimmer live-region message. The combined
effect: AT users hear a short "copy failed, see instructions" alert immediately;
the instruction itself is announced on textarea focus and discoverable by normal
navigation; sighted users see the unchanged visible Callout.

If `<Callout>` is awkward to extend right now, Option A alone is sufficient to
close the WCAG violation. Don't ship a no-op fix — at minimum the
`aria-hidden="true"` on lines 92-96 must go.

## Test updates

`src/components/CopyBox.test.tsx` (or wherever CopyBox is tested) will need:

- A new test that, in the `needsManualCopy === true` state, the warning Callout
  is **queryable** by accessible text
  (`screen.getByText(/Press Ctrl\+C \/ Cmd\+C to copy/)` should resolve, and the
  resolved node should not have `aria-hidden="true"`). The negative assertion is
  the important one — that's the regression guard.
- If Option C is taken, a test that the Textarea's `aria-describedby` includes
  the Callout's id when (and only when) `needsManualCopy` is true.
- If Option B is taken, the existing live-region assertion (if any) needs to be
  updated to the new message text.
- The success-callout behavior (lines 79-83) must remain unchanged — if there is
  an existing test asserting `aria-hidden="true"` on the "Copied!" callout,
  leave it as-is. This ticket explicitly does not touch that path.

## Acceptance

- `src/components/CopyBox.tsx` no longer renders the manual-copy warning Callout
  with `aria-hidden="true"`. Lines 92-96 produce an AT-visible element.
- A screen-reader user in the `needsManualCopy === true` state can discover the
  "Press Ctrl+C / Cmd+C to copy" text by ordinary navigation (Tab past the
  Callout, browse mode / virtual cursor, rotor listing). Verified manually with
  at minimum NVDA + Firefox and VoiceOver + Safari.
- The single live-region announcement that fires when `needsManualCopy` flips to
  true continues to fire. If Option B is taken, its text is the slimmer
  attention-getter; otherwise the original message stays.
- The success path is unchanged:
  - The `<Callout variant="success" aria-hidden="true">Copied!</Callout>` on
    lines 79-83 retains `aria-hidden="true"`.
  - The `${label} copied to clipboard` live-region announcement remains.
  - Any auto-dismiss behavior is out of scope for this ticket.
- No regression in the rest of the component: the `useId()`-derived `textareaId`
  (A11Y-001) is unaffected; the live region's status-not-on-interactive-element
  pattern (A11Y-008) is preserved; the legacy-fallback `execCommand('copy')`
  path is unchanged.
- `npm test`, `npm run lint`, `npm run typecheck` clean.

## Working notes

- Confirmed the issue still exists at `src/components/CopyBox.tsx` lines 92-96:
  the warning Callout that surfaces in the `needsManualCopy === true` branch was
  rendered with `aria-hidden="true"`, removing the actionable "Press Ctrl+C /
  Cmd+C to copy" instruction from the accessibility tree.
- Verified `Callout` (`src/components/Callout.tsx`) already extends
  `HTMLAttributes<HTMLParagraphElement>` and spreads `...rest` onto the `<p>`,
  so it forwards an `id` prop natively — no component-API change needed to take
  Option C.
- Took Option C + Option B (the ticket's recommended path):
  - Dropped `aria-hidden="true"` from the manual-copy `<Callout>` so it becomes
    a durable part of the AT tree exactly as long as `needsManualCopy` is true.
  - Added a stable `manualCopyHintId = ${textareaId}-manual-copy` (reusing the
    existing `useId()` value from A11Y-001 — no new IDs invented).
  - Wired the Textarea with
    `aria-describedby={needsManualCopy ? manualCopyHintId : undefined}` so SRs
    announce the instruction on textarea focus, which is the moment it is most
    actionable (the textarea is already `select()`-ed by the legacy path, so the
    keystroke immediately works). The conditional form means no dangling
    reference exists in the success / idle states (same pattern A11Y-009 used).
  - Slimmed the `LiveRegion` text on the `needsManualCopy` branch from the full
    keystroke instruction to a short attention-getter
    (`Copy failed. ${label} is selected — see instructions below.`) so the live
    region directs attention to the Callout instead of duplicating it.
- Kept the success path untouched per scope:
  - The `<Callout variant="success" aria-hidden="true">Copied!</Callout>`
    retains `aria-hidden="true"` (confirmed by a new test guarding against
    future drift).
  - The `${label} copied to clipboard` live-region announcement is unchanged.
  - A11Y-020 still tracks the auto-dismiss timing.
- Test updates in `src/components/CopyBox.test.tsx`:
  - Added `exposes the manual-copy hint to assistive tech (A11Y-019…)` — asserts
    the hint resolves by accessible text, does NOT carry `aria-hidden="true"`,
    and that the textarea's `aria-describedby` resolves to the hint's `id`. Also
    asserts no dangling describedby in the idle state.
  - Added
    `keeps the success "Copied!" callout aria-hidden (out of scope for A11Y-019…)`
    — regression guard so the in-scope fix doesn't accidentally drag the
    out-of-scope confirmation callout along with it.
  - The existing
    `surfaces a manual-copy hint and selects the text when both clipboard paths fail`
    test still passes unchanged (it queries by the visible `Ctrl+C` text, which
    works either way).
- `npm test` → 132 passing (3 → 5 in CopyBox.test.tsx, +2 net). `npm run lint`
  and `npm run typecheck` clean.

## Files changed

- `src/components/CopyBox.tsx` — removed `aria-hidden="true"` from the warning
  Callout, added `id={manualCopyHintId}` on it, wired the Textarea with
  conditional `aria-describedby`, and slimmed the manual-copy live-region
  message to an attention-getter.
- `src/components/CopyBox.test.tsx` — added regression guards for the WCAG fix
  and for the out-of-scope success-callout behavior.
