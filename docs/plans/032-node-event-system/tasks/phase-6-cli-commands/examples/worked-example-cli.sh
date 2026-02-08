#!/usr/bin/env bash
# ===================================================================
# Worked Example: Node Event CLI Commands — Real Shell Commands
# ===================================================================
#
# Run:  bash docs/plans/032-node-event-system/tasks/phase-6-cli-commands/examples/worked-example-cli.sh
#
# Prerequisites:
#   - pnpm build (CLI must be compiled)
#   - Must be run from inside a registered chainglass workspace
#
# This walks through the 8 new CLI commands by actually running them
# and showing their JSON output. You'll see the full agent lifecycle:
# create a graph, start a node, accept it, raise events, inspect the
# event log, stamp events, use discovery commands, and see error codes.
#
# The script creates a temporary graph, exercises every command, then
# cleans up after itself.
# ===================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../../../.." && pwd)"
CLI="$REPO_ROOT/apps/cli/dist/cli.cjs"

if [[ ! -f "$CLI" ]]; then
  echo "ERROR: CLI not built. Run 'pnpm build' first."
  exit 1
fi

# Helper: run a cg command, strip pino logs, pretty-print JSON
cg() {
  local output
  output=$(node "$CLI" "$@" 2>/dev/null | grep -v '"level"') || true
  echo "$output" | python3 -m json.tool 2>/dev/null || echo "$output"
}

# Helper: raw JSON (for field extraction)
cg_raw() {
  node "$CLI" "$@" 2>/dev/null | grep -v '"level"' || true
}

# Helper: extract a JSON field
jf() { python3 -c "import sys,json; print(json.load(sys.stdin)$1)" 2>/dev/null; }

GRAPH="worked-example-$$"

cleanup() {
  echo ""
  echo "━━━ Cleanup ━━━"
  cg_raw wf --json delete "$GRAPH" > /dev/null 2>&1 || true
  echo "→ Deleted graph '$GRAPH'"
}
trap cleanup EXIT

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Node Event CLI Commands — Worked Example"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ──────────────────────────────────────────────────────────────────────
# 1. Create Graph and Start a Node
#
# Before we can raise events, we need a graph with a started node.
# After startNode, the two-phase handshake puts the node in 'starting'
# — the agent must raise 'node:accepted' to begin work.
# ──────────────────────────────────────────────────────────────────────

echo "━━━ Section 1: Setup — Create Graph, Add Node, Start ━━━"
echo ""
CREATE_JSON=$(cg_raw wf --json create "$GRAPH")
LINE_ID=$(echo "$CREATE_JSON" | jf "['data']['lineId']")
echo "$ cg wf --json create $GRAPH"
echo "$CREATE_JSON" | python3 -m json.tool
echo ""

ADD_JSON=$(cg_raw wf --json node add "$GRAPH" "$LINE_ID" sample-coder)
NODE_ID=$(echo "$ADD_JSON" | jf "['data']['nodeId']")
echo "$ cg wf --json node add $GRAPH $LINE_ID sample-coder"
echo "$ADD_JSON" | python3 -m json.tool
echo ""

echo "$ cg wf --json node start $GRAPH $NODE_ID"
cg wf --json node start "$GRAPH" "$NODE_ID"
echo ""
echo "→ Node '$NODE_ID' is now in 'starting' state, awaiting acceptance"
echo ""

# ──────────────────────────────────────────────────────────────────────
# 2. accept — Agent Accepts the Node
#
# This shortcut raises 'node:accepted'. It's the first thing an LLM
# agent runs after receiving a task. The node transitions from
# 'starting' to 'agent-accepted' — now work can begin.
# ──────────────────────────────────────────────────────────────────────

echo "━━━ Section 2: cg wf node accept ━━━"
echo ""
echo "$ cg wf --json node accept $GRAPH $NODE_ID"
cg wf --json node accept "$GRAPH" "$NODE_ID"
echo ""

# ──────────────────────────────────────────────────────────────────────
# 3. raise-event — Agent Asks a Question
#
# The core command: raise an event with a validated JSON payload. Here
# the agent posts question:ask. The payload is validated against the
# QuestionAskPayloadSchema. Watch for stopsExecution=true and the
# [AGENT INSTRUCTION] in the response telling the agent to pause.
# ──────────────────────────────────────────────────────────────────────

echo "━━━ Section 3: cg wf node raise-event (question:ask) ━━━"
echo ""
PAYLOAD='{"question_id":"q1","type":"single","text":"Which language should I use?","options":["TypeScript","Python","Go"]}'
echo "$ cg wf --json node raise-event $GRAPH $NODE_ID question:ask --payload '<json>' --source agent"
RAISE_JSON=$(cg_raw wf --json node raise-event "$GRAPH" "$NODE_ID" question:ask --payload "$PAYLOAD" --source agent)
echo "$RAISE_JSON" | python3 -m json.tool
echo ""

EVENT_ID=$(echo "$RAISE_JSON" | jf "['data']['event']['event_id']")
echo "→ Event ID: $EVENT_ID"
echo "→ stopsExecution=true — agent must pause and wait for the answer"
echo ""

