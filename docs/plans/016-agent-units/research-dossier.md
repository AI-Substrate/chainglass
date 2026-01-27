# WorkGraph Research Dossier

**Generated**: 2026-01-27
**Branch**: 016-agent-units
**Status**: Research Complete - Ready for Workshop

## Executive Summary

**WorkGraph** is a new system replacing the legacy workflow/phase architecture. Key principles:

- **Live graphs** - No template vs run distinction; graphs are living documents
- **WorkUnits** - Reusable building blocks (AgentUnit, CodeUnit, AskUnit)
- **Graph-based** - Simple DAG structure, filesystem-based
- **CLI-driven** - All operations available via commands
- **Validate on insert** - Input/output compatibility checked when adding nodes

This is a clean restart. The legacy `packages/workflow/` becomes legacy code.

---

## Command Flows

### Graph Lifecycle

```
┌─────────────────────────────────────────────────────────────────────┐
│                        GRAPH CREATION                                │
└─────────────────────────────────────────────────────────────────────┘

$ cg graph create poem-workflow
  │
  ├─► Create folder: .chainglass/graphs/poem-workflow/
  ├─► Create graph.yaml with metadata
  ├─► Auto-create start node: poem-workflow-001-start
  │     └─► outputs: [] (empty - start has no outputs)
  └─► Return: "Created graph 'poem-workflow' with start node"

Result:
  .chainglass/graphs/poem-workflow/
  ├── graph.yaml
  └── nodes/
      └── 001-start/
          └── node.yaml
```

### Adding Nodes (The Core Flow)

```
┌─────────────────────────────────────────────────────────────────────┐
│                     ADD NODE AFTER (Success Case)                    │
└─────────────────────────────────────────────────────────────────────┘

$ cg graph node add-after poem-workflow-001-start ask-text \
    --config prompt="What topic?" \
    --config output_name="topic"
  │
  ├─► Load graph from .chainglass/graphs/poem-workflow/graph.yaml
  ├─► Find predecessor node: poem-workflow-001-start
  ├─► Load unit definition from .chainglass/units/ask-text/unit.yaml
  ├─► Get predecessor outputs: [] (start has none)
  ├─► Check unit inputs: [] (ask-text has no required inputs) ✓
  ├─► Generate node ID: poem-workflow-002-ask-text
  ├─► Apply config to unit template
  │     └─► outputs: [{ name: "topic", type: "text" }]
  ├─► Create edge: 001-start → 002-ask-text
  ├─► Save updated graph.yaml
  ├─► Create node folder: nodes/002-ask-text/node.yaml
  └─► Return: "Added 'ask-text' as poem-workflow-002-ask-text"


┌─────────────────────────────────────────────────────────────────────┐
│                     ADD NODE AFTER (Failure Case)                    │
└─────────────────────────────────────────────────────────────────────┘

$ cg graph node add-after poem-workflow-001-start write-poem
  │
  ├─► Load graph from .chainglass/graphs/poem-workflow/graph.yaml
  ├─► Find predecessor node: poem-workflow-001-start
  ├─► Load unit definition from .chainglass/units/write-poem/unit.yaml
  ├─► Get predecessor outputs: [] (start has none)
  ├─► Check unit inputs: [{ name: "topic", type: "text", required: true }]
  │     └─► Looking for "topic:text" in predecessor outputs...
  │     └─► NOT FOUND ✗
  └─► Return ERROR:
        E103: Missing required input 'topic' (text)

        The unit 'write-poem' requires input 'topic' of type 'text',
        but 'poem-workflow-001-start' does not provide this output.

        Available outputs from predecessor: (none)

        Suggestion: Add an AskUnit that outputs 'topic' first:
          cg graph node add-after poem-workflow-001-start ask-text \
            --config prompt="What topic?" --config output_name="topic"


┌─────────────────────────────────────────────────────────────────────┐
│                     ADD NODE AFTER (Chained Success)                 │
└─────────────────────────────────────────────────────────────────────┘

$ cg graph node add-after poem-workflow-002-ask-text write-poem
  │
  ├─► Load graph
  ├─► Find predecessor: poem-workflow-002-ask-text
  ├─► Load unit: write-poem
  ├─► Get predecessor outputs: [{ name: "topic", type: "text" }]
  ├─► Check unit inputs: [{ name: "topic", type: "text", required: true }]
  │     └─► Looking for "topic:text"... FOUND ✓
  ├─► Generate node ID: poem-workflow-003-write-poem
  ├─► Create edge with input mapping:
  │     from: poem-workflow-002-ask-text
  │     to: poem-workflow-003-write-poem
  │     mapping: { topic: "topic" }  // output name → input name
  ├─► Save graph.yaml
  ├─► Create node folder
  └─► Return: "Added 'write-poem' as poem-workflow-003-write-poem"
```

