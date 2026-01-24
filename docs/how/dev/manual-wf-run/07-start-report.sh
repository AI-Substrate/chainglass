#!/bin/bash
# 07-start-report.sh - Prepare report phase and handover to agent
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

echo "=== Preparing report phase ==="
node "$CLI" phase prepare report --run-dir "$RUN_DIR"

echo ""
echo "=== Handing over to agent ==="
node "$CLI" phase handover report --run-dir "$RUN_DIR" --reason "Ready for final report"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✓ Report phase ready for agent"
echo ""
echo "Give agent this prompt:"
echo ""
echo "  Final phase."
echo "  Your working directory is now: $RUN_DIR/phases/report/"
echo "  Start by reading: commands/wf.md"
echo ""
echo "When agent completes: ./08-complete-report.sh"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
