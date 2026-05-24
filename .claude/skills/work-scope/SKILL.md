---
name: work-scope
description:
  Scope a piece of work in dialogue with the human. Surveys prior work,
  understands the affected code, and refines the problem and outcome until both
  are crisp. Produces a scope packet and — on approval — hands off to
  `/work-write` to file the ticket. This skill owns the subjective,
  collaborative half of defining work; `/work-write` owns the deterministic
  file-writing half.
argument-hint: <type> <rough description>
---

Scope a piece of work:

$ARGUMENTS

## Expected arguments

`<type> <rough description>`

- **type** — one of: research, design, architecture, feature, improvement,
  maintenance, a11y, refactor, bug.
- **rough description** — free-form. A symptom, a hunch, a quote from a user, a
  code smell — anything that points at the problem. This skill's job is to turn
  it into something writeable.

If `$ARGUMENTS` is empty, ask the user for both. If the type is unrecognized,
list the valid types and ask again — do NOT guess.

## What "scoped" means

A scope is **what the problem is** and **what success looks like** — nothing
more. The fix is `/work-start`'s job, done with fresh eyes against the code as
it stands when the ticket is picked up. Solutioning here freezes assumptions
that may be stale by then, and crowds out the problem statement so the
implementer skims past it.

The dialogue is done when you can produce, with the human's agreement, this
packet:

```
PROBLEM: <factual statement — what is broken / missing / unclear, and where>
OUTCOME: <observable, verifiable end state — the user or system reaches X>
WHY IT MATTERS: <user impact, constraint violated, downstream effect>
RELATED WORK: <list of TICKET-### and/or commit SHAs, or "none">
DISCOVERY NOTES (optional): <advisory diagnostic notes from the reporter>
RECOMMENDATION (optional, type-gated): <how to address the problem — anything from a one-line direction to sample code; only included when the type's policy allows it (see Recommendation policy below)>
ONE-LINE SUMMARY: <short phrase — used for filename slug and journal entry>
```

### Rules the dialogue must honor

- `PROBLEM` is factual and grounded (file paths / line numbers when applicable).
  Push back on vague phrasings ("fix the menu thing").
- `OUTCOME` is phrased as an observable state ("the user can dismiss the dialog
  with Escape", "the table has an accessible name"), **not** as a code change
  ("add an `aria-label`", "wrap in `<dialog>`"). The mechanism — even when
  obvious — belongs in `RECOMMENDATION` (when the type allows it) or in
  `/work-start`, not in `OUTCOME`.
- `RECOMMENDATION` is **type-gated** (see Recommendation policy below). For
  types where it's allowed, the recommendation can be anything from a one-line
  direction ("just make it a link") to sample code — whatever level of detail
  the human and the dialogue land on. For types where it's forbidden, push back
  on any solutioning attempt: the maker decides shape, not the reporter. If the
  human is mid-recommendation when the type forbids it, route the observable
  part to `OUTCOME` and the causal part to `DISCOVERY NOTES`.
- If the human has done diagnostic work worth preserving (a likely root cause, a
  reproduction recipe, a constraint they uncovered), put it under
  `DISCOVERY NOTES` and mark it advisory — not a directive. `/work-start` may
  use it or discard it. `DISCOVERY NOTES` and `RECOMMENDATION` are distinct:
  notes describe what _is_ (causal), recommendation describes what to _do_
  (directional). When in doubt, prefer `DISCOVERY NOTES`.

### Recommendation policy by type

Some work types have a well-precedented remediation shape (bug, a11y) where the
recommendation is genuine signal. Others are open-ended creative work (feature,
design) where prescribing a fix at definition time forecloses on options the
maker would otherwise see.

| type         | RECOMMENDATION allowed? | rationale                                                          |
| ------------ | ----------------------- | ------------------------------------------------------------------ |
| bug          | yes                     | Fix is usually mechanical once root cause is known.                |
| a11y         | yes                     | WCAG often dictates a specific remediation pattern.                |
| maintenance  | yes                     | Usually a clear, well-precedented change.                          |
| improvement  | yes                     | Often has a clear nudge; recommendation can stay loose.            |
| feature      | no                      | Maker decides shape; pre-committing forecloses on options.         |
| refactor     | no                      | The refactor target _is_ the recommendation; mechanism stays open. |
| design       | no                      | Design is open exploration; recommending a path defeats the point. |
| architecture | no                      | Same as design.                                                    |
| research     | no                      | The question is the work; no recommendation to make.               |

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

(Prefix shown for orientation only — `/work-scope` does not allocate ids.
`/work-write` does that at file-write time.)

## Workflow

1. **Parse args** into `<type>` and `<rough description>`. Reject unknown types.
2. **Check for duplicates.** Scan `work/1-inbox/`, `work/2-doing/`, and
   `work/3-done/` for an existing ticket on the same problem. If found, stop and
   surface it — don't create a parallel ticket.
3. **Survey prior work in the same area.** Beyond exact duplicates, look for
   historical context that should inform this ticket:
   - Scan `work/3-done/` for past tickets touching the same code, feature, or
     concern. If a title looks related, read the body to be sure.
   - Skim `git log` for related commits (by keyword, by affected paths).
   - Collect anything relevant — what was tried, what was rejected, decisions
     that constrain this ticket. This becomes `RELATED WORK`.
4. **Understand the affected code.** Read the file(s) at issue so you can
   articulate the intent — what value the code delivers today and what about it
   is broken / missing / unclear. Pin line numbers where they sharpen the
   problem statement.
5. **Refine with the user.** Drive the dialogue toward the packet:
   - "Is the problem really X, or is X just a symptom?"
   - "What does success look like that someone could observe and verify?"
   - "Why does this matter — who feels the pain, what constraint is being
     violated?"
   - Push back when the human starts solutioning; redirect to outcome.
   - Skip questions whose answer is already unambiguous from the description.
6. **Present the packet.** Print it back in the labeled shape above and ask:
   "Approve to write?" The human can edit any field, ask for more discovery, or
   reject.
7. **On approval, hand off to `/work-write`.** Invoke
   `/work-write <type> <packet>` with the packet inline. `/work-write` will
   validate the packet, allocate the id, write the file, and log it. If
   `/work-write` rejects the packet, surface its reason and loop back to step 5.

## When to skip this skill

If the problem and outcome are already crisp (captured in a meeting note, a
code-review comment, an audit report you trust), you can call `/work-write`
directly with the packet. `/work-write` will validate and bounce back to
`/work-scope` if anything is missing or vague.
