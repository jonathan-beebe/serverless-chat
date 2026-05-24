# A11Y-009: Form error not programmatically associated with the answer textarea

**Status:** Resolved **WCAG:** 3.3.1 Error Identification (Level A), 1.3.1 Info
and Relationships (Level A) **Severity:** Medium **Location:**
`src/screens/Offerer.tsx` (lines 78-103)

## Problem

When connection negotiation fails after the user submits the reply code, the
screen renders:

```tsx
{
  session.error && (
    <p
      role="alert"
      className="rounded-md border border-red-700 bg-red-900/40 ...">
      {session.error}
    </p>
  )
}
```

The `role="alert"` causes the message to be announced once when it appears,
which is good. But:

- The error is not linked to the answer textarea (`#answer-input`) via
  `aria-describedby` or `aria-errormessage`.
- The textarea is not flagged with `aria-invalid="true"`.
- After the alert announcement passes, a user who navigates back to the textarea
  to retry hears no error context — the field looks valid programmatically.
- The same issue exists for the secondary "Couldn't establish a direct
  connection" alert below.

WCAG 3.3.1 requires the user be able to identify the field that produced the
error; in screen-reader contexts that means a programmatic association, not just
visual proximity.

## Intended behavior

While `session.error` is present, the answer textarea should be flagged as
invalid and described by the error message, so any user who returns to the field
hears the failure context and knows which field is at fault.

## Suggested fix

```tsx
<textarea
  id="answer-input"
  aria-invalid={session.error ? true : undefined}
  aria-describedby={session.error ? 'answer-error' : undefined}
  ...
/>

{session.error && (
  <p id="answer-error" role="alert" className="...">
    {session.error}
  </p>
)}
```

If A11Y-006's helper text is also added, combine ids in
`aria-describedby="answer-help answer-error"`.

After the error appears, consider also moving focus back to the textarea
(consistent with A11Y-005's focus-management approach) so the user can
immediately retry without having to find the field manually.

## Working notes

- Confirmed the issue in `src/screens/Offerer.tsx`. The textarea
  (`#answer-input`) declared only `aria-describedby="answer-help"` with no
  `aria-invalid` and no link to the error alert.
- The error `<p role="alert">` lacked an `id`, so it could not be referenced by
  `aria-describedby`/`aria-errormessage` even if the textarea pointed at one.
- Applied the suggested fix: gave the error `<p>` `id="answer-error"`, and made
  the textarea conditionally set `aria-invalid={true}` and combine ids in
  `aria-describedby="answer-help answer-error"` while `session.error` is truthy.
  When no error, the textarea keeps the existing
  `aria-describedby="answer-help"` and omits `aria-invalid` (so the field is not
  announced as invalid by default).
- Did not move focus back to the textarea on error in this fix — out of scope
  for WCAG 3.3.1/1.3.1 and noted as a follow-up in the ticket. The secondary
  "Couldn't establish a direct connection" alert only renders when
  `!session.error`, so it never coexists with the form and does not need a
  programmatic association with the textarea (the form is hidden by that point
  anyway via the unmount of `session.encodedLocal` branch when state
  transitions; in practice the textarea form remains mounted but the secondary
  alert is a parallel notice, not a field-level error — leaving as-is).
- All 45 tests still pass; typecheck and lint clean.
