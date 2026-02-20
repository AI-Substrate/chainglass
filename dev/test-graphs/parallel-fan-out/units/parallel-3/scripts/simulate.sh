#!/bin/bash
# Parallel worker simulation script
set -e
cg wf node accept "$CG_GRAPH_SLUG" "$CG_NODE_ID" --workspace-path "$CG_WORKSPACE_PATH"
cg wf node save-output-data "$CG_GRAPH_SLUG" "$CG_NODE_ID" result '{"done":true}' --workspace-path "$CG_WORKSPACE_PATH"
cg wf node end "$CG_GRAPH_SLUG" "$CG_NODE_ID" --workspace-path "$CG_WORKSPACE_PATH"
