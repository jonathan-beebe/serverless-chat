---
name: work-start
description:
  Work a ticket of any type. With no argument (or `all`), drains every ticket in
  `work/1-inbox/` in filename order. With a `TICKET-###` argument, works that
  single ticket. With a type name (e.g. `bug`, `feat`, `a11y`), drains only
  tickets of that type. The canonical workflow lives here and the type-specific
  working steps are loaded from `types/<type>.md`.
argument-hint: '[TICKET-### | <type> | all]'
---

Start a work session:

$ARGUMENTS

## Expected arguments

Zero or one argument:

- _(empty)_ or `all` — drain `work/1-inbox/` in alphabetical order, one ticket
  at a time, until empty.
- `TICKET-###` — work that single ticket (look it up in `1-inbox/` first, then
  `2-doing/`).
- `<type>` — drain only tickets of the given type from `work/1-inbox/` in
  alphabetical order. Accepts either the type name (`bug`, `feature`, `a11y`, …)
  or the prefix (`BUG`, `FEAT`, `A11Y`, …), case-insensitive. See the type
  registry below for the full list.

## Type registry

| prefix | type         | how-to file             |
| ------ | ------------ | ----------------------- |
| RSRCH  | research     | `types/research.md`     |
| DSGN   | design       | `types/design.md`       |
| ARCH   | architecture | `types/architecture.md` |
| FEAT   | feature      | `types/feature.md`      |
| IMPRV  | improvement  | `types/improvement.md`  |
| MAINT  | maintenance  | `types/maintenance.md`  |
| A11Y   | a11y         | `types/a11y.md`         |
| RFCTR  | refactor     | `types/refactor.md`     |
| BUG    | bug          | `types/bug.md`          |

## Workflow (canonical for all types)

1. **Resolve target ticket(s).** Pick based on the argument:
   - `TICKET-###` — that single ticket.
   - _(empty)_ or `all` — every file in `work/1-inbox/`, alphabetical order.
   - `<type>` — only files in `work/1-inbox/` whose id starts with the matching
     prefix from the type registry, alphabetical order. Resolve the argument to
     a prefix case-insensitively against both the `type` and `prefix` columns.
     If it matches neither, stop and surface the unknown type rather than
     falling back to draining everything.
2. For each ticket, in order:
   1. **Identify the type** by extracting the prefix from the id.
   2. **Read** `types/<type>.md` (this directory). That file owns the
      type-specific test approach, definition of done, and any extra steps.
   3. **Locate** the ticket file in `work/1-inbox/` then `work/2-doing/`. If it
      lives only in `3-done/`, surface that and ask whether to reopen.
   4. **Promote to doing.** Move the file to `work/2-doing/` if not already
      there. Invoke `work-log`: `<PREFIX>-<NNN> — started`.
   5. **Understand the goal.** Re-read the ticket and the affected code.
   6. **Re-validate** that the issue / need still applies. Capture notes in a
      `## Working` section at the bottom of the ticket as you go.
   7. **Tests first** — write the test(s) the matching `types/<type>.md` calls
      for (failing/demonstrative, characterization, etc.).
   8. **Make the change** — pursue the simplest solution. Favor existing
      patterns over new ones.
   9. **Run all tests** — green before committing.
   10. **Commit** with the ticket id in the message.
   11. **Mark accepted.** Once the user has accepted the change, update the
       ticket status, move the file to `work/3-done/`, and invoke the skill
       `/work-log`: `<PREFIX>-<NNN> — done: <one-line summary>`.
3. If a worker step fails or asks for human input, stop the drain loop and
   surface the question — do not silently skip ahead.
