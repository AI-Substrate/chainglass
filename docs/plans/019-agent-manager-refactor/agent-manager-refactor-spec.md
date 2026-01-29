# Agent Manager Refactor

**Version**: 1.1.0
**Created**: 2026-01-28
**Updated**: 2026-01-29
**Status**: Draft
**File Management**: PlanPak

---

## Research Context

📚 This specification incorporates findings from `research-dossier.md` and `prior-learnings.md`.

- **Components affected**: `packages/shared` (new AgentManagerService, AgentInstance, AgentNotifierService), `packages/workflow` (event storage integration), `apps/web` (new SSE endpoint, updated hooks)
- **Critical dependencies**: Existing `IAgentAdapter` implementations (ClaudeCodeAdapter, SdkCopilotAdapter) - **no modifications needed**
- **Modification risks**: Medium-High - Replacing fragmented session management with unified architecture; existing adapters preserved
- **Key findings**:
  - CD-01: No central agent registry exists (critical gap)
  - CD-02: Session state fragmented across 5+ locations
  - CD-03: SSE is global, not per-agent
  - PL-01: Storage-first pattern must be preserved ("storage is truth, SSE is hint")
  - PL-10: Notification-fetch pattern works well - keep it

### Existing AgentSession Entity

**Location**: `packages/workflow/src/entities/agent-session.ts`

The codebase has an existing `AgentSession` entity from Plan 018:
```typescript
// Current AgentSession (Plan 018 - workspace-scoped storage)
{
  id: string;           // e.g., "1738123456789-abc123"
  type: AgentType;      // 'claude-code' | 'copilot'
  status: AgentSessionStatus;  // 'active' | 'completed' | 'terminated'
  createdAt: Date;
  updatedAt: Date;
}
// Storage: <worktree>/.chainglass/data/agents/<id>.json
```

**⚠️ MARKED FOR CONSOLIDATION**: `AgentSession` and `AgentInstance` are conceptually similar. For this plan:
- **Phase 1-4**: Leave `AgentSession` untouched - focus on new architecture
- **Web Integration Phase**: Evaluate consolidation - likely `AgentInstance` replaces `AgentSession`
- **Goal**: Single concept, not two overlapping entities

The new `AgentInstance` will have richer properties (name, workspace, intent, etc.) and global storage. When we reach web integration, we will either:
1. Migrate `AgentSession` consumers to use `AgentInstance`, OR
2. Make `AgentSession` a thin wrapper around `AgentInstance`

**Ruthless cleanup principle**: No duplicate concepts survive. One will win.

---

## Summary

**What**: Create a unified agent management architecture with three core concepts:
1. **AgentManagerService** - Central authority for creating and tracking all running agents across all workspaces
2. **AgentInstance** - Self-contained representation of a running agent with properties, status, and event history
3. **AgentNotifierService** - Single SSE stream broadcasting events for all agents, with client-side filtering

**Why**: The current agent system is flakey due to:
- Fragmented state management (5+ locations storing session data)
- No central registry of running agents
- SRP violations across multiple components
- Difficulty building features that need agent awareness (menus showing status, parallel agents in workflows)

This refactor creates a clean, testable, headless-capable foundation that enables:
- Agents everywhere (chat UIs, workflows, headless automation)
- At-a-glance status for any agent from anywhere
- Easy rehydration of conversation history on page refresh
- Parallel agent execution in workflows
- TDD-first development

---

## Goals

1. **Single Source of Truth**: One AgentManagerService that knows about all agents across all workspaces
2. **Unified Agent Representation**: AgentInstance encapsulates all agent state (identity, status, intent, events)
3. **Global Event Stream**: Single SSE endpoint via AgentNotifierService broadcasts all agent events; clients filter by agent ID
4. **Workspace Association**: Each agent knows its workspace/worktree for filtering and context
5. **Event Rehydration**: Any consumer can get full event history to reconstruct UI state
6. **Headless Capable**: Core agent logic works without UI - CLI can list agents, get events, run prompts
7. **Multi-Consumer Safe**: Simple guards prevent double-running an agent (CLI + web can coexist safely)
8. **Fully TDD**: All new code testable with fakes, no real adapters needed for unit tests
9. **Preserve Adapters**: `IAgentAdapter`, `ClaudeCodeAdapter`, `SdkCopilotAdapter` remain unchanged
10. **Ruthless Cleanup**: Delete deprecated code, don't leave legacy paths "just in case", one concept wins

