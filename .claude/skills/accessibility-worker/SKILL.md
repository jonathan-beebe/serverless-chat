---
name: accessibility-worker
description: Fix an accessibility issue
---

Work the given accessiblity ticket:

$ARGUMENTS

## Workflow

- Mark it as in-process.
- Ensure you understand the goal of the code you are working with, and the
  intended outcome of a successful fix.
- Research the issue to determine if it still exists.
  - Add your notes to the bottom of the issue in a "working" section.
- Then try to find the _simplest_ solution that addresses the issue and make the
  fix so all tests pass. Ensure the fix is aligned with the goal and intended
  outcomes of the code & feature.
- Then make a commit with the changes.
- Update the mardown, marking the issue as resolved.
- Move the issue to `__local__/work/accessiblity/resolved`
- Write a single line entry to `__local__/work/accessiblity/log.md`