### Removing Nodes

```
┌─────────────────────────────────────────────────────────────────────┐
│                     REMOVE NODE (Blocked)                            │
└─────────────────────────────────────────────────────────────────────┘

$ cg graph node remove poem-workflow-002-ask-text
  │
  ├─► Load graph
  ├─► Find node: poem-workflow-002-ask-text
  ├─► Check dependents (nodes that have edges FROM this node)
  │     └─► Found: poem-workflow-003-write-poem
  └─► Return ERROR:
        E102: Cannot delete node - 1 unit depends on this

        Dependents:
          - poem-workflow-003-write-poem (needs: topic)

        Remove dependents first, or use --cascade to remove all.


┌─────────────────────────────────────────────────────────────────────┐
│                     REMOVE NODE (Success - Leaf)                     │
└─────────────────────────────────────────────────────────────────────┘

$ cg graph node remove poem-workflow-003-write-poem
  │
  ├─► Load graph
  ├─► Find node: poem-workflow-003-write-poem
  ├─► Check dependents: [] (none - it's a leaf)
  ├─► Remove edges pointing TO this node
  ├─► Remove node from graph.yaml
  ├─► Delete node folder: nodes/003-write-poem/
  └─► Return: "Removed node poem-workflow-003-write-poem"
```

### Graph Execution

**Design Principle**: We never run an entire graph automatically. We never auto-select "next" node (DAGs can have parallel paths). Execution is always explicit by node slug.

