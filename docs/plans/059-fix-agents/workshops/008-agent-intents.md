# Workshop: Agent Intents — Extraction, Display & Real-Time Updates

**Type**: Integration Pattern
**Plan**: 059-fix-agents
**Spec**: [fix-agents-spec.md](../fix-agents-spec.md)
**Created**: 2026-03-04
**Status**: Draft

**Related Documents**:
- [Workshop 007: Agent → WorkUnitState Registration](007-agent-workunit-registration.md)

**Domain Context**:
- **Primary Domain**: agents (intent extraction + display)
- **Related Domains**: work-unit-state (intent in status), _platform/panel-layout (chip bar)

---

## Purpose

Define how agent intents (what the agent is currently doing) are extracted from adapter event streams, stored, broadcast, and displayed across all UI surfaces — chip bar, agent list, agent detail page, and overlay panel.

## Key Questions Addressed

- What data from adapter events constitutes an "intent"?
- How do we extract intent from each adapter type (Claude Code, Copilot SDK, Copilot CLI)?
- Where should intent be shown in the UI?
- How frequently should intent update (every event? debounced?)?
- Should intent persist across server restarts?

---

## Current State

### What Exists

```
AgentInstance.setIntent(intent: string)
    → persists to storage
    → notifier.broadcastIntent(agentId, intent)
        → SSE 'agent_intent' event
            → useAgentManager refetches (list view)
            → useAgentInstance refetches (detail view)
```

### What's Broken

**Nobody calls `setIntent()`**. The adapters parse events (tool_call, thinking, text_delta) but never extract an intent string from them. The `intent` field on agents is always whatever was set at creation time — never updates during a run.

---

## Intent Sources (Per Adapter)

Each adapter produces events during a run. The best intent source is `tool_call` — it tells us exactly what the agent is doing right now.

| Event Type | Intent Value | Example | Priority |
|-----------|-------------|---------|----------|
| `tool_call` | `toolName` + first arg | "Reading src/auth.ts" | 1 (best) |
| `thinking` | First 60 chars of content | "Analyzing the authentication..." | 2 |
| `text_delta` | — | (streaming text, not intent) | skip |
| `tool_result` | — | (result of action, not current) | skip |
| `message` | First 60 chars | "I'll fix the import..." | 3 (fallback) |

### Intent Extraction Logic

```typescript
function extractIntent(event: AgentEvent): string | null {
  switch (event.type) {
    case 'tool_call': {
      const tool = event.data.toolName;
      const input = event.data.input;
      // Format: "Tool: brief description"
      if (tool === 'Bash' && typeof input === 'string') {
        return `Running: ${truncate(input, 50)}`;
      }
      if ((tool === 'Read' || tool === 'View') && typeof input === 'string') {
        return `Reading ${basename(input)}`;
      }
      if ((tool === 'Write' || tool === 'Edit') && typeof input === 'string') {
        return `Editing ${basename(input)}`;
      }
      return `Using ${tool}`;
    }
    case 'thinking':
      return `Thinking: ${truncate(event.data.content, 50)}`;
    case 'message':
      return truncate(event.data.content, 60);
    default:
      return null;
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

function basename(path: string): string {
  return path.split('/').pop() ?? path;
}
```

### Where to Wire It

In `AgentInstance.run()` — the method that processes adapter events. Each adapter already calls `this._accumulateEvent(event)` for every event received. Add intent extraction there:

```typescript
// In AgentInstance._accumulateEvent() or run() event loop
private _maybeUpdateIntent(event: AgentEvent): void {
  const intent = extractIntent(event);
  if (intent && intent !== this._intent) {
    this.setIntent(intent); // persists + broadcasts
  }
}
```

**Debouncing**: `setIntent` persists to disk and broadcasts SSE on every call. Tool calls happen ~every few seconds (not every frame), so no debounce needed. If thinking events are high-frequency, only extract intent from the first thinking block per turn.

---

## Display Surfaces

