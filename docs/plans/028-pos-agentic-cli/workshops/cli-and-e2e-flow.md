# Workshop: CLI Commands and E2E Flow Port

**Type**: CLI Flow
**Plan**: 028-pos-agentic-cli
**Spec**: [research-dossier.md](../research-dossier.md)
**Created**: 2026-02-03
**Status**: Draft

**Related Documents**:
- [Positional Graph Commands](../../../../apps/cli/src/commands/positional-graph.command.ts) — **implementation target**
- [Positional Graph Service Interface](../../../../packages/positional-graph/src/interfaces/positional-graph-service.interface.ts) — **implementation target**
- [E2E Sample Flow (legacy)](../../../../how/dev/workgraph-run/e2e-sample-flow.ts) — *reference only, not modified*
- [WorkGraph Commands (legacy)](../../../../apps/cli/src/commands/workgraph.command.ts) — *reference only, not modified*
- [CLI Runner Library](../../../../how/dev/workgraph-run/lib/cli-runner.ts) — *reference only, pattern may be adapted*

---

## Implementation Approach: Clean Redesign

> **CRITICAL**: This is a **clean implementation**, not a port or wrapper of WorkGraph code.

### What This Plan Does NOT Do

| Aspect | Explicitly NOT Doing |
|--------|----------------------|
| **Code reuse** | NOT importing, extending, or wrapping `packages/workgraph/` services |
| **File sharing** | NOT reading from `.chainglass/work-graphs/` or `.chainglass/data/work-graphs/` |
| **Interface inheritance** | NOT implementing `IWorkNodeService` or `IWorkGraphService` |
| **Command aliasing** | NOT delegating `cg wf` commands to `cg wg` handlers |
| **Data migration** | NOT converting WorkGraph data to positional graph format |

### What This Plan DOES Do

| Aspect | Clean Implementation Approach |
|--------|-------------------------------|
| **Service methods** | New methods added to `IPositionalGraphService` in `packages/positional-graph/` |
| **Service implementation** | New code in `PositionalGraphService` class, following existing patterns |
| **Data storage** | `.chainglass/data/workflows/{slug}/` — the positional graph workspace path |
| **State schema** | Extend existing `StateSchema` in `packages/positional-graph/src/schemas/` |
| **Output storage** | New `nodes/{nodeId}/data.json` and `files/` within positional graph directory |
| **CLI commands** | New handlers in `positional-graph.command.ts` under `cg wf node` |
| **Error codes** | New E172-E179 codes in `positional-graph-errors.ts` |
| **Tests** | New tests in `test/unit/positional-graph/` and `test/integration/positional-graph/` |

### Reference vs Implementation

The legacy WorkGraph system (`cg wg`, `packages/workgraph/`, `e2e-sample-flow.ts`) serves as **functional reference only**:

- **Demonstrates required capabilities** — what an agent needs to execute workflows
- **Shows the orchestrator/agent handover pattern** — question/answer protocol
- **Provides acceptance criteria** — the ported E2E flow must achieve equivalent behavior

The implementation will be:

1. **Fresh code** written in `packages/positional-graph/`
2. **Following positional graph patterns** — service interface, result types, adapter pattern
3. **Using positional graph data structures** — lines, positions, `collateInputs` for input resolution
4. **Native to positional graph storage** — `graph.yaml`, `state.json`, `node.yaml` schemas

### Data Structure: Positional Graph Native

```
.chainglass/data/workflows/{slug}/          # Positional graph root (USED)
├── graph.yaml                              # Graph definition (existing)
├── state.json                              # Runtime state (EXTENDED)
│   ├── graph_status
│   ├── nodes: { [nodeId]: NodeStateEntry }
│   ├── transitions: { [lineId]: TransitionEntry }
│   └── questions: Question[]               # NEW
└── nodes/
    └── {nodeId}/
        ├── node.yaml                       # Node config (existing)
        ├── data.json                       # Output values (NEW)
        └── files/                          # Output files (NEW)
            └── {outputName}.ext
```

**Legacy paths NOT used:**
```
.chainglass/work-graphs/{slug}/             # LEGACY — ignored
.chainglass/data/work-graphs/{slug}/        # LEGACY — ignored
```

---

## Purpose

Define the complete CLI command surface for positional graph execution lifecycle and demonstrate how the E2E sample flow will be ported from `cg wg` to `cg wf` commands. This workshop answers:

1. What new CLI commands are needed for execution lifecycle?
2. How do the old `cg wg` commands map to new `cg wf` commands?
3. What does the ported E2E flow look like step-by-step?

## Key Questions Addressed

- What is the full `cg wf node` command surface for execution?
- How do input wiring patterns differ between WorkGraph and Positional Graph?
- What are the JSON output schemas for new commands?
- How does the question/answer handover protocol work?

---

## Command Summary

### Existing Commands (Plan 026)

| Command | Purpose |
|---------|---------|
| `cg wf create <slug>` | Create new positional graph |
| `cg wf show <slug>` | Show graph structure |
| `cg wf delete <slug>` | Delete a graph |
| `cg wf list` | List all graphs |
| `cg wf status <slug>` | Show graph/node/line status |
| `cg wf trigger <slug> <lineId>` | Trigger manual line transition |
| `cg wf line add\|remove\|move\|set` | Line operations |
| `cg wf node add\|remove\|move\|set` | Node operations |
| `cg wf node set-input` | Wire an input to a source |
| `cg wf node collate` | Show resolved inputs for a node |

