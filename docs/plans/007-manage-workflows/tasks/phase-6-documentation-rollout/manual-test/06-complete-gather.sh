#!/bin/bash
# 06-complete-gather.sh - Validate and finalize gather phase
#
# Usage: ./06-complete-gather.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../../../.." && pwd)"
CLI="node $PROJECT_ROOT/apps/cli/dist/cli.cjs"

echo "═══════════════════════════════════════════════════════════"
echo "Step 6: Complete Gather Phase"
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

cd "$PROJECT_ROOT"

# Check if outputs exist
if [ ! -f "$RUN_DIR/phases/gather/run/outputs/response.md" ]; then
    echo "⚠ No outputs found. Copying simulated agent work..."
    cp "$SCRIPT_DIR/simulated-agent-work/gather/response.md" "$RUN_DIR/phases/gather/run/outputs/"
    echo "✓ Copied simulated output"
    echo ""
fi

# Validate outputs
echo "Validating gather outputs..."
$CLI phase validate gather --run-dir "$RUN_DIR" --check outputs --json
echo ""

# Finalize the phase
echo "Finalizing gather phase..."
$CLI phase finalize gather --run-dir "$RUN_DIR" --json
echo ""

# Verify completion
echo "Verifying phase completion..."
STATE_FILE="$RUN_DIR/phases/gather/run/wf-data/wf-phase.json"
if [ -f "$STATE_FILE" ]; then
    STATE=$(jq -r '.state' "$STATE_FILE")
    echo "Phase state: $STATE"
    if [ "$STATE" == "complete" ]; then
        echo "✓ Gather phase complete"
    else
        echo "⚠ Phase state is not 'complete'"
    fi
else
    echo "✗ wf-phase.json not found!"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✓ Gather phase completed"
echo ""
echo "The bundled hello-workflow has only one phase (gather)."
echo "For multi-phase workflows, continue with process and report."
echo ""
echo "Run ./check-state.sh to see final state."
echo "═══════════════════════════════════════════════════════════"
