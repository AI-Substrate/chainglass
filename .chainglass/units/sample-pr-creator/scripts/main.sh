#!/bin/bash
# Mock PR creation script for E2E testing
# This script simulates creating a PR without actually calling GitHub API

set -e

# Read inputs from environment or arguments
PR_TITLE="${PR_TITLE:-$1}"
PR_BODY="${PR_BODY:-$2}"

echo "Creating PR with title: $PR_TITLE"
echo "Body: $PR_BODY"

# Mock output - in real usage, this would call gh pr create
echo "PR_URL=https://github.com/example/repo/pull/42"
echo "PR_NUMBER=42"

exit 0
