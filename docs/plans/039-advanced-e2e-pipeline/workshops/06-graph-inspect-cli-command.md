# Workshop: Graph Inspect CLI Command

**Type**: CLI Flow
**Plan**: 039-advanced-e2e-pipeline
**Spec**: [advanced-e2e-pipeline-spec.md](../advanced-e2e-pipeline-spec.md)
**Created**: 2026-02-21
**Status**: Draft

**Related Documents**:
- [reality.format.ts](../../../../packages/positional-graph/src/features/030-orchestration/reality.format.ts) — Existing compact status formatter
- [positional-graph.command.ts](../../../../apps/cli/src/commands/positional-graph.command.ts) — CLI command registration

---

## Purpose

Design a `cg wf inspect <slug>` CLI command that dumps the complete state of a graph: every node, its execution status, timestamps, input wiring, saved outputs (names + values), and data files. This is the "show me everything" command for debugging and post-mortem analysis.

## Key Questions Addressed

- What information should be in the default human-readable output vs `--json`?
- How do we display output values without flooding the terminal?
- What's the right level of detail for inputs vs outputs vs events?
- How does this relate to the existing `cg wf status` command?

---

## Relationship to Existing Commands

| Command | Purpose | Level of Detail |
|---------|---------|-----------------|
| `cg wf status <slug>` | Compact graph overview | Glyphs + progress bar. No data. |
| `cg wf status <slug> --node <id>` | Single node status | Status, canRun, readiness. No outputs. |
| `cg wf node collate <slug> <id>` | Input resolution | Input availability per node. Agent-facing. |
| **`cg wf inspect <slug>`** | **Full graph dump** | **Everything: status, timing, inputs, outputs, data values** |

`inspect` is the developer/debugging command. `status` is the dashboard. `collate` is for agents.

---

## Command Summary

| Command | Purpose |
|---------|---------|
| `cg wf inspect <slug>` | Full graph dump (human-readable) |
| `cg wf inspect <slug> --json` | Full graph dump (machine-readable) |
| `cg wf inspect <slug> --node <id>` | Single node deep dive |
| `cg wf inspect <slug> --outputs` | Focus on output data values |
| `cg wf inspect <slug> --compact` | Status + outputs only (no timing/events) |

---

## Default Output: `cg wf inspect <slug>`

