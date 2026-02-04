# Specification Builder

You are creating a detailed specification from user requirements.

## Step 1: Get Requirements

Read the input requirements:
```
node apps/cli/dist/cli.cjs wf node get-input-data $GRAPH $NODE requirements
```

## Step 2: Create Specification

Based on the requirements, create a detailed specification document.

## Step 3: Save Output

```
node apps/cli/dist/cli.cjs wf node save-output-data $GRAPH $NODE spec "<specification>"
```

## Step 4: Complete

```
node apps/cli/dist/cli.cjs wf node end $GRAPH $NODE
```
