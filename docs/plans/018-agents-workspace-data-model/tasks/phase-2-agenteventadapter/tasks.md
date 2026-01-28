# Phase 2: AgentEventAdapter (Workspace-Scoped Event Storage) – Tasks & Alignment Brief

**Spec**: [agents-workspace-data-model-spec.md](../../agents-workspace-data-model-spec.md)
**Plan**: [agents-workspace-data-model-plan.md](../../agents-workspace-data-model-plan.md)
**Date**: 2026-01-28

---

## Executive Briefing

### Purpose
This phase makes agent event storage workspace-aware by wrapping the existing `EventStorageService` with an `AgentEventAdapter` that accepts `WorkspaceContext`. Without this, events remain stored at the legacy Plan 015 path (`<cwd>/.chainglass/workspaces/default/data/`) instead of the proper workspace-scoped path per ADR-0008.

### What We're Building
An `AgentEventAdapter` that:
- Wraps `EventStorageService` with workspace context resolution
- Stores events at `<worktreePath>/.chainglass/data/agents/<sessionId>/events.ndjson`
- Maintains all existing DYK behaviors (timestamp IDs, NDJSON format, malformed line skipping)
- Enables workspace isolation (events from workspace A invisible to workspace B)
- Exports `EventStorageService` from server-only entry point (browser safety)

### User Value
Agent events become workspace-scoped - each worktree gets its own event history. Combined with Phase 1's session metadata, this enables:
- Multi-project isolation (no cross-workspace data leakage)
- Foundation for Phase 3's workspace-scoped web UI
- Existing SSE streaming continues working (just with new paths)

### Example
**Before (Plan 015)**: Events at non-workspace path
```
Server: <cwd>/.chainglass/workspaces/default/data/session-abc/events.ndjson
```

**After (Plan 018)**: Workspace-scoped storage
```
Server: <worktree>/.chainglass/data/agents/session-abc/events.ndjson
                                 ↑ agents domain under workspace data path
```

---

## Objectives & Scope

### Objective
Implement workspace-aware event storage via AgentEventAdapter, satisfying AC-07 through AC-12 while maintaining all Plan 015 DYK behaviors.

**Behavior Checklist**:
- [ ] AC-07: IAgentEventAdapter interface defines append, getAll, getSince, archive, exists with WorkspaceContext
- [ ] AC-08: Events stored at `<worktreePath>/.chainglass/data/agents/<sessionId>/events.ndjson`
- [ ] AC-09: NDJSON format preserved, DYK-04 behavior (skip malformed lines) maintained
- [ ] AC-10: Workspace isolation - events in workspace A invisible to workspace B queries
- [ ] AC-11: Session ID validation via validateSessionId() before filesystem operations
- [ ] AC-12: FakeAgentEventAdapter with three-part API passes contract tests

### Goals

- ✅ Create IAgentEventAdapter interface (5 methods with WorkspaceContext)
- ✅ Implement AgentEventAdapter wrapping EventStorageService
- ✅ Implement FakeAgentEventAdapter with three-part testing API
- ✅ Create contract tests ensuring fake-real parity
- ✅ Write workspace isolation integration tests
- ✅ Export EventStorageService from server-only entry point
- ✅ Add optional logging for malformed line skipping
- ✅ Register AgentEventAdapter in DI container
- ✅ Verify SSE integration still works with new paths

### Non-Goals

- ❌ Web UI routes or React components (Phase 3)
- ❌ Session metadata storage (Phase 1 - complete)
- ❌ Migration from old event paths (Phase 4)
- ❌ Event schema changes (preserve existing AgentStoredEvent)
- ❌ SSE broadcast refactoring (keep existing mechanism, just path changes)
- ❌ Event filtering or transformation (adapter is pass-through)
- ❌ Compression or event log rotation (out of scope for this plan)

---

## Architecture Map

### Component Diagram
<!-- Status: grey=pending, orange=in-progress, green=completed, red=blocked -->
<!-- Updated by plan-6 during implementation -->

