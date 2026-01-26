# Research Report: Copilot SDK Migration

**Generated**: 2026-01-23T12:00:00Z
**Research Query**: "Review the Copilot SDK and prepare a dossier on how to update our CopilotAdapter to use this SDK rather than our hacky approach"
**Mode**: Pre-Plan Research
**Location**: docs/plans/006-copilot-sdk/research-dossier.md
**FlowSpace**: Available (multi-graph: default + copilot-sdk)
**Findings**: 38 total (SDK-10, CA-10, EX-08, IF-08, PL-10)

---

## Executive Summary

### What The SDK Provides
The GitHub Copilot SDK (`@github/copilot-sdk`) is an official Node.js library that manages CopilotClient lifecycle, session management, and event streaming via JSON-RPC over stdio or TCP. It eliminates the need for log file polling, regex-based session extraction, and manual process management.

### Business Purpose
Migrating to the SDK will transform our CopilotAdapter from a "hacky" polling-based implementation to a proper event-driven architecture, improving reliability, reducing latency, and enabling real-time streaming.

### Key Insights
1. **SDK eliminates log file polling entirely** - Sessions are managed via JSON-RPC, session IDs are returned immediately
2. **Event streaming replaces stdout parsing** - 30+ typed events (assistant.message, session.idle, tool.execution_start, etc.)
3. **Tool invocation is built-in** - SDK handles tool registration, invocation, and result normalization automatically
4. **Session resumption is native** - `client.resumeSession(sessionId)` with configurable tools/settings

### Quick Stats
- **SDK Size**: ~2,500 LOC across 4 core files
- **Event Types**: 30+ typed SessionEvent variants
- **Our Current Adapter**: ~500 LOC with polling/parsing workarounds
- **Migration Impact**: Major architectural change (polling → event-driven)
- **Prior Learnings**: 10 relevant discoveries from previous phases

---

## How It Currently Works (Our "Hacky" Approach)

### Current Architecture
```
┌──────────────────┐    spawn     ┌─────────────────┐
│  CopilotAdapter  │────────────►│ npx @github/    │
│                  │             │ copilot -p ...  │
└────────┬─────────┘             └────────┬────────┘
         │                                │
         │ poll log files                 │ writes async
         │ (50ms backoff)                 │
         ▼                                ▼
┌──────────────────┐             ┌─────────────────┐
│ CopilotLogParser │◄────────────│  Log Files in   │
│ (regex-based)    │   read      │  tmpdir         │
└──────────────────┘             └─────────────────┘
```

### Pain Points Identified (CA-01 through CA-10)

| ID | Issue | Severity | Description |
|----|-------|----------|-------------|
| CA-01 | Log file polling | High | No real-time events; must poll files with 50ms-5s exponential backoff |
| CA-02 | Regex session extraction | Medium | Brittle pattern `events to session <UUID>` tied to undocumented log format |
| CA-03 | No error recovery | High | Fallback session ID `copilot-{pid}-{timestamp}` is non-resumable |
| CA-04 | Temp directory overhead | Medium | Must create log directory before each spawn |
| CA-05 | Fixed backoff | Medium | Hardcoded 50ms base, 5s max; no adaptive strategy |
| CA-06 | No event streaming | High | Unlike ClaudeCode's NDJSON, blocks until process exit |
| CA-07 | Synthetic session IDs | High | Fallback IDs violate IAgentAdapter session resumption contract |
| CA-08 | No progress callbacks | Medium | Caller can't observe session state during execution |
| CA-09 | Compact workaround | Medium | Uses `-p "/compact"` instead of stdin; may not work |
| CA-10 | Independent timeouts | Medium | Process wait + 5s poll = double timeout risk |

### Current Code Flow (run method)
```typescript
// Current hacky approach (simplified)
async run(options: AgentRunOptions): Promise<AgentResult> {
  // 1. Create temp log directory
  const logDir = await this._createLogDir();

  // 2. Spawn CLI with log-dir flag
  const handle = await this._processManager.spawn('npx', [
    '-y', '@github/copilot',
    '--log-dir', logDir,
    '-p', options.prompt
  ]);

  // 3. Wait for process to exit (blocking!)
  const exitResult = await handle.waitForExit();

  // 4. Poll log files for session ID (50ms-5s backoff)
  const sessionId = await this._extractSessionIdWithPolling(logDir, handle.pid);

  // 5. Return result (no tokens, no streaming)
  return {
    output: exitResult.output,
    sessionId: sessionId ?? `copilot-${handle.pid}-${Date.now()}`,
    status: exitResult.code === 0 ? 'completed' : 'failed',
    exitCode: exitResult.code,
    tokens: null  // Never available
  };
}
```

