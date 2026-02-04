# Positional Graph Execution — CLI Reference

This document covers the 12 CLI commands for the execution lifecycle. For graph structure commands (create, add-line, add-node, etc.), see [positional-graph/2-cli-usage.md](../positional-graph/2-cli-usage.md).

All commands are under `cg wf node`. Use `--json` for machine-readable output.

## Node Lifecycle Commands

### Start a node

```bash
cg wf node start <graph> <nodeId>
```

Transitions a node from `pending` to `running`. The node must pass all 4 readiness gates (use `cg wf status <graph> --node <nodeId>` to check).

**Success response:**
```json
{
  "command": "wf.node.start",
  "success": true,
  "nodeId": "spec-builder-a1b",
  "status": "running"
}
```

**Errors:**
- `E170` — Node not ready (check readiness gates)
- `E172` — Node not in `pending` state

---

### Check if node can end

```bash
cg wf node can-end <graph> <nodeId>
```

Checks whether all required outputs have been saved, allowing the node to end. Does not change state.

**Success response:**
```json
{
  "command": "wf.node.can-end",
  "success": true,
  "canEnd": true,
  "missingOutputs": []
}
```

If outputs are missing:
```json
{
  "command": "wf.node.can-end",
  "success": true,
  "canEnd": false,
  "missingOutputs": ["language", "code"]
}
```

**Errors:**
- `E153` — Node not found

---

### End a node

```bash
cg wf node end <graph> <nodeId>
```

Transitions a node from `running` to `complete`. All required outputs must be saved first (use `can-end` to verify).

**Success response:**
```json
{
  "command": "wf.node.end",
  "success": true,
  "nodeId": "spec-builder-a1b",
  "status": "complete"
}
```

**Errors:**
- `E172` — Node not in `running` state
- `E176` — Required outputs missing

---

## Output Storage Commands

### Save output data

```bash
cg wf node save-output-data <graph> <nodeId> <outputName> <valueJson>
```

Saves a JSON value as an output. The node must be in `running` state. Values can be overwritten until the node completes.

```bash
# Save a string
cg wf node save-output-data my-pipeline coder-a1b language '"TypeScript"'

# Save an object
cg wf node save-output-data my-pipeline coder-a1b metadata '{"version": "1.0", "author": "agent"}'

# Save an array
cg wf node save-output-data my-pipeline researcher-b2c findings '["finding1", "finding2"]'
```

**Success response:**
```json
{
  "command": "wf.node.save-output-data",
  "success": true,
  "nodeId": "coder-a1b",
  "output": "language",
  "saved": true
}
```

**Errors:**
- `E176` — Node not in `running` state
- `E160` — Output not declared on WorkUnit

---

### Save output file

```bash
cg wf node save-output-file <graph> <nodeId> <outputName> <sourcePath>
```

Copies a file to the node's data directory. The source file must exist. The node must be in `running` state.

```bash
cg wf node save-output-file my-pipeline coder-a1b code /tmp/generated-code.ts
```

**Success response:**
```json
{
  "command": "wf.node.save-output-file",
  "success": true,
  "nodeId": "coder-a1b",
  "output": "code",
  "savedPath": "/workspace/.chainglass/data/workflows/my-pipeline/nodes/coder-a1b/data/code"
}
```

**Errors:**
- `E176` — Node not in `running` state
- `E160` — Output not declared on WorkUnit
- `E179` — Source file not found

---

### Get output data

```bash
cg wf node get-output-data <graph> <nodeId> <outputName>
```

Retrieves a saved data output value.

```bash
cg wf node get-output-data my-pipeline coder-a1b language
```

**Success response:**
```json
{
  "command": "wf.node.get-output-data",
  "success": true,
  "nodeId": "coder-a1b",
  "output": "language",
  "value": "TypeScript"
}
```

**Errors:**
- `E175` — Output not saved

---

### Get output file

```bash
cg wf node get-output-file <graph> <nodeId> <outputName>
```

Returns the absolute path to a saved file output.

```bash
cg wf node get-output-file my-pipeline coder-a1b code
```

**Success response:**
```json
{
  "command": "wf.node.get-output-file",
  "success": true,
  "nodeId": "coder-a1b",
  "output": "code",
  "path": "/workspace/.chainglass/data/workflows/my-pipeline/nodes/coder-a1b/data/code"
}
```

**Errors:**
- `E175` — Output not saved

---

## Q&A Commands

### Ask a question

```bash
cg wf node ask <graph> <nodeId> --type <type> --text <text> [--options <values...>]
```

Transitions a node from `running` to `waiting-question`. Returns a question ID that the orchestrator uses to provide the answer.

**Options:**
- `--type <type>` — Question type: `text`, `single`, `multi`, or `confirm` (required)
- `--text <text>` — Question text to display (required)
- `--options <values...>` — Answer options for `single`/`multi` types

```bash
# Free-form text question
cg wf node ask my-pipeline coder-a1b --type text --text "What should the function be named?"

# Single choice
cg wf node ask my-pipeline coder-a1b --type single --text "Which language?" --options "Python" "TypeScript" "Go"

# Multiple choice
cg wf node ask my-pipeline coder-a1b --type multi --text "Which features?" --options "logging" "caching" "retry"

# Yes/no confirmation
cg wf node ask my-pipeline coder-a1b --type confirm --text "Proceed with deployment?"
```

