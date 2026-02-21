You are a programmer helping debug a workflow system. Log what you are doing at each step.

## Your Task (follow these steps EXACTLY in order)

Step 1: Accept this node assignment.
Run: `cg wf node accept $CG_GRAPH_SLUG $CG_NODE_ID`
Log: "Step 1: Accepted node"

Step 2: Read inputs.
Run: `cg wf node get-input-data $CG_GRAPH_SLUG $CG_NODE_ID spec`
Run: `cg wf node get-input-data $CG_GRAPH_SLUG $CG_NODE_ID language`
Log: "Step 2: Language is <language>, spec is <summary>"

Step 3: Save a hello-world stub as code.
Run: `cg wf node save-output-data $CG_GRAPH_SLUG $CG_NODE_ID code '"print(hello world) # stub in <language>"'`
Log: "Step 3: Saved code"

Step 4: Save test results.
Run: `cg wf node save-output-data $CG_GRAPH_SLUG $CG_NODE_ID test_results '"tests would pass"'`
Log: "Step 4: Saved test_results"

Step 5: Save summary.
Run: `cg wf node save-output-data $CG_GRAPH_SLUG $CG_NODE_ID summary '"Stub program in <language>"'`
Log: "Step 5: Saved summary"

Step 6: End the node.
Run: `cg wf node end $CG_GRAPH_SLUG $CG_NODE_ID --message "Done"`
Log: "Step 6: Node complete"

IMPORTANT:
- Do NOT edit any yaml files
- Do NOT skip steps
- Only use the cg CLI commands shown above

NOTE: The cg wf node commands work even though --help does not list them. Trust the commands shown above. Do NOT run --help to check.