```
┌─────────────────────────────────────────────────────────────────────┐
│                     GRAPH STATUS (See What's Ready)                  │
└─────────────────────────────────────────────────────────────────────┘

$ cg graph status poem-workflow
  │
  ├─► Load graph and state
  ├─► Compute status for each node
  │
  └─► Output:
        Graph: poem-workflow

        Nodes:
        ┌──────────────────────────────┬────────┬───────────┬─────────────────┐
        │ Node                         │ Type   │ Status    │ Inputs          │
        ├──────────────────────────────┼────────┼───────────┼─────────────────┤
        │ poem-workflow-001-start      │ start  │ complete  │ -               │
        │ poem-workflow-002-ask-text   │ ask    │ ready     │ (none)          │
        │ poem-workflow-003-write-poem │ agent  │ blocked   │ topic ✗         │
        └──────────────────────────────┴────────┴───────────┴─────────────────┘

        Ready to execute:
          - poem-workflow-002-ask-text (ask)

        Blocked:
          - poem-workflow-003-write-poem (waiting on: 002-ask-text)


┌─────────────────────────────────────────────────────────────────────┐
│                     GRAPH EXEC (Execute by Full Slug)                │
└─────────────────────────────────────────────────────────────────────┘

$ cg graph exec poem-workflow-002-ask-text
  │
  ├─► Load graph and state
  ├─► Find node by full slug
  ├─► Check if node can execute:
  │     └─► All predecessor nodes complete? ✓
  │     └─► All inputs available? ✓
  │
  ├─► Execute based on node type:
  │
  │   ┌─ Node: 002-ask-text (type: ask) ──────────────────┐
  │   │                                                    │
  │   │ This is an AskUnit - requires user input.          │
  │   │ Cannot auto-execute. Marking as 'waiting'.         │
  │   │                                                    │
  │   │ Status: waiting                                    │
  │   │                                                    │
  │   └────────────────────────────────────────────────────┘
  │
  └─► Return:
        Node 'poem-workflow-002-ask-text' is waiting for input.

        Prompt: "What would you like a poem about?"

        Provide answer with:
          cg graph answer poem-workflow-002-ask-text "your answer"


┌─────────────────────────────────────────────────────────────────────┐
│                     GRAPH EXEC (Re-entrant - Can Run Multiple Times) │
└─────────────────────────────────────────────────────────────────────┘

$ cg graph exec poem-workflow-003-write-poem
  │
  ├─► Load graph and state
  ├─► Find node by full slug
  ├─► Check if node can execute:
  │     └─► Predecessor 002-ask-text complete? ✓
  │     └─► Input 'topic' available? ✓ ("The ocean at sunset")
  │
  ├─► **Clear existing outputs** (if any)
  │     └─► Delete: nodes/003-write-poem/data/outputs/*
  │     └─► Reset node status to 'running'
  │
  ├─► Execute AgentUnit:
  │
  │   ┌─ Node: 003-write-poem (type: agent) ──────────────┐
  │   │                                                    │
  │   │ Resolving inputs...                                │
  │   │   topic = "The ocean at sunset"                    │
  │   │                                                    │
  │   │ Loading prompt template...                         │
  │   │ Launching agent...                                 │
  │   │                                                    │
  │   │ [Agent executes, produces outputs]                 │
  │   │                                                    │
  │   │ Outputs created:                                   │
  │   │   - outputs/poem.md (24 lines)                     │
  │   │                                                    │
  │   │ Status: complete                                   │
  │   │                                                    │
  │   └────────────────────────────────────────────────────┘
  │
  └─► Return:
        ✓ Node 'poem-workflow-003-write-poem' complete.

        Outputs:
          - poem: nodes/003-write-poem/data/outputs/poem.md


┌─────────────────────────────────────────────────────────────────────┐
│                     GRAPH EXEC (Blocked - Inputs Missing)            │
└─────────────────────────────────────────────────────────────────────┘

$ cg graph exec poem-workflow-003-write-poem
  │
  ├─► Load graph and state
  ├─► Find node by full slug
  ├─► Check if node can execute:
  │     └─► Predecessor 002-ask-text status: waiting
  │     └─► Input 'topic' not yet available ✗
  │
  └─► Return ERROR:
        E110: Cannot execute node - inputs not available

        Missing inputs:
          - topic (text) from poem-workflow-002-ask-text

        Blocked by:
          - poem-workflow-002-ask-text (status: waiting)

        Provide the blocking input:
          cg graph answer poem-workflow-002-ask-text "your answer"
```

### Re-running Nodes (Iteration Pattern)

```
┌─────────────────────────────────────────────────────────────────────┐
│                     GRAPH EXEC (Re-run Completed Node)               │
└─────────────────────────────────────────────────────────────────────┘

$ cg graph exec poem-workflow-003-write-poem   # Already complete, run again
  │
  ├─► Load graph and state
  ├─► Node status: complete (has existing outputs)
  │
  ├─► **Clear existing outputs**
  │     └─► Delete: nodes/003-write-poem/data/outputs/*
  │     └─► Reset status: complete → running
  │
  ├─► Re-resolve inputs (get fresh values from upstream)
  │     └─► topic = "The ocean at sunset" (from 002)
  │
  ├─► Execute agent again
  │     └─► [Agent runs, may produce different output]
  │
  ├─► Save new outputs
  │     └─► Status: complete
  │
  └─► Return:
        ✓ Node 're-executed. Previous outputs cleared.
        Outputs: poem.md (18 lines)  # Different this time


┌─────────────────────────────────────────────────────────────────────┐
│                     RE-RUN WITH DEPENDENTS (Warning)                 │
└─────────────────────────────────────────────────────────────────────┘

$ cg graph exec poem-workflow-002-ask-text   # Has dependent nodes
  │
  ├─► Check for completed dependents:
  │     └─► poem-workflow-003-write-poem: complete
  │
  └─► Return WARNING:
        ⚠ Node has completed dependents that used its outputs:
          - poem-workflow-003-write-poem

        Re-running will invalidate their inputs.

        Options:
          --cascade    Also reset dependent nodes
          --force      Re-run anyway, leave dependents stale

        Example:
          cg graph exec poem-workflow-002-ask-text --cascade
```