```
$ cg wf inspect advanced-pipeline

Graph: advanced-pipeline
Status: complete
Updated: 2026-02-21T10:51:02Z

─────────────────────────────
  Line 0: ✅ human-input-b3f
  Line 1: ✅ spec-writer-e66
  Line 2: ✅ programmer-a-a8c │ ✅ programmer-b-b34
  Line 3: ✅ reviewer-df3 → ✅ summariser-951
─────────────────────────────
  Progress: 6/6 complete

━━━ human-input-b3f ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Unit:     human-input (user-input)
  Status:   complete
  Started:  2026-02-21T08:45:51Z
  Ended:    2026-02-21T08:45:54Z  (3s)
  Inputs:   (none)
  Outputs:
    requirements = "Build a CLI tool that converts CSV files to JSON fo…"

━━━ spec-writer-e66 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Unit:     spec-writer (agent)
  Status:   complete
  Started:  2026-02-21T08:45:54Z
  Ended:    2026-02-21T08:49:13Z  (3m 19s)
  Context:  serial, waitForPrevious
  Inputs:
    requirements ← human-input-b3f/requirements  ✓
  Outputs:
    language_1 = "Python"
    language_2 = "Go"
    spec       = "A CLI tool that converts CSV files to JSON format. …"

━━━ programmer-a-a8c ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Unit:     programmer-a (agent)
  Status:   complete
  Started:  2026-02-21T08:49:14Z
  Ended:    2026-02-21T08:49:46Z  (32s)
  Context:  parallel, noContext
  Inputs:
    requirements ← human-input-b3f/requirements  ✓
    spec         ← spec-writer-e66/spec           ✓
    language     ← spec-writer-e66/language_1      ✓
  Outputs:
    code         → csv2json.py (2.8 KB)
                   #!/usr/bin/env python3
                   """CSV to JSON converter CLI tool with custom delim…
    test_results → test-results.txt (462 B)
                   Tests would pass: The program uses Python standard
                   library modules (csv, json, argparse) with well-de…
    summary      = "Built a Python CLI tool (csv2json) that converts C…" (173 chars)

━━━ programmer-b-b34 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Unit:     programmer-b (agent)
  Status:   complete
  Started:  2026-02-21T08:49:14Z
  Ended:    2026-02-21T08:49:49Z  (35s)
  Context:  parallel, noContext
  Inputs:
    requirements ← human-input-b3f/requirements  ✓
    spec         ← spec-writer-e66/spec           ✓
    language     ← spec-writer-e66/language_2      ✓
  Outputs:
    code         → main.go (2.3 KB)
                   package main
                   import (
    test_results → test-results.txt (508 B)
                   Tests would pass: The program correctly uses Go
                   standard library csv.NewReader with configurable C…
    summary      = "A Go CLI tool that converts CSV files to JSON, sup…" (147 chars)

━━━ reviewer-df3 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Unit:     reviewer (agent)
  Status:   complete
  Started:  2026-02-21T08:49:50Z
  Ended:    2026-02-21T08:50:32Z  (42s)
  Context:  serial, inherit from spec-writer-e66
  Inputs:
    code_a    ← programmer-a-a8c/code          ✓
    code_b    ← programmer-b-b34/code          ✓
    spec      ← spec-writer-e66/spec           ✓
  Outputs:
    review_a  → review-python.md (584 B)
                Python implementation: Well-structured and idiomatic.
                Uses csv.DictReader which cleanly handles header-to-…
    review_b  → review-go.md (593 B)
                Go implementation: Solid and well-organized. Uses
                encoding/csv with configurable Comma rune for delim…
    metrics_a → metrics-python.json (302 B)
                 {"loc": 65, "assessment": "PASS", "notes": "The Py…
    metrics_b → metrics-go.json (296 B)
                 {"loc": 95, "assessment": "PASS", "notes": "The Go…

━━━ summariser-951 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Unit:     summariser (agent)
  Status:   complete
  Started:  2026-02-21T08:50:33Z
  Ended:    2026-02-21T08:51:02Z  (29s)
  Context:  serial, inherit from reviewer-df3
  Inputs:
    review_a  ← reviewer-df3/review_a          ✓
    review_b  ← reviewer-df3/review_b          ✓
    metrics_a ← reviewer-df3/metrics_a         ✓
    metrics_b ← reviewer-df3/metrics_b         ✓
  Outputs:
    final_report → final-report.md (1.1 KB)
                   # Final Report: CSV Header Mapper
                   ## Overview
    overall_pass = "pass"
    total_loc    = 160
```

### Design Notes

**Output value truncation**: String values are truncated to 60 characters with `…`. Character count shown in parens for long values. Short values (< 60 chars) shown in full. Numbers and booleans shown as-is.

**File outputs**: When a value is a relative path matching `data/outputs/*`, it's a file output (from `save-output-file`). Shown with the filename, file size, and an extract of the first few lines:

```
  Outputs:
    code         = "#!/usr/bin/env python3\n\"\"\"CSV to JSON converter…" (2847 chars)
    report       → report.md (4.2 KB)
                   # Final Report
                   Both implementations pass review with minor notes...
    diagram      → architecture.svg (12.1 KB) [binary]
```

File outputs use `→` instead of `=` to distinguish from data values. Text files show a 2-line extract. Binary files show `[binary]`.

**Duration**: Computed from `started_at` to `completed_at`. Shown as human-friendly (`3s`, `32s`, `3m 19s`).

**Input wiring**: Shows `inputName ← sourceNode/outputName` with a checkmark if the value is available. Uses `✗` if the input is missing/unavailable.

**Context line**: Only shown for agent nodes. Shows execution mode + context inheritance info from orchestratorSettings.

---

## Single Node Deep Dive: `cg wf inspect <slug> --node <id>`

