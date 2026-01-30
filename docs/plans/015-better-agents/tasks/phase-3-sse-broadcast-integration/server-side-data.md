# Server-Side Data Design Workshop

**Purpose**: Define the server-side data model for agent sessions before implementation.
**Status**: DRAFT - Workshop document
**Date**: 2026-01-27

---

## Goals

1. **Cross-browser**: Same session viewable from Chrome, Firefox, Safari
2. **Cross-machine**: Start on laptop, continue on desktop
3. **Refresh-resilient**: Full state restored after browser refresh
4. **Real-time**: SSE notifications trigger refetch for live updates

---

## Current State (What Exists TODAY)

### What IS a Session? (From Plan 012 Implementation)

A session is a **conversation with an agent**. User creates one in the UI, types prompts, agent responds. Multiple sessions can exist simultaneously, each with a different agent.

**Current Schema** (`apps/web/src/lib/schemas/agent-session.schema.ts`):
```typescript
{
  id: string,                      // "session-1738123456-abc123"
  name: string,                    // "Session abc"
  agentType: 'claude-code' | 'copilot',
  status: 'idle' | 'running' | 'waiting_input' | 'completed' | 'archived',
  messages: Array<{
    role: 'user' | 'assistant',
    content: string,
    timestamp: number              // epoch ms
  }>,
  createdAt: number,
  lastActiveAt: number,
  contextUsage?: number,           // 0-100%
  agentSessionId?: string          // Agent's internal session ID for resumption
}
```

**Session Lifecycle**:
```
User clicks "+ New Agent"
    ↓
Session created (status='idle', messages=[])
    ↓
User types prompt, clicks send
    ↓
POST /api/agents/run → status='running'
    ↓
SSE streams: text_delta, status, usage events
    ↓
Stream complete → status='completed', message finalized
    ↓
User can continue conversation or archive
```

### What's the Problem?

**Today**: Sessions are stored in **React state** (in-memory `Map`) and optionally **localStorage** via `AgentSessionStore`. Events stream via SSE but are NOT persisted server-side.

**Result**:
- ❌ Refresh browser → session gone (unless localStorage hydration works)
- ❌ Open in different browser → session doesn't exist
- ❌ Open on different machine → session doesn't exist
- ❌ Tool calls, thinking events → streamed but not saved

### Phase 1 Deliverables (Ready to Use)

**EventStorageService** (`packages/shared/src/services/event-storage.service.ts`)
- Writes NDJSON files to disk
- Path: `.chainglass/workspaces/<workspace>/sessions/<sessionId>/events.ndjson`
- Methods: `append()`, `getAll()`, `getSince()`, `archive()`, `exists()`

**Event Schemas** (`packages/shared/src/schemas/agent-event.schema.ts`)
```typescript
AgentToolCallEventSchema     // tool_call events
AgentToolResultEventSchema   // tool_result events  
AgentThinkingEventSchema     // thinking events
```

**Events API Route** (`apps/web/app/api/agents/sessions/[sessionId]/events/route.ts`)
- `GET /api/agents/sessions/:sessionId/events` → All events
- `GET /api/agents/sessions/:sessionId/events?since=<eventId>` → Events after ID

### The Gap

We have:
- ✅ Client-side session model (schema, state machine)
- ✅ Server-side event storage (EventStorageService)
- ✅ SSE for real-time streaming

We're missing:
- ❌ Server-side session metadata persistence
- ❌ Connection between session and its events
- ❌ API to fetch full session state (metadata + events)

---

## Questions to Resolve

### Q1: What is a "Session"? ✅ DECIDED

**Decision**: Option C - Hybrid (metadata.json + events.ndjson)

A session is **a conversation container** with:
- **Metadata** (identity, configuration, status) → `metadata.json`
- **Events** (everything that happened) → `events.ndjson`

```
.chainglass/workspaces/default/sessions/
  sess-123/
    metadata.json     # Who/what/when - changes rarely
    events.ndjson     # What happened - append-only stream
```

**Why separate?**
- Metadata changes rarely (status updates, rename)
- Events append constantly during streaming
- "List all sessions" reads only metadata files (fast)
- Clean separation: identity vs history

