# Workshop: E2E Sample Flow Test Harness

**Type**: Integration Pattern + CLI Flow
**Plan**: 017-agent-graph-manual-validate
**Spec**: [agent-graph-manual-validate-spec.md](../agent-graph-manual-validate-spec.md)
**Research**: [e2e-sample-flow-research.md](../research/e2e-sample-flow-research.md)
**Created**: 2026-01-28
**Status**: Draft

**Related Documents**:
- [workgraph-command-flows.md](../../016-agent-units/workgraph-command-flows.md) - CLI command reference
- [workunit-data-model.md](../../016-agent-units/workunit-data-model.md) - Unit schema definitions
- [workgraph-run/](../../../../how/dev/workgraph-run/) - Orchestration harness (this implementation)
- [manual-wf-run/](../../../../how/dev/_old/manual-wf-run/) - Legacy harness (deprecated)

---

## Purpose

Design a complete end-to-end test harness that:
1. Creates a 3-node WorkGraph programmatically
2. Executes each node sequentially with the script acting as orchestrator
3. Demonstrates direct output flow for user-input nodes
4. Demonstrates agent question handover with auto-answer
5. Validates data + file flows correctly between nodes
6. Proves the entire WorkGraph system works as an integrated whole

This workshop answers: **How do we test the complete WorkGraph lifecycle from a single script?**

## Key Questions Addressed

- What sample flow best demonstrates the system?
- How does the orchestrator discover and answer agent questions?
- **Can `end` work from PENDING state?** YES - when outputs are present
- How do we pass data and files between nodes?
- What's the exact command sequence for node execution?

---

## Critical Discovery: `end` from PENDING

**The `start` command is OPTIONAL for nodes where the orchestrator provides data directly.**

### Current State Machine
```
PENDING → start → IN_PROGRESS → end → COMPLETED
```

### Enhanced State Machine (Workshop Proposal)
```
        ┌─────────────────────────────────┐
        │                                 │
        ▼                                 │
    PENDING ───start───► IN_PROGRESS ────end───► COMPLETED
        │                                          ▲
        │                                          │
        └──────────end (if outputs present)────────┘
```

**Key Insight**: If a node has all required outputs present, it IS semantically complete. The purpose of a node is to produce outputs - if outputs exist, mission accomplished.

### Two Execution Patterns

**Pattern A: Direct Output** (orchestrator already has the data)
```bash
cg wg node save-output-data <graph> <node> spec "Build a calculator"
cg wg node end <graph> <node>
```
- No `start` needed
- `end` validates outputs and transitions PENDING → COMPLETED

**Pattern B: Agent Execution** (agent does work, may ask questions)
```bash
cg wg node start <graph> <node>
# ... agent works, may ask questions ...
cg wg node save-output-data <graph> <node> language "bash"
cg wg node save-output-file <graph> <node> script ./add.sh
cg wg node end <graph> <node>
```

---

## Flow Design: "Code Generation Pipeline"

### Why This Flow

A minimal but complete demonstration of:

| Requirement | Solution |
|-------------|----------|
| Direct input | Node 1: orchestrator provides spec directly |
| Agent question | Node 2: agent asks which language to use |
| Auto-answer | Orchestrator responds "bash" automatically |
| Data + File I/O | Node 2 outputs both `language` (data) and `script` (file) |
| Cross-node flow | Node 3 reads both data and file from Node 2 |
| Agent execution | Node 3 runs the script and reports output |

### Flow Diagram

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  get-spec   │────▶│  generate-code   │────▶│   run-verify     │
│sample-input │     │  sample-coder    │     │  sample-tester   │
└─────────────┘     │                  │     │                  │
                    │  asks:           │     │  inputs:         │
  outputs:          │  "which lang?"   │     │  - language      │
  - spec (text)     │                  │     │  - script (file) │
                    │  outputs:        │     │                  │
                    │  - language      │     │  outputs:        │
                    │  - script (file) │     │  - success (bool)│
                    └──────────────────┘     │  - output (text) │
                                             └──────────────────┘
                                                      │
                                                      ▼
                                             Orchestrator reads
                                             success → reports
                                             pipeline result