```
$ cg wf inspect advanced-pipeline --node spec-writer-e66

━━━ spec-writer-e66 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Unit:     spec-writer (agent)
  Status:   complete
  Started:  2026-02-21T08:45:54Z
  Ended:    2026-02-21T08:49:13Z  (3m 19s)
  Context:  serial, waitForPrevious

  Inputs:
    requirements ← human-input-b3f/requirements  ✓

  Outputs (3):
    language_1 = "Python"
    language_2 = "Go"
    spec       = "A CLI tool that converts CSV files to JSON format. The tool
                  accepts a CSV file as input and outputs a JSON file. It
                  supports custom delimiters (e.g., tab, semicolon, pipe) and
                  header mapping to allow renaming or transforming column
                  headers during conversion. The application will be
                  implemented in two languages: Python and Go. Both
                  implementations must provide identical CLI interfaces and
                  output formatting."

  Events (6):
    1. node:accepted   agent       2026-02-21T08:46:01Z  cli✓ orch✓
    2. question:ask    agent       2026-02-21T08:46:22Z  cli✓ orch✓
    3. question:answer orchestrator 2026-02-21T08:46:25Z  cli✓ orch✓
    4. node:restart    orchestrator 2026-02-21T08:46:25Z  cli✓ orch✓
    5. node:accepted   agent       2026-02-21T08:46:34Z  cli✓ orch✓
    6. node:completed  agent       2026-02-21T08:49:13Z  cli✓ orch✓

  Files:
    .chainglass/data/workflows/advanced-pipeline/nodes/spec-writer-e66/
    ├── node.yaml
    └── data/
        └── data.json (3 outputs)
```

The `--node` view shows **full output values** (not truncated) and the **event log** with stamp status.

---

## Outputs-Only Mode: `cg wf inspect <slug> --outputs`

```
$ cg wf inspect advanced-pipeline --outputs

Graph: advanced-pipeline (complete)

human-input-b3f:
  requirements = "Build a CLI tool that converts CSV files to JSON format
                  with support for custom delimiters and header mapping."

spec-writer-e66:
  language_1 = "Python"
  language_2 = "Go"
  spec       = "A CLI tool that converts CSV files to JSON format. The tool
                accepts a CSV file as input and outputs a JSON file. It
                supports custom delimiters..."

programmer-a-a8c:
  code         = "#!/usr/bin/env python3..."  (2847 chars)
  test_results = "Tests would pass..."        (462 chars)
  summary      = "Built a Python CLI tool..."  (173 chars)

programmer-b-b34:
  code         = "package main..."             (2301 chars)
  test_results = "Tests would pass..."        (508 chars)
  summary      = "A Go CLI tool..."            (147 chars)

reviewer-df3:
  review_a  = "Python implementation: Well-structured..."  (584 chars)
  review_b  = "Go implementation: Solid..."                (593 chars)
  metrics_a = "Lines of code: ~65. Assessment: PASS..."   (302 chars)
  metrics_b = "Lines of code: ~95. Assessment: PASS..."   (296 chars)

summariser-951:
  final_report = "# Final Report: CSV Header Mapper..."   (1142 chars)
  overall_pass = "pass"
  total_loc    = 160
```

In `--outputs` mode, string values are truncated to 40 chars to keep things scannable. Use `--node <id>` for full values.

---

## Compact Mode: `cg wf inspect <slug> --compact`

```
$ cg wf inspect advanced-pipeline --compact

Graph: advanced-pipeline (complete) — 6/6 nodes

  ✅ human-input-b3f    user-input   3s     1 output
  ✅ spec-writer-e66    agent        3m19s  3 outputs  (Q&A: 1 question)
  ✅ programmer-a-a8c   agent        32s    3 outputs  (parallel, noContext)
  ✅ programmer-b-b34   agent        35s    3 outputs  (parallel, noContext)
  ✅ reviewer-df3       agent        42s    4 outputs  (inherit: spec-writer)
  ✅ summariser-951     agent        29s    3 outputs  (inherit: reviewer)
```

One line per node. Good for quick checks and CI output.

---

## JSON Output: `cg wf inspect <slug> --json`

