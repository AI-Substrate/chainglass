# Research Report: Pods That Work — Real Agent Integration

**Generated**: 2026-02-06
**Research Query**: "Pods running real agents -- WorkUnitPods, PodManager, agent system integration, session management, parallel execution, node-starter-prompt, and testing strategies"
**Mode**: Pre-Plan (new plan 031)
**Location**: docs/plans/031-pods-that-work/research-dossier.md
**FlowSpace**: Available
**Findings**: 65+ findings across 7 research domains

---

## Executive Summary

### What This Research Covers

Plan 030 builds the orchestration system with fake agents. This research maps how to make pods run **real** agents -- connecting the Plan 030 WorkUnitPods/PodManager system to the Plan 019 agent infrastructure (IAgentAdapter, ClaudeCodeAdapter, SdkCopilotAdapter) so that orchestrated workflows actually execute LLM-backed agents.

### Key Insights

1. **The plumbing exists but is disconnected**: IAgentAdapter (Plan 019) and WorkUnitPods (Plan 030 Phase 4) are designed to connect, but Phase 4 is unimplemented. AgentPod wraps IAgentAdapter -- the adapter factory pattern from the DI containers provides the bridge.

2. **The `node-starter-prompt.md` replaces `wf.md`**: The old system bootstrapped agents with a layered prompt (AGENT-START.md -> wf.md -> main.md). The new system needs `node-starter-prompt.md` -- a generic prompt that teaches agents how to interact with the `cg wf` CLI commands and where to find their task-specific instructions.

3. **Agent type is per-graph, not per-node**: The graph needs a setting for agent type (`copilot` default, `claude-code` optional). Individual nodes declare `supported_agents` in their work unit config but the graph-level default governs actual selection.

4. **Testing real agents requires a layered approach**: Unit tests use FakeAgentAdapter (deterministic). Integration tests use FakePodManager (service composition). E2E tests with real agents are separate, opt-in, and require API credentials.

5. **Session resumption is the critical path**: AgentContextService (Phase 3, complete) determines WHAT to inherit. PodManager (Phase 4, pending) tracks session IDs. The IAgentAdapter's `sessionId` parameter enables resumption. The chain is: AgentContextService -> PodManager.getSessionId -> IAgentAdapter.run({sessionId}).

6. **Parallel agents work through sequential loop iteration**: The orchestration loop starts one pod per iteration. Multiple parallel nodes become ready simultaneously but start one at a time. True concurrent execution is a future optimization.

### Quick Stats

- **Implemented**: AgentContextService (Phase 3), PositionalGraphReality (Phase 1), OrchestrationRequest (Phase 2), FakeAgentAdapter, IAgentAdapter + adapters, CLI agent/wf commands
- **Designed (Workshop)**: WorkUnitPods, PodManager, FakePodManager, ONBAS, ODS, IOrchestrationService
- **Not Yet Implemented**: Phase 4 (pods), Phase 5 (ONBAS), Phase 6 (ODS), Phase 7 (entry point), Phase 8 (E2E)
- **Prior Learnings**: 15+ from Plans 016, 019, 022, 026, 027, 029, 030

---

## How Agents Currently Work

### IAgentAdapter -- The Core Contract

**File**: `packages/shared/src/interfaces/agent-adapter.interface.ts`

```typescript
export interface IAgentAdapter {
  run(options: AgentRunOptions): Promise<AgentResult>;
  compact(sessionId: string): Promise<AgentResult>;
  terminate(sessionId: string): Promise<AgentResult>;
}
```

**AgentRunOptions** (`packages/shared/src/interfaces/agent-types.ts:63`):
```typescript
export interface AgentRunOptions {
  prompt: string;
  sessionId?: string;   // omit = new session, provide = resume
  cwd?: string;         // working directory (worktree root)
  onEvent?: AgentEventHandler;  // streaming callback
}
```

**AgentResult** (`agent-types.ts:42`):
```typescript
export interface AgentResult {
  output: string;
  sessionId: string;    // always returned, even for new sessions
  status: AgentStatus;  // 'completed' | 'failed' | 'killed'
  exitCode: number;
  stderr?: string;
  tokens: TokenMetrics | null;
}
```

### Two Real Adapter Implementations

