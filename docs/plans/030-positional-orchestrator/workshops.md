# Plan 030: Positional Orchestrator Workshops

## Workshop Order (Dependency-Driven)

| # | Workshop | Status | Purpose |
|---|----------|--------|---------|
| 1 | [PositionalGraphReality](workshops/01-positional-graph-reality.md) | **Draft** | Snapshot of entire graph state |
| 2 | [OrchestrationRequest](workshops/02-orchestration-request.md) | **Draft** | Discriminated union for orchestrator actions |
| 3 | [AgentContextService](workshops/03-agent-context-service.md) | **Draft** | Context continuity rules (inherit vs new) |
| 4 | [WorkUnitPods](workshops/04-work-unit-pods.md) | **Draft** | Execution containers for nodes |
| 5 | [ONBAS](workshops/05-onbas.md) | **Draft** | Rules engine: graph → next action |
| 6 | [E2E Integration Testing](workshops/06-e2e-integration-testing.md) | **Draft** | Human-as-agent E2E + integration test strategy |
| 7 | [Orchestration Entry Point](workshops/07-orchestration-entry-point.md) | **Draft** | IOrchestrationService + IGraphOrchestration developer UX |
| 8 | [ODS](#8-orchestrationdoerservice-ods) | pending | Executor: action → state change |

---

## 1. PositionalGraphReality

**Purpose**: Snapshot object capturing entire graph state for decision-making and testing.

**Key Questions**:
- What fields does it contain?
- How is it built from existing `getStatus()` + state.json?
- What convenience accessors (readyNodes, currentLine, etc.)?

**Output**: Zod schema, TypeScript type, builder function

---

## 2. OrchestrationRequest (OR)

**Purpose**: Discriminated union defining exactly what the orchestrator should do next.

**Key Questions**:
- What are all the request types?
- What payload does each carry?
- How does it map to ODS actions?

**Output**: Zod schema with discriminated union, type guards

---

## 3. AgentContextService

**Purpose**: Determine which session context a node should inherit (or start fresh).

**Key Questions**:
- First node in line → first AGENT node on previous line (unless No Context flag)
- Parallel→serial → direct left neighbor
- Serial→serial → left neighbor
- Standalone parallel → new context
- How to look up session ID from source node?

**Output**: Interface, implementation, rules lookup algorithm

---

## 4. WorkUnitPods

**Purpose**: Execution containers that wrap nodes and manage agent/code lifecycle.

**Key Questions**:
- What does a pod actually do vs what the node tracks?
- How are pods created/destroyed?
- How do they handle questions?
- Session ID storage for rehydration?
- FakePod for testing?

**Output**: IPod interface, PodManager, FakePodManager

---

## 5. OrchestrationNextBestActionService (ONBAS)

**Purpose**: Walk graph, find next actionable item, return OrchestrationRequest.

**Key Questions**:
- What are the "simple rules" for the walk?
- How to handle questions already emitted (skip past)?
- How to find parallel nodes that can start?
- When to return "complete" vs "waiting"?

**Output**: Interface, implementation, walk algorithm

---

## 6. E2E Integration Testing

**Purpose**: Define the end-to-end integration testing strategy using the "human-as-agent" pattern — no real agents, test harness acts as every agent via CLI.

**Key Questions**:
- What does the E2E test graph look like?
- How do we "act as the agent" via CLI commands?
- What's the `cg wf run` command interface?
- What test infrastructure exists vs needs creating?
- How do integration tests differ from E2E tests?

**Output**: E2E test script, integration test harness, shared CLI runner, `cg wf run` command spec

---

## 7. Orchestration Entry Point

**Purpose**: Define the top-level developer UX for orchestration — the two-level pattern of `IOrchestrationService` (DI singleton) and `IGraphOrchestration` (per-graph handle with identity).

**Key Questions**:
- What is the first object a developer creates to orchestrate a graph?
- How does the two-level pattern (singleton service → per-graph handle) work?
- What does `IGraphOrchestration` expose to callers?
- What does the `run()` result look like?
- How do web pages, CLI commands, and tests each consume this?

**Output**: IOrchestrationService interface, IGraphOrchestration interface, OrchestrationRunResult, FakeOrchestrationService, DI registration, usage patterns for web/CLI/test

---

## 8. OrchestrationDoerService (ODS)

**Purpose**: Execute an OrchestrationRequest by controlling pods and updating state.

**Key Questions**:
- How does it map each OR type to actions?
- How does it interact with PodManager?
- How does it update node state?
- Event emission for UI updates?

**Output**: Interface, implementation, action handlers

---

## Supporting Workshops (If Needed)

### Test Graph Fixture

Covered by **Workshop #6 (E2E Integration Testing)** — reuses the 4-line, 8-node pipeline.

### Fake Infrastructure

Covered by **Workshop #4 (WorkUnitPods)** for FakePodManager/FakePod, **Workshop #6** for the integration test harness, and **Workshop #7** for FakeOrchestrationService/FakeGraphOrchestration.
