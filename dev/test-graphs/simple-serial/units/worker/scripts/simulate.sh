#!/bin/bash
# simple-serial worker simulation script
# Accepts the node, saves output, and completes via CLI commands
set -e

cg wf node accept "$CG_GRAPH_SLUG" "$CG_NODE_ID" --workspace-path "$CG_WORKSPACE_PATH"
cg wf node save-output-data "$CG_GRAPH_SLUG" "$CG_NODE_ID" result '{"done":true}' --workspace-path "$CG_WORKSPACE_PATH"
cg wf node end "$CG_GRAPH_SLUG" "$CG_NODE_ID" --workspace-path "$CG_WORKSPACE_PATH"
