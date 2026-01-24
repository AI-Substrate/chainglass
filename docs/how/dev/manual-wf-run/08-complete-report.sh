#!/bin/bash
# 08-complete-report.sh - Validate and finalize report phase (workflow complete)
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

echo "=== Validating report outputs ==="
if ! node "$CLI" phase validate report --run-dir "$RUN_DIR" --check outputs; then
    echo ""
    echo "❌ Validation FAILED"
    echo ""
    echo "Check what's in: $RUN_DIR/phases/report/run/outputs/"
    echo "Expected: final-report.md"
    exit 1
fi

echo ""
echo "=== Finalizing report phase ==="
node "$CLI" phase finalize report --run-dir "$RUN_DIR"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ WORKFLOW COMPLETE!"
echo ""
echo "Run: $RUN_DIR"
echo ""
./check-state.sh
echo ""
echo "Final report: $RUN_DIR/phases/report/run/outputs/final-report.md"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
