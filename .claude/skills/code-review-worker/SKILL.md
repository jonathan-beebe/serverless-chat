---
name: code-review-worker
description: Work one of the code improvement tickets
---

You will work the next code improvement ticket:

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

- Mark it as in-process.
- Ensure you understand the goal of the code you are working with, and the
  intended outcome of a successful fix.
- Research the ticket to understand how to best address it and improve the code.
  - Add your notes to the bottom of the issue in a "working" section.
- Follow a TDD path, ensuring we have tests to protect existing customer and
  business value, so none of our changes break the desired funcionality.
- Then find the _simplest_ solution. Ensure the improvements are aligned with
  the goal and intended outcomes of the code & feature.
- Then make a commit with the changes.
- Update the mardown, marking the issue as resolved.
- Move the issue to `__local__/work/improvements/resolved`
- Use `/work-logger` to add a single entry.
