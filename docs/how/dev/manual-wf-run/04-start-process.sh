#!/bin/bash
# 04-start-process.sh - Prepare process phase and handover to agent
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

echo "=== Preparing process phase ==="
node "$CLI" phase prepare process --run-dir "$RUN_DIR"

echo ""
echo "=== Handing over to agent ==="
node "$CLI" phase handover process --run-dir "$RUN_DIR" --reason "Ready for agent"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✓ Process phase ready for agent"
echo ""
echo "Give agent this prompt:"
echo ""
echo "  Continue with the next phase."
echo "  Your working directory is now: $RUN_DIR/phases/process/"
echo "  Start by reading: commands/wf.md"
echo ""
echo "If agent asks a question: ./05-answer-question.sh"
echo "When agent completes: ./06-complete-process.sh"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
