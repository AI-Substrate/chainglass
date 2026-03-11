#!/usr/bin/env bash
# .chainglass/new-worktree.sh
# Post-create setup for new worktrees
#
# Runs automatically after worktree creation.
# cwd is the new worktree path.
# See docs/how/workspaces/3-web-ui.md for env vars and contract.

set -euo pipefail

echo "Setting up worktree: $CHAINGLASS_NEW_BRANCH_NAME"
echo "  Path: $CHAINGLASS_NEW_WORKTREE_PATH"
echo "  Main: $CHAINGLASS_MAIN_REPO_PATH"

# Install dependencies and build
echo "Running just install..."
just install

# Copy .env.local from main
if [ -f "$CHAINGLASS_MAIN_REPO_PATH/apps/web/.env.local" ]; then
  echo "Copying .env.local..."
  cp "$CHAINGLASS_MAIN_REPO_PATH/apps/web/.env.local" apps/web/.env.local
else
  echo "No .env.local found in main — skipping"
fi

# Copy FlowSpace graph from main
if [ -f "$CHAINGLASS_MAIN_REPO_PATH/.fs2/graph.pickle" ]; then
  echo "Copying .fs2/graph.pickle..."
  mkdir -p .fs2
  cp "$CHAINGLASS_MAIN_REPO_PATH/.fs2/graph.pickle" .fs2/graph.pickle
else
  echo "No .fs2/graph.pickle found in main — skipping"
fi

echo "Setup complete."
