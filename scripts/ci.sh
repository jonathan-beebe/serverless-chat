#!/bin/sh
# CI: runs all checks in parallel, suppressing output unless a step fails.

steps="format:check typecheck lint test"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT INT TERM

# Sanitize a step name into a token usable as both a filename and a var suffix.
slug() {
  printf '%s' "$1" | tr ':/' '__'
}

# Fan out: launch every step in the background, buffering output per-step.
for step in $steps; do
  s=$(slug "$step")
  npm run "$step" >"$tmp/$s.log" 2>&1 &
  eval "pid_$s=$!"
done

# Wait on each, recording exit codes in declared order.
fail=0
for step in $steps; do
  s=$(slug "$step")
  eval "pid=\$pid_$s"
  wait "$pid"
  rc=$?
  eval "rc_$s=$rc"
  [ "$rc" -ne 0 ] && fail=1
done

# Summary line per step.
for step in $steps; do
  s=$(slug "$step")
  eval "rc=\$rc_$s"
  if [ "$rc" -eq 0 ]; then
    echo "✓ $step"
  else
    echo "✗ $step"
  fi
done

# On any failure, dump only the failing steps' logs and exit non-zero.
if [ "$fail" -ne 0 ]; then
  for step in $steps; do
    s=$(slug "$step")
    eval "rc=\$rc_$s"
    if [ "$rc" -ne 0 ]; then
      echo
      echo "--- $step output ---"
      cat "$tmp/$s.log"
    fi
  done
  exit 1
fi

echo "✓ All checks passed."
