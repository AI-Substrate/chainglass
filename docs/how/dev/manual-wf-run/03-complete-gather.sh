#!/bin/bash
# 03-complete-gather.sh - Validate and finalize gather phase
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

echo "=== Validating gather outputs ==="
if ! node "$CLI" phase validate gather --run-dir "$RUN_DIR" --check outputs; then
    echo ""
    echo "❌ Validation FAILED"
    echo ""
    echo "Check what's in: $RUN_DIR/phases/gather/run/outputs/"
    echo "Expected: acknowledgment.md, gather-data.json"
    exit 1
fi

echo ""
echo "=== Finalizing gather phase ==="
node "$CLI" phase finalize gather --run-dir "$RUN_DIR"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✓ Gather phase complete"
echo ""
echo "Next: ./04-start-process.sh"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