```
$ cg wf inspect advanced-pipeline --json

{
  "success": true,
  "command": "wf.inspect",
  "data": {
    "graphSlug": "advanced-pipeline",
    "graphStatus": "complete",
    "updatedAt": "2026-02-21T10:51:02.263Z",
    "totalNodes": 6,
    "completedNodes": 6,
    "failedNodes": 0,
    "nodes": [
      {
        "nodeId": "human-input-b3f",
        "unitSlug": "human-input",
        "unitType": "user-input",
        "lineIndex": 0,
        "position": 0,
        "status": "complete",
        "startedAt": "2026-02-21T08:45:51.830Z",
        "completedAt": "2026-02-21T08:45:54.849Z",
        "durationMs": 3019,
        "orchestratorSettings": {
          "execution": "serial",
          "waitForPrevious": true
        },
        "inputs": {},
        "outputs": {
          "requirements": "Build a CLI tool that converts CSV files to JSON format with support for custom delimiters and header mapping."
        },
        "outputCount": 1,
        "eventCount": 2,
        "questions": []
      },
      {
        "nodeId": "spec-writer-e66",
        "unitSlug": "spec-writer",
        "unitType": "agent",
        "lineIndex": 1,
        "position": 0,
        "status": "complete",
        "startedAt": "2026-02-21T08:45:54.913Z",
        "completedAt": "2026-02-21T08:49:13.615Z",
        "durationMs": 198702,
        "orchestratorSettings": {
          "execution": "serial",
          "waitForPrevious": true
        },
        "inputs": {
          "requirements": {
            "fromNode": "human-input-b3f",
            "fromOutput": "requirements",
            "available": true
          }
        },
        "outputs": {
          "language_1": "Python",
          "language_2": "Go",
          "spec": "A CLI tool that converts CSV files to JSON format..."
        },
        "outputCount": 3,
        "eventCount": 6,
        "questions": [
          {
            "questionId": "2026-02-21T08:46:22.363Z_918bb0",
            "text": "What two programming languages would you like this application written in?",
            "answered": true,
            "answer": "python and go"
          }
        ]
      }
    ]
  }
}
```

**JSON includes everything**: full output values (not truncated), all event metadata, question/answer pairs. For scripting, piping, and programmatic analysis.

---

## Implementation Sketch

### Service Method

Add to `IPositionalGraphService`:

```typescript
interface InspectNodeResult {
  nodeId: string;
  unitSlug: string;
  unitType: 'agent' | 'code' | 'user-input';
  lineIndex: number;
  position: number;
  status: ExecutionStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  orchestratorSettings?: OrchestratorNodeSettings;
  inputs: Record<string, {
    fromNode: string;
    fromOutput: string;
    available: boolean;
  }>;
  outputs: Record<string, unknown>;
  outputCount: number;
  eventCount: number;
  questions: Array<{
    questionId: string;
    text: string;
    answered: boolean;
    answer?: string;
  }>;
}

interface InspectResult {
  graphSlug: string;
  graphStatus: string;
  updatedAt: string;
  totalNodes: number;
  completedNodes: number;
  failedNodes: number;
  nodes: InspectNodeResult[];
  errors: ServiceError[];
}

async inspectGraph(
  ctx: WorkspaceContext,
  graphSlug: string
): Promise<InspectResult>;
```

### Implementation Strategy

The `inspectGraph` method composes existing service calls:

```typescript
async inspectGraph(ctx, graphSlug) {
  const status = await this.getStatus(ctx, graphSlug);
  const state = await this.loadState(ctx, graphSlug);
  const loaded = await this.loadGraphDefinition(ctx, graphSlug);
  const def = loaded.definition;

  const nodes: InspectNodeResult[] = [];

  for (const line of def.lines) {
    for (const nodeRef of line.nodes) {
      const nodeConfig = await this.loadNodeConfig(ctx, graphSlug, nodeRef.id);
      const canEndResult = await this.canEnd(ctx, graphSlug, nodeRef.id);
      const nodeState = state.nodes?.[nodeRef.id];

      // Read data.json for output values
      const outputValues = {};
      for (const name of canEndResult.savedOutputs) {
        const data = await this.getOutputData(ctx, graphSlug, nodeRef.id, name);
        if (!data.errors?.length) outputValues[name] = data.value;
      }

      // Build input map from node.yaml
      const inputs = {};
      for (const [inputName, inputDef] of Object.entries(nodeConfig.inputs ?? {})) {
        inputs[inputName] = {
          fromNode: inputDef.from_node,
          fromOutput: inputDef.from_output,
          available: canEndResult.savedOutputs.length > 0, // simplified
        };
      }

      // Extract questions from state
      const questions = (state.questions ?? [])
        .filter(q => q.node_id === nodeRef.id)
        .map(q => ({
          questionId: q.question_id,
          text: q.text,
          answered: q.answered,
          answer: q.answer,
        }));

      nodes.push({
        nodeId: nodeRef.id,
        unitSlug: nodeConfig.unit_slug,
        unitType: /* from work unit */,
        lineIndex: line.index,
        position: /* position in line */,
        status: nodeState?.status ?? 'pending',
        startedAt: nodeState?.started_at,
        completedAt: nodeState?.completed_at,
        durationMs: /* computed */,
        orchestratorSettings: nodeConfig.orchestratorSettings,
        inputs,
        outputs: outputValues,
        outputCount: canEndResult.savedOutputs.length,
        eventCount: (nodeState?.events ?? []).length,
        questions,
      });
    }
  }

  return {
    graphSlug,
    graphStatus: status.status,
    updatedAt: state.updated_at,
    totalNodes: status.totalNodes,
    completedNodes: status.completedNodes,
    failedNodes: /* count blocked-error */,
    nodes,
    errors: [],
  };
}
```

