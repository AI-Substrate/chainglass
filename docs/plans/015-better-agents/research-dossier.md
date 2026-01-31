# Research Dossier: Agent Page Fidelity Enhancement

**Plan**: 015-better-agents
**Generated**: 2026-01-27
**Research Query**: "Agent page shows only responses, need visibility into tool calls, thinking, commands"

## Executive Summary

The agents page currently only displays text responses and basic metrics. Both Claude Code CLI and GitHub Copilot SDK emit **rich event data including tool calls, tool results, and thinking blocks** that are being filtered out at multiple layers. This research confirms the data is available and documents how to surface it.

### Key Findings

1. **Claude CLI emits tool_use and tool_result blocks** in assistant/user messages - currently ignored
2. **Copilot SDK has `tool.execution_start` and `tool.execution_complete` events** - not handled
3. **Thinking blocks are available** from Claude when extended thinking is enabled
4. **UI patterns exist** for collapsible tool cards, streaming indicators, and progressive disclosure
5. **Existing scripts** in `scripts/agent/` demonstrate all the event handling patterns needed

### Data Availability Summary

| Data Type | Claude CLI | Copilot SDK | Currently Displayed |
|-----------|-----------|-------------|---------------------|
| Text responses | ✅ Available | ✅ Available | ✅ Yes |
| Token usage | ✅ Available | ✅ Per-turn | ✅ Yes |
| Session status | ✅ Available | ✅ Available | ✅ Yes |
| Tool calls | ✅ In content blocks | ✅ Via events | ❌ No |
| Tool results | ✅ In content blocks | ✅ Via events | ❌ No |
| Thinking/reasoning | ✅ When enabled | ✅ Via `assistant.reasoning` | ❌ No |
| Errors | ✅ Available | ✅ Available | ✅ Partial |

---

## Part 1: Claude Code CLI Stream-JSON Analysis

### Complete Event Types

The Claude CLI with `--output-format=stream-json` emits these message types:

```typescript
type SDKMessage =
  | SDKSystemMessage        // type: 'system', subtype: 'init'
  | SDKAssistantMessage     // type: 'assistant' (contains tool_use blocks)
  | SDKUserMessage          // type: 'user' (contains tool_result blocks)
  | SDKUserMessageReplay    // type: 'user_message_replay'
  | SDKResultMessage        // type: 'result'
  | SDKPartialAssistantMessage  // type: 'stream_event' (raw API events)
  | SDKCompactBoundaryMessage;  // type: 'system', subtype: 'compact_boundary'
```

### Content Block Types (Critical for Tool Visibility)

```typescript
type ContentBlock =
  | TextBlock       // { type: 'text', text: string }
  | ToolUseBlock    // { type: 'tool_use', id: string, name: string, input: object }
  | ToolResultBlock // { type: 'tool_result', tool_use_id: string, content: string, is_error?: boolean }
  | ThinkingBlock;  // { type: 'thinking', thinking: string, signature: string }
```

### Tool Call Flow (Currently Invisible)

When Claude executes a bash command:

**Step 1 - Tool Invocation (assistant message)**:
```json
{
  "type": "assistant",
  "message": {
    "content": [
      {
        "type": "tool_use",
        "id": "toolu_abc123",
        "name": "Bash",
        "input": { "command": "ls -la" }
      }
    ],
    "stop_reason": "tool_use"
  }
}
```

**Step 2 - Tool Result (user message)**:
```json
{
  "type": "user",
  "message": {
    "content": [
      {
        "type": "tool_result",
        "tool_use_id": "toolu_abc123",
        "content": "total 48\ndrwxr-xr-x  5 user user ...",
        "is_error": false
      }
    ]
  }
}
```

### Thinking Blocks (Extended Thinking)

When extended thinking is enabled:
```json
{
  "type": "assistant",
  "message": {
    "content": [
      {
        "type": "thinking",
        "thinking": "Let me analyze this step by step. First I need to...",
        "signature": "abc123..."
      },
      {
        "type": "text",
        "text": "Based on my analysis..."
      }
    ]
  }
}
```

### Known Bugs to Handle

| Bug | Issue | Workaround |
|-----|-------|------------|
| #1920 | Missing final result event | Idle detection (5s) + timeout (60s) |
| #2904 | JSON truncation at fixed positions | Buffer and validate JSON |
| #8126 | Empty result field | Fall back to accumulated streaming content |

---

## Part 2: Copilot SDK Event Analysis

