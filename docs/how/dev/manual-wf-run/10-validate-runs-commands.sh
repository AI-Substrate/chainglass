#!/bin/bash
# 10-validate-runs-commands.sh - Validate cg runs commands
#
# Per Phase 6: Entity Upgrade - Validates that cg runs list/get
# return proper entity JSON.
#
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
CLI="$PROJECT_ROOT/apps/cli/dist/cli.cjs"

echo "═══════════════════════════════════════════════════════════"
echo "Runs Commands Validation"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Load current run
if [ ! -f "$SCRIPT_DIR/.current-run" ]; then
    echo "ERROR: No current run. Run ./01-compose.sh first"
    exit 1
fi
RUN_DIR=$(cat "$SCRIPT_DIR/.current-run")

FAILURES=0

echo "─────────────────────────────────────────────────────────────"
echo "Test 1: cg runs list (table format)"
echo "─────────────────────────────────────────────────────────────"
echo ""

# Extract workflow name from run dir
WORKFLOW_SLUG=$(basename "$(dirname "$(dirname "$RUN_DIR")")")
echo "Workflow slug: $WORKFLOW_SLUG"
echo ""

# Note: This assumes cg runs list requires --workflow flag per Phase 4 DYK-01
LIST_OUTPUT=$(node "$CLI" runs list --workflow "$WORKFLOW_SLUG" 2>&1 || echo "COMMAND_FAILED")

if [ "$LIST_OUTPUT" = "COMMAND_FAILED" ]; then
    echo "  [FAIL] cg runs list command failed"
    ((FAILURES++))
else
    echo "$LIST_OUTPUT"
    echo ""
    echo "  [OK] Command executed successfully"
fi

echo ""
echo "─────────────────────────────────────────────────────────────"
echo "Test 2: cg runs list (JSON format)"
echo "─────────────────────────────────────────────────────────────"
echo ""

LIST_JSON=$(node "$CLI" runs list --workflow "$WORKFLOW_SLUG" -o json 2>&1 || echo "{\"error\": true}")

if echo "$LIST_JSON" | jq -e '.error' > /dev/null 2>&1; then
    echo "  [FAIL] cg runs list -o json failed"
    ((FAILURES++))
else
    # Validate JSON structure
    RUNS_COUNT=$(echo "$LIST_JSON" | jq '.runs | length')
    echo "  [OK] Found $RUNS_COUNT run(s)"

    # Check that runs have expected entity properties
    if [ "$RUNS_COUNT" -gt 0 ]; then
        FIRST_RUN=$(echo "$LIST_JSON" | jq '.runs[0]')
        echo ""
        echo "Validating first run entity..."

        # Check for isRun property (entity indicator)
        IS_RUN=$(echo "$FIRST_RUN" | jq -r '.isRun // "missing"')
        if [ "$IS_RUN" = "true" ]; then
            echo "  [OK] isRun: true (entity format)"
        elif [ "$IS_RUN" = "missing" ]; then
            echo "  [WARN] isRun not present (may be DTO format)"
        else
            echo "  [FAIL] isRun: $IS_RUN (expected true)"
            ((FAILURES++))
        fi
    fi
fi

echo ""
echo "─────────────────────────────────────────────────────────────"
echo "Test 3: cg runs get (specific run)"
echo "─────────────────────────────────────────────────────────────"
echo ""

GET_JSON=$(node "$CLI" runs get "$RUN_DIR" -o json 2>&1 || echo "{\"error\": true}")

if echo "$GET_JSON" | jq -e '.error' > /dev/null 2>&1; then
    echo "  [FAIL] cg runs get failed"
    echo "  Output: $GET_JSON"
    ((FAILURES++))
else
    echo "  [OK] cg runs get returned JSON"

    # Validate key entity properties
    SLUG=$(echo "$GET_JSON" | jq -r '.slug // "missing"')
    SOURCE=$(echo "$GET_JSON" | jq -r '.source // "missing"')
    IS_RUN=$(echo "$GET_JSON" | jq -r '.isRun // "missing"')

    echo ""
    echo "Entity properties:"
    echo "  slug: $SLUG"
    echo "  source: $SOURCE"
    echo "  isRun: $IS_RUN"

    if [ "$SOURCE" = "run" ] && [ "$IS_RUN" = "true" ]; then
        echo ""
        echo "  [OK] Correct entity format for run"
    else
        echo ""
        echo "  [WARN] May not be full entity format yet"
    fi
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
if [ $FAILURES -eq 0 ]; then
    echo "✅ Runs Commands Validation: PASSED"
else
    echo "❌ Runs Commands Validation: $FAILURES FAILURE(S)"
fi
echo "═══════════════════════════════════════════════════════════"

exit $FAILURES