### New Commands (Plan 028) - Execution Lifecycle

| Command | Purpose |
|---------|---------|
| `cg wf node start <slug> <nodeId>` | Transition node to `running` |
| `cg wf node end <slug> <nodeId>` | Transition node to `complete` |
| `cg wf node can-end <slug> <nodeId>` | Check if all required outputs present |
| `cg wf node ask <slug> <nodeId>` | Ask question (handover to orchestrator) |
| `cg wf node answer <slug> <nodeId> <qId> <answer>` | Answer a question |
| `cg wf node get-answer <slug> <nodeId> <qId>` | Retrieve stored answer |
| `cg wf node save-output-data <slug> <nodeId> <name> <value>` | Save output value |
| `cg wf node save-output-file <slug> <nodeId> <name> <path>` | Save output file |
| `cg wf node get-output-data <slug> <nodeId> <name>` | Get saved output value |
| `cg wf node get-output-file <slug> <nodeId> <name>` | Get saved output file path |
| `cg wf node get-input-data <slug> <nodeId> <name>` | Get resolved input value |
| `cg wf node get-input-file <slug> <nodeId> <name>` | Get resolved input file path |

---

## Command Mapping: WorkGraph to Positional Graph

> **Note**: This mapping is for **understanding functional equivalence**, not for code migration. Each `cg wf` command will be implemented fresh in `packages/positional-graph/`.

### Key Differences

| Aspect | WorkGraph (`cg wg`) | Positional Graph (`cg wf`) |
|--------|---------------------|----------------------------|
| **Graph structure** | DAG with edges | Ordered lines with positions |
| **Node creation** | `add-after <prevNodeId>` | `node add <lineId> <unitSlug>` |
| **Input wiring** | At node creation: `-i spec:nodeId.spec` | After creation: `set-input --from-node --output` |
| **Readiness check** | `can-run` returns boolean | `status --node` returns full readiness detail |
| **Graph has start node** | Yes (auto-created) | No (first line is entry) |

### Command Mapping Table

| WorkGraph Command | Positional Graph Equivalent |
|-------------------|----------------------------|
| `wg create <slug>` | `wf create <slug>` |
| `wg node add-after <graph> <after> <unit> -i <wirings>` | `wf node add <graph> <line> <unit>` + `wf node set-input` |
| `wg node can-run <graph> <node>` | `wf status <graph> --node <node>` (check `ready` field) |
| `wg node start <graph> <node>` | `wf node start <graph> <node>` **(NEW)** |
| `wg node end <graph> <node>` | `wf node end <graph> <node>` **(NEW)** |
| `wg node can-end <graph> <node>` | `wf node can-end <graph> <node>` **(NEW)** |
| `wg node save-output-data <graph> <node> <name> <value>` | `wf node save-output-data <graph> <node> <name> <value>` **(NEW)** |
| `wg node save-output-file <graph> <node> <name> <path>` | `wf node save-output-file <graph> <node> <name> <path>` **(NEW)** |
| `wg node get-input-data <graph> <node> <name>` | `wf node get-input-data <graph> <node> <name>` **(NEW)** |
| `wg node get-input-file <graph> <node> <name>` | `wf node get-input-file <graph> <node> <name>` **(NEW)** |
| `wg node get-output-data <graph> <node> <name>` | `wf node get-output-data <graph> <node> <name>` **(NEW)** |
| `wg node ask <graph> <node> --type --text --options` | `wf node ask <graph> <node> --type --text --options` **(NEW)** |
| `wg node answer <graph> <node> <qId> <answer>` | `wf node answer <graph> <node> <qId> <answer>` **(NEW)** |
| `wg node get-answer <graph> <node> <qId>` | `wf node get-answer <graph> <node> <qId>` **(NEW)** |
| `wg status <graph>` | `wf status <graph>` |

---

## New CLI Commands - Detailed Specification

### `cg wf node start`

Transition a node from `pending`/`ready` to `running`.

```
$ cg wf node start <slug> <nodeId>

┌─────────────────────────────────────────────────────────────┐
│ VALIDATION                                                  │
│   • Graph exists                                            │
│   • Node exists in graph                                    │
│   • Node status is 'pending' or 'ready' (not already        │
│     running, complete, or blocked)                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ STATE MUTATION                                              │
│   • Write to state.json:                                    │
│     nodes[nodeId] = {                                       │
│       status: 'running',                                    │
│       started_at: '2026-02-03T10:30:00.000Z'               │
│     }                                                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ OUTPUT                                                      │
│                                                             │
│   Started node: sample-coder-a7b                            │
│   Status: running                                           │
│   Started at: 2026-02-03T10:30:00.000Z                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**JSON Output:**
```json
{
  "nodeId": "sample-coder-a7b",
  "status": "running",
  "startedAt": "2026-02-03T10:30:00.000Z",
  "errors": []
}
```

**Error Cases:**
| Code | Message | Cause |
|------|---------|-------|
| E153 | Node not found | Node ID doesn't exist in graph |
| E172 | Invalid state transition | Node is already running/complete/blocked |
| E170 | Node not ready | canRun gates not satisfied |

---

### `cg wf node end`

Transition a node from `running` to `complete`.

```
$ cg wf node end <slug> <nodeId>