---

## Non-Goals

1. **Modify existing adapters**: The `IAgentAdapter` implementations work well - this refactor wraps them, not changes them
2. **Modify AgentSession now**: Leave `AgentSession` in `packages/workflow` for now - marked for consolidation in web phase
3. **Cross-machine sharing**: Agent data at `~/.config/chainglass/agents/` is per-machine (sessions aren't shareable anyway)
4. **UI redesign**: This plan focuses on core architecture; UI updates are a follow-on plan
5. **New agent types**: No new adapters (Claude, Copilot only); extensibility preserved for future
6. **Real-time sync across devices**: No cloud sync; agents are local to the machine
7. **Keep legacy code**: Any deprecated paths, duplicate concepts, or dead code will be deleted - no "just in case" preservation
8. **Distributed locks**: No complex locking between CLI/web - simple status guard is sufficient

---

## Complexity

**Score**: CS-4 (large)

**Breakdown**:
| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Surface Area (S) | 2 | Multiple packages (shared, workflow, web), 15+ files affected |
| Integration (I) | 1 | Wraps existing adapters; no new external dependencies |
| Data/State (D) | 2 | New storage format at ~/.config/chainglass/agents/; registry + instance + events |
| Novelty (N) | 1 | Well-specified via user vision; some design decisions needed |
| Non-Functional (F) | 1 | Moderate: must handle concurrent agents, SSE reliability |
| Testing/Rollout (T) | 2 | TDD required; staged rollout from headless → web integration |

**Total**: P = 2+1+2+1+1+2 = 9 → **CS-4**

**Confidence**: 0.80 (high confidence - clear vision, existing patterns to follow)

**Assumptions**:
- Existing `IAgentAdapter` implementations remain stable
- Storage at `~/.config/chainglass/agents/` is acceptable (per-machine)
- Notification-fetch pattern (PL-10) continues to work well
- Web UI integration is a follow-on phase

**Dependencies**:
- Existing `IAgentAdapter`, `ClaudeCodeAdapter`, `SdkCopilotAdapter`
- Existing `AgentEvent` discriminated union types
- tsyringe DI container infrastructure
- Next.js SSE support (ReadableStream)

**Risks**:
- Complexity of managing concurrent agent state
- SSE connection reliability (mitigated by notification-fetch pattern)
- Storage format changes may require migration tooling later
- Integration with existing web UI may uncover hidden dependencies

**Phases** (suggested):
1. **Phase 1**: AgentManagerService + AgentInstance (headless, TDD) - Core entities, interfaces, fakes
2. **Phase 2**: AgentNotifierService (SSE broadcast) - Single endpoint, event forwarding
3. **Phase 3**: Storage Layer - Persistence at ~/.config/chainglass/agents/
4. **Phase 4**: Web Integration - API routes, hooks, basic validation
5. **Phase 5**: Consolidation + Cleanup - Evaluate AgentSession, delete deprecated code, remove dead paths

---

## Acceptance Criteria

### AgentManagerService

**AC-01**: AgentManagerService creates agents with required properties
- Given AgentManagerService is instantiated
- When `createAgent({ name, type, workspace })` is called
- Then a new AgentInstance is created with unique ID
- And the agent is registered in the central registry
- And the agent is returned to the caller

**AC-02**: AgentManagerService lists all agents
- Given multiple agents exist across different workspaces
- When `getAgents()` is called without filter
- Then all agents are returned regardless of workspace
- And each agent includes: id, name, type, workspace, status, intent

**AC-03**: AgentManagerService filters agents by workspace
- Given agents exist in workspaces "project-a" and "project-b"
- When `getAgents({ workspace: 'project-a' })` is called
- Then only agents from "project-a" are returned

**AC-04**: AgentManagerService retrieves single agent by ID
- Given an agent with ID "agent-123" exists
- When `getAgent('agent-123')` is called
- Then the AgentInstance is returned
- And if agent doesn't exist, null is returned (no exception)

**AC-05**: AgentManagerService survives process restart
- Given agents were created before server restart
- When server restarts and AgentManagerService initializes
- Then all previously created agents are restored from storage
- And their status is set to 'stopped' (not 'working')

### CLI Usage (Headless)

**AC-05a**: CLI can list all agents via AgentManagerService
- Given the CLI has access to AgentManagerService
- When CLI runs a "list agents" command
- Then it receives all agents from `getAgents()`
- And can filter by workspace
- And sees status/intent for each agent

**AC-05b**: CLI can get agent events for rehydration
- Given an agent "agent-123" has processed multiple prompts
- When CLI runs a "get events" command for that agent
- Then it receives full event history via `agent.getEvents()`
- And can use `sinceId` for incremental fetch

**AC-05c**: CLI can run prompts on existing agent
- Given an agent "agent-123" exists with status 'stopped'
- When CLI runs a prompt on that agent
- Then the prompt executes via `agent.run({ prompt })`
- And status transitions working → stopped
- And events are persisted and available

**AC-05d**: CLI and web coexist safely
- Given web UI has AgentManagerService running with agent "agent-123"
- And CLI also accesses AgentManagerService
- When CLI tries to run a prompt while agent is 'working' (from web)
- Then CLI receives clear "agent already running" error
- And web session is not disrupted

### AgentInstance

**AC-06**: AgentInstance has required properties
- Given an AgentInstance is created
- Then it has: id, name, type, workspace, status, intent, sessionId, createdAt, updatedAt
- And status is one of: 'working', 'stopped', 'question', 'error'
- And intent is a string (initially empty)

**AC-07**: AgentInstance runs prompts using IAgentAdapter
- Given an AgentInstance with type 'claude-code' and status 'stopped'
- When `run({ prompt: 'Hello' })` is called
- Then the ClaudeCodeAdapter is used (via existing adapter factory)
- And status transitions: stopped → working → stopped
- And events are captured and stored

**AC-07a**: AgentInstance guards against double-run
- Given an AgentInstance with status 'working'
- When `run({ prompt: 'Another prompt' })` is called
- Then the call is rejected with clear error (agent already running)
- And no adapter is invoked
- And status remains 'working'
- Note: Simple guard, not a lock - CLI and web can safely coexist

**AC-08**: AgentInstance updates intent during execution
- Given an AgentInstance is running
- When the agent emits status/intent events
- Then the instance's intent property is updated
- And the intent is persisted to storage
- And the intent change is broadcast via AgentNotifier

**AC-09**: AgentInstance provides event history
- Given an AgentInstance has processed multiple prompts
- When `getEvents()` is called
- Then all historical events are returned in chronological order
- And events include: tool_call, tool_result, thinking, message types

**AC-10**: AgentInstance supports incremental event fetching
- Given an AgentInstance has 100 events
- When `getEvents({ sinceId: 'event-50' })` is called
- Then only events after event-50 are returned (50 events)

**AC-11**: AgentInstance can be terminated
- Given an AgentInstance with status 'working'
- When `terminate()` is called
- Then the underlying adapter's terminate() is called
- And status transitions to 'stopped'
- And termination event is broadcast

**AC-12**: AgentInstance stores adapter sessionId
- Given an agent run completes
- When the adapter returns a sessionId
- Then the instance stores it for session resumption
- And subsequent runs use the stored sessionId

### AgentNotifierService

**AC-13**: Single SSE endpoint for all agents
- Given the AgentNotifierService is running
- When a client connects to `/api/agents/events`
- Then a persistent SSE connection is established
- And events for ALL agents are broadcast on this connection

**AC-14**: Events include agent ID for filtering
- Given an event occurs on agent "agent-123"
- When the event is broadcast via SSE
- Then the event payload includes `agentId: 'agent-123'`
- And clients can filter events by agentId

**AC-15**: Status changes are broadcast
- Given an AgentInstance changes status from 'stopped' to 'working'
- When the status change occurs
- Then an SSE event is broadcast: `{ type: 'agent_status', agentId, status: 'working' }`

**AC-16**: Intent changes are broadcast
- Given an AgentInstance updates its intent to "Reading files..."
- When the intent change occurs
- Then an SSE event is broadcast: `{ type: 'agent_intent', agentId, intent: 'Reading files...' }`

**AC-17**: Agent events are broadcast
- Given an adapter emits a text_delta event
- When the event is captured by AgentInstance
- Then the event is persisted (storage-first per PL-01)
- Then an SSE notification is broadcast (notification-fetch pattern per PL-10)

**AC-18**: SSE survives page refresh
- Given a client is connected to SSE
- When the page is refreshed
- Then the client can reconnect to SSE
- And fetch missed events via `getEvents({ sinceId })`

### Storage

**AC-19**: Agent data stored at ~/.config/chainglass/agents/
- Given an agent is created
- When the agent is persisted
- Then data is stored at `~/.config/chainglass/agents/<agent-id>/`
- And the location is NOT inside the workspace/worktree

**AC-20**: Registry tracks all agents
- Given multiple agents exist
- When AgentManager initializes
- Then `~/.config/chainglass/agents/registry.json` contains all agent metadata
- And registry includes workspace/worktree references for each agent

**AC-21**: Events stored in NDJSON format
- Given an agent processes events
- When events are persisted
- Then they are stored at `~/.config/chainglass/agents/<agent-id>/events.ndjson`
- And format matches existing EventStorageService (timestamp-based IDs per PL-08)

**AC-22**: Instance metadata stored as JSON
- Given an AgentInstance is updated
- When changes are persisted
- Then metadata is stored at `~/.config/chainglass/agents/<agent-id>/instance.json`
- And includes: id, name, type, workspace, status, intent, sessionId, timestamps

### Error Handling

**AC-23**: Invalid agent ID rejected
- Given a malformed agent ID (contains `/`, `..`, etc.)
- When any AgentManager method receives it
- Then the operation fails with clear error
- And no filesystem access occurs (path traversal prevention per PL-09)

**AC-24**: Agent not found handled gracefully
- Given agent ID "nonexistent" doesn't exist
- When `getAgent('nonexistent')` is called
- Then null is returned (not an exception)
- And when `getEvents('nonexistent')` is called
- Then empty array is returned

**AC-25**: Adapter failures captured
- Given an adapter throws an error during run()
- When the error occurs
- Then AgentInstance status becomes 'error'
- And the error details are stored and broadcast

### TDD Requirements

**AC-26**: FakeAgentManagerService for testing
- Given tests need AgentManagerService
- When FakeAgentManagerService is used
- Then it implements IAgentManagerService interface
- And provides: state setup (addAgent), state inspection (getCreatedAgents), error injection

**AC-27**: FakeAgentInstance for testing
- Given tests need AgentInstance
- When FakeAgentInstance is used
- Then it implements IAgentInstance interface
- And provides: configurable events, status control, call tracking

**AC-28**: FakeAgentNotifierService for testing
- Given tests need AgentNotifierService
- When FakeAgentNotifierService is used
- Then it implements IAgentNotifierService interface
- And provides: broadcast tracking, connection simulation

**AC-29**: Contract tests for Fake/Real parity
- Given FakeAgentManagerService and real AgentManagerService
- When contract test suite runs
- Then same tests pass against both implementations
- And behavior is identical (per PL-11)

### Cleanup & Deprecation

**AC-30**: Deprecated code paths identified and removed
- Given the new agent architecture is working
- When web integration phase completes
- Then unused code from old agent system is deleted (not commented, not feature-flagged)
- And no duplicate concepts remain (AgentSession evaluated for removal/consolidation)

**AC-31**: No "just in case" legacy code
- Given a code path is no longer used
- When cleanup is performed
- Then the code is deleted entirely
- And tests for deleted code are also removed
- And imports/exports are cleaned up

---

## Risks & Assumptions

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Concurrent agent state corruption | Medium | High | Use atomic file operations; mutex for registry |
| SSE connection drops | Medium | Low | Notification-fetch pattern; sinceId for catch-up |
| AgentSession consolidation breaks web UI | Medium | High | Phase 5 after web integration validated; careful deprecation |
| UI integration reveals hidden deps | Medium | Medium | Phase 4 is separate; web validates incrementally |
| Performance with many agents | Low | Medium | Lazy loading; pagination for getAgents() |

### Assumptions

1. Existing `IAgentAdapter` implementations are stable and won't change
2. `~/.config/chainglass/agents/` is acceptable for cross-workspace storage
3. Agent sessions are inherently per-machine (CLI auth, process handles)
4. `AgentSession` can be consolidated or removed during web integration phase
5. Single SSE endpoint is sufficient (no need for per-agent streams)
6. Notification-fetch pattern (PL-10) continues to work well
7. Team is committed to ruthless cleanup - no "keep it just in case" mentality

---

## Open Questions

1. **[NEEDS CLARIFICATION: Agent naming]** - Should agent names be unique? Or allow duplicates with different IDs?

2. **[NEEDS CLARIFICATION: Agent lifecycle]** - When should agents be deleted? Manual delete only? Auto-cleanup after N days?

3. **[NEEDS CLARIFICATION: Workspace reference]** - Store worktree path or workspace slug? What if worktree is renamed/deleted?

4. **[NEEDS CLARIFICATION: Maximum agents]** - Should there be a limit on total agents or concurrent running agents?

5. ~~**[RESOLVED: Plan 018 interaction]**~~ - Plan 018 workspace-scoped storage will be evaluated for deletion during web integration phase. `AgentSession` marked for consolidation.

---

## ADR Seeds (Optional)

### ADR-SEED-01: Central Storage Location

**Decision Drivers**:
- Need cross-workspace visibility (all agents in one place)
- Agent sessions are per-machine anyway (CLI auth, process handles)
- Must survive worktree deletion/rename

**Candidate Alternatives**:
- A: `~/.config/chainglass/agents/` (proposed) - Central, survives worktree changes
- B: `<worktree>/.chainglass/data/agents/` (Plan 018) - Workspace-scoped, git-compatible
- C: Hybrid with symlinks - Complex, fragile

**Stakeholders**: Users managing multiple projects, CLI users, future cloud sync

### ADR-SEED-02: Single vs Multiple SSE Endpoints

**Decision Drivers**:
- Simplicity (one connection vs many)
- Scalability (server resources for connections)
- Client filtering complexity

**Candidate Alternatives**:
- A: Single `/api/agents/events` (proposed) - One connection, client filters
- B: Per-agent `/api/agents/{id}/events` - Multiple connections, server filters
- C: Per-workspace `/api/workspaces/{slug}/agents/events` - Middle ground

**Stakeholders**: Web UI, future mobile apps, monitoring tools

### ADR-SEED-03: Agent State Machine

**Decision Drivers**:
- Clear status transitions
- Handle edge cases (error during termination, etc.)
- UI needs predictable states

**Candidate Alternatives**:
- A: Simple enum (working|stopped|question|error) - Proposed, minimal
- B: Full state machine with transitions - More complex, safer
- C: Nested states (running.thinking, running.tool_call) - Very detailed

**Stakeholders**: UI developers, workflow automation

---

## Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| Agent State Machine | State Machine | Status transitions need clear definition; error handling paths complex | What are valid transitions? How to handle error during termination? Should 'question' be a separate status? |
| Storage Format | Storage Design | Registry + instance + events structure affects all consumers | What fields in registry.json? How to version for migration? Index by ID or separate index file? |
| SSE Event Schema | API Contract | Event payloads used by multiple UI components | What's the minimal notification payload? Include status/intent in all events or separate event types? |

---

## External Research

No external research was conducted. Research opportunities were identified in `research-dossier.md`:

1. **SSE vs WebSockets for Agent Streaming** - Could inform AgentNotifier design
2. **State Management for Concurrent Agents** - Could inform AgentManager patterns

These may be addressed before architecture phase if needed.

---

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-01-28 | Claude | Initial specification based on user vision and research |
| 1.1.0 | 2026-01-28 | Claude | Renamed to Service suffix; marked AgentSession for consolidation; added ruthless cleanup principle |
| 1.2.0 | 2026-01-28 | Claude | Clarified CLI headless usage; added double-run guard; AC-05a-d for CLI; no distributed locks |

---

**Next Steps**:
1. Run `/plan-2c-workshop` for Agent State Machine if detailed design needed
2. Run `/plan-2-clarify` to resolve open questions (5 questions)
3. Run `/plan-3-architect` to create implementation plan
