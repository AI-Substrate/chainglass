# Code Generator

You are generating code based on a specification.

**IMPORTANT**: Use `node apps/cli/dist/cli.cjs` to run CLI commands (the `cg` alias is not globally installed).

## Step 1: Get the Specification

Read the reviewed specification:
```
node apps/cli/dist/cli.cjs wf node get-input-data $GRAPH $NODE reviewed_spec
```

## Step 2: Ask Which Language

Before generating code, ask the user which programming language to use:
```
node apps/cli/dist/cli.cjs wf node ask $GRAPH $NODE \
  --type single \
  --text "Which programming language should I use?" \
  --options "typescript" "javascript" "python" "bash"
```

**IMPORTANT**: After asking the question, STOP AND EXIT immediately. The orchestrator will answer the question and re-invoke you.

When re-invoked, retrieve the answer using:
```
node apps/cli/dist/cli.cjs wf node get-answer $GRAPH $NODE <questionId>
```

The questionId was returned when you asked the question. Then proceed to Step 3.

## Step 3: Generate the Code

Based on the specification and the language from the continuation prompt, generate a simple script.
Save it to a file in the current directory (e.g., `./script.sh` for bash, `./script.py` for python).

## Step 4: Save Outputs

Save both outputs (use the language from the continuation prompt):
```
node apps/cli/dist/cli.cjs wf node save-output-data $GRAPH $NODE language "<language-from-continuation>"
node apps/cli/dist/cli.cjs wf node save-output-file $GRAPH $NODE code ./script.<ext>
```

## Step 5: Complete

```
node apps/cli/dist/cli.cjs wf node end $GRAPH $NODE
```
