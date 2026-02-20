#!/bin/bash
# Question simulation: asks question first run, completes on second run
# Uses workspace-scoped marker (DYK#2: avoids questionId lookup, DYK#4: auto-cleanup)
set -e

MARKER_DIR="$CG_WORKSPACE_PATH/.chainglass/markers"
MARKER="$MARKER_DIR/$CG_NODE_ID-asked"

cg wf node accept "$CG_GRAPH_SLUG" "$CG_NODE_ID" --workspace-path "$CG_WORKSPACE_PATH"

if [ ! -f "$MARKER" ]; then
  # First run: ask question and pause
  mkdir -p "$MARKER_DIR"
  cg wf node ask "$CG_GRAPH_SLUG" "$CG_NODE_ID" \
    --type text --text "What colour should the widget be?" \
    --workspace-path "$CG_WORKSPACE_PATH"
  touch "$MARKER"
  exit 0
else
  # Second run (after answer + restart): complete
  rm -f "$MARKER"
  cg wf node save-output-data "$CG_GRAPH_SLUG" "$CG_NODE_ID" result \
    '{"answer":"blue","completed":true}' --workspace-path "$CG_WORKSPACE_PATH"
  cg wf node end "$CG_GRAPH_SLUG" "$CG_NODE_ID" --workspace-path "$CG_WORKSPACE_PATH"
fi