**Design**: Re-running a node doesn't auto-cascade. User must explicitly choose to reset dependents or leave them with potentially stale inputs.

---

### Answering Ask Nodes Directly

```
┌─────────────────────────────────────────────────────────────────────┐
│                     GRAPH ANSWER (Provide Input)                     │
└─────────────────────────────────────────────────────────────────────┘

$ cg graph answer poem-workflow-002-ask-text "The ocean at sunset"
  │
  ├─► Load graph
  ├─► Find node: poem-workflow-002-ask-text
  ├─► Verify node type is 'ask'
  ├─► Verify node status is 'pending' or 'waiting'
  ├─► Save answer to: nodes/002-ask-text/data/answer.json
  │     {
  │       "answered_at": "2026-01-27T10:30:00Z",
  │       "value": "The ocean at sunset",
  │       "output": {
  │         "topic": "The ocean at sunset"
  │       }
  │     }
  ├─► Update node status: complete
  ├─► Save graph state
  └─► Return: "Answer recorded. Node outputs: topic"
```

### Graph Status & Inspection

```
┌─────────────────────────────────────────────────────────────────────┐
│                     GRAPH STATUS                                     │
└─────────────────────────────────────────────────────────────────────┘

$ cg graph status poem-workflow
  │
  └─► Output:
        Graph: poem-workflow
        Status: in_progress

        Nodes:
        ┌──────────────────────────────┬──────────┬───────────┐
        │ Node                         │ Type     │ Status    │
        ├──────────────────────────────┼──────────┼───────────┤
        │ poem-workflow-001-start      │ start    │ complete  │
        │ poem-workflow-002-ask-text   │ ask      │ waiting   │
        │ poem-workflow-003-write-poem │ agent    │ pending   │
        └──────────────────────────────┴──────────┴───────────┘

        Next action: Answer ask node or run 'cg graph run'


┌─────────────────────────────────────────────────────────────────────┐
│                     GRAPH SHOW (Structure)                           │
└─────────────────────────────────────────────────────────────────────┘

$ cg graph show poem-workflow
  │
  └─► Output:
        poem-workflow
        │
        └─► start (poem-workflow-001-start)
            │   outputs: (none)
            │
            └─► ask-text (poem-workflow-002-ask-text) [waiting]
                │   config: prompt="What topic?"
                │   outputs: topic:text
                │
                └─► write-poem (poem-workflow-003-write-poem) [pending]
                    │   inputs: topic:text ← 002-ask-text
                    │   outputs: poem:file
                    │
                    (end)
```

### Unit Management

```
┌─────────────────────────────────────────────────────────────────────┐
│                     UNIT LIST                                        │
└─────────────────────────────────────────────────────────────────────┘

$ cg unit list
  │
  └─► Output:
        Available Units:
        ┌─────────────────┬─────────────────────────────┬───────┐
        │ Slug            │ Description                 │ Type  │
        ├─────────────────┼─────────────────────────────┼───────┤
        │ ask-text        │ Ask user for text input     │ ask   │
        │ ask-choice      │ Ask user to select option   │ ask   │
        │ ask-confirm     │ Ask user yes/no             │ ask   │
        │ write-poem      │ Write a poem with Claude    │ agent │
        │ summarize       │ Summarize text with Claude  │ agent │
        │ format-json     │ Format/validate JSON        │ code  │
        └─────────────────┴─────────────────────────────┴───────┘

        Use: cg unit info <slug> for details


┌─────────────────────────────────────────────────────────────────────┐
│                     UNIT INFO                                        │
└─────────────────────────────────────────────────────────────────────┘

$ cg unit info write-poem
  │
  └─► Output:
        Unit: write-poem
        Type: agent
        Description: Write a creative poem about a given topic

        Inputs:
          - topic (text) [required]

        Outputs:
          - poem (file)

        Agent Config:
          prompt_template: commands/main.md

        Location: .chainglass/units/write-poem/
```

