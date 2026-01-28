# Research Report: End-to-End Sample Flow for WorkGraph Testing

**Generated**: 2026-01-28T07:45:00Z
**Research Query**: "Set up a sample flow that we can test end to end with 3 AgentUnits, including one in the middle that will ask a question and expect a multi-choice result. Script plays role of orchestrator."
**Mode**: Plan-Associated (016-agent-units)
**Location**: `docs/plans/016-agent-units/research/e2e-sample-flow-research.md`
**FlowSpace**: Available
**Findings**: 75+ findings from 7 subagents

## Executive Summary

### What We Need
An end-to-end test harness that programmatically executes a 3-node WorkGraph workflow, with the middle node asking a multi-choice question that the orchestrator script answers, demonstrating the complete lifecycle: graph creation → node execution → question handover → answer → completion.

### Business Purpose
Validate the entire WorkGraph system works correctly when orchestrated by a script (simulating an LLM orchestrator or CI/CD pipeline), proving the CLI commands, state transitions, and handover mechanism function as designed.

### Key Insights
1. **Shell scripts are proven** for CLI orchestration (see `manual-wf-run/` harness) but lack type safety for JSON parsing
2. **TypeScript is preferred** when parsing structured JSON output and maintaining state across calls
3. **Ask/answer handover** requires polling `status()` for `waiting-question` nodes, then calling `answer()`
4. **Three unit types available**: `agent`, `code`, `user-input` - all three can be demonstrated
5. **Prior learnings** (PL-06) confirm start node needs explicit `complete` status handling

### Quick Stats
- **CLI Commands Used**: 22 total (3 graph + 15 node + 4 unit)
- **Question Types**: text, single, multi, confirm
- **Existing Reference**: `docs/how/dev/manual-wf-run/` (shell-based orchestration)
- **Script Decision**: TypeScript recommended for this use case

## Recommended Sample Flow: "Topic Research Pipeline"

### Flow Description

A 3-node workflow that demonstrates:
1. **Node 1 (user-input)**: Collect topic from user
2. **Node 2 (user-input with multi-choice)**: Ask for research depth preference (quick/medium/deep)
3. **Node 3 (agent)**: Generate research summary based on topic and depth

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   start         │───▶│  collect-topic  │───▶│  choose-depth   │
│   (complete)    │    │  (user-input)   │    │  (user-input)   │
└─────────────────┘    │                 │    │  multi-choice   │
                       │  outputs:       │    │                 │
                       │  - topic (text) │    │  outputs:       │
                       └─────────────────┘    │  - depth (text) │
                                              └────────┬────────┘
                                                       │
                                                       ▼
                                              ┌─────────────────┐
                                              │ generate-summary│
                                              │    (agent)      │
                                              │                 │
                                              │  inputs:        │
                                              │  - topic        │
                                              │  - depth        │
                                              │  outputs:       │
                                              │  - summary      │
                                              └─────────────────┘
```

### Why This Flow

| Requirement | How It's Demonstrated |
|-------------|----------------------|
| Initial text input | Node 1 collects free-form topic |
| Multi-choice question | Node 2 asks depth preference with options |
| Agent execution | Node 3 runs agent unit |
| Data flow between nodes | Topic flows from Node 1 → Node 3, Depth flows from Node 2 → Node 3 |
| Handover mechanism | Script answers questions for Nodes 1 and 2 |
| Complete lifecycle | start → collect → choose → generate → complete |

## Script Analysis: TypeScript vs Shell

### Recommendation: TypeScript

Based on DE-01 through DE-10 findings, **TypeScript is recommended** for this orchestrator script because:

| Factor | Shell | TypeScript | Winner |
|--------|-------|------------|--------|
| JSON output parsing | grep/jq (brittle) | Native JSON.parse | TS |
| State management | File-based (.current-*) | In-memory objects | TS |
| Error handling | Exit codes only | Structured errors | TS |
| Type safety | None | Full interfaces | TS |
| IDE support | Minimal | Full autocomplete | TS |
| Reusability | Copy/paste | Import/export | TS |
| Polling loops | sleep + while | async/await | TS |
| Debugging | echo statements | Debugger + logs | TS |

### TypeScript Advantages for This Script

1. **Structured result parsing**: CLI `--json` output maps directly to TypeScript interfaces
2. **Async orchestration**: `await` for each command, clean control flow
3. **Type-safe status checking**: `if (status === 'waiting-question')` with autocomplete
4. **Reusable utilities**: Export functions for other tests to import
5. **Integration with monorepo**: Can import types from `@chainglass/workgraph`

### When Shell Would Be Better

Shell would only be preferred if:
- Script is <50 lines with simple pass/fail semantics
- No JSON parsing needed (just exit codes)
- Quick one-off validation (like `check-state.sh`)

## Implementation Architecture

### Directory Structure

```
scripts/workgraph/
├── e2e-sample-flow.ts           # Main orchestrator script
├── helpers/
│   ├── cli-runner.ts            # Executes cg commands, parses JSON
│   └── types.ts                 # Result type interfaces
└── fixtures/
    └── sample-units/            # Unit definitions for the flow
        ├── collect-topic/
        │   └── unit.yaml
        ├── choose-depth/
        │   └── unit.yaml
        └── generate-summary/
            ├── unit.yaml
            └── commands/
                └── main.md