| Adapter | External Dependency | Session Mechanism | CLI Flags |
|---------|-------------------|-------------------|-----------|
| `ClaudeCodeAdapter` | `claude` CLI binary (child process) | `--fork-session --resume <id>` | `--output-format=stream-json --verbose --dangerously-skip-permissions` |
| `SdkCopilotAdapter` | `@github/copilot-sdk` (npm) | `client.resumeSession(id)` | N/A (SDK handles) |

### Agent Events (11-type Discriminated Union)

| Type | Purpose |
|------|---------|
| `text_delta` | Streaming text content |
| `message` | Complete message |
| `usage` | Token metrics |
| `session_start/idle/error` | Session lifecycle |
| `tool_call` / `tool_result` | Agent calling tools |
| `thinking` | Internal reasoning |
| `user_prompt` | User's prompt stored for history |
| `raw` | Provider-specific passthrough |

### DI Container Wiring

Both CLI and Web use the same `AdapterFactory` closure pattern:

```typescript
// From apps/cli/src/lib/container.ts (lines 261-283)
const adapterFactory = (agentType: AgentType): IAgentAdapter => {
  switch (agentType) {
    case 'claude-code': return new ClaudeCodeAdapter(processManager, { logger });
    case 'copilot': return new SdkCopilotAdapter(copilotClient, { logger });
  }
};
```

Pods bypass `AgentService` and call `IAgentAdapter.run()` directly. This is by design -- pods need different timeout behaviors.

### FakeAgentAdapter (323 lines)

**File**: `packages/shared/src/fakes/fake-agent-adapter.ts`

Already production-ready for pod testing:
- Configurable responses (sessionId, output, status, exitCode)
- Event emission (`setEvents()`, `emitToolCall()`, `emitToolResult()`)
- Simulated latency (`runDuration`)
- Call history (`getRunHistory()`, `getTerminateHistory()`)
- Session resumption simulation (uses provided sessionId)

---

## How Pods Are Designed to Work

### IWorkUnitPod Interface (Workshop 04)

```typescript
interface IWorkUnitPod {
  readonly nodeId: string;
  readonly unitType: 'agent' | 'code';
  readonly sessionId: string | undefined;
  execute(options: PodExecuteOptions): Promise<PodExecuteResult>;
  resumeWithAnswer(questionId: string, answer: unknown, options: PodResumeOptions): Promise<PodExecuteResult>;
  terminate(): Promise<void>;
}
```

### PodExecuteResult (4 outcomes)

```typescript
type PodOutcome = 'completed' | 'question' | 'error' | 'terminated';

interface PodExecuteResult {
  outcome: PodOutcome;
  sessionId?: string;       // captured from agent
  outputs?: Record<string, unknown>;
  question?: PodQuestion;   // if outcome='question'
  error?: PodError;         // if outcome='error'
}
```

### AgentPod (wraps IAgentAdapter)

Key responsibilities:
1. **Prompt construction**: Load template via `unit.getPrompt(ctx)`, substitute `{{input}}` placeholders
2. **Session management**: Use `contextSessionId` for inheritance, capture `result.sessionId` for future use
3. **Question detection**: Via tool_call convention (agent calls `ask_question` tool)
4. **Error wrapping**: `try/catch` around adapter call, map to `PodExecuteResult`

### PodManager (per-graph)

```typescript
interface IPodManager {
  createPod(ctx, graphSlug, nodeId, unit): IWorkUnitPod;
  getPod(nodeId): IWorkUnitPod | undefined;
  getSessionId(nodeId): string | undefined;
  setSessionId(nodeId, sessionId): void;
  destroyPod(nodeId): void;          // pod gone, session retained
  loadSessions(ctx, graphSlug): Promise<void>;
  persistSessions(ctx, graphSlug): Promise<void>;
}
```

Session persistence: `<worktree>/.chainglass/graphs/<slug>/pod-sessions.json` (atomic writes).

---

## The Node-Starter-Prompt System

### Old System: wf.md + AGENT-START.md

The old Chainglass WF system used a 3-layer prompt architecture:

1. **AGENT-START.md** -- Bootstrap. Tells agent to read wf.md, then main.md, then execute.
2. **wf.md** -- Workflow contract. Fail-fast policy, input/output conventions, validate/finalize lifecycle.
3. **commands/main.md** -- Phase-specific task instructions.

**Key patterns from old system**:
- Agent reads its instructions via filesystem commands (not fed inline)
- Agent uses CLI commands to read inputs, write outputs, ask questions
- Fail-fast policy: stop immediately on WF-related errors, don't try to figure it out
- Validate-then-finalize lifecycle

### New System: node-starter-prompt.md

