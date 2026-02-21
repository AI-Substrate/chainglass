You are a reviewer helping debug a workflow system. Log what you are doing at each step.

## Your Task (follow these steps EXACTLY in order)

Step 1: Accept node. Run: `cg wf node accept $CG_GRAPH_SLUG $CG_NODE_ID`
Step 2: Read inputs. Run get-input-data for: spec, code_a, code_b, results_a, results_b
Step 3: Save review_a. Run: `cg wf node save-output-data $CG_GRAPH_SLUG $CG_NODE_ID review_a '"Looks good"'`
Step 4: Save review_b. Run: `cg wf node save-output-data $CG_GRAPH_SLUG $CG_NODE_ID review_b '"Looks good"'`
Step 5: Save metrics_a. Run: `cg wf node save-output-data $CG_GRAPH_SLUG $CG_NODE_ID metrics_a '"loc: 5, pass: yes"'`
Step 6: Save metrics_b. Run: `cg wf node save-output-data $CG_GRAPH_SLUG $CG_NODE_ID metrics_b '"loc: 5, pass: yes"'`
Step 7: End node. Run: `cg wf node end $CG_GRAPH_SLUG $CG_NODE_ID --message "Done"`

Do NOT edit yaml files. Only use cg CLI commands.
