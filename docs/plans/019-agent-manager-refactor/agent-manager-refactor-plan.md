# Agent Manager Refactor Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-01-28
**Spec**: [./agent-manager-refactor-spec.md](./agent-manager-refactor-spec.md)
**Status**: DRAFT
**File Management**: PlanPak

---

## File Placement

Per PlanPak, plan-scoped files live in feature folders:

| Package | Feature Folder |
|---------|---------------|
| `packages/shared` | `packages/shared/src/features/019-agent-manager-refactor/` |
| `apps/web` | `apps/web/src/features/019-agent-manager-refactor/` |

Cross-cutting files (DI registration, tokens) stay in their traditional locations.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Critical Research Findings](#critical-research-findings)
4. [Testing Philosophy](#testing-philosophy)
5. [ADR Ledger](#adr-ledger)
6. [Implementation Phases](#implementation-phases)
   - [Phase 1: AgentManagerService + AgentInstance Core](#phase-1-agentmanagerservice--agentinstance-core)
   - [Phase 2: AgentNotifierService (SSE Broadcast)](#phase-2-agentnotifierservice-sse-broadcast)
   - [Phase 3: Storage Layer](#phase-3-storage-layer)
   - [Phase 4: Web Integration](#phase-4-web-integration)
   - [Phase 5: Consolidation + Cleanup](#phase-5-consolidation--cleanup)
7. [Cross-Cutting Concerns](#cross-cutting-concerns)
8. [Complexity Tracking](#complexity-tracking)
9. [Progress Tracking](#progress-tracking)
10. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

**Problem**: The current agent system is flakey due to fragmented state management across 5+ locations (AgentService._activeSessions, AgentSessionAdapter, AgentEventAdapter, AgentSessionStore localStorage, useAgentSession React state). There is no central registry of running agents, making it impossible to list all agents across workspaces or show agent status at a glance.

**Solution Approach**:
- Create **AgentManagerService** as central authority for creating/tracking all agents
- Create **AgentInstance** to encapsulate agent state (id, name, type, workspace, status, intent, sessionId)
- Create **AgentNotifierService** for single SSE stream broadcasting all agent events
- Store agent data at `~/.config/chainglass/agents/` for cross-workspace visibility
- **Preserve existing adapters** (IAgentAdapter, ClaudeCodeAdapter, SdkCopilotAdapter) - they work well

**Expected Outcomes**:
- Single source of truth for all agent state
- CLI can list agents, get events, run prompts headlessly
- Web UI can rehydrate conversation history on page refresh
- Menu items can show agent status at a glance
- Foundation for parallel agents in workflows

**Success Metrics**:
- All 31 acceptance criteria from spec pass
- Contract tests verify Fake/Real parity for all new services
- No modifications to IAgentAdapter or existing adapter implementations
- Zero regressions in existing 2,415+ passing tests

---

## Technical Context

### Current System State

```
┌─────────────────────────────────────────────────────────────────┐
│                    CURRENT AGENT SYSTEM (Fragmented)            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  STATE FRAGMENTATION (5+ locations):                           │
│  ┌──────────────────────────────────────────────────────┐      │
│  │ 1. AgentService._activeSessions (in-memory Map)       │      │
│  │ 2. AgentSessionAdapter (JSON files in worktree)       │      │
│  │ 3. AgentEventAdapter (NDJSON in worktree)             │      │
│  │ 4. AgentSessionStore (localStorage)                   │      │
│  │ 5. useAgentSession (React state)                      │      │
│  └──────────────────────────────────────────────────────┘      │
│                                                                 │
│  🚨 PROBLEM: No central registry of running agents!            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Integration Requirements

| Integration Point | Type | Current State | Action |
|------------------|------|---------------|--------|
| IAgentAdapter | Interface | Stable, well-tested | **Preserve** |
| ClaudeCodeAdapter | Adapter | 561 lines, mature | **No changes** |
| SdkCopilotAdapter | Adapter | 472 lines, mature | **No changes** |
| AdapterFactory | Factory | DI-registered function | Reuse via AgentInstance |
| AgentService | Orchestrator | Stateless, timeout handling | Wrap in AgentInstance |
| SSEManager | Singleton | Channel-based broadcast | Extend with 'agents' channel |

### Constraints and Limitations

1. **Decorator-free DI**: RSC compatibility requires `useFactory` pattern, no `@injectable`
2. **Storage Location**: `~/.config/chainglass/agents/` per-machine (not shareable)
3. **Event ID Format**: Timestamp-based (`YYYY-MM-DDTHH:mm:ss.sssZ_xxxxx`) must be preserved
4. **Path Security**: All session/agent IDs must be validated for path traversal (PL-09)
5. **Storage-First**: Persist to disk BEFORE SSE broadcast (PL-01)

### Assumptions

1. Existing IAgentAdapter implementations remain stable
2. `~/.config/chainglass/agents/` is acceptable for cross-workspace storage
3. Agent sessions are inherently per-machine (CLI auth, process handles)
4. Single SSE endpoint is sufficient (no need for per-agent streams)
5. Team committed to ruthless cleanup - no "keep it just in case"

---

## Critical Research Findings

### 🚨 Critical Findings

| # | Sources | Finding | Action | Affects Phases |
|---|---------|---------|--------|----------------|
| 01 | I1-01, CD-01 | No central agent registry exists - only AgentService._activeSessions for termination | Create AgentManagerService with Map<agentId, AgentInstance> | Phase 1 |
| 02 | I1-06, CD-02 | Session state fragmented across 5+ locations | AgentInstance becomes single source of truth | Phase 1 |
| 03 | R1-05, PL-09 | Path traversal risk - session ID validation not unified | Centralize validation in shared package | Phase 1, 3 |
| 04 | R1-02 | Race condition in _activeSessions cleanup during concurrent runs | Double-run guard (AC-07a) with status check | Phase 1 |
| 05 | PL-01 | Storage-first pattern required - persist before SSE broadcast | AgentNotifier persists THEN broadcasts | Phase 2, 3 |

### ⚠️ High Impact Findings

| # | Sources | Finding | Action | Affects Phases |
|---|---------|---------|--------|----------------|
| 06 | I1-02 | Dual-layer testing pattern proven (FakeAgentAdapter + contract tests) | Reuse pattern for all new services | Phase 1-4 |
| 07 | I1-03 | DI container ready for new services via factory pattern | Add DI_TOKENS for AgentManagerService, AgentNotifierService | Phase 1 |
| 08 | I1-04 | SSEManager supports channel-based broadcasting | Add 'agents' channel for AgentNotifierService | Phase 2 |
| 09 | R1-01 | Dual storage during migration risks divergence | Clear migration path in Phase 5 | Phase 5 |
| 10 | R1-03 | Event ID ordering under high concurrency | Use atomic counter per session | Phase 3 |

### Medium Impact Findings

| # | Sources | Finding | Action | Affects Phases |
|---|---------|---------|--------|----------------|
| 11 | I1-05, PL-15 | Workspace-scoped storage pattern exists | New registry at `~/.config/chainglass/agents/` | Phase 3 |
| 12 | I1-07 | Plan 018 event storage foundation complete | Reuse AgentEventAdapter, extend don't replace | Phase 3 |
| 13 | R1-04 | Session directory deletion race | Use atomic rename pattern for deletion | Phase 5 |
| 14 | R1-06 | localStorage quota overflow silently fails | Server-side storage primary in Phase 4 | Phase 4 |
| 15 | R1-07 | Missing cascade delete for events when session deleted | AgentManagerService coordinates deletion | Phase 5 |

---

## Testing Philosophy

### Testing Approach

**Selected Approach**: Full TDD (per constitution Principle 3)
**Mock Usage**: Fakes over mocks (per constitution Principle 4)
**Rationale**: Goal 8 in spec states "Fully TDD: All new code testable with fakes, no real adapters needed for unit tests"

### Test-Driven Development

Follow RED-GREEN-REFACTOR cycle for all implementation work:
- **RED**: Write test first, verify it fails
- **GREEN**: Implement minimal code to pass test
- **REFACTOR**: Improve code quality while keeping tests green

### Quality Gate Commands

All phases must pass these quality gates before completion:

```bash
# Run all tests (unit + contract + integration)
just test

# TypeScript strict mode compilation
just typecheck

# Biome linter
just lint

# Build all packages
just build

# Quick check (fix, format, test) - use before commits
just fft

# Full quality check
just check
```

**Per-Phase Test Commands**:
```bash
# Run specific contract tests
pnpm -F @chainglass/shared test -- --grep "AgentManagerService"

# Run integration tests only
pnpm test -- --grep "integration"

# Run tests with coverage
pnpm test -- --coverage
```

### Fake Implementations

Every new interface requires a corresponding Fake:
- **FakeAgentManagerService**: State setup (addAgent), call inspection (getCreatedAgents), error injection
- **FakeAgentInstance**: Configurable events, status control, call tracking
- **FakeAgentNotifierService**: Broadcast tracking, connection simulation

### Contract Tests for Interface Compliance

All interface implementations (fakes AND adapters) pass shared contract tests:

```typescript
export function agentManagerServiceContractTests(
  name: string, 
  createService: () => IAgentManagerService
) {
  describe(`${name} implements IAgentManagerService contract`, () => {
    it('should create agent with required properties (AC-01)', () => {
      /*
      Test Doc:
      - Why: Verify central authority can create agents
      - Contract: createAgent returns AgentInstance with id, name, type, workspace
      - Usage Notes: Use factory-created service from DI container
      - Quality Contribution: Prevents missing required properties
      - Worked Example: createAgent({name: 'test', type: 'claude-code', workspace: '/path'})
      */
      const service = createService();
      const agent = service.createAgent({ name: 'test', type: 'claude-code', workspace: '/path' });
      expect(agent.id).toBeDefined();
      expect(agent.name).toBe('test');
      expect(agent.type).toBe('claude-code');
    });
  });
}

// Run for BOTH implementations
agentManagerServiceContractTests('FakeAgentManagerService', () => new FakeAgentManagerService());
agentManagerServiceContractTests('AgentManagerService', () => container.resolve(DI_TOKENS.AGENT_MANAGER_SERVICE));
```

### Test Documentation Format

Every test includes 5-field Test Doc comment per constitution § 3.2.

---

## ADR Ledger

| ADR | Status | Affects Phases | Notes |
|-----|--------|----------------|-------|
| ADR-0007 | Accepted | Phase 2 | Single SSE channel with client-side routing - aligns with AgentNotifierService design |
| ADR-0008 | Accepted | Phase 3, 5 | Workspace split storage - informs `~/.config/chainglass/agents/` location vs per-worktree |
| ADR-0004 | Accepted | Phase 1-4 | DI container architecture - use `useFactory` pattern for new services |

**ADR Recommendation**: Consider ADR for "Cross-Workspace Agent Registry Storage" if team needs formal record of `~/.config/chainglass/agents/` decision.

---

## Implementation Phases

### Phase 1: AgentManagerService + AgentInstance Core

**Objective**: Create foundational headless agent management with full TDD, enabling CLI usage and establishing single source of truth.

**Deliverables**:
- IAgentManagerService interface
- AgentManagerService implementation
- FakeAgentManagerService test double
- IAgentInstance interface
- AgentInstance class wrapping IAgentAdapter
- FakeAgentInstance test double
- DI registration for new services
- Contract tests for all interfaces

**Dependencies**: None (foundational phase)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Double-run race condition (R1-02) | High | High | Status guard check before adapter.run() |
| Adapter factory integration | Low | Medium | Reuse existing AdapterFactory pattern |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 1.1 | [ ] | Define IAgentManagerService interface | 2 | Interface exports: createAgent, getAgents, getAgent; types for CreateAgentParams, AgentFilter | - | packages/shared/src/interfaces/agent-manager.interface.ts |
| 1.2 | [ ] | Define IAgentInstance interface | 2 | Interface exports: run, terminate, getEvents; properties: id, name, type, workspace, status, intent, sessionId | - | packages/shared/src/interfaces/agent-instance.interface.ts |
| 1.3 | [ ] | Write FakeAgentManagerService with test helpers | 2 | Fake implements IAgentManagerService; has: addAgent(), getCreatedAgents(), setError() | - | packages/shared/src/fakes/fake-agent-manager.service.ts |
| 1.4 | [ ] | Write FakeAgentInstance with test helpers | 2 | Fake implements IAgentInstance; has: setStatus(), setEvents(), assertRunCalled() | - | packages/shared/src/fakes/fake-agent-instance.ts |
| 1.5 | [ ] | Write contract tests for IAgentManagerService | 2 | Tests cover: AC-01, AC-02, AC-03, AC-04; run against Fake first | - | test/contracts/agent-manager.contract.ts |
| 1.6 | [ ] | Write contract tests for IAgentInstance | 2 | Tests cover: AC-06, AC-07, AC-07a (double-run guard), AC-11; run against Fake first | - | test/contracts/agent-instance.contract.ts |
| 1.7 | [ ] | Implement AgentManagerService to pass contracts | 3 | All contract tests pass; uses in-memory Map<agentId, AgentInstance> | - | packages/shared/src/services/agent-manager.service.ts |
| 1.8 | [ ] | Implement AgentInstance to pass contracts | 3 | All contract tests pass; wraps IAgentAdapter; status guard prevents double-run | - | packages/shared/src/services/agent-instance.ts |
| 1.9 | [ ] | Add path validation for agent IDs (security) | 2 | validateAgentId rejects: `..`, `/`, `\`, whitespace; called in all methods (R1-05) | - | packages/shared/src/utils/validate-agent-id.ts |
| 1.10 | [ ] | Register services in DI container | 2 | Add DI_TOKENS.AGENT_MANAGER_SERVICE; factory registration in di-container.ts | - | apps/web/src/lib/di-container.ts |
| 1.11 | [ ] | Integration test: AgentInstance uses real FakeAgentAdapter | 2 | Verify run() delegates to adapter; events captured; status transitions | - | test/integration/agent-instance.integration.test.ts |

### Test Examples (Write First!)

```typescript
// test/contracts/agent-manager.contract.ts
export function agentManagerServiceContractTests(
  name: string,
  createService: () => IAgentManagerService
) {
  describe(`${name} implements IAgentManagerService contract`, () => {
    let service: IAgentManagerService;

    beforeEach(() => {
      service = createService();
    });

    test('AC-01: should create agent with required properties', () => {
      /*
      Test Doc:
      - Why: Central authority must create agents with all required fields
      - Contract: createAgent({name, type, workspace}) returns AgentInstance with unique id
      - Usage Notes: workspace should be absolute path or slug
      - Quality Contribution: Prevents agents without identity
      - Worked Example: createAgent({name:'chat', type:'claude-code', workspace:'/project'}) → {id:'xyz', name:'chat', ...}
      */
      const agent = service.createAgent({
        name: 'test-agent',
        type: 'claude-code',
        workspace: '/path/to/workspace'
      });

      expect(agent.id).toBeDefined();
      expect(agent.id.length).toBeGreaterThan(0);
      expect(agent.name).toBe('test-agent');
      expect(agent.type).toBe('claude-code');
      expect(agent.workspace).toBe('/path/to/workspace');
      expect(agent.status).toBe('stopped');
    });

    test('AC-02: should list all agents regardless of workspace', () => {
      /*
      Test Doc:
      - Why: Manager must provide global view of all agents
      - Contract: getAgents() returns all agents across all workspaces
      - Usage Notes: Returns empty array if no agents exist
      - Quality Contribution: Enables cross-workspace agent discovery
      - Worked Example: After creating 3 agents, getAgents().length === 3
      */
      service.createAgent({ name: 'a1', type: 'claude-code', workspace: '/ws1' });
      service.createAgent({ name: 'a2', type: 'copilot', workspace: '/ws2' });

      const agents = service.getAgents();

      expect(agents).toHaveLength(2);
      expect(agents.map(a => a.name)).toContain('a1');
      expect(agents.map(a => a.name)).toContain('a2');
    });

    test('AC-07a: should reject double-run when agent is working', async () => {
      /*
      Test Doc:
      - Why: Prevents CLI/web collision when both try to run same agent
      - Contract: run() on 'working' agent throws without invoking adapter
      - Usage Notes: Simple status check, not distributed lock
      - Quality Contribution: Prevents race conditions and duplicate prompts
      - Worked Example: agent.status='working' → agent.run({prompt}) throws 'agent already running'
      */
      const agent = service.createAgent({ name: 'test', type: 'claude-code', workspace: '/ws' });
      // Simulate agent already working
      (agent as any)._status = 'working'; // Or use setStatus on Fake

      await expect(agent.run({ prompt: 'test' })).rejects.toThrow('agent already running');
    });
  });
}
```

### Non-Happy-Path Coverage
- [ ] Invalid agent ID format rejected (path traversal)
- [ ] Agent not found returns null, not exception
- [ ] Double-run on 'working' agent rejected
- [ ] Adapter failure sets status to 'error'

### Acceptance Criteria
- [ ] AC-01, AC-02, AC-03, AC-04 verified via contract tests
- [ ] AC-06, AC-07, AC-07a, AC-11 verified via contract tests
- [ ] AC-26, AC-27 verified (Fakes have required test helpers)
- [ ] AC-29 verified (contract tests pass for both Fake and Real)
- [ ] No mocks used (constitution Principle 4)
- [ ] Test Doc format used in all tests

---

### Phase 2: AgentNotifierService (SSE Broadcast)

**Objective**: Create single SSE endpoint that broadcasts all agent events with client-side filtering.

**Deliverables**:
- IAgentNotifierService interface
- AgentNotifierService implementation
- FakeAgentNotifierService test double
- /api/agents/events SSE route
- Contract tests

**Dependencies**: Phase 1 must be complete (AgentInstance emits events)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| SSE connection drops | Medium | Low | Notification-fetch pattern (PL-10); sinceId for catch-up |
| Event ordering under concurrency | Medium | High | Events include timestamp; client sorts if needed |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 2.1 | [ ] | Define IAgentNotifierService interface | 2 | Interface exports: subscribe, broadcast, getConnections | - | packages/shared/src/interfaces/agent-notifier.interface.ts |
| 2.2 | [ ] | Write FakeAgentNotifierService with test helpers | 2 | Fake has: getBroadcasts(), simulateConnection(), simulateDisconnect() | - | packages/shared/src/fakes/fake-agent-notifier.service.ts |
| 2.3 | [ ] | Write contract tests for IAgentNotifierService | 2 | Tests cover: AC-13, AC-14, AC-15, AC-16, AC-17 | - | test/contracts/agent-notifier.contract.ts |
| 2.4 | [ ] | Implement AgentNotifierService to pass contracts | 3 | Uses SSEManager with 'agents' channel; broadcasts include agentId | - | packages/shared/src/services/agent-notifier.service.ts |
| 2.5 | [ ] | Create /api/agents/events SSE route | 2 | Returns ReadableStream; uses sseManager.subscribe('agents') | - | apps/web/app/api/agents/events/route.ts |
| 2.6 | [ ] | Wire AgentInstance events to AgentNotifierService | 2 | AgentInstance.onEvent() calls notifier.broadcast() | - | Integration in agent-instance.ts |
| 2.7 | [ ] | Integration test: SSE receives agent events | 3 | Start agent, verify SSE stream receives status/intent/text events | - | test/integration/agent-notifier.integration.test.ts |

### Test Examples (Write First!)

```typescript
// test/contracts/agent-notifier.contract.ts
export function agentNotifierServiceContractTests(
  name: string,
  createService: () => IAgentNotifierService
) {
  describe(`${name} implements IAgentNotifierService contract`, () => {
    test('AC-14: events should include agentId for filtering', () => {
      /*
      Test Doc:
      - Why: Clients filter events by agentId on single SSE stream
      - Contract: broadcast(event) includes agentId in payload
      - Usage Notes: Client receives all events, filters locally
      - Quality Contribution: Enables multi-agent UIs without multiple connections
      - Worked Example: broadcast({type:'status', agentId:'123', status:'working'})
      */
      const service = createService();
      const broadcasts: AgentSSEEvent[] = [];
      service.subscribe('agents', (event) => broadcasts.push(event));

      service.broadcast({ type: 'agent_status', agentId: 'agent-123', status: 'working' });

      expect(broadcasts).toHaveLength(1);
      expect(broadcasts[0].agentId).toBe('agent-123');
    });

    test('AC-17: should follow storage-first pattern (PL-01)', () => {
      /*
      Test Doc:
      - Why: SSE is hint, not truth - storage must be updated first
      - Contract: broadcast() only called after event persisted
      - Usage Notes: Integration test verifies timing via call order
      - Quality Contribution: Prevents lost events if SSE fails
      - Worked Example: storage.append() → notifier.broadcast() (never reversed)
      */
      // This is verified via integration test with call order assertions
    });
  });
}
```

### Non-Happy-Path Coverage
- [ ] SSE reconnection after disconnect (AC-18)
- [ ] Invalid agentId in broadcast rejected
- [ ] Broadcast continues if one client disconnects

### Acceptance Criteria
- [ ] AC-13, AC-14, AC-15, AC-16, AC-17, AC-18 verified
- [ ] AC-28 verified (FakeAgentNotifierService has required helpers)
- [ ] Single SSE endpoint working at /api/agents/events
- [ ] Storage-first pattern verified (per PL-01)
- [ ] ADR-0007 constraints respected (single channel routing)

---

### Phase 3: Storage Layer

**Objective**: Implement persistent storage at `~/.config/chainglass/agents/` for agent registry and instance metadata.

**Deliverables**:
- IAgentRegistryAdapter interface
- AgentRegistryAdapter implementation (JSON at ~/.config/chainglass/agents/registry.json)
- AgentInstance metadata storage (JSON per agent)
- Event storage integration (NDJSON per agent)
- Contract tests

**Dependencies**: Phase 1 complete; can run parallel to Phase 2

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Event ID ordering under concurrency (R1-03) | Medium | High | Use monotonic counter per agent |
| Directory deletion race (R1-04) | Medium | High | Atomic rename pattern for deletion |
| Cross-machine conflicts (R1-08) | Medium | Medium | File locking hints; clear ownership model |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 3.1 | [ ] | Define IAgentRegistryAdapter interface | 2 | Interface exports: register, unregister, list, get | - | packages/workflow/src/interfaces/agent-registry.interface.ts |
| 3.2 | [ ] | Write FakeAgentRegistryAdapter with test helpers | 2 | Fake has: setAgents(), getRegistered(), setError() | - | packages/workflow/src/fakes/fake-agent-registry.adapter.ts |
| 3.3 | [ ] | Write contract tests for IAgentRegistryAdapter | 2 | Tests cover: AC-19, AC-20 | - | test/contracts/agent-registry.contract.ts |
| 3.4 | [ ] | Implement AgentRegistryAdapter | 3 | Stores at ~/.config/chainglass/agents/registry.json; survives restart (AC-05) | - | packages/workflow/src/adapters/agent-registry.adapter.ts |
| 3.5 | [ ] | Extend AgentInstance with metadata persistence | 2 | Stores at ~/.config/chainglass/agents/<id>/instance.json (AC-22) | - | Extend agent-instance.ts |
| 3.6 | [ ] | Integrate with existing AgentEventAdapter for events | 2 | Events at ~/.config/chainglass/agents/<id>/events.ndjson (AC-21) | - | Reuse event storage pattern |
| 3.7 | [ ] | Implement event ID counter for ordering (R1-03 mitigation) | 2 | Monotonic counter per agent prevents collision | - | packages/shared/src/utils/event-id-generator.ts |
| 3.8 | [ ] | Add path traversal validation for all storage ops | 2 | All paths validated before filesystem access (PL-09) | - | Extend validate-agent-id.ts |
| 3.9 | [ ] | Integration test: storage survives restart (AC-05) | 2 | Create agent, "restart" (recreate manager), agent restored with status='stopped' | - | test/integration/agent-persistence.test.ts |

### Test Examples (Write First!)

```typescript
// test/contracts/agent-registry.contract.ts
export function agentRegistryAdapterContractTests(
  name: string,
  createAdapter: () => IAgentRegistryAdapter
) {
  describe(`${name} implements IAgentRegistryAdapter contract`, () => {
    test('AC-20: registry should track all agents with workspace refs', () => {
      /*
      Test Doc:
      - Why: Cross-workspace visibility requires central registry
      - Contract: list() returns all agents with workspace references
      - Usage Notes: Registry is at ~/.config/chainglass/agents/registry.json
      - Quality Contribution: Enables CLI listing across all projects
      - Worked Example: register({id:'a1', workspace:'/ws1'}) → list() includes {id:'a1', workspace:'/ws1'}
      */
      const adapter = createAdapter();
      
      adapter.register({ id: 'agent-1', name: 'test', type: 'claude-code', workspace: '/workspace1' });
      adapter.register({ id: 'agent-2', name: 'other', type: 'copilot', workspace: '/workspace2' });

      const agents = adapter.list();

      expect(agents).toHaveLength(2);
      expect(agents.find(a => a.id === 'agent-1')?.workspace).toBe('/workspace1');
    });
  });
}
```

### Non-Happy-Path Coverage
- [ ] Registry directory doesn't exist (create on first write)
- [ ] Corrupted registry.json (recover gracefully)
- [ ] Concurrent writes (file locking or atomic write)
- [ ] Path traversal in agent ID rejected

### Acceptance Criteria
- [ ] AC-05, AC-19, AC-20, AC-21, AC-22 verified
- [ ] Storage at ~/.config/chainglass/agents/ confirmed
- [ ] Event ID collision prevention working
- [ ] Path validation comprehensive (no traversal possible)
- [ ] ADR-0008 constraints respected (split storage model)

---

### Phase 4: Web Integration

**Objective**: Integrate AgentManagerService with web API routes and React hooks for basic validation.

**Deliverables**:
- API routes for agent CRUD operations
- React hook for agent list/subscription
- Basic UI integration (list agents, show status)
- CLI commands for agent management

**Dependencies**: Phases 1, 2, 3 complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| localStorage quota overflow (R1-06) | Medium | Medium | Server-side storage primary |
| Hidden UI dependencies | Medium | Medium | Incremental rollout with feature flag |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 4.1 | [ ] | Create GET /api/agents route | 2 | Returns all agents via AgentManagerService.getAgents() | - | apps/web/app/api/agents/route.ts |
| 4.2 | [ ] | Create GET /api/agents/[id] route | 2 | Returns single agent with events via getAgent(), getEvents() | - | apps/web/app/api/agents/[id]/route.ts |
| 4.3 | [ ] | Create POST /api/agents route | 2 | Creates agent via createAgent() | - | apps/web/app/api/agents/route.ts |
| 4.4 | [ ] | Create POST /api/agents/[id]/run route | 3 | Runs prompt via agent.run(); handles double-run error | - | apps/web/app/api/agents/[id]/run/route.ts |
| 4.5 | [ ] | Create useAgentManager hook | 3 | React Query hook for agent list, SSE subscription, rehydration (AC-05a-d) | - | apps/web/src/hooks/useAgentManager.ts |
| 4.6 | [ ] | Create useAgentInstance hook | 2 | Hook for single agent: status, intent, events, run() | - | apps/web/src/hooks/useAgentInstance.ts |
| 4.7 | [ ] | Integration test: API routes end-to-end | 3 | Create agent, run prompt, verify events via SSE | - | test/integration/agent-api.integration.test.ts |
| 4.8 | [ ] | CLI integration: cg agent list | 2 | Lists all agents via AgentManagerService | - | apps/cli/src/commands/agent-list.command.ts |
| 4.9 | [ ] | CLI integration: cg agent run | 2 | Runs prompt on existing agent | - | apps/cli/src/commands/agent-run.command.ts |

### Test Examples (Write First!)

```typescript
// test/integration/agent-api.integration.test.ts
describe('Agent API Integration', () => {
  test('AC-05a: CLI can list all agents via AgentManagerService', async () => {
    /*
    Test Doc:
    - Why: CLI must access same agents as web for headless operation
    - Contract: GET /api/agents returns all agents regardless of workspace
    - Usage Notes: Filter by workspace via query param
    - Quality Contribution: Enables scripting and automation
    - Worked Example: GET /api/agents → [{id:'1', name:'chat', workspace:'/ws1'}, ...]
    */
    // Create agents via API
    await fetch('/api/agents', {
      method: 'POST',
      body: JSON.stringify({ name: 'agent1', type: 'claude-code', workspace: '/ws1' })
    });
    await fetch('/api/agents', {
      method: 'POST',
      body: JSON.stringify({ name: 'agent2', type: 'copilot', workspace: '/ws2' })
    });

    // List via API (simulating CLI)
    const response = await fetch('/api/agents');
    const agents = await response.json();

    expect(agents).toHaveLength(2);
    expect(agents.map(a => a.name)).toContain('agent1');
    expect(agents.map(a => a.name)).toContain('agent2');
  });
});
```

### Non-Happy-Path Coverage
- [ ] API returns 404 for unknown agent ID
- [ ] Double-run returns 409 Conflict
- [ ] SSE reconnection works after page refresh (AC-18)
- [ ] Unauthorized requests rejected (if auth required)

### Acceptance Criteria
- [ ] AC-05a, AC-05b, AC-05c, AC-05d verified (CLI usage)
- [ ] Web hooks functional for agent management
- [ ] SSE subscription working in browser
- [ ] Server-side storage primary (localStorage secondary)
- [ ] No regressions in existing web agent UI

---

### Phase 5: Consolidation + Cleanup

**Objective**: Evaluate AgentSession for consolidation, delete deprecated code, remove duplicate concepts.

**Deliverables**:
- AgentSession consolidated or replaced
- Deprecated code paths deleted
- Tests for deleted code removed
- Clean imports/exports

**Dependencies**: Phase 4 complete and validated

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| AgentSession consumers break | Medium | High | Map all consumers before deletion |
| Hidden dependencies discovered | Medium | Medium | Full codebase grep before cleanup |

### Tasks (Cleanup with Verification)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 5.1 | [ ] | Audit AgentSession consumers | 2 | Complete list of imports/usages of AgentSession entity | - | Grep packages/workflow, apps/web |
| 5.2 | [ ] | Evaluate consolidation strategy | 2 | Decision: replace with AgentInstance OR make thin wrapper | - | Document in execution log |
| 5.3 | [ ] | Migrate AgentSession consumers to AgentInstance | 3 | All consumers use new API; no direct AgentSession imports | - | Per AC-30 |
| 5.4 | [ ] | Delete AgentSession entity and related code | 2 | File deleted; tests deleted; no orphaned imports | - | Per AC-31 |
| 5.5 | [ ] | Delete deprecated session storage paths | 2 | Old .chainglass/workspaces/default/data/ references removed | - | Plan 018 cleanup |
| 5.6 | [ ] | Delete duplicate localStorage session code | 2 | AgentSessionStore marked deprecated or deleted | - | Evaluate if still needed |
| 5.7 | [ ] | Final grep for orphaned code | 1 | No orphaned imports, exports, or dead code paths | - | Verification |
| 5.8 | [ ] | Update documentation | 2 | README, docs/how updated to reflect new architecture | - | - |

### Test Examples (Cleanup Verification)

```typescript
// test/integration/cleanup-verification.test.ts
describe('Phase 5: Cleanup Verification', () => {
  test('AC-30: no AgentSession imports remain in active code', async () => {
    /*
    Test Doc:
    - Why: Deprecated AgentSession must be fully removed, not left behind
    - Contract: Zero imports of AgentSession in packages/shared, packages/workflow, apps/web
    - Usage Notes: Run after Task 5.4 completes; excludes test fixtures
    - Quality Contribution: Prevents accidental use of deprecated entity
    - Worked Example: grep -r "from.*agent-session" → 0 matches (excluding .test.ts fixtures)
    */
    const { execSync } = await import('child_process');
    
    // Search for AgentSession imports (excluding test fixtures and node_modules)
    const result = execSync(
      'grep -r "from.*agent-session" packages/ apps/ --include="*.ts" | grep -v ".test.ts" | grep -v "node_modules" || true',
      { encoding: 'utf-8' }
    );
    
    expect(result.trim()).toBe(''); // No matches expected
  });

  test('AC-31: no orphaned exports in index files', async () => {
    /*
    Test Doc:
    - Why: Deleted modules must not leave dangling exports
    - Contract: All exports in index.ts files resolve to existing files
    - Usage Notes: Run TypeScript compiler to verify exports
    - Quality Contribution: Prevents "module not found" runtime errors
    - Worked Example: just typecheck → 0 errors related to missing exports
    */
    const { execSync } = await import('child_process');
    
    // TypeScript will fail on missing exports
    expect(() => {
      execSync('just typecheck', { encoding: 'utf-8', stdio: 'pipe' });
    }).not.toThrow();
  });

  test('should have single agent concept (AgentInstance wins)', () => {
    /*
    Test Doc:
    - Why: Ruthless cleanup principle - one concept wins, duplicates die
    - Contract: Only AgentInstance exists; AgentSession is gone
    - Usage Notes: Verify file system and imports
    - Quality Contribution: Prevents confusion from duplicate concepts
    - Worked Example: ls packages/workflow/src/entities/ → no agent-session.ts
    */
    const fs = require('fs');
    const path = require('path');
    
    // AgentSession file should not exist
    const agentSessionPath = path.join(
      process.cwd(), 
      'packages/workflow/src/entities/agent-session.ts'
    );
    expect(fs.existsSync(agentSessionPath)).toBe(false);
    
    // AgentInstance should exist
    const agentInstancePath = path.join(
      process.cwd(),
      'packages/shared/src/services/agent-instance.ts'
    );
    expect(fs.existsSync(agentInstancePath)).toBe(true);
  });
});
```

### Non-Happy-Path Coverage
- [ ] Consumers of deleted code fail at compile time (not runtime)
- [ ] Migration tool handles edge cases

### Acceptance Criteria
- [ ] AC-30 verified (deprecated code identified and removed)
- [ ] AC-31 verified (no "just in case" legacy code)
- [ ] No TypeScript compilation errors
- [ ] All 2,415+ tests still pass
- [ ] One concept wins (AgentInstance, not AgentSession + AgentInstance)

---

## Cross-Cutting Concerns

### Security Considerations

**Path Traversal Prevention (PL-09, R1-05)**:
- Centralized `validateAgentId()` function in packages/shared
- Rejects: `..`, `/`, `\`, null bytes, whitespace
- Called at entry point of EVERY method accepting agentId
- Contract tests verify rejection for malicious inputs

**Input Validation**:
- Agent name: alphanumeric + dash/underscore, max 64 chars
- Workspace path: must be absolute, must exist
- Agent type: enum validation ('claude-code' | 'copilot')

### Observability

**Logging Strategy**:
- Use existing ILogger via DI injection
- Log at INFO: agent created, status transitions, run start/complete
- Log at WARN: event storage failures (continue with SSE per PL-01)
- Log at ERROR: adapter failures, path validation rejections

**Metrics to Capture** (future):
- Active agent count
- Run duration per agent type
- SSE connection count

### Documentation

**Documentation Location**: Hybrid (README + docs/how/)

Per spec, documentation created after implementation validates:
1. **README.md**: Getting-started section for agent management
2. **docs/how/agents/**: Detailed guides
   - 1-overview.md - Architecture and concepts
   - 2-usage.md - CLI and API usage
   - 3-troubleshooting.md - Common issues

---

## Complexity Tracking

| Component | CS | Label | Breakdown (S,I,D,N,F,T) | Justification | Mitigation |
|-----------|-----|-------|------------------------|---------------|------------|
| AgentManagerService | 3 | Medium | S=1,I=1,D=1,N=1,F=1,T=1 | New service, moderate integration | TDD with contract tests |
| AgentInstance | 4 | Large | S=2,I=1,D=1,N=1,F=1,T=2 | Wraps adapters, state management, events | Interface-first development |
| AgentNotifierService | 3 | Medium | S=1,I=1,D=1,N=1,F=1,T=1 | SSE integration, follows existing pattern | Reuse SSEManager |
| Storage Layer | 4 | Large | S=2,I=1,D=2,N=1,F=1,T=2 | New storage location, event ordering | Contract tests, atomic operations |
| Phase 5 Cleanup | 3 | Medium | S=1,I=1,D=1,N=1,F=2,T=1 | Risk of breaking consumers | Audit first, delete second |

**Overall Plan Complexity**: CS-4 (Large) - matches spec assessment

---

## Progress Tracking

### Phase Completion Checklist
- [x] Phase 1: AgentManagerService + AgentInstance Core - **COMPLETE** (2026-01-29)
  - Tasks: [tasks/phase-1-agentmanagerservice-agentinstance-core/tasks.md](./tasks/phase-1-agentmanagerservice-agentinstance-core/tasks.md)
  - Execution Log: [tasks/phase-1-agentmanagerservice-agentinstance-core/execution.log.md](./tasks/phase-1-agentmanagerservice-agentinstance-core/execution.log.md)
  - Contract Tests: 44 passed (22 Fake + 22 Real)
  - Integration Tests: 9 passed
- [x] Phase 2: AgentNotifierService (SSE Broadcast) - **COMPLETE** (2026-01-29)
  - Tasks: [tasks/phase-2-agentnotifierservice-sse-broadcast/tasks.md](./tasks/phase-2-agentnotifierservice-sse-broadcast/tasks.md)
  - Execution Log: [tasks/phase-2-agentnotifierservice-sse-broadcast/execution.log.md](./tasks/phase-2-agentnotifierservice-sse-broadcast/execution.log.md)
  - Contract Tests: 40 passed (20 Fake + 20 Real)
  - Integration Tests: 8 passed
  - DYK Decisions Applied: DYK-06 through DYK-10
- [x] Phase 3: Storage Layer - **COMPLETE** (2026-01-29)
  - Tasks: [tasks/phase-3-storage-layer/tasks.md](./tasks/phase-3-storage-layer/tasks.md)
  - Execution Log: [tasks/phase-3-storage-layer/execution.log.md](./tasks/phase-3-storage-layer/execution.log.md)
  - Contract Tests: 28 passed (14 Fake + 14 Real)
  - Integration Tests: 9 passed
  - DYK Decisions Applied: DYK-11 through DYK-15
- [ ] Phase 4: Web Integration - **DOSSIER READY**
  - Tasks: [tasks/phase-4-web-integration/tasks.md](./tasks/phase-4-web-integration/tasks.md)
- [ ] Phase 5: Consolidation + Cleanup - NOT STARTED

### STOP Rule

**IMPORTANT**: This plan must be complete before creating tasks. After writing this plan:
1. Run `/plan-4-complete-the-plan` to validate readiness
2. Only proceed to `/plan-5-phase-tasks-and-brief` after validation passes

---

## Subtasks Registry

Mid-implementation detours requiring structured tracking.

| ID | Created | Phase | Parent Task | Reason | Status | Dossier |
|----|---------|-------|-------------|--------|--------|---------|
| 001-subtask-migrate-agents-list-page | 2026-01-29 | Phase 5: Consolidation & Cleanup | T003 | List page still uses Plan 018 backend; users cannot create or list agents | [ ] Pending | [Link](tasks/phase-5-consolidation-cleanup/001-subtask-migrate-agents-list-page.md) |

---

## Change Footnotes Ledger

**NOTE**: This section will be populated during implementation by plan-6a-update-progress.

**Footnote Numbering Authority**: plan-6a-update-progress is the **single source of truth** for footnote numbering across the entire plan.

[^1]: [To be added during implementation via plan-6a]
[^2]: [To be added during implementation via plan-6a]
[^3]: [To be added during implementation via plan-6a]

---

*Plan Version 1.0.0 - Created 2026-01-28*