```

### Data Flow Detail

```
[get-spec]              [generate-code]                [run-verify]
sample-input       →     sample-coder           →      sample-tester

outputs:                inputs:                       inputs:
  spec ─────────────►     spec                         language ◄───┐
                        outputs:                       script ◄─────┤
                          language ─────────────────────────────────┤
                          script ───────────────────────────────────┘
                             │                        outputs:
                             ↓                          success ────► Orchestrator
                      asks: "TypeScript, JavaScript,    output        reads & reports
                             Python, or Bash?"
                      orchestrator: "bash"
```

---

## Unit Definitions

### Unit 1: sample-input (user-input)

```yaml
# .chainglass/units/sample-input/unit.yaml
slug: sample-input
type: user-input
version: 1.0.0
description: Provides initial specification for code generation

inputs: []

outputs:
  - name: spec
    type: data
    data_type: text
    required: true
    description: The specification for what code to generate

user_input:
  question_type: text
  prompt: "What code would you like to generate?"
```

**Usage**: Orchestrator uses direct output pattern - saves spec and ends without start.

### Unit 2: sample-coder (agent)

```yaml
# .chainglass/units/sample-coder/unit.yaml
slug: sample-coder
type: agent
version: 1.0.0
description: Generates code based on specification, asks which language to use

inputs:
  - name: spec
    type: data
    data_type: text
    required: true
    description: The specification for what code to generate

outputs:
  - name: language
    type: data
    data_type: text
    required: true
    description: The programming language chosen
  - name: script
    type: file
    required: true
    description: The generated script file

agent:
  prompt_template: commands/main.md
  supported_agents:
    - claude-code
  estimated_tokens: 2000
```

**commands/main.md**:
```markdown
# Code Generator

You are generating code based on a specification.

## Step 1: Get the Specification

Read the input specification:
```
cg wg node get-input-data $GRAPH $NODE spec
```

## Step 2: Ask Which Language

Before generating code, ask the user which programming language to use:
```
cg wg node ask $GRAPH $NODE \
  --type single \
  --text "Which programming language should I use?" \
  --options "typescript" "javascript" "python" "bash"
```

Wait for the answer, then retrieve it from the node's data.

## Step 3: Generate the Code

Based on the specification and chosen language, generate a simple script.
Save it to a file (e.g., `./script.sh` for bash, `./script.py` for python).

## Step 4: Save Outputs

Save both outputs:
```
cg wg node save-output-data $GRAPH $NODE language "<chosen-language>"
cg wg node save-output-file $GRAPH $NODE script ./script.<ext>
```

## Step 5: Complete

```
cg wg node end $GRAPH $NODE
```
```

### Unit 3: sample-tester (agent)

```yaml
# .chainglass/units/sample-tester/unit.yaml
slug: sample-tester
type: agent
version: 1.0.0
description: Runs generated code and reports output

inputs:
  - name: language
    type: data
    data_type: text
    required: true
    description: The programming language of the script
  - name: script
    type: file
    required: true
    description: The script file to run

outputs:
  - name: success
    type: data
    data_type: boolean
    required: true
    description: Whether the script executed successfully
  - name: output
    type: data
    data_type: text
    required: true
    description: The script's stdout/stderr output

agent:
  prompt_template: commands/main.md
  supported_agents:
    - claude-code
  estimated_tokens: 1000
```

**commands/main.md**:
```markdown
# Script Tester

You are testing a generated script by running it and reporting the output.

## Step 1: Get Inputs

Get the language and script path:
```
cg wg node get-input-data $GRAPH $NODE language
cg wg node get-input-file $GRAPH $NODE script
```

## Step 2: Run the Script

