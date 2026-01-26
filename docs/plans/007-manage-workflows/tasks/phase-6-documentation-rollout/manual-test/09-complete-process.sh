#!/bin/bash
# 09-complete-process.sh - Validate and finalize process phase
#
# NOTE: The bundled hello-workflow only has a gather phase.
# This script is a placeholder for multi-phase workflows.
#
# Usage: ./09-complete-process.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../../../.." && pwd)"
CLI="node $PROJECT_ROOT/apps/cli/dist/cli.cjs"

echo "═══════════════════════════════════════════════════════════"
echo "Step 9: Complete Process Phase"
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
    echo "Current workflow is COMPLETE after gather phase."
    echo "Run ./check-state.sh to see final state."
    echo "════════════════════════════════════════════════════════"
    exit 0
fi

cd "$PROJECT_ROOT"

# Check if outputs exist
if [ ! -f "$RUN_DIR/phases/process/run/outputs/result.md" ]; then
    echo "⚠ No outputs found. Copying simulated agent work..."
    cp "$SCRIPT_DIR/simulated-agent-work/process/"* "$RUN_DIR/phases/process/run/outputs/"
    echo "✓ Copied simulated outputs"
    echo ""
fi

# Validate outputs
echo "Validating process outputs..."
$CLI phase validate process --run-dir "$RUN_DIR" --check outputs --json
echo ""

# Finalize the phase
echo "Finalizing process phase..."
$CLI phase finalize process --run-dir "$RUN_DIR" --json
echo ""

# Verify completion
echo "Verifying phase completion..."
STATE_FILE="$RUN_DIR/phases/process/run/wf-data/wf-phase.json"
if [ -f "$STATE_FILE" ]; then
    STATE=$(jq -r '.state' "$STATE_FILE")
    echo "Phase state: $STATE"
    if [ "$STATE" == "complete" ]; then
        echo "✓ Process phase complete"
    else
        echo "⚠ Phase state is not 'complete'"
    fi
else
    echo "✗ wf-phase.json not found!"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✓ Process phase completed"
echo ""
echo "Next step: ./10-start-report.sh"
echo "═══════════════════════════════════════════════════════════"