┌─────────────────────────────────────────────────────────────┐
│ VALIDATION                                                  │
│   • Node is in 'running' state                              │
│   • All required outputs are saved (via can-end check)      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ STATE MUTATION                                              │
│   • Update state.json:                                      │
│     nodes[nodeId].status = 'complete'                       │
│     nodes[nodeId].completed_at = '2026-02-03T10:35:00.000Z'│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ OUTPUT                                                      │
│                                                             │
│   Completed node: sample-coder-a7b                          │
│   Status: complete                                          │
│   Duration: 5m 0s                                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**JSON Output:**
```json
{
  "nodeId": "sample-coder-a7b",
  "status": "complete",
  "startedAt": "2026-02-03T10:30:00.000Z",
  "completedAt": "2026-02-03T10:35:00.000Z",
  "errors": []
}
```

**Error Cases:**
| Code | Message | Cause |
|------|---------|-------|
| E172 | Node not running | Node is not in running state |
| E175 | Missing required outputs | Not all required outputs saved |

---

### `cg wf node can-end`

Check if all required outputs are present (query-only, no mutation).

```
$ cg wf node can-end <slug> <nodeId>

┌─────────────────────────────────────────────────────────────┐
│ OUTPUT (can end)                                            │
│                                                             │
│   Node: sample-coder-a7b                                    │
│   Can end: true                                             │
│   Required outputs: 2/2 saved                               │
│     ✓ language                                              │
│     ✓ script                                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘

$ cg wf node can-end <slug> <nodeId>  (missing outputs)

┌─────────────────────────────────────────────────────────────┐
│ OUTPUT (cannot end)                                         │
│                                                             │
│   Node: sample-coder-a7b                                    │
│   Can end: false                                            │
│   Required outputs: 1/2 saved                               │
│     ✓ language                                              │
│     ✗ script (missing)                                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**JSON Output:**
```json
{
  "nodeId": "sample-coder-a7b",
  "canEnd": false,
  "savedOutputs": ["language"],
  "missingOutputs": ["script"],
  "errors": []
}
```

---

### `cg wf node save-output-data`

Save a data value as a node output.

```
$ cg wf node save-output-data <slug> <nodeId> <outputName> <jsonValue>

# Example
$ cg wf node save-output-data sample-e2e sample-coder-a7b language '"bash"'

┌─────────────────────────────────────────────────────────────┐
│ STORAGE                                                     │
│   • Write to: nodes/<nodeId>/data.json                      │
│     { "language": "bash" }                                  │
│   • Merge with existing outputs if present                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ OUTPUT                                                      │
│                                                             │
│   Saved output: language                                    │
│   Node: sample-coder-a7b                                    │
│   Value: "bash"                                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**JSON Output:**
```json
{
  "nodeId": "sample-coder-a7b",
  "outputName": "language",
  "saved": true,
  "errors": []
}
```

**Note:** Value is JSON-parsed. To save a string, use `'"value"'` (quoted).

---

### `cg wf node save-output-file`

Save a file as a node output (copies file to node storage).

```
$ cg wf node save-output-file <slug> <nodeId> <outputName> <sourcePath>

# Example
$ cg wf node save-output-file sample-e2e sample-coder-a7b script ./add.sh

┌─────────────────────────────────────────────────────────────┐
│ STORAGE                                                     │
│   • Copy file to: nodes/<nodeId>/files/script.sh            │
│   • Update data.json: { "script": "files/script.sh" }       │
│   • Validate: no path traversal in sourcePath               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ OUTPUT                                                      │
│                                                             │
│   Saved output file: script                                 │
│   Node: sample-coder-a7b                                    │
│   Source: ./add.sh                                          │
│   Stored at: nodes/sample-coder-a7b/files/script.sh         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**JSON Output:**
```json
{
  "nodeId": "sample-coder-a7b",
  "outputName": "script",
  "saved": true,
  "filePath": "nodes/sample-coder-a7b/files/script.sh",
  "errors": []
}
```

---

### `cg wf node get-input-data`

Get a resolved input value from an upstream node.

```
$ cg wf node get-input-data <slug> <nodeId> <inputName>

# Example
$ cg wf node get-input-data sample-e2e sample-tester-c8d language

┌─────────────────────────────────────────────────────────────┐
│ RESOLUTION                                                  │
│   • Look up input wiring: inputs.language                   │
│   • Find source node (from_unit: sample-coder)              │
│   • Read source node's data.json[language]                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ OUTPUT                                                      │
│                                                             │
│   Input: language                                           │
│   Source: sample-coder-a7b.language                         │
│   Value: "bash"                                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**JSON Output:**
```json
{
  "inputName": "language",
  "sourceNodeId": "sample-coder-a7b",
  "sourceOutput": "language",
  "value": "bash",
  "errors": []
}
```

**Error Cases:**
| Code | Message | Cause |
|------|---------|-------|
| E160 | Input not wired | No wiring for this input name |
| E178 | Input not available | Source node not complete |

---

### `cg wf node get-input-file`

Get a resolved input file path from an upstream node.

```
$ cg wf node get-input-file <slug> <nodeId> <inputName>

# Example
$ cg wf node get-input-file sample-e2e sample-tester-c8d script

┌─────────────────────────────────────────────────────────────┐
│ OUTPUT                                                      │
│                                                             │
│   Input: script                                             │
│   Source: sample-coder-a7b.script                           │
│   File path: .chainglass/data/workflows/sample-e2e/         │
│              nodes/sample-coder-a7b/files/script.sh         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**JSON Output:**
```json
{
  "inputName": "script",
  "sourceNodeId": "sample-coder-a7b",
  "sourceOutput": "script",
  "filePath": ".chainglass/data/workflows/sample-e2e/nodes/sample-coder-a7b/files/script.sh",
  "errors": []
}
```

---

### `cg wf node ask`

Ask a question, pausing execution for orchestrator answer.

```
$ cg wf node ask <slug> <nodeId> --type <type> --text <text> [--options ...]

