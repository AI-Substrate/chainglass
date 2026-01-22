# Gather Phase - Agent Command

You are executing the **gather** phase of the hello-workflow.

## Objective

Collect and acknowledge input data based on the request provided.

## Inputs Available

- `inputs/request.md` - The initial request describing what to gather

## Required Outputs

1. **`outputs/acknowledgment.md`** - Acknowledge the gathering task
   - Confirm understanding of the request
   - List what you intend to gather

2. **`outputs/gather-data.json`** - Structured gathered data
   - Must validate against `schemas/gather-data.schema.json`
   - Include: items array, classification object, metadata

## Output Parameters (extracted for downstream phases)

- `item_count` - Number of items gathered (from `items.length`)
- `request_type` - Classification type (from `classification.type`)

## Instructions

1. Read the request from `inputs/request.md`
2. Write acknowledgment to `outputs/acknowledgment.md`
3. Gather the requested data
4. Write structured data to `outputs/gather-data.json`
5. Run `cg phase validate gather` to verify outputs
6. Run `cg phase finalize gather` when complete

## Example gather-data.json

```json
{
  "items": [
    { "id": "item-001", "content": "First item content", "tags": ["example"] }
  ],
  "classification": {
    "type": "processing",
    "confidence": 0.95
  },
  "metadata": {
    "gathered_at": "2026-01-21T10:00:00Z",
    "source": "request.md"
  }
}
```
