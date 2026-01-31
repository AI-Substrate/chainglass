# Agent Activity Fidelity Enhancement - Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-01-27
**Spec**: [./better-agents-spec.md](./better-agents-spec.md)
**Status**: DRAFT

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Acceptance Criteria](#acceptance-criteria-from-spec)
3. [Technical Context](#technical-context)
4. [Critical Research Findings](#critical-research-findings)
5. [Testing Philosophy](#testing-philosophy)
6. [Implementation Phases](#implementation-phases)
   - [Phase 1: Event Storage Foundation](#phase-1-event-storage-foundation)
   - [Phase 2: Adapter Event Parsing](#phase-2-adapter-event-parsing)
   - [Phase 3: Web Layer Integration](#phase-3-web-layer-integration)
   - [Phase 4: UI Components](#phase-4-ui-components)
   - [Phase 5: Integration & Accessibility](#phase-5-integration--accessibility)
7. [Cross-Cutting Concerns](#cross-cutting-concerns)
8. [Complexity Tracking](#complexity-tracking)
9. [Progress Tracking](#progress-tracking)
10. [References](#references)
11. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

**Problem**: Users have no visibility into agent activity. When Claude Code runs commands, reads files, or reasons through problems, that activity is invisible in the UI. Users see only final text responses, making it difficult to understand agent behavior, debug issues, or trust agent actions.

**Solution Approach**:
- Surface tool invocations (tool name, input parameters) in real-time as they happen
- Display tool results (output, success/error status) when execution completes
- Show thinking/reasoning blocks for Claude extended thinking
- Persist all events server-side as NDJSON for session resumability
- Implement collapsible UI components to avoid overwhelming the conversation view
- Maintain accessibility (ARIA, keyboard navigation) throughout

**Expected Outcomes**:
- Full visibility into agent tool calls within 500ms of execution start
- Session history survives page refresh and can be reviewed later
- Consistent experience across Claude Code and GitHub Copilot agents
- Accessible UI with screen reader support and keyboard navigation

**Success Metrics**:
- All 22 acceptance criteria from spec pass
- Test coverage > 80% for new code
- No performance regression with 100+ tool calls in session

---

## Acceptance Criteria (from Spec)

### Tool Call Visibility
- **AC1**: When Claude executes a bash command, the UI displays a tool card showing the command being run within 500ms of execution start
- **AC2**: When a tool completes, the UI updates the tool card to show success/error status and output
- **AC3**: Tool cards are collapsible—collapsed by default shows tool name and status; expanded shows full input/output
- **AC4**: When Copilot executes a tool, the same visibility is provided (tool name, input, output, status)

### Thinking Block Visibility
- **AC5**: When Claude emits thinking blocks (extended thinking enabled), they appear in the UI as collapsible "Thinking..." sections
- **AC6**: Thinking blocks are visually distinct from regular assistant messages (different styling)
- **AC6a**: Thinking blocks display by default but start collapsed (user can expand to read)
- **AC7**: When using Copilot with reasoning enabled, reasoning blocks appear in UI (Copilot uses `assistant.reasoning` events)

### Streaming and Real-Time Updates
- **AC8**: Tool execution status updates in real-time via SSE (user sees "Running..." then "Complete")
- **AC9**: Long tool outputs stream progressively, not all-at-once after completion
- **AC10**: Text responses continue to stream normally alongside tool activity

### Visual Design and UX
- **AC11**: Tool calls are visually distinguished from chat messages (distinct background, border, icon)
- **AC12**: Error states are clearly indicated (red styling, error icon, error message visible)
- **AC12a**: Tool cards auto-expand when an error occurs (errors need immediate visibility)
- **AC13**: Expand/collapse state persists during the session (user's preference remembered)
- **AC13a**: Tool output is truncated at 20 lines or 2000 characters with "Show more" link

### Accessibility
- **AC14**: Tool cards have proper ARIA attributes (`aria-expanded`, `aria-controls`)
- **AC15**: Streaming content uses `aria-live` regions for screen reader announcements
- **AC16**: All interactive elements are keyboard accessible (Enter/Space to toggle, Tab to navigate)

### Persistence and Resumability
- **AC17**: Events are persisted to `.chainglass/workspaces/<slug>/data/` as NDJSON files
- **AC18**: Page refresh reloads session events from server (no data loss)
- **AC19**: `GET /events?since=<id>` returns only events after the specified ID
- **AC20**: Old/deleted sessions can be archived (moved to `archived/` subfolder)

### Backward Compatibility
- **AC21**: Existing sessions without tool data continue to work (no migration required)
- **AC22**: If adapters fail to parse new event types, they fall back to current behavior (no crashes)

---

## Technical Context

### Current System State

The agent activity pipeline has three layers that currently filter out tool visibility:

```
┌──────────────────────────────────────────────────────────────┐
│  Claude CLI / Copilot SDK                                     │
│  Emits: system, assistant (tool_use, thinking), user (tool_result)
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼ LAYER 1: Adapter
┌──────────────────────────────────────────────────────────────┐
│  ClaudeCodeAdapter / SdkCopilotAdapter                        │
│  Currently extracts: text_delta, message, usage, session_*    │
│  IGNORES: tool_use, tool_result, thinking content blocks      │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼ LAYER 2: API Route
┌──────────────────────────────────────────────────────────────┐
│  /api/agents/run/route.ts                                     │
│  broadcastAgentEvent() handles 5 event types                  │
│  SSE broadcast to 'agents' channel (ADR-0007)                 │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼ LAYER 3: Frontend Hook
┌──────────────────────────────────────────────────────────────┐
│  useAgentSSE hook                                             │
│  Listeners for: text_delta, session_status, usage, error      │
│  Updates session state via centralized updateSession()        │
└──────────────────────────────────────────────────────────────┘
```

### Integration Requirements

- **Storage**: New EventStorageService for NDJSON persistence
- **API**: New endpoints for event retrieval (`GET /events`, `GET /events?since=`)
- **SSE**: Extend existing single-channel broadcast (per ADR-0007)
- **UI**: New ToolCallCard and ThinkingBlock components

### Constraints and Limitations

- Claude CLI known bugs: #1920 (missing final result), #2904 (JSON truncation)
- Copilot SDK in technical preview - API may change
- No virtualization for MVP (defer to future if performance issues arise)
- Workspace-slug concept in development - hardcoded for now

### Assumptions

- Claude CLI stream-json format is stable (validated by research)
- Copilot SDK tool.execution_* events work as documented
- Existing SSE infrastructure can handle additional event types
- Users want to see tool activity (validated by user request)

---

## Critical Research Findings

### 🚨 Critical Discovery 01: Event-Sourced Storage Required Before Adapters
**Impact**: Critical
**Sources**: Spec § Architecture Decisions, Research subagent analysis
**Problem**: Spec requires server-side NDJSON storage for session resumability, but no storage implementation exists. Adapters emitting new events without storage means data loss on refresh.
**Root Cause**: Current architecture streams events directly to SSE without persistence.
**Solution**: Implement EventStorageService in Phase 1 BEFORE adapter changes. All events must flow through storage before SSE broadcast.
**Example**:
```typescript
// ❌ WRONG - Events lost on page refresh
adapter.onEvent((event) => sseManager.broadcast(event));

// ✅ CORRECT - Events persisted then broadcast
adapter.onEvent(async (event) => {
  await eventStorage.append(sessionId, event);
  sseManager.broadcast('agents', 'agent_update', { sessionId, eventId: event.id });
});
```
**Action Required**: Phase 1 must implement EventStorageService with append(), getAll(), getSince() methods before any adapter work.
**Affects Phases**: Phase 1, Phase 2, Phase 3

---

### 🚨 Critical Discovery 02: Three-Layer Sync Must Be Atomic
**Impact**: Critical
**Sources**: research-dossier.md § Three-Layer Event Filtering, Architecture analysis
**Problem**: Adding new event types requires synchronized changes across adapter types, SSE schemas, API broadcast, and hook listeners. Partial changes break the pipeline.
**Root Cause**: Discriminated union pattern requires all layers to know about new event types simultaneously.
**Solution**: Define all event types in Phase 1 (shared package), implement parsing in Phase 2, wire up web layer in Phase 3. Each phase must be complete before the next.
**Example**:
```typescript
// packages/shared - Phase 1: Define types FIRST
export interface AgentToolCallEvent extends AgentEventBase {
  type: 'tool_call';
  data: { toolName: string; input: unknown; toolCallId: string; };
}

// Adapter - Phase 2: Parse content blocks
if (block.type === 'tool_use') {
  return { type: 'tool_call', data: { toolName: block.name, ... } };
}

// API Route - Phase 3: Broadcast new type
case 'tool_call':
  sseManager.broadcast('agents', 'agent_tool_call', event.data);
```
**Action Required**: Strict phase ordering. No Phase 2 work until Phase 1 types complete.
**Affects Phases**: Phase 1, Phase 2, Phase 3

---

### High Discovery 03: Claude Content Blocks Already Available
**Impact**: High
**Sources**: research-claude-stream-json.md § Content Block Types
**Problem**: Claude CLI emits tool_use, tool_result, and thinking content blocks inside assistant/user messages, but ClaudeCodeAdapter._translateClaudeToAgentEvent() only extracts text blocks.
**Root Cause**: Original implementation prioritized text streaming; tool visibility was not in scope.
**Solution**: Extend content block parsing in _translateClaudeToAgentEvent() to emit new event types for tool_use, tool_result, thinking blocks.
**Example**:
```typescript
// Current: Only handles text
if (message.content) {
  const textBlocks = message.content.filter((b) => b.type === 'text');
  // ...
}

// Extended: Handle all content block types
for (const block of message.content ?? []) {
  switch (block.type) {
    case 'text':
      yield { type: 'text_delta', data: { content: block.text } };
      break;
    case 'tool_use':
      yield { type: 'tool_call', data: { toolName: block.name, input: block.input, toolCallId: block.id } };
      break;
    case 'tool_result':
      yield { type: 'tool_result', data: { toolCallId: block.tool_use_id, output: block.content, isError: block.is_error } };
      break;
    case 'thinking':
      yield { type: 'thinking', data: { content: block.thinking } };
      break;
  }
}
```
**Action Required**: Parse all content block types in Phase 2 Claude adapter work.
**Affects Phases**: Phase 2

---

### High Discovery 04: Copilot Uses Different Event Model
**Impact**: High
**Sources**: research-copilot-sdk.md § Tool Execution Events, ~/github/copilot-sdk/nodejs/src/generated/session-events.ts
**Problem**: Copilot SDK emits dedicated events for tools (`tool.execution_start`, `tool.execution_complete`) AND reasoning (`assistant.reasoning`, `assistant.reasoning_delta`). Current SdkCopilotAdapter ignores these event types.
**Root Cause**: Different SDK design - Copilot separates tool lifecycle and reasoning from messages.
**Solution**: Add event handlers for:
- `tool.execution_start` → `tool_call`
- `tool.execution_complete` → `tool_result`
- `assistant.reasoning` → `thinking`
- `assistant.reasoning_delta` → `thinking` (streaming)

**Example**:
```typescript
// Add to _translateToAgentEvent() switch statement
case 'tool.execution_start':
  return {
    type: 'tool_call',
    data: {
      toolName: event.data.toolName,
      input: event.data.arguments,
      toolCallId: event.data.toolCallId,
    },
  };
case 'tool.execution_complete':
  return {
    type: 'tool_result',
    data: {
      toolCallId: event.data.toolCallId,
      output: event.data.result?.content ?? '',
      isError: !event.data.success,
    },
  };
case 'assistant.reasoning':
  return {
    type: 'thinking',
    data: {
      content: event.data.content,
      reasoningId: event.data.reasoningId,
    },
  };
```
**Action Required**: Extend Copilot adapter in Phase 2 with new event cases for tools AND reasoning.
**Affects Phases**: Phase 2

---

### High Discovery 05: SSE Schema Extension Pattern Established
**Impact**: High
**Sources**: Codebase exploration (follows ADR-0007 single-channel routing)
**Evidence**: `apps/web/src/lib/schemas/agent-events.schema.ts:121-126`
**Problem**: Need to add new SSE event schemas without breaking existing consumers.
**Solution**: Follow existing pattern - create new schemas, add to agentEventSchemas array, extend discriminated union.
**Example**:
```typescript
// New schemas follow same pattern
export const AgentToolCallEventSchema = agentBaseEventSchema.extend({
  type: z.literal('agent_tool_call'),
  data: z.object({
    sessionId: z.string(),
    toolName: z.string(),
    input: z.unknown(),
    toolCallId: z.string(),
  }),
});

// Add to export array
export const agentEventSchemas = [
  // ... existing
  AgentToolCallEventSchema,
  AgentToolResultEventSchema,
  AgentThinkingEventSchema,
] as const;
```
**Action Required**: Create new Zod schemas in Phase 1, following existing pattern exactly.
**Affects Phases**: Phase 1, Phase 3

---

### High Discovery 06: Component Needs ContentType Discrimination
**Impact**: High
**Sources**: Codebase exploration
**Evidence**: `apps/web/src/components/agents/log-entry.tsx:22-95`
**Problem**: LogEntry discriminates on messageRole ('user'|'assistant'|'system') but spec adds contentType ('text'|'tool_call'|'tool_result'|'thinking'). Need dual discrimination.
**Solution**: Add contentType prop, render different components based on type.
**Example**:
```tsx
// Extend props
interface LogEntryProps {
  messageRole: 'user' | 'assistant' | 'system';
  contentType?: 'text' | 'tool_call' | 'tool_result' | 'thinking';
  // ...
}

// Render by contentType when present
function LogEntry({ messageRole, contentType, ...props }: LogEntryProps) {
  if (contentType === 'tool_call') {
    return <ToolCallCard {...props} />;
  }
  if (contentType === 'thinking') {
    return <ThinkingBlock {...props} />;
  }
  // Default: existing text rendering
}
```
**Action Required**: Phase 4 must add contentType discrimination and new sub-components.
**Affects Phases**: Phase 4

---

### High Discovery 07: Session Destruction Race in Copilot compact()
**Impact**: High
**Sources**: Risk analysis of sdk-copilot-adapter.ts
**Evidence**: `packages/shared/src/adapters/sdk-copilot-adapter.ts:256-299`
**Problem**: Comment warns "Do NOT delegate to run() - run() destroys the session in finally block!" If refactored to use run(), multi-turn sessions break.
**Solution**: Extract shared logic to private method, add runtime assertion, add integration test.
**Example**:
```typescript
// Add assertion at start of compact()
if (!this._session || this._session.destroyed) {
  throw new Error('Cannot compact: session destroyed');
}
```
**Action Required**: Add defensive checks before modifying Copilot adapter in Phase 2.
**Affects Phases**: Phase 2

---

### High Discovery 08: SSE Connection Race Loses Initial Events
**Impact**: High
**Sources**: Risk analysis of route.ts broadcast timing
**Evidence**: `apps/web/app/api/agents/run/route.ts:160-166`
**Problem**: API broadcasts events immediately. If frontend calls /api/agents/run before SSE connects, initial events (session_start, first text_delta) are lost.
**Solution**: Event-sourced storage mitigates this - client fetches events on connect, then subscribes for updates.
**Example**:
```typescript
// Client workflow (spec lines 95-98)
// 1. Connect SSE
// 2. GET /events → render all existing
// 3. On SSE notification → GET /events?since=lastId
// This handles the race because events are fetched, not just streamed
```
**Action Required**: Phase 3 must implement event fetching on connect, not just SSE listening.
**Affects Phases**: Phase 3

---

### Medium Discovery 09: Memory Leak from EventSource Listeners
**Impact**: Medium
**Sources**: Risk analysis of useAgentSSE.ts listener management
**Evidence**: `apps/web/src/hooks/useAgentSSE.ts:169-174, 273-282`
**Problem**: Manual listener management via addEventListener/removeEventListener is error-prone. React strict mode or hot reload can cause listener accumulation.
**Solution**: Use AbortController pattern for atomic listener cleanup.
**Example**:
```typescript
const abortController = new AbortController();
eventSource.addEventListener('event', handler, { signal: abortController.signal });

// Cleanup removes all listeners atomically
abortController.abort();
```
**Action Required**: Refactor listener management in Phase 3 hook updates.
**Affects Phases**: Phase 3

---

### Medium Discovery 10: NDJSON Line Length Validation
**Impact**: Medium
**Sources**: Risk analysis of stream-json-parser.ts validation
**Evidence**: `packages/shared/src/adapters/stream-json-parser.ts:36, 197-209`
**Problem**: Parser validates MAX_LINE_LENGTH (1MB) before extracting any data. Oversized tool output could fail entire run.
**Solution**: Truncate oversized lines with warning instead of rejecting; extract critical fields first.
**Example**:
```typescript
// Truncate instead of reject
if (line.length > MAX_LINE_LENGTH) {
  logger.warn('NDJSON line truncated', { original: line.length, max: MAX_LINE_LENGTH });
  line = line.slice(0, MAX_LINE_LENGTH);
}
```
**Action Required**: Review and potentially adjust validation in Phase 2 adapter work.
**Affects Phases**: Phase 2

---

## Testing Philosophy

### Testing Approach

**Selected Approach**: Full TDD
**Rationale**: Cross-cutting changes across adapters, schemas, storage, and UI require comprehensive test coverage to ensure three-layer synchronization works correctly. Per constitution Principle 3 (TDD).
**Focus Areas**:
- Adapter event parsing (unit tests for Claude content blocks, Copilot tool events)
- SSE event schema validation (Zod schema tests with Test Doc comments)
- EventStorageService (append, query, file operations)
- UI component rendering (React Testing Library for ToolCallCard, ThinkingBlock)
- Integration tests for full event flow (adapter → storage → API → SSE → hook → UI)
- Accessibility tests (ARIA attributes, keyboard navigation)

### Test-Driven Development

Per constitution, follow RED-GREEN-REFACTOR cycle:
1. **RED**: Write test first, verify it fails
2. **GREEN**: Implement minimal code to pass test
3. **REFACTOR**: Improve code quality while keeping tests green

### Test Documentation (Test Doc)

Per constitution R-TEST-003, every test includes 5 required fields:

```typescript
it('should emit tool_call event for tool_use content block', () => {
  /*
  Test Doc:
  - Why: Verify Claude tool invocations are surfaced to UI
  - Contract: tool_use blocks in assistant messages → AgentToolCallEvent
  - Usage Notes: Use fixture from research-claude-stream-json.md
  - Quality Contribution: Catches regressions in tool visibility pipeline
  - Worked Example: { type: 'tool_use', name: 'Bash', input: { command: 'ls' } }
    → { type: 'tool_call', data: { toolName: 'Bash', input: { command: 'ls' } } }
  */
  // test implementation
});
```

### Mock Usage Policy

**Policy**: Targeted mocks per spec (mock external boundaries, real code internally)

Per spec Testing Strategy: "Targeted mocks — mock external SDKs and CLI, use real implementations for internal code"

**Allowed (External Boundaries)**:
- `vi.fn()` for callbacks (e.g., `onToolCall`, `onTextDelta`) to verify invocation
- `mockEventSource` or similar for browser APIs not available in Node test environment
- Existing fakes: `FakeProcessManager`, `FakeCopilotClient`, `FakeEventStorage`

**Not Allowed (Internal Code)**:
- NO `vi.mock()` to replace internal modules
- NO mocking services, adapters, or business logic
- NO `vi.spyOn()` on internal methods

**Rationale**: External boundaries (EventSource, process spawn, SDK calls) need mocking because they're not available in test environment. Internal code should use real implementations with injected fakes for dependencies.

---

## Implementation Phases

### Phase 1: Event Storage Foundation

**Objective**: Create the event persistence infrastructure and extend shared event types that all subsequent phases depend on.

**Deliverables**:
- EventStorageService with NDJSON append/query operations
- New AgentEvent types (tool_call, tool_result, thinking)
- Zod schemas for new SSE event types
- API endpoints for event retrieval
- FakeEventStorage for testing

**Dependencies**: None (foundational phase)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| NDJSON file corruption on crash | Low | Medium | Append-only, fsync on write |
| Event ID collision | Low | Low | Sequential IDs per session (evt_001, evt_002) |
| Disk space exhaustion | Low | Medium | Archive old sessions, warn at threshold |

### Tasks (TDD Approach)

| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 1.1 | [ ] | Write tests for AgentToolCallEvent type | 1 | Tests verify interface shape matches spec | - | test/unit/shared/agent-types.test.ts |
| 1.2 | [ ] | Write tests for AgentToolResultEvent type | 1 | Tests verify interface shape matches spec | - | |
| 1.3 | [ ] | Write tests for AgentThinkingEvent type | 1 | Tests verify interface shape matches spec | - | |
| 1.4 | [ ] | Extend agent-types.ts with new event interfaces | 2 | All tests from 1.1-1.3 pass, union compiles | - | packages/shared/src/interfaces/agent-types.ts |
| 1.5 | [ ] | Write tests for AgentToolCallEventSchema (Zod) | 2 | Schema validates/rejects correct inputs per Test Doc | - | test/unit/web/schemas/agent-events.schema.test.ts |
| 1.6 | [ ] | Write tests for AgentToolResultEventSchema | 2 | Schema validates/rejects correct inputs | - | |
| 1.7 | [ ] | Write tests for AgentThinkingEventSchema | 2 | Schema validates/rejects correct inputs | - | |
| 1.8 | [ ] | Implement new Zod schemas in agent-events.schema.ts | 2 | All schema tests pass | - | apps/web/src/lib/schemas/agent-events.schema.ts |
| 1.9 | [ ] | Write IEventStorage interface | 1 | Interface compiles, methods documented | - | packages/shared/src/interfaces/event-storage.interface.ts |
| 1.10 | [ ] | Write FakeEventStorage implementation | 2 | Fake implements IEventStorage, has test helpers | - | packages/shared/src/fakes/fake-event-storage.ts |
| 1.11 | [ ] | Write tests for EventStorageService.append() | 2 | Tests cover: normal append, ID generation, file creation | - | test/unit/shared/event-storage-service.test.ts |
| 1.12 | [ ] | Write tests for EventStorageService.getAll() | 2 | Tests cover: empty session, multiple events, parse errors | - | |
| 1.13 | [ ] | Write tests for EventStorageService.getSince() | 2 | Tests cover: since ID, missing ID, edge cases | - | |
| 1.14 | [ ] | Implement EventStorageService | 3 | All tests from 1.11-1.13 pass | - | packages/shared/src/services/event-storage.service.ts |
| 1.15 | [ ] | Write tests for GET /api/agents/sessions/:id/events | 2 | Tests cover: all events, empty, 404 | - | test/unit/web/api/agent-events-route.test.ts |
| 1.16 | [ ] | Write tests for GET /events?since= parameter | 2 | Tests cover: since ID filtering | - | |
| 1.17 | [ ] | Implement events API route | 2 | All route tests pass | - | apps/web/app/api/agents/sessions/[sessionId]/events/route.ts |
| 1.18 | [ ] | Register EventStorageService in DI container per ADR-0004 | 1 | Service resolvable using useFactory pattern; prod uses real path, test uses temp dir | - | apps/web/src/lib/di-container.ts |

### Test Examples

```typescript
// test/unit/shared/event-storage-service.test.ts
describe('EventStorageService', () => {
  let service: EventStorageService;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-storage-'));
    service = new EventStorageService(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true });
  });

  it('should append event with sequential ID', async () => {
    /*
    Test Doc:
    - Why: Events need stable IDs for ?since= queries
    - Contract: append() generates evt_001, evt_002, ... sequentially
    - Usage Notes: IDs are session-scoped, not global
    - Quality Contribution: Catches ID generation bugs that break sync
    - Worked Example: append(session, event1) → evt_001; append(session, event2) → evt_002
    */
    const event1 = await service.append('session-1', { type: 'text_delta', data: {} });
    const event2 = await service.append('session-1', { type: 'text_delta', data: {} });

    expect(event1.id).toBe('evt_001');
    expect(event2.id).toBe('evt_002');
  });

  it('should retrieve events since specified ID', async () => {
    /*
    Test Doc:
    - Why: Client needs incremental sync after page refresh
    - Contract: getSince(sessionId, eventId) returns events after eventId
    - Usage Notes: Returns empty array if eventId is latest
    - Quality Contribution: Catches off-by-one errors in sync
    - Worked Example: [evt_001, evt_002, evt_003].getSince(evt_001) → [evt_002, evt_003]
    */
    await service.append('session-1', { type: 'text_delta', data: { content: 'a' } });
    await service.append('session-1', { type: 'text_delta', data: { content: 'b' } });
    await service.append('session-1', { type: 'text_delta', data: { content: 'c' } });

    const events = await service.getSince('session-1', 'evt_001');

    expect(events).toHaveLength(2);
    expect(events[0].id).toBe('evt_002');
    expect(events[1].id).toBe('evt_003');
  });
});
```

### Non-Happy-Path Coverage
- [ ] Concurrent appends to same session
- [ ] Malformed NDJSON in existing file
- [ ] File system permission errors
- [ ] Session ID with special characters
- [ ] Empty event data

### Acceptance Criteria
- [ ] All tests passing (18+ tests)
- [ ] Test coverage > 90% for new code
- [ ] Targeted mocks only (external boundaries)
- [ ] TypeScript strict mode passes
- [ ] Lint passes

### Commands to Verify
```bash
just test                    # All tests pass
just typecheck               # TypeScript strict mode
just lint                    # Biome linter
just build                   # Build succeeds
```

---

### Phase 2: Adapter Event Parsing

**Objective**: Extend both adapters to parse and emit tool_call, tool_result, and thinking events from their respective data sources.

**Deliverables**:
- ClaudeCodeAdapter content block parsing for tool_use, tool_result, thinking
- SdkCopilotAdapter event handlers for tool.execution_start, tool.execution_complete
- Adapter unit tests with fake data
- Contract tests ensuring both adapters emit same event shapes

**Dependencies**: Phase 1 event types must be complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Claude CLI format change | Low | High | Version-pin Claude Code CLI, parse defensively |
| Copilot SDK API change | Medium | Medium | Version-pin SDK, wrap in adapter abstraction |
| Breaking existing text streaming | Medium | High | Run existing tests after changes, preserve text path |

### Tasks (TDD Approach)

| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 2.1 | [ ] | Write tests for Claude tool_use content block parsing | 2 | Tests cover: single tool, multiple tools, input shapes | - | test/unit/shared/claude-code-adapter.test.ts |
| 2.2 | [ ] | Write tests for Claude tool_result content block parsing | 2 | Tests cover: success, error, empty output | - | |
| 2.3 | [ ] | Write tests for Claude thinking content block parsing | 2 | Tests cover: thinking present, absent, signature field | - | |
| 2.4 | [ ] | Implement Claude content block parsing in _translateClaudeToAgentEvent | 3 | All tests from 2.1-2.3 pass | - | packages/shared/src/adapters/claude-code.adapter.ts |
| 2.5 | [ ] | Verify existing Claude text streaming still works | 1 | Existing adapter tests pass unchanged | - | Regression check |
| 2.6 | [ ] | Write tests for Copilot tool.execution_start event | 2 | Tests cover: bash, read, write tools | - | test/unit/shared/sdk-copilot-adapter.test.ts |
| 2.7 | [ ] | Write tests for Copilot tool.execution_complete event | 2 | Tests cover: success, error, result shapes | - | |
| 2.7a | [ ] | Write tests for Copilot assistant.reasoning event | 2 | Tests cover: reasoning present, streaming deltas | - | |
| 2.8 | [ ] | Add defensive checks for Copilot session state | 1 | Assertion throws if session destroyed | - | R1-03 mitigation |
| 2.9 | [ ] | Implement Copilot tool + reasoning event handling in _translateToAgentEvent | 3 | All tests from 2.6-2.7a pass | - | packages/shared/src/adapters/sdk-copilot-adapter.ts |
| 2.10 | [ ] | Verify existing Copilot text streaming still works | 1 | Existing adapter tests pass unchanged | - | Regression check |
| 2.11 | [ ] | Write contract tests for tool event parity | 2 | Both adapters emit same AgentToolCallEvent shape | - | test/contracts/agent-tool-events.contract.ts |
| 2.12 | [ ] | Update FakeAgentAdapter to emit tool events | 2 | Fake can simulate tool call sequences | - | packages/shared/src/fakes/fake-agent-adapter.ts |

### Test Examples

```typescript
// test/unit/shared/claude-code-adapter.test.ts
describe('ClaudeCodeAdapter tool event parsing', () => {
  let adapter: ClaudeCodeAdapter;
  let fakeProcessManager: FakeProcessManager;

  beforeEach(() => {
    fakeProcessManager = new FakeProcessManager();
    adapter = new ClaudeCodeAdapter(fakeProcessManager);
  });

  it('should emit tool_call event for tool_use content block', async () => {
    /*
    Test Doc:
    - Why: Tool invocations must be visible in UI per spec AC1
    - Contract: tool_use block → AgentToolCallEvent with name, input, id
    - Usage Notes: tool_use appears in assistant message content array
    - Quality Contribution: Core tool visibility feature
    - Worked Example: { type: 'tool_use', name: 'Bash', input: { command: 'ls' }, id: 'toolu_123' }
      → { type: 'tool_call', data: { toolName: 'Bash', input: { command: 'ls' }, toolCallId: 'toolu_123' } }
    */
    const events: AgentEvent[] = [];
    fakeProcessManager.setOutput(JSON.stringify({
      type: 'assistant',
      message: {
        content: [{
          type: 'tool_use',
          id: 'toolu_abc123',
          name: 'Bash',
          input: { command: 'ls -la' }
        }]
      }
    }));

    await adapter.run({
      prompt: 'list files',
      onEvent: (e) => events.push(e),
    });

    const toolCallEvent = events.find((e) => e.type === 'tool_call');
    expect(toolCallEvent).toBeDefined();
    expect(toolCallEvent?.data.toolName).toBe('Bash');
    expect(toolCallEvent?.data.input).toEqual({ command: 'ls -la' });
    expect(toolCallEvent?.data.toolCallId).toBe('toolu_abc123');
  });
});
```

### Non-Happy-Path Coverage
- [ ] Malformed content blocks (missing id, name)
- [ ] Mixed content blocks (text + tool_use in same message)
- [ ] tool_result without matching tool_use
- [ ] Thinking block with empty content
- [ ] Copilot tool events without toolCallId

### Acceptance Criteria
- [ ] All tests passing (12+ tests)
- [ ] Existing adapter tests still pass (no regressions)
- [ ] Contract tests verify event parity between adapters
- [ ] Test coverage > 80% for modified code
- [ ] Targeted mocks only (external boundaries)

### Commands to Verify
```bash
just test                    # All tests pass (including existing adapter tests)
just typecheck               # TypeScript strict mode
just lint                    # Biome linter
```

---

### Phase 3: Web Layer Integration

**Objective**: Wire up the event flow from adapters through storage, API routes, and SSE to frontend hooks.

**Deliverables**:
- broadcastAgentEvent() extended with new event types
- useAgentSSE hook extended with new listeners and event fetching
- API route integration with EventStorageService
- Session state extended with tool/thinking events

**Dependencies**: Phase 2 adapters emitting new event types

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| SSE event ordering issues | Medium | Medium | Event IDs provide ordering; client sorts by ID |
| Memory leaks from listeners | Medium | Medium | Use AbortController pattern (R1-05) |
| Race between fetch and SSE | Medium | Low | Fetch on connect, dedupe by event ID |

### Tasks (TDD Approach)

| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 3.1 | [ ] | Write tests for broadcastAgentEvent tool_call case | 2 | Tests verify SSE format matches schema | - | test/unit/web/api/agents-run-route.test.ts |
| 3.2 | [ ] | Write tests for broadcastAgentEvent tool_result case | 2 | Tests verify SSE format matches schema | - | |
| 3.3 | [ ] | Write tests for broadcastAgentEvent thinking case | 2 | Tests verify SSE format matches schema | - | |
| 3.4 | [ ] | Implement new cases in broadcastAgentEvent | 2 | All tests from 3.1-3.3 pass | - | apps/web/app/api/agents/run/route.ts |
| 3.5 | [ ] | Integrate EventStorageService with run route | 2 | Events persisted before broadcast | - | |
| 3.6 | [ ] | Write tests for useAgentSSE tool_call listener | 2 | Tests verify callback invoked with correct data | - | test/unit/web/hooks/useAgentSSE.test.ts |
| 3.7 | [ ] | Write tests for useAgentSSE tool_result listener | 2 | Tests verify callback invoked with correct data | - | |
| 3.8 | [ ] | Write tests for useAgentSSE thinking listener | 2 | Tests verify callback invoked with correct data | - | |
| 3.9 | [ ] | Write tests for event fetching on connect | 2 | Tests verify GET /events called, state populated | - | |
| 3.10 | [ ] | Extend AgentSSECallbacks interface | 1 | New callbacks: onToolCall, onToolResult, onThinking | - | apps/web/src/hooks/useAgentSSE.ts |
| 3.11 | [ ] | Implement new event listeners in hook | 3 | All tests from 3.6-3.9 pass | - | |
| 3.12 | [ ] | Refactor listener management to AbortController | 2 | Memory leak test passes (mount/unmount cycle) | - | R1-05 mitigation |
| 3.13 | [ ] | Extend agent session message schema with contentType | 2 | Schema validates tool_call, tool_result, thinking | - | apps/web/src/lib/schemas/agent-session.schema.ts |
| 3.14 | [ ] | Update session state reducer for new message types | 2 | State correctly stores tool/thinking messages | - | |

### Test Examples

```typescript
// test/unit/web/hooks/useAgentSSE.test.ts
describe('useAgentSSE tool event handling', () => {
  it('should call onToolCall when tool_call event received', async () => {
    /*
    Test Doc:
    - Why: Tool calls must flow from SSE to UI component
    - Contract: agent_tool_call SSE event → onToolCall callback
    - Usage Notes: Event includes sessionId for routing to correct session
    - Quality Contribution: Core visibility pipeline test
    - Worked Example: SSE data: { sessionId: 's1', toolName: 'Bash', ... }
      → onToolCall('Bash', { command: 'ls' }, 'toolu_123', 's1')
    */
    const onToolCall = vi.fn();
    const { result } = renderHook(() =>
      useAgentSSE('agents', { onToolCall })
    );

    // Simulate SSE event
    act(() => {
      mockEventSource.emit('agent_tool_call', {
        sessionId: 'session-1',
        toolName: 'Bash',
        input: { command: 'ls -la' },
        toolCallId: 'toolu_abc123',
      });
    });

    expect(onToolCall).toHaveBeenCalledWith(
      'Bash',
      { command: 'ls -la' },
      'toolu_abc123',
      'session-1'
    );
  });
});
```

### Non-Happy-Path Coverage
- [ ] SSE connection failure during event fetch
- [ ] Malformed SSE event data
- [ ] Event ID mismatch between fetch and SSE
- [ ] Component unmount during fetch
- [ ] Duplicate events (same ID from fetch and SSE)

### Acceptance Criteria
- [ ] All tests passing (14+ tests)
- [ ] No memory leaks (verified by mount/unmount test)
- [ ] Events deduplicated by ID
- [ ] Backward compatible with existing sessions
- [ ] Test coverage > 80% for modified code

### Commands to Verify
```bash
just test                    # All tests pass
just typecheck               # TypeScript strict mode
just lint                    # Biome linter
just dev                     # Dev server starts, SSE connects
```

---

### Phase 4: UI Components

**Objective**: Build accessible, collapsible UI components for displaying tool calls and thinking blocks.

**Deliverables**:
- ToolCallCard component with collapsible output
- ThinkingBlock component with collapsible content
- Extended LogEntry with contentType discrimination
- Accessibility features (ARIA, keyboard nav)

**Dependencies**: Phase 3 hook providing new event data

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Accessibility regressions | Medium | High | Axe testing, manual screen reader test |
| Performance with many tool calls | Low | Medium | Defer virtualization, monitor performance |
| Inconsistent styling | Low | Low | Follow existing component patterns |

### Tasks (TDD Approach)

| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 4.1 | [ ] | Write tests for ToolCallCard rendering | 2 | Tests verify header, status, icons render | - | test/unit/web/components/tool-call-card.test.tsx |
| 4.2 | [ ] | Write tests for ToolCallCard expand/collapse | 2 | Tests verify aria-expanded, content visibility | - | |
| 4.3 | [ ] | Write tests for ToolCallCard auto-expand on error | 2 | Tests verify error state triggers expansion | - | AC12a |
| 4.4 | [ ] | Write tests for ToolCallCard output truncation | 2 | Tests verify 20 lines/2000 chars truncation | - | AC13a |
| 4.5 | [ ] | Implement ToolCallCard component | 3 | All tests from 4.1-4.4 pass | - | apps/web/src/components/agents/tool-call-card.tsx |
| 4.6 | [ ] | Write tests for ThinkingBlock rendering | 2 | Tests verify collapsed by default, distinct styling | - | test/unit/web/components/thinking-block.test.tsx |
| 4.7 | [ ] | Write tests for ThinkingBlock expand/collapse | 2 | Tests verify aria-expanded, keyboard toggle | - | AC6a |
| 4.8 | [ ] | Implement ThinkingBlock component | 2 | All tests from 4.6-4.7 pass | - | apps/web/src/components/agents/thinking-block.tsx |
| 4.9 | [ ] | Write tests for LogEntry contentType discrimination | 2 | Tests verify routing to correct sub-component | - | test/unit/web/components/log-entry.test.tsx |
| 4.10 | [ ] | Extend LogEntry with contentType prop and routing | 2 | All tests pass, existing functionality preserved | - | apps/web/src/components/agents/log-entry.tsx |
| 4.11 | [ ] | Write keyboard navigation tests | 2 | Tests verify Tab, Enter/Space, Escape behavior | - | AC16 |
| 4.12 | [ ] | Implement keyboard event handlers | 2 | All keyboard tests pass | - | |
| 4.13 | [ ] | Add ARIA live region for streaming status | 2 | Screen reader announces status changes | - | AC15 |
| 4.14 | [ ] | Write visual regression tests (screenshot) | 2 | Snapshot tests for tool_call, error, thinking states | - | Optional |

### Test Examples

```typescript
// test/unit/web/components/tool-call-card.test.tsx
describe('ToolCallCard', () => {
  it('should auto-expand when error occurs', async () => {
    /*
    Test Doc:
    - Why: Errors need immediate visibility per AC12a
    - Contract: isError=true → card expands automatically
    - Usage Notes: Override user's collapsed preference on error
    - Quality Contribution: Prevents hidden errors
    - Worked Example: <ToolCallCard isError={true} /> → aria-expanded="true"
    */
    const { getByRole, rerender } = render(
      <ToolCallCard
        toolName="Bash"
        input={{ command: 'npm build' }}
        output=""
        isError={false}
      />
    );

    // Initially collapsed
    expect(getByRole('button')).toHaveAttribute('aria-expanded', 'false');

    // Error occurs
    rerender(
      <ToolCallCard
        toolName="Bash"
        input={{ command: 'npm build' }}
        output="Error: ENOENT"
        isError={true}
      />
    );

    // Auto-expanded
    expect(getByRole('button')).toHaveAttribute('aria-expanded', 'true');
  });

  it('should truncate output at 20 lines or 2000 characters', () => {
    /*
    Test Doc:
    - Why: Long output shouldn't overwhelm UI per AC13a
    - Contract: Output > 20 lines or > 2000 chars shows "Show more"
    - Usage Notes: Click "Show more" to see full output
    - Quality Contribution: Prevents UI performance issues
    - Worked Example: 50-line output → shows 20 lines + "Show more (30 more lines)"
    */
    const longOutput = 'line\n'.repeat(50);
    const { getByText, queryByText } = render(
      <ToolCallCard
        toolName="Bash"
        input={{ command: 'cat file' }}
        output={longOutput}
        isError={false}
        defaultExpanded={true}
      />
    );

    expect(getByText(/Show more/)).toBeInTheDocument();
    expect(queryByText('line\n'.repeat(50))).not.toBeInTheDocument();
  });
});
```

### Non-Happy-Path Coverage
- [ ] Empty tool input/output
- [ ] Very long tool names
- [ ] Unicode/emoji in output
- [ ] Rapid expand/collapse clicks
- [ ] Screen reader announcement of streaming

### Acceptance Criteria
- [ ] All tests passing (14+ tests)
- [ ] ARIA attributes correct (aria-expanded, aria-controls)
- [ ] Keyboard navigation works (Tab, Enter/Space, Escape)
- [ ] Output truncation at 20 lines/2000 chars
- [ ] Auto-expand on error
- [ ] No visual regressions

### Commands to Verify
```bash
just test                    # All tests pass
just typecheck               # TypeScript strict mode
just lint                    # Biome linter
npx @axe-core/cli http://localhost:3000/agents  # Accessibility scan (manual)
```

---

### Phase 5: Integration & Accessibility

**Objective**: End-to-end verification, accessibility testing, and documentation.

**Deliverables**:
- Integration tests for full event flow
- Accessibility verification (screen reader, keyboard)
- Performance testing with large event logs
- Developer documentation for extending event types

**Dependencies**: All previous phases complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| E2E test flakiness | Medium | Low | Use deterministic test data, retry logic |
| Accessibility gaps | Medium | Medium | Manual testing with screen reader |
| Performance regression | Low | Medium | Baseline measurements, alert on regression |

### Tasks (TDD Approach)

| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 5.1 | [x] | Write integration test: Claude tool call → UI display | 3 | Full pipeline from adapter to rendered component | [📋](tasks/phase-5-integration-accessibility/execution.log.md#task-t001-stored-event-to-log-entry-transformer) | Completed · log#task-t001-stored-event-to-log-entry-transformer [^3] |
| 5.2 | [x] | Write integration test: Copilot tool call → UI display | 3 | Full pipeline with different event model | [📋](tasks/phase-5-integration-accessibility/execution.log.md#task-t002-copilot-tool-call-ui) | Completed · log#task-t002-copilot-tool-call-ui [^4] |
| 5.3 | [x] | Write integration test: Session resumption after refresh | 3 | Events fetched from storage, UI restored | [📋](tasks/phase-5-integration-accessibility/execution.log.md#task-t003-session-resumption) | Completed · log#task-t003-session-resumption [^5] |
| 5.4 | [x] | Write integration test: Concurrent tool calls | 2 | Multiple tools render in correct order | [📋](tasks/phase-5-integration-accessibility/execution.log.md#task-t004-concurrent-tool-calls) | Completed · log#task-t004-concurrent-tool-calls [^5] |
| 5.5 | [x] | Perform screen reader testing (VoiceOver/NVDA) | 2 | All interactive elements announced correctly | [📋](tasks/phase-5-integration-accessibility/execution.log.md#task-t005-screen-reader-testing) | Completed · log#task-t005-screen-reader-testing [^6] |
| 5.6 | [x] | Perform keyboard navigation audit | 2 | Full page navigable without mouse | [📋](tasks/phase-5-integration-accessibility/execution.log.md#task-t006-keyboard-navigation) | Completed · log#task-t006-keyboard-navigation [^7] |
| 5.7 | [x] | Run axe-core accessibility scan | 1 | Zero critical/serious violations | [📋](tasks/phase-5-integration-accessibility/execution.log.md#task-t007-axe-core-scan) | Completed · log#task-t007-axe-core-scan [^8] |
| 5.8 | [x] | Performance test: 100 tool calls in session | 2 | UI responsive, no visible lag | [📋](tasks/phase-5-integration-accessibility/execution.log.md#task-t008-performance-100-calls) | Completed · log#task-t008-performance-100-calls [^9] |
| 5.9 | [x] | Performance test: 1000 events in NDJSON file | 2 | Load time < 500ms | [📋](tasks/phase-5-integration-accessibility/execution.log.md#task-t009-performance-1000-events) | Completed · log#task-t009-performance-1000-events [^10] |
| 5.10 | [x] | Write developer guide for adding event types | 2 | Guide covers all 3 layers + tests | [📋](tasks/phase-5-integration-accessibility/execution.log.md#task-t010-developer-guide) | Completed · log#task-t010-developer-guide |
| 5.11 | [x] | Verify backward compatibility with existing sessions | 2 | Old sessions load without contentType field | [📋](tasks/phase-5-integration-accessibility/execution.log.md#task-t011-backward-compatibility) | Completed · log#task-t011-backward-compatibility |
| 5.12 | [x] | Final acceptance criteria checklist | 1 | All 22 ACs verified | [📋](tasks/phase-5-integration-accessibility/execution.log.md#task-t012-acceptance-criteria) | Completed · log#task-t012-acceptance-criteria |

### Test Examples

```typescript
// test/integration/agent-tool-visibility.test.ts

// Fixture from research-claude-stream-json.md § Tool Call Flow
const CLAUDE_TOOL_USE_FIXTURE = JSON.stringify({
  type: 'assistant',
  message: {
    content: [{
      type: 'tool_use',
      id: 'toolu_abc123',
      name: 'Bash',
      input: { command: 'ls -la' }
    }],
    stop_reason: 'tool_use'
  }
});

describe('Agent Tool Visibility Integration', () => {
  it('should display Claude tool call end-to-end', async () => {
    /*
    Test Doc:
    - Why: Verify full pipeline works together
    - Contract: Claude CLI tool_use → storage → SSE → UI component
    - Usage Notes: Uses FakeProcessManager with real adapter
    - Quality Contribution: Catches integration bugs between layers
    - Worked Example:
      CLI outputs tool_use → adapter emits tool_call
      → storage persists → SSE notifies → hook updates
      → ToolCallCard renders with "Bash: ls -la"
    */
    const fakeProcess = new FakeProcessManager();
    fakeProcess.setOutput(CLAUDE_TOOL_USE_FIXTURE);

    // Mount component with real hooks
    const { findByText } = render(<AgentSession sessionId="test-1" />);

    // Trigger agent run
    await userEvent.type(screen.getByRole('textbox'), 'list files');
    await userEvent.click(screen.getByRole('button', { name: /send/i }));

    // Verify tool call visible
    await findByText('Bash');
    await findByText('ls -la');
  });
});
```

### Non-Happy-Path Coverage
- [ ] Malformed events in storage file
- [ ] Network failure during event fetch
- [ ] Browser without ARIA support
- [ ] Very slow network (high latency)
- [ ] Storage permission denied

### Acceptance Criteria
- [ ] All 22 spec acceptance criteria pass
- [ ] Zero axe-core critical/serious violations
- [ ] Screen reader testing complete
- [ ] Keyboard navigation complete
- [ ] Performance baselines established
- [ ] Documentation complete

### Commands to Verify
```bash
just test                    # All tests pass (unit + integration)
just typecheck               # TypeScript strict mode
just lint                    # Biome linter
just build                   # Production build succeeds
just fft                     # Full quality check (fix, format, test)
```

---

## Cross-Cutting Concerns

### Security Considerations

- **Input validation**: All SSE event data validated via Zod schemas before rendering
- **Path traversal**: Session IDs sanitized to prevent directory traversal in storage paths
- **XSS prevention**: Tool output escaped before rendering; use React's built-in escaping
- **Event type injection**: Whitelist allowed SSE event types (R1-09 mitigation)

### Observability

- **Logging**: EventStorageService logs append/query operations with sessionId
- **Metrics**: Track events per session, storage file sizes, query latency
- **Error tracking**: Parse failures logged with truncated line content for debugging

### Documentation

Per spec Documentation Strategy (docs/how/ only):

**Location**: `docs/how/agent-event-types/`

**Files**:
- `1-extending-events.md` - Guide for adding new event types to the pipeline

**Content Structure**:
1. Overview of three-layer event pipeline
2. Step-by-step: Adding a new event type
3. Testing requirements at each layer
4. Common pitfalls and solutions

**Target Audience**: Developers extending agent capabilities

---

## Complexity Tracking

| Component | CS | Label | Breakdown (S,I,D,N,F,T) | Justification | Mitigation |
|-----------|-----|-------|------------------------|---------------|------------|
| EventStorageService | 3 | Medium | S=1,I=1,D=2,N=1,F=0,T=1 | New storage system with file I/O, query semantics | Thorough TDD, temp dir testing |
| Claude Adapter Parsing | 3 | Medium | S=1,I=1,D=1,N=1,F=1,T=1 | Extends existing code, CLI bug handling | Regression tests, defensive parsing |
| useAgentSSE Hook | 3 | Medium | S=1,I=1,D=1,N=1,F=1,T=1 | Memory management, event deduplication | AbortController, integration tests |
| ToolCallCard Component | 3 | Medium | S=1,I=0,D=1,N=1,F=1,T=2 | Accessibility requirements, state management | Axe testing, manual a11y audit |
| Overall Plan | 4 | Large | S=2,I=1,D=2,N=1,F=1,T=1 | Cross-cutting across 3+ layers | Phased delivery, comprehensive tests |

---

## Progress Tracking

### Phase Completion Checklist
- [x] Phase 1: Event Storage Foundation - [Status: Complete]
- [x] Phase 2: Adapter Event Parsing - [Status: Complete]
- [x] Phase 3: Web Layer Integration - [Status: Complete]
- [x] Phase 4: UI Components - [Status: Complete]
- [x] Phase 5: Integration & Accessibility - [Status: COMPLETE]

**Overall Progress**: 5/5 phases (100%) ✓

### STOP Rule
**IMPORTANT**: This plan must be complete before creating tasks. After writing this plan:
1. Run `/plan-4-complete-the-plan` to validate readiness
2. Only proceed to `/plan-5-phase-tasks-and-brief` after validation passes

---

## Subtasks Registry

Mid-implementation detours requiring structured tracking.

| ID | Created | Phase | Parent Task | Reason | Status | Dossier |
|----|---------|-------|-------------|--------|--------|---------|
| 001-subtask-real-agent-multi-turn-tests | 2026-01-27 | Phase 5: Integration & Verification | T003, T004 | Deep-dive into real agent integration tests with multi-turn sessions | [x] Complete | [Link](tasks/phase-5-integration-accessibility/001-subtask-real-agent-multi-turn-tests.md) |
| 002-subtask-client-markdown-rendering | 2026-01-27 | Phase 5: Integration & Accessibility | T002 | Agent text output renders as plain text, need markdown rendering | [x] Complete | [Link](tasks/phase-5-integration-accessibility/002-subtask-client-markdown-rendering.md) |

---

## References

- **Spec**: [better-agents-spec.md](./better-agents-spec.md)
- **Research**: [research-dossier.md](./research-dossier.md)
- **ADR-0004**: [Dependency Injection Container Architecture](../../adr/adr-0004-dependency-injection-container-architecture.md) - DI patterns for EventStorageService registration
- **ADR-0007**: [SSE Single-Channel Routing](../../adr/adr-0007-sse-single-channel-routing.md) - Single-channel event routing pattern
- **Constitution**: [constitution.md](../../project-rules/constitution.md)
- **Architecture**: [architecture.md](../../project-rules/architecture.md)

---

## Change Footnotes Ledger

**NOTE**: This section will be populated during implementation by plan-6a-update-progress.

**Footnote Numbering Authority**: plan-6a-update-progress is the **single source of truth** for footnote numbering across the entire plan.

[^1]: [To be added during implementation via plan-6a]
[^2]: [To be added during implementation via plan-6a]

[^3]: Task 5.1 (T001) - Transformer utility
  - `file:apps/web/src/lib/transformers/stored-event-to-log-entry.ts`

[^4]: Task 5.2 (T002) - Agents page wiring
  - `file:apps/web/app/(dashboard)/agents/page.tsx`

[^5]: Tasks 5.3-5.4 (T003-T004) - Real agent integration tests
  - `file:test/integration/real-agent-multi-turn.test.ts`

[^6]: Task 5.5 (T005) - Session resumption test
  - `file:test/integration/session-resumption.test.ts`

[^7]: Task 5.6 (T006) - Concurrent tools test
  - `file:test/integration/concurrent-tools.test.ts`

[^8]: Task 5.7 (T007) - Performance baseline
  - `file:test/performance/agent-perf.test.ts`

[^9]: Task 5.8 (T008) - Developer documentation
  - `file:docs/how/agent-event-types/1-extending-events.md`

[^10]: Task 5.9 (T009) - Backward compatibility test
  - `file:test/integration/backward-compat.test.ts`

---

**Plan Status**: READY
**Next Step**: Run `/plan-5-phase-tasks-and-brief` to generate Phase 1 task dossier
