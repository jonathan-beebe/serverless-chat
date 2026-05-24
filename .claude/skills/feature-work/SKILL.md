---
name: feature-work
description: Implement the given feature
---

(It no arguments are passed in tell the user to pass in a feature ticket.)

Work the given ticket:

$ARGUMENTS

## Workflow

- Mark it as in-process.
- Ensure you understand the goal of the feature you will be implementing, and
  the intended outcome of a successful implementation.
- Determine what tests need to be written to validate the new code, and what
  tests might need to be written to protect existing code and behavior.
  - Add your notes to the bottom of the ticket in a "working" section.
- Write the tests using TDD principles. Ideally these are a failing test that
  demonstrates the desired behavior of the feature.
- Implement the feature, striving for the most simple, effective, and
  straghtforward approach.
- Run all tests to ensure old code still works as intended and new code
  implements the feature as intended.
- Then make a commit with the changes.
- Update the mardown, marking the ticket as resolved.
- Move the issue to `__local__/work/features/resolved`
- Write a single log entry to `__local__/work/features/log.md`
