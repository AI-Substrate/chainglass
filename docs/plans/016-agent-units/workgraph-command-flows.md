# WorkGraph Command Flows

Reference document showing all CLI commands and their execution flows.

## Terminology

| Term | Meaning |
|------|---------|
| **Work-Graph** | A DAG of work-nodes representing a workflow |
| **Work-Node** | An instance in a work-graph, executes one unit |
| **Work-Unit** | A reusable template (AgentUnit, CodeUnit, UserInputUnit) |

---

## Command Summary

### Work-Graph Commands
| Command | Purpose |
|---------|---------|
| `cg wg create <slug>` | Create new work-graph with start node |
| `cg wg show <slug>` | Display work-graph structure as tree |
| `cg wg status <slug>` | Show execution status of all work-nodes |

### Work-Node Structure Commands
| Command | Purpose |
|---------|---------|
| `cg wg node add-after <node> <unit>` | Add unit after existing work-node |
| `cg wg node remove <node>` | Remove a leaf work-node |

### Work-Node Execution Commands (used by orchestrator)
| Command | Purpose |
|---------|---------|
| `cg wg node <slug> can-run` | Check if upstream inputs available |
| `cg wg node <slug> exec --type <agent>` | Launch agent with bootstrap prompt |
| `cg wg node <slug> exec --type <agent> --resume` | Resume agent after answering question |
| `cg wg node <slug> handover-reason` | Check why agent handed back (question/error/complete) |
| `cg wg node <slug> question` | View pending question details |
| `cg wg node <slug> answer <value>` | Answer pending question |
| `cg wg node <slug> clear` | Remove all outputs (status → ready) |

### Work-Node Lifecycle Commands (used by agent inside node)
| Command | Purpose |
|---------|---------|
| `cg wg node <slug> start` | Agent signals it has taken over (status → running) |
| `cg wg node <slug> can-end` | Check if all required outputs are present |
| `cg wg node <slug> end` | Finish work (validates outputs, status → complete) |
| `cg wg node <slug> ask --type <type> ...` | Ask question, auto-handback to orchestrator |
| `cg wg node <slug> error <message>` | Report error, auto-handback to orchestrator |
| `cg wg node <slug> get-answer` | Get answer to previous question (after resume) |

### Work-Node I/O Commands (used by agents)
| Command | Purpose |
|---------|---------|
| `cg wg node <slug> list-inputs` | List declared inputs and values |
| `cg wg node <slug> get-input-file <name>` | Get path to file input |
| `cg wg node <slug> get-input-data <name>` | Get data value |
| `cg wg node <slug> list-outputs` | List declared outputs and status |
| `cg wg node <slug> save-output-file <name> <path>` | Save file output (overwrites) |
| `cg wg node <slug> save-output-data <name> <value>` | Save data value (overwrites) |

### Work-Unit Commands
| Command | Purpose |
|---------|---------|
| `cg wg unit list` | List available work-units |
| `cg wg unit info <slug>` | Show work-unit details |

---

## Storage Model

Work-units and work-graphs are stored **separately**. Work-units are reusable templates; work-graphs are instances containing work-nodes that reference units by slug.

```
.chainglass/
├── units/                          # SHARED work-unit library
│   ├── user-input-text/
│   │   └── unit.yaml               # UserInputUnit - reusable across ALL work-graphs
│   ├── user-input-choice/
│   │   └── unit.yaml               # UserInputUnit
│   ├── write-poem/
│   │   ├── unit.yaml               # AgentUnit
│   │   └── commands/main.md        # Prompt template
│   └── write-essay/
│       ├── unit.yaml               # AgentUnit
│       └── commands/main.md
│
└── work-graphs/                    # Per-work-graph instances
    ├── poem-workflow/
    │   ├── work-graph.yaml         # References units by slug
    │   ├── state.json              # Runtime state (work-node statuses)
    │   └── nodes/
    │       ├── 001-start/
    │       │   └── node.yaml       # Work-node config
    │       ├── 002-user-input/
    │       │   ├── node.yaml       # Work-node config (which unit, input mappings)
    │       │   └── data/
    │       │       └── data.json   # Output data values for this work-node
    │       └── 003-write-poem/
    │           ├── node.yaml
    │           └── data/
    │               ├── data.json   # Output data values
    │               └── outputs/
    │                   └── poem.md # File outputs stored as files
    │
    └── content-workflow/
        ├── work-graph.yaml
        └── nodes/
            ├── ...
```

**Key distinction**:
- **Work-Units** (`units/`) = reusable templates (AgentUnit, CodeUnit, UserInputUnit)
- **Work-Graphs** (`work-graphs/`) = instances containing work-nodes with execution state
- A work-unit like `write-poem` can be used in multiple work-graphs
- Each work-node stores its own `data/` (outputs) separate from the unit definition

### Work-Node Data Structure

Each work-node has **one data.json file** containing its output values only:

```json
{
  "outputs": {
    "title": "Sunset Dreams",
    "word_count": 247
  }
}
```

**Inputs are NOT stored** - they are resolved dynamically by traversing the work-graph to the upstream work-node that provides them.

**File outputs** are stored as actual files in `data/outputs/`:
- `data.json` holds data output values (strings, numbers, JSON)
- `outputs/poem.md` holds file outputs (markdown, text, etc.)

---

## Work-Graph Topology

Work-graphs are **directed acyclic graphs (DAGs)** of work-nodes that support:

- **Diverging paths**: A single work-node can have multiple downstream children. All children receive the parent's outputs. Use `add-after` multiple times on the same parent.
- **Linear paths**: Simple A → B → C chains.
- **No cycles**: Adding an edge that would create a cycle is rejected.
- **No merging (v1)**: A work-node can only have one predecessor. Diamond patterns (A → B, A → C, B → D, C → D) are not supported in v1.

```
SUPPORTED (v1):

Linear:           Diverging:
  A                   A
  │                   │
  B                 ┌─┴─┐
  │                 B   C
  C                 │   │
                   (end)(end)

NOT SUPPORTED (v1):

Merging (diamond):    Cycles:
  A                     A ───┐
  │                     │    │
┌─┴─┐                   B    │
B   C                   │    │
└─┬─┘                   C ◄──┘
  D
```

---

## Work-Graph Lifecycle

### Create Work-Graph

