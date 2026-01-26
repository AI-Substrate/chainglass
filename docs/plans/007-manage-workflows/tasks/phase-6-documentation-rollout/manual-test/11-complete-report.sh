#!/bin/bash
# 11-complete-report.sh - Validate and finalize report phase + final check
#
# NOTE: The bundled hello-workflow only has a gather phase.
# This script is a placeholder for multi-phase workflows.
#
# Usage: ./11-complete-report.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../../../.." && pwd)"
CLI="node $PROJECT_ROOT/apps/cli/dist/cli.cjs"

echo "═══════════════════════════════════════════════════════════"
echo "Step 11: Complete Report Phase & Final Check"
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
    echo ""
    echo "Skipping report phase - showing final state:"
    echo "════════════════════════════════════════════════════════"
    echo ""
    "$SCRIPT_DIR/check-state.sh"
    exit 0
fi

cd "$PROJECT_ROOT"

# Check if outputs exist
if [ ! -f "$RUN_DIR/phases/report/run/outputs/final-report.md" ]; then
    echo "⚠ No outputs found. Copying simulated agent work..."
    cp "$SCRIPT_DIR/simulated-agent-work/report/final-report.md" "$RUN_DIR/phases/report/run/outputs/"
    echo "✓ Copied simulated output"
    echo ""
fi

# Validate outputs
echo "Validating report outputs..."
$CLI phase validate report --run-dir "$RUN_DIR" --check outputs --json
echo ""

# Finalize the phase
echo "Finalizing report phase..."
$CLI phase finalize report --run-dir "$RUN_DIR" --json
echo ""

# Verify completion
echo "Verifying phase completion..."
STATE_FILE="$RUN_DIR/phases/report/run/wf-data/wf-phase.json"
if [ -f "$STATE_FILE" ]; then
    STATE=$(jq -r '.state' "$STATE_FILE")
    echo "Phase state: $STATE"
    if [ "$STATE" == "complete" ]; then
        echo "✓ Report phase complete"
    else
        echo "⚠ Phase state is not 'complete'"
    fi
else
    echo "✗ wf-phase.json not found!"
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo "FINAL STATE CHECK"
echo "════════════════════════════════════════════════════════════"
echo ""

"$SCRIPT_DIR/check-state.sh"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "✓ WORKFLOW COMPLETE"
echo ""
echo "All phases have been executed successfully."
echo "Review the final-report.md for workflow results."
echo "════════════════════════════════════════════════════════════"
