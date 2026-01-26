#!/bin/bash
# 07-start-process.sh - Prepare process phase
#
# NOTE: The bundled hello-workflow only has a gather phase.
# This script is a placeholder for multi-phase workflows.
#
# Usage: ./07-start-process.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../../../.." && pwd)"
CLI="node $PROJECT_ROOT/apps/cli/dist/cli.cjs"

echo "═══════════════════════════════════════════════════════════"
echo "Step 7: Start Process Phase"
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

# Check if process phase exists
if [ ! -d "$RUN_DIR/phases/process" ]; then
    echo "════════════════════════════════════════════════════════"
    echo "⚠ No process phase found in this workflow."
    echo ""
    echo "The bundled hello-workflow has only a single 'gather' phase."
    echo "For a multi-phase workflow, use a template from:"
    echo "  dev/examples/wf/template/hello-workflow/"
    echo ""
    echo "Current workflow is COMPLETE after gather phase."
    echo "Run ./check-state.sh to see final state."
    echo "════════════════════════════════════════════════════════"
    exit 0
fi

cd "$PROJECT_ROOT"

# Prepare the process phase
echo "Preparing process phase..."
$CLI phase prepare process --run-dir "$RUN_DIR" --json
echo ""

# Verify inputs were copied from gather
echo "Verifying inputs from gather phase..."
if [ -d "$RUN_DIR/phases/process/run/inputs" ]; then
    echo "✓ Inputs directory exists"
    ls -la "$RUN_DIR/phases/process/run/inputs/"
else
    echo "⚠ Inputs directory not found"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✓ Process phase started"
echo ""
echo "🎭 ORCHESTRATOR → AGENT handover"
echo ""
echo "Agent should now:"
echo "  1. Read: $RUN_DIR/phases/process/commands/main.md"
echo "  2. Read inputs from: $RUN_DIR/phases/process/run/inputs/"
echo "  3. Write outputs to: $RUN_DIR/phases/process/run/outputs/"
echo ""
echo "For Mode 1, copy simulated outputs:"
echo "  cp simulated-agent-work/process/* \\"
echo "     \"$RUN_DIR/phases/process/run/outputs/\""
echo ""
echo "Next step: ./08-answer-question.sh (if agent asks)"
echo "Or skip to: ./09-complete-process.sh"
echo "═══════════════════════════════════════════════════════════"
