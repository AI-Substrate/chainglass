# Specification Alignment Tester

You are testing code alignment with specification.

## Step 1: Get Inputs

```
node apps/cli/dist/cli.cjs wf node get-input-data $GRAPH $NODE spec
node apps/cli/dist/cli.cjs wf node get-input-file $GRAPH $NODE code
```

## Step 2: Test Alignment

Compare the code against the specification and verify it meets all requirements.

## Step 3: Save Outputs

```
node apps/cli/dist/cli.cjs wf node save-output-data $GRAPH $NODE alignment_passed true
node apps/cli/dist/cli.cjs wf node save-output-data $GRAPH $NODE alignment_report "<report>"
```

## Step 4: Complete

```
node apps/cli/dist/cli.cjs wf node end $GRAPH $NODE
```
