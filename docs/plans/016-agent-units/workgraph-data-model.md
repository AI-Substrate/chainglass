# WorkGraph Data Model

This document defines the data model for WorkGraphs and WorkNodes - the runtime instances that execute WorkUnits.

---

## Overview

| Concept | Description | Storage |
|---------|-------------|---------|
| **WorkGraph** | A DAG of WorkNodes representing a workflow | `.chainglass/work-graphs/<slug>/` |
| **WorkNode** | An instance in a graph, executes one WorkUnit | `.chainglass/work-graphs/<slug>/nodes/<id>/` |
| **WorkUnit** | Reusable template (defined in workunit-data-model.md) | `.chainglass/units/<slug>/` |

**Relationship**: A WorkGraph contains WorkNodes. Each WorkNode references a WorkUnit by slug.

---

## Node ID Format

Node IDs use the format: `<unit-slug>-<guid>`

- **guid**: 3 random hex characters (4096 combinations per graph)
- **start**: Reserved name, no guid needed

**Examples**:
```
start                    # Reserved, no guid
user-input-text-a7f
write-poem-b2c
write-poem-d4e           # Same unit, different node
format-json-1f3
```

**Why this format**:
- Unit type visible in ID (self-documenting)
- Guid prevents collisions when same unit used multiple times
- No sequence numbers (nodes can be reordered)
- Short enough to type, unique enough to distinguish

---

## File Storage

```
.chainglass/work-graphs/
└── poem-workflow/                      # One WorkGraph
    ├── work-graph.yaml                 # Graph structure (node IDs, edges)
    ├── state.json                      # Runtime state (node statuses)
    └── nodes/
        ├── start/
        │   └── node.yaml               # Start node (minimal)
        │
        ├── user-input-text-a7f/
        │   ├── node.yaml               # Node config (unit ref, input mappings)
        │   └── data/
        │       └── data.json           # Output data values
        │
        └── write-poem-b2c/
            ├── node.yaml               # Node config
            └── data/
                ├── data.json           # Output data values + handover state
                └── outputs/
                    └── poem.md         # File outputs
```

---

## WorkGraph Definition (work-graph.yaml)

The graph structure - node IDs and edges. Does NOT contain node config or runtime state.

```yaml
# .chainglass/work-graphs/poem-workflow/work-graph.yaml

slug: poem-workflow
version: "1.0.0"
description: Generate a poem based on user input
created_at: "2026-01-27T10:00:00Z"

# Node IDs only (config lives in node.yaml)
nodes:
  - start
  - user-input-text-a7f
  - write-poem-b2c

# Edge declarations (directed: from → to)
edges:
  - from: start
    to: user-input-text-a7f

  - from: user-input-text-a7f
    to: write-poem-b2c
```

### Diverging Paths Example

```yaml
# Graph with one input feeding two outputs

slug: content-workflow
version: "1.0.0"

nodes:
  - start
  - user-input-text-a7f
  - write-poem-b2c
  - write-essay-d4e

edges:
  - from: start
    to: user-input-text-a7f

  # Diverging: same source, two destinations
  - from: user-input-text-a7f
    to: write-poem-b2c

  - from: user-input-text-a7f
    to: write-essay-d4e
```

---

## WorkGraph State (state.json)

Runtime state - node statuses, timestamps. Updated as execution progresses.

```json
{
  "graph_status": "in_progress",
  "updated_at": "2026-01-27T10:30:00Z",
  "nodes": {
    "start": {
      "status": "complete",
      "started_at": "2026-01-27T10:00:00Z",
      "completed_at": "2026-01-27T10:00:00Z"
    },
    "user-input-text-a7f": {
      "status": "complete",
      "started_at": "2026-01-27T10:05:00Z",
      "completed_at": "2026-01-27T10:10:00Z"
    },
    "write-poem-b2c": {
      "status": "running",
      "started_at": "2026-01-27T10:15:00Z"
    }
  }
}
```

### Node Status Values

| Status | Meaning | Set By |
|--------|---------|--------|
| `pending` | Upstream not complete | Computed |
| `ready` | Can be started | Computed |
| `running` | Work in progress | `start` command |
| `waiting-question` | Agent asked question | `ask` command |
| `blocked-error` | Agent reported error | `error` command |
| `complete` | Finished successfully | `end` command |