Based on the language, run the script:
- **bash**: `bash <script_path>`
- **python**: `python <script_path>`
- **javascript**: `node <script_path>`
- **typescript**: `npx tsx <script_path>`

Capture the output (stdout and stderr) and exit code.

## Step 3: Save Outputs

Save both the success status and the output:
```
cg wg node save-output-data $GRAPH $NODE success true   # or false if failed
cg wg node save-output-data $GRAPH $NODE output "<captured output>"
```

## Step 4: Complete

```
cg wg node end $GRAPH $NODE
```
```

---

## Pre-Execution Checks

Before executing any node, the orchestrator **MUST** verify the node is ready to run.

### Commands for Checking Readiness

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `cg wg node can-run <graph> <node>` | Check if all upstream nodes are complete | Before `start` or `save-output-data` |
| `cg wg node can-end <graph> <node>` | Check if all required outputs are present | Before `end` (optional, for validation) |
| `cg wg status <graph> --json` | Get status of all nodes | For overview/debugging |

### Commands for Reading Data

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `cg wg node get-input-data <graph> <node> <name>` | Read input data (from upstream) | Before agent processes inputs |
| `cg wg node get-input-file <graph> <node> <name>` | Read input file path (from upstream) | Before agent processes files |
| `cg wg node get-output-data <graph> <node> <name>` | Read output data (from this node) | After node completes, orchestrator reads result |

**Note**: `get-output-data` is a NEW command needed for this flow - orchestrator needs to read completed node outputs.

### `can-run` Response

```json
{
  "canRun": true,
  "errors": []
}
```

Or if blocked:

```json
{
  "canRun": false,
  "reason": "Blocked by 1 node(s): get-spec",
  "blockingNodes": [
    { "nodeId": "get-spec", "status": "pending", "requiredOutputs": ["spec"] }
  ],
  "errors": []
}
```

### `can-end` Response

```json
{
  "nodeId": "generate-code",
  "canEnd": true,
  "errors": []
}
```

Or if missing outputs:

```json
{
  "nodeId": "generate-code",
  "canEnd": false,
  "missingOutputs": ["language", "script"],
  "errors": []
}
```

---

## Execution Flow

### State Transitions

```
Orchestrator                          WorkGraph State
    │
    │  ══════════ SETUP ══════════
    │
    │  cg wg create sample-e2e
    │  ─────────────────────────────▶  Graph created
    │
    │  cg wg add-node ... get-spec (sample-input)
    │  cg wg add-node ... generate-code (sample-coder)
    │  cg wg add-node ... run-verify (sample-tester)
    │  ─────────────────────────────▶  All nodes: pending
    │
    │  ══════════ NODE 1: DIRECT OUTPUT ══════════
    │
    │  cg wg node can-run sample-e2e get-spec
    │  ◀─────────────────────────────  canRun: true (no upstream deps)
    │
    │  cg wg node save-output-data sample-e2e get-spec spec "Write add(a,b)"
    │  ─────────────────────────────▶  outputs.spec = "Write add(a,b)"
    │
    │  cg wg node can-end sample-e2e get-spec
    │  ◀─────────────────────────────  canEnd: true (spec present)
    │
    │  cg wg node end sample-e2e get-spec
    │  ─────────────────────────────▶  get-spec: pending → complete
    │                                  (no start needed!)
    │
    │  ══════════ NODE 2: AGENT WITH QUESTION ══════════
    │
    │  cg wg node can-run sample-e2e generate-code
    │  ◀─────────────────────────────  canRun: true (get-spec complete)
    │
    │  cg wg node start sample-e2e generate-code
    │  ─────────────────────────────▶  generate-code: running
    │
    │  [Agent reads spec input]
    │  [Agent asks language question]
    │  ─────────────────────────────▶  generate-code: waiting-question
    │                                  questionId: q-17381...
    │
    │  [Orchestrator auto-answers]
    │  cg wg node answer sample-e2e generate-code q-17381... "bash"
    │  ─────────────────────────────▶  generate-code: running
    │
    │  [Agent generates code, saves outputs]
    │  cg wg node save-output-data ... language "bash"
    │  cg wg node save-output-file ... script ./add.sh
    │  cg wg node end sample-e2e generate-code
    │  ─────────────────────────────▶  generate-code: complete
    │
    │  ══════════ NODE 3: AGENT RUNS SCRIPT ══════════
    │
    │  cg wg node can-run sample-e2e run-verify
    │  ◀─────────────────────────────  canRun: true (generate-code complete)
    │
    │  cg wg node get-input-data sample-e2e run-verify language
    │  ◀─────────────────────────────  value: "bash" (from generate-code)
    │
    │  cg wg node get-input-file sample-e2e run-verify script
    │  ◀─────────────────────────────  filePath: ".../script.sh" (from generate-code)
    │
    │  cg wg node start sample-e2e run-verify
    │  ─────────────────────────────▶  run-verify: running
    │
    │  [Agent reads language and script inputs]
    │  [Agent runs: bash ./add.sh]
    │  [Agent creates report]
    │  cg wg node save-output-data ... report "..."
    │  cg wg node end sample-e2e run-verify
    │  ─────────────────────────────▶  run-verify: complete
    │
    │  ══════════ READ PIPELINE RESULT ══════════
    │
    │  cg wg node get-output-data sample-e2e run-verify success
    │  ◀─────────────────────────────  value: true
    │
    │  cg wg node get-output-data sample-e2e run-verify output
    │  ◀─────────────────────────────  value: "5"
    │
    │  ══════════ VALIDATION ══════════
    │
    │  cg wg status sample-e2e --json
    │  ◀─────────────────────────────  All nodes: complete ✓
    │
    │  [Orchestrator reports: Pipeline SUCCESS]
    ▼
