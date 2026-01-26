#!/bin/bash
# 01-clean-slate.sh - Reset test environment
#
# Per Phase 6: Manual Test Harness with cg agent CLI
# Removes previous runs and resets state files.
#
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
RUNS_DIR="$PROJECT_ROOT/dev/examples/wf/runs"

echo "=============================================="
echo "Manual Test Harness: Clean Slate"
echo "=============================================="
echo ""

# Remove state files
echo "Removing state files..."
rm -f "$SCRIPT_DIR/.current-run"
rm -f "$SCRIPT_DIR/.current-session"
echo "  [OK] State files removed"

# Remove previous runs
if [ -d "$RUNS_DIR" ]; then
    RUN_COUNT=$(ls -d "$RUNS_DIR"/run-* 2>/dev/null | wc -l)
    if [ "$RUN_COUNT" -gt 0 ]; then
        echo ""
        echo "Removing $RUN_COUNT previous run(s)..."
        rm -rf "$RUNS_DIR"/run-*
        echo "  [OK] Runs removed"
    else
        echo "  [OK] No runs to remove"
    fi
else
    echo "  [OK] Runs directory doesn't exist yet"
fi

echo ""
echo "=============================================="
echo "Environment reset. Next: ./02-compose-run.sh"
echo "=============================================="