### Complete Example Session

```
┌─────────────────────────────────────────────────────────────────────┐
│                     FULL SESSION EXAMPLE                             │
└─────────────────────────────────────────────────────────────────────┘

# 1. Create a new graph
$ cg graph create poem-workflow
✓ Created graph 'poem-workflow' with start node

# 2. Try to add write-poem directly (FAILS)
$ cg graph node add-after poem-workflow-001-start write-poem
✗ E103: Missing required input 'topic' (text)
  Suggestion: Add an AskUnit that outputs 'topic' first

# 3. Add ask-text first
$ cg graph node add-after poem-workflow-001-start ask-text \
    --config prompt="What would you like a poem about?" \
    --config output_name="topic"
✓ Added 'ask-text' as poem-workflow-002-ask-text

# 4. Now add write-poem (SUCCEEDS)
$ cg graph node add-after poem-workflow-002-ask-text write-poem
✓ Added 'write-poem' as poem-workflow-003-write-poem
  Input mapping: topic ← poem-workflow-002-ask-text.topic

# 5. Check the graph structure
$ cg graph show poem-workflow
poem-workflow
└─► start
    └─► ask-text [outputs: topic:text]
        └─► write-poem [inputs: topic:text]

# 6. Check what's ready
$ cg graph status poem-workflow
Ready: poem-workflow-002-ask-text (ask)
Blocked: poem-workflow-003-write-poem (waiting on: 002-ask-text)

# 7. Execute the ask node (marks it waiting for input)
$ cg graph exec poem-workflow-002-ask-text
Node waiting for input.
Prompt: "What would you like a poem about?"

# 8. Provide the answer
$ cg graph answer poem-workflow-002-ask-text "The ocean at sunset"
✓ Answer recorded. Node complete. Outputs: topic

# 9. Check status again
$ cg graph status poem-workflow
Ready: poem-workflow-003-write-poem (agent)

# 10. Execute the agent node
$ cg graph exec poem-workflow-003-write-poem
Resolving inputs...
  topic = "The ocean at sunset"
Launching agent...
✓ Node complete. Outputs: poem.md (24 lines)

# 11. Check final status
$ cg graph status poem-workflow
All nodes complete.

# 7. View outputs
$ cat .chainglass/graphs/poem-workflow/nodes/003-write-poem/data/outputs/poem.md
```

---

## Data Model

### Folder Structure

```
.chainglass/
├── units/                              # Reusable unit library
│   ├── ask-text/
│   │   └── unit.yaml                   # Unit definition
│   ├── ask-choice/
│   │   └── unit.yaml
│   ├── write-poem/
│   │   ├── unit.yaml
│   │   └── commands/
│   │       └── main.md                 # Agent prompt template
│   └── format-json/
│       ├── unit.yaml
│       └── scripts/
│           └── main.js                 # Code unit script
│
└── graphs/                             # Live WorkGraphs
    └── poem-workflow/
        ├── graph.yaml                  # Graph definition (nodes + edges)
        ├── graph-state.json            # Runtime state (status per node)
        └── nodes/                      # Per-node instance data
            ├── 001-start/
            │   └── node.yaml           # Node instance config
            ├── 002-ask-text/
            │   ├── node.yaml
            │   └── data/
            │       └── answer.json     # User's answer
            └── 003-write-poem/
                ├── node.yaml
                └── data/
                    ├── inputs/         # Resolved inputs
                    │   └── topic.txt
                    └── outputs/        # Produced outputs
                        └── poem.md
```

### graph.yaml