# Example
$ cg wf node ask sample-e2e sample-coder-a7b \
    --type single \
    --text "Which programming language should I use?" \
    --options typescript javascript python bash

┌─────────────────────────────────────────────────────────────┐
│ STATE MUTATION                                              │
│   • Generate question ID: 2026-02-03T10:32:00.000Z_f4e     │
│   • Update state.json:                                      │
│     nodes[nodeId].status = 'waiting-question'               │
│     nodes[nodeId].pendingQuestion = {                       │
│       questionId, text, type, options, askedAt              │
│     }                                                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ OUTPUT                                                      │
│                                                             │
│   Question asked: 2026-02-03T10:32:00.000Z_f4e              │
│   Type: single                                              │
│   Text: Which programming language should I use?            │
│   Options: typescript, javascript, python, bash             │
│   Node status: waiting-question                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**JSON Output:**
```json
{
  "questionId": "2026-02-03T10:32:00.000Z_f4e",
  "nodeId": "sample-coder-a7b",
  "question": {
    "type": "single",
    "text": "Which programming language should I use?",
    "options": ["typescript", "javascript", "python", "bash"]
  },
  "status": "waiting-question",
  "errors": []
}
```

**Question Types:**
| Type | Description | Options Required |
|------|-------------|------------------|
| `text` | Free-form text input | No |
| `single` | Single choice from options | Yes |
| `multi` | Multiple choices from options | Yes |
| `confirm` | Yes/No confirmation | No |

---

### `cg wf node answer`

Answer a pending question (orchestrator action).

```
$ cg wf node answer <slug> <nodeId> <questionId> <answer>

# Example
$ cg wf node answer sample-e2e sample-coder-a7b 2026-02-03T10:32:00.000Z_f4e '"bash"'

┌─────────────────────────────────────────────────────────────┐
│ STATE MUTATION                                              │
│   • Store answer in questions array                         │
│   • Update node status: 'waiting-question' -> 'running'     │
│   • Clear pendingQuestion field                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ OUTPUT                                                      │
│                                                             │
│   Answered question: 2026-02-03T10:32:00.000Z_f4e           │
│   Answer: "bash"                                            │
│   Node status: running (resumed)                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**JSON Output:**
```json
{
  "questionId": "2026-02-03T10:32:00.000Z_f4e",
  "nodeId": "sample-coder-a7b",
  "answer": "bash",
  "status": "running",
  "errors": []
}
```

---

### `cg wf node get-answer`

Retrieve a stored answer (agent action after resume).

```
$ cg wf node get-answer <slug> <nodeId> <questionId>

┌─────────────────────────────────────────────────────────────┐
│ OUTPUT                                                      │
│                                                             │
│   Question: 2026-02-03T10:32:00.000Z_f4e                    │
│   Answered: true                                            │
│   Answer: "bash"                                            │
│   Answered at: 2026-02-03T10:33:00.000Z                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**JSON Output:**
```json
{
  "questionId": "2026-02-03T10:32:00.000Z_f4e",
  "answered": true,
  "answer": "bash",
  "answeredAt": "2026-02-03T10:33:00.000Z",
  "errors": []
}
```

---

## E2E Flow Port: WorkGraph to Positional Graph

> **Note**: This section shows the **functional equivalence** between old and new commands. The "NEW" commands will be implemented from scratch in `packages/positional-graph/`, not by modifying or wrapping WorkGraph code. The side-by-side comparison demonstrates what behavior the new implementation must achieve.

### Pipeline Structure

**3-Node Code Generation Pipeline:**

```
┌─────────────────────────────────────────────────────────────┐
│ LINE 0: Input Phase                                         │
│ ┌───────────────────────────────────────────────────────┐   │
│ │  sample-input-a1b                                     │   │
│ │  Outputs: spec (string)                               │   │
│ │  Pattern: Direct output (no agent)                    │   │
│ └───────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ LINE 1: Code Generation Phase                               │
│ ┌───────────────────────────────────────────────────────┐   │
│ │  sample-coder-a7b                                     │   │
│ │  Inputs: spec (from sample-input.spec)                │   │
│ │  Outputs: language (string), script (file)            │   │
│ │  Pattern: Agent with question/answer                  │   │
│ └───────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ LINE 2: Testing Phase                                       │
│ ┌───────────────────────────────────────────────────────┐   │
│ │  sample-tester-c8d                                    │   │
│ │  Inputs: language (from sample-coder.language)        │   │
│ │          script (from sample-coder.script)            │   │
│ │  Outputs: success (boolean), output (string)          │   │
│ │  Pattern: Agent runs script                           │   │
│ └───────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Side-by-Side Comparison

#### Step 1: Create Graph

**WorkGraph (OLD):**
```bash
cg wg create sample-e2e
# Creates graph with auto-generated 'start' node
```

**Positional Graph (NEW):**
```bash
cg wf create sample-e2e
# Creates graph with one empty line (line-000)
```

**JSON Output (NEW):**
```json
{
  "graphSlug": "sample-e2e",
  "lineId": "line-000",
  "errors": []
}
```

---

#### Step 2: Add Nodes

**WorkGraph (OLD):**
```bash
# Add node after start, with input wiring at creation time
cg wg node add-after sample-e2e start sample-input

