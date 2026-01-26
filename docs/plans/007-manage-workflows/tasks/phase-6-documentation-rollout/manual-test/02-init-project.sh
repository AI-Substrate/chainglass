#!/bin/bash
# 02-init-project.sh - Initialize project with cg init
#
# DYK-01: Exit code check to catch partial init failures
#
# Usage: ./02-init-project.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../../../.." && pwd)"
CLI="node $PROJECT_ROOT/apps/cli/dist/cli.cjs"

echo "═══════════════════════════════════════════════════════════"
echo "Step 2: Initialize Project"
echo "═══════════════════════════════════════════════════════════"
echo ""

echo "Running: cg init"
echo ""

# DYK-01: Exit on failure to catch partial initialization
cd "$PROJECT_ROOT"
if ! $CLI init; then
    echo ""
    echo "✗ cg init failed!"
    echo "  Check build: just build"
    exit 1
fi

echo ""
echo "Verifying structure..."

# Verify workflows directory
if [ -d "$PROJECT_ROOT/.chainglass/workflows" ]; then
    echo "✓ .chainglass/workflows/ created"
else
    echo "✗ .chainglass/workflows/ NOT found!"
    exit 1
fi

# Verify runs directory
if [ -d "$PROJECT_ROOT/.chainglass/runs" ]; then
    echo "✓ .chainglass/runs/ created"
else
    echo "✗ .chainglass/runs/ NOT found!"
    exit 1
fi

# Verify hello-workflow template
if [ -f "$PROJECT_ROOT/.chainglass/workflows/hello-workflow/current/wf.yaml" ]; then
    echo "✓ hello-workflow/current/wf.yaml exists"
else
    echo "✗ hello-workflow template NOT found!"
    exit 1
fi

# Verify workflow.json
if [ -f "$PROJECT_ROOT/.chainglass/workflows/hello-workflow/workflow.json" ]; then
    echo "✓ hello-workflow/workflow.json exists"
else
    echo "✗ workflow.json NOT found!"
    exit 1
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✓ Project initialized"
echo ""
echo "Workflow list:"
$CLI workflow list
echo ""
echo "Next step: ./03-create-checkpoint.sh"
echo "═══════════════════════════════════════════════════════════"