**Computed statuses**: `pending` and `ready` are not stored - they're computed based on upstream node completion and edge structure.

---

## WorkNode Config (node.yaml)

Per-node configuration. Links node to its unit and stores config + input mappings.

### Start Node

```yaml
# nodes/start/node.yaml

id: start
type: start
created_at: "2026-01-27T10:00:00Z"
```

Start nodes have no unit, no inputs, no outputs. They anchor the graph.

### UserInputUnit Node

```yaml
# nodes/user-input-text-a7f/node.yaml

id: user-input-text-a7f
unit: user-input-text
created_at: "2026-01-27T10:00:00Z"

# Config values for {{config.X}} placeholders
config:
  prompt: "What would you like a poem about?"

# No inputs for this node
inputs: {}
```

### AgentUnit Node with Input Mappings

```yaml
# nodes/write-poem-b2c/node.yaml

id: write-poem-b2c
unit: write-poem
created_at: "2026-01-27T10:00:00Z"

config:
  style: sonnet

# Input mappings: my_input <- source_node.output
inputs:
  topic:
    from: user-input-text-a7f
    output: text
```

### Same Unit, Different Node

```yaml
# nodes/write-poem-d4e/node.yaml (second write-poem node)

id: write-poem-d4e
unit: write-poem
created_at: "2026-01-27T10:20:00Z"

config:
  style: haiku

inputs:
  topic:
    from: user-input-text-a7f
    output: text
```

---

## WorkNode Data (data/data.json)

Runtime data for a node - outputs and handover state.

### Basic Structure

```json
{
  "outputs": {
    "title": "Sunset Dreams",
    "word_count": 247
  }
}
```

### With Handover (Question)

```json
{
  "outputs": {},
  "handover": {
    "reason": "question",
    "question": {
      "type": "single",
      "prompt": "Which format should I use?",
      "options": [
        { "key": "A", "label": "Markdown" },
        { "key": "B", "label": "Plain text" }
      ],
      "answer": null
    }
  }
}
```

### With Handover (Answered)

```json
{
  "outputs": {},
  "handover": {
    "reason": "question",
    "question": {
      "type": "single",
      "prompt": "Which format should I use?",
      "options": [
        { "key": "A", "label": "Markdown" },
        { "key": "B", "label": "Plain text" }
      ],
      "answer": {
        "selection": "A",
        "text": "Markdown works best for this project"
      }
    }
  }
}
```

### With Handover (Error)

```json
{
  "outputs": {},
  "handover": {
    "reason": "error",
    "error": {
      "message": "Cannot find reference file: style-guide.md",
      "timestamp": "2026-01-27T10:30:00Z"
    }
  }
}
```

### Complete Node

```json
{
  "outputs": {
    "title": "Sunset Dreams",
    "word_count": 247
  },
  "handover": null
}
```

---

## TypeScript Types

```typescript
// ============================================
// WorkGraph Types
// ============================================

/** Graph-level status */
type GraphStatus = 'pending' | 'in_progress' | 'complete' | 'failed';

/** Node-level status */
type NodeStatus =
  | 'pending'           // Computed: upstream not complete
  | 'ready'             // Computed: can be started
  | 'running'           // Stored: work in progress
  | 'waiting-question'  // Stored: agent asked question
  | 'blocked-error'     // Stored: agent reported error
  | 'complete';         // Stored: finished successfully

/** Edge in the graph */
interface GraphEdge {
  from: string;         // Source node ID
  to: string;           // Target node ID
}

/** WorkGraph definition (work-graph.yaml) */
interface WorkGraphDefinition {
  slug: string;
  version: string;
  description?: string;
  created_at: string;
  nodes: string[];      // Just node IDs (config in node.yaml)
  edges: GraphEdge[];
}

// ============================================
// WorkGraph State Types
// ============================================

/** Per-node runtime state */
interface NodeState {
  status: NodeStatus;
  started_at?: string;
  completed_at?: string;
}

/** WorkGraph runtime state (state.json) */
interface WorkGraphState {
  graph_status: GraphStatus;
  updated_at: string;
  nodes: Record<string, NodeState>;
}

// ============================================
// WorkNode Types
// ============================================

/** Input mapping for a node */
interface InputMapping {
  from: string;         // Source node ID
  output: string;       // Source node's output name
}

/** WorkNode config (node.yaml) */
interface WorkNodeConfig {
  id: string;
  type?: 'start';
  unit?: string;
  created_at: string;
  config?: Record<string, unknown>;
  inputs?: Record<string, InputMapping>;
}

// ============================================
// WorkNode Data Types
// ============================================

/** Question option */
interface QuestionOption {
  key: string;          // Single letter: A, B, C, etc.
  label: string;
  description?: string;
}

/** Question in handover */
interface HandoverQuestion {
  type: 'text' | 'single' | 'multi' | 'confirm';
  prompt: string;
  options?: QuestionOption[];
  answer?: {
    selection?: string | string[];  // For single/multi
    text?: string;                  // Always allowed
    confirmed?: boolean;            // For confirm
  } | null;
}

/** Error in handover */
interface HandoverError {
  message: string;
  timestamp: string;
}

/** Handover state */
interface Handover {
  reason: 'question' | 'error' | 'complete';
  question?: HandoverQuestion;
  error?: HandoverError;
}

/** WorkNode data (data/data.json) */
interface WorkNodeData {
  outputs: Record<string, unknown>;
  handover?: Handover | null;
}
```