cg wg node add-after sample-e2e $node1Id sample-coder \
    -i "spec:$node1Id.spec"

cg wg node add-after sample-e2e $node2Id sample-tester \
    -i "language:$node2Id.language" \
    -i "script:$node2Id.script"
```

**Positional Graph (NEW):**
```bash
# Add nodes to lines, then wire inputs separately

# Node 1: Add to line-000 (first line, created with graph)
cg wf node add sample-e2e line-000 sample-input
# Returns: nodeId = "sample-input-a1b"

# Add line for code generation
cg wf line add sample-e2e
# Returns: lineId = "line-001"

# Node 2: Add to line-001
cg wf node add sample-e2e line-001 sample-coder
# Returns: nodeId = "sample-coder-a7b"

# Wire input: spec from sample-input (by unit slug)
cg wf node set-input sample-e2e sample-coder-a7b spec \
    --from-unit sample-input --output spec

# Add line for testing
cg wf line add sample-e2e
# Returns: lineId = "line-002"

# Node 3: Add to line-002
cg wf node add sample-e2e line-002 sample-tester
# Returns: nodeId = "sample-tester-c8d"

# Wire inputs
cg wf node set-input sample-e2e sample-tester-c8d language \
    --from-unit sample-coder --output language

cg wf node set-input sample-e2e sample-tester-c8d script \
    --from-unit sample-coder --output script
```

**Why this pattern?** Positional graph separates structure (add node to line) from wiring (set-input). This enables:
- Moving nodes between lines without losing wirings
- Rewiring inputs without recreating nodes
- Clearer visibility of graph structure

---

#### Step 3: Execute Node 1 - Direct Output Pattern

**WorkGraph (OLD):**
```bash
# Check readiness
cg wg node can-run sample-e2e $node1Id
# {"canRun": true}

# Save output directly (no start needed!)
cg wg node save-output-data sample-e2e $node1Id spec \
    '"Write a function add(a, b) that returns the sum"'

# Check can-end
cg wg node can-end sample-e2e $node1Id
# {"canEnd": true}

# End (PENDING -> COMPLETE, skipping running state)
cg wg node end sample-e2e $node1Id
```

**Positional Graph (NEW):**
```bash
# Check readiness via status (no separate can-run command)
cg wf status sample-e2e --node sample-input-a1b --json
# {
#   "nodeId": "sample-input-a1b",
#   "status": "ready",
#   "ready": true,
#   "readyDetail": {
#     "precedingLinesComplete": true,
#     "transitionOpen": true,
#     "serialNeighborComplete": true,
#     "inputsAvailable": true
#   }
# }

# Save output directly (no start needed!)
cg wf node save-output-data sample-e2e sample-input-a1b spec \
    '"Write a function add(a, b) that returns the sum"'

# Check can-end
cg wf node can-end sample-e2e sample-input-a1b --json
# {"canEnd": true, "savedOutputs": ["spec"], "missingOutputs": []}

# End (READY -> COMPLETE, skipping running state)
cg wf node end sample-e2e sample-input-a1b
```

**Key pattern:** Nodes with direct outputs (no agent work) can skip the `start` command entirely. Just save outputs and call `end`.

---

#### Step 4: Execute Node 2 - Agent with Question

**WorkGraph (OLD):**
```bash
# Check readiness
cg wg node can-run sample-e2e $node2Id
# {"canRun": true}

# Start the node
cg wg node start sample-e2e $node2Id

# [Agent runs, asks a question]
cg wg node ask sample-e2e $node2Id \
    --type single \
    --text "Which programming language should I use?" \
    --options typescript javascript python bash
# {"questionId": "q123", "status": "waiting-question"}

# [Orchestrator answers]
cg wg node answer sample-e2e $node2Id q123 '"bash"'

# [Agent retrieves answer]
cg wg node get-answer sample-e2e $node2Id q123
# {"answer": "bash", "answered": true}

# [Agent saves outputs]
cg wg node save-output-data sample-e2e $node2Id language '"bash"'
cg wg node save-output-file sample-e2e $node2Id script ./add.sh

# End the node
cg wg node end sample-e2e $node2Id
```

**Positional Graph (NEW):**
```bash
# Check readiness
cg wf status sample-e2e --node sample-coder-a7b --json
# {"ready": true, "status": "ready", ...}

# Start the node
cg wf node start sample-e2e sample-coder-a7b
# {"status": "running", "startedAt": "2026-02-03T10:30:00Z"}

# [Agent runs, asks a question]
cg wf node ask sample-e2e sample-coder-a7b \
    --type single \
    --text "Which programming language should I use?" \
    --options typescript javascript python bash
# {"questionId": "2026-02-03T10:32:00.000Z_f4e", "status": "waiting-question"}

# [Orchestrator polls status, sees waiting-question]
cg wf status sample-e2e --node sample-coder-a7b --json
# {"status": "waiting-question", "pendingQuestion": {...}}

# [Orchestrator answers]
cg wf node answer sample-e2e sample-coder-a7b 2026-02-03T10:32:00.000Z_f4e '"bash"'
# {"status": "running"}

# [Agent retrieves answer after resume]
cg wf node get-answer sample-e2e sample-coder-a7b 2026-02-03T10:32:00.000Z_f4e
# {"answer": "bash", "answered": true}

