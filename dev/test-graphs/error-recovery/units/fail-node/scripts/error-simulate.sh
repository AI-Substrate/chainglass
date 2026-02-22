#!/bin/bash
# Error simulation script — reports error and exits non-zero
set -e
cg wf node accept "$CG_GRAPH_SLUG" "$CG_NODE_ID" --workspace-path "$CG_WORKSPACE_PATH"
cg wf node error "$CG_GRAPH_SLUG" "$CG_NODE_ID" --code SCRIPT_FAILED --message "Deliberate failure" --workspace-path "$CG_WORKSPACE_PATH"
exit 1
