#!/bin/bash
# 06-validate-entity.sh - Validate entity JSON format
#
# Per Phase 6: Manual Test Harness with cg agent CLI
# Validates that entities returned by CLI match expected JSON structure.
#
# Tests:
# 1. Workflow entity JSON from cg runs get
# 2. Phase entity JSON from completed phases
#
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
CLI="$PROJECT_ROOT/apps/cli/dist/cli.cjs"

echo "=============================================="
echo "Manual Test Harness: Validate Entity JSON"
echo "=============================================="
echo ""

# Load current run
if [ ! -f "$SCRIPT_DIR/.current-run" ]; then
    echo "ERROR: No current run. Run ./02-compose-run.sh first"
    exit 1
fi
RUN_DIR=$(cat "$SCRIPT_DIR/.current-run")

# Extract run-id and workflow slug from run directory
# Run dir format: /path/to/runs/hello-workflow/run-YYYYMMDD-HHMMSS-XXX
RUN_ID=$(basename "$RUN_DIR")
WORKFLOW_SLUG=$(basename "$(dirname "$RUN_DIR")")

echo "Run directory: $RUN_DIR"
echo "Run ID: $RUN_ID"
echo "Workflow: $WORKFLOW_SLUG"
echo ""

FAILURES=0

# Helper function to check JSON key exists
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

echo "----------------------------------------------"
echo "Test 1: Workflow Entity JSON (from cg runs get)"
echo "----------------------------------------------"
echo ""

# Get workflow entity JSON from run
# Correct syntax: cg runs get <run-id> --workflow <slug> -o json
WORKFLOW_JSON=$(node "$CLI" runs get "$RUN_ID" --workflow "$WORKFLOW_SLUG" -o json 2>/dev/null || echo "{\"error\": true}")

if echo "$WORKFLOW_JSON" | jq -e '.error' > /dev/null 2>&1; then
    echo "  [FAIL] cg runs get command failed"
    echo "  Command: cg runs get $RUN_ID --workflow $WORKFLOW_SLUG -o json"
    ((FAILURES++))
else
    echo "Validating Workflow entity structure..."

    # Check required keys for run workflow
    check_json_key "$WORKFLOW_JSON" "slug" "$WORKFLOW_SLUG" || ((FAILURES++))
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
echo "----------------------------------------------"
echo "Test 2: Phase Entity JSON (from completed phase)"
echo "----------------------------------------------"
echo ""

# Check for completed gather phase
GATHER_STATE="$RUN_DIR/phases/gather/run/wf-data/wf-phase.json"
if [ -f "$GATHER_STATE" ]; then
    GATHER_STATUS=$(jq -r '.state // "unknown"' "$GATHER_STATE")
    if [ "$GATHER_STATUS" = "complete" ]; then
        echo "Found completed gather phase, validating..."

        # Read phase entity directly from state file
        PHASE_JSON=$(cat "$GATHER_STATE")

        # Validate Phase entity structure
        check_json_key "$PHASE_JSON" "name" "gather" || ((FAILURES++))
        check_json_key "$PHASE_JSON" "state" "complete" || ((FAILURES++))
        check_json_type "$PHASE_JSON" "statusHistory" "array" || ((FAILURES++))
    else
        echo "  [SKIP] Gather phase not complete (state: $GATHER_STATUS)"
        echo "  Run ./03-run-gather.sh to complete"
    fi
else
    echo "  [SKIP] No gather phase state found"
    echo "  Run ./03-run-gather.sh first"
fi

echo ""
echo "=============================================="
if [ $FAILURES -eq 0 ]; then
    echo "Entity Validation: PASSED"
else
    echo "Entity Validation: $FAILURES FAILURE(S)"
fi
echo ""
echo "Next: ./07-validate-runs.sh"
echo "=============================================="

exit $FAILURES
