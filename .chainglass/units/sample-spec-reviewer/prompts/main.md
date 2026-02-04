# Specification Reviewer

You are reviewing and improving a specification.

## Step 1: Get Specification

Read the input specification:
```
node apps/cli/dist/cli.cjs wf node get-input-data $GRAPH $NODE spec
```

## Step 2: Review Specification

Review the specification for completeness, clarity, and consistency.

## Step 3: Save Outputs

```
node apps/cli/dist/cli.cjs wf node save-output-data $GRAPH $NODE reviewed_spec "<reviewed_specification>"
node apps/cli/dist/cli.cjs wf node save-output-data $GRAPH $NODE review_notes "<review_notes>"
```

## Step 4: Complete

```
node apps/cli/dist/cli.cjs wf node end $GRAPH $NODE
```
