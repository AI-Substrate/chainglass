# Domain: Agents

**Slug**: agents
**Type**: business
**Created**: 2026-02-28
**Created By**: Plan 059 — Fix Agents (extracted from existing codebase)
**Status**: active

## Purpose

Multi-adapter AI agent lifecycle management. Creates, runs, streams, and persists agent sessions across three runtime backends (Claude Code CLI, GitHub Copilot SDK, Copilot CLI via tmux). The web UI provides chat, status monitoring, and seamless connect/disconnect to background agents. Agents are the primary work executors in Chainglass — workflow nodes spawn them, users observe them, and the system tracks their status for cross-component visibility.

## Concepts

| Concept | Entry Point | What It Does |
|---------|-------------|-------------|
| Create and manage agents | `IAgentManagerService` | CRUD operations for agent lifecycle — create, list, get, terminate |
| Run agent sessions | `IAgentInstance.run()` | Execute prompts against an adapter, stream events, store as NDJSON |
| Stream agent events | `IAgentNotifierService` | Broadcast real-time status/intent/event changes via SSE |
| Persist agent sessions | `IAgentStorageAdapter` | Store and retrieve agent events as NDJSON files per session |
| Swap agent runtimes | `IAgentAdapter` | Pluggable adapter interface — ClaudeCode, CopilotSDK, CopilotCLI |
| View agent chat | `useAgentInstance` hook | React hook for fetching agent data + subscribing to SSE stream |
| List agents | `useAgentManager` hook | React hook for agent list with real-time updates |

### Create and Manage Agents

Central registry for agent CRUD. `AgentManagerService` is a singleton (via `globalThis` to survive HMR) managing an in-memory `Map<agentId, IAgentInstance>`. Agents are created per-workspace, persisted to `~/.config/chainglass/agents/`, and restored on server restart.

```typescript
import { IAgentManagerService } from '@chainglass/shared';
const agent = await agentManager.createAgent({ name: 'Fix auth', type: 'copilot', workspace: 'main' });
const agents = agentManager.getAgents({ workspace: 'main' });
```

### Run Agent Sessions

Execute a prompt against any adapter. The adapter streams `AgentEvent` objects (text_delta, tool_call, thinking, etc.) which are stored as NDJSON and broadcast via SSE. 409 guard prevents double-runs.

```typescript
const result = await agent.run({ prompt: 'Fix the auth module', onEvent: (e) => console.log(e) });
```

### Stream Agent Events

`AgentNotifierService` bridges agent lifecycle events to SSE. Single 'agents' channel per ADR-0007; clients filter by `agentId`. Three event types: `agent_status`, `agent_intent`, `agent_event`.

### Persist Agent Sessions

Events stored as NDJSON at `<worktree>/.chainglass/data/agents/{sessionId}/events.ndjson`. Malformed lines are silently skipped (PL-07). Storage happens BEFORE SSE broadcast (PL-01).

### Swap Agent Runtimes

Three adapters implement `IAgentAdapter`:
- **ClaudeCodeAdapter**: Spawns `claude` CLI process via ProcessManager
- **SdkCopilotAdapter**: Wraps `@github/copilot-sdk` (default agent type)
- **CopilotCLIAdapter**: Attaches to running tmux session, tails `events.jsonl` (Plan 057)

### View Agent Chat / List Agents

React Query for data fetching + SSE for real-time deltas. `useAgentInstance(agentId)` returns agent data + event stream. `useAgentManager()` returns agent list with SSE-driven cache invalidation. Follows notification-fetch pattern (PL-10).

## Boundary

### Owns

**Core interfaces and types:**
- IAgentAdapter, IAgentInstance, IAgentManagerService, IAgentNotifierService, IAgentStorageAdapter
- AgentEvent, AgentResult, AgentType (`'claude-code' | 'copilot' | 'copilot-cli'`), AgentInstanceStatus
- AgentSession entity, agent error types
- Agent ID validation utility
- Agent Zod schemas (agent-event, agent-session)
- DI tokens (SHARED_DI_TOKENS.AGENT_*, WORKSPACE_DI_TOKENS.AGENT_*)

**Adapters:**
- ClaudeCodeAdapter (Claude Code CLI spawn)
- SdkCopilotAdapter (@github/copilot-sdk wrapper)
- CopilotCLIAdapter (tmux + events.jsonl tailing)
- EventsJsonlParser (NDJSON parsing)

**Services:**
- AgentManagerService (singleton, CRUD + adapter factory)
- AgentInstance (per-agent lifecycle + event accumulation)
- AgentNotifierService (SSE broadcast bridge)
- AgentStorageAdapter (NDJSON file persistence)

**Web hooks:**
- useAgentManager — agent list with SSE subscription
- useAgentInstance — single agent with SSE + event stream

