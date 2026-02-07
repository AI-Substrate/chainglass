# Research Dossier: Plan 032 — Node Event System

**Plan**: 032-node-event-system
**Created**: 2026-02-07
**Status**: Active research

---

## Table of Contents

1. [Existing E2E Testing Patterns](#1-existing-e2e-testing-patterns)
2. [Existing Test Infrastructure](#2-existing-test-infrastructure)
3. [CLI Runner Architecture](#3-cli-runner-architecture)
4. [Event System E2E Sample Flow](#4-event-system-e2e-sample-flow)
5. [Findings Summary](#5-findings-summary)

---

## 1. Existing E2E Testing Patterns

### Source: `docs/how/dev/workgraph-run/e2e-sample-flow.ts`

The existing E2E harness validates the complete WorkGraph lifecycle with a 3-node code generation pipeline. Two modes: **mock** (fast, no real agents) and **real agent** (Claude Code or Copilot).

**Architecture**:
```
e2e-sample-flow.ts          ← Orchestrates test steps
├── lib/cli-runner.ts       ← runCli(), pollForStatus(), invokeAgent(), helpers
└── lib/types.ts            ← CLI result type definitions
```

**Flow pattern** (7 steps):
1. Cleanup previous run artifacts
2. Create graph (`cg wg create sample-e2e`)
3. Add nodes with input wiring (`cg wg node add-after`)
4. Execute Node 1: Direct output (save data + end, no agent)
5. Execute Node 2: Agent with question/answer handover
6. Execute Node 3: Agent runs script
7. Validate all nodes complete

**Key patterns extracted**:

| Pattern | How It Works |
|---------|-------------|
| CLI invocation | `spawn('node', [CLI_PATH, ...args, '--json'])` — all commands get `--json` appended |
| NDJSON parsing | Parse stdout line-by-line, find last line with `"success"` or `"error"` field |
| Typed results | `runCli<T>(args)` returns `CliResult<T>` with `success`, `data`, `rawOutput`, `exitCode` |
| Agent loop | `runAgentWithQuestionLoop()` — invoke agent, wait for exit, check status, answer questions, re-invoke with session resume |
| Status polling | `pollForStatus(graph, nodeId, targetStatuses)` — 500ms interval, 30s log interval, 5min timeout |
| Question handling | Poll for `waiting-question`, extract `questionId`, answer via CLI, prepare continuation prompt |
| Session resumption | Pass `sessionId` to agent on re-invocation for context continuity |
| Mock mode | Direct CLI calls simulate what an agent would do (start, ask, answer, save, end) |
| Cleanup | Delete graph dirs (legacy + workspace-scoped) and mock output dirs |

**Question/Answer lifecycle in existing system** (Node 2 mock):
```
1. cg wg node start <graph> <nodeId>            → status: running
2. cg wg node ask <graph> <nodeId> --type single --text "..." --options ...
                                                 → status: waiting-question, questionId returned
3. cg wg node answer <graph> <nodeId> <qId> "bash"
                                                 → status: running (question answered)
4. cg wg node save-output-data ...               → save outputs
5. cg wg node end <graph> <nodeId>               → status: complete
```

### Source: `test/e2e/positional-graph-execution-e2e.test.ts`

The positional graph E2E test uses a different `runCli` variant (inline in test file) that operates against a temp workspace. 15 documented test sections covering:

- Graph creation and readiness detection
- Error codes (E176, E172, E173)
- Serial and parallel execution
- Q&A protocol
- Manual transition gates
- Code-unit patterns
- Unit type verification
- Reserved parameter routing

**Key difference from sample flow**: E2E test creates a temp workspace with copied units, registers the workspace, then runs tests. The sample flow operates against the project's actual `.chainglass/` directory.

---

## 2. Existing Test Infrastructure

### Unit Test Patterns

**FakeXxx test doubles** — thin, stateful wrappers with helper methods:

| Fake | Helpers | Interface |
|------|---------|-----------|
| `FakePodManager` | `configurePod()`, `seedSession()`, `getCreateHistory()`, `reset()` | `IPodManager` |
| `FakeONBAS` | `setNextAction()`, `setActions()`, `getHistory()`, `reset()` | `IONBAS` |
| `FakePod` | `setOutcome()`, `getExecuteHistory()` | `IPod` |
| `FakeFileSystem` | `setFile()`, `getFile()`, `setDir()` | `IFileSystem` |
| `FakePathResolver` | (path mapping) | `IPathResolver` |
| `FakeAgentAdapter` | (preconfigured responses) | `IAgentAdapter` |

**Fixture construction** — `makeXxx(overrides)` pattern:
```typescript
function makeNode(overrides: Partial<NodeReality> & { nodeId: string }): NodeReality {
  return { /* sensible defaults */ ...overrides };
}
```

**Contract tests** — shared suite runs against multiple implementations:
```typescript
const implementations = [
  { name: 'FakePodManager', setup: () => new FakePodManager() },
  { name: 'PodManager (real)', setup: () => new PodManager(new FakeFileSystem()) },
];
for (const { name, setup } of implementations) {
  describe(name, () => { /* shared assertions */ });
}
```

### Integration Test Patterns

Full lifecycle tests use real services with fake adapters:
```typescript
beforeEach(() => {
  fs = new FakeFileSystem();
  pathResolver = new FakePathResolver();
  const loader = createFakeUnitLoader([producer, consumer, worker]);
  service = createTestService(fs, pathResolver, loader);
});
```

### Test Documentation Standard

Every test file has a 5-field comment block:
- **Why**: Business/technical rationale
- **Contract**: What the tested code guarantees
- **Usage Notes**: How to use the code
- **Quality Contribution**: What regressions it catches
- **Worked Example**: Concrete usage scenario

### DYK (Did You Know) Comments

Inline notes for subtle behaviors:
- **DYK-I2**: Options normalized from `string[]` to `{key, label}[]`
- **DYK-I3**: `currentLineIndex` equals `lines.length` when all complete (past-the-end sentinel)
- **DYK-I7**: Prefer `request.nodeId` directly after narrowing
- **DYK-P4#2**: Pod owns mutable sessionId

---

## 3. CLI Runner Architecture

### `runCli<T>(args)` — Command execution

- Spawns `node CLI_PATH ...args --json`
- Parses NDJSON stdout — finds last line containing `"success"` or `"error"`
- Unwraps `data` field from CLI wrapper structure
- Returns `{ success, data: T, rawOutput, exitCode }`

### `invokeAgent(prompt, options)` — Agent invocation

- Spawns `node CLI_PATH agent run -t <agentType> -p <prompt> [-s sessionId] [--stream]`
- Returns `ChildProcess` handle
- Callbacks: `onStdout`, `onStderr`, `onExit`
- Parses session ID from agent output JSON

### `pollForStatus(graph, nodeId, targetStatus)` — Status polling

- 500ms interval, 5-minute timeout
- Logs elapsed time every 30 seconds
- Throws on `failed` status
- Returns matching status string

### `pollForNodeCompleteWithQuestions(graph, nodeId, options)` — Q&A polling

- Same polling pattern as above
- Fires `onWaitingQuestion(questionId)` callback
- Tracks handled questions to avoid double-answering

---

## 4. Event System E2E Sample Flow

A new E2E sample flow script demonstrates the Node Event System interactions. See:

**`docs/plans/032-node-event-system/e2e-event-system-sample-flow.ts`**

This script shows:
- Agent accepting a node via `event raise node:accepted`
- Agent doing work and saving outputs via `event raise output:save-data`
- Agent asking a question via `event raise question:ask`
- Human answering via `event raise question:answer`
- Orchestrator resuming agent (session resumption)
- Agent accepting the answer and completing via `event raise node:completed`
- Event log inspection via `event log`
- Schema self-discovery via `event list-types` and `event schema`

The script is a **design document** — it shows the intended CLI surface, not a runnable test against existing code. It serves as the target for implementation.

---

## 5. Findings Summary

### What exists today

1. **E2E test harness** (`e2e-sample-flow.ts`) — proven pattern for mock + real agent testing with Q&A lifecycle, session resumption, status polling, and cleanup
2. **CLI runner library** (`lib/cli-runner.ts`, `lib/types.ts`) — reusable `runCli<T>()` with NDJSON parsing, typed results, agent invocation, and polling helpers
3. **Unit test infrastructure** — FakeXxx doubles, `makeXxx()` builders, contract test pattern, 5-field test doc
4. **E2E test suite** (`positional-graph-execution-e2e.test.ts`) — 15-section comprehensive test covering all execution patterns including Q&A

### What the Node Event System changes

| Aspect | Current System | Event System |
|--------|---------------|--------------|
| Question asking | `cg wg node ask --type ... --text ... --options ...` | `cg wf node event raise <graph> <nodeId> question:ask '{"type":"single","text":"...","options":[...]}'` |
| Question answering | `cg wg node answer <graph> <nodeId> <qId> <answer>` | `cg wf node event raise <graph> <nodeId> question:answer '{"question_event_id":"evt_003","answer":"bash"}' --source human` |
| Node acceptance | (implicit via `start`) | `cg wf node accept <graph> <nodeId>` (shortcut for `event raise node:accepted`) |
| Node completion | `cg wg node end` | `cg wf node end <graph> <nodeId>` (shortcut for `event raise node:completed`) |
| Status detection | Flat `status` field on node | Event log analysis — latest unhandled events determine sub-state |
| Self-discovery | N/A | `event list-types`, `event schema <type>` |
| State transitions | Service methods mutate state | Events are raised → handlers apply transitions |
| Audit trail | Minimal (timestamps) | Full event log with source, lifecycle status, timestamps |

### Key design decisions for E2E testing

1. **Mock mode must use the generic `event raise` path** — shortcuts (`accept`, `end`) are sugar, but the E2E flow should demonstrate the full path at least once to prove schema validation works
2. **Event log inspection** is a first-class test step — `event log` replaces status-only polling with rich event history
3. **Schema self-discovery** should be demonstrated — agents discover available event types at runtime, not hardcoded
4. **Session resumption** pattern unchanged — events that stop execution (`question:ask`, `node:completed`, `node:error`) cause agent exit, orchestrator re-invokes with session ID
5. **Backward compatibility** — old CLI commands (`ask`, `answer`, `end`) remain as aliases routing through events internally

### Recommendations for Plan 032

1. **Reuse existing CLI runner library** — extend `lib/types.ts` with event-related types (`EventRaiseData`, `EventLogData`, `EventListTypesData`, `EventSchemaData`)
2. **Extend existing E2E test** rather than replacing it — add an event-system section to the positional graph E2E test
3. **Create a standalone sample flow** for eyes-on demonstration (like the existing `e2e-sample-flow.ts`)
4. **FakeNodeEventRegistry** — follows established FakeXxx pattern with `addEventType()`, `getHistory()`, `reset()`
5. **Contract tests** for NodeEventRegistry — shared suite proving fake/real parity
