#!/bin/bash
# 07-validate-runs.sh - Validate cg runs commands
#
# Per Phase 6: Manual Test Harness with cg agent CLI
# Validates that cg runs list/get return proper entity JSON.
#
# Tests:
# 1. cg runs list (table format)
# 2. cg runs list -o json
# 3. cg runs get <run-id> --workflow <slug> (table format)
# 4. cg runs get <run-id> --workflow <slug> -o json
#
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
CLI="$PROJECT_ROOT/apps/cli/dist/cli.cjs"

echo "=============================================="
echo "Manual Test Harness: Validate Runs Commands"
echo "=============================================="
echo ""

# Load current run
if [ ! -f "$SCRIPT_DIR/.current-run" ]; then
    echo "ERROR: No current run. Run ./02-compose-run.sh first"
    exit 1
fi
RUN_DIR=$(cat "$SCRIPT_DIR/.current-run")

# Extract run-id from directory, workflow slug from wf.yaml
RUN_ID=$(basename "$RUN_DIR")
WORKFLOW_SLUG=$(grep "^name:" "$RUN_DIR/wf.yaml" | sed 's/name: *//')

echo "Run directory: $RUN_DIR"
echo "Run ID: $RUN_ID"
echo "Workflow: $WORKFLOW_SLUG"
echo ""

FAILURES=0

# Change to project root for cg commands (they use relative .chainglass paths)
cd "$PROJECT_ROOT"

echo "----------------------------------------------"
echo "Test 1: cg runs list (all workflows)"
echo "----------------------------------------------"
echo ""

LIST_OUTPUT=$(node "$CLI" runs list 2>&1 || echo "COMMAND_FAILED")

if [ "$LIST_OUTPUT" = "COMMAND_FAILED" ]; then
    echo "  [FAIL] cg runs list command failed"
    ((FAILURES++))
else
    echo "$LIST_OUTPUT"
    echo ""
    echo "  [OK] Command executed successfully"
fi

echo ""
echo "----------------------------------------------"
echo "Test 2: cg runs list --workflow $WORKFLOW_SLUG"
echo "----------------------------------------------"
echo ""

LIST_OUTPUT=$(node "$CLI" runs list --workflow "$WORKFLOW_SLUG" 2>&1 || echo "COMMAND_FAILED")

if [ "$LIST_OUTPUT" = "COMMAND_FAILED" ]; then
    echo "  [FAIL] cg runs list --workflow command failed"
    ((FAILURES++))
else
    echo "$LIST_OUTPUT"
    echo ""
    echo "  [OK] Command executed successfully"
fi

echo ""
echo "----------------------------------------------"
echo "Test 3: cg runs list -o json"
echo "----------------------------------------------"
echo ""

LIST_JSON=$(node "$CLI" runs list --workflow "$WORKFLOW_SLUG" -o json 2>&1 || echo "[]")

# Check if it's valid JSON array
if ! echo "$LIST_JSON" | jq -e 'type == "array"' > /dev/null 2>&1; then
    echo "  [FAIL] cg runs list -o json did not return array"
    echo "  Got: $LIST_JSON"
    ((FAILURES++))
else
    RUN_COUNT=$(echo "$LIST_JSON" | jq 'length')
    echo "  [OK] Found $RUN_COUNT run(s)"

    # Check that runs have expected entity properties
    if [ "$RUN_COUNT" -gt 0 ]; then
        FIRST_RUN=$(echo "$LIST_JSON" | jq '.[0]')
        echo ""
        echo "First run entity preview:"

        # Check for isRun property (entity indicator)
        IS_RUN=$(echo "$FIRST_RUN" | jq -r '.isRun // "missing"')
        SLUG=$(echo "$FIRST_RUN" | jq -r '.slug // "missing"')
        SOURCE=$(echo "$FIRST_RUN" | jq -r '.source // "missing"')

        echo "  slug: $SLUG"
        echo "  source: $SOURCE"
        echo "  isRun: $IS_RUN"

        if [ "$IS_RUN" = "true" ]; then
            echo "  [OK] Entity format detected"
        elif [ "$IS_RUN" = "missing" ]; then
            echo "  [WARN] isRun not present (may be DTO format)"
        else
            echo "  [FAIL] isRun: $IS_RUN (expected true)"
            ((FAILURES++))
        fi
    fi
fi

echo ""
echo "----------------------------------------------"
echo "Test 4: cg runs get $RUN_ID --workflow $WORKFLOW_SLUG"
echo "----------------------------------------------"
echo ""

GET_OUTPUT=$(node "$CLI" runs get "$RUN_ID" --workflow "$WORKFLOW_SLUG" 2>&1 || echo "COMMAND_FAILED")

if [ "$GET_OUTPUT" = "COMMAND_FAILED" ]; then
    echo "  [FAIL] cg runs get command failed"
    ((FAILURES++))
else
    echo "$GET_OUTPUT"
    echo ""
    echo "  [OK] Command executed successfully"
fi

echo ""
echo "----------------------------------------------"
echo "Test 5: cg runs get $RUN_ID --workflow $WORKFLOW_SLUG -o json"
echo "----------------------------------------------"
echo ""

GET_JSON=$(node "$CLI" runs get "$RUN_ID" --workflow "$WORKFLOW_SLUG" -o json 2>&1 || echo "{\"error\": true}")

if echo "$GET_JSON" | jq -e '.error' > /dev/null 2>&1; then
    echo "  [FAIL] cg runs get -o json failed"
    echo "  Output: $GET_JSON"
    ((FAILURES++))
else
    echo "  [OK] cg runs get returned JSON"

    # Validate key entity properties
    SLUG=$(echo "$GET_JSON" | jq -r '.slug // "missing"')
    SOURCE=$(echo "$GET_JSON" | jq -r '.source // "missing"')
    IS_RUN=$(echo "$GET_JSON" | jq -r '.isRun // "missing"')
    PHASES_COUNT=$(echo "$GET_JSON" | jq '.phases | length')

    echo ""
    echo "Entity properties:"
    echo "  slug: $SLUG"
    echo "  source: $SOURCE"
    echo "  isRun: $IS_RUN"
    echo "  phases: $PHASES_COUNT"

    if [ "$SOURCE" = "run" ] && [ "$IS_RUN" = "true" ]; then
        echo ""
        echo "  [OK] Correct entity format for run"
    else
        echo ""
        echo "  [WARN] May not be full entity format yet"
    fi
fi

echo ""
echo "=============================================="
if [ $FAILURES -eq 0 ]; then
    echo "Runs Commands Validation: PASSED"
else
    echo "Runs Commands Validation: $FAILURES FAILURE(S)"
fi
echo "=============================================="

exit $FAILURES