**Web UI components:**
- AgentChatView, AgentChatInput — chat conversation UI
- AgentListLive — real-time agent list table
- CreateSessionForm — agent creation form (default: copilot)
- AgentSessionDialog — dialog wrapper for sessions
- AgentStatusIndicator — status badge component
- ContextWindowDisplay, LogEntry, ThinkingBlock, ToolCallCard — chat renderers
- SessionDeleteButton, DeleteSessionDialog — deletion with confirmation

**API routes:**
- GET/POST /api/agents — list and create
- GET/PUT/DELETE /api/agents/[id] — single agent CRUD
- POST /api/agents/[id]/run — execute prompt
- GET /api/agents/events — SSE event stream

**Pages:**
- /workspaces/[slug]/agents — agent list page
- /workspaces/[slug]/agents/[id] — agent detail/chat page

**Transformers:**
- agent-events-to-log-entries — AgentEvent → LogEntry conversion for chat rendering

**Fakes:**
- FakeAgentAdapter, FakeAgentInstance, FakeAgentManagerService, FakeAgentNotifierService, FakeAgentStorageAdapter, FakeSSEBroadcaster

**Future (Plan 059):**
- AgentWorkUnitBridge — publishes agent status to WorkUnitStateService
- AgentChipBar, AgentChip — top bar UI components
- AgentOverlayPanel — fixed-position overlay with chat
- useAgentOverlay — { openAgent, closeAgent, activeAgentId }
- useRecentAgents — recency-based agent list with 24h expiry
- AttentionFlash — screen border flash + ❓ badge

### Subdomain: Session Persistence (packages/workflow)

Agent session and event persistence infrastructure that lives in the workflow package. Agent-specific but serves workflow orchestration contexts.

- IAgentSessionAdapter, IAgentSessionService, IAgentEventAdapter (interfaces)
- AgentSessionAdapter, AgentEventAdapter (adapters)
- AgentSessionService (service)
- AgentSession entity
- FakeAgentSessionAdapter, FakeAgentEventAdapter (fakes)

### Does NOT Own

- **Orchestration execution** (AgentPod, AgentContext, ODS) — owned by `_platform/positional-graph`. Orchestration creates agents but lifecycle management is separate.
- **CLI agent commands** (cg agent run, cg agent compact) — owned by CLI app. Uses shared interfaces.
- **SSE transport infrastructure** (SSEManager, SSE API route) — owned by `_platform/events`. Agents consume `ISSEBroadcaster`.
- **Copilot SDK client management** — owned by `_platform/sdk`. CopilotClient singleton.
- **WorkspaceDomain.Agents channel name** — owned by `_platform/events`. Channel registry.
- **Generic work unit state registry** — owned by `work-unit-state`. Agents publish TO it via AgentWorkUnitBridge.
- **State system infrastructure** (GlobalStateSystem, useGlobalState) — owned by `_platform/state`.

## Contracts (Public Interface)

| Contract | Type | Consumers | Description |
|----------|------|-----------|-------------|
| `IAgentAdapter` | Interface | AgentInstance, contract tests | `run(prompt, onEvent)`, `compact()`, `terminate()` |
| `IAgentInstance` | Interface | API routes, orchestration (AgentPod), hooks | Agent lifecycle: `run()`, `terminate()`, `getEvents()`, status/intent |
| `IAgentManagerService` | Interface | API routes, orchestration (ODS), CLI, DI | `createAgent()`, `getAgents()`, `getAgent()`, `terminateAgent()` |
| `IAgentNotifierService` | Interface | AgentManagerService, DI | `broadcastStatus()`, `broadcastIntent()`, `broadcastEvent()` |
| `IAgentStorageAdapter` | Interface | AgentInstance | `append()`, `getAll()`, `getSince()` — NDJSON persistence |
| `IAgentSessionAdapter` | Interface | AgentSessionService | Session CRUD in workflow package |
| `IAgentSessionService` | Interface | Workflow orchestration | `createSession()`, `deleteSession()`, `updateSessionStatus()` |
| `IAgentEventAdapter` | Interface | AgentSessionService | `appendEvent()`, `getAllEvents()`, `getEventsSince()` |
| `useAgentManager` | Hook | Agent list page | React Query + SSE agent list |
| `useAgentInstance` | Hook | Agent detail page, future overlay | React Query + SSE single agent |
| `AgentType` | Type | API routes, forms, DI factory | `'claude-code' \| 'copilot' \| 'copilot-cli'` |
| `AgentInstanceStatus` | Type | UI components, state publishing | `'working' \| 'stopped' \| 'error'` |
| `AgentEvent` | Type | Hooks, transformers, storage | Discriminated union of all agent event types |
| `SHARED_DI_TOKENS.AGENT_*` | Tokens | DI container | Service resolution tokens |

