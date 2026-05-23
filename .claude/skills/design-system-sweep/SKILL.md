---
name: design-system-sweep
description:
  A skill to sweep the project components not defined in the design system and
  add them to the design system.
---

This app has a design system located in `src/components/design-system`. It
follows the atomic design principles, with components organized into three
categories: atoms, components, and layouts. The design system is documented in
`src/components/design-system/README.md`, which includes a list of all
components, their descriptions, and usage examples.

Scan the app for uses of $ARGUMENTS that are not defined in the design system.
After you understand the existing patterns used across the app:

- Extract it into a new component that follows the design system's principles
  and guidelines.
- Add the newly extracted component to the design system documentation,
  including its name, description, and usage examples.
- Replace all instances of the component in the app with the newly created
  component from the design system.
- Allow the user to review this one component before committing the changes.
- If approved, commit the changes to the design system and the app.
- If not approved, review the necessary changes and iterate on this component
  until it meets the design system standards.
- Only after the user has confirmed the changes for this component.