```mermaid
flowchart TD
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef inprogress fill:#FF9800,stroke:#F57C00,color:#fff
    classDef completed fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    style Interfaces fill:#E8F5E9,stroke:#388E3C
    style Adapters fill:#FFF3E0,stroke:#F57C00
    style Fakes fill:#F3E5F5,stroke:#7B1FA2
    style Tests fill:#E0F7FA,stroke:#00838F
    style Server fill:#E3F2FD,stroke:#1976D2

    subgraph Interfaces["Interfaces"]
        T001["T001: IAgentEventAdapter"]:::pending
    end

    subgraph Tests["Tests"]
        T002["T002: Adapter unit tests (TDD)"]:::pending
        T004["T004: Workspace isolation tests"]:::pending
        T005["T005: Event ID generation tests"]:::pending
        T006["T006: Session ID validation tests"]:::pending
        T008["T008: NDJSON malformed line tests"]:::pending
        T012["T012: SSE integration test"]:::pending
    end

    subgraph Adapters["Adapters"]
        T003["T003: AgentEventAdapter"]:::pending
    end

    subgraph Fakes["Fakes"]
        T010["T010: FakeAgentEventAdapter"]:::pending
    end

    subgraph Server["Server Export"]
        T007["T007: Server-only entry point"]:::pending
        T009["T009: Optional logging"]:::pending
    end

    subgraph DI["DI Container"]
        T011["T011: Container registration"]:::pending
    end

    %% Dependencies
    T001 --> T002
    T002 --> T003
    T001 --> T010
    T003 --> T004
    T003 --> T005
    T003 --> T006
    T003 --> T007
    T003 --> T008
    T003 --> T009
    T010 --> T011
    T003 --> T011
    T011 --> T012

    %% File mappings (dotted lines)
    T001 -.-> IF1["/packages/workflow/src/interfaces/agent-event-adapter.interface.ts"]
    T002 -.-> TF1["/test/unit/workflow/agent-event-adapter.test.ts"]
    T003 -.-> AF1["/packages/workflow/src/adapters/agent-event.adapter.ts"]
    T004 -.-> IF2["/test/integration/workspace-agent-isolation.test.ts"]
    T007 -.-> SF1["/packages/shared/src/index.server.ts"]
    T010 -.-> FF1["/packages/workflow/src/fakes/fake-agent-event-adapter.ts"]
    T011 -.-> DIF1["/packages/workflow/src/container.ts"]
```

### Task-to-Component Mapping

<!-- Status: ⬜ Pending | 🟧 In Progress | ✅ Complete | 🔴 Blocked -->

| Task | Component(s) | Files | Status | Comment |
|------|-------------|-------|--------|---------|
| T001 | Interface | `/packages/workflow/src/interfaces/agent-event-adapter.interface.ts` | ⬜ Pending | Define 5-method interface (append, getAll, getSince, archive, exists) with WorkspaceContext |
| T002 | Test | `/test/unit/workflow/agent-event-adapter.test.ts` | ⬜ Pending | TDD: Write adapter unit tests first |
| T003 | Adapter | `/packages/workflow/src/adapters/agent-event.adapter.ts` | ⬜ Pending | Wrap EventStorageService with WorkspaceContext path resolution |
| T004 | Test | `/test/integration/workspace-agent-isolation.test.ts` | ⬜ Pending | Verify events don't leak across workspaces |
| T005 | Test | `/test/unit/workflow/agent-event-adapter.test.ts` | ⬜ Pending | Verify timestamp-based ID format per DYK-01 |
| T006 | Test | `/test/unit/workflow/agent-event-adapter.test.ts` | ⬜ Pending | Verify validateSessionId() called per Discovery 05 |
| T007 | Export | `/packages/shared/src/index.server.ts` | ⬜ Pending | Server-only export for EventStorageService per Discovery 03 |
| T008 | Test | `/test/unit/workflow/agent-event-adapter.test.ts` | ⬜ Pending | Verify malformed line skipping per DYK-04 |
| T009 | Adapter | `/packages/workflow/src/adapters/agent-event.adapter.ts` | ⬜ Pending | Add optional logger for malformed lines per Discovery 20 |
| T010 | Fake | `/packages/workflow/src/fakes/fake-agent-event-adapter.ts` | ⬜ Pending | Three-part API (state, inspection, injection) |
| T011 | DI | `/packages/workflow/src/container.ts` | ⬜ Pending | Register AgentEventAdapter with useFactory pattern |
| T012 | Test | `/test/integration/sse-workspace-integration.test.ts` | ⬜ Pending | Verify SSE still works with new paths |
| T013 | Checkpoint | N/A | ⬜ Pending | Run `pnpm test packages/workflow packages/shared` |