Replaces the old 3-layer system with a single generic prompt that works for any agentic node:

**Purpose**: Teach the agent HOW the workflow system works, WHERE to find its task instructions, and WHAT CLI commands to use.

**What it must cover**:
1. **System context**: "You are an agent in a positional graph workflow. Your node is `$NODE` in graph `$GRAPH`."
2. **Reading instructions**: "Your task prompt is at `.chainglass/units/$UNIT_SLUG/prompts/main.md`. Read it with the filesystem."
3. **Reading inputs**: `node apps/cli/dist/cli.cjs wf node get-input-data $GRAPH $NODE <input-name>`
4. **Writing outputs**: `node apps/cli/dist/cli.cjs wf node save-output-data $GRAPH $NODE <name> <value>`
5. **Asking questions**: `node apps/cli/dist/cli.cjs wf node ask $GRAPH $NODE --type <type> --text "<question>"` then STOP AND EXIT
6. **Answering after resume**: `node apps/cli/dist/cli.cjs wf node get-answer $GRAPH $NODE <questionId>`
7. **Completing**: `node apps/cli/dist/cli.cjs wf node end $GRAPH $NODE`
8. **Fail-fast policy**: "If any WF CLI command fails, STOP immediately and report the error. Do NOT attempt to fix WF-related errors."
9. **Non-WF work**: "You may also be asked to work on the actual project codebase. Follow the task instructions in main.md."
10. **CWD**: "Your working directory is the worktree root. All paths are relative to this."

**Variables substituted before injection**:
- `$GRAPH` -- graph slug
- `$NODE` -- node ID
- `$UNIT_SLUG` -- work unit slug (for finding prompt template)

**Note**: The CLI binary path is `node apps/cli/dist/cli.cjs` (not `cg` which may not be in PATH), or whatever the resolved path is from `WorkspaceContext`.

---

## Graph-Level Agent Type Setting

### Current State

Work units declare `supported_agents` in their config:
```yaml
agent:
  prompt_template: prompts/main.md
  supported_agents:
    - claude-code
    - copilot
```

But there is no graph-level default agent type setting.

### What's Needed

The graph needs a property (likely in graph configuration or state) that specifies:
```typescript
interface GraphAgentConfig {
  defaultAgentType: AgentType;  // 'copilot' (default) | 'claude-code'
}
```

**Resolution logic**:
1. Check work unit's `supported_agents` -- if it only supports one type, use that
2. If multiple types supported (or not specified), fall back to graph's `defaultAgentType`
3. If no graph default, fall back to system default (`copilot`)

This setting could live in the graph's property bag (Plan 022 `PropertyBagSchema` supports arbitrary properties via `.catchall(z.unknown())`).

---

## Session Resumption Chain

### The Full Flow

```
1. ONBAS.walkForNextAction(reality) -> StartNodeRequest
2. ODS receives request
3. ODS calls: AgentContextService.getContextSource(reality, nodeId)
   -> { source: 'inherit', fromNodeId: 'node-abc' }
4. ODS calls: PodManager.getSessionId('node-abc')
   -> 'session-xyz'
5. ODS calls: PodManager.createPod(ctx, graphSlug, nodeId, unit)
   -> pod (AgentPod wrapping IAgentAdapter)
6. AgentPod.execute({ contextSessionId: 'session-xyz', inputs, ctx })
   -> IAgentAdapter.run({ prompt, sessionId: 'session-xyz', cwd })
   -> Agent resumes with prior conversation context
7. Result: AgentResult { sessionId: 'session-abc-new', status: 'completed' }
8. PodManager.setSessionId(nodeId, 'session-abc-new')
9. PodManager.persistSessions() -> pod-sessions.json
```

### Rules (from AgentContextService, Phase 3 -- COMPLETE)

| Scenario | Context Result | Session Behavior |
|----------|---------------|-----------------|
| First agent on line 0 | `new` | Fresh session |
| First agent on line N>0 | `inherit` from agent on prev line | Resume prior agent's session |
| Parallel agent | `new` | Fresh session (always independent) |
| Serial agent (not first) | `inherit` from left neighbor | Resume left neighbor's session |
| No prior agent found | `new` | Fresh session |
| Non-agent node | `not-applicable` | No session |

---

## Agent Lifecycle Events and Detection

### What Agents Can Do

