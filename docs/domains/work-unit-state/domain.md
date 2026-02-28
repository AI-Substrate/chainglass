# Domain: Work Unit State

**Slug**: work-unit-state
**Type**: business
**Created**: 2026-02-28
**Created By**: Plan 059 — Fix Agents (new domain)
**Status**: active

## Purpose

Centralized first-class registry where any work unit — agents, code units, user-input nodes, pods — reports execution state and asks typed questions. Provides a single query surface for "who's running, who needs help, who's done" across all work unit types and worktrees. Enables the top bar, cross-worktree badges, and attention layers without each consumer polling each source directly.

## Concepts

| Concept | Entry Point | What It Does |
|---------|-------------|-------------|
| Register a work unit | `IWorkUnitStateService.register()` | Add a work unit to the registry with source type, name, workspace |
| Track execution status | `IWorkUnitStateService.updateStatus()` | Publish status changes (working, idle, waiting_input, error) to state paths |
| Ask first-class questions | `IWorkUnitStateService.askQuestion()` | Register a typed question (free_text, single_choice, multi_choice, confirm) for any work unit |
| Answer questions | `IWorkUnitStateService.answerQuestion()` | Route an answer to the source's registered callback and clear question state |
| Query work units | `IWorkUnitStateService.getUnits()` | List all work units, filterable by workspace, status, has-question |
| Auto-expire stale entries | `IWorkUnitStateService.tidyUp()` | Remove entries > 24h old that aren't working or waiting_input |

### Register a Work Unit

Any source — agent, workflow node, pod, code unit — registers itself when it starts. The registry assigns a state path prefix (`work-unit:{id}:*`) and begins publishing to GlobalStateSystem.

```typescript
import { IWorkUnitStateService } from '@chainglass/shared';
stateService.register({
  id: agentId,
  sourceType: 'agent',
  name: 'Fix auth module',
  workspace: 'main',
});
```

### Track Execution Status

Status changes publish to state paths. Consumers subscribe via `useGlobalState('work-unit:{id}:status')` — no direct coupling to the source.

```typescript
stateService.updateStatus(agentId, 'working', { intent: 'Refactoring auth' });
// Publishes: work-unit:{id}:status = 'working', work-unit:{id}:intent = 'Refactoring auth'
```

### Ask First-Class Questions

When a work unit needs user input, it asks a typed question. This sets `work-unit:{id}:has-question = true` which triggers attention layers (chip pulse, toast, screen flash).

```typescript
stateService.askQuestion(agentId, {
  type: 'single_choice',
  prompt: 'Which database should I use?',
  options: ['PostgreSQL', 'MySQL', 'SQLite'],
});
```

### Answer Questions

UI calls `answerQuestion()` which routes the answer to the source's registered `onAnswer` callback and clears the question state path.

```typescript
stateService.answerQuestion(agentId, { value: 'PostgreSQL' });
// Calls registered callback, sets work-unit:{id}:has-question = false
```

### Query Work Units

List all active work units with optional filters. Used by top bar (current worktree), left menu (cross-worktree), and dashboards.

```typescript
const units = stateService.getUnits({ workspace: 'main', hasQuestion: true });
const questioned = stateService.getQuestioned(); // All units with pending questions
```

### Auto-Expire Stale Entries

On page load, `tidyUp()` removes entries older than 24h that are not in `working` or `waiting_input` status. Working entries and entries with pending questions never expire regardless of age.

## Boundary

### Owns

- **IWorkUnitStateService interface** — register, unregister, updateStatus, askQuestion, answerQuestion, onAnswer, getUnit, getUnits, getQuestioned, tidyUp
- **WorkUnitEntry type** — id, sourceType, name, workspace, status, intent, question, createdAt, updatedAt
- **WorkUnitQuestion type** — type (free_text/single_choice/multi_choice/confirm), prompt, options, required
- **QuestionAnswer type** — value, freeformNotes
- **WorkUnitStatus type** — `'working' | 'idle' | 'waiting_input' | 'error'`
- **Answer routing callbacks** — `onAnswer(unitId, callback)` registration + dispatch
- **Tidy-up rules** — 24h expiry for non-working/non-waiting entries
- **Persistence** — `<worktree>/.chainglass/data/work-unit-state.json` (per ADR-0008 Layer 2)
- **State path publishing** — `work-unit:{id}:status`, `work-unit:{id}:intent`, `work-unit:{id}:has-question`, `work-unit:{id}:source-type`
- **Domain registration** — registerWorkUnitStateDomain() with GlobalStateSystem
- **DI tokens** — WORK_UNIT_STATE_DI_TOKENS
- **FakeWorkUnitStateService** — test double with getPublished(), getQuestions(), getAnswers()
- **Contract tests** — factory + runner verifying real/fake parity

### Does NOT Own

