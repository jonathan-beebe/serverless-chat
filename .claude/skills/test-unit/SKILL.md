---
name: test-unit
description:
  Write a unit test for the function, module, or behavior in $ARGUMENTS. Use for
  pure functions, data-layer queries, or any testable unit that does not require
  rendered React.
---

Write a Vitest unit test for $ARGUMENTS.

Project conventions live in `CLAUDE.md` → "Testing & TDD". Read that section
before writing the test. Highlights:

- Colocate the test next to the source file (`foo.ts` → `foo.test.ts`).
- Import the real module — no mocks, no fixtures. Real seed data via
  `src/data/api.ts` is the rule.
- No non-null assertions (`!`). After `expect(x).not.toBeNull()`, narrow with
  `if (!x) throw new Error('...')`.
- Globals are enabled (`describe`, `it`, `expect` need no import).

Steps:

1. Read $ARGUMENTS to understand inputs, outputs, and edge cases.
2. Identify the smallest interesting behaviors to characterize: golden path,
   edge cases (empty, missing, invalid), and any known branches.
3. Write the test file. Name tests by behavior, not implementation ("returns
   null for unknown id", not "calls map.get with -1").
4. Run `npm run test:run -- <pattern>` and confirm it passes.
5. Show the diff. Wait for review before committing.