| Agent Action | How Detected | Result for Pod |
|-------------|-------------|----------------|
| Complete successfully | `AgentResult.status === 'completed'` | `PodExecuteResult { outcome: 'completed' }` |
| Fail/error | `AgentResult.status === 'failed'` | `PodExecuteResult { outcome: 'error' }` |
| Get killed | `AgentResult.status === 'killed'` | `PodExecuteResult { outcome: 'terminated' }` |
| Ask a question | `tool_call` event with `ask_question` | `PodExecuteResult { outcome: 'question' }` |
| Stream output | `text_delta` events via `onEvent` | `PodProgressEvent` forwarded |

### Question Detection (Open Design Decision)

Workshop 04 identifies two approaches:
- **Option A (preferred)**: Agent calls `cg wf node ask` via CLI. AgentPod detects this via `tool_call` event.
- **Option B (fallback)**: Parse agent output for question markers.

**For real agent testing**: The agent's prompt must instruct it to call `cg wf node ask` and then STOP. The AgentPod detects the question from CLI side effects (node status becomes `waiting-question`) rather than from agent events.

### SSE/Event Broadcasting (Out of Scope for Now)

The existing `IAgentNotifierService` broadcasts SSE events for the web UI. Pods operate by `nodeId`, not `agentId`. A bridge from PodEvents to SSE is needed later but is explicitly OOS for the initial integration.

---

## Parallel Agent Execution

### Current Design (Sequential Loop)

```
Orchestration Loop:
  1. Build reality (fresh snapshot)
  2. ONBAS: walkForNextAction() -> request
  3. If start-node: ODS starts ONE pod (blocks until complete)
  4. Update state
  5. Repeat from 1
```

Parallel nodes on the same line can all be `ready` simultaneously. ONBAS returns them one at a time (leftmost first). Each starts in a separate loop iteration.

### Testing Parallel Behavior

The existing E2E test (`test/e2e/positional-graph-execution-e2e.test.ts:1077-1189`) verifies:
- Both parallel nodes are ready simultaneously
- Both can be started independently
- Serial successor only becomes ready after both complete

For real agents, the same pattern applies -- start one, complete, start next, complete, then successor unlocks.

### Future: True Concurrent Execution

Not in scope now. Would require:
- `Promise.all` / `Promise.allSettled` for starting multiple pods
- ONBAS returning multiple requests per walk
- Concurrent state update safety

---

## Testing Strategy for Real Agents

### Layer 1: Unit Tests (Deterministic, No Real Agents)

**Already planned in Phase 4 tasks.md (12 tasks, all pending)**:
- Pod schema/type tests with Zod validation
- AgentPod unit tests with FakeAgentAdapter
- CodePod unit tests with FakeScriptRunner
- PodManager unit tests with FakeFileSystem
- FakePodManager/FakePod verification
- Contract tests (fake vs real parity)

**Key reuse**: `FakeAgentAdapter` already supports everything AgentPod needs.

### Layer 2: Integration Tests (Service Composition, No Real Agents)

**Planned in Phase 6** (Workshop 06):
- `createOrchestrationTestHarness()` wires: real ONBAS + real ODS + FakePodManager + real AgentContextService
- `FakePodBehavior` configures what each node's pod returns
- Tests: serial chain, question cycle, parallel nodes, context inheritance, error recovery

### Layer 3: E2E Tests (Full Stack, Still No Real Agents)

**Planned in Phase 8** (Workshop 06):
- Human-as-agent pattern: test harness acts as every agent via CLI commands
- `cg wf run` triggers orchestration; harness drives agent side
- 4-line, 8-node test graph covering all patterns

### Layer 4: Real Agent Tests (New -- Not In Plan 030)

**This is the new layer we need for "pods that work"**:

**4a. Smoke Test -- Single Agent Completes**
- Start a simple graph with one agent node (e.g., `sample-coder`)
- Agent runs with real Claude Code adapter
- Agent reads inputs via CLI, writes outputs, calls `end`
- Verify: node status transitions pending -> running -> complete
- Verify: outputs are persisted
- Verify: session ID captured

**4b. Question/Answer Test**
- Agent asks a question via `cg wf node ask`
- Agent exits (fail-fast after question)
- Test harness answers via `cg wf node answer`
- Orchestration resumes agent with answer
- Verify: agent receives answer, continues work

**4c. Session Resumption Test**
- Agent A on line 0 completes
- Agent B on line 1 inherits Agent A's session
- Verify: Agent B has conversation context from Agent A
- This is the real test of context inheritance

