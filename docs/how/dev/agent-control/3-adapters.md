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
| Log File Polling | GitHub Copilot | Log file regex | Unavailable |
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

## Reference Implementation: CopilotAdapter

### Key Differences from ClaudeCode

1. **Log File Polling**: Session ID extracted from log files, not stdout
2. **No Token Tracking**: Always returns `tokens: null`
3. **Different Flags**: `--yolo`, `--log-dir`, `--log-level debug`

### Implementation Structure

```typescript
export class CopilotAdapter implements IAgentAdapter {
  private readonly _processManager: IProcessManager;
  private readonly _parser: CopilotLogParser;
  private readonly _readLogFile: ReadLogFileFunction;
  private readonly _pollBaseIntervalMs: number;
  private readonly _pollMaxTimeoutMs: number;

  async run(options: AgentRunOptions): Promise<AgentResult> {
    const { prompt, sessionId, cwd } = options;

    // 1. Create unique temp directory for logs
    const logDir = await this._createLogDir();

    // 2. Build command arguments
    const args = this._buildArgs(prompt, sessionId, logDir);

    // 3. Spawn process
    const handle = await this._processManager.spawn({
      command: 'npx',
      args: ['-y', '@github/copilot', ...args],
      cwd: validatedCwd,
    });

    // 4. Wait for process completion
    const exitResult = await handle.waitForExit();

    // 5. Extract session ID from log files (with polling)
    const extractedSessionId = await this._extractSessionId(
      handle.pid,
      logDir
    ) ?? sessionId ?? `copilot-${handle.pid}-${Date.now()}`;

    // 6. Cleanup log directory
    await this._cleanupLogDir(logDir);

    return {
      output: this._processManager.getProcessOutput?.(handle.pid) ?? '',
      sessionId: extractedSessionId,
      status: this._mapExitCodeToStatus(exitResult.exitCode, exitResult.signal),
      exitCode: exitResult.exitCode ?? -1,
      tokens: null,  // Copilot doesn't report tokens
    };
  }

  private async _extractSessionId(pid: number, logDir: string): Promise<string | undefined> {
    // Exponential backoff polling
    const backoff = [0, 50, 100, 200, 400, 800, 1600, 3200];
    const startTime = Date.now();

    for (const delay of backoff) {
      if (Date.now() - startTime > this._pollMaxTimeoutMs) break;

      await this._sleep(delay);
      const logContent = await this._readLogFile(logDir);
      if (logContent) {
        const sessionId = this._parser.extractSessionId(logContent);
        if (sessionId) return sessionId;
      }
    }

    return undefined;  // Use fallback
  }

  // ... rest of implementation
}
```

### Key Implementation Details

1. **Command Flags**:
   - `-p <prompt>` or stdin: Prompt input
   - `--yolo`: Non-interactive mode
   - `--log-level debug`: Enable debug logging
   - `--log-dir <path>`: Custom log directory
   - `--resume <id>`: Session resumption

2. **Log Parsing**:
   - Use `CopilotLogParser` with regex: `events to session ([0-9a-fA-F-]{36})`
   - Poll log files with exponential backoff
   - Fallback session ID: `copilot-{pid}-{timestamp}`

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