```
$ cg wg create <slug>

┌─────────────────────────────────────────────────────────────┐
│ INPUT                                                       │
│   slug: "poem-workflow"                                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ VALIDATE                                                    │
│   • Slug is valid (lowercase, hyphens only)                │
│   • Work-graph doesn't already exist                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ CREATE STRUCTURE                                            │
│                                                             │
│   .chainglass/work-graphs/poem-workflow/                    │
│   ├── work-graph.yaml     # Work-graph definition           │
│   ├── state.json          # Runtime state                   │
│   └── nodes/                                                │
│       └── 001-start/                                        │
│           └── node.yaml   # Start work-node (no outputs)    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ OUTPUT                                                      │
│   ✓ Created work-graph 'poem-workflow' with start node      │
│   Start node: poem-workflow-001-start                       │
└─────────────────────────────────────────────────────────────┘
```

### Show Work-Graph Structure

```
$ cg wg show <slug>

┌─────────────────────────────────────────────────────────────┐
│ INPUT                                                       │
│   slug: "poem-workflow"                                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ LOAD                                                        │
│   • Read work-graph.yaml                                         │
│   • Parse nodes and edges                                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ OUTPUT (tree format - linear graph)                         │
│                                                             │
│   poem-workflow                                             │
│   │                                                         │
│   └─► start (poem-workflow-001-start)                       │
│       │   outputs: (none)                                   │
│       │                                                     │
│       └─► user-input-text (poem-workflow-002-user-input-text)             │
│           │   config: prompt="What topic?"                  │
│           │   outputs: topic:text                           │
│           │                                                 │
│           └─► write-poem (poem-workflow-003-write-poem)     │
│               │   inputs: topic:text ← 002-user-input-text         │
│               │   outputs: poem:file                        │
│               │                                             │
│               (end)                                         │
└─────────────────────────────────────────────────────────────┘
```

### Show Work-Graph Structure (Diverging Paths)

```
$ cg wg show <slug>

┌─────────────────────────────────────────────────────────────┐
│ OUTPUT (tree format - diverging graph)                      │
│                                                             │
│   content-workflow                                          │
│   │                                                         │
│   └─► start (content-workflow-001-start)                    │
│       │                                                     │
│       └─► user-input-text (content-workflow-002-user-input-text)          │
│           │   outputs: topic:text                           │
│           │                                                 │
│           ├─► write-poem (content-workflow-003-write-poem)  │
│           │   │   inputs: topic:text ← 002-user-input-text         │
│           │   │   outputs: poem:file                        │
│           │   (end)                                         │
│           │                                                 │
│           └─► write-essay (content-workflow-004-write-essay)│
│               │   inputs: topic:text ← 002-user-input-text         │
│               │   outputs: essay:file                       │
│               (end)                                         │
└─────────────────────────────────────────────────────────────┘

   Note: Both write-poem and write-essay receive the same
   'topic' output from user-input-text. They can be executed in
   any order (or in parallel in future versions).
```

### Work-Graph Status

```
$ cg wg status <slug>

┌─────────────────────────────────────────────────────────────┐
│ INPUT                                                       │
│   slug: "poem-workflow"                                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ LOAD                                                        │
│   • Read work-graph.yaml (structure)                             │
│   • Read state.json (runtime status)                  │
│   • Compute which nodes are ready/blocked                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ OUTPUT (table format)                                       │
│                                                             │
│   Graph: poem-workflow                                      │
│   Status: in_progress                                       │
│                                                             │
│   ┌────────────────────────────┬────────┬──────────┐        │
│   │ Node                       │ Type   │ Status   │        │
│   ├────────────────────────────┼────────┼──────────┤        │
│   │ poem-workflow-001-start    │ start  │ complete │        │
│   │ poem-workflow-002-user-input-text │ ask    │ ready    │        │
│   │ poem-workflow-003-write    │ agent  │ blocked  │        │
│   └────────────────────────────┴────────┴──────────┘        │
│                                                             │
│   Ready to execute:                                         │
│     • poem-workflow-002-user-input-text                            │
│                                                             │
│   Blocked:                                                  │
│     • poem-workflow-003-write (needs: 002-user-input-text)         │
└─────────────────────────────────────────────────────────────┘
```

### Work-Graph Status (Diverging Paths)

```
$ cg wg status content-workflow

┌─────────────────────────────────────────────────────────────┐
│ OUTPUT (multiple ready nodes)                               │
│                                                             │
│   Graph: content-workflow                                   │
│   Status: in_progress                                       │
│                                                             │
│   ┌─────────────────────────────────┬────────┬──────────┐   │
│   │ Node                            │ Type   │ Status   │   │
│   ├─────────────────────────────────┼────────┼──────────┤   │
│   │ content-workflow-001-start      │ start  │ complete │   │
│   │ content-workflow-002-user-input-text   │ ask    │ complete │   │
│   │ content-workflow-003-write-poem │ agent  │ ready    │   │
│   │ content-workflow-004-write-essay│ agent  │ ready    │   │
│   └─────────────────────────────────┴────────┴──────────┘   │
│                                                             │
│   Ready to execute (2):                                     │
│     • content-workflow-003-write-poem                       │
│     • content-workflow-004-write-essay                      │
│                                                             │
│   Note: Multiple nodes ready - execute by full slug.        │
│   They share inputs and can be run in any order.            │
└─────────────────────────────────────────────────────────────┘
```

---

## Work-Node Operations

### Add Work-Node After (Success)

```
$ cg wg node add-after <predecessor-node> <unit-slug> [--config key=value]

┌─────────────────────────────────────────────────────────────┐
│ INPUT                                                       │
│   predecessor: "poem-workflow-002-user-input-text"                 │
│   unit: "write-poem"                                        │
│   config: (none)                                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ LOAD                                                        │
│   • Load work-graph.yaml                                         │
│   • Find predecessor node                                   │
│   • Load unit definition from .chainglass/units/write-poem/ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ VALIDATE INPUTS                                             │
│                                                             │
│   Predecessor outputs:                                      │
│     • topic (text)                                          │
│                                                             │
│   Unit required inputs:                                     │
│     • topic (text) ← FOUND ✓                                │
│                                                             │
│   All required inputs satisfied ✓                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ CREATE NODE                                                 │
│                                                             │
│   • Generate ID: poem-workflow-003-write-poem               │
│   • Create input mapping: topic ← 002-user-input-text.topic        │
│   • Create edge: 002-user-input-text → 003-write-poem              │
│   • Create node folder: nodes/003-write-poem/               │
│   • Update work-graph.yaml                                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ OUTPUT                                                      │
│   ✓ Added 'write-poem' as poem-workflow-003-write-poem      │
│   Input mapping: topic ← poem-workflow-002-user-input-text.topic   │
└─────────────────────────────────────────────────────────────┘
```