## Composition (Internal)

| Component | Role | Depends On |
|-----------|------|------------|
| AgentManagerService | Singleton registry, CRUD, adapter factory coordination | IAgentAdapter (factory), IAgentStorageAdapter, IAgentNotifierService |
| AgentInstance | Per-agent lifecycle + event accumulation + status machine | IAgentAdapter, IAgentStorageAdapter |
| ClaudeCodeAdapter | Claude Code CLI spawn + output parsing | ProcessManager (child_process) |
| SdkCopilotAdapter | @github/copilot-sdk wrapper | CopilotClient (_platform/sdk) |
| CopilotCLIAdapter | tmux send-keys + events.jsonl tailing | tmux (system), EventsJsonlParser |
| AgentNotifierService | SSE broadcast bridge — translates lifecycle to SSE | ISSEBroadcaster (_platform/events) |
| AgentStorageAdapter | NDJSON file read/write per session | Node.js fs (filesystem) |
| useAgentManager | React Query list + SSE cache invalidation | /api/agents, /api/agents/events |
| useAgentInstance | React Query detail + SSE event streaming | /api/agents/[id], /api/agents/events |
| AgentChatView | Renders event stream as chat conversation | useAgentInstance, transformers |
| CreateSessionForm | Agent creation form with type selector | /api/agents POST |
| useWorktreeActivity | Cross-worktree activity polling (30s) | /api/worktree-activity GET |
| WorkspaceNav (composition) | Renders ActivityDot badges in sidebar | useWorktreeActivity data → plain props |
| AgentNotifierService (FX001) | Bridges broadcastStatus → WorkUnitStateService via lazy bridge | ISSEBroadcaster + optional AgentWorkUnitBridge resolver |

## Source Location

Primary: scattered across `packages/shared/src/`, `packages/workflow/src/`, `apps/web/src/`, `apps/web/app/`

| File | Role | Notes |
|------|------|-------|
| `packages/shared/src/interfaces/agent-adapter.interface.ts` | IAgentAdapter interface | Core adapter contract |
| `packages/shared/src/interfaces/agent-types.ts` | Agent type definitions | AgentEvent, AgentResult, AgentStatus |
| `packages/shared/src/features/019-agent-manager-refactor/` | Core agent management | Interfaces, services, fakes (14 files) |
| `packages/shared/src/features/034-agentic-cli/` | CLI agent management | CLI-specific interfaces + service (9 files) |
| `packages/shared/src/adapters/claude-code.adapter.ts` | ClaudeCodeAdapter | CLI spawn adapter |
| `packages/shared/src/adapters/sdk-copilot-adapter.ts` | SdkCopilotAdapter | SDK wrapper adapter |
| `packages/shared/src/adapters/copilot-cli.adapter.ts` | CopilotCLIAdapter | tmux adapter (Plan 057) |
| `packages/shared/src/adapters/events-jsonl-parser.ts` | EventsJsonlParser | NDJSON parsing |
| `packages/shared/src/fakes/fake-agent-adapter.ts` | FakeAgentAdapter | Test double |
| `packages/shared/src/schemas/agent-event.schema.ts` | AgentEvent Zod schema | Validation |
| `packages/shared/src/schemas/agent-session.schema.ts` | AgentSession Zod schema | Validation |
| `packages/shared/src/utils/validate-agent-id.ts` | Agent ID validation | Path traversal prevention (PL-09) |
| `packages/workflow/src/interfaces/agent-session-adapter.interface.ts` | IAgentSessionAdapter | Session persistence (subdomain) |
| `packages/workflow/src/interfaces/agent-session-service.interface.ts` | IAgentSessionService | Session lifecycle (subdomain) |
| `packages/workflow/src/interfaces/agent-event-adapter.interface.ts` | IAgentEventAdapter | Event persistence (subdomain) |
| `packages/workflow/src/adapters/agent-session.adapter.ts` | AgentSessionAdapter | Filesystem session adapter (subdomain) |
| `packages/workflow/src/adapters/agent-event.adapter.ts` | AgentEventAdapter | Filesystem event adapter (subdomain) |
| `packages/workflow/src/services/agent-session.service.ts` | AgentSessionService | Session service (subdomain) |
| `packages/workflow/src/entities/agent-session.ts` | AgentSession entity | Domain entity (subdomain) |
| `packages/workflow/src/errors/agent-errors.ts` | Agent error types | (subdomain) |
| `apps/web/src/features/019-agent-manager-refactor/agent-notifier.service.ts` | AgentNotifierService | SSE broadcast |
| `apps/web/src/features/019-agent-manager-refactor/sse-manager-broadcaster.ts` | SSEManagerBroadcaster | SSE adapter |
| `apps/web/src/features/019-agent-manager-refactor/useAgentManager.ts` | useAgentManager hook | React Query + SSE |
| `apps/web/src/features/019-agent-manager-refactor/useAgentInstance.ts` | useAgentInstance hook | React Query + SSE |
| `apps/web/src/features/019-agent-manager-refactor/transformers/` | Event transformers | AgentEvent → LogEntry |
| `apps/web/src/components/agents/` | Agent UI components | 12+ components |
| `apps/web/app/api/agents/route.ts` | GET/POST /api/agents | List + create |
| `apps/web/app/api/agents/[id]/route.ts` | Single agent CRUD | GET/PUT/DELETE |
| `apps/web/app/api/agents/[id]/run/route.ts` | Execute agent | POST with 409 guard |
| `apps/web/app/api/agents/events/route.ts` | SSE stream | Agent events |
| `apps/web/app/(dashboard)/workspaces/[slug]/agents/page.tsx` | Agent list page | Server component |
| `apps/web/app/(dashboard)/workspaces/[slug]/agents/[id]/page.tsx` | Agent detail page | Server component |
| `apps/web/src/data/fixtures/agent-sessions.fixture.ts` | Fixture data | Test fixtures |
| `test/contracts/agent-*.contract.ts` | Contract tests | 8 contract test files |
| `test/unit/shared/claude-code-adapter.test.ts` | Adapter unit test | |
| `test/unit/shared/sdk-copilot-adapter.test.ts` | Adapter unit test | |
| `test/unit/shared/adapters/copilot-cli-adapter.test.ts` | Adapter unit test | |
| `test/unit/web/components/agents/*.test.tsx` | Component tests | 4+ test files |
| `test/integration/agent-*.test.ts` | Integration tests | 9 integration test files |