---

### Q2: What Goes in metadata.json? ✅ DECIDED

**Decision**: Keep it minimal. Store what you need to display session list and resume.

```typescript
interface SessionMetadata {
  // Identity
  id: string;                 // "sess-1738123456-abc123"
  name: string;               // User-provided or auto-generated
  
  // Configuration  
  agentType: 'claude-code' | 'copilot';
  agentSessionId?: string;    // Agent's internal ID for resume capability
  
  // State
  status: 'idle' | 'running' | 'waiting_input' | 'completed' | 'error' | 'archived';
  
  // Timestamps (ISO strings)
  createdAt: string;
  updatedAt: string;          // Last activity
  
  // Usage (updated during/after runs)
  contextUsage?: number;      // 0-100%, for UI display
  tokensUsed?: number;
  
  // Error info (if status='error')
  error?: {
    message: string;
    code?: string;
  };
}
```

**What's NOT in metadata:**
- ❌ `prompt` - That's just the first user message event
- ❌ `messageCount` - Derive from events if needed, don't cache
- ❌ `messages[]` - Those are events

**Rationale:**
- Metadata = "what do I need to show the session list and resume?"
- Events = "what happened in this session?"
- `contextUsage` in metadata so UI can display it without scanning events

---

### Q3: What Events Already Exist?

From current `useAgentSSE` and `broadcastAgentEvent`:

| Event Type | Payload | Notes |
|------------|---------|-------|
| `agent_text_delta` | `{ delta, sessionId }` | Incremental text |
| `agent_session_status` | `{ status, sessionId }` | running/complete/error |
| `agent_usage_update` | `{ tokensUsed, tokensTotal, tokensLimit, sessionId }` | Token tracking |
| `agent_error` | `{ message, code, sessionId }` | Error info |

From Phase 1/2 (new events):

| Event Type | Payload | Notes |
|------------|---------|-------|
| `tool_call` | `{ toolName, input, toolCallId }` | Tool invocation |
| `tool_result` | `{ toolCallId, output, isError }` | Tool response |
| `thinking` | `{ content, signature? }` | Reasoning |

### Q3: Which Events Do We Persist? ✅ DECIDED

**Decision**: Store ALL events, filter in code

Rationale:
- No premature optimization - we don't know what we'll need yet
- NDJSON makes line-by-line filtering cheap on read
- Full replay capability available if needed
- Can analyze actual usage patterns later and optimize
- Simpler implementation - no filtering logic needed initially

Future optimization (not now):
- If storage becomes an issue, add compaction (deltas → final)
- If needed, add retention policies per event type

---

### Q4: How Do We Handle Text Streaming?

Text comes as many `text_delta` events. Options:

**Option A: Store every delta**
```ndjson
{"type":"text_delta","delta":"Hello"}
{"type":"text_delta","delta":" world"}
{"type":"text_delta","delta":"!"}
```
- Client reconstructs full text
- Preserves exact stream history

**Option B: Store only final text**
```ndjson
{"type":"message","role":"assistant","content":"Hello world!"}
```
- Cleaner, but loses streaming history
- When do we write? (stream complete signal needed)

**Option C: Compact on completion**
```ndjson
// During streaming: many deltas
{"type":"text_delta","delta":"Hello",...}
{"type":"text_delta","delta":" world",...}
// On completion: write final + mark deltas as superseded
{"type":"message_complete","content":"Hello world!","supersedes":["evt-1","evt-2"]}
```

**Decision: Option A - Store every delta, return raw events**

Rationale:
- Consistent with Q3 (store all, filter in code)
- No completion detection needed
- No compaction logic needed  
- Client reconstructs text from deltas
- Can optimize/compact later if storage becomes an issue

API behavior:
- `GET /api/agents/sessions/:sessionId/events` → Returns raw NDJSON events
- Client iterates events and assembles text from `text_delta` events
- React Query caches the assembled result

---

### Q5: Session Lifecycle Events? ✅ DECIDED

**Decision: Option C - Status in metadata only**