### Add Multiple Work-Nodes After Same Parent (Diverging)

```
$ cg wg node add-after <predecessor-node> <unit-slug>
$ cg wg node add-after <same-predecessor-node> <different-unit-slug>

┌─────────────────────────────────────────────────────────────┐
│ SCENARIO                                                    │
│                                                             │
│   Parent node: content-workflow-002-user-input-text                │
│     outputs: topic:text                                     │
│                                                             │
│   Adding two different units that both need 'topic':        │
│     1. write-poem (requires topic:text)                     │
│     2. write-essay (requires topic:text)                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ COMMAND 1                                                   │
│                                                             │
│   $ cg wg node add-after content-workflow-002-user-input-text \ │
│       write-poem                                            │
│                                                             │
│   ✓ Added 'write-poem' as content-workflow-003-write-poem   │
│   Input mapping: topic ← content-workflow-002-user-input-text.topic│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ COMMAND 2 (same parent)                                     │
│                                                             │
│   $ cg wg node add-after content-workflow-002-user-input-text \ │
│       write-essay                                           │
│                                                             │
│   ✓ Added 'write-essay' as content-workflow-004-write-essay │
│   Input mapping: topic ← content-workflow-002-user-input-text.topic│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ RESULT                                                      │
│                                                             │
│   Graph now has diverging paths:                            │
│                                                             │
│           ┌─────────────┐                                   │
│           │ 002-user-input-text│                                   │
│           │ (topic:text)│                                   │
│           └──────┬──────┘                                   │
│                  │                                          │
│         ┌───────┴───────┐                                   │
│         ▼               ▼                                   │
│   ┌───────────┐   ┌───────────┐                             │
│   │003-write- │   │004-write- │                             │
│   │   poem    │   │   essay   │                             │
│   └───────────┘   └───────────┘                             │
│                                                             │
│   Both nodes receive the same 'topic' input from user-input-text.  │
│   They can be executed independently in any order.          │
└─────────────────────────────────────────────────────────────┘
```

### Add Work-Node After (Failure - Missing Input)

```
$ cg wg node add-after poem-workflow-001-start write-poem

┌─────────────────────────────────────────────────────────────┐
│ INPUT                                                       │
│   predecessor: "poem-workflow-001-start"                    │
│   unit: "write-poem"                                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ VALIDATE INPUTS                                             │
│                                                             │
│   Predecessor outputs:                                      │
│     (none - start node has no outputs)                      │
│                                                             │
│   Unit required inputs:                                     │
│     • topic (text) ← NOT FOUND ✗                            │
│                                                             │
│   Missing required inputs ✗                                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ ERROR OUTPUT                                                │
│                                                             │
│   E103: Missing required input 'topic' (text)               │
│                                                             │
│   The unit 'write-poem' requires input 'topic' of type      │
│   'text', but 'poem-workflow-001-start' does not provide    │
│   this output.                                              │
│                                                             │
│   Available outputs from predecessor: (none)                │
│                                                             │
│   Suggestion: Add an UserInputUnit that outputs 'topic' first:    │
│     cg graph node add-after poem-workflow-001-start \       │
│       user-input-text --config prompt="Topic?" \                   │
│       --config output_name="topic"                          │
└─────────────────────────────────────────────────────────────┘
```

### Remove Work-Node (Blocked by Dependents)

```
$ cg wg node remove <node>

┌─────────────────────────────────────────────────────────────┐
│ INPUT                                                       │
│   node: "poem-workflow-002-user-input-text"                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ CHECK DEPENDENTS                                            │
│                                                             │
│   Nodes that depend on this node:                           │
│     • poem-workflow-003-write-poem (needs: topic)           │
│                                                             │
│   Has dependents ✗                                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ ERROR OUTPUT                                                │
│                                                             │
│   E102: Cannot delete node - 1 unit depends on this         │
│                                                             │
│   Dependents:                                               │
│     • poem-workflow-003-write-poem (needs: topic)           │
│                                                             │
│   Options:                                                  │
│     • Remove dependents first                               │
│     • Use --cascade to remove node and all dependents       │
└─────────────────────────────────────────────────────────────┘
```

### Remove Work-Node (Success - Leaf Node)

```
$ cg wg node remove <node>

┌─────────────────────────────────────────────────────────────┐
│ INPUT                                                       │
│   node: "poem-workflow-003-write-poem"                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ CHECK DEPENDENTS                                            │
│                                                             │
│   Nodes that depend on this node: (none)                    │
│   Is leaf node ✓                                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ REMOVE                                                      │
│                                                             │
│   • Remove edges pointing to this node                      │
│   • Remove node from work-graph.yaml                             │
│   • Delete node folder: nodes/003-write-poem/               │
│   • Update state.json                                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ OUTPUT                                                      │
│   ✓ Removed node poem-workflow-003-write-poem               │
└─────────────────────────────────────────────────────────────┘
```

---

## Work-Node Execution

### Execute Work-Node (Orchestrator launches agent)

```
$ cg wg node <slug> exec --type claude-code

┌─────────────────────────────────────────────────────────────┐
│ INPUT                                                       │
│   node: "poem-workflow-003-write-poem"                      │
│   type: "claude-code"                                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ VALIDATE                                                    │
│                                                             │
│   • Node exists: ✓                                          │
│   • Node status is 'ready': ✓                               │
│   • All upstream inputs available: ✓                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ BUILD BOOTSTRAP PROMPT                                      │
│                                                             │
│   • Load work-node metadata                                 │
│   • Load work-unit definition                               │
│   • Generate bootstrap prompt (see below)                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ LAUNCH AGENT                                                │
│                                                             │
│   cg agent run \                                            │
│     --type claude-code \                                    │
│     --prompt "<bootstrap-prompt>" \                         │
│     --cwd <work-graph-directory>                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ OUTPUT                                                      │
│   Agent launched for poem-workflow-003-write-poem           │
│   Session: 15523ff5-a900-4dd9-ab49-73cb1e04342c            │
└─────────────────────────────────────────────────────────────┘
```

### Bootstrap Prompt (CLI-generated)

The `exec` command generates a bootstrap prompt that tells the agent how to operate
within the WorkGraph system. This is similar to `wf.md` in the legacy workflow.

