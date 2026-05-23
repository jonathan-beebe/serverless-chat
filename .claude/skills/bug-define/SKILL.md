---
name: bug-define
description: Make a bug ticket for the given issue
---

Make a bug ticket for the following issue:

$ARGUMENTS

## Workflow

- Working directory: `__local__/work/bugs/`.
- Next ticket number found at top of `./log.md` > `Next bug ticket number:`
- Ensure we don't already have a bug ticket for it.
- Ensure you understand the goal of the code & feature and its intended outcome,
  if the code was working properly.
- Research the issue until you understand the root cause and suggest a fix.
- Write the bug into `./inbox` as a new work item with a status of "Open".
- Write a single line entry to `./log.md`
- Increment the next ticket number in log.
