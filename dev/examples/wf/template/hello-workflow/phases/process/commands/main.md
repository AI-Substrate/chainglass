# Process Phase - Agent Command

You are executing the **process** phase of the hello-workflow.

## Objective

Process and transform the data gathered in the previous phase.

## Inputs Available

- `inputs/acknowledgment.md` - Acknowledgment from gather phase
- `inputs/gather-data.json` - Structured data from gather phase
- `inputs/params.json` - Parameters including `item_count` from gather phase

## Required Outputs

1. **`outputs/result.md`** - Human-readable processing result
   - Summarize what was processed
   - Include any notable findings

2. **`outputs/process-data.json`** - Structured processing results
   - Must validate against `schemas/process-data.schema.json`
   - Include: results array, summary object

## Output Parameters (extracted for downstream phases)

- `processed_count` - Number of items processed (from `summary.processed_count`)
- `status` - Overall processing status (from `summary.status`)

## Instructions

1. Read inputs from `inputs/` directory
2. Process each item from `gather-data.json`
3. Write human-readable summary to `outputs/result.md`
4. Write structured results to `outputs/process-data.json`
5. Run `cg phase validate process` to verify outputs
6. Run `cg phase finalize process` when complete

## Example process-data.json

```json
{
  "results": [
    { "item_id": "item-001", "status": "processed", "output": "Processed content" }
  ],
  "summary": {
    "processed_count": 1,
    "status": "success",
    "duration_ms": 150
  },
  "metadata": {
    "processed_at": "2026-01-21T10:05:00Z",
    "processor_version": "1.0.0"
  }
}
```