```markdown
# Work-Node Execution

You are executing a **work-node** in a WorkGraph system.

## Your Assignment

- **Work-Node**: poem-workflow-003-write-poem
- **Work-Unit**: write-poem (AgentUnit)

## ⚠️ FAIL FAST POLICY

If you encounter missing files, CLI errors, or unclear instructions:
1. Log the error with details
2. Do NOT attempt workarounds
3. Report back to orchestrator

## Step 1: Signal Start

First, tell the system you've taken over:
  cg wg node poem-workflow-003-write-poem start

## Step 2: Get Your Inputs

  # List available inputs
  cg wg node poem-workflow-003-write-poem list-inputs

  # Get data values
  cg wg node poem-workflow-003-write-poem get-input-data topic

  # Get file paths (then read them)
  cg wg node poem-workflow-003-write-poem get-input-file reference

## Step 3: Read Your Task Instructions

Your task is defined in the work-unit:
  cat .chainglass/units/write-poem/commands/main.md

Follow those instructions to complete your task.

## Step 4: Save Your Outputs

  # Save file outputs
  cg wg node poem-workflow-003-write-poem save-output-file poem ./poem.md

  # Save data outputs
  cg wg node poem-workflow-003-write-poem save-output-data title "Sunset Dreams"

## Step 5: Complete

  # Verify all required outputs are present
  cg wg node poem-workflow-003-write-poem can-end

  # Finalize (fails if outputs missing)
  cg wg node poem-workflow-003-write-poem end

## 🛑 CRITICAL

Execute THIS work-node only. When complete, STOP and report back.

---

**Now**: Call `start`, get inputs, read your instructions, do the work.
```

---

## Work-Node Lifecycle

Work-nodes have explicit lifecycle transitions. The **orchestrator** launches the agent,
and the **agent** calls lifecycle commands to signal state changes.

### Work-Node Status Flow

```
pending ──► ready ──► running ──► complete
   │          │          │
   │          │          └──► clear ──► ready
   │          │
   └──────────┴── blocked by upstream
```

| Status | Meaning |
|--------|---------|
| `pending` | Upstream nodes not complete |
| `ready` | Can be started (`can-run` = true) |
| `running` | Started, work in progress |
| `complete` | Ended successfully, outputs available |

### Check if Work-Node Can Run

```
$ cg wg node <slug> can-run

┌─────────────────────────────────────────────────────────────┐
│ SUCCESS                                                     │
│                                                             │
│   $ cg wg node poem-workflow-003-write-poem can-run      │
│   ✓ Node ready. All upstream inputs available.              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ BLOCKED                                                     │
│                                                             │
│   $ cg wg node poem-workflow-003-write-poem can-run      │
│   ✗ Node blocked. Missing inputs:                           │
│     • topic (data) ← 002-user-input-text [not complete]            │
└─────────────────────────────────────────────────────────────┘
```

### Start Work-Node

```
$ cg wg node <slug> start

┌─────────────────────────────────────────────────────────────┐
│ INPUT                                                       │
│   node: "poem-workflow-003-write-poem"                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ VALIDATE                                                    │
│                                                             │
│   • Node exists: ✓                                          │
│   • Node status is 'ready': ✓                               │
│   • All upstream inputs available: ✓                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ START                                                       │
│                                                             │
│   • Set status: running                                     │
│   • Update state.json                                 │
│   (Inputs are NOT copied - resolved dynamically on access)  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ OUTPUT                                                      │
│   ✓ Node 'poem-workflow-003-write-poem' started.            │
│   Status: running                                           │
└─────────────────────────────────────────────────────────────┘
```

### Start Work-Node (Blocked)

```
$ cg wg node <slug> start

┌─────────────────────────────────────────────────────────────┐
│ ERROR OUTPUT                                                │
│                                                             │
│   E110: Cannot start node - inputs not available            │
│                                                             │
│   Missing inputs:                                           │
│     • topic (data) ← poem-workflow-002-user-input-text             │
│                                                             │
│   Blocked by:                                               │
│     • poem-workflow-002-user-input-text (status: ready)            │
└─────────────────────────────────────────────────────────────┘
```

### Check if Work-Node Can End

```
$ cg wg node <slug> can-end

┌─────────────────────────────────────────────────────────────┐
│ SUCCESS                                                     │
│                                                             │
│   $ cg wg node poem-workflow-003-write-poem can-end      │
│   ✓ Ready to end. All required outputs present.             │
│                                                             │
│   Outputs:                                                  │
│     • poem (file) [required] ✓                              │
│     • title (data) [required] ✓                             │
│     • notes (file) [optional] - not set                     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ NOT READY                                                   │
│                                                             │
│   $ cg wg node poem-workflow-003-write-poem can-end      │
│   ✗ Cannot end. Missing required outputs:                   │
│     • poem (file) [required] - not set                      │
│     • title (data) [required] - not set                     │
│                                                             │
│   Set outputs with:                                         │
│     cg graph node <slug> save-output-file poem ./poem.md    │
│     cg graph node <slug> save-output-data title "My Title"  │
└─────────────────────────────────────────────────────────────┘
```

### End Work-Node

```
$ cg wg node <slug> end

┌─────────────────────────────────────────────────────────────┐
│ INPUT                                                       │
│   node: "poem-workflow-003-write-poem"                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ VALIDATE                                                    │
│                                                             │
│   • Node exists: ✓                                          │
│   • Node status is 'running': ✓                             │
│   • All required outputs present:                           │
│     - poem (file): ✓                                        │
│     - title (data): ✓                                       │
│     - word_count (data): ✓                                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ FINALIZE                                                    │
│                                                             │
│   • Set status: complete                                    │
│   • Update state.json                                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ OUTPUT                                                      │
│   ✓ Node 'poem-workflow-003-write-poem' complete.           │
└─────────────────────────────────────────────────────────────┘
```

### End Work-Node (Missing Outputs)

```
$ cg wg node <slug> end

┌─────────────────────────────────────────────────────────────┐
│ ERROR OUTPUT                                                │
│                                                             │
│   E113: Cannot end node - missing required outputs          │
│                                                             │
│   Missing outputs:                                          │
│     • poem (file) [not set]                                 │
│     • title (data) [not set]                                │
│                                                             │
│   Save outputs with:                                        │
│     cg graph node <slug> save-output-file poem ./poem.md    │
│     cg graph node <slug> save-output-data title "My Title"  │
└─────────────────────────────────────────────────────────────┘
```

### Clear Work-Node Outputs