## Dependencies

### This Domain Depends On

| Domain | Contract | Why |
|--------|----------|-----|
| `_platform/events` | ISSEBroadcaster, useSSE | SSE transport for real-time agent events |
| `_platform/events` | toast() | Toast notifications for agent status changes |
| `_platform/sdk` | CopilotClient | SdkCopilotAdapter uses Copilot SDK client singleton |
| `_platform/state` | IStateService, useGlobalState | Future: publish agent state paths |
| `work-unit-state` | IWorkUnitStateService | AgentWorkUnitBridge publishes agent status to centralized registry |
| `workflow-events` | IWorkflowEvents (onQuestionAsked, onQuestionAnswered) | Bridge subscribes to WF observers for status-driven updates |
| `_platform/panel-layout` | DashboardShell | Future: top bar slot for agent chip bar |

### Domains That Depend On This

| Domain | Contract | Why |
|--------|----------|-----|
| `_platform/positional-graph` | IAgentManagerService, IAgentInstance | Orchestration creates/runs agents via AgentPod |
| `workflow-ui` | _(future: useAgentOverlay)_ | Future: workflow nodes trigger agent overlay |

## History

| Plan | What Changed | Date |
|------|-------------|------|
| Plan 012 | Initial agent system — ClaudeCodeAdapter, basic CRUD | 2026-01 |
| Plan 015 | Better agents — NDJSON storage, SSE broadcasting, storage-first pattern | 2026-01 |
| Plan 018 | Workspace data model — per-worktree session storage | 2026-01 |
| Plan 019 | Agent manager refactor — DI, interfaces, fakes, contract tests, singleton | 2026-01 |
| Plan 030 | Orchestration — AgentPod, ODS agent execution | 2026-02 |
| Plan 034 | Agentic CLI — CLI agent commands, compact handler | 2026-02 |
| Plan 057 | CopilotCLI adapter — tmux + events.jsonl tailing | 2026-02 |
| *(extracted)* | Domain formalized from existing codebase | 2026-02-28 |
| Plan 059 Phase 2 | AgentWorkUnitBridge implemented — registers agents in WorkUnitStateService, subscribes to WorkflowEvents observers, DI wired | 2026-03-02 |
| Plan 059 Phase 3 | Top bar + agent overlay — AgentChipBar (@dnd-kit sortable), AgentChip (5 status states), AgentOverlayPanel (full-height chat), useAgentOverlay hook, useRecentAgents hook, 3-layer attention system (pulse/toast/flash), WorkspaceAgentChrome wrapper, workflow node onAgentClick prop | 2026-03-02 |
| Plan 059 Phase 4 | Cross-worktree activity — useWorktreeActivity hook (30s polling), ActivityDot component in WorkspaceNav (both rendering modes), badge click navigation to agent page | 2026-03-02 |
| Plan 059 FX001 | Wire agent lifecycle into WorkUnitStateService — POST registers, DELETE unregisters, notifier broadcastStatus updates via lazy bridge resolver | 2026-03-03 |
