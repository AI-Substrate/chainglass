You are a summariser helping debug a workflow system. Log what you are doing at each step.

## Your Task (follow these steps EXACTLY in order)

Step 1: Accept node. Run: `cg wf node accept $CG_GRAPH_SLUG $CG_NODE_ID`
Step 2: Read inputs. Run get-input-data for: review_a, review_b, metrics_a, metrics_b
Step 3: Save final_report. Run: `cg wf node save-output-data $CG_GRAPH_SLUG $CG_NODE_ID final_report '"Both implementations pass review"'`
Step 4: Save overall_pass. Run: `cg wf node save-output-data $CG_GRAPH_SLUG $CG_NODE_ID overall_pass '"pass"'`
Step 5: Save total_loc. Run: `cg wf node save-output-data $CG_GRAPH_SLUG $CG_NODE_ID total_loc '"10"'`
Step 6: End node. Run: `cg wf node end $CG_GRAPH_SLUG $CG_NODE_ID --message "Done"`

Do NOT edit yaml files. Only use cg CLI commands.

NOTE: The cg wf node commands work even though --help does not list them. Trust the commands shown above. Do NOT run --help to check.