```

---

## Orchestrator Script Implementation

### Decision: TypeScript

| Factor | Shell | TypeScript | Winner |
|--------|-------|------------|--------|
| JSON parsing | jq + grep | Native | **TS** |
| Type safety | None | Full | **TS** |
| Error handling | Exit codes | Structured | **TS** |
| Polling logic | Complex | Simple | **TS** |
| Maintainability | Harder | Easier | **TS** |

### File Structure

**Location**: `docs/how/dev/workgraph-run/` (replaces deprecated `manual-wf-run/`)

```
docs/how/dev/workgraph-run/
├── e2e-sample-flow.ts           # Main test script
├── lib/
│   ├── cli-runner.ts            # CLI execution helper
│   └── types.ts                 # Response type definitions
├── fixtures/
│   └── units/                   # Unit definitions for test
│       ├── sample-input/
│       │   └── unit.yaml
│       ├── sample-coder/
│       │   ├── unit.yaml
│       │   └── commands/
│       │       └── main.md
│       └── sample-tester/
│           ├── unit.yaml
│           └── commands/
│               └── main.md
└── README.md
```

### Key Script Logic

```typescript
// === NODE 1: Direct Output (no start needed) ===

// 1a. Check node is ready to run (no upstream dependencies)
const canRun1 = await runCli<CanRunData>(['wg', 'node', 'can-run', 'sample-e2e', 'get-spec']);
assert(canRun1.data.canRun, 'get-spec should be runnable');

// 1b. Save the output data directly
await runCli(['wg', 'node', 'save-output-data', 'sample-e2e', 'get-spec', 'spec',
  '"Write a function add(a, b) that returns the sum of two numbers"']);

// 1c. Verify outputs are ready (optional but good practice)
const canEnd1 = await runCli<CanEndData>(['wg', 'node', 'can-end', 'sample-e2e', 'get-spec']);
assert(canEnd1.data.canEnd, 'get-spec should have all outputs');

// 1d. End the node (transitions PENDING → COMPLETE)
await runCli(['wg', 'node', 'end', 'sample-e2e', 'get-spec']);