# [Agent saves outputs]
cg wf node save-output-data sample-e2e sample-coder-a7b language '"bash"'
cg wf node save-output-file sample-e2e sample-coder-a7b script ./add.sh

# Check can-end
cg wf node can-end sample-e2e sample-coder-a7b
# {"canEnd": true}

# End the node
cg wf node end sample-e2e sample-coder-a7b
# {"status": "complete"}
```

---

#### Step 5: Execute Node 3 - Agent Runs Script

**WorkGraph (OLD):**
```bash
# Check readiness
cg wg node can-run sample-e2e $node3Id
# {"canRun": true}

# Start the node
cg wg node start sample-e2e $node3Id

# [Agent gets inputs]
cg wg node get-input-data sample-e2e $node3Id language
# {"value": "bash"}

cg wg node get-input-file sample-e2e $node3Id script
# {"filePath": ".chainglass/work-graphs/sample-e2e/nodes/$node2Id/files/script.sh"}

# [Agent runs script, saves outputs]
cg wg node save-output-data sample-e2e $node3Id success true
cg wg node save-output-data sample-e2e $node3Id output '"5"'

# End the node
cg wg node end sample-e2e $node3Id
```

**Positional Graph (NEW):**
```bash
# Check readiness
cg wf status sample-e2e --node sample-tester-c8d --json
# {"ready": true}

# Start the node
cg wf node start sample-e2e sample-tester-c8d

# [Agent gets inputs]
cg wf node get-input-data sample-e2e sample-tester-c8d language --json
# {"value": "bash", "sourceNodeId": "sample-coder-a7b"}

cg wf node get-input-file sample-e2e sample-tester-c8d script --json
# {"filePath": ".chainglass/data/workflows/sample-e2e/nodes/sample-coder-a7b/files/script.sh"}

# [Agent runs script, saves outputs]
cg wf node save-output-data sample-e2e sample-tester-c8d success true
cg wf node save-output-data sample-e2e sample-tester-c8d output '"5"'

# End the node
cg wf node end sample-e2e sample-tester-c8d
# {"status": "complete"}
```

---

#### Step 6: Read Pipeline Result

**WorkGraph (OLD):**
```bash
cg wg node get-output-data sample-e2e $node3Id success
# {"value": true}

cg wg node get-output-data sample-e2e $node3Id output
# {"value": "5"}
```

**Positional Graph (NEW):**
```bash
cg wf node get-output-data sample-e2e sample-tester-c8d success --json
# {"value": true}

cg wf node get-output-data sample-e2e sample-tester-c8d output --json
# {"value": "5"}
```

---

#### Step 7: Validate Final State

**WorkGraph (OLD):**
```bash
cg wg status sample-e2e
# All nodes complete
```

**Positional Graph (NEW):**
```bash
cg wf status sample-e2e --json
# {
#   "status": "complete",
#   "lines": [...],
#   "readyNodes": [],
#   "runningNodes": [],
#   "completedNodes": ["sample-input-a1b", "sample-coder-a7b", "sample-tester-c8d"],
#   "waitingQuestionNodes": [],
#   "blockedNodes": []
# }
```

---

## Full E2E Flow Script (NEW)

> **This is the target E2E test** that will validate the new positional graph execution lifecycle. It will be created as a new file (e.g., `e2e-positional-graph-flow.ts`), NOT by modifying the existing `e2e-sample-flow.ts`. The existing WorkGraph E2E test remains unchanged as reference.

Here's the complete E2E flow using positional graph commands:

```typescript
#!/usr/bin/env npx tsx
/**
 * E2E Sample Flow - Positional Graph Version
 *
 * Usage:
 *   npx tsx e2e-sample-flow-wf.ts           # Mock mode
 *   npx tsx e2e-sample-flow-wf.ts --with-agent  # Real agent
 */

const GRAPH_SLUG = 'sample-e2e';

const nodeIds = {
  node1: '',  // sample-input
  node2: '',  // sample-coder
  node3: '',  // sample-tester
};

const lineIds = {
  line0: '',  // Input phase
  line1: '',  // Code generation phase
  line2: '',  // Testing phase
};

async function main() {
  await cleanup();
  await createGraph();
  await addNodesAndWire();
  await executeNode1DirectOutput();
  await executeNode2AgentWithQuestion();
  await executeNode3AgentRunsScript();
  const success = await readPipelineResult();
  await validateFinalState();
  process.exit(success ? 0 : 1);
}

async function cleanup() {
  // Remove graph directory
  await runCli(['wf', 'delete', GRAPH_SLUG]).catch(() => {});
}

async function createGraph() {
  // Create graph (returns first line ID)
  const result = await runCli<GraphCreateData>(['wf', 'create', GRAPH_SLUG]);
  lineIds.line0 = result.data.lineId;
}

