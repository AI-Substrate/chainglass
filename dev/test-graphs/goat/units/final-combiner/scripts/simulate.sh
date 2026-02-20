#!/bin/bash
# Standard simulation: accept, save output, complete
set -e
cg wf node accept "$CG_GRAPH_SLUG" "$CG_NODE_ID" --workspace-path "$CG_WORKSPACE_PATH"
cg wf node save-output-data "$CG_GRAPH_SLUG" "$CG_NODE_ID" combined '{"done":true,"by":"'$CG_NODE_ID'"}' --workspace-path "$CG_WORKSPACE_PATH"
cg wf node end "$CG_GRAPH_SLUG" "$CG_NODE_ID" --workspace-path "$CG_WORKSPACE_PATH"