---

## Tasks

| Status | ID | Task | CS | Type | Dependencies | Absolute Path(s) | Validation | Subtasks | Notes |
|--------|-----|------|----|------|--------------|------------------|------------|----------|-------|
| [ ] | T001 | Write IAgentEventAdapter interface | 1 | Interface | – | `/home/jak/substrate/015-better-agents/packages/workflow/src/interfaces/agent-event-adapter.interface.ts` | Interface exports: append, getAll, getSince, archive, exists with WorkspaceContext as first param; result types defined | – | Follow IEventStorage pattern, add WorkspaceContext |
| [ ] | T002 | Write tests for AgentEventAdapter (TDD RED) | 2 | Test | T001 | `/home/jak/substrate/015-better-agents/test/unit/workflow/agent-event-adapter.test.ts` | Tests fail; cover: workspace-scoped paths, NDJSON format, DYK-04 behavior, session ID validation | – | Per Discovery 02: All methods take WorkspaceContext |
| [ ] | T003 | Implement AgentEventAdapter wrapping EventStorageService | 3 | Core | T002 | `/home/jak/substrate/015-better-agents/packages/workflow/src/adapters/agent-event.adapter.ts` | Adapter passes unit tests; constructs baseDir per workspace, delegates to EventStorageService; path: `<worktreePath>/.chainglass/data/agents/<sessionId>/events.ndjson` | – | Per Discovery 01: Use getDomainPath pattern from base class |
| [ ] | T004 | Write workspace isolation integration tests | 2 | Test | T003 | `/home/jak/substrate/015-better-agents/test/integration/workspace-agent-isolation.test.ts` | Tests verify: events in workspace A don't appear in workspace B getAll(); same sessionId different workspaces stay isolated | – | Per AC-10 |
| [ ] | T005 | Verify event ID generation tests (timestamp-based) | 1 | Test | T003 | `/home/jak/substrate/015-better-agents/test/unit/workflow/agent-event-adapter.test.ts` | Tests verify: generateEventId() format matches DYK-01 pattern (YYYY-MM-DDTHH:mm:ss.sssZ_xxxxx) | – | Reuse existing EventStorageService tests logic |
| [ ] | T006 | Write session ID validation tests in append() | 1 | Test | T003 | `/home/jak/substrate/015-better-agents/test/unit/workflow/agent-event-adapter.test.ts` | Tests verify: validateSessionId() called before filesystem operations; path traversal rejected | – | Per Discovery 05: Security critical |
| [ ] | T007 | Update EventStorageService to export from server-only entry point | 1 | Core | – | `/home/jak/substrate/015-better-agents/packages/shared/src/index.server.ts` | Service exported from `packages/shared/src/index.server.ts` not main `index.ts`; browser import fails gracefully | – | Per Discovery 03: Prevent browser bundle bloat |
| [ ] | T008 | Write tests for NDJSON malformed line handling | 2 | Test | T003 | `/home/jak/substrate/015-better-agents/test/unit/workflow/agent-event-adapter.test.ts` | Tests verify: corrupted lines skipped per DYK-04; valid lines parsed; partial corruption doesn't fail entire load | – | Per Discovery 10: Maintain existing resilience |
| [ ] | T009 | Add optional logging to malformed line skipping | 1 | Core | T003, T008 | `/home/jak/substrate/015-better-agents/packages/workflow/src/adapters/agent-event.adapter.ts` | Logger.warn() called when skipping malformed line (if logger injected); silent if no logger | – | Per Discovery 20: Optional observability |
| [ ] | T010 | Write FakeAgentEventAdapter with three-part API | 2 | Fake | T001 | `/home/jak/substrate/015-better-agents/packages/workflow/src/fakes/fake-agent-event-adapter.ts` | Fake has: addEvent/getEvents (state), appendCalls/getAllCalls (inspection), injectAppendError (injection), reset() | – | Per Discovery 08: Same pattern as FakeAgentSessionAdapter |
| [ ] | T011 | Register AgentEventAdapter in workflow DI container | 1 | DI | T003, T010 | `/home/jak/substrate/015-better-agents/packages/workflow/src/container.ts` | Production container uses AgentEventAdapter; test container uses FakeAgentEventAdapter; uses WORKSPACE_DI_TOKENS.AGENT_EVENT_ADAPTER | – | Per Discovery 14: useFactory pattern |
| [ ] | T012 | Verify SSE integration still works with new paths | 2 | Test | T011 | `/home/jak/substrate/015-better-agents/test/integration/sse-workspace-integration.test.ts` | Integration test: append event via adapter, trigger SSE broadcast, client receives notification; no regression to Plan 015 | – | Regression test for Plan 015 SSE functionality |
| [ ] | T013 | Verify all tests pass (unit + integration) | 1 | Checkpoint | T002, T004, T005, T006, T008, T012 | N/A | `pnpm test packages/workflow packages/shared` passes; 30+ new tests; no vi.mock usage | – | Phase complete checkpoint |

