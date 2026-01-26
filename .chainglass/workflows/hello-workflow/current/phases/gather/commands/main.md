# Gather Phase - Agent Command

You are executing the **gather** phase of the hello-workflow.

## Objective

Collect and acknowledge input data based on the user's request.

## Directory Structure

```
run/
├── messages/           # Agent ↔ Orchestrator communication
│   └── m-001.json      # User's initial request (free_text)
├── outputs/            # Your output files
│   ├── acknowledgment.md
│   └── gather-data.json
└── wf-data/            # Workflow metadata (managed by CLI)
    ├── wf-phase.json   # Phase state tracking
    └── output-params.json  # Extracted parameters (on finalize)
```

> **Note**: The gather phase has no `inputs/` directory. User input is provided via the messages system (`messages/m-001.json`), not via files.

## Messages Available

- `messages/m-001.json` - The user's initial request describing what to accomplish in this workflow
  - Type: `free_text`
  - From: `orchestrator`
  - Contains the user's natural language request

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

1. Read the user's request from `messages/m-001.json`
2. Write acknowledgment to `outputs/acknowledgment.md`
3. Gather the requested data
4. Write structured data to `outputs/gather-data.json`
5. Run `cg phase validate gather --run-dir <path_to_run> --check outputs` to verify outputs
6. Run `cg phase finalize gather --run-dir <path_to_run>` when complete

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
    "source": "messages/m-001.json"
  }
}
```
