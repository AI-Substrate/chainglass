# PR Preparer

You are preparing a pull request description.

## Step 1: Get Inputs

```
node apps/cli/dist/cli.cjs wf node get-input-file $GRAPH $NODE code
node apps/cli/dist/cli.cjs wf node get-input-data $GRAPH $NODE spec
```

## Step 2: Prepare PR

Create a title and description for the pull request.

## Step 3: Save Outputs

```
node apps/cli/dist/cli.cjs wf node save-output-data $GRAPH $NODE pr_title "<title>"
node apps/cli/dist/cli.cjs wf node save-output-data $GRAPH $NODE pr_description "<description>"
```

## Step 4: Complete

```
node apps/cli/dist/cli.cjs wf node end $GRAPH $NODE
```