### CLI Registration

```typescript
wf.command('inspect <slug>')
  .description('Full graph dump: nodes, status, inputs, outputs, data values')
  .option('--node <nodeId>', 'Deep dive on a single node')
  .option('--outputs', 'Show only output data values')
  .option('--compact', 'One line per node')
  .action(
    wrapAction(async (slug: string, options: InspectOptions, cmd: Command) => {
      const parentOpts = cmd.parent?.opts() ?? {};
      await handleWfInspect(slug, {
        ...options,
        json: parentOpts.json,
        workspacePath: parentOpts.workspacePath,
      });
    })
  );
```

### Human-Readable Formatter

A new `formatInspect()` function (separate from `reality.format.ts` since inspect is a CLI concern, not a domain concept):

```typescript
function formatInspect(result: InspectResult, options: { compact?: boolean; outputs?: boolean; node?: string }): string {
  // Delegates to sub-formatters based on mode
  if (options.compact) return formatCompact(result);
  if (options.outputs) return formatOutputsOnly(result);
  if (options.node) return formatNodeDeep(result, options.node);
  return formatFull(result);
}

function truncate(value: unknown, maxLen: number): string {
  if (typeof value === 'string') {
    // File output: value is "data/outputs/<filename>" — handled by formatOutputValue
    if (value.startsWith('data/outputs/')) return value;
    if (value.length <= maxLen) return `"${value}"`;
    return `"${value.slice(0, maxLen)}…"  (${value.length} chars)`;
  }
  return String(value);
}

function formatOutputValue(
  name: string, value: unknown, nodeDir: string, maxLen: number
): string {
  // File outputs stored as "data/outputs/<filename>" by saveOutputFile
  if (typeof value === 'string' && value.startsWith('data/outputs/')) {
    const filename = value.replace('data/outputs/', '');
    const filePath = path.join(nodeDir, value);
    try {
      const stats = fs.statSync(filePath);
      const size = formatFileSize(stats.size);
      let line = `${name.padEnd(14)} → ${filename} (${size})`;
      // Text file: show 2-line extract. Binary: show [binary].
      if (isTextFile(filename)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').slice(0, 2);
        for (const l of lines) {
          line += `\n${''.padEnd(17)}${l.slice(0, 60)}`;
        }
      } else {
        line += ' [binary]';
      }
      return line;
    } catch {
      return `${name.padEnd(14)} → ${filename} (missing)`;
    }
  }
  return `${name.padEnd(14)} = ${truncate(value, maxLen)}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}
```

---

## In-Progress Graph Example

```
$ cg wf inspect advanced-pipeline

Graph: advanced-pipeline
Status: in_progress
Updated: 2026-02-21T08:49:14Z

─────────────────────────────
  Line 0: ✅ human-input-b3f
  Line 1: ✅ spec-writer-e66
  Line 2: 🔶 programmer-a-a8c │ 🔶 programmer-b-b34
  Line 3: ⚪ reviewer-df3 → ⚪ summariser-951
─────────────────────────────
  Progress: 2/6 complete

━━━ human-input-b3f ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Unit:     human-input (user-input)
  Status:   complete ✅
  Started:  2026-02-21T08:45:51Z
  Ended:    2026-02-21T08:45:54Z  (3s)
  Outputs:
    requirements = "Build a CLI tool that converts CSV files to JSON fo…"