// === NODE 2: Agent with Question Handover ===

// 2a. Check node is ready (get-spec must be complete)
const canRun2 = await runCli<CanRunData>(['wg', 'node', 'can-run', 'sample-e2e', 'generate-code']);
assert(canRun2.data.canRun, 'generate-code should be runnable after get-spec completes');

// 2b. Start the agent node
await runCli(['wg', 'node', 'start', 'sample-e2e', 'generate-code']);

// 2c. Poll for waiting-question status (agent will ask which language)
let status = await pollForStatus('sample-e2e', 'generate-code', 'waiting-question');

// 2d. Read the question (from node's data.json)
const questionId = await getLatestQuestionId('sample-e2e', 'generate-code');

// 2e. Auto-answer with "bash"
await runCli(['wg', 'node', 'answer', 'sample-e2e', 'generate-code', questionId, '"bash"']);

// 2f. Wait for agent to complete (saves outputs and ends)
status = await pollForStatus('sample-e2e', 'generate-code', 'complete');

// === NODE 3: Agent Runs Script ===

// 3a. Check node is ready (generate-code must be complete)
const canRun3 = await runCli<CanRunData>(['wg', 'node', 'can-run', 'sample-e2e', 'run-verify']);
assert(canRun3.data.canRun, 'run-verify should be runnable after generate-code completes');

// 3b. Verify inputs are available (optional but demonstrates data flow)
const langInput = await runCli<GetInputDataData>(
  ['wg', 'node', 'get-input-data', 'sample-e2e', 'run-verify', 'language']);
assert(langInput.data.value === 'bash', 'language should be bash');

const scriptInput = await runCli<GetInputFileData>(
  ['wg', 'node', 'get-input-file', 'sample-e2e', 'run-verify', 'script']);
assert(scriptInput.data.filePath, 'script file path should exist');

// 3c. Start the agent node
await runCli(['wg', 'node', 'start', 'sample-e2e', 'run-verify']);

// 3d. Wait for agent to complete
status = await pollForStatus('sample-e2e', 'run-verify', 'complete');

// === READ PIPELINE RESULT ===

// 4a. Read the success output from run-verify
const successResult = await runCli<GetOutputDataData>(
  ['wg', 'node', 'get-output-data', 'sample-e2e', 'run-verify', 'success']);
const pipelineSuccess = successResult.data.value === true;

// 4b. Read the output for reporting
const outputResult = await runCli<GetOutputDataData>(
  ['wg', 'node', 'get-output-data', 'sample-e2e', 'run-verify', 'output']);
const scriptOutput = outputResult.data.value as string;

// === VALIDATE ===
const finalStatus = await runCli<GraphStatusData>(['wg', 'status', 'sample-e2e', '--json']);
assert(finalStatus.data.nodes.every(n => n.status === 'complete'), 'All nodes should be complete');

// Report pipeline result based on tester's success output
if (pipelineSuccess) {
  console.log('Pipeline SUCCESS - script executed correctly');
  console.log('Output:', scriptOutput);
} else {
  console.error('Pipeline FAILED - script execution failed');
  console.error('Output:', scriptOutput);
  process.exit(1);
}
```

### Polling Helper

```typescript
async function pollForStatus(
  graph: string,
  nodeId: string,
  targetStatus: string,
  timeoutMs = 30000
): Promise<string> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const status = await runCli(['wg', 'status', graph, '--json']);
    const node = status.data.nodes.find(n => n.id === nodeId);

    if (node?.status === targetStatus) {
      return node.status;
    }

    if (node?.status === 'failed') {
      throw new Error(`Node ${nodeId} failed`);
    }

    await sleep(500);
  }

  throw new Error(`Timeout waiting for ${nodeId} to reach ${targetStatus}`);
}
```

### Type Definitions

```typescript
// lib/types.ts

/**
 * Result of cg wg node can-run
 */
