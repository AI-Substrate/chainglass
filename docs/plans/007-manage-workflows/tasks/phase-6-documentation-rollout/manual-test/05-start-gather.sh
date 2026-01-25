#!/bin/bash
# 05-start-gather.sh - Prepare gather phase and create user message
#
# Usage: ./05-start-gather.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../../../.." && pwd)"
CLI="node $PROJECT_ROOT/apps/cli/dist/cli.cjs"

echo "═══════════════════════════════════════════════════════════"
echo "Step 5: Start Gather Phase"
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

# Prepare the phase
echo "Preparing gather phase..."
$CLI phase prepare gather --run-dir "$RUN_DIR" --json
echo ""

# Create user request message from orchestrator-inputs
echo "Creating user request message..."
USER_REQUEST=$(cat "$SCRIPT_DIR/orchestrator-inputs/gather/m-001-user-request.json")
SUBJECT=$(echo "$USER_REQUEST" | jq -r '.subject')
BODY=$(echo "$USER_REQUEST" | jq -r '.body')

$CLI phase message create gather \
    --run-dir "$RUN_DIR" \
    --type free_text --from orchestrator \
    --subject "$SUBJECT" \
    --body "$BODY" \
    --json
echo ""

# Verify message created
echo "Verifying message created..."
if [ -f "$RUN_DIR/phases/gather/run/messages/m-001.json" ]; then
    echo "✓ Message m-001.json created"
    echo ""
    echo "Message content:"
    cat "$RUN_DIR/phases/gather/run/messages/m-001.json"
else
    echo "✗ Message m-001.json NOT found!"
    exit 1
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✓ Gather phase started"
echo ""
echo "🎭 ORCHESTRATOR → AGENT handover"
echo ""
echo "Agent should now:"
echo "  1. Read: $RUN_DIR/phases/gather/commands/main.md"
echo "  2. Read: $RUN_DIR/phases/gather/run/messages/m-001.json"
echo "  3. Write: $RUN_DIR/phases/gather/run/outputs/response.md"
echo ""
echo "For Mode 1, copy simulated output:"
echo "  cp simulated-agent-work/gather/response.md \\"
echo "     \"$RUN_DIR/phases/gather/run/outputs/\""
echo ""
echo "Next step: ./06-complete-gather.sh"
echo "═══════════════════════════════════════════════════════════"
