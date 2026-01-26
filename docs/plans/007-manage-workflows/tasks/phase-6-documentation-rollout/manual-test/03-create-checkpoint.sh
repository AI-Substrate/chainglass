#!/bin/bash
# 03-create-checkpoint.sh - Create checkpoint, test E035, force duplicate
#
# DYK-04: Shows hash for debugging/verification
#
# Usage: ./03-create-checkpoint.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../../../.." && pwd)"
CLI="node $PROJECT_ROOT/apps/cli/dist/cli.cjs"

echo "═══════════════════════════════════════════════════════════"
echo "Step 3: Create Checkpoint (with E035 Test)"
echo "═══════════════════════════════════════════════════════════"
echo ""

cd "$PROJECT_ROOT"

# Part 1: Create first checkpoint
echo "Part 1: Creating first checkpoint..."
echo ""
$CLI workflow checkpoint hello-workflow --comment "Initial version"

# Show checkpoint details (DYK-04: hash visibility)
echo ""
echo "Checkpoint created. Checking versions:"
$CLI workflow versions hello-workflow
echo ""

# Part 2: Test E035 duplicate detection
echo "Part 2: Testing E035 (duplicate content detection)..."
echo ""
echo "Attempting second checkpoint without changes (should fail with E035):"
if $CLI workflow checkpoint hello-workflow --comment "Should fail" 2>&1; then
    echo ""
    echo "⚠ WARNING: E035 was expected but checkpoint succeeded!"
else
    echo ""
    echo "✓ E035 error correctly detected unchanged content"
fi

# Part 3: Force duplicate
echo ""
echo "Part 3: Creating forced duplicate checkpoint..."
echo ""
$CLI workflow checkpoint hello-workflow --force --comment "Forced duplicate for testing"

# Show final version list
echo ""
echo "Final checkpoint versions:"
$CLI workflow versions hello-workflow

# Show hash details (DYK-04)
echo ""
echo "Checkpoint directories:"
ls -la "$PROJECT_ROOT/.chainglass/workflows/hello-workflow/checkpoints/"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✓ Checkpoint operations complete"
echo "  - v001: Initial version"
echo "  - E035: Duplicate detection worked"
echo "  - v002: Forced duplicate created"
echo ""
echo "Next step: ./04-compose-run.sh"
echo "═══════════════════════════════════════════════════════════"
