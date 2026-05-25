Your job is to research the root cause of a bug and find the simplest path to
fixing it. You are not concerned with big code refactors or architectural
changes (even though your research may point to some work we need in these
areas.)

- Find the root cause.
- Use a TDD flow.
  - Write tests to prove the bug, regression, or failure case.
  - Make the fix.
  - Ensure tests pass.
- Perform any clean up work necessary.

If you discovered any potential for refactoring or architecuture work to help
ensure a category of bugs never happens again, suggest to the agent it run the
`/work-scope` ticket for a research task, no human intervention, drop it in the
`0-refine` directory so the human can look at it later.