---

## JSON Schemas

### work-graph.yaml Schema

```typescript
export const WORK_GRAPH_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://chainglass.dev/schemas/work-graph.schema.json',
  title: 'WorkGraph Definition',
  type: 'object',
  required: ['slug', 'version', 'nodes', 'edges'],
  properties: {
    slug: {
      type: 'string',
      pattern: '^[a-z][a-z0-9-]*$',
      description: 'Unique graph identifier',
    },
    version: {
      type: 'string',
      pattern: '^\\d+\\.\\d+\\.\\d+$',
    },
    description: { type: 'string' },
    created_at: {
      type: 'string',
      format: 'date-time',
    },
    nodes: {
      type: 'array',
      items: {
        type: 'string',
        description: 'Node ID: "start" or "<unit>-<guid>" (e.g., "write-poem-b2c")',
      },
      minItems: 1,
    },
    edges: {
      type: 'array',
      items: { $ref: '#/$defs/edge' },
    },
  },
  $defs: {
    edge: {
      type: 'object',
      required: ['from', 'to'],
      properties: {
        from: { type: 'string' },
        to: { type: 'string' },
      },
    },
  },
} as const;
```

### state.json Schema

```typescript
export const WORK_GRAPH_STATE_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://chainglass.dev/schemas/work-graph-state.schema.json',
  title: 'WorkGraph State',
  type: 'object',
  required: ['graph_status', 'updated_at', 'nodes'],
  properties: {
    graph_status: {
      enum: ['pending', 'in_progress', 'complete', 'failed'],
    },
    updated_at: {
      type: 'string',
      format: 'date-time',
    },
    nodes: {
      type: 'object',
      additionalProperties: { $ref: '#/$defs/nodeState' },
    },
  },
  $defs: {
    nodeState: {
      type: 'object',
      required: ['status'],
      properties: {
        status: {
          enum: ['running', 'waiting-question', 'blocked-error', 'complete'],
          description: 'Stored status (pending/ready are computed)',
        },
        started_at: { type: 'string', format: 'date-time' },
        completed_at: { type: 'string', format: 'date-time' },
      },
    },
  },
} as const;
```

### node.yaml Schema

```typescript
export const WORK_NODE_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://chainglass.dev/schemas/work-node.schema.json',
  title: 'WorkNode Config',
  type: 'object',
  required: ['id', 'created_at'],
  properties: {
    id: {
      type: 'string',
      description: 'Node ID: "start" or "<unit>-<guid>"',
    },
    type: {
      enum: ['start'],
      description: 'Only for start node',
    },
    unit: {
      type: 'string',
      description: 'WorkUnit slug (required unless type="start")',
    },
    created_at: {
      type: 'string',
      format: 'date-time',
    },
    config: {
      type: 'object',
      description: 'Config values for {{config.X}} placeholders',
    },
    inputs: {
      type: 'object',
      additionalProperties: { $ref: '#/$defs/inputMapping' },
      description: 'Input mappings: my_input <- source.output',
    },
  },
  $defs: {
    inputMapping: {
      type: 'object',
      required: ['from', 'output'],
      properties: {
        from: {
          type: 'string',
          description: 'Source node ID',
        },
        output: {
          type: 'string',
          description: 'Source node output name',
        },
      },
    },
  },
} as const;
```

