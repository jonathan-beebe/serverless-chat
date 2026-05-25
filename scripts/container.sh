#!/usr/bin/env bash
set -euo pipefail

WORKSPACE_FOLDER="$(cd "$(dirname "$0")/.." && pwd)"

devcontainer up --workspace-folder "$WORKSPACE_FOLDER"

if [ $# -eq 0 ]; then
  devcontainer exec --workspace-folder "$WORKSPACE_FOLDER" zsh
else
  devcontainer exec --workspace-folder "$WORKSPACE_FOLDER" "$@"
fi
