# Process Phase - Agent Command

You are executing the **process** phase of the hello-workflow.

## Objective

Process and transform the data gathered in the previous phase.

## Directory Structure

```
run/
├── inputs/             # Data from prior phase (gather)
│   ├── files/          # Human-readable content (.md)
│   │   └── acknowledgment.md
│   ├── data/           # Structured JSON data
│   │   └── gather-data.json
│   └── params.json     # Output parameters from gather phase
├── messages/           # Agent ↔ Orchestrator communication (optional Q&A)
│   └── m-001.json      # Agent may ask clarification questions
├── outputs/            # Your output files
│   ├── result.md
│   └── process-data.json
└── wf-data/            # Workflow metadata (managed by CLI)
    ├── wf-phase.json   # Phase state tracking
    └── output-params.json  # Extracted parameters (on finalize)
```

> **inputs/ Directory Split**: Human-readable files (`.md`) go in `files/`, structured data (`.json`) goes in `data/`. This separation helps agents quickly identify content type.

## Inputs Available

- `inputs/files/acknowledgment.md` - Acknowledgment from gather phase
- `inputs/data/gather-data.json` - Structured data from gather phase
- `inputs/params.json` - Parameters: `{item_count, request_type}` from gather phase

## Messages (Optional)

The process phase may optionally ask the orchestrator for clarification:

- `messages/m-001.json` - Optional agent question about output format preference
  - Type: `multi_choice`
  - From: `agent` (you create this if needed)
  - Options: Summary only | Detailed only | Both

If you need clarification on output format, create a message and wait for the orchestrator's response before continuing.

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

1. Read inputs from `inputs/files/` and `inputs/data/` directories
2. Read parameters from `inputs/params.json`
3. (Optional) If format clarification needed, create message in `messages/`
4. Process each item from `inputs/data/gather-data.json`
5. Write human-readable summary to `outputs/result.md`
6. Write structured results to `outputs/process-data.json`
7. Run `cg phase validate process` to verify outputs
8. Run `cg phase finalize process` when complete

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
