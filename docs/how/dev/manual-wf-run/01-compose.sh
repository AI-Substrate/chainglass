#!/bin/bash
# 01-compose.sh - Create a fresh workflow run
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
CLI="$PROJECT_ROOT/apps/cli/dist/cli.cjs"
TEMPLATE="$PROJECT_ROOT/dev/examples/wf/template/hello-workflow"
RUNS_DIR="$PROJECT_ROOT/dev/examples/wf/runs"

echo "Creating fresh workflow run..."
node "$CLI" wf compose "$TEMPLATE" --runs-dir "$RUNS_DIR"

# Find the latest run
LATEST_RUN=$(ls -td "$RUNS_DIR"/run-* 2>/dev/null | head -1)

if [ -z "$LATEST_RUN" ]; then
    echo "ERROR: No run folder created"
    exit 1
fi

# Save run dir for other scripts
echo "$LATEST_RUN" > "$SCRIPT_DIR/.current-run"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✓ Run created: $LATEST_RUN"
echo ""
echo "Next: ./02-start-gather.sh"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