```
$ cg wg node <slug> clear

┌─────────────────────────────────────────────────────────────┐
│ INPUT                                                       │
│   node: "poem-workflow-003-write-poem"                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ CLEAR                                                       │
│                                                             │
│   • Delete all file outputs in data/outputs/                │
│   • Clear output values in data.json                        │
│   • Set status: ready                                       │
│   • Update state.json                                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ OUTPUT                                                      │
│   ✓ All outputs cleared for 'poem-workflow-003-write-poem'  │
│   Status: ready                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Ask/Answer/Error (Handover Flow)

When an agent needs input or encounters an error, it hands control back to the orchestrator.
The agent **stops** after `ask` or `error`. The orchestrator detects this, handles it, then resumes.

### Question Types

| Type | Description | Answer Format |
|------|-------------|---------------|
| `text` | Free-form text input | `<string>` |
| `single` | Choose exactly one option | `<key>` |
| `multi` | Choose one or more options | `<key1> <key2> ...` |
| `confirm` | Yes/No confirmation | `yes` or `no` |

### Agent Asks Question (auto-handback)

```
$ cg wg node <slug> ask --type <type> --prompt "..." [--option key="label" ...]

┌─────────────────────────────────────────────────────────────┐
│ EXAMPLES                                                    │
│                                                             │
│   # Free text                                               │
│   cg wg node $NODE ask --type text \                        │
│     --prompt "What style of poem would you like?"           │
│                                                             │
│   # Single choice                                           │
│   cg wg node $NODE ask --type single \                      │
│     --prompt "Which format?" \                              │
│     --option md="Markdown" \                                │
│     --option txt="Plain text"                               │
│                                                             │
│   # Multiple choice                                         │
│   cg wg node $NODE ask --type multi \                       │
│     --prompt "Which themes to include?" \                   │
│     --option love="Love" \                                  │
│     --option nature="Nature" \                              │
│     --option loss="Loss"                                    │
│                                                             │
│   # Yes/No confirmation                                     │
│   cg wg node $NODE ask --type confirm \                     │
│     --prompt "Should the poem include rhymes?"              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ RESULT                                                      │
│                                                             │
│   • Question saved to data.json                             │
│   • Status → waiting-question                               │
│   • Agent process STOPS (auto-handback)                     │
│                                                             │
│   ✓ Question recorded. Handing back to orchestrator.        │
└─────────────────────────────────────────────────────────────┘
```

### Agent Reports Error (auto-handback)

```
$ cg wg node <slug> error "<message>"

┌─────────────────────────────────────────────────────────────┐
│ EXAMPLE                                                     │
│                                                             │
│   cg wg node $NODE error "Cannot find input file: ref.md"   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ RESULT                                                      │
│                                                             │
│   • Error saved to data.json                                │
│   • Status → blocked-error                                  │
│   • Agent process STOPS (auto-handback)                     │
│                                                             │
│   ✓ Error recorded. Handing back to orchestrator.           │
└─────────────────────────────────────────────────────────────┘
```

### Orchestrator Checks Handover Reason

```
$ cg wg node <slug> handover-reason

┌─────────────────────────────────────────────────────────────┐
│ POSSIBLE OUTPUTS                                            │
│                                                             │
│   question    # Agent asked a question, needs answer        │
│   error       # Agent encountered an error                  │
│   complete    # Agent finished successfully                 │
└─────────────────────────────────────────────────────────────┘
```

### Orchestrator Views Question

```
$ cg wg node <slug> question

┌─────────────────────────────────────────────────────────────┐
│ OUTPUT                                                      │
│                                                             │
│   Type: single                                              │
│   Prompt: Which format?                                     │
│   Options:                                                  │
│     md: Markdown                                            │
│     txt: Plain text                                         │
└─────────────────────────────────────────────────────────────┘
```

### Orchestrator Answers Question

```
$ cg wg node <slug> answer <value>

┌─────────────────────────────────────────────────────────────┐
│ EXAMPLES                                                    │
│                                                             │
│   # Text answer                                             │
│   cg wg node $NODE answer "romantic and flowing"            │
│                                                             │
│   # Single choice                                           │
│   cg wg node $NODE answer md                                │
│                                                             │
│   # Multiple choice                                         │
│   cg wg node $NODE answer love nature                       │
│                                                             │
│   # Confirm                                                 │
│   cg wg node $NODE answer yes                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ RESULT                                                      │
│                                                             │
│   • Answer saved to data.json                               │
│   • Status remains waiting-question (until resumed)         │
│                                                             │
│   ✓ Answer recorded. Resume agent to continue.              │
└─────────────────────────────────────────────────────────────┘
```

### Orchestrator Resumes Agent

```
$ cg wg node <slug> exec --type claude-code --resume

┌─────────────────────────────────────────────────────────────┐
│ BOOTSTRAP PROMPT (for resume)                               │
│                                                             │
│   You are RESUMING work-node: poem-workflow-003-write-poem  │
│                                                             │
│   FIRST: Check why you were paused:                         │
│     cg wg node poem-workflow-003-write-poem handover-reason │
│                                                             │
│   If 'question': Get your answer:                           │
│     cg wg node poem-workflow-003-write-poem get-answer      │
│                                                             │
│   Then continue your work from where you left off.          │
└─────────────────────────────────────────────────────────────┘
```

### Agent Gets Answer (after resume)

```
$ cg wg node <slug> get-answer

┌─────────────────────────────────────────────────────────────┐
│ OUTPUT                                                      │
│                                                             │
│   md                                                        │
│   (or for multi: love nature)                               │
│   (or for text: "romantic and flowing")                     │
│   (or for confirm: yes)                                     │
└─────────────────────────────────────────────────────────────┘
```

### Status Flow with Questions/Errors

```
ready ──► running ──────────────────────────► complete
              │                                   ▲
              │                                   │
              ├──► waiting-question ──► running ──┘
              │         │       ▲
              │         │       │
              │         ▼       │
              │    [orchestrator answers + resumes]
              │
              └──► blocked-error
                       │
                       ▼
                  [orchestrator decides: clear + retry, or abort]
