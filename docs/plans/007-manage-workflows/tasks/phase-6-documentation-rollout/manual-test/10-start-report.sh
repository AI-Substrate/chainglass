#!/bin/bash
# 10-start-report.sh - Prepare report phase
#
# NOTE: The bundled hello-workflow only has a gather phase.
# This script is a placeholder for multi-phase workflows.
#
# Usage: ./10-start-report.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../../../.." && pwd)"
CLI="node $PROJECT_ROOT/apps/cli/dist/cli.cjs"

echo "═══════════════════════════════════════════════════════════"
echo "Step 10: Start Report Phase"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Read run directory from .current-run
if [ ! -f "$SCRIPT_DIR/.current-run" ]; then
    echo "✗ .current-run not found. Run ./04-compose-run.sh first."
    exit 1
fi
RUN_DIR=$(cat "$SCRIPT_DIR/.current-run")

echo "Run directory: $RUN_DIR"
echo ""

# Check if report phase exists
if [ ! -d "$RUN_DIR/phases/report" ]; then
    echo "════════════════════════════════════════════════════════"
    echo "⚠ No report phase found in this workflow."
    echo ""
    echo "The bundled hello-workflow has only a single 'gather' phase."
    echo "For a multi-phase workflow with gather→process→report,"
    echo "use a template from:"
    echo "  dev/examples/wf/template/hello-workflow/"
    echo ""
    echo "Current workflow is COMPLETE after gather phase."
    echo "Run ./check-state.sh to see final state."
    echo "════════════════════════════════════════════════════════"
    exit 0
fi

cd "$PROJECT_ROOT"

# Prepare the report phase
echo "Preparing report phase..."
$CLI phase prepare report --run-dir "$RUN_DIR" --json
echo ""

# Verify inputs were copied from process
echo "Verifying inputs from process phase..."
if [ -d "$RUN_DIR/phases/report/run/inputs" ]; then
    echo "✓ Inputs directory exists"
    ls -la "$RUN_DIR/phases/report/run/inputs/"
else
    echo "⚠ Inputs directory not found"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✓ Report phase started"
echo ""
echo "🎭 ORCHESTRATOR → AGENT handover"
echo ""
echo "Agent should now:"
echo "  1. Read: $RUN_DIR/phases/report/commands/main.md"
echo "  2. Read inputs from: $RUN_DIR/phases/report/run/inputs/"
echo "  3. Write: $RUN_DIR/phases/report/run/outputs/final-report.md"
echo ""
echo "For Mode 1, copy simulated output:"
echo "  cp simulated-agent-work/report/final-report.md \\"
echo "     \"$RUN_DIR/phases/report/run/outputs/\""
echo ""
echo "Next step: ./11-complete-report.sh"
echo "═══════════════════════════════════════════════════════════"