- `metadata.json` has `status` field (idle/running/completed/error/archived)
- Events are pure content stream - no lifecycle markers
- Status changes update metadata, not events

Rationale:
- Clean separation: metadata = current state, events = history
- No redundancy between event stream and metadata
- Simpler mental model
- Status is queryable without scanning events

Flow:
1. Session starts → write `metadata.json` with `status: 'running'`
2. Events stream → append to `events.ndjson`
3. Session ends → update `metadata.json` with `status: 'completed'`
4. Error occurs → update `metadata.json` with `status: 'error'`, `error: {...}`

---

## Summary: Server-Side Data Model

All questions resolved. Here's the complete picture:

### Storage Structure
```
.chainglass/workspaces/default/sessions/
  sess-123/
    metadata.json     # Identity, config, current status
    events.ndjson     # Append-only event stream
```

### metadata.json
```typescript
interface SessionMetadata {
  id: string;                    // "sess-1738123456-abc123"
  name: string;
  agentType: 'claude-code' | 'copilot';
  agentSessionId?: string;       // For agent resume
  status: 'idle' | 'running' | 'waiting_input' | 'completed' | 'error' | 'archived';
  createdAt: string;             // ISO
  updatedAt: string;             // ISO
  contextUsage?: number;         // 0-100%
  tokensUsed?: number;
  error?: { message: string; code?: string; };
}
```

### events.ndjson
- Store ALL events (text_delta, tool_call, tool_result, thinking, etc.)
- No filtering on write - filter on read if needed
- Client reconstructs text from deltas
- Can optimize/compact later if storage becomes issue

### API Endpoints
```
GET  /api/agents/sessions                    → List sessions (metadata only)
GET  /api/agents/sessions/:id                → Get session metadata
GET  /api/agents/sessions/:id/events         → Get all events (NDJSON)
GET  /api/agents/sessions/:id/events?since=X → Events after ID (for polling)
POST /api/agents/sessions                    → Create session
PATCH /api/agents/sessions/:id               → Update metadata (status, name)
```

### SSE Notifications
```typescript
// Tiny notification - just hints that something changed
{ type: 'session_updated', sessionId: 'sess-123' }
```

Client receives notification → invalidates React Query → refetches via REST

---

## Decisions Log

| Q# | Question | Decision | Rationale |
|----|----------|----------|-----------|
| Q1 | Session structure | Hybrid (metadata.json + events.ndjson) | Separate concerns, different access patterns |
| Q2 | Metadata fields | Minimal (id, name, agentType, status, timestamps, contextUsage, error) | Don't over-engineer |
| Q3 | Which events to persist | All events, filter in code | No premature optimization |
| Q4 | Text streaming | Store every delta, return raw, client reconstructs | Simple, optimizable later |
| Q5 | Lifecycle events | Status in metadata only | Clean separation of state vs history |

```ndjson
{"type":"session_created","prompt":"Help me...","timestamp":"..."}
{"type":"session_started","timestamp":"..."}
{"type":"tool_call",...}
{"type":"tool_result",...}
{"type":"text_delta",...}
{"type":"session_completed","timestamp":"...","tokensUsed":1234}
```

Or derive status from event presence?
- Has events but no `session_completed` → running
- Has `session_completed` → complete
- Has `session_error` → error

**Current leaning**: ?

---

## Proposed Data Model

### Directory Structure

```
.chainglass/
  workspaces/
    default/                          # Workspace (hardcoded for now)
      sessions/
        sess-abc123/
          metadata.json               # Session metadata
          events.ndjson               # Event stream
        sess-def456/
          metadata.json
          events.ndjson
```

### metadata.json Schema

```typescript
interface SessionMetadata {
  id: string;                         // "sess-abc123"
  status: 'pending' | 'running' | 'complete' | 'error';
  prompt: string;                     // Original user prompt
  model?: string;                     // "claude-3-opus" etc
  created: string;                    // ISO timestamp
  updated: string;                    // ISO timestamp
  tokensUsed?: number;
  tokensLimit?: number;
  error?: {
    message: string;
    code?: string;
  };
}
```

### events.ndjson Format

