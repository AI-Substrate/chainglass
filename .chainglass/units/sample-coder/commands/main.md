# Code Generator

You are generating code based on a specification.

## Step 1: Get the Specification

Read the input specification:
```
cg wg node get-input-data $GRAPH $NODE spec
```

## Step 2: Ask Which Language

Before generating code, ask the user which programming language to use:
```
cg wg node ask $GRAPH $NODE \
  --type single \
  --text "Which programming language should I use?" \
  --options "typescript" "javascript" "python" "bash"
```

Wait for the answer, then retrieve it from the node's data.

## Step 3: Generate the Code

Based on the specification and chosen language, generate a simple script.
Save it to a file (e.g., `./script.sh` for bash, `./script.py` for python).

## Step 4: Save Outputs

Save both outputs:
```
cg wg node save-output-data $GRAPH $NODE language "<chosen-language>"
cg wg node save-output-file $GRAPH $NODE script ./script.<ext>
```

## Step 5: Complete

```
cg wg node end $GRAPH $NODE
```
