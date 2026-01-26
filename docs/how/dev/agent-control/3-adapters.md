# Adapter Implementation Guide

Guide for implementing new agent adapters for the Agent Control Service.

## When to Implement a New Adapter

Create a new adapter when:

- Adding support for a new AI coding agent CLI
- The agent has different I/O patterns than existing adapters
- The agent requires specific flag handling or output parsing

## Understanding the IAgentAdapter Contract

All adapters must implement `IAgentAdapter`:

```typescript
interface IAgentAdapter {
  run(options: AgentRunOptions): Promise<AgentResult>;
  compact(sessionId: string): Promise<AgentResult>;
  terminate(sessionId: string): Promise<AgentResult>;
}
```

### AgentRunOptions

```typescript
interface AgentRunOptions {
  prompt: string;         // The prompt to execute
  sessionId?: string;     // For session resumption (optional)
  cwd?: string;           // Working directory (optional)
}
```

### AgentResult

```typescript
interface AgentResult {
  output: string;                    // Agent's text output
  sessionId: string;                 // For session resumption
  status: 'completed' | 'failed' | 'killed';
  exitCode: number;                  // 0 = success, >0 = error, -1 = killed
  stderr?: string;                   // Error output if present
  tokens: TokenMetrics | null;       // null if unavailable
}
```

## I/O Pattern Comparison

Different agents have different I/O patterns:

| Pattern | Example | Session ID Source | Token Source |
|---------|---------|-------------------|--------------|
| Stdout NDJSON | Claude Code | JSON output field | JSON `usage` field |
| SDK Events | GitHub Copilot | SDK session object | Unavailable (SDK limitation) |
| HTTP API | OpenCode | HTTP response | HTTP response |

## Reference Implementation: ClaudeCodeAdapter

### Key Features

1. **Stdout Parsing**: Uses stream-json (NDJSON) output format
2. **Session ID**: Extracted from JSON messages
3. **Token Tracking**: Extracted from `usage` field in result message
4. **Compact**: Delegates to `run()` with "/compact" prompt

### Implementation Structure

```typescript
import type {
  AgentResult,
  AgentRunOptions,
  IAgentAdapter,
  ILogger,
  IProcessManager,
} from '../interfaces/index.js';
import { StreamJsonParser } from './stream-json-parser.js';

export interface ClaudeCodeAdapterOptions {
  logger?: ILogger;
  workspaceRoot?: string;
}

export class ClaudeCodeAdapter implements IAgentAdapter {
  private readonly _processManager: IProcessManager;
  private readonly _parser: StreamJsonParser;
  private readonly _activeSessions = new Map<string, number>();
  private readonly _logger?: ILogger;
  private readonly _workspaceRoot: string;

  constructor(processManager: IProcessManager, options?: ClaudeCodeAdapterOptions) {
    this._processManager = processManager;
    this._parser = new StreamJsonParser();
    this._logger = options?.logger;
    this._workspaceRoot = options?.workspaceRoot ?? process.cwd();
  }

  async run(options: AgentRunOptions): Promise<AgentResult> {
    const { prompt, sessionId, cwd } = options;

    // 1. Validate inputs
    const validatedCwd = this._validateCwd(cwd);
    this._validatePrompt(prompt);

    // 2. Build command arguments
    const args = this._buildArgs(prompt, sessionId);

    // 3. Spawn process
    const handle = await this._processManager.spawn({
      command: 'claude',
      args,
      cwd: validatedCwd,
    });

    // 4. Track session for termination
    const pid = this._processManager.getPid(handle);

    // 5. Wait for process completion
    const exitResult = await handle.waitForExit();

    // 6. Get buffered output
    const output = this._processManager.getProcessOutput?.(pid) ?? '';

    // 7. Parse output and construct result
    const extractedSessionId = this._parser.extractSessionId(output) ?? sessionId ?? '';
    const tokens = this._parser.extractTokens(output);
    const textOutput = this._parser.extractOutput(output);

    return {
      output: textOutput,
      sessionId: extractedSessionId,
      status: this._mapExitCodeToStatus(exitResult.exitCode, exitResult.signal),
      exitCode: exitResult.exitCode ?? -1,
      tokens,
    };
  }

  async compact(sessionId: string): Promise<AgentResult> {
    // Delegate to run() with /compact command
    return this.run({ prompt: '/compact', sessionId });
  }

  async terminate(sessionId: string): Promise<AgentResult> {
    const pid = this._activeSessions.get(sessionId);
    if (pid !== undefined) {
      await this._processManager.terminate(pid);
      this._activeSessions.delete(sessionId);
    }

    return {
      output: 'Session terminated',
      sessionId,
      status: 'killed',
      exitCode: -1,
      tokens: null,
    };
  }

  private _buildArgs(prompt: string, sessionId?: string): string[] {
    const args = [
      '-p', prompt,
      '--verbose',
      '--output-format=stream-json',
      '--dangerously-skip-permissions',
    ];

    if (sessionId) {
      args.push('--fork-session', '--resume', sessionId);
    }

    return args;
  }

  private _mapExitCodeToStatus(exitCode: number | null, signal?: string): AgentStatus {
    if (signal) return 'killed';
    if (exitCode === 0) return 'completed';
    return 'failed';
  }

  // ... validation helpers
}
```

