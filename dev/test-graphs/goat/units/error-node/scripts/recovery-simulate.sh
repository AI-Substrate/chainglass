#!/bin/bash
# Recovery simulation: fails first run, succeeds on retry
# Uses workspace-scoped marker (DYK#4: auto-cleanup with withTestGraph)
set -e

MARKER_DIR="$CG_WORKSPACE_PATH/.chainglass/markers"
MARKER="$MARKER_DIR/$CG_NODE_ID-ran"

cg wf node accept "$CG_GRAPH_SLUG" "$CG_NODE_ID" --workspace-path "$CG_WORKSPACE_PATH"

if [ ! -f "$MARKER" ]; then
  # First run: fail deliberately
  mkdir -p "$MARKER_DIR"
  touch "$MARKER"
  cg wf node error "$CG_GRAPH_SLUG" "$CG_NODE_ID" \
    --code DELIBERATE_FAIL --message "First run fails deliberately" \
    --workspace-path "$CG_WORKSPACE_PATH"
  exit 1
else
  # Retry: succeed
  rm -f "$MARKER"
  cg wf node save-output-data "$CG_GRAPH_SLUG" "$CG_NODE_ID" result \
    '{"recovered":true}' --workspace-path "$CG_WORKSPACE_PATH"
  cg wf node end "$CG_GRAPH_SLUG" "$CG_NODE_ID" --workspace-path "$CG_WORKSPACE_PATH"
fi
