#!/bin/bash
# CLI wrapper - use this instead of 'cg' command
# Usage: ./cg.sh phase validate gather --check outputs

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Find project root (contains apps/cli/dist/cli.cjs)
PROJECT_ROOT="$SCRIPT_DIR"
while [ "$PROJECT_ROOT" != "/" ]; do
    if [ -f "$PROJECT_ROOT/apps/cli/dist/cli.cjs" ]; then
        break
    fi
    PROJECT_ROOT="$(dirname "$PROJECT_ROOT")"
done

if [ ! -f "$PROJECT_ROOT/apps/cli/dist/cli.cjs" ]; then
    echo "ERROR: Cannot find CLI at apps/cli/dist/cli.cjs"
    echo "Make sure you're in a workflow run directory under the project"
    exit 1
fi

# Run CLI with --run-dir automatically set to this directory
exec node "$PROJECT_ROOT/apps/cli/dist/cli.cjs" "$@" --run-dir "$SCRIPT_DIR"