async function addNodesAndWire() {
  // Node 1: sample-input on line 0
  const n1 = await runCli<AddNodeData>([
    'wf', 'node', 'add', GRAPH_SLUG, lineIds.line0, 'sample-input'
  ]);
  nodeIds.node1 = n1.data.nodeId;

  // Add line 1 for code generation
  const l1 = await runCli<AddLineData>(['wf', 'line', 'add', GRAPH_SLUG]);
  lineIds.line1 = l1.data.lineId;

  // Node 2: sample-coder on line 1
  const n2 = await runCli<AddNodeData>([
    'wf', 'node', 'add', GRAPH_SLUG, lineIds.line1, 'sample-coder'
  ]);
  nodeIds.node2 = n2.data.nodeId;

  // Wire node2.spec <- sample-input.spec (by unit)
  await runCli([
    'wf', 'node', 'set-input', GRAPH_SLUG, nodeIds.node2, 'spec',
    '--from-unit', 'sample-input', '--output', 'spec'
  ]);

  // Add line 2 for testing
  const l2 = await runCli<AddLineData>(['wf', 'line', 'add', GRAPH_SLUG]);
  lineIds.line2 = l2.data.lineId;

  // Node 3: sample-tester on line 2
  const n3 = await runCli<AddNodeData>([
    'wf', 'node', 'add', GRAPH_SLUG, lineIds.line2, 'sample-tester'
  ]);
  nodeIds.node3 = n3.data.nodeId;

  // Wire node3.language <- sample-coder.language
  await runCli([
    'wf', 'node', 'set-input', GRAPH_SLUG, nodeIds.node3, 'language',
    '--from-unit', 'sample-coder', '--output', 'language'
  ]);

  // Wire node3.script <- sample-coder.script
  await runCli([
    'wf', 'node', 'set-input', GRAPH_SLUG, nodeIds.node3, 'script',
    '--from-unit', 'sample-coder', '--output', 'script'
  ]);
}

async function executeNode1DirectOutput() {
  // Check readiness
  const status = await runCli<NodeStatusData>([
    'wf', 'status', GRAPH_SLUG, '--node', nodeIds.node1
  ]);
  assert(status.data.ready, 'Node 1 should be ready');

  // Save output directly (no start needed)
  const spec = 'Write a function add(a, b) that returns the sum';
  await runCli([
    'wf', 'node', 'save-output-data', GRAPH_SLUG, nodeIds.node1, 'spec',
    JSON.stringify(spec)
  ]);

  // End (READY -> COMPLETE)
  await runCli(['wf', 'node', 'end', GRAPH_SLUG, nodeIds.node1]);
}

async function executeNode2AgentWithQuestion() {
  // Check readiness
  const status = await runCli<NodeStatusData>([
    'wf', 'status', GRAPH_SLUG, '--node', nodeIds.node2
  ]);
  assert(status.data.ready, 'Node 2 should be ready');

  // Start
  await runCli(['wf', 'node', 'start', GRAPH_SLUG, nodeIds.node2]);

  // Ask question
  const askResult = await runCli<AskData>([
    'wf', 'node', 'ask', GRAPH_SLUG, nodeIds.node2,
    '--type', 'single',
    '--text', 'Which programming language should I use?',
    '--options', 'typescript', 'javascript', 'python', 'bash'
  ]);

  // Answer (auto)
  await runCli([
    'wf', 'node', 'answer', GRAPH_SLUG, nodeIds.node2,
    askResult.data.questionId, '"bash"'
  ]);

  // Save outputs
  await runCli([
    'wf', 'node', 'save-output-data', GRAPH_SLUG, nodeIds.node2,
    'language', '"bash"'
  ]);

  // Create and save script file
  const scriptPath = await createMockScript();
  await runCli([
    'wf', 'node', 'save-output-file', GRAPH_SLUG, nodeIds.node2,
    'script', scriptPath
  ]);

  // End
  await runCli(['wf', 'node', 'end', GRAPH_SLUG, nodeIds.node2]);
}

async function executeNode3AgentRunsScript() {
  // Check readiness
  const status = await runCli<NodeStatusData>([
    'wf', 'status', GRAPH_SLUG, '--node', nodeIds.node3
  ]);
  assert(status.data.ready, 'Node 3 should be ready');

  // Start
  await runCli(['wf', 'node', 'start', GRAPH_SLUG, nodeIds.node3]);

  // Get inputs
  const langResult = await runCli<GetInputDataData>([
    'wf', 'node', 'get-input-data', GRAPH_SLUG, nodeIds.node3, 'language'
  ]);
  assert(langResult.data.value === 'bash', 'Language should be bash');

  const scriptResult = await runCli<GetInputFileData>([
    'wf', 'node', 'get-input-file', GRAPH_SLUG, nodeIds.node3, 'script'
  ]);

  // Execute script
  const { success, output } = await executeScript(scriptResult.data.filePath);

  // Save outputs
  await runCli([
    'wf', 'node', 'save-output-data', GRAPH_SLUG, nodeIds.node3,
    'success', String(success)
  ]);
  await runCli([
    'wf', 'node', 'save-output-data', GRAPH_SLUG, nodeIds.node3,
    'output', JSON.stringify(output)
  ]);

  // End
  await runCli(['wf', 'node', 'end', GRAPH_SLUG, nodeIds.node3]);
}

async function readPipelineResult(): Promise<boolean> {
  const successResult = await runCli<GetOutputDataData>([
    'wf', 'node', 'get-output-data', GRAPH_SLUG, nodeIds.node3, 'success'
  ]);
  return successResult.data.value === true || successResult.data.value === 'true';
}

async function validateFinalState() {
  const status = await runCli<GraphStatusData>(['wf', 'status', GRAPH_SLUG]);
  assert(status.data.status === 'complete', 'Graph should be complete');
  assert(
    status.data.completedNodes.length === 3,
    'All 3 nodes should be complete'
  );
}

