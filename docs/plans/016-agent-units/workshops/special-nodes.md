# Workshop: Special Nodes (Control Nodes)

**Type**: Data Model / Conceptual Design
**Plan**: 016-agent-units
**Spec**: [agent-units-spec.md](../agent-units-spec.md)
**Created**: 2026-01-27
**Status**: Approved (v1 scope decided)

**Related Documents**:
- [workgraph-data-model.md](../workgraph-data-model.md)
- [workunit-data-model.md](../workunit-data-model.md)
- [Phase 4 Tasks](../tasks/phase-4-node-operations-dag-validation/tasks.md)

---

## Purpose

Define an abstraction for **Special Nodes** (non-WorkUnit nodes) that handle control flow and graph-level concerns. This separates "what work gets done" (WorkUnits) from "how the graph flows" (control nodes).

## Key Questions Addressed

- What makes `start` special, and what other special nodes might we need?
- Should special nodes have inputs/outputs?
- How do we represent special nodes in the type system?
- How does this solve the "first node after start needs inputs" problem?

---

## The Problem

The `start` node keeps being a special case throughout the codebase:

```typescript
// In status() - special case for start
if (nodeId === 'start') {
  nodeStatus = 'complete';  // Always complete
}

// In show() - special case for start
if (nodeId === 'start') {
  node.type = 'start';  // No unit slug
}

// In addNodeAfter() - start has no outputs
// So any unit with required inputs fails with E103
```

This suggests we need a proper abstraction.

---

## Conceptual Model

### Two Kinds of Nodes

```
┌─────────────────────────────────────────────────────────────┐
│                        WorkGraph Node                        │
├─────────────────────────────┬───────────────────────────────┤
│       Control Node          │        WorkUnit Node          │
│   (Special/Built-in)        │    (User-defined/Reusable)    │
├─────────────────────────────┼───────────────────────────────┤
│ • START                     │ • AgentUnit                   │
│ • INPUT                     │ • CodeUnit                    │
│ • OUTPUT                    │ • UserInputUnit               │
│ • GATE (future)             │ • (custom units)              │
│ • BRANCH (future)           │                               │
│ • JOIN (future)             │                               │
├─────────────────────────────┼───────────────────────────────┤
│ Behavior: Built into engine │ Behavior: Defined in unit.yaml│
│ No unit.yaml file           │ Has unit.yaml + prompt/script │
│ Control flow semantics      │ Data transformation semantics │
└─────────────────────────────┴───────────────────────────────┘
```

### Node Kind Discriminator

```typescript
type NodeKind = 'control' | 'unit';

interface BaseNode {
  id: string;
  kind: NodeKind;
  created_at: string;
}

interface ControlNode extends BaseNode {
  kind: 'control';
  controlType: ControlNodeType;
  // Type-specific config
}

interface UnitNode extends BaseNode {
  kind: 'unit';
  unit_slug: string;
  config?: Record<string, unknown>;
  inputs: Record<string, InputMapping>;
}

type WorkNode = ControlNode | UnitNode;
```

---

## Special Node Types

### Tier 1: v1 Implementation

#### START

The entry point of every graph. Already exists implicitly.

```yaml
# nodes/start/node.yaml
id: start
kind: control
control_type: start
created_at: "2026-01-27T10:00:00Z"
```

| Property | Value |
|----------|-------|
| **Inputs** | None |
| **Outputs** | None (v1) or graph metadata (v2) |
| **Status** | Always `complete` |
| **Removable** | No |
| **Multiple** | No (exactly one per graph) |

**Behavior**: Anchor point. Graph traversal starts here. No execution needed.

---

#### INPUT

Defines a named input to the graph. Solves the "first node needs inputs" problem.

```yaml
# nodes/input-topic-a1b/node.yaml
id: input-topic-a1b
kind: control
control_type: input
created_at: "2026-01-27T10:00:00Z"

# INPUT-specific config
input_config:
  name: topic           # Output name (what downstream sees)
  type: text            # Optional type hint
  prompt: "Enter topic" # Optional prompt for CLI
  required: true        # Must be provided before graph runs
  default: null         # Optional default value
```

