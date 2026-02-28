# Research Report: CopilotCLI Adapter (tmux + events.jsonl)

**Generated**: 2026-02-27T23:28:00Z
**Research Query**: "New CopilotCLI adapter using tmux send-keys for input and events.jsonl file watching for output"
**Mode**: Pre-Plan (Plan 057)
**Location**: docs/plans/057-copilot-cli-adapter/research-dossier.md
**FlowSpace**: Available
**Findings**: 65+ across 8 subagents

## Executive Summary

### What We're Building
A new `IAgentAdapter` implementation called `CopilotCLIAdapter` that controls the Copilot CLI via **tmux send-keys** (input) and **events.jsonl file watching** (output), as an alternative to the existing `SdkCopilotAdapter` which uses the `@github/copilot-sdk` programmatically.

### Why This Approach
The SDK adapter can't share sessions with a running Copilot CLI TUI. The CLI adapter enables:
- **Dual-view**: Web UI observes an agent session while user also interacts via terminal
- **No SDK dependency**: Uses the CLI binary directly, avoiding SDK version coupling
- **Rich event data**: `events.jsonl` contains 30+ event types including tool calls, reasoning, usage

### Key Insights
1. **IAgentAdapter is a 3-method interface** — `run()`, `compact()`, `terminate()` returning `Promise<AgentResult>`. Adding a new adapter is purely additive.
2. **events.jsonl is the goldmine** — Contains full structured events (user messages, assistant responses, tool calls, reasoning, usage) as append-only NDJSON at `~/.copilot/session-state/{sessionId}/events.jsonl`
3. **tmux send-keys works** — Proven in prototype: separate text and Enter sends, reliable input injection into the Copilot TUI

### Quick Stats
- **Interface**: 3 methods, 8 event types, 5 result fields
- **Existing Adapters**: ClaudeCodeAdapter (subprocess), SdkCopilotAdapter (SDK), FakeAgentAdapter (test)
- **Test Infrastructure**: Contract tests, integration tests, e2e tests — new adapter must pass all
- **Domain Impact**: Zero — adapters are infrastructure, no new contracts needed

## How the Existing System Works

### IAgentAdapter Interface
```typescript
export interface IAgentAdapter {
  run(options: AgentRunOptions): Promise<AgentResult>;
  compact(sessionId: string): Promise<AgentResult>;
  terminate(sessionId: string): Promise<AgentResult>;
}
```

### AgentRunOptions
```typescript
interface AgentRunOptions {
  prompt: string;
  sessionId?: string;      // Resume existing session
  cwd?: string;            // Working directory
  onEvent?: AgentEventHandler;  // Real-time streaming callback
}
```

### AgentResult
```typescript
interface AgentResult {
  output: string;
  sessionId: string;
  status: 'completed' | 'failed' | 'killed';
  exitCode: number;
  tokens: TokenMetrics | null;
}
```

### AgentEvent Types
```typescript
type AgentEvent =
  | AgentTextDeltaEvent      // type: 'text_delta' — streaming content
  | AgentMessageEvent        // type: 'message' — final message
  | AgentUsageEvent          // type: 'usage' — token metrics
  | AgentSessionEvent        // type: 'session_start' | 'session_idle' | 'session_error'
  | AgentToolCallEvent       // type: 'tool_call' — tool invocation
  | AgentToolResultEvent     // type: 'tool_result' — tool execution result
  | AgentThinkingEvent       // type: 'thinking' — extended thinking
  | AgentRawEvent;           // type: 'raw' — provider-specific passthrough
```

### Adapter Selection (Factory Pattern)
```typescript
const adapterFactory = (agentType: string): IAgentAdapter => {
  if (agentType === 'claude-code') return new ClaudeCodeAdapter(processManager);
  if (agentType === 'copilot') return new SdkCopilotAdapter(copilotClient);
  // NEW: if (agentType === 'copilot-cli') return new CopilotCLIAdapter(tmuxConfig);
  throw new Error(`Unknown agent type: ${agentType}`);
};
```

## CopilotCLI Adapter Design

### Input: tmux send-keys
```typescript
// Send prompt to Copilot CLI running in tmux pane
execSync(`tmux send-keys -t ${tmuxTarget} ${JSON.stringify(prompt)}`);
execSync(`tmux send-keys -t ${tmuxTarget} Enter`);  // Separate call required
```

### Output: events.jsonl File Watching
```
~/.copilot/session-state/{sessionId}/events.jsonl

{"type":"user.message","data":{"content":"..."},"timestamp":"..."}
{"type":"assistant.turn_start","data":{"turnId":"0"},"timestamp":"..."}
{"type":"tool.execution_start","data":{"toolCallId":"...","toolName":"view","arguments":{...}},"timestamp":"..."}
{"type":"tool.execution_complete","data":{"toolCallId":"...","success":true,"result":{...}},"timestamp":"..."}
{"type":"assistant.message","data":{"content":"...","toolRequests":[]},"timestamp":"..."}
{"type":"session.idle","data":{},"timestamp":"..."}
```

### Event Type Mapping (events.jsonl → AgentEvent)

