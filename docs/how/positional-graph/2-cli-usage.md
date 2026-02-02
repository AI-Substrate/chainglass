# Positional Graph — CLI Usage

All positional graph commands are under the `cg wf` command group. Use `--json` on any command for machine-readable JSON output. Use `--workspace-path <path>` to target a specific workspace.

## Graph Commands

### Create a graph

```bash
cg wf create <slug>
```

Creates a new positional graph with one empty line (line 0). The slug must match `[a-z][a-z0-9-]*`.

```bash
cg wf create my-pipeline
# Output: Created graph 'my-pipeline' with initial line line-a4f
```

### Show graph structure

```bash
cg wf show <slug>
```

Displays the graph's lines and node counts.

```bash
cg wf show my-pipeline
# Output:
# Graph: my-pipeline (v1.0)
# Line 0: line-a4f "Input" (auto) — 1 node
# Line 1: line-b5c "Processing" (manual) — 3 nodes
# Total: 4 nodes
```

### List all graphs

```bash
cg wf list
```

Lists all positional graph slugs in the current workspace.

### Delete a graph

```bash
cg wf delete <slug>
```

Removes the graph and all its data (lines, nodes, state).

## Line Commands

### Add a line

```bash
cg wf line add <graph-slug> [options]
```

Options:
- `--at-index <n>` — Insert at specific position (0-based)
- `--after-line-id <id>` — Insert after a specific line
- `--before-line-id <id>` — Insert before a specific line
- `--label <text>` — Set line label
- `--description <text>` — Set line description
- `--transition <auto|manual>` — Set transition mode (default: auto)

```bash
cg wf line add my-pipeline --label "Research" --at-index 1
# Output: Added line line-c6d at index 1
```

### Remove a line

```bash
cg wf line remove <graph-slug> <line-id>
```

The line must be empty (no nodes). The last remaining line cannot be removed.

### Move a line

```bash
cg wf line move <graph-slug> <line-id> <to-index>
```

Moves a line to a new position in the ordering.

### Set line transition

```bash
cg wf line set-transition <graph-slug> <line-id> <auto|manual>
```

Changes the transition mode. When set to `manual`, nodes on the next line will not start until the transition is triggered.

### Set line label

```bash
cg wf line set-label <graph-slug> <line-id> <label>
```

### Set line description

```bash
cg wf line set-description <graph-slug> <line-id> <description>
```

## Node Commands

### Add a node

```bash
cg wf node add <graph-slug> <line-id> <unit-slug> [options]
```

Options:
- `--at-position <n>` — Insert at specific position (0-based)
- `--description <text>` — Set node description
- `--execution <serial|parallel>` — Set execution mode (default: serial)

```bash
cg wf node add my-pipeline line-a4f sample-coder
# Output: Added node sample-coder-e1f to line line-a4f at position 0
```

### Remove a node

```bash
cg wf node remove <graph-slug> <node-id>
```

### Move a node

```bash
cg wf node move <graph-slug> <node-id> [options]
```

Options:
- `--to-line <line-id>` — Move to a different line
- `--to-position <n>` — Move to a specific position within the target line

```bash
# Move to a different line
cg wf node move my-pipeline sample-coder-e1f --to-line line-c6d

# Reorder within current line
cg wf node move my-pipeline sample-coder-e1f --to-position 0
```

### Show node details

```bash
cg wf node show <graph-slug> <node-id>
```

Displays the node's unit slug, execution mode, position, line, and input wiring.

### Set node description

```bash
cg wf node set-description <graph-slug> <node-id> <description>
```

### Set node execution mode

```bash
cg wf node set-execution <graph-slug> <node-id> <serial|parallel>
```

### Wire an input

```bash
cg wf node set-input <graph-slug> <node-id> <input-name> [options]
```

Options (one of `--from-unit` or `--from-node` is required):
- `--from-unit <unit-slug>` — Wire from all matching predecessor nodes (collect-all)
- `--from-node <node-id>` — Wire from a specific node
- `--output <output-name>` — The output name on the source node (required)

```bash
# Wire by unit slug (collect-all resolution)
cg wf node set-input my-pipeline coder-e1f spec --from-unit sample-input --output spec

# Wire by explicit node ID
cg wf node set-input my-pipeline coder-e1f config --from-node config-a1b --output settings
```

### Remove an input wiring

```bash
cg wf node remove-input <graph-slug> <node-id> <input-name>
```

### Collate inputs

```bash
cg wf node collate <graph-slug> <node-id>
```

Resolves all inputs for a node and shows their status (available, waiting, or error).

## Status Commands

### Graph status

```bash
cg wf status <graph-slug>
```

Shows overall graph status including completion progress, ready nodes, and per-line breakdown.

### Node status

```bash
cg wf status <graph-slug> --node <node-id>
```

Shows detailed node status including readiness gates (preceding lines, transition, serial neighbor, inputs).

### Line status

```bash
cg wf status <graph-slug> --line <line-id>
```

Shows line-level status including completion, ready nodes, and transition state.

### Trigger a manual transition

```bash
cg wf trigger <graph-slug> <line-id>
```

Opens the manual transition gate on a line, allowing nodes on the next line to become eligible for execution.

## Common Workflows

### Create and populate a graph

```bash
cg wf create research-pipeline
cg wf line set-label research-pipeline line-xxx "Input"
cg wf node add research-pipeline line-xxx sample-input
cg wf line add research-pipeline --label "Research"
cg wf node add research-pipeline line-yyy researcher
cg wf node add research-pipeline line-yyy researcher
cg wf line add research-pipeline --label "Output"
cg wf node add research-pipeline line-zzz report-writer
```

### Wire inputs and check status

```bash
# Wire the report-writer's input from researcher outputs
cg wf node set-input research-pipeline writer-abc findings --from-unit researcher --output summary

# Check what's ready
cg wf status research-pipeline

# Check specific node readiness
cg wf status research-pipeline --node writer-abc
```

### Use manual transitions for staged execution

```bash
# Set a gate between research and output
cg wf line set-transition research-pipeline line-yyy manual

# After research completes, trigger the gate
cg wf trigger research-pipeline line-yyy

# Verify output line nodes are now eligible
cg wf status research-pipeline --line line-zzz
```

## JSON Output

Add `--json` to any command for structured JSON output:

```bash
cg wf show my-pipeline --json
```

JSON responses follow the `CommandResponse` envelope format:

```json
{
  "command": "wf.show",
  "success": true,
  "data": {
    "slug": "my-pipeline",
    "lines": [...],
    "totalNodeCount": 4
  }
}
```

On error:

```json
{
  "command": "wf.node.add",
  "success": false,
  "errors": [
    { "code": "E157", "message": "Graph 'missing' not found" }
  ]
}
```

## Error Codes

| Code | Meaning |
|------|---------|
| E150 | Line not found |
| E151 | Line not empty (cannot remove) |
| E152 | Invalid line index (out of range) |
| E153 | Node not found |
| E154 | Invalid node position (out of range) |
| E155 | Duplicate node ID |
| E156 | Cannot remove last line |
| E157 | Graph not found |
| E158 | Graph already exists |
| E159 | WorkUnit not found |
| E160 | Input not declared on WorkUnit |
| E161 | Predecessor not found (no matching node in scope) |
| E162 | Ambiguous predecessor (unused) |
| E163 | Output not declared on source WorkUnit |
| E164 | Invalid ordinal (unused) |
| E170 | Node not ready to run |
| E171 | Transition blocked (manual gate not triggered) |
