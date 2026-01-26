#!/bin/bash
# 05-run-report.sh - Run report phase with agent (after compact)
#
# Per Phase 6: Manual Test Harness with cg agent CLI
# Uses `cg agent compact` to reduce context, then `cg agent run` to invoke agent.
#
# Flow:
# 1. Compact session (reduce context from process phase)
# 2. Prepare report phase
# 3. Handover to agent
# 4. Invoke cg agent run --session <id> --prompt <prompt> --cwd <phase-dir>
# 5. Validate outputs
# 6. Finalize phase (terminal phase - workflow complete)
#
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
CLI="$PROJECT_ROOT/apps/cli/dist/cli.cjs"

echo "=============================================="
echo "Manual Test Harness: Run Report Phase"
echo "=============================================="
echo ""

# Load current run
if [ ! -f "$SCRIPT_DIR/.current-run" ]; then
    echo "ERROR: No current run. Run ./02-compose-run.sh first"
    exit 1
fi
RUN_DIR=$(cat "$SCRIPT_DIR/.current-run")
PHASE_DIR="$RUN_DIR/phases/report"

# Load session ID
if [ ! -f "$SCRIPT_DIR/.current-session" ]; then
    echo "ERROR: No session ID. Run ./03-run-gather.sh first"
    exit 1
fi
# Read and trim session ID (remove any whitespace/newlines)
SESSION_ID=$(cat "$SCRIPT_DIR/.current-session" | tr -d '[:space:]')

echo "Run directory: $RUN_DIR"
echo "Phase: report (final)"
echo "Session: $SESSION_ID"
echo ""

# Step 1: Compact session
echo "--- Step 1: Compact session (reduce context) ---"
COMPACT_RESULT=$(node "$CLI" agent compact \
    --type claude-code \
    --session "$SESSION_ID" 2>&1)

# Parse result - extract the final JSON object (skip NDJSON log lines)
COMPACT_JSON=$(echo "$COMPACT_RESULT" | grep -E '^\{' | grep '"output"' | tail -1)
COMPACT_STATUS=$(echo "$COMPACT_JSON" | jq -r '.status // "unknown"')
echo "Compact status: $COMPACT_STATUS"

if [ "$COMPACT_STATUS" = "failed" ]; then
    STDERR=$(echo "$COMPACT_JSON" | jq -r '.stderr // ""')
    echo "WARNING: Compact failed: $STDERR"
    echo "Continuing anyway..."
fi
echo ""

# Step 2: Prepare phase
echo "--- Step 2: Prepare report phase ---"
node "$CLI" phase prepare report --run-dir "$RUN_DIR"
echo ""

# Step 3: Handover to agent
echo "--- Step 3: Handover to agent ---"
node "$CLI" phase handover report --run-dir "$RUN_DIR" --reason "Ready for agent"
echo ""

# Step 4: Invoke agent with existing session
echo "--- Step 4: Invoke agent via cg agent run (with session) ---"

# Build the agent prompt
AGENT_PROMPT="You are executing a workflow phase.
Your working directory is the run root: $RUN_DIR
You are working on the REPORT phase at: phases/report/

Start by reading: AGENT-START.md (in your current directory)

This is the REPORT phase (FINAL). Your task is to:
1. Read phases/report/commands/main.md for detailed instructions
2. Check phases/report/run/inputs/ for files from process phase
3. Write outputs to phases/report/run/outputs/
4. Validate with: cg phase validate report --run-dir $RUN_DIR --check outputs
5. Finalize with: cg phase finalize report --run-dir $RUN_DIR

This is the FINAL phase. When complete, the workflow is done.
IMPORTANT: Execute THIS phase only. When complete, STOP and report back."

echo "Invoking agent with existing session..."
echo ""

# Run agent with session resumption
AGENT_RESULT=$(node "$CLI" agent run \
    --type claude-code \
    --session "$SESSION_ID" \
    --prompt "$AGENT_PROMPT" \
    --cwd "$RUN_DIR" 2>&1)  # Use RUN_DIR for session continuity across phases

# Parse result - extract the final JSON object (skip NDJSON log lines)
RESULT_JSON=$(echo "$AGENT_RESULT" | grep -E '^\{' | grep '"output"' | tail -1)
AGENT_STATUS=$(echo "$RESULT_JSON" | jq -r '.status // "unknown"')
AGENT_OUTPUT=$(echo "$RESULT_JSON" | jq -r '.output // ""')

echo "Agent status: $AGENT_STATUS"

if [ "$AGENT_STATUS" = "failed" ]; then
    STDERR=$(echo "$RESULT_JSON" | jq -r '.stderr // ""')
    echo ""
    echo "ERROR: Agent failed"
    echo "stderr: $STDERR"
    exit 1
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
if node "$CLI" phase validate report --run-dir "$RUN_DIR" --check outputs; then
    echo "  [OK] Outputs valid"
else
    echo ""
    echo "WARNING: Output validation failed"
    echo "Check: $PHASE_DIR/run/outputs/"
    echo "You may need to manually complete the phase"
fi
echo ""

# Step 6: Finalize phase
echo "--- Step 6: Finalize report phase ---"
if node "$CLI" phase finalize report --run-dir "$RUN_DIR"; then
    echo "  [OK] Phase finalized"
else
    echo ""
    echo "WARNING: Finalize failed"
    echo "You may need to manually finalize"
fi

echo ""
echo "=============================================="
echo "WORKFLOW COMPLETE"
echo ""
echo "Run directory: $RUN_DIR"
echo "Final report: $PHASE_DIR/run/outputs/final-report.md"
echo ""
echo "Next: ./06-validate-entity.sh"
echo "=============================================="
