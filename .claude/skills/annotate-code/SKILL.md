---
name: annotate-code
description:
  Annotate source code with descriptive comments to aid in understanding and AI
  generation.
---

Your goal is to ensure that the code inis annotated with inline comments that
caputure the _why_ of the code -- what problem does it solve, why does it exist,
and why does it have ths particular shape, why this particular design or
pattern?

You will review the following code:

$ARGUMENTS

Where comments may not be clear, offer improvements to clarity.

Where meaningful code complexity exists that is not annotated, you will study
the code and ensure you know _why_ it exists, what problem it solves, and why
this partifcular implementation was chosen. Capture the why in inline comments.
