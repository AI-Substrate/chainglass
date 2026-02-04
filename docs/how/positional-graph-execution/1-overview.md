# Positional Graph Execution — Overview

The execution lifecycle system provides the infrastructure for running nodes in a positional graph. While [positional-graph/1-overview.md](../positional-graph/1-overview.md) explains the graph structure and data flow, this document covers how nodes execute — starting, saving outputs, asking questions, retrieving inputs, and completing.

## Node State Machine

Nodes progress through a state machine during execution:

```
                              ┌──────────────────┐
                              │     pending      │
                              └────────┬─────────┘
                                       │ start
                                       ▼
                    ┌─────────────────────────────────────┐
                    │              running                │
                    └───────┬─────────────────────┬───────┘
                            │ ask                 │ can-end + end
                            ▼                     │
                    ┌───────────────────┐         │
                    │ waiting-question  │         │
                    └───────┬───────────┘         │
                            │ answer              │
                            └──────────┬──────────┘
                                       ▼
                              ┌──────────────────┐
                              │     complete     │
                              └──────────────────┘
```

### States

| State | Meaning |
|-------|---------|
| `pending` | Node is waiting to start (either not ready, or ready but not yet started) |
| `running` | Node is actively executing — can save outputs, ask questions |
| `waiting-question` | Node has asked a question and is waiting for an answer |
| `complete` | Node has finished — all required outputs saved, state is immutable |

### Transitions

| Transition | From | To | Command |
|------------|------|-----|---------|
| Start | `pending` | `running` | `cg wf node start` |
| Ask | `running` | `waiting-question` | `cg wf node ask` |
| Answer | `waiting-question` | `running` | `cg wf node answer` |
| End | `running` | `complete` | `cg wf node end` |

Invalid transitions return error `E172` (Invalid state transition).

## Execution Readiness (4-Gate Algorithm)

Before a node can start, it must pass all four gates in order:

```
Gate 1: Preceding lines complete?
        │
        │ YES
        ▼
Gate 2: Transition gate open?
        │
        │ YES
        ▼
Gate 3: Serial neighbor complete?
        │
        │ YES
        ▼
Gate 4: Inputs available?
        │
        │ YES
        ▼
      READY
```

### Gate Details

1. **Preceding lines complete**: Every node on every preceding line must be `complete`. A node on line 2 cannot start until all nodes on lines 0 and 1 are complete.

2. **Transition gate open**: If the immediately preceding line has `transition: manual`, its transition must be triggered. This provides human-controlled flow gates between pipeline stages.

3. **Serial neighbor complete**: If the node has `execution: serial` (the default) and position > 0, the node at position - 1 on the same line must be complete. Parallel nodes skip this gate.

4. **Inputs available**: All required inputs must resolve to `available` status (source nodes complete with output data accessible).

Use `cg wf status <graph> --node <nodeId>` to see which gates are blocking a node.

## Execution Patterns

### Serial Execution

Nodes with `execution: serial` (default) wait for their left neighbor:

```
Line 0: [spec-builder] → [spec-reviewer] → [validator]
                  ↓              ↓             ↓
              starts         waits for     waits for
               first       spec-builder  spec-reviewer
```

### Parallel Execution

Nodes with `execution: parallel` can start together once the line is eligible:

```
Line 2: [alignment-tester] || [pr-preparer] → [PR-creator]
             parallel           parallel         serial
                 ↓                 ↓               ↓
         both can start        can start      waits for
          together             together        pr-preparer
```

### Manual Transition Gates

Lines with `transition: manual` create approval checkpoints:

```
Line 0 (auto): [spec-builder] → [spec-reviewer]
                                       │
                                       ▼
                              (auto-triggers)
                                       │
Line 1 (manual): [coder] → [tester]   ◀─┤ blocked until:
                                       │   cg wf trigger <graph> <line1-id>
                                       │
Line 2 (auto): [PR-creator]           ◀┘
```

## Output Storage

Running nodes can save outputs at any time before ending:

### Data Outputs

```bash
# Save a JSON value
cg wf node save-output-data <graph> <nodeId> <outputName> '{"key": "value"}'

# Retrieve a saved value
cg wf node get-output-data <graph> <nodeId> <outputName>
```

### File Outputs

