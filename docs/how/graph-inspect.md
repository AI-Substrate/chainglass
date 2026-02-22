# Graph Inspect CLI

Dump the complete state of any workflow graph — every node's status, timing, inputs, outputs, and events.

## Quick Start

```bash
# Full graph dump
cg wf inspect <slug>

# One-liner summary
cg wf inspect <slug> --compact

# Machine-readable
cg wf inspect <slug> --json
```

If the graph is in a non-default workspace (e.g., from `just test-advanced-pipeline`):

```bash
cg wf inspect <slug> --workspace-path /tmp/tg-advanced-pipeline-XXXX
```

## Output Modes

### Default — Full Graph Dump

```bash
cg wf inspect advanced-pipeline
```

Shows topology header, then per-node sections with unit type, status, timing, input wiring, and output values (truncated at 60 chars).

```
Graph: advanced-pipeline
Status: complete
Updated: 2026-02-22T05:03:21Z

─────────────────────────────────────────
  Line 0: ✅ human-input-4a1
  Line 1: ✅ spec-writer-525
  Line 2: ✅ programmer-a-088 │ ✅ programmer-b-3e6
  Line 3: ✅ reviewer-4cd → ✅ summariser-670
  Progress: 6/6 complete
─────────────────────────────────────────

━━━ spec-writer-525 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Unit:     spec-writer (agent)
  Status:   complete
  Started:  2026-02-22T05:01:04Z
  Ended:    2026-02-22T05:01:55Z  (51s)
  Inputs:
    requirements ← human-input-4a1/requirements  ✓
  Outputs:
    language_1 = "python"
    language_2 = "go"
    spec = "Build a CLI tool in Python and Go that converts CSV files to…" (127 chars)
```

### `--compact` — One Line Per Node

```bash
cg wf inspect advanced-pipeline --compact
```

Groups nodes by line. Uses `│` for parallel nodes, `→` for serial.

```
Graph: advanced-pipeline (complete) — 6/6 nodes

  Line 0: ✅ human-input-4a1        user-input   3s       1 output
  Line 1: ✅ spec-writer-525        agent        51s      3 outputs  (Q&A: 1 question)
  Line 2: ✅ programmer-a-088       agent        32s      3 outputs  (parallel, noContext)
          │ ✅ programmer-b-3e6       agent        32s      3 outputs  (parallel, noContext)
  Line 3: ✅ reviewer-4cd           agent        32s      4 outputs
          → ✅ summariser-670         agent        23s      3 outputs
```

### `--node <id>` — Single Node Deep Dive

```bash
cg wf inspect advanced-pipeline --node spec-writer-525
```

Shows full (untruncated) output values and the complete event log with timestamps and stamp status.

### `--outputs` — Output Data Only

```bash
cg wf inspect advanced-pipeline --outputs
```

Groups outputs by node. String values truncated at 40 chars. Numbers shown as-is.

```
Graph: advanced-pipeline (complete)

spec-writer-525:
  language_1 = "python"
  language_2 = "go"
  spec = "Build a CLI tool in Python and Go that c…" (127 chars)

reviewer-4cd:
  review_a = "Looks good"
  review_b = "Looks good"
```

### `--json` — Machine-Readable

```bash
cg wf inspect advanced-pipeline --json
```

Returns the full `InspectResult` wrapped in a `CommandResponse` envelope. All values untruncated, all events included.

```json
{
  "success": true,
  "command": "wf.inspect",
  "data": {
    "graphSlug": "advanced-pipeline",
    "graphStatus": "complete",
    "totalNodes": 6,
    "completedNodes": 6,
    "nodes": [...]
  }
}
```

## Live Watching

Watch a running pipeline update every 2 seconds:

```bash
watch -n 2 'cg wf inspect <slug> --compact --workspace-path <path> 2>&1 | grep -v "^{\"level"'
```

The `grep -v` strips JSON log noise from workspace resolution.

## jq Recipes

```bash
# List all node IDs
cg wf inspect <slug> --json | jq '.data.nodes[].nodeId'

# Find failed nodes
cg wf inspect <slug> --json | jq '.data.nodes[] | select(.status == "blocked-error") | {nodeId, error}'

# Get a specific node's outputs
cg wf inspect <slug> --json | jq '.data.nodes[] | select(.nodeId == "spec-writer-525") | .outputs'

# Count outputs per node
cg wf inspect <slug> --json | jq '.data.nodes[] | {nodeId, outputCount}'

# Check completion status
cg wf inspect <slug> --json | jq '{status: .data.graphStatus, done: .data.completedNodes, total: .data.totalNodes}'

# List nodes with questions
cg wf inspect <slug> --json | jq '.data.nodes[] | select(.questions | length > 0) | {nodeId, questions}'
```

## Status Glyphs

| Glyph | Status |
|-------|--------|
| ✅ | Complete |
| ❌ | Error (blocked) |
| 🔶 | Starting / Agent accepted |
| ⏸️ | Waiting question / Restart pending |
| ⬜ | Ready to start |
| ⚪ | Pending (dependencies not met) |

## Relationship to Other Commands

| Command | Purpose | Detail Level |
|---------|---------|-------------|
| `cg wf status <slug>` | Dashboard | Glyphs + progress. No data. |
| `cg wf inspect <slug>` | Full dump | Everything: status, timing, inputs, outputs, events |
| `cg wf inspect <slug> --compact` | Quick check | One line per node |
| `cg wf node collate <slug> <id>` | Agent-facing | Input availability for a specific node |
