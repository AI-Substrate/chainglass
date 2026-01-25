#!/bin/bash
# 04-compose-run.sh - Compose run from checkpoint, verify versioned path
#
# Saves run directory to .current-run for subsequent scripts
#
# Usage: ./04-compose-run.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../../../.." && pwd)"
CLI="node $PROJECT_ROOT/apps/cli/dist/cli.cjs"

echo "═══════════════════════════════════════════════════════════"
echo "Step 4: Compose Run from Checkpoint"
echo "═══════════════════════════════════════════════════════════"
echo ""

cd "$PROJECT_ROOT"

# Compose new run from latest checkpoint
echo "Composing new run from hello-workflow (latest checkpoint)..."
echo ""
OUTPUT=$($CLI workflow compose hello-workflow --json)
echo "$OUTPUT"

# Extract run directory from JSON output
RUN_DIR=$(echo "$OUTPUT" | jq -r '.data.runDir // .result.runDir // .runDir // empty')

if [ -z "$RUN_DIR" ]; then
    echo ""
    echo "✗ Failed to extract run directory from compose output"
    exit 1
fi

# Save to .current-run for subsequent scripts
echo "$RUN_DIR" > "$SCRIPT_DIR/.current-run"
echo ""
echo "Run directory saved to .current-run:"
cat "$SCRIPT_DIR/.current-run"

# Verify versioned run path structure
echo ""
echo "Verifying versioned run path structure..."
if [[ "$RUN_DIR" == *"/hello-workflow/"* ]] && [[ "$RUN_DIR" == *"/v"* ]]; then
    echo "✓ Run path follows versioned structure: runs/<slug>/<version>/run-*"
else
    echo "⚠ Run path may not follow expected versioned structure"
fi

# Verify wf-status.json has new fields (DYK-05)
echo ""
echo "Verifying wf-status.json metadata:"
WF_STATUS="$RUN_DIR/wf-run/wf-status.json"
if [ -f "$WF_STATUS" ]; then
    SLUG=$(jq -r '.workflow.slug // empty' "$WF_STATUS")
    VERSION_HASH=$(jq -r '.workflow.version_hash // empty' "$WF_STATUS")
    COMMENT=$(jq -r '.workflow.checkpoint_comment // "(no comment)"' "$WF_STATUS")

    echo "  slug: $SLUG"
    echo "  version_hash: $VERSION_HASH"
    echo "  checkpoint_comment: $COMMENT"

    if [ -n "$SLUG" ] && [ -n "$VERSION_HASH" ]; then
        echo "✓ wf-status.json has required version metadata"
    else
        echo "⚠ wf-status.json missing some version metadata"
    fi
else
    echo "✗ wf-status.json not found at $WF_STATUS"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✓ Run composed successfully"
echo ""
echo "Run directory: $RUN_DIR"
echo ""
echo "Next step: ./05-start-gather.sh"
echo "═══════════════════════════════════════════════════════════"
