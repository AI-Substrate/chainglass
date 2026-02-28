# Fix Agents — Web Agent System Overhaul

📚 This specification incorporates findings from research-dossier.md and workshops/001-top-bar-agent-ux.md, workshops/002-agent-connect-disconnect-ux.md, workshops/003-work-unit-state-system.md

## Research Context

The research dossier (68 findings across 8 subagents) revealed that the web agent system is structurally sound but has critical data flow gaps preventing it from functioning. The GET /api/agents endpoint doesn't return data in the format hooks expect, SSE broadcasting isn't wired into creation routes, and the CopilotCLI adapter (Plan 057) isn't registered in the web DI factory. The system has 45+ test files, 3 adapter implementations, and a well-designed DI/SSE/React Query architecture — the bones are good, the wiring is broken.

Three workshops produced authoritative design decisions: (1) a recency-based top bar with 4 display states and drag-to-reorder, (2) a fixed-position overlay panel with `useAgentOverlay()` hook for seamless connect/disconnect from any trigger point, and (3) a centralized WorkUnit State system (`work-unit-state` business domain) that unifies question/status reporting across agents, code units, workflow nodes, and pods.

## Summary

The web agent system is broken — nothing shows up, sessions can't be created, and real-time updates don't flow. This plan fixes the foundation and then builds the agent experience Chainglass was designed around: managing teams of background agents with effortless visibility, connection, and interaction.

The work breaks into four phases:
- **Phase A** fixes the broken agent chat so agents work as they did before
- **Phase B** introduces the WorkUnit State system as a centralized "who needs help" registry
- **Phase C** builds the always-visible agent top bar with popover for seamless connect/disconnect
- **Phase D** wires cross-worktree alerts and left menu activity indicators

The vibe: "The whole reason this system exists is to manage teams of agents. We need to see our agents always."

## Goals

- **Fix broken agent chat**: Agent list page shows agents, agent detail page shows chat, creating agents works, running agents streams events
- **Default to Copilot agents**: Copilot (SDK) is the default agent type; Copilot CLI (Plan 057) is supported with session ID and tmux fields
- **Centralize work unit status**: Any source (agent, code unit, workflow node, pod) can report status and ask first-class questions through a single registry
- **Always-visible agents**: Running and recent agents appear in a persistent top bar across all pages, scoped to current worktree
- **Seamless connect/disconnect**: Click any agent chip, workflow node, or notification to pop over the agent's chat without navigating away. Close it and the agent keeps running.
- **Persistent sessions**: Sessions are rehydratable artifacts — even months later, opening a session loads its stored events. If the underlying agent host still has the session, the user can resume.
- **Cross-worktree awareness**: When an agent in another worktree asks a question or errors, the left menu shows activity badges
- **First-class questions**: When any work unit asks a typed question (free_text, single_choice, multi_choice, confirm), the system surfaces it through attention layers: chip pulse, toast, and screen flash

## Non-Goals