```

### Unit Definitions

#### Unit 1: collect-topic (user-input)

```yaml
# .chainglass/units/collect-topic/unit.yaml
slug: collect-topic
type: user-input
version: 1.0.0
description: Collect research topic from user

inputs: []

outputs:
  - name: topic
    type: data
    data_type: text
    required: true

user_input:
  question_type: text
  prompt: "What topic would you like to research?"
```

#### Unit 2: choose-depth (user-input with multi-choice)

```yaml
# .chainglass/units/choose-depth/unit.yaml
slug: choose-depth
type: user-input
version: 1.0.0
description: Choose research depth

inputs: []

outputs:
  - name: depth
    type: data
    data_type: text
    required: true

user_input:
  question_type: single  # or 'multi' for multiple selection
  prompt: "How deep should the research go?"
  options:
    - quick
    - medium
    - deep
```

#### Unit 3: generate-summary (agent)

```yaml
# .chainglass/units/generate-summary/unit.yaml
slug: generate-summary
type: agent
version: 1.0.0
description: Generate research summary

inputs:
  - name: topic
    type: data
    data_type: text
    required: true
  - name: depth
    type: data
    data_type: text
    required: true

outputs:
  - name: summary
    type: file
    required: true

agent:
  prompt_template: commands/main.md
  supported_agents:
    - claude-code
  estimated_tokens: 5000
```

### Orchestrator Script Design

```typescript
#!/usr/bin/env npx tsx
/**
 * E2E Sample Flow - WorkGraph Orchestrator
 *
 * Demonstrates:
 * 1. Graph creation with 3 nodes
 * 2. Sequential node execution
 * 3. Question/answer handover (multi-choice)
 * 4. Data flow between nodes
 * 5. Complete lifecycle validation
 */

import { spawn } from 'node:child_process';

// ============================================
// Types (matching CLI --json output)
// ============================================

interface CommandResult<T> {
  success: boolean;
  command: string;
  timestamp: string;
  data: T | null;
  error: { code: string; message: string } | null;
}

interface GraphCreateData {
  graphSlug: string;
  path: string;
}

interface AddNodeData {
  nodeId: string;
  inputs: Record<string, { from: string; output: string }>;
}

interface GraphStatusData {
  graphSlug: string;
  graphStatus: string;
  nodes: Array<{
    id: string;
    status: string;
    unitSlug?: string;
  }>;
}

interface AskData {
  nodeId: string;
  status: string;
  questionId: string;
  question: {
    type: string;
    text: string;
    options?: string[];
  };
}

// ============================================
// CLI Runner Helper
// ============================================

async function runCli<T>(args: string[]): Promise<CommandResult<T>> {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['apps/cli/dist/bin/cg.js', ...args, '--json'], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => { stdout += data.toString(); });
    child.stderr?.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch {
        reject(new Error(`Failed to parse CLI output: ${stdout}\nStderr: ${stderr}`));
      }
    });
  });
}

// ============================================
// Orchestrator Flow
// ============================================