export interface CanRunData {
  canRun: boolean;
  reason?: string;
  blockingNodes?: Array<{
    nodeId: string;
    status: string;
    requiredOutputs: string[];
  }>;
}

/**
 * Result of cg wg node can-end
 */
export interface CanEndData {
  nodeId: string;
  canEnd: boolean;
  missingOutputs?: string[];
}

/**
 * Result of cg wg node get-input-data
 */
export interface GetInputDataData {
  nodeId: string;
  inputName: string;
  value?: unknown;
  fromNode?: string;
  fromOutput?: string;
}

/**
 * Result of cg wg node get-input-file
 */
export interface GetInputFileData {
  nodeId: string;
  inputName: string;
  filePath?: string;
  fromNode?: string;
  fromOutput?: string;
}

/**
 * Result of cg wg node get-output-data
 * Used by orchestrator to read a node's output after completion.
 */
export interface GetOutputDataData {
  nodeId: string;
  outputName: string;
  value?: unknown;
}

/**
 * Result of cg wg status
 */
export interface GraphStatusData {
  graphSlug: string;
  graphStatus: string;
  nodes: Array<{
    id: string;
    unitSlug: string;
    status: 'pending' | 'ready' | 'running' | 'waiting-question' | 'complete' | 'failed';
  }>;
}
```

---

## Mock vs Real Execution

For this E2E test, we have two modes:

### Mode 1: Mock (Default)

The orchestrator script simulates agent work:
- Node 2: Script generates mock code directly
- Node 3: Script creates mock execution report

**Pros**: Fast, deterministic, no external dependencies
**Cons**: Doesn't test real agent execution

### Mode 2: Real Agent (`--with-agent`)

The orchestrator invokes actual agents:
- Node 2: Calls `cg agent run` with bootstrap prompt
- Node 3: Calls `cg agent run` with bootstrap prompt

**Pros**: Tests full integration
**Cons**: Slow, requires API keys, non-deterministic

**Recommendation**: Start with Mode 1, add Mode 2 as optional flag.

---

## Required Implementation Changes

### Change 1: Allow `end` from PENDING

Currently `end()` requires `running` state. Need to modify to accept `pending` when outputs present.

**File**: `packages/workgraph/src/services/worknode.service.ts`

**Current** (line 447):
```typescript
if (nodeStatus.status !== 'running') {
  return { errors: [{ code: 'E112', ... }] };
}
```

**Proposed**:
```typescript
if (nodeStatus.status !== 'running' && nodeStatus.status !== 'pending') {
  return { errors: [{ code: 'E112', ... }] };
}
```

This enables the direct output pattern where orchestrator saves data and ends without starting.

---

## Implementation Checklist

- [ ] **Code Change**: Modify `end()` to accept PENDING state
- [ ] **Code Change**: Update `canEnd()` similarly
- [ ] **Code Change**: Add `getOutputData()` to WorkNodeService (orchestrator reads completed node outputs)
- [ ] **CLI Command**: Add `cg wg node get-output-data <graph> <node> <output-name>`
- [ ] Create `scripts/workgraph/` directory structure
- [ ] Implement `lib/cli-runner.ts`
- [ ] Implement `lib/types.ts`
- [ ] Create fixture unit definitions:
  - [ ] `fixtures/units/sample-input/unit.yaml`
  - [ ] `fixtures/units/sample-coder/unit.yaml`
  - [ ] `fixtures/units/sample-coder/commands/main.md`
  - [ ] `fixtures/units/sample-tester/unit.yaml`
  - [ ] `fixtures/units/sample-tester/commands/main.md`
- [ ] Implement `e2e-sample-flow.ts`
- [ ] Add npm script: `"test:e2e:workgraph": "tsx scripts/workgraph/e2e-sample-flow.ts"`
- [ ] Add to justfile: `test-e2e-workgraph`

---

## Success Criteria

- [ ] Script runs to completion without manual intervention
- [ ] All 3 nodes reach `complete` status
- [ ] **Pre-execution checks**: `can-run` called before each node execution
- [ ] **Pre-completion checks**: `can-end` used to verify outputs before ending
- [ ] Direct output pattern works (save-output-data → end from PENDING)
- [ ] Question handover works (agent asks → orchestrator auto-answers "bash")
- [ ] Data flows: spec → generate-code, language + script → run-verify
- [ ] File flows: script file passed from generate-code to run-verify
- [ ] `get-input-data` and `get-input-file` correctly resolve cross-node data
- [ ] Script provides clear progress output
- [ ] Script returns exit code 0 on success, 1 on failure
- [ ] Runs in < 30 seconds (mock mode)

---

## Example Output

```
╔═══════════════════════════════════════════════════════════════╗
║           E2E Test: Sample Code Generation Flow               ║
╚═══════════════════════════════════════════════════════════════╝