```bash
# Save a file (copies to node's data directory)
cg wf node save-output-file <graph> <nodeId> <outputName> /path/to/file.txt

# Get the stored file's path
cg wf node get-output-file <graph> <nodeId> <outputName>
```

Output values can be overwritten while the node is running. Once the node completes, outputs are frozen.

## Q&A Protocol

Agentic nodes can ask questions and wait for answers:

```bash
# Node asks a question (running → waiting-question)
cg wf node ask <graph> <nodeId> \
  --type single \
  --text "Which language should I use?" \
  --options "Python" "TypeScript" "Go"

# Orchestrator provides answer (waiting-question → running)
cg wf node answer <graph> <nodeId> <questionId> "TypeScript"

# Node retrieves the answer
cg wf node get-answer <graph> <nodeId> <questionId>
```

### Question Types

| Type | Description | Options |
|------|-------------|---------|
| `text` | Free-form text input | Not used |
| `single` | Single choice from options | Required |
| `multi` | Multiple choices from options | Required |
| `confirm` | Yes/no confirmation | Not used |

## Input Retrieval

Running nodes can retrieve inputs from upstream nodes:

```bash
# Get data input value
cg wf node get-input-data <graph> <nodeId> <inputName>

# Get file input path
cg wf node get-input-file <graph> <nodeId> <inputName>
```

Inputs must be wired (via `cg wf node set-input`) and the source node must be complete. Error `E178` is returned if the input is not available.

For `from_unit` wiring with multiple matches (collect-all pattern), `get-input-data` returns all matching values in the `sources` array.

## Error Codes

| Code | Meaning | Common Cause |
|------|---------|--------------|
| E170 | Node not ready | One of the 4 gates is failing |
| E171 | Transition blocked | Manual gate not triggered |
| E172 | Invalid state transition | Wrong state for operation (e.g., ending a pending node) |
| E173 | Question not found | Invalid question ID |
| E175 | Output not found | Output not saved before get |
| E176 | Node not running | Operation requires running state |
| E177 | Node not waiting | Answer provided but no question pending |
| E178 | Input not available | Source not complete or wiring error |
| E179 | File not found | Source file doesn't exist |

## Typical Execution Flow

For an agentic node (with Q&A):

```
1. cg wf status <graph> --node <nodeId>     # Check if ready
2. cg wf node start <graph> <nodeId>         # pending → running
3. cg wf node get-input-data <graph> <nodeId> <input>  # Get inputs
4. ... agent does work ...
5. cg wf node ask <graph> <nodeId> ...       # running → waiting-question
6. ... orchestrator answers ...
7. cg wf node answer <graph> <nodeId> ...    # waiting-question → running
8. cg wf node get-answer <graph> <nodeId> ...  # Retrieve answer
9. ... agent continues work ...
10. cg wf node save-output-data <graph> <nodeId> <output> ...  # Save outputs
11. cg wf node can-end <graph> <nodeId>      # Verify outputs saved
12. cg wf node end <graph> <nodeId>          # running → complete
```

For a code-unit node (no Q&A):

```
1. cg wf node start <graph> <nodeId>
2. cg wf node get-input-data <graph> <nodeId> <input>
3. ... simple processing ...
4. cg wf node save-output-data <graph> <nodeId> <output> ...
5. cg wf node end <graph> <nodeId>
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                            CLI                                   │
│  cg wf node start|end|ask|answer|save-output-*|get-input-*      │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                  PositionalGraphService                          │
│  startNode(), endNode(), askQuestion(), answerQuestion()         │
│  saveOutputData(), saveOutputFile(), getOutputData(), ...        │
│  getInputData(), getInputFile()                                  │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Filesystem                                 │
│  .chainglass/data/workflows/<graph>/                             │
│    state.json         # Node status, transitions, questions      │
│    nodes/<nodeId>/                                               │
│      node.yaml        # Node configuration, input wiring         │
│      data/                                                       │
│        data.json      # Output data values                       │
│        <outputName>   # Output files                             │
└─────────────────────────────────────────────────────────────────┘
```

## Related Documentation

- [Positional Graph Overview](../positional-graph/1-overview.md) — Graph structure, lines, nodes, input resolution
- [CLI Reference](./2-cli-reference.md) — Complete command reference for execution lifecycle
- [E2E Flow](./3-e2e-flow.md) — Step-by-step walkthrough of the 7-node E2E test
