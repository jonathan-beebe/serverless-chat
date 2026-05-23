---
name: tdd-refactor
description:
  Run a full TDD-on-refactor workflow for the change in $ARGUMENTS. Identifies
  behaviors to protect, writes characterization tests (and any new failing
  tests), then makes the refactor and re-verifies. Use whenever you are about to
  change non-trivial code.
---

Drive a TDD-on-refactor cycle for: $ARGUMENTS

This is a workflow skill. Walk through the phases in order and check in with the
user between phases — do NOT run end-to-end without surfacing decisions.

### Phase 1 — Identify what to protect

- Read the code that will change and its callers.
- List behaviors that must NOT regress (golden path, edge cases, cross-component
  flows).
- List any NEW behavior the refactor introduces (these become failing tests
  first).
- Show the user the list. Confirm before writing tests.

### Phase 2 — Write tests

- For protected behaviors: write characterization tests (use `test-unit` or
  `test-integration`). Run them. They must be GREEN against current code — that
  proves the test actually exercises the behavior.
- For new behaviors: write failing tests asserting the desired post-refactor
  behavior. They must be RED against current code — and the failure must match
  the asserted behavior, not a setup error.
- Show the test diff and the run output. Confirm with the user before
  refactoring.

### Phase 3 — Refactor

- Make the change.
- Do NOT modify the tests during this phase. If a characterization test starts
  failing, that's a regression signal — investigate, don't "fix" the test.

### Phase 4 — Re-verify

- Run `npm run test:run` (or use `test-verify`).
- All previously-green tests must still be green.
- All previously-red tests for new behavior must now be green.
- If anything else regresses, stop and report to the user.

### Phase 5 — Wrap up

- Summarize: behaviors protected, behaviors added, code changed.
- Do NOT commit until the user reviews.
