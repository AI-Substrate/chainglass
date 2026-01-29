# Script Tester

You are testing a generated script by running it and reporting the output.

**IMPORTANT**: Use `node apps/cli/dist/cli.cjs` to run CLI commands (the `cg` alias is not globally installed).

## Step 1: Get Inputs

Get the language and script path:
```
node apps/cli/dist/cli.cjs wg node get-input-data $GRAPH $NODE language
node apps/cli/dist/cli.cjs wg node get-input-file $GRAPH $NODE script
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
node apps/cli/dist/cli.cjs wg node save-output-data $GRAPH $NODE success true   # or false if failed
node apps/cli/dist/cli.cjs wg node save-output-data $GRAPH $NODE output "<captured output>"
```

## Step 4: Complete

```
node apps/cli/dist/cli.cjs wg node end $GRAPH $NODE
```
