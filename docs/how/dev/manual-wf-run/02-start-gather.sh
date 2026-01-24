#!/bin/bash
# 02-start-gather.sh - Prepare gather phase and handover to agent
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
CLI="$PROJECT_ROOT/apps/cli/dist/cli.cjs"

# Load current run
if [ ! -f "$SCRIPT_DIR/.current-run" ]; then
    echo "ERROR: No current run. Run ./01-compose.sh first"
    exit 1
fi
RUN_DIR=$(cat "$SCRIPT_DIR/.current-run")

echo "=== Preparing gather phase ==="
node "$CLI" phase prepare gather --run-dir "$RUN_DIR"

echo ""
echo "=== Creating user request message ==="
node "$CLI" phase message create gather \
    --run-dir "$RUN_DIR" \
    --type free_text \
    --from orchestrator \
    --subject "Workflow Request" \
    --body "Process these CSV files and generate a summary report with trends. Focus on the sales data from Q4 2025."

echo ""
echo "=== Handing over to agent ==="
node "$CLI" phase handover gather --run-dir "$RUN_DIR" --reason "Ready for agent"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✓ Gather phase ready for agent"
echo ""
echo "Give agent this prompt:"
echo ""
echo "  You are executing a workflow phase."
echo "  Your working directory is: $RUN_DIR/phases/gather/"
echo "  Start by reading: commands/wf.md"
echo ""
echo "When agent completes: ./03-complete-gather.sh"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