- **Generic state pub/sub mechanism** — owned by `_platform/state`. Work-unit-state publishes TO GlobalStateSystem, doesn't implement it.
- **SSE transport** — owned by `_platform/events`. State changes are consumed via useGlobalState hooks, not raw SSE.
- **Domain-specific question storage** — MessageService stays in `_platform/positional-graph`, agent events stay in agent NDJSON. Work-unit-state is a notification aggregator, not a replacement for domain-internal persistence.
- **Domain-specific status types** — `AgentInstanceStatus` stays in `agents`, `NodeStatus` stays in `_platform/positional-graph`. Work-unit-state normalizes to its own `WorkUnitStatus`.
- **UI components** — top bar chips/overlay owned by `agents`, workflow node badges owned by `workflow-ui`. Work-unit-state provides the data; consumers own the rendering.
- **Question type definitions** — the 4 question types (free_text, single_choice, multi_choice, confirm) originate from Plan 054 unified human input in positional-graph. Work-unit-state reuses these types.

## Contracts (Public Interface)

| Contract | Type | Consumers | Description |
|----------|------|-----------|-------------|
| `IWorkUnitStateService` | Interface | agents (AgentWorkUnitBridge), workflow-ui (future), top bar hooks | Full registry facade |
| `WorkUnitEntry` | Type | Any consumer reading unit state | Status entry with metadata |
| `WorkUnitQuestion` | Type | UI components rendering questions | Typed question with prompt/options |
| `QuestionAnswer` | Type | UI components submitting answers | Answer value + optional notes |
| `WorkUnitStatus` | Type | Status indicators, badges | `'working' \| 'idle' \| 'waiting_input' \| 'error'` |
| `FakeWorkUnitStateService` | Fake | All tests needing work unit state | Test double with inspection methods |
| `WORK_UNIT_STATE_DI_TOKENS` | Tokens | DI container | Service resolution tokens |

## Composition (Internal)

| Component | Role | Depends On |
|-----------|------|------------|
| WorkUnitStateService | Registry implementation — in-memory Map + persistence + state publishing | IStateService (_platform/state), filesystem |
| WorkUnitStore (internal) | In-memory Map<id, WorkUnitEntry> + answer callback registry | — |
| Persistence layer (internal) | JSON file read/write at `<worktree>/.chainglass/data/work-unit-state.json` | Node.js fs |
| State publisher (internal) | Publishes to GlobalStateSystem on every status/question change | IStateService |
| TidyUp logic (internal) | Scans entries, removes stale, preserves working/waiting | WorkUnitStore |
| FakeWorkUnitStateService | Full behavioral fake with inspection helpers | IWorkUnitStateService interface |

## Source Location

Primary: `packages/shared/src/work-unit-state/` (types + interface) + `apps/web/src/lib/work-unit-state/` (implementation)

*Note: This is a new domain — files will be created during Plan 059 Phase B implementation.*

| File | Role | Notes |
|------|------|-------|
| `packages/shared/src/interfaces/work-unit-state.interface.ts` | IWorkUnitStateService interface | Phase B.2 |
| `packages/shared/src/work-unit-state/types.ts` | WorkUnitEntry, WorkUnitQuestion, QuestionAnswer, WorkUnitStatus | Phase B.2 |
| `packages/shared/src/work-unit-state/tokens.ts` | WORK_UNIT_STATE_DI_TOKENS | Phase B.2 |
| `packages/shared/src/work-unit-state/index.ts` | Barrel exports | Phase B.2 |
| `packages/shared/src/fakes/fake-work-unit-state.ts` | FakeWorkUnitStateService | Phase B.3 |
| `apps/web/src/lib/work-unit-state/work-unit-state.service.ts` | WorkUnitStateService implementation | Phase B.5 |
| `apps/web/src/lib/work-unit-state/index.ts` | Barrel exports | Phase B.5 |
| `test/contracts/work-unit-state.contract.ts` | Contract test factory | Phase B.4 |
| `test/contracts/work-unit-state.contract.test.ts` | Contract test runner | Phase B.4 |
| `docs/how/work-unit-state-integration.md` | Integration guide | Phase B.10 |

## Dependencies

### This Domain Depends On

| Domain | Contract | Why |
|--------|----------|-----|
| `_platform/state` | IStateService | Publish work unit state paths to GlobalStateSystem |
| `_platform/events` | _(indirect)_ | State changes propagate to UI via state system's SSE integration |

### Domains That Depend On This

| Domain | Contract | Why |
|--------|----------|-----|
| `agents` | IWorkUnitStateService | AgentWorkUnitBridge registers agents and publishes status/questions |
| `workflow-ui` | _(future)_ | Workflow node cards could consume work unit state for unified status display |
| `_platform/panel-layout` | _(future)_ | Top bar and left menu consume work unit data for badges |

## Design Principles

1. **Notification aggregator, not a replacement** — Each source keeps its own internal state (agent NDJSON, MessageService messages). Work-unit-state is a cross-component notification layer.
2. **First-class questions only** — Only typed questions (via `askQuestion()`) trigger `waiting_input`. No heuristic detection from natural language or idle time.
3. **Recency-based visibility** — Working entries never expire; idle entries expire after 24h; manual dismiss available.
4. **State-first, event-second** — Current state is always readable via `getUnit()`; state changes propagate to UI via GlobalStateSystem subscriptions.
5. **Source-agnostic** — The registry doesn't know or care whether a work unit is an agent, a code unit, or a user-input node. `sourceType` is metadata, not behavior.

## History

| Plan | What Changed | Date |
|------|-------------|------|
| Plan 059 Workshop 003 | System designed — data model, interfaces, question flow, state paths | 2026-02-28 |
| *(extracted)* | Domain formalized | 2026-02-28 |
