#!/bin/bash
# 01-clean-slate.sh - Start from absolute nothing
#
# DYK-02: Also clears .current-run to avoid stale references
#
# Usage: ./01-clean-slate.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../../../.." && pwd)"

echo "═══════════════════════════════════════════════════════════"
echo "Step 1: Clean Slate"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Remove .chainglass directory if it exists
if [ -d "$PROJECT_ROOT/.chainglass" ]; then
    echo "Removing $PROJECT_ROOT/.chainglass/"
    rm -rf "$PROJECT_ROOT/.chainglass"
    echo "✓ .chainglass/ removed"
else
    echo "✓ .chainglass/ does not exist (already clean)"
fi

# DYK-02: Clear .current-run to avoid stale references
if [ -f "$SCRIPT_DIR/.current-run" ]; then
    echo "Clearing .current-run"
    rm -f "$SCRIPT_DIR/.current-run"
    echo "✓ .current-run cleared"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✓ Clean slate complete"
echo ""
echo "Next step: ./02-init-project.sh"
echo "═══════════════════════════════════════════════════════════"