**Success response:**
```json
{
  "command": "wf.node.ask",
  "success": true,
  "nodeId": "coder-a1b",
  "questionId": "q-1706803200000",
  "status": "waiting-question"
}
```

**Errors:**
- `E176` — Node not in `running` state

---

### Answer a question

```bash
cg wf node answer <graph> <nodeId> <questionId> <answer>
```

Provides an answer to a waiting question, transitioning the node from `waiting-question` back to `running`.

```bash
# Answer a text question
cg wf node answer my-pipeline coder-a1b q-1706803200000 "calculateTotal"

# Answer a single choice (provide the selected option)
cg wf node answer my-pipeline coder-a1b q-1706803200000 "TypeScript"

# Answer a multi choice (provide comma-separated selections)
cg wf node answer my-pipeline coder-a1b q-1706803200000 "logging,caching"

# Answer a confirmation
cg wf node answer my-pipeline coder-a1b q-1706803200000 "yes"
```

**Success response:**
```json
{
  "command": "wf.node.answer",
  "success": true,
  "nodeId": "coder-a1b",
  "questionId": "q-1706803200000",
  "status": "running"
}
```

**Errors:**
- `E177` — Node not in `waiting-question` state
- `E173` — Question ID not found

---

### Get an answer

```bash
cg wf node get-answer <graph> <nodeId> <questionId>
```

Retrieves the answer for a previously answered question.

```bash
cg wf node get-answer my-pipeline coder-a1b q-1706803200000
```

**Success response:**
```json
{
  "command": "wf.node.get-answer",
  "success": true,
  "nodeId": "coder-a1b",
  "questionId": "q-1706803200000",
  "answered": true,
  "answer": "TypeScript",
  "answeredAt": "2026-02-04T12:00:00.000Z"
}
```

If not yet answered:
```json
{
  "command": "wf.node.get-answer",
  "success": true,
  "nodeId": "coder-a1b",
  "questionId": "q-1706803200000",
  "answered": false
}
```

**Errors:**
- `E173` — Question ID not found

---

## Input Retrieval Commands

### Get input data

```bash
cg wf node get-input-data <graph> <nodeId> <inputName>
```

Retrieves the data value from a wired input. The source node must be complete.

```bash
cg wf node get-input-data my-pipeline coder-a1b spec
```

**Success response (single source):**
```json
{
  "command": "wf.node.get-input-data",
  "success": true,
  "nodeId": "coder-a1b",
  "input": "spec",
  "value": "Build a REST API for user management",
  "sourceNodeId": "spec-builder-b2c"
}
```

**Success response (collect-all with multiple sources):**
```json
{
  "command": "wf.node.get-input-data",
  "success": true,
  "nodeId": "summarizer-c3d",
  "input": "findings",
  "sources": [
    { "nodeId": "researcher-1", "value": "Finding from researcher 1" },
    { "nodeId": "researcher-2", "value": "Finding from researcher 2" }
  ]
}
```

**Errors:**
- `E178` — Input not available (source not complete, wiring error, or no matching nodes)
- `E160` — Input not declared on WorkUnit

---

### Get input file

```bash
cg wf node get-input-file <graph> <nodeId> <inputName>
```

Returns the absolute path to a file input. The source node must be complete.

```bash
cg wf node get-input-file my-pipeline tester-c3d code
```

**Success response:**
```json
{
  "command": "wf.node.get-input-file",
  "success": true,
  "nodeId": "tester-c3d",
  "input": "code",
  "path": "/workspace/.chainglass/data/workflows/my-pipeline/nodes/coder-a1b/data/code",
  "sourceNodeId": "coder-a1b"
}
```

**Errors:**
- `E178` — Input not available
- `E160` — Input not declared on WorkUnit

---

## Error Codes

| Code | Meaning |
|------|---------|
| E153 | Node not found |
| E160 | Input/output not declared on WorkUnit |
| E170 | Node not ready to run |
| E171 | Transition blocked (manual gate) |
| E172 | Invalid state transition |
| E173 | Question not found |
| E175 | Output not saved |
| E176 | Node not in running state |
| E177 | Node not waiting for answer |
| E178 | Input not available |
| E179 | File not found |

---

## Command Summary

| Command | From State | To State | Purpose |
|---------|------------|----------|---------|
| `node start` | pending | running | Begin execution |
| `node end` | running | complete | Finish execution |
| `node ask` | running | waiting-question | Ask the orchestrator |
| `node answer` | waiting-question | running | Provide answer |
| `node save-output-data` | running | running | Store data output |
| `node save-output-file` | running | running | Store file output |
| `node get-output-data` | any | any | Retrieve data output |
| `node get-output-file` | any | any | Retrieve file path |
| `node get-input-data` | running | running | Get upstream data |
| `node get-input-file` | running | running | Get upstream file path |
| `node can-end` | any | any | Check completion readiness |
| `node get-answer` | any | any | Retrieve answer |

---

## Related Documentation

- [Execution Overview](./1-overview.md) — State machine, readiness algorithm, execution patterns
- [E2E Flow](./3-e2e-flow.md) — Step-by-step walkthrough of the 7-node E2E test
- [Graph CLI Usage](../positional-graph/2-cli-usage.md) — Graph structure commands
