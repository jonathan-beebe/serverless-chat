---
name: bug-fix
description: Fix the given bug
---

Fix the given bug ticket:

$ARGUMENTS

## Workflow

- Mark it as in-process.
- Ensure you understand the goal of the code you are working with, and the
  intended outcome of a successful fix.
- Research the issue to determine if it still exists.
  - Add your notes to the bottom of the issue in a "working" section.
- If it does, write a test to prove it. Ideally this is a failing test that
  demonstrates the bug.
- Then try to find the _simplest_ solution that addresses the issue and make the
  fix so all tests pass. Ensure the fix is aligned with the goal and intended
  outcomes of the code & feature.
- Then make a commit with the changes.
- Update the mardown, marking the issue as resolved.
- Move the issue to `__local__/work/bugs/resolved`
- Write a single line entry to `__local__/work/bugs/log.md`