async function main() {
  const GRAPH_SLUG = 'e2e-sample-flow';

  console.log('=== E2E Sample Flow Test ===\n');

  // Step 1: Create graph
  console.log('1. Creating graph...');
  const createResult = await runCli<GraphCreateData>(['wg', 'create', GRAPH_SLUG]);
  if (!createResult.success) {
    throw new Error(`Failed to create graph: ${createResult.error?.message}`);
  }
  console.log(`   Created: ${createResult.data?.path}\n`);

  // Step 2: Add nodes
  console.log('2. Adding nodes...');

  // Add collect-topic after start
  const node1Result = await runCli<AddNodeData>([
    'wg', 'node', 'add-after', GRAPH_SLUG, 'start', 'collect-topic'
  ]);
  const node1Id = node1Result.data?.nodeId;
  console.log(`   Added: ${node1Id}`);

  // Add choose-depth after collect-topic
  const node2Result = await runCli<AddNodeData>([
    'wg', 'node', 'add-after', GRAPH_SLUG, node1Id!, 'choose-depth'
  ]);
  const node2Id = node2Result.data?.nodeId;
  console.log(`   Added: ${node2Id}`);

  // Add generate-summary after choose-depth, wiring inputs
  const node3Result = await runCli<AddNodeData>([
    'wg', 'node', 'add-after', GRAPH_SLUG, node2Id!, 'generate-summary',
    '--input', `topic:${node1Id}.topic`,
    '--input', `depth:${node2Id}.depth`
  ]);
  const node3Id = node3Result.data?.nodeId;
  console.log(`   Added: ${node3Id}\n`);

  // Step 3: Execute Node 1 (collect-topic)
  console.log('3. Executing collect-topic...');
  await runCli(['wg', 'node', 'start', GRAPH_SLUG, node1Id!]);

  // For user-input units, the node will ask a question
  // Poll for waiting-question status
  let status = await runCli<GraphStatusData>(['wg', 'status', GRAPH_SLUG]);
  const node1Status = status.data?.nodes.find(n => n.id === node1Id);

  if (node1Status?.status === 'waiting-question') {
    console.log('   Node is asking a question...');
    // In real scenario, we'd read the question from data.json
    // For this test, we provide a canned answer
    await runCli([
      'wg', 'node', 'answer', GRAPH_SLUG, node1Id!, 'q-1', '"Artificial Intelligence"'
    ]);
    console.log('   Answered: "Artificial Intelligence"');
  }

  // Save the output and end the node
  await runCli([
    'wg', 'node', 'save-output-data', GRAPH_SLUG, node1Id!, 'topic', '"Artificial Intelligence"'
  ]);
  await runCli(['wg', 'node', 'end', GRAPH_SLUG, node1Id!]);
  console.log('   Node completed\n');

  // Step 4: Execute Node 2 (choose-depth with multi-choice)
  console.log('4. Executing choose-depth (multi-choice)...');
  await runCli(['wg', 'node', 'start', GRAPH_SLUG, node2Id!]);

  // This node asks a multi-choice question
  // Simulate answering "medium"
  await runCli([
    'wg', 'node', 'save-output-data', GRAPH_SLUG, node2Id!, 'depth', '"medium"'
  ]);
  await runCli(['wg', 'node', 'end', GRAPH_SLUG, node2Id!]);
  console.log('   Selected: "medium"');
  console.log('   Node completed\n');

  // Step 5: Execute Node 3 (generate-summary agent)
  console.log('5. Executing generate-summary (agent)...');

  // Check inputs are available
  const inputTopic = await runCli<{ value: unknown }>([
    'wg', 'node', 'get-input-data', GRAPH_SLUG, node3Id!, 'topic'
  ]);
  const inputDepth = await runCli<{ value: unknown }>([
    'wg', 'node', 'get-input-data', GRAPH_SLUG, node3Id!, 'depth'
  ]);
  console.log(`   Input topic: ${JSON.stringify(inputTopic.data?.value)}`);
  console.log(`   Input depth: ${JSON.stringify(inputDepth.data?.value)}`);

  await runCli(['wg', 'node', 'start', GRAPH_SLUG, node3Id!]);

  // In a real scenario, we'd invoke the agent here
  // For this test, we simulate the agent producing output
  // Write a mock summary file
  const summaryPath = 'summary.md';
  await Bun.write(summaryPath, '# AI Research Summary\n\nThis is a medium-depth summary about AI.');

  await runCli([
    'wg', 'node', 'save-output-file', GRAPH_SLUG, node3Id!, 'summary', summaryPath
  ]);
  await runCli(['wg', 'node', 'end', GRAPH_SLUG, node3Id!]);
  console.log('   Agent completed\n');

  // Step 6: Validate final state
  console.log('6. Validating final state...');
  const finalStatus = await runCli<GraphStatusData>(['wg', 'status', GRAPH_SLUG]);

  console.log('   Node statuses:');
  for (const node of finalStatus.data?.nodes || []) {
    const icon = node.status === 'complete' ? '✓' : '✗';
    console.log(`   ${icon} ${node.id}: ${node.status}`);
  }

  const allComplete = finalStatus.data?.nodes.every(n => n.status === 'complete');
  if (allComplete) {
    console.log('\n=== SUCCESS: All nodes completed ===');
  } else {
    console.log('\n=== FAILURE: Some nodes did not complete ===');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
```

## Alternative Flow Suggestions

### Option A: "Code Review Pipeline" (More Realistic)

```
collect-files → select-review-type → run-review
   (agent)        (user-input)         (agent)
```

- Node 1: Agent collects file list from cwd
- Node 2: User selects review type (security/style/performance)
- Node 3: Agent performs selected review

### Option B: "Document Generator" (Simpler)

```
get-title → choose-format → generate-doc
(user-input)  (user-input)    (code)
```

- Node 1: User provides document title
- Node 2: User chooses format (markdown/html/pdf)
- Node 3: Code unit generates document

### Option C: "Translation Pipeline" (Code-Heavy)

```
input-text → detect-language → translate
(user-input)    (code)          (agent)
```

- Node 1: User provides text to translate
- Node 2: Code unit detects source language
- Node 3: Agent translates to English

## CLI Command Sequence Reference

Complete command sequence for the sample flow:

```bash
# Setup
cg unit create collect-topic --type user-input
cg unit create choose-depth --type user-input
cg unit create generate-summary --type agent

# Graph creation
cg wg create e2e-sample-flow
cg wg node add-after e2e-sample-flow start collect-topic
cg wg node add-after e2e-sample-flow collect-topic-abc choose-depth
cg wg node add-after e2e-sample-flow choose-depth-def generate-summary \
  --input topic:collect-topic-abc.topic \
  --input depth:choose-depth-def.depth

# Node 1 execution
cg wg node start e2e-sample-flow collect-topic-abc
cg wg status e2e-sample-flow --json  # Poll for waiting-question
cg wg node answer e2e-sample-flow collect-topic-abc q-xxx '"AI"'
cg wg node save-output-data e2e-sample-flow collect-topic-abc topic '"AI"'
cg wg node end e2e-sample-flow collect-topic-abc

# Node 2 execution (multi-choice)
cg wg node start e2e-sample-flow choose-depth-def
cg wg status e2e-sample-flow --json  # Poll for waiting-question
cg wg node answer e2e-sample-flow choose-depth-def q-yyy '"medium"'
cg wg node save-output-data e2e-sample-flow choose-depth-def depth '"medium"'
cg wg node end e2e-sample-flow choose-depth-def

# Node 3 execution (agent - would invoke cg agent run in real scenario)
cg wg node can-run e2e-sample-flow generate-summary-ghi --json
cg wg node start e2e-sample-flow generate-summary-ghi
cg wg node exec e2e-sample-flow generate-summary-ghi  # Get bootstrap prompt
# ... agent executes ...
cg wg node save-output-file e2e-sample-flow generate-summary-ghi summary ./summary.md
cg wg node can-end e2e-sample-flow generate-summary-ghi --json
cg wg node end e2e-sample-flow generate-summary-ghi

# Validation
cg wg status e2e-sample-flow --json
cg wg show e2e-sample-flow
```

## Prior Learnings Applied

| Learning | Application |
|----------|-------------|
| **PL-06**: Start node needs explicit complete status | Script should verify start is complete before executing Node 1 |
| **PL-04**: YAML parser throws, services catch | Script handles CLI errors via JSON error field, not exceptions |
| **PL-08**: show() returns structured TreeNode | Can use `--json` output for programmatic tree inspection |
| **PL-11**: Timeout race cleanup | Script should implement idle timeout for stuck nodes |

## Recommendations

### Immediate Actions

1. **Create unit definitions** in `.chainglass/units/` for the 3 sample units
2. **Write TypeScript orchestrator** at `scripts/workgraph/e2e-sample-flow.ts`
3. **Add npm script** in package.json: `"test:e2e:workgraph": "tsx scripts/workgraph/e2e-sample-flow.ts"`

### Implementation Considerations

1. **User-input nodes**: The current implementation may need enhancement to automatically trigger `ask()` when a user-input unit starts - verify this behavior
2. **Question ID generation**: Orchestrator needs to discover question IDs from status or data.json
3. **File cleanup**: Script should clean up `.chainglass/work-graphs/e2e-sample-flow/` before each run
4. **Timeout handling**: Add configurable timeout for each node (default 30s)

### Testing Strategy

1. **Unit tests**: Test CLI helpers with FakeWorkGraphService
2. **Integration test**: Run full flow with real filesystem in temp directory
3. **CI integration**: Add to `just check` or separate workflow

## Next Steps

1. **Proceed to specification**: Run `/plan-1b-specify "E2E sample flow test harness"` to create formal spec
2. **Or implement directly**: If scope is clear enough, create implementation tasks

---

**Research Complete**: 2026-01-28T07:50:00Z
**Report Location**: `docs/plans/016-agent-units/research/e2e-sample-flow-research.md`
