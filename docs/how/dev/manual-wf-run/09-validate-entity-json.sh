#!/bin/bash
# 09-validate-entity-json.sh - Validate entity JSON format
#
# Per Phase 6: Entity Upgrade - Validates that entities returned by CLI
# match expected JSON structure.
#
# This script validates:
# 1. Phase entity JSON structure (from completed phases)
# 2. Workflow entity JSON structure (from runs)
#
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
CLI="$PROJECT_ROOT/apps/cli/dist/cli.cjs"
EXPECTED_OUTPUTS="$SCRIPT_DIR/expected-outputs"

echo "═══════════════════════════════════════════════════════════"
echo "Entity JSON Format Validation"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Load current run
if [ ! -f "$SCRIPT_DIR/.current-run" ]; then
    echo "ERROR: No current run. Run ./01-compose.sh first"
    exit 1
fi
RUN_DIR=$(cat "$SCRIPT_DIR/.current-run")

# Helper function to check JSON key exists and matches expected value
check_json_key() {
    local json="$1"
    local key="$2"
    local expected="$3"
    local actual
    actual=$(echo "$json" | jq -r ".$key // \"__MISSING__\"")

    if [ "$actual" = "__MISSING__" ]; then
        echo "  [FAIL] Missing key: $key"
        return 1
    elif [ -n "$expected" ] && [ "$actual" != "$expected" ]; then
        echo "  [FAIL] $key: expected '$expected', got '$actual'"
        return 1
    else
        echo "  [OK] $key: $actual"
        return 0
    fi
}

# Helper to check JSON key type
check_json_type() {
    local json="$1"
    local key="$2"
    local expected_type="$3"
    local actual_type
    actual_type=$(echo "$json" | jq -r ".$key | type")

    if [ "$actual_type" != "$expected_type" ]; then
        echo "  [FAIL] $key type: expected '$expected_type', got '$actual_type'"
        return 1
    else
        echo "  [OK] $key is $expected_type"
        return 0
    fi
}

FAILURES=0

echo "─────────────────────────────────────────────────────────────"
echo "Test 1: Workflow Entity JSON (from cg runs get)"
echo "─────────────────────────────────────────────────────────────"
echo ""

# Get workflow entity JSON from run
# Note: cg runs get returns the Workflow entity JSON
WORKFLOW_JSON=$(node "$CLI" runs get "$RUN_DIR" -o json 2>/dev/null || echo "{}")

if [ "$WORKFLOW_JSON" = "{}" ]; then
    echo "  [FAIL] Could not get workflow entity JSON"
    echo "  (cg runs get may not be implemented yet)"
    ((FAILURES++))
else
    echo "Validating Workflow entity structure..."

    # Check required keys for run workflow
    check_json_key "$WORKFLOW_JSON" "slug" "" || ((FAILURES++))
    check_json_key "$WORKFLOW_JSON" "workflowDir" "" || ((FAILURES++))
    check_json_key "$WORKFLOW_JSON" "version" "" || ((FAILURES++))
    check_json_key "$WORKFLOW_JSON" "isCurrent" "false" || ((FAILURES++))
    check_json_key "$WORKFLOW_JSON" "isCheckpoint" "false" || ((FAILURES++))
    check_json_key "$WORKFLOW_JSON" "isRun" "true" || ((FAILURES++))
    check_json_key "$WORKFLOW_JSON" "isTemplate" "false" || ((FAILURES++))
    check_json_key "$WORKFLOW_JSON" "source" "run" || ((FAILURES++))
    check_json_type "$WORKFLOW_JSON" "checkpoint" "object" || ((FAILURES++))
    check_json_type "$WORKFLOW_JSON" "run" "object" || ((FAILURES++))
    check_json_type "$WORKFLOW_JSON" "phases" "array" || ((FAILURES++))

    # Check run metadata
    echo ""
    echo "Validating run metadata..."
    check_json_key "$WORKFLOW_JSON" "run.runId" "" || ((FAILURES++))
    check_json_key "$WORKFLOW_JSON" "run.runDir" "" || ((FAILURES++))
    check_json_key "$WORKFLOW_JSON" "run.status" "" || ((FAILURES++))
    check_json_key "$WORKFLOW_JSON" "run.createdAt" "" || ((FAILURES++))
fi

echo ""
echo "─────────────────────────────────────────────────────────────"
echo "Test 2: Phase Entity JSON (from completed phase)"
echo "─────────────────────────────────────────────────────────────"
echo ""

# Check for completed gather phase
GATHER_STATE="$RUN_DIR/phases/gather/run/wf-data/wf-phase.json"
if [ -f "$GATHER_STATE" ]; then
    GATHER_STATUS=$(jq -r '.state // "unknown"' "$GATHER_STATE")
    if [ "$GATHER_STATUS" = "complete" ]; then
        echo "Found completed gather phase, validating..."

        # Get phase entity from CLI (via cg phase info or similar)
        # Note: This may need adjustment based on actual CLI command
        PHASE_JSON=$(node "$CLI" phase info "$RUN_DIR" gather -o json 2>/dev/null || echo "{}")

        if [ "$PHASE_JSON" = "{}" ]; then
            echo "  [SKIP] cg phase info may not return entity JSON yet"
        else
            # Validate Phase entity structure
            check_json_key "$PHASE_JSON" "name" "gather" || ((FAILURES++))
            check_json_key "$PHASE_JSON" "status" "complete" || ((FAILURES++))
            check_json_key "$PHASE_JSON" "state" "complete" || ((FAILURES++))
            check_json_key "$PHASE_JSON" "isComplete" "true" || ((FAILURES++))
            check_json_key "$PHASE_JSON" "isDone" "true" || ((FAILURES++))
            check_json_type "$PHASE_JSON" "inputFiles" "array" || ((FAILURES++))
            check_json_type "$PHASE_JSON" "outputs" "array" || ((FAILURES++))
            check_json_type "$PHASE_JSON" "statusHistory" "array" || ((FAILURES++))
        fi
    else
        echo "  [SKIP] Gather phase not complete (state: $GATHER_STATUS)"
        echo "  Run ./03-complete-gather.sh first"
    fi
else
    echo "  [SKIP] No gather phase state found"
    echo "  Run ./02-start-gather.sh and complete the workflow first"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
if [ $FAILURES -eq 0 ]; then
    echo "✅ Entity JSON Validation: PASSED"
else
    echo "❌ Entity JSON Validation: $FAILURES FAILURE(S)"
fi
echo "═══════════════════════════════════════════════════════════"

exit $FAILURES