| events.jsonl type | AgentEvent type | Data mapping |
|---|---|---|
| `user.message` | (skip — outbound) | — |
| `assistant.message_delta` | `text_delta` | `data.deltaContent` → `content` |
| `assistant.message` | `message` | `data.content` → `content` |
| `assistant.reasoning` | `thinking` | `data.content` → `content` |
| `assistant.reasoning_delta` | `thinking` (delta) | `data.deltaContent` → `content` |
| `tool.execution_start` | `tool_call` | `data.toolName`, `data.arguments`, `data.toolCallId` |
| `tool.execution_complete` | `tool_result` | `data.result`, `data.success`, `data.toolCallId` |
| `assistant.usage` | `usage` | `data.inputTokens`, `data.outputTokens` |
| `session.start` | `session_start` | `data.sessionId` |
| `session.idle` | `session_idle` | — |

### Session Lifecycle

```
run(prompt, sessionId?):
  1. If no sessionId → spawn `copilot` in tmux pane, extract sessionId from events.jsonl
  2. If sessionId → `copilot --resume {sessionId}` in tmux pane
  3. Start watching events.jsonl (fs.watch + polling fallback)
  4. Send prompt via tmux send-keys
  5. Emit AgentEvents via onEvent callback as new lines appear
  6. Detect session.idle → collect final output → return AgentResult

compact(sessionId):
  1. Send "/compact" via tmux send-keys
  2. Wait for session.idle
  3. Return AgentResult with updated token counts

terminate(sessionId):
  1. Send Ctrl+C via tmux send-keys: `tmux send-keys -t {target} C-c`
  2. Wait for process exit (poll tmux pane status)
  3. Return AgentResult with status='killed', exitCode=137
```

### Constructor Options
```typescript
interface CopilotCLIAdapterOptions {
  tmuxSession: string;     // e.g. "studio"
  tmuxPane: string;        // e.g. "1.0"
  sessionDir?: string;     // default: ~/.copilot/session-state/
  pollIntervalMs?: number; // default: 500
  logger?: ILogger;
}
```

## Prior Learnings (Critical for Implementation)

| ID | Type | Key Insight | Action |
|----|------|-------------|--------|
| PL-01 | Critical | Events must flow through storage BEFORE broadcast | Adapter emits events from file (already stored) — naturally correct |
| PL-03 | High | Claude content blocks vs Copilot event model differ | Map events.jsonl types to AgentEvent union carefully |
| PL-04 | Medium | compact() must NOT destroy session | Don't kill tmux pane on compact |
| PL-07 | Decision | Silent skip for malformed NDJSON | Skip corrupt lines, don't fail session |
| PL-09 | Security | Path traversal in session IDs | Validate sessionId before constructing file paths |
| PL-12 | Gotcha | Event handler timing: subscribe before send | Start file watcher BEFORE sending prompt |
| PL-13 | Technical | /compact works as prompt text | Send "/compact" via tmux, not special API |

## Testing Strategy

### Contract Tests (Required)
```typescript
// Add to test/contracts/agent-adapter.contract.test.ts
agentAdapterContractTests('CopilotCLIAdapter', () => 
  new CopilotCLIAdapter(fakeTmuxExecutor, { sessionDir: tmpDir })
);
```

### Unit Tests (with FakeTmuxExecutor)
- Mock tmux send-keys via injectable executor
- Use fixture events.jsonl files for parsing tests
- Test event translation for all 10+ event types

### Integration Tests (gated)
```typescript
describe.skipIf(!hasCopilotCli() || isCI())('CopilotCLIAdapter integration', () => {
  // Real CLI, real tmux, 60s timeout
});
```

## Domain Context

- **Domain**: Infrastructure adapter (no domain boundary changes)
- **Location**: `packages/shared/src/adapters/copilot-cli.adapter.ts`
- **Registration**: One-liner in adapter factory
- **Zero coupling**: Adapter is stateless I/O bridge, doesn't know about workflows/orchestration

## Proven Prototype

Working prototypes in `scratch/`:
- **`session-watcher.ts`** — Tails events.jsonl, sends prompts via tmux, color-coded output
- **`dual-client-prototype.ts`** — SDK headless server with polling
- **`dual-client-connect.ts`** — Second SDK client on shared server

The session-watcher proves the full read/write loop works end-to-end.

## Modification Considerations

### Safe to Modify
- Adapter factory (add one `if` branch)
- Contract test file (add one `agentAdapterContractTests` call)
- DI container registration (add factory case)

### Modify with Caution
- AgentEvent types (if new events needed — must update all consumers)
- Session ID validation (security-sensitive)

### Extension Points
- `AgentType` union: add `'copilot-cli'`
- Adapter factory: add routing case
- Contract tests: add implementation

## Next Steps

1. Run `/plan-1b-v2-specify` to create feature specification
2. Run `/plan-3-v2-architect` to create implementation plan
3. Implement adapter + contract tests

---

**Research Complete**: 2026-02-27T23:40:00Z
**Report Location**: docs/plans/057-copilot-cli-adapter/research-dossier.md