---

## How The SDK Works

### SDK Architecture
```
┌──────────────────┐   JSON-RPC    ┌─────────────────┐
│  CopilotClient   │◄─────────────►│  Copilot CLI    │
│  (manages conn)  │    stdio      │  (server mode)  │
└────────┬─────────┘               └─────────────────┘
         │
         │ createSession()
         ▼
┌──────────────────┐
│  CopilotSession  │◄─── Events: assistant.message,
│  (typed events)  │              session.idle,
└──────────────────┘              tool.execution_start...
```

### SDK Key Components (SDK-01 through SDK-10)

| ID | Component | Description |
|----|-----------|-------------|
| SDK-01 | CopilotClient | Manages CLI lifecycle (spawn/connect), protocol negotiation |
| SDK-02 | ConnectionState | State machine: disconnected → connecting → connected → error |
| SDK-03 | CopilotSession | Encapsulates conversation, event handlers, tool registry |
| SDK-04 | SessionEvent | Union of 30+ typed events with ephemeral flag support |
| SDK-05 | Tool Definition | Zod schema support, automatic JSON schema conversion |
| SDK-06 | Tool Results | Normalized format with success/failure semantics |
| SDK-07 | Session Resumption | Native `resumeSession(id)` with tool/config updates |
| SDK-08 | Auth/Models API | `getAuthStatus()`, `listModels()` for discovery |
| SDK-09 | Permission Handler | Fine-grained control: shell/write/mcp/read/url |
| SDK-10 | MCP Integration | Configure external tool servers via config |

### SDK Usage Pattern (from basic-example.ts)
```typescript
import { CopilotClient, type Tool } from "@github/copilot-sdk";

// 1. Create client (auto-starts CLI server)
const client = new CopilotClient({ logLevel: "info" });

// 2. Define tools
const tools: Tool[] = [{
  name: "lookup_fact",
  description: "Returns a fun fact about a topic",
  parameters: { type: "object", properties: { topic: { type: "string" } } },
  handler: async ({ arguments: args }) => ({
    textResultForLlm: facts[args.topic] ?? "Unknown",
    resultType: facts[args.topic] ? "success" : "failure"
  })
}];

// 3. Create session with tools
const session = await client.createSession({ model: "gpt-5", tools });
console.log(`Session: ${session.sessionId}`);  // Immediate!

// 4. Subscribe to events (real-time streaming)
session.on((event) => {
  if (event.type === "assistant.message") {
    console.log("Response:", event.data.content);
  }
});

// 5. Send and wait
await session.sendAndWait({ prompt: "Tell me about Node.js" });

// 6. Clean up
await session.destroy();
await client.stop();
```

### Key SDK Types

**CopilotClientOptions**:
```typescript
interface CopilotClientOptions {
  cliPath?: string;       // Path to CLI (default: "copilot")
  cliArgs?: string[];     // Extra CLI args
  cwd?: string;           // Working directory
  port?: number;          // TCP port (0 = random)
  useStdio?: boolean;     // stdio vs TCP (default: true)
  cliUrl?: string;        // Connect to existing server
  logLevel?: "none" | "error" | "warning" | "info" | "debug" | "all";
  autoStart?: boolean;    // Auto-start on first session (default: true)
  autoRestart?: boolean;  // Restart on crash (default: true)
  env?: Record<string, string | undefined>;
}
```

**SessionConfig**:
```typescript
interface SessionConfig {
  model?: string;
  tools?: Tool[];
  systemMessage?: SystemMessageConfig;
  streaming?: boolean;
  onPermissionRequest?: PermissionHandler;
  mcpServers?: Record<string, MCPServerConfig>;
  customAgents?: CustomAgentConfig[];
  skillDirectories?: string[];
  disabledSkills?: string[];
  provider?: ProviderConfig;  // BYOK support
}
```

**SessionEvent** (union of 30+ types):
```typescript
type SessionEvent =
  | { type: "session.start"; data: { sessionId: string } }
  | { type: "session.idle"; data: {} }
  | { type: "session.error"; data: { message: string; stack?: string } }
  | { type: "assistant.message"; data: { content: string; toolRequests?: ... } }
  | { type: "assistant.message_delta"; data: { deltaContent: string } }  // streaming
  | { type: "tool.execution_start"; data: { toolName: string; ... } }
  | { type: "tool.execution_complete"; data: { result: ... } }
  // ... 23+ more event types
```

---

## Gap Analysis: Current vs SDK