### Key Implementation Details

1. **Command Flags**:
   - `-p <prompt>`: Non-interactive mode
   - `--verbose`: Required for stream-json output
   - `--output-format=stream-json`: NDJSON output
   - `--dangerously-skip-permissions`: Bypass permission checks
   - `--fork-session --resume <id>`: Session resumption

2. **Output Parsing**:
   - Use `StreamJsonParser` to extract session ID, tokens, and text
   - Session ID appears in every message
   - Token usage in `result` message type

## Reference Implementation: SdkCopilotAdapter

### Key Differences from ClaudeCode

1. **SDK-Based**: Uses official `@github/copilot-sdk` instead of spawning CLI directly
2. **Event-Driven**: Receives typed events (assistant.message, session.idle, session.error)
3. **No Token Tracking**: SDK doesn't expose token metrics; always returns `tokens: null`
4. **Immediate Session ID**: Available from `session.sessionId` immediately (no polling)
5. **Session Resumption**: Uses `client.resumeSession(sessionId)` for multi-turn conversations

### Implementation Structure

```typescript
import { CopilotClient } from '@github/copilot-sdk';
import type {
  AgentResult,
  AgentRunOptions,
  IAgentAdapter,
  ICopilotClient,
  ILogger,
} from '../interfaces/index.js';

export interface SdkCopilotAdapterOptions {
  logger?: ILogger;
  workspaceRoot?: string;
}

export class SdkCopilotAdapter implements IAgentAdapter {
  private readonly _client: ICopilotClient;
  private readonly _logger?: ILogger;
  private readonly _workspaceRoot: string;

  constructor(client: ICopilotClient, options?: SdkCopilotAdapterOptions) {
    this._client = client;
    this._logger = options?.logger;
    this._workspaceRoot = options?.workspaceRoot ?? process.cwd();
  }

  async run(options: AgentRunOptions): Promise<AgentResult> {
    const { prompt, sessionId, cwd, onEvent } = options;
    
    // 1. Create or resume session
    const session = sessionId
      ? await this._client.resumeSession(sessionId)
      : await this._client.createSession({ cwd: cwd ?? this._workspaceRoot });

    // 2. Register event handlers (if streaming)
    if (onEvent) {
      session.onEvent((event) => {
        // Map SDK events to AgentEvent and emit
        onEvent(this._mapToAgentEvent(event));
      });
    }

    // 3. Send prompt and wait for response
    let outputContent = '';
    try {
      const response = await session.sendAndWait(prompt);
      outputContent = response.content ?? '';
    } catch (error) {
      // Map error to failed AgentResult
      return {
        output: error.message,
        sessionId: session.sessionId,
        status: 'failed',
        exitCode: 1,
        tokens: null,
      };
    } finally {
      // 4. Cleanup (destroy session for run(), preserve for compact())
      await session.destroy();
    }

    return {
      output: outputContent,
      sessionId: session.sessionId,
      status: 'completed',
      exitCode: 0,
      tokens: null,  // SDK doesn't expose token metrics
    };
  }

  async compact(sessionId: string): Promise<AgentResult> {
    // Resume session, send /compact, DON'T destroy session
    const session = await this._client.resumeSession(sessionId);
    await session.sendAndWait('/compact');
    // Note: session preserved for continued conversation
    return {
      output: 'Context compacted',
      sessionId: session.sessionId,
      status: 'completed',
      exitCode: 0,
      tokens: null,
    };
  }

  async terminate(sessionId: string): Promise<AgentResult> {
    // Resume session and force destroy
    const session = await this._client.resumeSession(sessionId);
    await session.destroy();
    return {
      output: '',
      sessionId,
      status: 'killed',
      exitCode: -1,
      tokens: null,
    };
  }
}
```

### Key Implementation Details

1. **Constructor DI Pattern**:
   - Accept `ICopilotClient` interface (real or fake) for testability
   - Real production code: `new SdkCopilotAdapter(new CopilotClient(), { logger })`
   - Tests: `new SdkCopilotAdapter(new FakeCopilotClient({ events: [...] }))`

2. **Session Lifecycle**:
   - `run()`: Create session → sendAndWait → destroy (ephemeral)
   - `compact()`: Resume session → send /compact → preserve (persistent)
   - `terminate()`: Resume session → destroy immediately (terminal)

3. **Event Streaming** (optional):
   - Pass `onEvent` callback in `AgentRunOptions`
   - Events: `message`, `text_delta`, `session`, `usage`, `raw`
   - All events include `timestamp` and optional `messageId`

