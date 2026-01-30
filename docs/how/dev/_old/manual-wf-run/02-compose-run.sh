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
WORKFLOW_SLUG="hello-workflow"
REGISTRY_DIR="$PROJECT_ROOT/.chainglass/workflows/$WORKFLOW_SLUG"

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

# Check workflow is registered
if [ ! -d "$REGISTRY_DIR" ]; then
    echo "ERROR: Workflow not registered at $REGISTRY_DIR"
    echo "Run 'cg workflow checkpoint hello-workflow' first"
    exit 1
fi

echo "Creating fresh workflow run..."
echo "  Workflow: $WORKFLOW_SLUG (from registry)"
echo ""

# Change to project root for cg commands (they use relative .chainglass paths)
cd "$PROJECT_ROOT"
node "$CLI" workflow compose "$WORKFLOW_SLUG"

# Find the latest run in the registry runs directory
# Format: .chainglass/runs/hello-workflow/v001-xxx/run-YYYY-MM-DD-NNN
RUNS_BASE="$PROJECT_ROOT/.chainglass/runs/$WORKFLOW_SLUG"
LATEST_RUN=$(find "$RUNS_BASE" -maxdepth 2 -type d -name "run-*" 2>/dev/null | sort -r | head -1)

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
