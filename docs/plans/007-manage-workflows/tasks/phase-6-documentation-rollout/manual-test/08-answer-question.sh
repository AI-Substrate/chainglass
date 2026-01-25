#!/bin/bash
# 08-answer-question.sh - Answer agent's question (if asked)
#
# NOTE: The bundled hello-workflow only has a gather phase.
# This script is a placeholder for multi-phase workflows with agent questions.
#
# Usage: ./08-answer-question.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../../../.." && pwd)"
CLI="node $PROJECT_ROOT/apps/cli/dist/cli.cjs"

echo "═══════════════════════════════════════════════════════════"
echo "Step 8: Answer Agent Question"
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
    echo "This script is for multi-phase workflows where the agent"
    echo "asks clarifying questions during the process phase."
    echo ""
    echo "Current workflow is COMPLETE after gather phase."
    echo "Run ./check-state.sh to see final state."
    echo "════════════════════════════════════════════════════════"
    exit 0
fi

cd "$PROJECT_ROOT"

# Check for messages from agent
echo "Checking for agent messages..."
MSG_FILE="$RUN_DIR/phases/process/run/messages/m-001.json"

if [ -f "$MSG_FILE" ]; then
    echo "Found message from agent:"
    cat "$MSG_FILE"
    echo ""

    # Check if already answered
    ANSWERED=$(jq -r '.answer // empty' "$MSG_FILE")
    if [ -n "$ANSWERED" ]; then
        echo "✓ Message already answered"
    else
        # Read answer from orchestrator-inputs
        ANSWER=$(cat "$SCRIPT_DIR/orchestrator-inputs/process/m-001-answer.json")
        SELECT=$(echo "$ANSWER" | jq -r '.select')
        NOTE=$(echo "$ANSWER" | jq -r '.note')

        echo "Answering with: select=$SELECT, note=$NOTE"
        $CLI phase message answer process \
            --run-dir "$RUN_DIR" \
            --id 001 --select "$SELECT" --note "$NOTE" \
            --json
        echo ""
        echo "✓ Question answered"
    fi
else
    echo "No messages found from agent."
    echo ""
    echo "In a multi-phase workflow, the agent might ask questions"
    echo "during the process phase. This script would answer them."
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✓ Question handling complete"
echo ""
echo "Next step: ./09-complete-process.sh"
echo "═══════════════════════════════════════════════════════════"