| Aspect | Current (Hacky) | SDK Approach | Migration Impact |
|--------|-----------------|--------------|------------------|
| **Process Management** | Manual spawn via ProcessManager | CopilotClient manages lifecycle | Replace spawn logic |
| **Session ID** | Poll log files, regex extract | Immediate from `createSession()` | Remove polling entirely |
| **Events** | None (blocking wait) | 30+ typed events via `session.on()` | Add event handlers |
| **Tool Invocation** | Not supported | Built-in with handlers | New capability |
| **Streaming** | Not supported | `assistant.message_delta` events | New capability |
| **Session Resume** | Unreliable (synthetic fallback) | Native `resumeSession(id)` | Reliable resumption |
| **Tokens** | Always null | Not directly exposed | Still null (acceptable) |
| **Compact** | Workaround `-p "/compact"` | `session.abort()` + new message | Proper API |
| **Terminate** | Kill PID | `session.abort()` or `client.stop()` | Clean shutdown |
| **Error Handling** | Exit code only | `session.error` events with stack | Rich errors |

---

## IAgentAdapter Contract Compliance

Our interface expects:
```typescript
interface IAgentAdapter {
  run(options: AgentRunOptions): Promise<AgentResult>;
  compact(sessionId: string): Promise<AgentResult>;
  terminate(sessionId: string): Promise<AgentResult>;
}
```

**SDK-based implementation strategy**:

| Method | SDK Mapping | Notes |
|--------|-------------|-------|
| `run()` | `session.sendAndWait()` | Wrap with event collection |
| `compact()` | Send `/compact` as prompt | SDK treats as regular message |
| `terminate()` | `session.abort()` → `session.destroy()` | Graceful then force |

**AgentResult mapping**:
```typescript
// From SDK events to AgentResult
{
  output: lastAssistantMessage?.data.content ?? '',
  sessionId: session.sessionId,  // Always valid, immediate
  status: hasError ? 'failed' : 'completed',
  exitCode: hasError ? 1 : 0,
  tokens: null  // SDK doesn't expose token metrics directly
}
```

---

## Prior Learnings (PL-01 through PL-10)

Critical institutional knowledge from previous phases:

| ID | Learning | Relevance to SDK Migration |
|----|----------|---------------------------|
| PL-01 | Dual I/O patterns | SDK uses stdio JSON-RPC; adapter pattern still valid |
| PL-02 | Exponential backoff | **Eliminated** - SDK returns session ID immediately |
| PL-03 | Injectable dependencies | SDK client is injectable; keep FakeAgentAdapter pattern |
| PL-04 | Null token pattern | Still applies - SDK doesn't expose tokens, return null |
| PL-05 | Workspace root validation | Still needed - validate cwd before passing to SDK |
| PL-06 | 10MB log limit | **Eliminated** - no log file reading |
| PL-07 | Crypto randomness | SDK handles session IDs; no longer our concern |
| PL-08 | Contract tests | **Critical** - all 9 contract tests must still pass |
| PL-09 | CLI version logging | SDK's `getStatus()` returns version info |
| PL-10 | Compact differs by agent | SDK treats `/compact` as prompt; behavior unchanged |

---

## Proposed Architecture

### New CopilotAdapter Design
```
┌─────────────────────────────────────────────────────────────┐
│                     CopilotAdapter                          │
│  implements IAgentAdapter                                   │
├─────────────────────────────────────────────────────────────┤
│  - client: CopilotClient                                    │
│  - activeSessions: Map<sessionId, CopilotSession>           │
│  - options: CopilotAdapterOptions                           │
├─────────────────────────────────────────────────────────────┤
│  + run(options): Promise<AgentResult>                       │
│  + compact(sessionId): Promise<AgentResult>                 │
│  + terminate(sessionId): Promise<AgentResult>               │
│  - _ensureClient(): Promise<CopilotClient>                  │
│  - _collectOutput(session): Promise<string>                 │
│  - _mapStatus(event): AgentStatus                           │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ uses
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     CopilotClient                           │
│  (from @github/copilot-sdk)                                 │
├─────────────────────────────────────────────────────────────┤
│  + createSession(config): Promise<CopilotSession>           │
│  + resumeSession(id, config): Promise<CopilotSession>       │
│  + getStatus(): Promise<GetStatusResponse>                  │
│  + stop(): Promise<void>                                    │
└─────────────────────────────────────────────────────────────┘
```

