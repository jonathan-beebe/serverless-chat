---
name: work-write
description:
  Write a ticket file from an already-scoped problem. Takes a type and a scope
  packet (produced by `/work-scope`), allocates an id, and writes the ticket to
  `work/1-inbox/`. This skill is the formatter — it does no discovery and no
  dialogue. If your scope is rough, run `/work-scope` first.
argument-hint: <type> <scope packet>
---

Write a ticket from a scope packet:

$ARGUMENTS

## Expected arguments

`<type> <scope packet>`

- **type** — one of: research, design, architecture, feature, improvement,
  maintenance, a11y, refactor, bug.
- **scope packet** — the labeled markdown blob produced by `/work-scope` (see
  "Scope packet shape" below).

If `$ARGUMENTS` is empty, or the type is unrecognized, or the packet is missing
required fields, **stop and redirect to `/work-scope`**. This skill does not
guess, dialogue, or fill in blanks — the scoping work belongs in `/work-scope`
so the human is in the loop while it happens.

## Type registry

| type         | prefix |
| ------------ | ------ |
| research     | RSRCH  |
| design       | DSGN   |
| architecture | ARCH   |
| feature      | FEAT   |
| improvement  | IMPRV  |
| maintenance  | MAINT  |
| a11y         | A11Y   |
| refactor     | RFCTR  |
| bug          | BUG    |

## Scope packet shape

The packet `/work-scope` produces (and that this skill accepts as input):

```
PROBLEM: <factual statement — what is broken / missing / unclear, and where>
OUTCOME: <observable, verifiable end state — the user or system reaches X>
WHY IT MATTERS: <user impact, constraint violated, downstream effect>
RELATED WORK: <list of TICKET-### and/or commit SHAs, or "none">
DISCOVERY NOTES (optional): <advisory diagnostic notes from the reporter>
RECOMMENDATION (optional, type-gated): <how to address the problem — anything from a one-line direction to sample code; only permitted when the type's policy allows it (see Recommendation policy)>
ONE-LINE SUMMARY: <short phrase — used for filename slug and journal entry>
```

`PROBLEM`, `OUTCOME`, `WHY IT MATTERS`, `RELATED WORK`, and `ONE-LINE SUMMARY`
are required. `DISCOVERY NOTES` is optional for every type. `RECOMMENDATION` is
optional for types where the policy allows it, and forbidden otherwise.

## Recommendation policy by type

| type         | RECOMMENDATION allowed? |
| ------------ | ----------------------- |
| bug          | yes                     |
| a11y         | yes                     |
| maintenance  | yes                     |
| improvement  | yes                     |
| feature      | no                      |
| refactor     | no                      |
| design       | no                      |
| architecture | no                      |
| research     | no                      |

For types in the "no" column, a packet that includes `RECOMMENDATION` is
rejected — the maker decides shape, and pre-committing forecloses on options.
Rationale and dialogue guidance live in `/work-scope`'s "Recommendation policy
by type" section.

## Validation contract — what this skill enforces on the packet

A packet that violates any of the rules below is rejected with a one-line reason
and a pointer back to `/work-scope`:

- `PROBLEM` is factual and grounded (file paths / line numbers when applicable).
  Not vague ("fix the menu thing").
- `OUTCOME` is phrased as an observable state ("the user can dismiss the dialog
  with Escape", "the table has an accessible name"), not as a code change ("add
  an `aria-label`", "wrap in `<dialog>`"). Mechanism — even when obvious —
  belongs in `RECOMMENDATION` (when the type allows) or in `/work-start`, not in
  `OUTCOME`.
- `RECOMMENDATION` is present **only if** the type allows it (see policy above).
  If present for a forbidden type, reject. If present for an allowed type,
  accept any shape — prose, mechanism choice, code snippet, references.
- The only places implementation detail (suggested fix, code snippets, library
  or API choices, sequenced steps) may appear are `RECOMMENDATION` (for allowed
  types) and `DISCOVERY NOTES` (advisory, all types). They may not bleed into
  `PROBLEM`, `OUTCOME`, or `WHY IT MATTERS`.
- If diagnostic work appears, it is under `DISCOVERY NOTES` and reads as
  advisory (not a directive). `DISCOVERY NOTES` is causal ("here's what I
  learned"); `RECOMMENDATION` is directional ("here's what to do").

These rules exist because solutioning at definition time freezes assumptions
that may be stale by the time work begins, and crowds out the problem statement
so the implementer skims past it. The type-gated `RECOMMENDATION` field is the
controlled exception: it preserves directional signal where the work type's
remediation shape is well-precedented.

## Workflow

1. **Parse args** into `<type>` and `<packet>`. Reject unknown types.
2. **Validate the packet** against the contract above. On any failure, stop and
   tell the human exactly which rule failed and to re-run `/work-scope`.
3. **Allocate id.** Read `work/journal.md` → `Next ticket numbers > <PREFIX>:`
   for the next number. Allocated id is `<PREFIX>-<NNN>`.
4. **Write the ticket** to `work/1-inbox/<PREFIX>-<NNN>-<slug>.md`, where
   `<slug>` is derived from `ONE-LINE SUMMARY` (lowercase, kebab-case,
   alphanumerics + hyphens, ≤ 60 chars).

   Frontmatter at minimum:

   ```
   ---
   id: <PREFIX>-<NNN>
   type: <type>
   status: open
   created: <YYYY-MM-DD>
   ---
   ```

   Body in this exact section order:

   ```
   # <PREFIX>-<NNN>: <ONE-LINE SUMMARY>

   ## Problem
   <PROBLEM>

   ## Outcome
   <OUTCOME>

   ## Why it matters
   <WHY IT MATTERS>

   ## Discovery notes
   <DISCOVERY NOTES — advisory; /work-start may use or discard>
   (omit this section entirely if the packet had no DISCOVERY NOTES)

   ## Recommendation
   <RECOMMENDATION — directional; the maker may follow it or pick a better path>
   (omit this section entirely if the packet had no RECOMMENDATION, or if the type's policy forbids it — in the latter case the packet should have been rejected at validation)

   ## Related work
   <RELATED WORK — bullet list of links>
   (omit this section entirely if RELATED WORK is "none")
   ```

   Do not add sections beyond these. Do not synthesize content the packet didn't
   provide.

5. **Log it.** Invoke `/work-log` with
   `<PREFIX>-<NNN> — defined: <ONE-LINE SUMMARY>`. The `/work-log` skill bumps
   the per-type counter.