```yaml
kind: workgraph
slug: poem-workflow
name: "Poem Writing Workflow"
created_at: "2026-01-27T10:00:00Z"
updated_at: "2026-01-27T10:30:00Z"

nodes:
  - id: "poem-workflow-001-start"
    type: start
    sequence: 1
    outputs: []

  - id: "poem-workflow-002-ask-text"
    type: ask
    sequence: 2
    unit: "ask-text"
    config:
      prompt: "What would you like a poem about?"
      output_name: "topic"
    outputs:
      - name: topic
        type: text

  - id: "poem-workflow-003-write-poem"
    type: agent
    sequence: 3
    unit: "write-poem"
    inputs:
      - name: topic
        type: text
        from_node: "poem-workflow-002-ask-text"
        from_output: "topic"
    outputs:
      - name: poem
        type: file

edges:
  - from: "poem-workflow-001-start"
    to: "poem-workflow-002-ask-text"
  - from: "poem-workflow-002-ask-text"
    to: "poem-workflow-003-write-poem"
```

### graph-state.json

```json
{
  "graph": "poem-workflow",
  "status": "in_progress",
  "started_at": "2026-01-27T10:30:00Z",
  "updated_at": "2026-01-27T10:35:00Z",
  "nodes": {
    "poem-workflow-001-start": {
      "status": "complete",
      "completed_at": "2026-01-27T10:30:01Z"
    },
    "poem-workflow-002-ask-text": {
      "status": "complete",
      "completed_at": "2026-01-27T10:32:00Z",
      "outputs": {
        "topic": "The ocean at sunset"
      }
    },
    "poem-workflow-003-write-poem": {
      "status": "pending"
    }
  }
}
```

### Unit Definition (unit.yaml)

```yaml
# units/ask-text/unit.yaml
kind: unit
type: ask
slug: ask-text
name: "Ask for Text Input"
description: "Prompts user for text input"

inputs: []  # Ask units have no inputs - they create data

outputs:
  - name: "{{config.output_name}}"
    type: text

config_schema:
  prompt:
    type: text
    required: true
    description: "Question to ask the user"
  output_name:
    type: text
    required: true
    default: "answer"
    description: "Name of the output variable"
```

```yaml
# units/write-poem/unit.yaml
kind: unit
type: agent
slug: write-poem
name: "Write a Poem"
description: "Uses Claude to write a creative poem about a topic"

inputs:
  - name: topic
    type: text
    required: true
    description: "The topic for the poem"

outputs:
  - name: poem
    type: file
    description: "The generated poem"

agent:
  prompt_template: commands/main.md
  system_prompt: |
    You are a creative poet. Write beautiful, evocative poetry.
```

```markdown
<!-- units/write-poem/commands/main.md -->
# Write a Poem

Write a creative poem about the following topic:

**Topic**: {{inputs.topic}}

## Requirements
- The poem should be 12-20 lines
- Use vivid imagery and metaphor
- Save the poem to `outputs/poem.md`
```

---

## Type System

Simple 4-type system:

| Type | Description | Example Value |
|------|-------------|---------------|
| `text` | String content | `"The ocean at sunset"` |
| `number` | Numeric value | `42`, `3.14` |
| `file` | Path to a file | `outputs/poem.md` |
| `json` | Structured data | `{"items": [1,2,3]}` |

### Compatibility Matrix

| From → To | text | number | file | json |
|-----------|------|--------|------|------|
| **text** | ✓ | ✗ | ✗ | ✗ |
| **number** | ✓ (coerce) | ✓ | ✗ | ✗ |
| **file** | ✗ | ✗ | ✓ | ✗ |
| **json** | ✓ (serialize) | ✗ | ✗ | ✓ |

---

## Critical Traps to Avoid

### Trap 1: Cycle Detection Lateness
**Problem**: Cycles only detected at execution time.
**Prevention**: Check for cycles on EVERY edge insertion before persisting.

### Trap 2: Orphaned Nodes on Delete
**Problem**: Deleting a node leaves dangling references.
**Prevention**: Block deletion if dependents exist; require `--cascade` for forced removal.

