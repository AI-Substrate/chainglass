# GitHub Copilot SDK Research Results

**Research Date**: 2026-01-27
**Source**: Perplexity Deep Research

## Executive Summary

The GitHub Copilot SDK (v0.1.16, technical preview) **does support tool execution with dedicated event types**. There are additional event types beyond what our adapter currently handles.

## Key Findings

### Complete Event Types Available

| Event Type | Description | Currently Handled |
|------------|-------------|-------------------|
| `assistant.message` | Final complete response | ✅ Yes |
| `assistant.message_delta` | Streaming content chunks | ✅ Yes |
| `assistant.reasoning` | Complete reasoning block | ❌ No |
| `assistant.reasoning_delta` | Streaming reasoning chunks | ❌ No |
| `assistant.usage` | Token metrics | ✅ Yes |
| `session.idle` | Session ready for next prompt | ✅ Yes |
| `session.error` | Error occurred | ✅ Yes |
| `session.start` | Session created | ❌ No |
| `user.message` | User message added | ❌ No |
| `tool.execution_start` | Tool invocation begins | ❌ No |
| `tool.execution_complete` | Tool execution finished | ❌ No |

### Critical Discovery: Tool Execution Events

The SDK emits dedicated events for tool lifecycle:

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
  result: '...',
  isError: false
}
```

### Custom Tool Definition

```typescript
import { defineTool } from '@github/copilot-sdk';
import { z } from 'zod';

const myTool = defineTool({
  name: 'my_tool',
  description: 'Does something useful',
  parameters: z.object({
    input: z.string()
  }),
  handler: async (params) => {
    // Execute tool
    return { result: '...' };
  }
});

const session = await client.createSession({
  model: 'gpt-4o',
  streaming: true,
  tools: [myTool]
});
```

### toolRequests in Assistant Messages

The `toolRequests` field in `CopilotAssistantMessageEvent`:
- Present when Copilot wants to invoke tools
- Contains: `toolCallId`, `name`, `arguments`, `type`
- Tool visibility primarily through `tool.execution_*` events, not this field

### MCP Integration

Copilot SDK supports Model Context Protocol (MCP):
- Connect to MCP servers for dynamic tool discovery
- Same MCP server can serve both Claude and Copilot
- SDK handles MCP protocol mechanics

### Differences from Claude

| Capability | Claude Code | Copilot SDK |
|------------|-------------|-------------|
| Tool invocation | Autonomous via CLI | Structured via SDK |
| Thinking/reasoning | Extended thinking blocks (`thinking`) | Reasoning events (`assistant.reasoning`) |
| Token tracking | Full (used/total/limit) | Per-turn only |
| MCP support | Native | Supported |
| Session model | CLI process per session | JSON-RPC session |
| Checkpoints | Explicit rollback | Not available |

### Reasoning Events (Updated 2026-01-27)

Copilot SDK **does support reasoning** via dedicated event types:

```typescript
// Complete reasoning block
{
  type: 'assistant.reasoning',
  data: {
    reasoningId: string;
    content: string;
  }
}

// Streaming reasoning (when streaming: true)
{
  type: 'assistant.reasoning_delta',
  data: {
    reasoningId: string;
    deltaContent: string;
  }
}
```

Enable with `streaming: true` in session config to receive `assistant.reasoning_delta` events.

### Limitations Identified

1. **Token metrics per-turn only** - No cumulative session tracking
2. **Token metrics per-turn only** - No cumulative session tracking
3. **Technical preview** - API may have breaking changes
4. **Sequential JSON-RPC** - Single-threaded communication, no concurrent sends

## Implementation Recommendations

1. **Add event handlers for `tool.execution_start` and `tool.execution_complete`**
2. **Add event handlers for `assistant.reasoning` and `assistant.reasoning_delta`**
3. **Register handlers BEFORE calling `send()` or `sendAndWait()`** - events fire immediately
4. **Version-pin `@github/copilot-sdk`** due to technical preview status
5. **Handle tool visibility differently than Claude** - use execution events, not message parsing
6. **Enable `streaming: true`** to receive reasoning_delta events for real-time UI updates

## Event Registration Pattern

```typescript
const session = await client.createSession({
  streaming: true,
  tools: customTools
});

// Register handlers BEFORE sending
session.on((event) => {
  switch (event.type) {
    case 'tool.execution_start':
      console.log(`Tool started: ${event.toolName}`, event.input);
      break;
    case 'tool.execution_complete':
      console.log(`Tool complete: ${event.toolName}`, event.result);
      break;
    case 'assistant.message_delta':
      // Handle streaming text
      break;
  }
});

// Now send message
await session.sendAndWait({ prompt: 'Do something' });
```

## References

- GitHub SDK: github.com/github/copilot-sdk
- Changelog: github.blog/changelog/2026-01-14-copilot-sdk-in-technical-preview/
- Documentation: github.com/github/copilot-sdk/blob/main/nodejs/README.md