### New run() Flow
```typescript
async run(options: AgentRunOptions): Promise<AgentResult> {
  // 1. Validate inputs (unchanged)
  this._validatePrompt(options.prompt);
  const cwd = this._validateCwd(options.cwd);

  // 2. Get or create session
  let session: CopilotSession;
  if (options.sessionId && this._activeSessions.has(options.sessionId)) {
    session = this._activeSessions.get(options.sessionId)!;
  } else if (options.sessionId) {
    session = await this._client.resumeSession(options.sessionId);
    this._activeSessions.set(session.sessionId, session);
  } else {
    session = await this._client.createSession({ cwd });
    this._activeSessions.set(session.sessionId, session);
  }

  // 3. Collect events during execution
  let output = '';
  let hasError = false;
  let errorMessage = '';

  session.on((event) => {
    if (event.type === 'assistant.message') {
      output = event.data.content;
    } else if (event.type === 'session.error') {
      hasError = true;
      errorMessage = event.data.message;
    }
  });

  // 4. Send and wait
  try {
    await session.sendAndWait({ prompt: options.prompt });
  } catch (error) {
    hasError = true;
    errorMessage = error.message;
  }

  // 5. Return structured result
  return {
    output,
    sessionId: session.sessionId,  // Always valid!
    status: hasError ? 'failed' : 'completed',
    exitCode: hasError ? 1 : 0,
    tokens: null
  };
}
```

---

## Migration Phases

### Phase 1: SDK Integration Foundation
- Add `@github/copilot-sdk` dependency
- Create `SdkCopilotAdapter` (new class, parallel to existing)
- Implement basic `run()` with SDK
- Write unit tests with FakeCopilotClient

### Phase 2: Session Management
- Implement session caching (`activeSessions` map)
- Implement `resumeSession()` support
- Implement `terminate()` via `session.abort()` + `destroy()`
- Contract tests must pass

### Phase 3: Compact & Error Handling
- Implement `compact()` sending `/compact` as prompt
- Add rich error handling from `session.error` events
- Add event logging for observability

### Phase 4: Migration & Cleanup
- Replace `CopilotAdapter` with `SdkCopilotAdapter`
- Remove `CopilotLogParser` (no longer needed)
- Remove log file polling code
- Update documentation

### Phase 5: Testing & Validation
- All 9 contract tests pass
- Integration tests with real SDK
- Performance comparison (latency improvement)
- Update developer docs

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| SDK breaking changes | Medium | Pin SDK version, monitor releases |
| SDK unavailable | Low | SDK is official GitHub package |
| Token metrics still unavailable | Low | Already return null; document limitation |
| CopilotClient startup latency | Medium | Cache client instance, autoStart: true |
| Session ID format change | Low | SDK manages IDs; we just store them |
| Contract test failures | High | Incremental migration, keep old adapter until all tests pass |

---

## Recommendations

### If Migrating (Recommended)
1. **Use parallel implementation** - Create `SdkCopilotAdapter` alongside existing
2. **Keep FakeAgentAdapter** - Contract tests validate both implementations
3. **Cache CopilotClient** - Single client instance per adapter
4. **Preserve token null pattern** - SDK doesn't expose metrics
5. **Add event logging** - Capture events for debugging

### If NOT Migrating
1. Document current limitations prominently
2. Add health checks for log file extraction failures
3. Consider timeout tuning based on usage patterns

### External Research Opportunities
None identified - the SDK is well-documented and the codebase exploration is sufficient.

---

## Appendix: File Inventory

### SDK Files (copilot-sdk repo)
| File | Purpose | Lines |
|------|---------|-------|
| nodejs/src/client.ts | CopilotClient implementation | 1,095 |
| nodejs/src/session.ts | CopilotSession implementation | 365 |
| nodejs/src/types.ts | Type definitions | 577 |
| nodejs/src/generated/session-events.ts | 30+ event types | 486 |
| nodejs/examples/basic-example.ts | Canonical usage pattern | 125 |

### Our Files (to modify)
| File | Action | Notes |
|------|--------|-------|
| packages/shared/src/adapters/copilot.adapter.ts | Replace | New SDK-based implementation |
| packages/shared/src/adapters/copilot-log-parser.ts | Delete | No longer needed |
| test/unit/shared/copilot-adapter.test.ts | Update | Test new implementation |
| test/contracts/agent-adapter.contract.ts | Keep | Contract tests unchanged |
| docs/how/dev/agent-control/3-adapters.md | Update | Document SDK approach |

---

## Next Steps

1. **Run `/plan-1b-specify`** to create feature specification
2. **Run `/plan-3-architect`** to design implementation phases
3. **Run `/plan-6-implement-phase`** for each phase

---

**Research Complete**: 2026-01-23
**Report Location**: docs/plans/006-copilot-sdk/research-dossier.md