| Property | Value |
|----------|-------|
| **Inputs** | None (receives from external source) |
| **Outputs** | `{ [name]: value }` - single named output |
| **Status** | `pending` → `ready` → user provides → `complete` |
| **Removable** | Yes |
| **Multiple** | Yes (graph can have many inputs) |

**Behavior**:
- When graph executes, prompts user (or receives programmatic input)
- Value becomes available as output to downstream nodes
- Like function parameters

**Example Flow**:
```
START → INPUT[topic] → write-poem → OUTPUT[poem]
```

The `write-poem` AgentUnit requires input `topic`. Instead of E103, the INPUT control node provides it.

---

#### OUTPUT

Defines a named output from the graph. Makes graphs composable.

```yaml
# nodes/output-poem-b2c/node.yaml
id: output-poem-b2c
kind: control
control_type: output
created_at: "2026-01-27T10:00:00Z"

# OUTPUT-specific config
output_config:
  name: poem            # What callers see
  type: text            # Optional type hint

# Where the value comes from
inputs:
  value:
    from: write-poem-a1b
    output: poem
```

| Property | Value |
|----------|-------|
| **Inputs** | `{ value: InputMapping }` - receives final result |
| **Outputs** | None (terminal) or graph-level output |
| **Status** | Computed from upstream |
| **Removable** | Yes |
| **Multiple** | Yes (graph can have many outputs) |

**Behavior**:
- Marks explicit graph output
- Makes the output accessible at graph level
- Future: enables graph-as-unit composition

---

### Tier 2: Future Consideration

#### GATE (Human Checkpoint)

```yaml
id: gate-review-c3d
kind: control
control_type: gate
gate_config:
  prompt: "Review draft before sending"
  require_approval: true
```

| Property | Value |
|----------|-------|
| **Inputs** | Pass-through (all inputs become outputs) |
| **Outputs** | Same as inputs |
| **Status** | `waiting-approval` until human approves |
| **Behavior** | Pauses execution, waits for human |

---

#### BRANCH (Conditional)

```yaml
id: branch-format-d4e
kind: control
control_type: branch
branch_config:
  condition: "inputs.format"  # Expression to evaluate
  cases:
    - match: "markdown"
      target: format-md-node
    - match: "html"
      target: format-html-node
    - default: true
      target: format-text-node
```

| Property | Value |
|----------|-------|
| **Inputs** | Condition inputs |
| **Outputs** | Activates one outgoing edge |
| **Behavior** | Evaluates condition, routes flow |

---

#### JOIN (Sync Point)

```yaml
id: join-results-e5f
kind: control
control_type: join
join_config:
  strategy: wait_all  # or wait_any, wait_n
  merge: object       # How to combine: object, array, first
```

| Property | Value |
|----------|-------|
| **Inputs** | From multiple predecessors |
| **Outputs** | Merged result |
| **Behavior** | Waits for N predecessors, combines outputs |

---

## Type System

### ControlNodeType Enum

```typescript
/**
 * Special node types (non-WorkUnit).
 *
 * Tier 1 (v1): START, INPUT, OUTPUT
 * Tier 2 (future): GATE, BRANCH, JOIN
 */
enum ControlNodeType {
  // Tier 1 - v1
  START = 'start',
  INPUT = 'input',
  OUTPUT = 'output',

  // Tier 2 - Future
  // GATE = 'gate',
  // BRANCH = 'branch',
  // JOIN = 'join',
}
```

### Control Node Configs

```typescript
/** START node - no additional config */
interface StartNodeConfig {
  // Empty - start is just an anchor
}

/** INPUT node - defines graph input */
interface InputNodeConfig {
  name: string;           // Output name
  type?: DataType;        // Optional type hint
  prompt?: string;        // CLI prompt
  required?: boolean;     // Default true
  default?: unknown;      // Default value
}

/** OUTPUT node - defines graph output */
interface OutputNodeConfig {
  name: string;           // Output name
  type?: DataType;        // Optional type hint
}

/** Union of control node configs */
type ControlNodeConfig =
  | { controlType: 'start'; config?: StartNodeConfig }
  | { controlType: 'input'; config: InputNodeConfig }
  | { controlType: 'output'; config: OutputNodeConfig };
```

