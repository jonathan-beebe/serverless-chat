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

A scope is a definition of the problem, a definition of what success looks like,
and includes adequate boundaries and constraints so the work can be easily
validated using unit tests and objective measures.

A scope is not a solution.

A scope can include recommendations and suggestions.

The dialogue is done when you can produce, with the human's agreement, this
packet:

```
PROBLEM: <factual statement — what is being solved, or what is broken / missing / unclear, and where>
GOAL: <what does success look like? What is this work aiming at?>
OUTCOME: <observable, verifiable end state — the user or system reaches X>
WHY IT MATTERS: <user impact, constraint violated, downstream effect>
RELATED WORK: <list of TICKET-### and/or commit SHAs, or "none">
DISCOVERY NOTES (optional): <advisory diagnostic notes from the reporter>
RECOMMENDATION (optional): <suggestions that may help address the problem — anything from a one-line direction to sample pseudo-code>
ONE-LINE SUMMARY: <short phrase — used for filename slug and journal entry>
```

### Rules the dialogue must honor

- `PROBLEM` the what, is factual and grounded (file paths / line numbers when
  applicable). Push back on vague phrasings ("fix the menu thing").
- `GOAL` the why, is a clear, one line statement of what the finish line looks
  like.
- `OUTCOME` is phrased as an observable state ("the user can dismiss the dialog
  with Escape", "the table has an accessible name"), **not** as a code change
  ("add an `aria-label`", "wrap in `<dialog>`"). The mechanism — even when
  obvious — belongs in `RECOMMENDATION` (when the type allows it) or in
  `/work-start`, not in `OUTCOME`.
- `RECOMMENDATION` the recommendation can be anything from a one-line direction
  ("just make it a link") to sample code — whatever level of detail the human
  and the dialogue land on. For types where it's forbidden, push back on any
  solutioning attempt: the maker decides shape, not the reporter. If the human
  is mid-recommendation when the type forbids it, route the observable part to
  `OUTCOME` and the causal part to `DISCOVERY NOTES`.
- If the human has done diagnostic work worth preserving (a likely root cause, a
  reproduction recipe, a constraint they uncovered), put it under
  `DISCOVERY NOTES` and mark it advisory — not a directive. `/work-start` may
  use it or discard it. `DISCOVERY NOTES` and `RECOMMENDATION` are distinct:
  notes describe what _is_ (causal), recommendation describes what to _do_
  (directional). When in doubt, prefer `DISCOVERY NOTES`.

### Recommendation policy by type

Some types lend themselves to recommendations more than others.

- `bug` should include references to affected source code and suggestions for
  where to start inquiry.
- `a11y` should include be a very clear and direct fix along with precise
  measurements the fix is passing. If an issue might point to a deeper
  architectural problem, suggest to the agent this problem be routed to the
  research or architecture type for deeper work.
- `maintenance` should include recommendations for how to align the code and
  what success looks like.
- `improvement` should include guidance of how to improve the situation.
- `feature` should clearly document the problem and user/business goals of the
  feature, but leaves implementation up to the maker.
- `refactor` should suggest the ideal end state and how to measure that the code
  is more well factored after the work is done. Sometimes a refactor may point
  at a deeper architectural issue; if this is the case suggest the agent route
  this to the research agent to capture options for eventual architecture
  changes.
- `design` recommendations focus on design principles and remain the design
  layer, leaving technical underpinings up to the maker.
- `architecture` recommendations should be in the form of mermaind diagrams that
  capture data flow, module relationships, etc. Use ERDs, sequencie diagrams,
  and flow charts as needed. architecture can always be pictured. sometimes what
  appears to be an architecture problem is actually a refactoring problem; if
  this is the case then suggest to the agent we use the refactor type.
- `research` captures what should be learned and why, and what this learning
  will contribute to next, connecting the dots between the research effort and
  the value to be ultimately delivered.

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
   - **Watch for recurrence.** If 2+ prior 3-done tickets touched the same
     surface or concern, surface that pattern to the human and ask whether the
     new ticket should be reframed as research or architecture rather than filed
     as another symptom. (RSRCH-001 may refine this rule; this is the
     starting-point version.)
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
