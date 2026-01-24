#!/bin/bash
# 05-answer-question.sh - Answer agent's question in process phase
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

echo "=== Checking for messages ==="
node "$CLI" phase message list process --run-dir "$RUN_DIR"

echo ""
echo "=== Reading message 001 ==="
node "$CLI" phase message read process --run-dir "$RUN_DIR" --id 001 || true

echo ""
read -p "Answer with option (A/B/C) [default: C]: " ANSWER
ANSWER=${ANSWER:-C}

echo ""
echo "=== Answering with: $ANSWER ==="
node "$CLI" phase message answer process \
    --run-dir "$RUN_DIR" \
    --id 001 \
    --select "$ANSWER" \
    --note "Selected by orchestrator"

echo ""
echo "=== Handing back to agent ==="
node "$CLI" phase handover process --run-dir "$RUN_DIR" --reason "Answer provided, please continue"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✓ Question answered"
echo ""
echo "Tell agent: Answer provided, please continue with your work."
echo ""
echo "When agent completes: ./06-complete-process.sh"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