Cleaning up previous test run...
Copying fixture units...
  Copied: sample-input
  Copied: sample-coder
  Copied: sample-tester

═══════════════════════════════════════════════════════════════
STEP 1: Create Graph
═══════════════════════════════════════════════════════════════

  ✓ Created graph: sample-e2e
  ✓ Path: .chainglass/work-graphs/sample-e2e

═══════════════════════════════════════════════════════════════
STEP 2: Add Nodes
═══════════════════════════════════════════════════════════════

  ✓ Added: get-spec (sample-input)
  ✓ Added: generate-code (sample-coder)
    - Input: spec ← get-spec.spec
  ✓ Added: run-verify (sample-tester)
    - Input: language ← generate-code.language
    - Input: script ← generate-code.script

═══════════════════════════════════════════════════════════════
STEP 3: Execute get-spec (Direct Output)
═══════════════════════════════════════════════════════════════

  ✓ can-run: true (no upstream dependencies)
  ✓ Saved output: spec = "Write a function add(a, b)..."
  ✓ can-end: true (all outputs present)
  ✓ Completed: get-spec → complete (no start needed)

═══════════════════════════════════════════════════════════════
STEP 4: Execute generate-code (Agent with Question)
═══════════════════════════════════════════════════════════════

  ✓ can-run: true (get-spec is complete)
  ✓ Started: generate-code → running
  ... waiting for agent question ...
  ✓ Agent asked: "Which programming language should I use?"
    Options: typescript, javascript, python, bash
    Question ID: q-1738028000-a1b2
  ✓ Auto-answered: "bash"
  ... waiting for agent to complete ...
  ✓ Completed: generate-code → complete
    - language: bash
    - script: .chainglass/work-graphs/sample-e2e/nodes/generate-code/data/outputs/script.sh

═══════════════════════════════════════════════════════════════
STEP 5: Execute run-verify (Agent Runs Script)
═══════════════════════════════════════════════════════════════

  ✓ can-run: true (generate-code is complete)
  ✓ get-input-data language: "bash" (from generate-code.language)
  ✓ get-input-file script: ".../script.sh" (from generate-code.script)
  ✓ Started: run-verify → running
  ... waiting for agent to complete ...
  ✓ Completed: run-verify → complete

═══════════════════════════════════════════════════════════════
STEP 6: Read Pipeline Result
═══════════════════════════════════════════════════════════════

  ✓ get-output-data success: true
  ✓ get-output-data output: "5"

  Pipeline Result: SUCCESS
  Script Output: 5

═══════════════════════════════════════════════════════════════
STEP 7: Validate Final State
═══════════════════════════════════════════════════════════════

  Graph: sample-e2e
  Overall status: complete
  Node statuses:
    ✓ get-spec (sample-input): complete
    ✓ generate-code (sample-coder): complete
    ✓ run-verify (sample-tester): complete

═══════════════════════════════════════════════════════════════
                    ✅ TEST PASSED
═══════════════════════════════════════════════════════════════
```

---

**Workshop Complete**: 2026-01-28
**Next Step**: Implement `end` from PENDING change, then build E2E script
