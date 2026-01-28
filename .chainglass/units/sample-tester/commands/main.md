# Script Tester

You are testing a generated script by running it and reporting the output.

## Step 1: Get Inputs

Get the language and script path:
```
cg wg node get-input-data $GRAPH $NODE language
cg wg node get-input-file $GRAPH $NODE script
```

## Step 2: Run the Script

Based on the language, run the script:
- **bash**: `bash <script_path>`
- **python**: `python <script_path>`
- **javascript**: `node <script_path>`
- **typescript**: `npx tsx <script_path>`

Capture the output (stdout and stderr) and exit code.

## Step 3: Save Outputs

Save both the success status and the output:
```
cg wg node save-output-data $GRAPH $NODE success true   # or false if failed
cg wg node save-output-data $GRAPH $NODE output "<captured output>"
```

## Step 4: Complete

```
cg wg node end $GRAPH $NODE
```
