#!/bin/bash
# 03-run-gather.sh - Run gather phase with agent
#
# Per Phase 6: Manual Test Harness with cg agent CLI
# Uses `cg agent run` to programmatically invoke the agent.
#
# Flow:
# 1. Prepare gather phase
# 2. Create user message
# 3. Handover to agent
# 4. Invoke cg agent run --type claude-code --prompt <prompt> --cwd <phase-dir>
# 5. Validate outputs
# 6. Finalize phase
# 7. Save session ID for subsequent phases
#
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
CLI="$PROJECT_ROOT/apps/cli/dist/cli.cjs"

echo "=============================================="
echo "Manual Test Harness: Run Gather Phase"
echo "=============================================="
echo ""

# Load current run
if [ ! -f "$SCRIPT_DIR/.current-run" ]; then
    echo "ERROR: No current run. Run ./02-compose-run.sh first"
    exit 1
fi
RUN_DIR=$(cat "$SCRIPT_DIR/.current-run")
PHASE_DIR="$RUN_DIR/phases/gather"

echo "Run directory: $RUN_DIR"
echo "Phase: gather"
echo ""

# Step 1: Prepare phase
echo "--- Step 1: Prepare gather phase ---"
node "$CLI" phase prepare gather --run-dir "$RUN_DIR"
echo ""

# Step 2: Create user message
echo "--- Step 2: Create user message ---"
node "$CLI" phase message create gather \
    --run-dir "$RUN_DIR" \
    --type free_text \
    --from orchestrator \
    --subject "Workflow Request" \
    --body "Process these CSV files and generate a summary report with trends. Focus on the sales data from Q4 2025."
echo ""

# Step 3: Handover to agent
echo "--- Step 3: Handover to agent ---"
node "$CLI" phase handover gather --run-dir "$RUN_DIR" --reason "Ready for agent"
echo ""

# Step 4: Invoke agent
echo "--- Step 4: Invoke agent via cg agent run ---"

# Build the agent prompt
AGENT_PROMPT="You are executing a workflow phase.
Your working directory is the run root: $RUN_DIR
You are working on the GATHER phase at: phases/gather/

Start by reading: AGENT-START.md (in your current directory)

This is the GATHER phase. Your task is to:
1. Read phases/gather/commands/main.md for detailed instructions
2. Check phases/gather/run/messages/m-001.json for the user's request
3. Write outputs to phases/gather/run/outputs/
4. Validate with: cg phase validate gather --run-dir $RUN_DIR --check outputs
5. Finalize with: cg phase finalize gather --run-dir $RUN_DIR

IMPORTANT: Execute THIS phase only. When complete, STOP and report back."

echo "Invoking agent with prompt..."
echo ""

# Run agent and capture result
AGENT_RESULT=$(node "$CLI" agent run \
    --type claude-code \
    --prompt "$AGENT_PROMPT" \
    --cwd "$RUN_DIR" 2>&1)  # Use RUN_DIR for session continuity across phases

# Parse result - extract the final JSON line (result has "output", logs have "level")
RESULT_JSON=$(echo "$AGENT_RESULT" | grep '"output"' | tail -1)
AGENT_STATUS=$(echo "$RESULT_JSON" | jq -r '.status // "unknown"')
SESSION_ID=$(echo "$RESULT_JSON" | jq -r '.sessionId // ""')
AGENT_OUTPUT=$(echo "$RESULT_JSON" | jq -r '.output // ""')

echo "Agent status: $AGENT_STATUS"
echo "Session ID: $SESSION_ID"

if [ "$AGENT_STATUS" = "failed" ]; then
    STDERR=$(echo "$AGENT_RESULT" | jq -r '.stderr // ""')
    echo ""
    echo "ERROR: Agent failed"
    echo "stderr: $STDERR"
    exit 1
fi

# Save session ID for subsequent phases
if [ -n "$SESSION_ID" ]; then
    echo "$SESSION_ID" > "$SCRIPT_DIR/.current-session"
    echo ""
    echo "Session saved for phase continuation"
fi

echo ""
echo "--- Agent output (truncated) ---"
echo "$AGENT_OUTPUT" | head -20
if [ $(echo "$AGENT_OUTPUT" | wc -l) -gt 20 ]; then
    echo "... (output truncated)"
fi
echo ""

# Step 5: Validate outputs
echo "--- Step 5: Validate outputs ---"
if node "$CLI" phase validate gather --run-dir "$RUN_DIR" --check outputs; then
    echo "  [OK] Outputs valid"
else
    echo ""
    echo "WARNING: Output validation failed"
    echo "Check: $PHASE_DIR/run/outputs/"
    echo "You may need to manually complete the phase"
fi
echo ""

# Step 6: Finalize phase
echo "--- Step 6: Finalize gather phase ---"
if node "$CLI" phase finalize gather --run-dir "$RUN_DIR"; then
    echo "  [OK] Phase finalized"
else
    echo ""
    echo "WARNING: Finalize failed"
    echo "You may need to manually finalize"
fi

echo ""
echo "=============================================="
echo "Gather phase complete"
echo "Session ID: $SESSION_ID"
echo ""
echo "Next: ./04-run-process.sh"
echo "=============================================="