### Full Node Types

```typescript
interface ControlNode {
  id: string;
  kind: 'control';
  controlType: ControlNodeType;
  created_at: string;

  // Type-specific config
  input_config?: InputNodeConfig;   // For INPUT
  output_config?: OutputNodeConfig; // For OUTPUT

  // OUTPUT nodes have inputs
  inputs?: Record<string, InputMapping>;
}

interface UnitNode {
  id: string;
  kind: 'unit';
  unit_slug: string;
  created_at: string;
  config?: Record<string, unknown>;
  inputs: Record<string, InputMapping>;
}

type WorkNode = ControlNode | UnitNode;
```

---

## Node ID Format

### Current Format

```
<unit-slug>-<hex3>    # Unit nodes
start                 # Special case
```

### Proposed Format

```
<unit-slug>-<hex3>           # Unit nodes: write-poem-b2c
<control-type>-<hex3>        # Control nodes: input-a1b, output-c3d
start                        # START is special (no hex, singleton)
```

**Reserved IDs**:
- `start` - Always the START node
- `input-*` - INPUT control nodes
- `output-*` - OUTPUT control nodes

---

## Storage Representation

### node.yaml Examples

**START node**:
```yaml
# nodes/start/node.yaml
id: start
kind: control
control_type: start
created_at: "2026-01-27T10:00:00Z"
```

**INPUT node**:
```yaml
# nodes/input-topic-a1b/node.yaml
id: input-topic-a1b
kind: control
control_type: input
created_at: "2026-01-27T10:00:00Z"

input_config:
  name: topic
  type: text
  prompt: "What topic should the poem be about?"
  required: true
```

**OUTPUT node**:
```yaml
# nodes/output-poem-b2c/node.yaml
id: output-poem-b2c
kind: control
control_type: output
created_at: "2026-01-27T10:00:00Z"

output_config:
  name: poem
  type: text

inputs:
  value:
    from: write-poem-a1b
    output: poem
```

**Unit node** (for comparison):
```yaml
# nodes/write-poem-a1b/node.yaml
id: write-poem-a1b
kind: unit
unit_slug: write-poem
created_at: "2026-01-27T10:00:00Z"

config:
  style: sonnet

inputs:
  topic:
    from: input-topic-a1b
    output: topic
```

---

## How This Solves E103

### Before (Current Design)

```
start → write-poem
        ↑
        E103: Missing required input 'topic'
        (start has no outputs)
```

### After (With INPUT Node)

```
start → INPUT[topic] → write-poem → OUTPUT[poem]
        ↑              ↑
        Provides       Receives topic
        'topic'        from INPUT
```

**Execution flow**:
1. `start` is always complete
2. `INPUT[topic]` prompts user: "What topic?"
3. User provides: "The ocean at sunset"
4. `INPUT[topic]` outputs: `{ topic: "The ocean at sunset" }`
5. `write-poem` receives input, executes agent
6. `OUTPUT[poem]` receives result, marks graph complete

---

## Example Graph

### File Structure

```
.chainglass/work-graphs/poem-workflow/
├── work-graph.yaml
├── state.json
└── nodes/
    ├── start/
    │   └── node.yaml
    ├── input-topic-a1b/
    │   ├── node.yaml
    │   └── data/
    │       └── data.json    # { outputs: { topic: "..." } }
    ├── write-poem-b2c/
    │   ├── node.yaml
    │   └── data/
    │       └── data.json    # { outputs: { poem: "..." } }
    └── output-poem-c3d/
        └── node.yaml
```

### work-graph.yaml

```yaml
slug: poem-workflow
version: "1.0.0"

nodes:
  - start
  - input-topic-a1b
  - write-poem-b2c
  - output-poem-c3d

edges:
  - { from: start, to: input-topic-a1b }
  - { from: input-topic-a1b, to: write-poem-b2c }
  - { from: write-poem-b2c, to: output-poem-c3d }
```