### Complete Event Types

```typescript
type CopilotEvent =
  | { type: 'user.message', ... }
  | { type: 'assistant.message', ... }       // ✅ Currently handled
  | { type: 'assistant.message_delta', ... } // ✅ Currently handled
  | { type: 'assistant.usage', ... }         // ✅ Currently handled
  | { type: 'session.start', ... }           // ❌ Not handled
  | { type: 'session.idle', ... }            // ✅ Currently handled
  | { type: 'session.error', ... }           // ✅ Currently handled
  | { type: 'tool.execution_start', ... }    // ❌ Not handled
  | { type: 'tool.execution_complete', ... } // ❌ Not handled
```

### Tool Execution Events (Critical for Tool Visibility)

```typescript
// When Copilot invokes a tool
{
  type: 'tool.execution_start',
  toolName: 'bash',
  input: { command: 'ls -la' }
}

// When tool execution completes
{
  type: 'tool.execution_complete',
  toolName: 'bash',
  result: 'total 48\ndrwxr-xr-x ...',
  isError: false
}
```

### Key Implementation Detail (DYK-02)

**Event handlers MUST be registered BEFORE calling `send()` or `sendAndWait()`**. Events fire immediately and handlers registered after the call will miss them.

```typescript
// CORRECT ORDER
session.on((event) => { /* handle */ });  // First: register
await session.sendAndWait({ prompt });     // Then: send

// WRONG ORDER - will miss events!
await session.sendAndWait({ prompt });
session.on((event) => { /* handler registered too late */ });
```

### Copilot Limitations vs Claude

| Feature | Claude | Copilot |
|---------|--------|---------|
| Thinking blocks | ✅ Yes | ❌ No |
| Cumulative token tracking | ✅ Yes | ❌ Per-turn only |
| Checkpoints/rollback | ✅ Yes | ❌ No |
| Tool execution events | In content blocks | Dedicated events |

---

## Part 3: Current Architecture Analysis

### Three-Layer Event Filtering (The Problem)

```
┌─────────────────────────────────────────────────────────────┐
│  Claude CLI / Copilot SDK                                   │
│  Emits: system, assistant, tool_use, thinking, result       │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼ FILTERING LAYER 1
┌─────────────────────────────────────────────────────────────┐
│  Adapter Layer (ClaudeCodeAdapter / SdkCopilotAdapter)      │
│  Only extracts: text_delta, message, usage, session_*       │
│  Everything else → 'raw' event                              │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼ FILTERING LAYER 2
┌─────────────────────────────────────────────────────────────┐
│  API Route (/api/agents/run)                                │
│  broadcastAgentEvent() DROPS 'raw' and 'message' events     │
│  Only broadcasts: text_delta, usage, session_*, error       │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼ FILTERING LAYER 3
┌─────────────────────────────────────────────────────────────┐
│  Frontend (useAgentSSE hook)                                │
│  Only listens for: agent_text_delta, agent_usage_update,    │
│  agent_session_status, agent_error                          │
└─────────────────────────────────────────────────────────────┘
```

### Files That Need Changes

| Layer | File | Current Behavior | Needed Change |
|-------|------|------------------|---------------|
| Types | `packages/shared/src/interfaces/agent-types.ts` | 5 event types | Add tool_call, tool_result, thinking |
| Claude Adapter | `packages/shared/src/adapters/claude-code.adapter.ts` | Extracts only text | Parse content blocks for tool_use/tool_result |
| Copilot Adapter | `packages/shared/src/adapters/sdk-copilot-adapter.ts` | 5 events | Handle tool.execution_* events |
| SSE Schema | `apps/web/src/lib/schemas/agent-events.schema.ts` | 4 SSE types | Add agent_tool_call, agent_tool_result |
| API Route | `apps/web/app/api/agents/run/route.ts` | Drops raw events | Broadcast new event types |
| SSE Hook | `apps/web/src/hooks/useAgentSSE.ts` | 4 listeners | Add listeners for new types |
| Message Schema | `apps/web/src/lib/schemas/agent-session.schema.ts` | user/assistant only | Add tool, thinking message roles |
| LogEntry | `apps/web/src/components/agents/log-entry.tsx` | Text only | Render tool calls, thinking |

---

## Part 4: UI Patterns for Agent Activity

### Tool Call Display Pattern (Collapsible Card)