- Spawning or managing the Copilot CLI process (adapter requires it to already be running)
- Replacing the SDK adapter for workflow orchestration use cases
- Auto-detecting "waiting for input" from natural language — only first-class typed questions trigger waiting_input status
- Working outside tmux for the CopilotCLI adapter (tmux is a hard dependency for input injection)
- Mobile-first design (desktop-first; mobile adaptation is future work)
- Agent-to-agent communication (agents don't talk to each other through this system)
- Replacing existing MessageService or NodeStatusResult systems — WorkUnit State is a notification aggregator, not a replacement for domain-internal storage

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| work-unit-state | **NEW** | **create** | Centralized status + question registry for all work unit types |
| agents | **NEW** | **create** | Formalize agent boundary: adapters, manager, session lifecycle, state publishing |
| _platform/state | existing | **consume** | Publish work unit state paths via GlobalStateSystem |
| _platform/events | existing | **consume** | Broadcast SSE events via ISSEBroadcaster |
| _platform/panel-layout | existing | **modify** | Add agent top bar slot in DashboardShell layout |
| workflow-ui | existing | **modify** | Add agent session overlay trigger to workflow nodes |
| _platform/positional-graph | existing | **consume** | Read node→agent session mapping from orchestrator |

### New Domain Sketches

#### work-unit-state [NEW]
- **Purpose**: Centralized first-class registry where any work unit — agents, code units, user-input nodes, pods — reports execution state and asks typed questions. Enables cross-component, cross-worktree visibility through a single query surface.
- **Boundary Owns**: IWorkUnitStateService interface, WorkUnitEntry/WorkUnitQuestion/QuestionAnswer types, answer routing callbacks, tidy-up rules, persistence at `<worktree>/.chainglass/data/work-unit-state.json`, state path publishing (`work-unit:{id}:*`), domain registration with GlobalStateSystem, FakeWorkUnitStateService test double
- **Boundary Excludes**: Generic state pub/sub mechanism (owned by `_platform/state`), SSE transport (owned by `_platform/events`), domain-specific question storage (MessageService stays in workflow, agent events stay in agent NDJSON), UI components that consume work unit state (owned by agents domain and workflow-ui)

#### agents [NEW]
- **Purpose**: Formalize the existing agent system boundary: agent adapters (ClaudeCode, SdkCopilot, CopilotCLI), AgentManagerService, session lifecycle, event streaming, and the bridge that publishes agent status to the WorkUnit State system.
- **Boundary Owns**: IAgentAdapter implementations, AgentManagerService (singleton), IAgentInstance lifecycle, agent API routes (/api/agents/*), agent SSE events (text_delta, tool_call, etc.), AgentWorkUnitBridge (publishes agent status/questions to WorkUnitStateService), agent overlay components (chips, popover), agent creation forms, useAgentInstance/useAgentManager hooks
- **Boundary Excludes**: Generic work unit status registry (owned by work-unit-state), SSE transport infrastructure (owned by _platform/events), Copilot SDK client management (owned by _platform/sdk), workflow orchestration that creates agents (owned by _platform/positional-graph)

## Mode

**Full** — CS-4 feature, 4 phases, all gates required.

## Complexity

- **Score**: CS-4 (large)
- **Breakdown**: S=2, I=1, D=2, N=1, F=1, T=2
  - **Surface Area (S=2)**: Cross-cutting — touches API routes, DI container, state system, UI components, new domain, workflow integration, panel layout
  - **Integration (I=1)**: Existing adapters (copilot SDK, claude CLI, tmux); integrates with Plan 053 state system and Plan 054 human input
  - **Data/State (D=2)**: New WorkUnit State persistence model, agent recent list, state path publishing, question/answer routing
  - **Novelty (N=1)**: Workshop decisions are clear but overlay UX and cross-worktree alerts have some remaining design questions
  - **Non-Functional (F=1)**: Performance matters for 20+ agents in top bar; SSE connection management; virtual scrolling for long chat sessions
  - **Testing/Rollout (T=2)**: Contract tests for WorkUnitStateService, integration tests for agent bridge, component tests for overlay, cross-worktree scenarios
- **Confidence**: 0.80
- **Assumptions**:
  - Plan 053 GlobalStateSystem is stable and can handle ~200 state paths (20 agents × 10 paths each)
  - Copilot CLI adapter (Plan 057) is complete and passes contract tests
  - DI container singleton pattern (AgentManagerService) is sound
  - SSE single-channel architecture (ADR-0007) scales to combined agent events + work unit notifications
- **Dependencies**:
  - Plan 053 (GlobalStateSystem) — must be implemented and stable
  - Plan 057 (CopilotCLI adapter) — must be complete for copilot-cli agent type
  - Plan 054 (Unified Human Input) — question types reused
  - @dnd-kit/core — for drag-to-reorder in top bar (already in project)
- **Risks**:
  - SSE channel congestion if many agents stream events simultaneously
  - WorkUnitStateService persistence file contention across worktrees
  - Overlay panel z-index conflicts with existing modal/dialog layers
- **Phases**: 4 suggested (A: fix foundation, B: work-unit-state domain, C: top bar + overlay, D: cross-worktree + left menu)

## Acceptance Criteria

### Phase A — Fix Agent Foundation

1. **AC-01**: GET /api/agents returns agent data that `useAgentManager` hook can consume — agent list page renders agents for the current workspace
2. **AC-02**: POST /api/agents creates an agent with type `copilot` as default; `copilot-cli` and `claude-code` also supported
3. **AC-03**: Creating a copilot-cli agent accepts `sessionId`, `tmuxWindow`, and `tmuxPane` as additional parameters
4. **AC-04**: The DI container adapter factory handles all three agent types: `claude-code`, `copilot`, `copilot-cli`
5. **AC-05**: SSE broadcasts `agent_created` when an agent is created, `agent_status` on status change, `agent_terminated` on deletion
6. **AC-06**: Agent detail page (/workspaces/[slug]/agents/[id]) renders chat history from stored events and streams new events in real-time
7. **AC-07**: Running an agent (POST /api/agents/[id]/run) returns 409 if already working, streams events via SSE, and stores events as NDJSON
8. **AC-08**: Agent sessions persist across server restarts — restarting the dev server and navigating to an agent shows its stored events

### Phase B — WorkUnit State System

9. **AC-09**: `IWorkUnitStateService` interface exists in `packages/shared` with methods: `register`, `unregister`, `updateStatus`, `askQuestion`, `answerQuestion`, `onAnswer`, `getUnit`, `getUnits`, `getQuestioned`, `tidyUp`
10. **AC-10**: `WorkUnitStateService` implementation persists entries to `<worktree>/.chainglass/data/work-unit-state.json` and publishes to GlobalStateSystem at `work-unit:{id}:*` paths
11. **AC-11**: On page load, `tidyUp()` removes entries older than 24h that are not `working` or `waiting_input`
12. **AC-12**: Working entries never expire regardless of age; entries with pending questions never expire
13. **AC-13**: `FakeWorkUnitStateService` test double exists with inspection methods (`getPublished`, `getQuestions`, `getAnswers`)
14. **AC-14**: Contract tests verify real and fake implementations behave identically (following Plan 053 pattern)
15. **AC-15**: `AgentWorkUnitBridge` automatically registers agents with WorkUnitStateService when created and publishes status changes
16. **AC-16**: When an agent emits a first-class question event, the bridge calls `askQuestion()` which sets `work-unit:{id}:has-question = true`
17. **AC-17**: Answering a question via `answerQuestion()` routes the answer to the registered callback and clears the question state

### Phase C — Top Bar + Agent Overlay

18. **AC-18**: A persistent agent chip bar renders above all page content in the DashboardShell, showing work units from the current worktree's recent list
19. **AC-19**: Each chip shows: type icon, name, status indicator (🔵 working, ⚪ idle, 🟡 waiting_input, 🔴 error), and intent snippet
20. **AC-20**: Chips are ordered by creation time (stable); user can drag-to-reorder using @dnd-kit; order persists in localStorage per worktree
21. **AC-21**: Clicking a chip opens a fixed-position overlay panel (480px wide, 70vh tall) with full chat UI — the user can read history, see streaming content, and send prompts
22. **AC-22**: The overlay does NOT navigate away from the current page; closing it (✕, Escape, or clicking the active chip again) keeps the agent running
23. **AC-23**: `useAgentOverlay()` hook provides `{ openAgent, closeAgent, activeAgentId }` callable from anywhere in the component tree
24. **AC-24**: Clicking a workflow node that has an `agentSessionId` in its properties calls `openAgent(sessionId)` to open the overlay
25. **AC-25**: Opening a months-old stopped session rehydrates it from stored NDJSON events. If the underlying agent host still has the session, the user can send new prompts to resume.
26. **AC-26**: Opening a session with an invalid/missing session ID shows a clear error message
27. **AC-27**: When a work unit enters `waiting_input`, the chip pulses yellow and a toast notification appears if the overlay is closed
28. **AC-28**: When the user is not viewing the agent context and a question is raised, the screen border flashes green for 10s and a ❓ badge appears in the top-left (clickable to open that agent)

### Phase D — Cross-Worktree & Left Menu

29. **AC-29**: Left menu worktree entries show activity badges: 🟡 for pending questions, 🔴 for errors, 🔵 for working agents — sourced from WorkUnitStateService cross-worktree query
30. **AC-30**: Activity badges only appear for OTHER worktrees (current worktree's agents are visible in the top bar)
31. **AC-31**: Clicking a cross-worktree activity badge navigates to that worktree's agent page (does not open overlay for other worktree's agents)

## Risks & Assumptions

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| SSE channel congestion with many simultaneous agents | Medium | Medium | Throttle status broadcasts; streaming events (text_delta) are already lightweight |
| WorkUnit State file contention across concurrent writes | Low | Medium | Single-writer per server process (JS event loop atomicity); per-worktree files reduce contention |
| Overlay z-index conflicts with existing modals/dialogs | Low | Low | Use dedicated z-index layer above content, below system modals |
| Agent host sessions expire after long periods | Medium | Low | Graceful error on rehydration failure; user can create new session |
| 20+ agents cause top bar performance issues | Low | Medium | Responsive chip sizing (compact mode); virtual scroll not needed for chips |

**Assumptions**:
- Plan 053 GlobalStateSystem is stable and deployed
- Plan 057 CopilotCLI adapter passes contract tests and is ready for web integration
- tmux is available in development environments (for copilot-cli agent type)
- Agent sessions stored as NDJSON are not truncated or rotated
- `events.jsonl` format (Copilot CLI) is stable across versions

## Open Questions

All resolved — see Clarifications below.

1. ~~**Screen flash cooldown**~~: ✅ 30s cooldown confirmed. First question triggers flash; subsequent within 30s get toast + chip pulse only.
2. ~~**Expanded overlay mode**~~: ✅ Deferred to future — not in scope.
3. ~~**Pin/dock mode**~~: ✅ Deferred to future — not in scope.

## Workshop Opportunities

All major design questions have been resolved through 3 completed workshops. No additional workshops are needed before architecture.

| Topic | Type | Status | Workshop |
|-------|------|--------|----------|
| Top bar agent UX | State Machine / CLI Flow | ✅ Resolved | workshops/001-top-bar-agent-ux.md |
| Agent connect/disconnect | Integration Pattern | ✅ Resolved | workshops/002-agent-connect-disconnect-ux.md |
| WorkUnit State system | Data Model / Integration | ✅ Resolved | workshops/003-work-unit-state-system.md |

## Testing Strategy

- **Approach**: Hybrid
- **Rationale**: Mixed complexity across phases — Phase B has contract-heavy logic; Phases A, C, D are integration/UI wiring
- **Focus Areas**:
  - **TDD**: WorkUnitStateService contracts (real + fake parity), AgentWorkUnitBridge integration, question routing callbacks
  - **Lightweight**: Phase A API/SSE wiring fixes (verify existing tests pass, targeted regression tests), Phase C/D UI components (spot-check rendering, hook behavior)
- **Mock Policy**: Avoid mocks entirely — use real implementations + Fake test doubles (FakeWorkUnitStateService, FakeSSEBroadcaster) following Plan 053 patterns
- **Excluded**: Visual regression testing, E2E browser tests, performance benchmarks

## Documentation Strategy

- **Location**: docs/how/ only
- **Rationale**: Agent system has domain docs at docs/domains/; new guide needed for work unit state integration
- **Deliverables**:
  - docs/how/work-unit-state-integration.md — How to register sources with IWorkUnitStateService
  - docs/domains/work-unit-state/domain.md — Domain definition
  - docs/domains/agents/domain.md — Domain definition

## Clarifications

### Session 2025-07-21

| # | Question | Answer |
|---|----------|--------|
| Q1 | Workflow Mode | **Full** — CS-4, 4 phases, all gates required |
| Q2 | Testing Strategy | **Hybrid** — TDD for WorkUnitStateService contracts, lightweight for API/UI wiring |
| Q3 | Mock Policy | **No mocks** — real implementations + Fake test doubles only |
| Q4 | Documentation Strategy | **docs/how/ only** — domain docs + integration guide |
| Q5 | Domain Review | **Confirmed** — 2 NEW (work-unit-state, agents) as top-level business domains; 5 existing consumed/modified as specified |
| Q6 | Open Questions | All 3 resolved — flash cooldown 30s confirmed, expanded overlay deferred, pin/dock deferred |