4. **Error Handling**:
   - Catch `sendAndWait()` exceptions → `status: 'failed'`, `exitCode: 1`
   - Always cleanup session in `finally` block

### Migration from Old CopilotAdapter

The old polling-based `CopilotAdapter` has been removed. All code should now use `SdkCopilotAdapter` (exported as `CopilotAdapter` for backward compatibility):

```typescript
// Old (removed):
import { CopilotAdapter } from '@chainglass/shared';
const adapter = new CopilotAdapter(processManager, { logger });

// New:
import { CopilotAdapter, SdkCopilotAdapter } from '@chainglass/shared';
import { CopilotClient } from '@github/copilot-sdk';

// Option 1: Use CopilotAdapter alias (backward compat)
const client = new CopilotClient();
const adapter = new CopilotAdapter(client, { logger });

// Option 2: Explicit SdkCopilotAdapter (preferred)
const adapter = new SdkCopilotAdapter(client, { logger });
```

## Adding a New Adapter

### Step 1: Create the Adapter Class

```typescript
// packages/shared/src/adapters/my-agent.adapter.ts
import type {
  AgentResult,
  AgentRunOptions,
  IAgentAdapter,
  ILogger,
  IProcessManager,
} from '../interfaces/index.js';

export interface MyAgentAdapterOptions {
  logger?: ILogger;
  workspaceRoot?: string;
  // ... agent-specific options
}

export class MyAgentAdapter implements IAgentAdapter {
  constructor(
    private readonly _processManager: IProcessManager,
    private readonly _options?: MyAgentAdapterOptions
  ) {}

  async run(options: AgentRunOptions): Promise<AgentResult> {
    // Implementation
  }

  async compact(sessionId: string): Promise<AgentResult> {
    // Implementation
  }

  async terminate(sessionId: string): Promise<AgentResult> {
    // Implementation
  }
}
```

### Step 2: Create Output Parser (if needed)

```typescript
// packages/shared/src/adapters/my-agent-parser.ts
export class MyAgentParser {
  extractSessionId(output: string): string | undefined {
    // Parse session ID from agent output
  }

  extractTokens(output: string): TokenMetrics | null {
    // Parse token metrics if available
  }
}
```

### Step 3: Add Contract Tests

```typescript
// test/contracts/agent-adapter.contract.test.ts
import { agentAdapterContractTests } from './agent-adapter.contract.js';
import { MyAgentAdapter } from '@chainglass/shared';

// Run contract tests against new adapter
describe('MyAgentAdapter Contract', () => {
  agentAdapterContractTests(
    'MyAgentAdapter',
    () => new MyAgentAdapter(fakeProcessManager)
  );
});
```

### Step 4: Export from Package

```typescript
// packages/shared/src/adapters/index.ts
export { MyAgentAdapter } from './my-agent.adapter.js';
export type { MyAgentAdapterOptions } from './my-agent.adapter.js';
```

### Step 5: Register in DI Container

```typescript
// apps/web/src/lib/di-container.ts
childContainer.register<IAgentAdapter>(DI_TOKENS.MY_AGENT_ADAPTER, {
  useFactory: (c) => {
    const processManager = c.resolve<IProcessManager>(DI_TOKENS.PROCESS_MANAGER);
    const logger = c.resolve<ILogger>(DI_TOKENS.LOGGER);
    return new MyAgentAdapter(processManager, { logger });
  },
});
```

### Step 6: Add to AgentService Factory

Update the adapter factory in `di-container.ts`:

```typescript
const adapterFactory: AdapterFactory = (agentType: string): IAgentAdapter => {
  if (agentType === 'claude-code') return new ClaudeCodeAdapter(...);
  if (agentType === 'copilot') return new CopilotAdapter(...);
  if (agentType === 'my-agent') return new MyAgentAdapter(...);
  throw new Error(`Unknown agent type: ${agentType}`);
};
```

## Implementation Checklist

- [ ] Implements `IAgentAdapter` interface
- [ ] Returns valid `AgentResult` from all methods
- [ ] Session ID extraction working
- [ ] Proper status mapping (completed/failed/killed)
- [ ] Input validation (prompt length, cwd traversal)
- [ ] Contract tests passing
- [ ] Integration tests with real CLI (skipIf pattern)
- [ ] Exported from `@chainglass/shared`
- [ ] Registered in DI container
- [ ] Added to AgentService factory

## Common Pitfalls

1. **Forgetting session tracking**: Track PID by sessionId for termination
2. **Missing fallback session ID**: Always return a sessionId, even if extraction fails
3. **Not handling stderr**: Capture stderr for debugging
4. **Ignoring exit codes**: Map exit codes to proper status values
5. **Blocking on log polling**: Use timeouts and exponential backoff

## Next Steps

- [Testing Guide](./4-testing.md) - Testing patterns with FakeAgentAdapter
- [Usage Guide](./2-usage.md) - Using the Agent Control Service
- [Overview](./1-overview.md) - Architecture and concepts