### data.json Schema

```typescript
export const WORK_NODE_DATA_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://chainglass.dev/schemas/work-node-data.schema.json',
  title: 'WorkNode Data',
  type: 'object',
  required: ['outputs'],
  properties: {
    outputs: {
      type: 'object',
      description: 'Output values keyed by output name',
    },
    handover: {
      oneOf: [
        { $ref: '#/$defs/handover' },
        { type: 'null' },
      ],
    },
  },
  $defs: {
    handover: {
      type: 'object',
      required: ['reason'],
      properties: {
        reason: { enum: ['question', 'error', 'complete'] },
        question: { $ref: '#/$defs/question' },
        error: { $ref: '#/$defs/error' },
      },
    },
    question: {
      type: 'object',
      required: ['type', 'prompt'],
      properties: {
        type: { enum: ['text', 'single', 'multi', 'confirm'] },
        prompt: { type: 'string' },
        options: {
          type: 'array',
          items: { $ref: '#/$defs/option' },
        },
        answer: {
          oneOf: [
            { $ref: '#/$defs/answer' },
            { type: 'null' },
          ],
        },
      },
    },
    option: {
      type: 'object',
      required: ['key', 'label'],
      properties: {
        key: { type: 'string', pattern: '^[A-Z]$' },
        label: { type: 'string' },
        description: { type: 'string' },
      },
    },
    answer: {
      type: 'object',
      properties: {
        selection: {
          oneOf: [
            { type: 'string' },
            { type: 'array', items: { type: 'string' } },
          ],
        },
        text: { type: 'string' },
        confirmed: { type: 'boolean' },
      },
    },
    error: {
      type: 'object',
      required: ['message', 'timestamp'],
      properties: {
        message: { type: 'string' },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
  },
} as const;
```

---

## Input Resolution

When a node needs an input, the CLI:

1. Looks up the input mapping in `node.yaml`
2. Finds the source node
3. Reads the source node's `data/data.json`
4. Returns the value from `outputs[output_name]`

For file inputs:
1. Same lookup process
2. Returns path: `nodes/<source_id>/data/outputs/<filename>`

**No caching** - inputs are resolved fresh each time.

---

## Graph Operations

### Create Graph

1. Create directory `.chainglass/work-graphs/<slug>/`
2. Create `work-graph.yaml` with start node
3. Create `state.json` with start node complete
4. Create `nodes/001-start/node.yaml`

### Add Node After

1. Load `work-graph.yaml`
2. Load target WorkUnit from `.chainglass/units/<slug>/`
3. Validate: predecessor outputs satisfy unit inputs (names must match)
4. Generate node ID: `<seq>-<unit-slug>`
5. Create input mappings from predecessor
6. Add node to `nodes` array
7. Add edge to `edges` array
8. Create node directory with `node.yaml`
9. Save `work-graph.yaml`

### Remove Node

1. Check for dependents (nodes with edges from this node)
2. If dependents exist: error (unless --cascade)
3. Remove edges pointing to/from this node
4. Remove from `nodes` array
5. Delete node directory
6. Save `work-graph.yaml`

---

## Validation Rules

1. **Acyclic**: No cycles in edge graph
2. **Connected**: All nodes reachable from start (except start itself)
3. **Single predecessor**: Each node has exactly one incoming edge (no merging in v1)
4. **Valid units**: All unit references exist in `.chainglass/units/`
5. **Input satisfaction**: All required inputs have mappings
6. **Type compatibility**: Mapped output type matches input type

---

## Open Questions

### Q1: Should work-graph.yaml store nodes inline or reference node.yaml files?

**RESOLVED**: work-graph.yaml stores only node IDs and edges (structure).
All node config (unit, config, inputs) lives in node.yaml.

This keeps work-graph.yaml clean and makes node.yaml the single source of truth for node configuration.

### Q2: Should state.json store computed statuses (pending/ready)?

**RESOLVED**: No - compute them from graph structure and stored statuses.

- Stored: `running`, `waiting-question`, `blocked-error`, `complete`
- Computed: `pending` (upstream not complete), `ready` (can start)

---

## Next Steps

1. Review with user
2. Finalize any open questions
3. Create implementation plan