---

## Alignment Brief

### Prior Phases Review

#### Phase 1: AgentSession Entity + AgentSessionAdapter + Contract Tests

**Summary**: Phase 1 established the foundational AgentSession entity and adapter layer following the Sample exemplar pattern. All 16 tasks completed with 50 new tests passing.

**A. Deliverables Created** (12 files):

| Component | Absolute Path | Purpose |
|-----------|--------------|---------|
| Entity | `/packages/workflow/src/entities/agent-session.ts` | Immutable domain entity with factory pattern |
| Interface | `/packages/workflow/src/interfaces/agent-session-adapter.interface.ts` | 5-method CRUD contract |
| Schema | `/packages/shared/src/schemas/agent-session.schema.ts` | Zod validation + session ID validator |
| Adapter (Real) | `/packages/workflow/src/adapters/agent-session.adapter.ts` | Production filesystem I/O |
| Adapter (Fake) | `/packages/workflow/src/fakes/fake-agent-session-adapter.ts` | Three-part testing API |
| Service | `/packages/workflow/src/services/agent-session.service.ts` | Business logic layer |
| Errors | `/packages/workflow/src/errors/agent-errors.ts` | E090-E093 error classes |
| Tests (Entity) | `/test/unit/workflow/agent-session.entity.test.ts` | 13 entity tests |
| Tests (Service) | `/test/unit/workflow/agent-session-service.test.ts` | 11 service tests |
| Tests (Contract) | `/test/contracts/agent-session-adapter.contract.ts` | 13 contract test cases |
| Tests (Runner) | `/test/contracts/agent-session-adapter.contract.test.ts` | 26 total (fake + real) |
| DI Registration | `/packages/workflow/src/container.ts` | Production + test containers |

**B. Lessons Learned**:

| Learning | Impact on Phase 2 |
|----------|-------------------|
| TDD RED-GREEN cycle prevents drift | Apply same approach: write event adapter tests first |
| Adapter owns timestamps | Event adapter generates event IDs (not caller) |
| Contract tests catch fake drift | Implement contract tests for event adapter |
| Three-part fake API essential | FakeAgentEventAdapter needs state/inspection/injection |
| validateSessionId() critical path | Must call in append(), getAll(), getSince() |

**C. Technical Discoveries (DYK)**:

| Discovery | Impact on Phase 2 |
|-----------|-------------------|
| DYK-P3-01: Constructor injection pattern | AgentEventAdapter receives fs, pathResolver in constructor |
| DYK-P3-02: Adapter owns updatedAt | Event adapter generates timestamp-based IDs |
| Domain path resolution via `domain` property | Set `domain = 'agents'` for path computation |

**D. Dependencies Exported for Phase 2**:

```typescript
// From Phase 1 (available for Phase 2)
export interface IAgentSessionAdapter { save, load, list, remove, exists }
export class AgentSession { id, type, status, createdAt, updatedAt }
export function validateSessionId(id: string): void // Throws if invalid

// DI Token (reserved in Phase 1)
WORKSPACE_DI_TOKENS.AGENT_EVENT_ADAPTER // Ready to register
```

**E. Critical Findings Applied in Phase 1**:

| Finding | How Applied | Reference |
|---------|-------------|-----------|
| Discovery 01: WorkspaceDataAdapterBase | AgentSessionAdapter extends base | `agent-session.adapter.ts:42` |
| Discovery 02: WorkspaceContext first param | All interface methods | `agent-session-adapter.interface.ts` |
| Discovery 05: validateSessionId | Called in save, load, remove, exists | `agent-session.adapter.ts:59,92,182,214` |
| Discovery 06: Service→Interface | Service constructor takes interface | `agent-session.service.ts:40` |
| Discovery 08: Three-part fake API | Implemented in FakeAgentSessionAdapter | `fake-agent-session-adapter.ts` |
| Discovery 09: Contract test parity | 13 tests × 2 adapters | `contract.test.ts` |

**F. Incomplete/Blocked Items**: None - all tasks complete ✅

**G. Test Infrastructure Created**:
- Contract test factory pattern (reusable for event adapter)
- FakeAgentSessionAdapter with three-part API
- Test fixtures: SESSION_1, SESSION_2
- 50 new tests, 100% passing

**H. Technical Debt**: None critical (minor: no caching, O(n) list)

**I. Architectural Decisions**:
- Immutable entity with private constructor
- Service→Interface dependency (clean architecture)
- No caching (fresh filesystem reads)
- WorkspaceContext in every method

**J. Scope Changes**: None - executed as planned

**K. Key Log References**:
- `execution.log.md#task-t001-write-iagentsessionadapter-interface` - Interface creation
- `execution.log.md#task-t003-write-tests-for-agentsession-entity-tdd-red` - TDD RED phase
- `execution.log.md#phase-1-summary` - Final verification

### Critical Findings Affecting This Phase

| Finding | Constraint/Requirement | Addressed By |
|---------|------------------------|--------------|
| Discovery 01: WorkspaceDataAdapterBase Pattern | AgentEventAdapter uses getDomainPath() for path resolution | T003 |
| Discovery 02: WorkspaceContext | All adapter methods require WorkspaceContext as first param | T001, T003 |
| Discovery 03: Browser Incompatibility | EventStorageService exported from server-only entry point | T007 |
| Discovery 05: Session ID Validation | validateSessionId() MUST be called before filesystem ops | T006, T003 |
| Discovery 08: Three-Part Fake API | FakeAgentEventAdapter needs State, Inspection, Injection | T010 |
| Discovery 10: NDJSON Malformed Line Handling | Skip corrupted lines per DYK-04, continue with valid | T008, T003 |
| Discovery 20: Optional Logging for Corruption | Logger.warn() when skipping malformed line (if injected) | T009 |

### ADR Decision Constraints

| ADR | Constraint | Affected Tasks |
|-----|-----------|----------------|
| ADR-0008 | Events stored at `<worktreePath>/.chainglass/data/agents/<sessionId>/events.ndjson` | T003 |
| ADR-0008 | No cross-workspace event leakage | T004 |

### Invariants & Guardrails

- **Session ID format**: `[a-zA-Z0-9_-]{1,255}` - reject path traversal attempts
- **Event ID format**: `YYYY-MM-DDTHH:mm:ss.sssZ_xxxxx` (timestamp + random suffix)
- **NDJSON format**: One JSON object per line, newline-delimited
- **No caching**: Always fresh filesystem reads
- **Error propagation**: Use E093 for AgentEventNotFound
- **Workspace isolation**: Events scoped to single worktree

### Inputs to Read