### 1. Chip Bar (Top Bar)

**File**: `apps/web/src/components/agents/agent-chip.tsx`

Currently shows intent as a second line under the name. This already works — just needs data.

```
┌──────────────────────────┐
│ ● ✨ Jordo 2             │  ← name
│      Reading auth.ts     │  ← intent (from setIntent)
└──────────────────────────┘
```

**No change needed** — `AgentChip` already renders `intent` prop. The `useRecentAgents` hook fetches from `/api/agents` which includes `intent`. SSE `agent_intent` events trigger refetch.

### 2. Agent List Page

**File**: `apps/web/src/components/agents/agent-list-live.tsx`

Currently shows intent in a small muted line under agent name (line 94-98):

```tsx
{agent.intent && (
  <div className="text-xs text-muted-foreground truncate max-w-48">
    {agent.intent}
  </div>
)}
```

**No change needed** — already renders intent. Just needs data flowing.

### 3. Agent Detail / Chat Page

**File**: `apps/web/app/(dashboard)/workspaces/[slug]/agents/[id]/page.tsx`

The header area shows agent metadata. Intent could be shown here as a live status line.

**Minimal change**: Add intent display in the header area next to status.

### 4. Overlay Panel

**File**: `apps/web/src/components/agents/agent-overlay-panel.tsx`

Header shows agent name + close button. Could show intent as a subtitle.

**Minimal change**: Add intent line under agent name in overlay header.

---

## Data Flow — Complete Pipeline

```
Adapter produces event (tool_call, thinking, etc.)
    │
    ▼
AgentInstance._accumulateEvent(event)
    │
    ├─ store event to NDJSON (existing)
    ├─ notifier.broadcastEvent(event) (existing)
    │
    └─ NEW: extractIntent(event)
         │
         ├─ if intent changed → setIntent(intent)
         │     │
         │     ├─ persist instance metadata (existing)
         │     └─ notifier.broadcastIntent(agentId, intent) (existing)
         │           │
         │           └─ SSE 'agent_intent' → client refetch (existing)
         │
         └─ if no intent or same → skip
```

**Key insight**: Everything downstream already works. We only need to add `extractIntent()` + call `setIntent()` in one place.

---

## Implementation Plan

### Task 1: Add `extractIntent()` utility

**File**: `packages/shared/src/features/019-agent-manager-refactor/intent-extractor.ts` (new)

Pure function, no dependencies. Maps AgentEvent → intent string or null.

### Task 2: Wire into AgentInstance event accumulation

**File**: `packages/shared/src/features/019-agent-manager-refactor/agent-instance.ts`

In the event processing loop (inside `run()`), call `extractIntent()` and `setIntent()` if changed.

### Task 3: Verify intent shows in chip bar

**Already wired** — `AgentChip` renders `intent` prop, `useRecentAgents` includes `intent` from API. Just verify visually.

### Task 4: Add intent to overlay panel header

**File**: `apps/web/src/components/agents/agent-overlay-panel.tsx`

Show intent as a muted subtitle under agent name. The `useAgentInstance` hook already has `agent.intent`.

**Total: ~40 lines of new code (extractIntent function + wiring call). No new SSE channels, no new hooks, no API changes.**

---

## Open Questions

### Q1: Should intent update on every tool_call or only certain tools?

**RESOLVED**: Every tool_call. They're infrequent enough (one per few seconds) and each represents a meaningful action the agent is taking.

### Q2: Should thinking content be used as intent?

**RESOLVED**: Yes, but only if no tool_call is active. Thinking is lower priority because tool calls are more concrete and user-friendly.

### Q3: Should intent be cleared when agent stops?

**RESOLVED**: No — keep the last intent so the user can see what the agent was doing when it stopped. The status indicator (grey dot = idle) already communicates that it's no longer active.

### Q4: What about very long tool inputs?

**RESOLVED**: Truncate to 50-60 chars. The intent is a summary, not a full description. Hover tooltip on the chip can show the full value.