**4d. Parallel Agent Test**
- Two parallel agent nodes on same line
- Both get fresh sessions (no inheritance)
- Both complete independently
- Serial successor starts after both complete

**4e. Error/Fail-Fast Test**
- Agent encounters a WF error (e.g., bad input name)
- Agent should stop and report, not try to fix
- Verify: PodExecuteResult has outcome 'error'

**4f. Prompt Stability Test**
- Agent receives node-starter-prompt.md + task prompt
- Agent follows instructions correctly (reads inputs, does work, writes outputs)
- This is the "stay on track" verification

### Test Infrastructure Needed

| Component | Purpose | Exists? |
|-----------|---------|---------|
| FakeAgentAdapter | Deterministic unit testing | Yes |
| FakeScriptRunner | Code pod testing | No (Phase 4) |
| FakePodManager | Integration testing | No (Phase 4) |
| createOrchestrationTestHarness() | Service composition | No (Phase 6) |
| Real agent test runner | Layer 4 tests | No (new) |
| node-starter-prompt.md | Agent bootstrap | No (new) |
| Test graph fixtures | Multi-pattern scenarios | Partial (E2E has some) |

---

## Prior Learnings (From Previous Plans)

### PL-01: DYK-I10 -- Cross-Line Walk-Back
**Source**: Phase 3 tasks.md
**Type**: Discovery
**What**: The AgentContextService must walk ALL previous lines (N-1, N-2, ... 0) to find an agent for session inheritance. The PositionalGraphRealityView's `getFirstAgentOnPreviousLine()` only checks line N-1.
**Why it matters**: PodManager's session lookup depends on correct `fromNodeId`. If the walk-back is wrong, agents inherit the wrong session or fail to inherit at all.

### PL-02: DYK-I13 -- Serial Left-Neighbor Walk
**Source**: Phase 3 tasks.md
**Type**: Discovery (updated)
**What**: Serial left-neighbor walk-back must skip past non-agent nodes AND does NOT stop at parallel nodes. A serial node CAN inherit from a parallel agent to its left.
**Why it matters**: Session inheritance between serial and parallel nodes on the same line is nuanced.

### PL-03: DYK-I9 -- Bare Function Export
**Source**: Phase 3 tasks.md
**Type**: Decision
**What**: `getContextSource` is exported as a bare function; `AgentContextService` class is a thin wrapper for DI injection.
**Why it matters**: ODS tests should prefer the real pure function over FakeAgentContextService (DYK-I12).

### PL-04: Atomic Writes Are Mandatory
**Source**: Plan 016, Phase 5 Critical Findings
**Type**: Pattern
**What**: All state persistence (state.json, data.json, pod-sessions.json) must use temp-then-rename atomic writes.
**Why it matters**: Pod session files are a new persistence target subject to the same corruption risks.

### PL-05: Errors in Results, Never Throw
**Source**: Plan 016, Architectural Patterns
**Type**: Pattern
**What**: All service methods return `{ ..., errors: [] }` rather than throwing exceptions.
**Why it matters**: AgentPod and PodManager should follow this pattern for error reporting.

### PL-06: Session ID Stability
**Source**: Old e2e-sample-flow.ts
**Type**: Insight
**What**: The old system used sessionId from AgentResult for resumption. Claude Code adapter's `--fork-session --resume` flags handle this. Session IDs are stable across process restarts.
**Why it matters**: The pod-sessions.json persistence approach is validated by prior usage.

### PL-07: Agent Invocation Pattern
**Source**: Old e2e-sample-flow.ts `invokeAgent()`
**Type**: Pattern
**What**: Agents are spawned via CLI (`cg agent run -t <type> -p <prompt> [-s <sessionId>]`). NDJSON output is parsed for events. This is the exact pattern that ClaudeCodeAdapter already implements internally.
**Why it matters**: Pods call IAgentAdapter.run() directly, bypassing the CLI, but the underlying mechanics are identical.

### PL-08: Question Detection via Status Polling
**Source**: Old e2e-sample-flow.ts
**Type**: Pattern
**What**: The old system detected questions by polling node status (checking for `waiting-question` status). The agent calls `cg wf node ask` which sets the status, then exits.
**Why it matters**: This is simpler than parsing agent events. AgentPod can detect questions by checking node status after adapter.run() returns.

---

## Critical Discoveries

### CD-01: Phase 4 Is Ready for Implementation

