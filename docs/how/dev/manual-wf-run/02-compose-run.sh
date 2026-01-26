#!/bin/bash
# 02-compose-run.sh - Create a fresh workflow run
#
# Per Phase 6: Manual Test Harness with cg agent CLI
# Creates a new run from the hello-workflow template.
#
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
CLI="$PROJECT_ROOT/apps/cli/dist/cli.cjs"
TEMPLATE="$PROJECT_ROOT/dev/examples/wf/template/hello-workflow"
RUNS_DIR="$PROJECT_ROOT/dev/examples/wf/runs"

echo "=============================================="
echo "Manual Test Harness: Compose Run"
echo "=============================================="
echo ""

# Check CLI exists
if [ ! -f "$CLI" ]; then
    echo "ERROR: CLI not found at $CLI"
    echo "Run 'pnpm build' in apps/cli first"
    exit 1
fi

# Check template exists
if [ ! -d "$TEMPLATE" ]; then
    echo "ERROR: Template not found at $TEMPLATE"
    exit 1
fi

echo "Creating fresh workflow run..."
echo "  Template: hello-workflow"
echo "  Runs dir: $RUNS_DIR"
echo ""

node "$CLI" wf compose "$TEMPLATE" --runs-dir "$RUNS_DIR"

# Find the latest run
LATEST_RUN=$(ls -td "$RUNS_DIR"/run-* 2>/dev/null | head -1)

if [ -z "$LATEST_RUN" ]; then
    echo ""
    echo "ERROR: No run folder created"
    exit 1
fi

# Save run dir for other scripts
echo "$LATEST_RUN" > "$SCRIPT_DIR/.current-run"

# Clear any previous session
rm -f "$SCRIPT_DIR/.current-session"

echo ""
echo "=============================================="
echo "Run created: $LATEST_RUN"
echo ""
echo "Next: ./03-run-gather.sh"
echo "=============================================="
