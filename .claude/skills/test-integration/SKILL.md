---
name: test-integration
description:
  Write an integration test for the user flow or component interaction in
  $ARGUMENTS. Use for "click X, verify Y" flows, navigation, form submission, or
  any test that needs rendered React + a router.
---

Write a Vitest + React Testing Library integration test for $ARGUMENTS.

Project conventions live in `CLAUDE.md` → "Testing & TDD". Read that section
before writing the test. Highlights specific to integration tests:

- Use `renderWithRouter` from `@/test/render` (wraps in `MemoryRouter`).
- Use a SCOPED `<Routes>` table — only the routes the test exercises, never the
  full `App.tsx` tree.
- Prefer `userEvent` over `fireEvent`. Always `userEvent.setup()` first.
- Query by role → label → text. Avoid querying by class.
- Use `findBy*` for async-rendered content. Don't add manual `waitFor` if
  `findBy*` can express the condition.
- Don't mock the data layer — components calling `api.getPlants()` etc. on mount
  is fine; those resolve from in-memory seed data.
- No non-null assertions (`!`). Use `if (!x) throw new Error('...')` to narrow.

Steps:

1. Read $ARGUMENTS to identify start state, user action(s), and the assertion
   that proves the flow worked.
2. Build the smallest scoped `<Routes>` tree needed (start route + destination
   route(s)).
3. Render → act with `userEvent` → assert.
4. Run `npm run test:run -- <pattern>` and confirm it passes.
5. Show the diff. Wait for review before committing.

Reference: `src/components/Dashboard.test.tsx` is the canonical example.