```

### Handover Data Structure (in data.json)

```json
{
  "outputs": { },
  "handover": {
    "reason": "question",
    "question": {
      "type": "single",
      "prompt": "Which format?",
      "options": [
        { "key": "md", "label": "Markdown" },
        { "key": "txt", "label": "Plain text" }
      ],
      "answer": "md"
    }
  }
}
```

Or for error:

```json
{
  "outputs": { },
  "handover": {
    "reason": "error",
    "error": {
      "message": "Cannot find input file: ref.md",
      "timestamp": "2026-01-27T10:30:00Z"
    }
  }
}
```

---

## Work-Node I/O Commands

These commands are used by agents to read inputs and write outputs.
All commands are **scoped to the current node** - the agent only needs its own node slug.

### List Inputs

```
$ cg wg node <slug> list-inputs

┌─────────────────────────────────────────────────────────────┐
│ OUTPUT                                                      │
│                                                             │
│   Inputs for poem-workflow-003-write-poem:                  │
│     • topic (data)  ← 002-user-input-text.topic  [available]       │
│     • style (data)  ← 002-user-input-text.style  [available]       │
│     • reference (file) ← 002-user-input-text.doc [available]       │
└─────────────────────────────────────────────────────────────┘
```

### Get Input Data

```
$ cg wg node <slug> get-input-data <name>

┌─────────────────────────────────────────────────────────────┐
│ FLOW                                                        │
│                                                             │
│   $ cg wg node poem-workflow-003-write-poem \            │
│       get-input-data topic                                  │
│                                                             │
│   1. Load work-graph.yaml, find node's input mapping             │
│   2. Traverse edge: topic ← 002-user-input-text.topic              │
│   3. Read from upstream: .../002-user-input-text/data/data.json    │
│   4. Return value from upstream node's outputs              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ OUTPUT                                                      │
│   The ocean at sunset                                       │
└─────────────────────────────────────────────────────────────┘

Note: Value is read directly from upstream node - not cached locally.
```

### Get Input File

```
$ cg wg node <slug> get-input-file <name>

┌─────────────────────────────────────────────────────────────┐
│ FLOW                                                        │
│                                                             │
│   $ cg wg node poem-workflow-003-write-poem \            │
│       get-input-file reference                              │
│                                                             │
│   1. Look up input mapping: reference ← 002-user-input-text.doc    │
│   2. Resolve path to: .../002-user-input-text/data/outputs/doc.md  │
│   3. Return absolute path                                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ OUTPUT                                                      │
│   /home/user/.chainglass/work-graphs/poem-workflow/nodes/        │
│   002-user-input-text/data/outputs/doc.md                          │
└─────────────────────────────────────────────────────────────┘

Note: Returns path - agent reads the file itself.
```

### List Outputs

```
$ cg wg node <slug> list-outputs

┌─────────────────────────────────────────────────────────────┐
│ OUTPUT (before saving)                                      │
│                                                             │
│   Outputs for poem-workflow-003-write-poem:                 │
│     • poem (file) [required] [not set]                      │
│     • title (data) [required] [not set]                     │
│     • word_count (data) [required] [not set]                │
│     • notes (file) [optional] [not set]                     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ OUTPUT (after saving)                                       │
│                                                             │
│   Outputs for poem-workflow-003-write-poem:                 │
│     • poem (file) [required] [set] → poem.md                │
│     • title (data) [required] [set] → "Sunset Dreams"       │
│     • word_count (data) [required] [set] → 247              │
│     • notes (file) [optional] [not set]                     │
│                                                             │
│   ✓ All required outputs present.                           │
└─────────────────────────────────────────────────────────────┘
```

### Save Output Data

```
$ cg wg node <slug> save-output-data <name> <value>

┌─────────────────────────────────────────────────────────────┐
│ INPUT                                                       │
│   node: "poem-workflow-003-write-poem"                      │
│   name: "title"                                             │
│   value: "Sunset Dreams"                                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ VALIDATE                                                    │
│                                                             │
│   • Node status is 'running': ✓                             │
│   • 'title' is declared output: ✓                           │
│   • Type is 'data': ✓                                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ SAVE                                                        │
│                                                             │
│   Update: nodes/003-write-poem/data/data.json               │
│   {                                                         │
│     "outputs": {                                            │
│       "title": "Sunset Dreams"  ← added/updated             │
│     }                                                       │
│   }                                                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ OUTPUT                                                      │
│   ✓ Output 'title' saved.                                   │
└─────────────────────────────────────────────────────────────┘

Note: Overwrites if already set. No confirmation needed.
```

### Save Output File

```
$ cg wg node <slug> save-output-file <name> <path>

┌─────────────────────────────────────────────────────────────┐
│ INPUT                                                       │
│   node: "poem-workflow-003-write-poem"                      │
│   name: "poem"                                              │
│   path: "./draft-poem.md"                                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ VALIDATE                                                    │
│                                                             │
│   • Node status is 'running': ✓                             │
│   • 'poem' is declared output: ✓                            │
│   • Type is 'file': ✓                                       │
│   • Source file exists: ✓                                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ COPY                                                        │
│                                                             │
│   Copy: ./draft-poem.md                                     │
│   To: nodes/003-write-poem/data/outputs/poem.md             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ OUTPUT                                                      │
│   ✓ Output 'poem' saved (copied 847 bytes).                 │
└─────────────────────────────────────────────────────────────┘

Note: Overwrites if already set. No confirmation needed.
```

---

## Work-Unit Management

### List Work-Units

```
$ cg wg unit list