```tsx
<ToolCallCard>
  <ToolHeader>
    <ToolIcon name="bash" />
    <ToolName>Running: ls -la</ToolName>
    <StatusIndicator status="complete" />
    <ExpandToggle />
  </ToolHeader>
  <ToolContent expanded={isExpanded}>
    <ToolInput>{command}</ToolInput>
    <ToolOutput>{output}</ToolOutput>
  </ToolContent>
</ToolCallCard>
```

### Visual Differentiation

| Message Type | Background | Border | Icon |
|--------------|------------|--------|------|
| User | violet-50 | left violet | User |
| Assistant | white | none | Bot |
| Tool Call | zinc-100 | left blue | Terminal |
| Tool Result | zinc-50 | left green | Check |
| Thinking | slate-50 | left gray | Brain |
| Error | red-50 | left red | Alert |

### Accessibility Requirements

```tsx
// Expandable section pattern
<button
  aria-expanded={isExpanded}
  aria-controls="tool-output-id"
>
  Toggle Output
</button>
<div
  id="tool-output-id"
  aria-hidden={!isExpanded}
>
  {output}
</div>

// Streaming content
<div
  aria-live="polite"
  aria-atomic="false"
>
  {streamingContent}
</div>
```

### Performance: Virtualization Required

For conversations with 100+ messages:
```tsx
import { FixedSizeList } from 'react-window';

<FixedSizeList
  height={600}
  itemCount={messages.length}
  itemSize={100}
>
  {({ index, style }) => (
    <MessageItem message={messages[index]} style={style} />
  )}
</FixedSizeList>
```

---

## Part 5: Prior Learnings from scripts/agent/

### Demo Scripts Available

| Script | Purpose | Key Pattern |
|--------|---------|-------------|
| `demo-claude-adapter-streaming.ts` | Full adapter streaming path | onEvent callback |
| `demo-claude-multi-turn.ts` | Context retention across compact | Session ID preservation |
| `demo-claude-streaming.ts` | Raw CLI stream-json parsing | Timeout handling for bug #1920 |
| `demo-copilot-adapter-streaming.ts` | SDK-based streaming | Adapter abstraction |
| `demo-copilot-multi-turn.ts` | Copilot context retention | Same pattern as Claude |
| `demo-copilot-streaming.ts` | Raw SDK event handling | DYK-02 handler registration |

### Critical Learnings (DYK Discoveries)

1. **DYK-02**: Event handlers must be registered BEFORE send operations
2. **DYK-05**: Context survives /compact operations
3. **DYK-07**: Session ID appears in ALL messages, not just first
4. **Bug #1920**: Claude CLI may hang without final result - use idle detection

### Event Types Already Handled in Demos

The demo scripts already handle all the event types we need:
- `text_delta`, `message`, `usage`, `session_start`, `session_idle`, `session_error`, `raw`
- The `raw` events contain the tool_use/tool_result data we need!

---

## Part 6: Implementation Strategy

### Recommended Approach

**Phase 1: Extend Event Types**
1. Add `AgentToolCallEvent` and `AgentToolResultEvent` to `agent-types.ts`
2. Add `AgentThinkingEvent` for Claude extended thinking
3. Update discriminated union

**Phase 2: Update Adapters**
1. Claude: Parse content blocks, emit tool_call/tool_result events
2. Copilot: Handle `tool.execution_start/complete` events
3. Both: Preserve backward compatibility

**Phase 3: Update Web Layer**
1. Extend SSE schemas for new event types
2. Update API broadcast function
3. Add SSE listeners in hook
4. Extend session message schema

**Phase 4: Update UI Components**
1. Create ToolCallCard component
2. Create ThinkingBlock component
3. Update LogEntry for new message types
4. Add collapsible functionality

**Phase 5: Testing**
1. Use existing demo scripts to verify event capture
2. Create integration tests for new UI components
3. Test accessibility with screen readers

---

## Files in This Dossier

- `research-dossier.md` (this file) - Comprehensive summary
- `research-claude-stream-json.md` - Deep research on Claude CLI events
- `research-copilot-sdk.md` - Deep research on Copilot SDK events
- `research-ui-patterns.md` - UI patterns for agent activity display

---

## Next Steps

1. **Run `/plan-1b-specify`** to create feature specification
2. **Or ask clarifying questions** if scope needs refinement
3. **Or proceed to architecture** with `/plan-3-architect`

---

## Research Complete

All external research completed. The data needed for rich agent fidelity is available from both Claude and Copilot - it just needs to be surfaced through the existing event pipeline.