---

## Validation Rules

### Control Node Rules

| Rule | Description |
|------|-------------|
| **Single START** | Exactly one START node per graph |
| **START protected** | Cannot remove START node |
| **START no inputs** | START cannot have incoming edges |
| **INPUT no inputs** | INPUT nodes have no input mappings |
| **OUTPUT has value** | OUTPUT nodes must map their `value` input |
| **Control IDs** | Control node IDs match pattern `<type>-<hex3>` or `start` |

### Graph-Level Rules

| Rule | Description |
|------|-------------|
| **All reachable** | All nodes reachable from START |
| **No orphans** | No nodes without path from START |
| **Acyclic** | No cycles in graph |
| **Inputs satisfied** | All unit nodes have required inputs mapped |

---

## Open Questions

### Q1: Should INPUT be a control node or a special WorkUnit type?

**Option A: Control Node** (Recommended)
- Built-in behavior
- No unit.yaml file
- Engine handles input collection

**Option B: Built-in WorkUnit**
- UserInputUnit already exists
- Could extend it
- More uniform

**RECOMMENDATION**: Option A - Control nodes are cleaner separation. UserInputUnit is for structured forms/questions within a workflow. INPUT is for graph-level parameters.

---

### Q2: Can users create graphs without INPUT nodes?

**Yes** - but:
- The first unit after START must have no required inputs
- Or all required inputs have defaults
- Or use UserInputUnit (prompts during execution)

**Use cases**:
- Fully automated workflows (no human input)
- Workflows that read from files/APIs

---

### Q3: Should OUTPUT nodes be optional?

**Yes** - graphs can be "fire and forget":
```
start → INPUT[topic] → write-poem → save-to-file
```

No OUTPUT node needed if results are written to filesystem.

OUTPUT nodes are for:
- Explicit graph outputs
- Future: graph-as-unit composition
- CLI: `cg wg result my-workflow` shows OUTPUT values

---

### Q4: v1 Scope - What to implement?

**RESOLVED** (DYK session 2026-01-27): START only for v1.

**Decision**:

| Node Type | v1 Scope | Rationale |
|-----------|----------|-----------|
| START | ✅ Keep as-is | Already works |
| INPUT | ❌ Defer to Phase 5+ | Adds complexity, can use UserInputUnit |
| OUTPUT | ❌ Defer to Phase 5+ | Not blocking |
| GATE/BRANCH/JOIN | ❌ Future | v2+ |

**v1 Strategy**:
- Keep START as the only control node
- Document: "First node after START must have no required inputs"
- Users use UserInputUnit to provide data
- Revisit INPUT/OUTPUT when adding graph composition

---

## Implementation Impact (if adding INPUT/OUTPUT in v1)

### Files to Modify

| File | Change |
|------|--------|
| `workgraph-service.interface.ts` | Add `ControlNodeType`, `ControlNode` types |
| `workgraph.service.ts` | Handle control nodes in `addNodeAfter`, `show`, `status` |
| `worknode.schema.ts` | Add control node schema variants |
| `node-id.ts` | Handle control node ID generation |

### New Test Cases

- Create INPUT node after START
- INPUT node provides output to unit node
- OUTPUT node receives input from unit node
- Cannot remove START node
- Only one START per graph
- Orphan detection with control nodes

---

## Decision Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Abstraction | `ControlNode` vs `UnitNode` | Clean separation of concerns |
| v1 Scope | START only | Minimize complexity, UserInputUnit suffices |
| ID Format | `<type>-<hex3>` | Consistent with unit nodes |
| INPUT purpose | Graph parameters | Different from UserInputUnit (in-flow prompts) |
| OUTPUT purpose | Graph composition | Future: graph-as-unit |

---

## Next Steps

1. **Decide v1 scope** - START only, or include INPUT?
2. **Update Phase 4 tasks** if including INPUT
3. **Update data model docs** with control node types
4. **Add to test plan** - control node handling

---

## References

- Phase 4 DYK session (2026-01-27) - triggered this workshop
- workgraph-data-model.md - current node representation
- spec AC-04 through AC-08 - node operations
