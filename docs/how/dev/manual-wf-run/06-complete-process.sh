#!/bin/bash
# 06-complete-process.sh - Validate and finalize process phase
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

echo "=== Validating process outputs ==="
if ! node "$CLI" phase validate process --run-dir "$RUN_DIR" --check outputs; then
    echo ""
    echo "❌ Validation FAILED"
    echo ""
    echo "Check what's in: $RUN_DIR/phases/process/run/outputs/"
    echo "Expected: result.md, process-data.json"
    exit 1
fi

echo ""
echo "=== Finalizing process phase ==="
node "$CLI" phase finalize process --run-dir "$RUN_DIR"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✓ Process phase complete"
echo ""
echo "Next: ./07-start-report.sh"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