main().catch(console.error);
```

---

## Error Codes Summary

### New Execution Lifecycle Error Codes (E172-E179)

| Code | Name | Message | Cause |
|------|------|---------|-------|
| E172 | InvalidStateTransition | Invalid state transition: {from} -> {to} | Called start on running node, end on pending node, etc. |
| E173 | QuestionNotFound | Question not found: {questionId} | get-answer or answer with invalid question ID |
| E174 | OutputAlreadySaved | Output already saved: {name} | Calling save-output twice with same name (optional: allow overwrite?) |
| E175 | OutputNotFound | Output not found: {name} | get-output-data with name not in data.json |
| E176 | NodeNotRunning | Node not in running state | Called ask on non-running node |
| E177 | NodeNotWaiting | Node not waiting for answer | Called answer on node not in waiting-question |
| E178 | InputNotAvailable | Input not available: {name} | get-input-data when source node not complete |
| E179 | FileNotFound | Source file not found: {path} | save-output-file with invalid source path |

---

## State Schema Updates

### Extended State.json

```typescript
interface State {
  graph_status: 'pending' | 'in_progress' | 'complete' | 'failed';
  updated_at: string;

  nodes?: Record<string, NodeStateEntry>;
  transitions?: Record<string, TransitionEntry>;

  // NEW: Question storage (per-graph, not per-node)
  questions?: Question[];
}

interface NodeStateEntry {
  status: 'running' | 'waiting-question' | 'blocked-error' | 'complete';
  started_at?: string;
  completed_at?: string;

  // NEW: Pending question reference
  pending_question_id?: string;

  // NEW: Error info (for blocked-error status)
  error?: {
    code: string;
    message: string;
    occurred_at: string;
  };
}

// NEW: Question type
interface Question {
  question_id: string;       // Timestamp-based: "2026-02-03T10:32:00.000Z_f4e"
  node_id: string;
  type: 'text' | 'single' | 'multi' | 'confirm';
  text: string;
  options?: string[];
  default?: string | boolean;
  asked_at: string;
  answer?: unknown;
  answered_at?: string;
}
```

### Output Storage: data.json

```typescript
// Per-node: nodes/<nodeId>/data.json
interface NodeOutputData {
  [outputName: string]: unknown;  // Values or file paths
}

// Example:
// nodes/sample-coder-a7b/data.json
{
  "language": "bash",
  "script": "files/script.sh"  // Relative path to files/ subdir
}
```

### Output Storage: files/

```
nodes/<nodeId>/
├── node.yaml        # Config (existing)
├── data.json        # Output values (NEW)
└── files/           # Output files (NEW)
    ├── script.sh
    └── diagram.png
```

---

## Quick Reference

```bash
# Execution Lifecycle
cg wf node start <slug> <nodeId>              # pending/ready -> running
cg wf node end <slug> <nodeId>                # running -> complete
cg wf node can-end <slug> <nodeId>            # Check if outputs saved

# Question/Answer
cg wf node ask <slug> <nodeId> --type single --text "?" --options a b c
cg wf node answer <slug> <nodeId> <qId> '"answer"'
cg wf node get-answer <slug> <nodeId> <qId>

# Output Storage
cg wf node save-output-data <slug> <nodeId> <name> <json-value>
cg wf node save-output-file <slug> <nodeId> <name> <path>
cg wf node get-output-data <slug> <nodeId> <name>
cg wf node get-output-file <slug> <nodeId> <name>

# Input Retrieval
cg wf node get-input-data <slug> <nodeId> <name>
cg wf node get-input-file <slug> <nodeId> <name>

# Status (existing, enhanced)
cg wf status <slug>                           # Full graph status
cg wf status <slug> --node <nodeId>           # Node status with readyDetail
cg wf status <slug> --line <lineId>           # Line status
```

---

## Open Questions

### Q1: Should save-output-data allow overwrite?

**Options:**
- A) Error E174 on duplicate save (strict)
- B) Overwrite silently (flexible)
- C) Add `--force` flag to overwrite

**OPEN**: Leaning toward (B) for flexibility. E2E patterns may need to retry saves.

### Q2: Question ID format

**RESOLVED**: Use timestamp-based format `2026-02-03T10:32:00.000Z_f4e` per PL-08 pattern. Naturally sortable, no collision risk.

### Q3: Can `end` be called without `start`?

**RESOLVED**: Yes. Direct output pattern (PL-10) allows `save-output-data` + `end` without `start`. Enables data-only nodes without agent invocation.

### Q4: Where to store questions - state.json or separate file?

**RESOLVED**: In state.json under `questions` array. Keeps all runtime state together, enables atomic updates.

---

## Summary: Implementation Boundaries

To be absolutely clear about scope:

| Package/File | Action |
|--------------|--------|
| `packages/positional-graph/` | **MODIFY** — add new service methods, schemas, error codes |
| `apps/cli/src/commands/positional-graph.command.ts` | **MODIFY** — add new CLI command handlers |
| `test/unit/positional-graph/` | **ADD** — new test files for execution lifecycle |
| `test/integration/positional-graph/` | **ADD** — new integration tests |
| `test/e2e/` | **ADD** — new `e2e-positional-graph-flow.ts` |
| `packages/workgraph/` | **DO NOT TOUCH** — legacy, reference only |
| `apps/cli/src/commands/workgraph.command.ts` | **DO NOT TOUCH** — legacy, reference only |
| `docs/how/dev/workgraph-run/e2e-sample-flow.ts` | **DO NOT TOUCH** — legacy, reference only |

The WorkGraph system (`cg wg`) and Positional Graph system (`cg wf`) will coexist independently. No code sharing, no data sharing, no command delegation between them.

---

**Workshop Status**: Ready for review
