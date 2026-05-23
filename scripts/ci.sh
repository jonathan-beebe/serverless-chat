#!/bin/sh
# CI: runs all checks, suppressing output unless a step fails.
set -e

steps="format:check typecheck lint test build"

for step in $steps; do
  if ! output=$(npm run "$step" 2>&1); then
    echo "✗ $step failed:"
    echo "$output"
    exit 1
  fi
done

echo "✓ All checks passed."