┌─────────────────────────────────────────────────────────────┐
│ SCAN                                                        │
│   • Read .chainglass/units/*/unit.yaml                      │
│   • Parse each unit definition                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ OUTPUT (table format)                                       │
│                                                             │
│   Available Work-Units:                                     │
│   ┌──────────────────┬──────────────────────────┬───────────┐
│   │ Slug             │ Description              │ Type      │
│   ├──────────────────┼──────────────────────────┼───────────┤
│   │ user-input-text  │ Get text input from user │ UserInput │
│   │ user-input-choice│ User selects an option   │ UserInput │
│   │ user-input-confirm│ User confirms yes/no    │ UserInput │
│   │ write-poem       │ Write a poem with Claude │ Agent     │
│   │ summarize        │ Summarize text           │ Agent     │
│   │ format-json      │ Format/validate JSON     │ Code      │
│   └──────────────────┴──────────────────────────┴───────────┘
│                                                             │
│   Use: cg wg unit info <slug> for details                   │
└─────────────────────────────────────────────────────────────┘
```

### Work-Unit Info

```
$ cg wg unit info <slug>

┌─────────────────────────────────────────────────────────────┐
│ INPUT                                                       │
│   slug: "write-poem"                                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ LOAD                                                        │
│   • Read .chainglass/units/write-poem/unit.yaml             │
│   • Parse unit definition                                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ OUTPUT                                                      │
│                                                             │
│   Unit: write-poem                                          │
│   Type: agent                                               │
│   Description: Write a creative poem about a given topic    │
│                                                             │
│   Inputs:                                                   │
│     • topic (text) [required]                               │
│                                                             │
│   Outputs:                                                  │
│     • poem (file)                                           │
│                                                             │
│   Agent Config:                                             │
│     prompt_template: commands/main.md                       │
│     system_prompt: "You are a creative poet..."             │
│                                                             │
│   Location: .chainglass/units/write-poem/                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Work-Node Status Definitions

| Status | Meaning | Transitions |
|--------|---------|-------------|
| `pending` | Upstream nodes not complete | → `ready` when upstream completes |
| `ready` | Can be started, inputs available | → `running` via `start` |
| `running` | Work in progress | → `complete` via `end`, → `waiting-question` via `ask`, → `blocked-error` via `error` |
| `waiting-question` | Agent asked question, awaiting answer | → `running` via `exec --resume` |
| `blocked-error` | Agent reported error | → `ready` via `clear` (retry), or abort |
| `complete` | Finished, outputs available | → `ready` via `clear` |

Note: `pending` and `ready` are computed states based on upstream node completion.
Other states are set explicitly by agent commands (`start`, `end`, `ask`, `error`) or orchestrator commands (`clear`).

---

## Error Codes

| Code | Meaning |
|------|---------|
| `E102` | Cannot delete node - has dependents |
| `E103` | Missing required input when adding node |
| `E104` | Unit not found |
| `E105` | Node not found |
| `E106` | Graph not found |
| `E107` | Invalid node type for operation |
| `E108` | Cycle would be created |
| `E110` | Cannot start - inputs not available |
| `E111` | Node already running |
| `E112` | Invalid output type |
| `E113` | Cannot end - missing required outputs |
| `E114` | Output not declared in unit |
| `E115` | No pending question to answer |
| `E116` | Invalid answer for question type |
| `E117` | Cannot resume - no question/error state |
| `E118` | Invalid question type |

---

## Complete Example Session

This shows the full workflow from graph creation to agent execution.

```bash
# ═══════════════════════════════════════════════════════════════
# PHASE 1: Build the work-graph structure
# ═══════════════════════════════════════════════════════════════

# 1. Create a new work-graph
$ cg wg create poem-workflow
✓ Created work-graph 'poem-workflow' with start node
  Start node: poem-workflow-001-start

# 2. Try to add write-poem directly (FAILS - no topic input)
$ cg wg node add-after poem-workflow-001-start write-poem
✗ E103: Missing required input 'topic' (data)
  Suggestion: Add an UserInputUnit that outputs 'topic' first

# 3. Add user-input-text to get the topic from user
$ cg wg node add-after poem-workflow-001-start user-input-text \
    --config prompt="What would you like a poem about?" \
    --config output_name="topic"
✓ Added 'user-input-text' as poem-workflow-002-user-input-text

# 4. Now add write-poem (SUCCEEDS - user-input-text provides topic)
$ cg wg node add-after poem-workflow-002-user-input-text write-poem
✓ Added 'write-poem' as poem-workflow-003-write-poem
  Input mapping: topic ← poem-workflow-002-user-input-text.topic

# 5. Check the work-graph structure
$ cg wg show poem-workflow
poem-workflow
└─► start (poem-workflow-001-start)
    └─► user-input-text (poem-workflow-002-user-input-text)
        │   outputs: topic (data)
        └─► write-poem (poem-workflow-003-write-poem)
            │   inputs: topic (data)
            │   outputs: poem (file), title (data)
            (end)

# ═══════════════════════════════════════════════════════════════
# PHASE 2: Execute the user-input-text node (human provides input)
# ═══════════════════════════════════════════════════════════════

# 6. Check execution status
$ cg wg status poem-workflow
Ready: poem-workflow-002-user-input-text (user-input)
Pending: poem-workflow-003-write-poem (needs: 002-user-input-text)

# 7. Start the ask node
$ cg wg node poem-workflow-002-user-input-text start
✓ Node started. Status: running

# 8. (For UserInputUnit, the "work" is collecting user input)
#    Save the user's answer as output data
$ cg wg node poem-workflow-002-user-input-text save-output-data topic "The ocean at sunset"
✓ Output 'topic' saved.

# 9. End the ask node
$ cg wg node poem-workflow-002-user-input-text end
✓ Node complete.

# ═══════════════════════════════════════════════════════════════
# PHASE 3: Execute the write-poem node (orchestrator + agent)
# ═══════════════════════════════════════════════════════════════

# 10. Check status - write-poem is now ready
$ cg wg status poem-workflow
Complete: poem-workflow-002-user-input-text
Ready: poem-workflow-003-write-poem (agent)

# 11. [ORCHESTRATOR] Check if node can run
$ cg wg node poem-workflow-003-write-poem can-run
✓ Node ready. All upstream inputs available.

# 12. [ORCHESTRATOR] Launch agent with bootstrap prompt
$ cg wg node poem-workflow-003-write-poem exec --type claude-code
Agent launched. Session: 15523ff5-a900-4dd9-ab49-73cb1e04342c

# ─── Agent receives bootstrap prompt, takes over ───

# 13. [AGENT] Signal start (taken over from orchestrator)
$ cg wg node poem-workflow-003-write-poem start
✓ Node started. Status: running

# 14. [AGENT] List and get inputs
$ cg wg node poem-workflow-003-write-poem list-inputs
Inputs:
  • topic (data) ← 002-user-input-text.topic [available]

$ cg wg node poem-workflow-003-write-poem get-input-data topic
The ocean at sunset

# 15. [AGENT] Read task instructions
$ cat .chainglass/units/write-poem/commands/main.md
# (Agent reads the task prompt and executes it)

# 16. [AGENT] Does work - writes poem to ./poem.md

# 17. [AGENT] Save outputs
$ cg wg node poem-workflow-003-write-poem save-output-file poem ./poem.md
✓ Output 'poem' saved (copied 847 bytes).

$ cg wg node poem-workflow-003-write-poem save-output-data title "Sunset Dreams"
✓ Output 'title' saved.

# 18. [AGENT] Verify and end
$ cg wg node poem-workflow-003-write-poem can-end
✓ Ready to end. All required outputs present.

$ cg wg node poem-workflow-003-write-poem end
✓ Node complete.

# ═══════════════════════════════════════════════════════════════
# PHASE 4: Done
# ═══════════════════════════════════════════════════════════════

# 19. Check final status
$ cg wg status poem-workflow
All nodes complete.

# 20. View the output
$ cat .chainglass/work-graphs/poem-workflow/nodes/003-write-poem/data/outputs/poem.md
```

---

## Diverging Paths Example Session

This shows a work-graph with parallel branches that can be executed independently.

```bash
# ═══════════════════════════════════════════════════════════════
# PHASE 1: Build diverging work-graph structure
# ═══════════════════════════════════════════════════════════════

# 1. Create a new work-graph for generating multiple content types
$ cg wg create content-workflow
✓ Created work-graph 'content-workflow' with start node

# 2. Add user-input-text to get the topic
$ cg wg node add-after content-workflow-001-start user-input-text \
    --config prompt="What topic?" --config output_name="topic"
✓ Added 'user-input-text' as content-workflow-002-user-input-text

# 3. Add write-poem AFTER user-input-text
$ cg wg node add-after content-workflow-002-user-input-text write-poem
✓ Added 'write-poem' as content-workflow-003-write-poem

# 4. Add write-essay ALSO after user-input-text (creates diverging path)
$ cg wg node add-after content-workflow-002-user-input-text write-essay
✓ Added 'write-essay' as content-workflow-004-write-essay

# 5. View the diverging work-graph
$ cg wg show content-workflow
content-workflow
└─► start (001-start)
    └─► user-input-text (002-user-input-text)
        │   outputs: topic (data)
        │
        ├─► write-poem (003-write-poem)
        │   │   inputs: topic (data)
        │   (end)
        │
        └─► write-essay (004-write-essay)
            │   inputs: topic (data)
            (end)

# ═══════════════════════════════════════════════════════════════
# PHASE 2: Execute user-input-text (provides input to both branches)
# ═══════════════════════════════════════════════════════════════

$ cg wg node content-workflow-002-user-input-text start
✓ Node started.

$ cg wg node content-workflow-002-user-input-text save-output-data topic "The importance of forests"
✓ Output 'topic' saved.

$ cg wg node content-workflow-002-user-input-text end
✓ Node complete.

# ═══════════════════════════════════════════════════════════════
# PHASE 3: Both branches now ready - can run in any order
# ═══════════════════════════════════════════════════════════════

$ cg wg status content-workflow
Complete: content-workflow-002-user-input-text
Ready (2):
  • content-workflow-003-write-poem
  • content-workflow-004-write-essay

Note: Multiple nodes ready - they share the same input.

# Agent 1 works on poem
$ cg wg node content-workflow-003-write-poem start
$ cg wg node content-workflow-003-write-poem get-input-data topic
The importance of forests
# [Agent writes poem...]
$ cg wg node content-workflow-003-write-poem save-output-file poem ./poem.md
$ cg wg node content-workflow-003-write-poem end
✓ Node complete.

# Agent 2 works on essay (can run in parallel)
$ cg wg node content-workflow-004-write-essay start
$ cg wg node content-workflow-004-write-essay get-input-data topic
The importance of forests
# [Agent writes essay...]
$ cg wg node content-workflow-004-write-essay save-output-file essay ./essay.md
$ cg wg node content-workflow-004-write-essay end
✓ Node complete.

# ═══════════════════════════════════════════════════════════════
# PHASE 4: Both paths complete
# ═══════════════════════════════════════════════════════════════

$ cg wg status content-workflow
All nodes complete.
```

---

## Quick Reference: Orchestrator Pattern

```bash
NODE="poem-workflow-003-write-poem"

# 1. Check if node can run
cg wg node $NODE can-run || echo "Blocked"

# 2. Launch agent
cg wg node $NODE exec --type claude-code

# 3. Wait for agent to stop...

# 4. Check why agent handed back
REASON=$(cg wg node $NODE handover-reason)

case $REASON in
  complete)
    echo "Node finished!"
    ;;
  question)
    # View and answer question
    cg wg node $NODE question
    cg wg node $NODE answer "user's answer"
    # Resume agent
    cg wg node $NODE exec --type claude-code --resume
    ;;
  error)
    # Handle error (retry or abort)
    cg wg node $NODE clear  # reset to retry
    ;;
esac
```

---

## Quick Reference: Agent Execution Pattern

When an agent is launched via `exec`, it receives a bootstrap prompt and follows this pattern:

```bash
NODE="<my-work-node-slug>"

# 1. Signal start (I've taken over)
cg wg node $NODE start

# 2. Get inputs
cg wg node $NODE list-inputs
TOPIC=$(cg wg node $NODE get-input-data topic)

# 3. Read task instructions
cat .chainglass/units/<unit-slug>/commands/main.md

# 4. Do work...
# [Agent performs its task]

# 5. If need clarification → ASK (auto-handback, agent stops)
cg wg node $NODE ask --type single --prompt "Which style?" \
  --option formal="Formal" --option casual="Casual"
# Agent process exits here, orchestrator takes over

# 6. If error → REPORT (auto-handback, agent stops)
cg wg node $NODE error "Cannot proceed: missing reference file"
# Agent process exits here, orchestrator takes over

# 7. Save outputs (if work complete)
cg wg node $NODE save-output-file poem ./output.md
cg wg node $NODE save-output-data title "My Title"

# 8. Verify and end
cg wg node $NODE can-end
cg wg node $NODE end

# 9. STOP - orchestrator takes over
```

---

## Quick Reference: Agent Resume Pattern

When resumed after a question was answered:

```bash
NODE="<my-work-node-slug>"

# 1. Check why I was paused
REASON=$(cg wg node $NODE handover-reason)

# 2. If question, get the answer
if [ "$REASON" = "question" ]; then
  ANSWER=$(cg wg node $NODE get-answer)
  # Use answer to continue work
fi

# 3. Continue work from where I left off...
```

---

**Key principles**:
- **Orchestrator** calls `exec` to launch agent with bootstrap prompt
- **Agent** calls `start` to signal it has taken over
- **Agent** calls `ask` or `error` to hand back (agent stops automatically)
- **Orchestrator** calls `answer` then `exec --resume` to continue
- **Agent** calls `get-answer` on resume to get the response
- Inputs are resolved dynamically by traversing work-graph to upstream work-nodes
- File outputs are copied into work-node storage
- Data outputs are stored in work-node's data.json (outputs only)
