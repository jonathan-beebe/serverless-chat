---
name: architecture
description: This is how you design a new feature in this product.
---

Favor functional core, imperitive shell. Favor hightly composable and testable
functions and compponents. Unit test individual functions to ensure they work as
expected and within their boundaries. Integration test the shell to ensure
business and customer value is intact. Favor patterns that are reusable. Don't
be clever, be readable. Document the _why_ in code comments. Annotated code is
good. If you find two conflicting patterns, ask the user if one should be
refactored away to favor the canonical pattern. Always make an effort to adhere
to WCAG guidelines when architecting UI features.
