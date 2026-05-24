---
name: code-review-audit
description: Review the code for improvements
---

Review the following code for improvements:

$ARGUMENTS

Our coding principles are defined across the project in our main README.md,
CLAUDE.md, and in the various domain-specific READMD.md files. In brief, they
are:

- Favor simple and straghtforward solutions. Avoid being clever.
- Favor existing patterns. Don't create new ones.
- Use TDD principles to ensure we protect the customer and business value.
- Favor a functional core / imperative shell pattern.
- Leverage an atomic design system.
- Keep strong architectural boundaries between the api code, view componnets,
  and the controllers that glue them together.

## Workflow

- Working directory: `__local__/work/improvements/`.
- Next ticket number found at top of `./log.md` > `Next ticket number:`
- Ensure we don't already have a ticket for it.
- Ensure you understand the goal of the code & feature and its intended outcome.
- Research the issue until you understand the root cause and suggest a fix.
- Write the ticket into `./inbox` as a new work item with a status of "Open".
- Write a single line entry using `/work-logger`.
- Increment the next ticket number in log.