| File | Purpose |
|------|---------|
| `/home/jak/substrate/015-better-agents/packages/shared/src/interfaces/event-storage.interface.ts` | IEventStorage interface to mirror |
| `/home/jak/substrate/015-better-agents/packages/shared/src/services/event-storage.service.ts` | EventStorageService to wrap |
| `/home/jak/substrate/015-better-agents/packages/workflow/src/adapters/agent-session.adapter.ts` | Pattern for workspace-aware adapter |
| `/home/jak/substrate/015-better-agents/packages/workflow/src/fakes/fake-agent-session-adapter.ts` | Fake three-part API pattern |
| `/home/jak/substrate/015-better-agents/packages/shared/src/lib/validators/session-id-validator.ts` | validateSessionId() function |
| `/home/jak/substrate/015-better-agents/packages/workflow/src/adapters/workspace-data-adapter-base.ts` | getDomainPath() utility |

### Visual Alignment Aids

#### Event Storage Flow Diagram

```mermaid
flowchart LR
    subgraph Client["Web / CLI"]
        REQ[append(ctx, sessionId, event)]
    end
    
    subgraph Adapter["AgentEventAdapter"]
        VAL[validateSessionId]
        PATH[getDomainPath + sessionId]
        DEL[EventStorageService.append]
    end
    
    subgraph Storage["Filesystem"]
        FILE[events.ndjson]
    end
    
    REQ --> VAL
    VAL --> PATH
    PATH --> DEL
    DEL --> FILE
```

#### Adapter Method Sequence (append)

```mermaid
sequenceDiagram
    participant S as Service
    participant A as AgentEventAdapter
    participant ESS as EventStorageService
    participant FS as FileSystem
    
    S->>A: append(ctx, sessionId, event)
    A->>A: validateSessionId(sessionId)
    A->>A: buildBaseDir(ctx, sessionId)
    Note right of A: <worktreePath>/.chainglass/data/agents/
    A->>ESS: append(sessionId, event)
    ESS->>ESS: generateEventId()
    Note right of ESS: timestamp_random suffix
    ESS->>FS: appendFile(events.ndjson, JSON line)
    ESS-->>A: StoredEvent with id
    A-->>S: StoredEvent
```

#### Workspace Isolation Diagram

```mermaid
flowchart TB
    subgraph WS1["Workspace A (worktreePath: /project-a)"]
        WS1_PATH["/project-a/.chainglass/data/agents/session-1/events.ndjson"]
        WS1_EVENTS["Event 1, Event 2"]
    end
    
    subgraph WS2["Workspace B (worktreePath: /project-b)"]
        WS2_PATH["/project-b/.chainglass/data/agents/session-1/events.ndjson"]
        WS2_EVENTS["Event 3, Event 4"]
    end
    
    WS1_PATH --> WS1_EVENTS
    WS2_PATH --> WS2_EVENTS
    
    WS1_EVENTS -.-|"ISOLATION: No leakage"| WS2_EVENTS
```

### Test Plan (Full TDD, Fakes Only)

| Test File | Test Cases | Fixture/Setup | Expected Output |
|-----------|------------|---------------|-----------------|
| `agent-event-adapter.test.ts` | workspace-scoped paths, NDJSON format, event ID generation, session validation, malformed line skip | FakeFileSystem, createMockWorkspaceContext | Adapter delegates correctly |
| `workspace-agent-isolation.test.ts` | events isolated by workspace, same sessionId different workspaces | Two WorkspaceContexts, real filesystem | No cross-workspace leakage |
| `sse-workspace-integration.test.ts` | append triggers SSE broadcast, client receives | Real adapter + SSE endpoint | SSE still works |

**Test Fixtures**:
```typescript
const TEST_EVENT_1: AgentStoredEvent = {
  type: 'tool_call',
  timestamp: '2026-01-28T10:00:00.000Z',
  data: { toolName: 'Bash', input: { command: 'ls' }, toolCallId: 'toolu_123' },
};

const TEST_EVENT_2: AgentStoredEvent = {
  type: 'result',
  timestamp: '2026-01-28T10:00:01.000Z',
  data: { success: true, output: 'file.txt\n' },
};

const CTX_WS1 = createMockWorkspaceContext({
  worktreePath: '/project-a',
  workspaceSlug: 'ws-a',
});

const CTX_WS2 = createMockWorkspaceContext({
  worktreePath: '/project-b',
  workspaceSlug: 'ws-b',
});
```