Each line is a JSON object with common fields + type-specific data:

```typescript
interface BaseEvent {
  id: string;                         // "evt_2026-01-27T04:30:00.000Z_abc123"
  type: string;                       // Event type discriminator
  timestamp: string;                  // ISO timestamp
  sessionId: string;                  // Parent session
}

// Tool call started
interface ToolCallEvent extends BaseEvent {
  type: 'tool_call';
  toolName: string;
  toolCallId: string;
  input: Record<string, unknown>;
}

// Tool call completed
interface ToolResultEvent extends BaseEvent {
  type: 'tool_result';
  toolCallId: string;
  output: string;
  isError: boolean;
}

// Thinking/reasoning
interface ThinkingEvent extends BaseEvent {
  type: 'thinking';
  content: string;
  signature?: string;                 // Claude extended thinking
}

// Text delta (streaming)
interface TextDeltaEvent extends BaseEvent {
  type: 'text_delta';
  delta: string;
  messageIndex?: number;              // Which message this belongs to
}

// Message complete (after streaming)
interface MessageCompleteEvent extends BaseEvent {
  type: 'message_complete';
  role: 'assistant' | 'user';
  content: string;
  contentType: 'text' | 'tool_call' | 'tool_result' | 'thinking';
}

// Status change
interface StatusEvent extends BaseEvent {
  type: 'status';
  status: 'running' | 'complete' | 'error';
  error?: { message: string; code?: string };
}

// Usage update
interface UsageEvent extends BaseEvent {
  type: 'usage';
  tokensUsed: number;
  tokensTotal?: number;
  tokensLimit?: number;
}
```

---

## API Design

### Endpoints

**GET /api/agents/sessions**
List all sessions (metadata only)

```typescript
Response: {
  sessions: SessionMetadata[];
}
```

**GET /api/agents/sessions/:sessionId**
Get single session with events

```typescript
Response: {
  metadata: SessionMetadata;
  events: Event[];
}
```

**GET /api/agents/sessions/:sessionId/events**
Get events only (existing endpoint)

```typescript
Response: {
  events: Event[];
}

// With ?since=evt_xxx
Response: {
  events: Event[];  // Only events after specified ID
}
```

**POST /api/agents/run**
Start new session (existing endpoint, may need updates)

```typescript
Request: {
  prompt: string;
  model?: string;
}

Response: {
  sessionId: string;
  // ... streaming happens via SSE
}
```

---

## SSE Notification Design

### Current (Full Payload)
```typescript
// Server broadcasts
sseManager.broadcast('agents', 'agent_tool_call', {
  sessionId: 'sess-123',
  toolName: 'Bash',
  input: { command: 'ls -la' },
  toolCallId: 'toolu_abc',
});

// Client receives full data, updates state directly
```

### Proposed (Notification Only)
```typescript
// Server broadcasts
sseManager.broadcast('agents', 'session_updated', {
  sessionId: 'sess-123',
  // No payload - just notification
});

// Client receives notification
// → invalidates React Query cache
// → triggers GET /api/agents/sessions/:sessionId
// → UI updates with fresh data
```

### Batching Consideration

If agent emits 10 events in 100ms:
- **Option A**: 10 SSE notifications → 10 refetches (wasteful)
- **Option B**: Debounce/batch → 1 notification after 100ms quiet period
- **Option C**: Rate limit → Max 1 notification per 500ms per session

**Current leaning**: Option B or C?

---

## Open Questions

1. [ ] Q1: Session = Events only, or Metadata + Events?
2. [ ] Q2: Where does metadata live?
3. [ ] Q3: Which events do we persist?
4. [ ] Q4: How do we handle text streaming?
5. [ ] Q5: Explicit lifecycle events or derived status?
6. [ ] Notification batching strategy?
7. [ ] Do we need a sessions list endpoint?
8. [ ] How do we clean up old sessions? (TTL? Manual archive?)

---

## Next Steps

After resolving questions:
1. Update EventStorageService if needed
2. Create SessionStorageService for metadata
3. Update/create API endpoints
4. Update tasks.md with finalized design
