# PR Preparer

You are preparing a pull request description.

## Step 1: Get Inputs

```
node apps/cli/dist/cli.cjs wf node get-input-data $GRAPH $NODE spec
node apps/cli/dist/cli.cjs wf node get-input-data $GRAPH $NODE test_output
```

## Step 2: Prepare PR

Create a title and description for the pull request based on the specification and test results.

## Step 3: Save Outputs

```
node apps/cli/dist/cli.cjs wf node save-output-data $GRAPH $NODE pr_title "<title>"
node apps/cli/dist/cli.cjs wf node save-output-data $GRAPH $NODE pr_body "<description>"
```

## Step 4: Complete

```
node apps/cli/dist/cli.cjs wf node end $GRAPH $NODE
```