All design work is complete. The 12-task plan in `tasks/phase-4-workunitpods-and-podmanager/tasks.md` specifies exact file paths, test names, and validation criteria. FakeAgentAdapter exists and supports everything needed. No design ambiguity remains.

### CD-02: Real Agent Integration Is a Follow-On Plan

Plan 030's spec explicitly states: "Real agent integration -- This plan uses fake agents exclusively." The research for "pods that work" is scoping a FOLLOW-ON plan that layers real agents on top of the Phase 4-8 infrastructure.

### CD-03: The node-starter-prompt.md Is the Key New Artifact

No equivalent exists yet. The old wf.md provides the template, but the new positional graph system needs a fresh prompt tailored to `cg wf` commands and the WorkUnit prompt template system. This prompt must be generic enough to work for any agentic node.

### CD-04: CLI Path Resolution Is Critical

Agents running in pods need to call CLI commands. The path must be resolved correctly:
- The old system used `cg` command (requires PATH setup)
- The test system uses `node apps/cli/dist/cli.cjs` (explicit path)
- Production needs a reliable resolution mechanism (e.g., via WorkspaceContext or environment variable)

### CD-05: PodManager-AgentManagerService Boundary

`AgentManagerService` (Plan 019) manages agents globally by `agentId`. `PodManager` (Plan 030) manages pods per-graph by `nodeId`. These are separate systems. Pods use IAgentAdapter directly, not AgentManagerService. Whether a pod's agent should be registered in AgentManagerService is unspecified and should be resolved.

---

## Modification Considerations

### Safe to Modify
1. **New files in 030-orchestration feature folder** -- All pod/podmanager code is greenfield
2. **New test files** -- No risk to existing tests
3. **Graph property bag** -- Adding `defaultAgentType` via existing `.catchall(z.unknown())`

### Modify with Caution
1. **WorkUnit schema** -- Adding graph-level agent type config must not break existing fixtures
2. **State schema** -- New fields for pod sessions must be optional with sensible defaults
3. **PositionalGraphReality types** -- Phase 4 may need to extend NodeReality

### Danger Zones
1. **IAgentAdapter interface** -- Stable from Plan 019. Do not modify.
2. **FakeAgentAdapter** -- Heavily used in existing tests. Extend only, never modify.
3. **Existing E2E tests** -- 1539 lines in `positional-graph-execution-e2e.test.ts`. Do not break.

---

## External Research Opportunities

### Research Opportunity 1: Agent Prompt Engineering for Workflow Compliance

**Why Needed**: The node-starter-prompt.md must instruct agents to use CLI commands correctly, fail fast on errors, stay on track, and not try to "figure things out." Getting this prompt right requires iteration and may benefit from studying prompt engineering patterns for agentic tool use.

**Impact on Plan**: High -- prompt quality directly determines whether agents complete workflow tasks correctly.

**Ready-to-use prompt:**
```
/deepresearch "Best practices for prompt engineering in agentic tool-use workflows.
Specifically: how to instruct LLM agents to (1) use specific CLI tools for data I/O,
(2) fail fast on tool errors instead of attempting workarounds, (3) stay on task and
not deviate from instructions, (4) properly handle question/answer protocols where
the agent must stop after asking. Context: agents are Claude Code or GitHub Copilot
running in a workflow orchestration system, using CLI commands to read inputs,
write outputs, ask questions, and complete nodes."
```

### Research Opportunity 2: Concurrent Agent Session Management

**Why Needed**: When parallel nodes run real agents simultaneously (future optimization), session management, process management, and resource contention become concerns.

**Impact on Plan**: Medium -- this is a future optimization but architectural decisions made now should not preclude it.

---

## Next Steps

This research establishes the landscape for making pods run real agents. The recommended path:

1. **Complete Phase 4** (Plan 030) -- WorkUnitPods + PodManager with FakeAgentAdapter
2. **Complete Phases 5-7** (Plan 030) -- ONBAS, ODS, IOrchestrationService
3. **Complete Phase 8** (Plan 030) -- E2E tests with human-as-agent
4. **Workshop the follow-on plan** -- "Pods That Work" plan covering:
   - node-starter-prompt.md design and iteration
   - Graph-level agent type configuration
   - Real agent smoke/integration/E2E tests
   - Session resumption verification with real LLMs
   - Parallel agent testing
   - Prompt stability testing

We will be workshopping details of items in step 4.

---

**Research Complete**: 2026-02-06
**Report Location**: `docs/plans/031-pods-that-work/research-dossier.md`