# ──────────────────────────────────────────────────────────────────────
# 4. events — Inspect the Event Log
#
# List all events for a node, or filter by --type or --id. Agents use
# the JSON output to check event status; humans get a readable table.
# ──────────────────────────────────────────────────────────────────────

echo "━━━ Section 4: cg wf node events (list + filter) ━━━"
echo ""
echo "$ cg wf --json node events $GRAPH $NODE_ID"
cg wf --json node events "$GRAPH" "$NODE_ID"
echo ""

echo "$ cg wf --json node events $GRAPH $NODE_ID --type question:ask"
cg wf --json node events "$GRAPH" "$NODE_ID" --type question:ask
echo ""

echo "$ cg wf --json node events $GRAPH $NODE_ID --id $EVENT_ID"
cg wf --json node events "$GRAPH" "$NODE_ID" --id "$EVENT_ID"
echo ""

# ──────────────────────────────────────────────────────────────────────
# 5. stamp-event — Mark Event as Processed
#
# Stamps record that a subscriber acknowledged an event. Here the
# orchestrator stamps the question as forwarded, with data recording
# the delivery channel. Multiple subscribers can stamp the same event.
# ──────────────────────────────────────────────────────────────────────

echo "━━━ Section 5: cg wf node stamp-event ━━━"
echo ""
STAMP_DATA='{"channel":"slack","thread":"T1234"}'
echo "$ cg wf --json node stamp-event $GRAPH $NODE_ID $EVENT_ID --subscriber orchestrator --action forwarded --data '<json>'"
cg wf --json node stamp-event "$GRAPH" "$NODE_ID" "$EVENT_ID" --subscriber orchestrator --action forwarded --data "$STAMP_DATA"
echo ""

# ──────────────────────────────────────────────────────────────────────
# 6. event list-types — Discovery
#
# Lists all registered event types grouped by domain. Agents call this
# to learn what events are available at runtime. The <graph> and
# <nodeId> args exist for CLI consistency (DYK #4).
# ──────────────────────────────────────────────────────────────────────

echo "━━━ Section 6: cg wf node event list-types (discovery) ━━━"
echo ""
echo "$ cg wf --json node event list-types $GRAPH $NODE_ID"
cg wf --json node event list-types "$GRAPH" "$NODE_ID"
echo ""

# ──────────────────────────────────────────────────────────────────────
# 7. event schema — Introspect a Type
#
# Shows the full metadata and payload fields for a specific event type.
# Agents call this before constructing payloads to learn the required
# fields, allowed sources, and whether the event stops execution.
# ──────────────────────────────────────────────────────────────────────

echo "━━━ Section 7: cg wf node event schema (introspect) ━━━"
echo ""
echo "$ cg wf --json node event schema $GRAPH $NODE_ID question:ask"
cg wf --json node event schema "$GRAPH" "$NODE_ID" question:ask
echo ""

# ──────────────────────────────────────────────────────────────────────
# 8. error — Report an Error (on a second node)
#
# The error shortcut raises 'node:error' with structured details. We
# use a second node so the state machine is clean. Notice the payload
# includes code, message, and recoverable fields.
# ──────────────────────────────────────────────────────────────────────

echo "━━━ Section 8: cg wf node error (on a fresh node) ━━━"
echo ""
ADD2_JSON=$(cg_raw wf --json node add "$GRAPH" "$LINE_ID" sample-tester)
NODE2_ID=$(echo "$ADD2_JSON" | jf "['data']['nodeId']")
cg_raw wf --json node start "$GRAPH" "$NODE2_ID" > /dev/null
cg_raw wf --json node accept "$GRAPH" "$NODE2_ID" > /dev/null
echo "→ Created second node '$NODE2_ID', started and accepted"
echo ""
echo "$ cg wf --json node error $GRAPH $NODE2_ID --code COMPILE_FAILED --message 'TypeScript build error' --recoverable"
cg wf --json node error "$GRAPH" "$NODE2_ID" --code COMPILE_FAILED --message "TypeScript build error" --recoverable
echo ""

# ──────────────────────────────────────────────────────────────────────
# 9. Error Codes — What Happens When Things Go Wrong
#
# E190: unknown event type. E196: event not found for stamp. These map
# to specific JSON error responses that agents can parse and handle.
# ──────────────────────────────────────────────────────────────────────

echo "━━━ Section 9: Error codes ━━━"
echo ""
echo "$ cg wf --json node raise-event $GRAPH $NODE_ID bogus:event  # expect E190"
cg wf --json node raise-event "$GRAPH" "$NODE_ID" bogus:event
echo ""

echo "$ cg wf --json node stamp-event $GRAPH $NODE_ID nonexistent-id --subscriber x --action ack  # expect E196"
cg wf --json node stamp-event "$GRAPH" "$NODE_ID" nonexistent-id --subscriber x --action ack
echo ""

# ──────────────────────────────────────────────────────────────────────

echo "━━━ Done ━━━"
echo "✓ Exercised all 8 new CLI commands with real JSON output"
echo "✓ Commands: accept, raise-event, events, stamp-event, error, event list-types, event schema"
echo "✓ Error codes E190 (unknown type) and E196 (event not found)"
echo "✓ [AGENT INSTRUCTION] shown for stop-execution events"
echo "✓ Graph '$GRAPH' will be cleaned up on exit"
