---
name: test-verify
description:
  Run the test suite (optionally scoped by $ARGUMENTS pattern), interpret
  results, and recommend next steps. Use after writing a test, after a refactor,
  or whenever the user asks whether tests are passing.
---

Run tests and interpret the results.

Steps:

1. If $ARGUMENTS is provided, run `npm run test:run -- $ARGUMENTS` (Vitest
   treats positional args as a file pattern). Otherwise run `npm run test:run`
   for the full suite.
2. If everything is green, report counts (test files, tests, duration) and stop.
3. If anything is red, for each failure:
   - Read the assertion and the source file:line it points to.
   - Decide which it is:
     - **Real regression** — production code changed and broke a
       previously-protected behavior. Recommend fixing the code.
     - **Stale test** — the test asserts behavior that intentionally changed.
       Recommend updating the test, but flag the assumption with the user.
     - **Expected red** — a newly-written failing test in a TDD red-step.
       Confirm the failure mode matches the asserted behavior, not a setup
       error.
     - **Setup bug** — the test imports the wrong thing, queries by a stale
       selector, etc. Recommend fixing the test.
4. Report per failure: assertion → likely category → recommended next step. Do
   NOT auto-fix unless the user asked.

Watch for:

- jsdom limits (no real layout, no service worker). If a test fails because of
  CSS-dependent behavior, flag that the test may not be appropriate for jsdom.
- Async query failures: did the test use `findBy*` instead of `getBy*`?
- "Cannot read properties of null" — almost always a missing null guard in the
  code, not a test bug.