### Step-by-Step Implementation Outline

1. **T001**: Create IAgentEventAdapter interface following IEventStorage pattern + WorkspaceContext
2. **T002**: Write failing unit tests for AgentEventAdapter (RED)
3. **T003**: Implement AgentEventAdapter wrapping EventStorageService (GREEN)
4. **T004**: Write workspace isolation integration tests
5. **T005**: Verify event ID generation tests match DYK-01 format
6. **T006**: Write session ID validation tests
7. **T007**: Create server-only export entry point
8. **T008**: Write NDJSON malformed line handling tests
9. **T009**: Add optional logging to malformed line skipping
10. **T010**: Implement FakeAgentEventAdapter with three-part API
11. **T011**: Register adapters in DI container
12. **T012**: Verify SSE integration regression test passes
13. **T013**: Final verification - all tests pass

### Commands to Run

```bash
# Environment setup
cd /home/jak/substrate/015-better-agents
pnpm install

# Run tests during development (watch mode)
pnpm test packages/workflow --watch

# Run specific test file
pnpm test test/unit/workflow/agent-event-adapter.test.ts

# Type checking
pnpm typecheck

# Linting + formatting
just fft

# Final verification
pnpm test packages/workflow packages/shared
```

### Risks/Unknowns

| Risk | Severity | Mitigation |
|------|----------|------------|
| EventStorageService API changes needed | Medium | Wrap, don't modify - adapter delegates to existing service |
| Server-only export breaks existing imports | Medium | Verify apps/web imports work before/after change |
| SSE broadcast path mismatch | Medium | Integration test T012 verifies end-to-end |
| Workspace path resolution edge cases | Low | Reuse getDomainPath from base class (tested in Phase 1) |

### Ready Check

- [ ] ADR constraints mapped to tasks (ADR-0008 storage path → T003, T004)
- [ ] Critical findings mapped to tasks (7 findings addressed)
- [ ] Phase 1 review completed (deliverables, patterns, dependencies documented)
- [ ] IEventStorage interface reviewed (pattern to follow)
- [ ] EventStorageService implementation reviewed (wrap without modification)
- [ ] FakeAgentSessionAdapter pattern reviewed (three-part API)
- [ ] validateSessionId() function location verified

---

## Phase Footnote Stubs

| Footnote | Task | Description | Date Added |
|----------|------|-------------|------------|
| | | _Populated by plan-6 during implementation_ | |

---

## Evidence Artifacts

**Execution Log**: `execution.log.md` (created by plan-6 in this directory)

**Supporting Files** (created during implementation):
- Unit test output showing TDD RED-GREEN cycle
- Integration test output showing workspace isolation
- SSE integration test results

---

## Discoveries & Learnings

_Populated during implementation by plan-6. Log anything of interest to your future self._

| Date | Task | Type | Discovery | Resolution | References |
|------|------|------|-----------|------------|------------|
| | | | | | |

**Types**: `gotcha` | `research-needed` | `unexpected-behavior` | `workaround` | `decision` | `debt` | `insight`

**What to log**:
- Things that didn't work as expected
- External research that was required
- Implementation troubles and how they were resolved
- Gotchas and edge cases discovered
- Decisions made during implementation
- Technical debt introduced (and why)
- Insights that future phases should know about

_See also: `execution.log.md` for detailed narrative._

---

## Directory Layout

```
docs/plans/018-agents-workspace-data-model/
├── agents-workspace-data-model-spec.md
├── agents-workspace-data-model-plan.md
└── tasks/
    ├── phase-1-agentsession-entity/
    │   ├── tasks.md              # Phase 1 complete
    │   └── execution.log.md      # Phase 1 execution log
    └── phase-2-agenteventadapter/
        ├── tasks.md              # ← This file
        └── execution.log.md      # ← Created by plan-6 during implementation
```

---

**STOP**: Do **not** edit code. Await explicit **GO** from human sponsor.