### Trap 3: Type Mismatch on Insert
**Problem**: Node inserted without compatible inputs.
**Prevention**: Validate input/output compatibility at insertion time (this is our core feature).

### Trap 4: Node ID Collision
**Problem**: Duplicate node IDs in graph.
**Prevention**: Use compound IDs: `<graph>-<sequence>-<unit>`.

### Trap 5: Rename Breaks References
**Problem**: Renaming node breaks edges.
**Prevention**: IDs are immutable; only display names can change.

### Trap 6: File System Race Condition
**Problem**: Concurrent writes corrupt graph file.
**Prevention**: Atomic write pattern (write to temp, then rename).

### Trap 7: Multiple Entry Points
**Problem**: Ambiguous execution order.
**Prevention**: Enforce single start node per graph.

### Trap 8: Manual JSON Edit Corruption
**Problem**: User edits file, introduces errors.
**Prevention**: Validate on every load; provide `cg graph validate` command.

---

## Node Types

### Start Node
- Auto-created when graph is created
- **No outputs** - it's just an anchor
- Cannot be deleted
- Exactly one per graph

### AskUnit
- **No inputs** - it creates data from user interaction
- Outputs whatever is configured
- Blocks execution until answered
- Types: ask-text, ask-choice, ask-confirm

### AgentUnit
- Declared inputs (must be satisfied from upstream)
- Declared outputs
- Contains prompt template
- Executed by Claude/Copilot

### CodeUnit (Future)
- Declared inputs/outputs
- Contains script path
- Executed by Node/Python/Bash runtime

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| No template/run split | Live graphs only | Simpler mental model |
| File-based state | YAML + JSON | No database, inspectable, git-friendly |
| Validate on insert | Not on execute | Fail fast, clear errors |
| Single start node | Enforced | Avoids ambiguity |
| Compound node IDs | `graph-seq-unit` | Unique, stable, readable |
| Simple type system | 4 types | Avoid over-engineering |
| AskUnit for inputs | Explicit node | Clear data provenance |
| Edges explicit in graph.yaml | Not computed | Inspectable, modifiable |
| Explicit node execution | By full slug only, no "next" | DAGs have parallel paths; user chooses which to run |
| Re-entrant execution | Run same node multiple times | Clears outputs, re-runs; iterate until satisfied |

---

## Migration from Legacy Workflow

The legacy `packages/workflow/` system will remain but be deprecated. Key differences:

| Aspect | Legacy Workflow | WorkGraph |
|--------|-----------------|-----------|
| Structure | Template → Checkpoint → Run | Live graph only |
| Phases | Ordered sequence | DAG with edges |
| Inputs | from_phase reference | from_node explicit |
| State | wf-status.json + wf-phase.json | graph-state.json |
| Execution | prepare → validate → finalize | exec <node-slug> |
| Auto-next | N/A (linear phases) | Not supported (DAG = parallel paths) |
| User input | MessageInput in phase | AskUnit node |

---

## Open Questions for Workshop

1. **Node ID format**: `<graph>-<seq>-<unit>` or simpler?
2. **Branching**: Support multiple paths from one node? (DAG vs linear)
3. **Merging**: Support multiple inputs to one node? (diamond patterns)
4. **Looping**: Ever allow cycles? (probably no)
5. **Subgraphs**: Nest graphs inside graphs? (probably later)
6. **Versioning**: Checkpoint graphs like workflows? Or just git?
7. **Sharing**: Unit registry for team sharing? (probably later)

---

## Next Steps

1. **Workshop the concept** - Refine based on discussion
2. **Write specification** - Formal spec for implementation
3. **Create unit library scaffold** - Basic ask-text, ask-choice units
4. **Implement graph commands** - create, show, node add-after
5. **Implement execution** - run, step, answer
6. **Migrate/deprecate legacy** - Mark packages/workflow as legacy

---

**Research Status**: Complete
**Ready for**: Concept workshop and specification