━━━ spec-writer-e66 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Unit:     spec-writer (agent)
  Status:   complete ✅
  Started:  2026-02-21T08:45:54Z
  Ended:    2026-02-21T08:49:13Z  (3m 19s)
  Outputs:
    language_1 = "Python"
    language_2 = "Go"
    spec       = "A CLI tool that converts CSV files to JSON format. …"

━━━ programmer-a-a8c ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Unit:     programmer-a (agent)
  Status:   agent-accepted 🔶
  Started:  2026-02-21T08:49:14Z
  Running:  32s
  Inputs:
    requirements ← human-input-b3f/requirements  ✓
    spec         ← spec-writer-e66/spec           ✓
    language     ← spec-writer-e66/language_1      ✓
  Outputs:  (none yet)

━━━ programmer-b-b34 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Unit:     programmer-b (agent)
  Status:   agent-accepted 🔶
  Started:  2026-02-21T08:49:14Z
  Running:  32s
  Inputs:
    requirements ← human-input-b3f/requirements  ✓
    spec         ← spec-writer-e66/spec           ✓
    language     ← spec-writer-e66/language_2      ✓
  Outputs:  (none yet)

━━━ reviewer-df3 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Unit:     reviewer (agent)
  Status:   pending ⚪
  Waiting:  serial gate (programmers not complete)
  Outputs:  (none yet)

━━━ summariser-951 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Unit:     summariser (agent)
  Status:   pending ⚪
  Waiting:  serial gate (reviewer not complete)
  Outputs:  (none yet)
```

For running nodes: shows `Running: Xs` instead of `Ended:`. For pending nodes: shows `Waiting:` with a reason.

---

## Error State Example

```
$ cg wf inspect my-pipeline

Graph: my-pipeline
Status: in_progress
Updated: 2026-02-21T09:15:32Z

─────────────────────────────
  Line 0: ✅ input-node-a1b
  Line 1: ❌ worker-c3d
─────────────────────────────
  Progress: 1/2 complete (1 failed)

━━━ worker-c3d ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Unit:     worker (agent)
  Status:   blocked-error ❌
  Started:  2026-02-21T09:14:50Z
  Failed:   2026-02-21T09:15:32Z  (42s)
  Error:    E153 — "Step 1: Ran 'cg wf node accept'. Command failed."
  Outputs:  (none)
```

---

## Open Questions

### Q1: Should `--json` include full output values or truncated?

**RESOLVED**: Full values in JSON (it's for machines). Truncated in human-readable. Use `--node <id>` for full values in human mode.

### Q2: Should events be shown in default mode?

**RESOLVED**: No — events are verbose and mostly for debugging specific issues. Show event COUNT in default mode. Full event list only in `--node` deep dive mode.

### Q3: Should inspect load work unit definitions for type info?

**RESOLVED**: Yes — we need the unit type (agent/code/user-input) which comes from the work unit yaml, not the node config. This is one extra `load()` call per node.

### Q4: Should we include session IDs?

**OPEN**: Session IDs are useful for debugging context inheritance but are an ODS/PodManager concept, not a graph-domain concept (ADR-0012). Options:
- **Option A**: Include in `--json` only (machine debugging)
- **Option B**: Include in `--node` deep dive (developer debugging)
- **Option C**: Don't include (separate concern — use pod-sessions.json directly)

Recommendation: Option B — show in `--node` mode only.

---

## Quick Reference

```bash
# Full dump — most common usage
cg wf inspect advanced-pipeline

# Machine-readable for scripting
cg wf inspect advanced-pipeline --json

# Deep dive on one node (full output values + events)
cg wf inspect advanced-pipeline --node spec-writer-e66

# Just the data values
cg wf inspect advanced-pipeline --outputs

# One-liner per node (CI/quick check)
cg wf inspect advanced-pipeline --compact

# Pipe JSON to jq for specific queries
cg wf inspect advanced-pipeline --json | jq '.data.nodes[] | select(.status == "blocked-error")'
cg wf inspect advanced-pipeline --json | jq '.data.nodes[] | {nodeId, outputCount, durationMs}'
```
