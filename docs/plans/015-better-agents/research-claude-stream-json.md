# Claude Code CLI Stream-JSON Research Results

**Research Date**: 2026-01-27
**Source**: Perplexity Deep Research

## Executive Summary

The Claude Code CLI's `--output-format=stream-json` provides **comprehensive event coverage** including tool calls, tool results, and thinking blocks. The current implementation is only using a fraction of the available data.

## Key Findings

### Complete Event Types Available

| Event Type | Subtype | Description | Currently Used |
|------------|---------|-------------|----------------|
| `system` | `init` | Session initialization with tools, MCP servers, model | ✅ Yes |
| `system` | `compact_boundary` | Checkpoint markers for context sync | ❌ No |
| `assistant` | - | Full assistant messages with content blocks | ✅ Partial |
| `user` | - | User messages (including tool results) | ❌ No |
| `user_message_replay` | - | Reconstructed prior messages for context | ❌ No |
| `stream_event` | - | Raw API streaming events (when enabled) | ❌ No |
| `result` | `success` | Final completion with metrics | ✅ Yes |
| `result` | `error_*` | Error completion | ❌ No |

### Content Block Types (Inside Assistant Messages)

| Block Type | Description | Currently Handled |
|------------|-------------|-------------------|
| `text` | Standard text responses | ✅ Yes |
| `tool_use` | Tool invocation (id, name, input) | ❌ No |
| `tool_result` | Tool execution output | ❌ No |
| `thinking` | Extended reasoning content | ❌ No |

### Critical Discovery: Tool Use Events ARE Available

When Claude executes a bash command or reads a file:

1. **Tool invocation appears in assistant message** as a `tool_use` content block:
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
    ]
  }
}
```

2. **Tool result appears in user message** as a `tool_result` content block:
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
        "thinking": "Let me analyze this step by step...",
        "signature": "abc123..."
      },
      {
        "type": "text",
        "text": "The answer is..."
      }
    ]
  }
}
```

**Important**: Thinking blocks must be preserved in subsequent API requests for multi-turn conversations with tool use.

### Stream Events (Fine-Grained Streaming)

When `includePartialMessages` is enabled, raw API events are exposed:

- `message_start` - Message begins
- `content_block_start` - Content block begins (text, tool_use, thinking)
- `content_block_delta` - Incremental content (`text_delta`, `input_json_delta`, `thinking_delta`)
- `content_block_stop` - Content block complete
- `message_delta` - Stop reason, usage
- `message_stop` - Message complete

### TypeScript Interface Summary

```typescript
type SDKMessage =
  | SDKSystemMessage        // type: 'system', subtype: 'init'
  | SDKAssistantMessage     // type: 'assistant'
  | SDKUserMessage          // type: 'user' (includes tool results)
  | SDKUserMessageReplay    // type: 'user_message_replay'
  | SDKResultMessage        // type: 'result'
  | SDKPartialAssistantMessage  // type: 'stream_event'
  | SDKCompactBoundaryMessage;  // type: 'system', subtype: 'compact_boundary'

type ContentBlock =
  | TextBlock       // { type: 'text', text: string }
  | ToolUseBlock    // { type: 'tool_use', id: string, name: string, input: object }
  | ToolResultBlock // { type: 'tool_result', tool_use_id: string, content: string, is_error?: boolean }
  | ThinkingBlock;  // { type: 'thinking', thinking: string, signature: string }
```

## Known Bugs & Limitations

1. **Missing Final Result Event** (Bug #1920): CLI may hang without emitting result message after tool execution
2. **JSON Truncation**: Long responses truncated at 4k, 6k, 8k, 10k, 12k, 16k character boundaries
3. **Empty Result Field** (Bug #8126): Result message sometimes has empty `result` field
4. **Input Stream Hanging** (Bug #3187): Piped JSON input can cause hangs

## Implementation Recommendations

1. **Parse ALL message types**, not just system/init, assistant text, and result
2. **Extract content blocks** from assistant messages to find tool_use blocks
3. **Match tool_result blocks** in user messages by `tool_use_id`
4. **Handle streaming** via `stream_event` messages for real-time UI
5. **Implement timeout detection** for bug #1920 workaround
6. **Preserve thinking blocks** when continuing multi-turn conversations

## CLI Flags Affecting Output

| Flag | Effect |
|------|--------|
| `-p` | Headless mode (required for stream-json) |
| `--output-format stream-json` | Enable NDJSON output |
| `--verbose` | Increase logging detail |
| `--permission-mode` | Affects which tools can be invoked |
| `--allowed-tools` | Filter available tools |

## References

- GitHub Issues: #1920, #2904, #8126, #3187, #17406
- SDK: `@anthropic-ai/claude-agent-sdk`
- Documentation: platform.claude.com/docs/en/agent-sdk/typescript
