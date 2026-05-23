#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.devcontainer/.env"
TEMPLATE="$REPO_ROOT/.devcontainer/.env.template"

if [ -f "$ENV_FILE" ]; then
  printf '%s already exists. Edit it directly, or delete it and re-run.\n' "$ENV_FILE"
  exit 0
fi

if [ ! -f "$TEMPLATE" ]; then
  printf 'Missing template: %s\n' "$TEMPLATE" >&2
  exit 1
fi

default_name="$(git config user.name 2>/dev/null || true)"
default_email="$(git config user.email 2>/dev/null || true)"

read -r -p "Git user name [${default_name}]: " name
name="${name:-$default_name}"

read -r -p "Git user email [${default_email}]: " email
email="${email:-$default_email}"

if [ -z "$name" ] || [ -z "$email" ]; then
  printf 'Both name and email are required.\n' >&2
  exit 1
fi

{
  printf 'GIT_USER_NAME=%s\n' "$name"
  printf 'GIT_USER_EMAIL=%s\n' "$email"
} > "$ENV_FILE"

printf 'Wrote %s\n' "$ENV_FILE"
