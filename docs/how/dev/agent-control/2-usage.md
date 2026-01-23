# Agent Control Usage Guide

Step-by-step guides for common Agent Control Service tasks.

## Running a Prompt

### Basic Usage

Run a prompt through Claude Code:

```typescript
import { AgentService } from '@chainglass/shared';

const result = await agentService.run({
  prompt: 'Write a function that calculates fibonacci numbers',
  agentType: 'claude-code',
});

console.log(result.output);      // Agent's response
console.log(result.sessionId);   // For session resumption
console.log(result.status);      // 'completed' | 'failed' | 'killed'
console.log(result.tokens);      // { used, total, limit } or null
```

### Specifying Working Directory

Run the agent in a specific directory:

```typescript
const result = await agentService.run({
  prompt: 'List all TypeScript files',
  agentType: 'claude-code',
  cwd: '/path/to/project',
});
```

### Using Different Agents

Run with GitHub Copilot:

```typescript
const result = await agentService.run({
  prompt: 'Explain this code',
  agentType: 'copilot',  // 'claude-code' | 'copilot'
});

// Note: Copilot doesn't report token usage
console.log(result.tokens);  // null
```

## Session Resumption

### Continuing a Conversation

Resume a previous session by providing the sessionId:

```typescript
// First run - creates new session
const result1 = await agentService.run({
  prompt: 'Create a React component for a todo list',
  agentType: 'claude-code',
});

// Second run - resumes session with context
const result2 = await agentService.run({
  prompt: 'Add a delete button to each item',
  agentType: 'claude-code',
  sessionId: result1.sessionId,  // Resume previous session
});
```

The agent remembers the conversation context when resumed.

## Context Compaction

### Reducing Token Usage

When approaching token limits, compact the session:

```typescript
// Check token usage
const result = await agentService.run({
  prompt: 'Continue implementing the feature',
  agentType: 'claude-code',
  sessionId: previousSessionId,
});

// If approaching limit, compact
if (result.tokens && result.tokens.total > result.tokens.limit * 0.8) {
  const compactResult = await agentService.compact(
    result.sessionId,
    'claude-code'
  );
  console.log('Tokens after compact:', compactResult.tokens?.total);
}
```

**Note**: Compaction requires an existing session with accumulated context.

## Terminating Sessions

### Graceful Termination

Stop a long-running agent:

```typescript
// Start a long task
const runPromise = agentService.run({
  prompt: 'Analyze the entire codebase',
  agentType: 'claude-code',
});

// Later, terminate if needed
const terminateResult = await agentService.terminate(
  sessionId,
  'claude-code'
);

// Result has status='killed'
console.log(terminateResult.status);  // 'killed'
```

Termination uses signal escalation: SIGINT → SIGTERM → SIGKILL.

## DI Container Setup

### Production Container

Set up the service in production:

```typescript
import {
  ChainglassConfigService,
  createProductionContainer,
  DI_TOKENS
} from '@chainglass/shared';

// 1. Create and load config
const config = new ChainglassConfigService({
  userConfigDir: getUserConfigDir(),
  projectConfigDir: getProjectConfigDir(),
});
config.load();  // Must load before container creation

// 2. Create container with pre-loaded config
const container = createProductionContainer(config);

// 3. Resolve AgentService
const agentService = container.resolve<AgentService>(DI_TOKENS.AGENT_SERVICE);
```

### Test Container

Set up for tests with fakes:

```typescript
import {
  createTestContainer,
  DI_TOKENS,
  AgentService,
} from '@chainglass/shared';

describe('MyFeature', () => {
  let agentService: AgentService;

  beforeEach(() => {
    const container = createTestContainer();
    agentService = container.resolve<AgentService>(DI_TOKENS.AGENT_SERVICE);
  });

  it('should run prompt', async () => {
    const result = await agentService.run({
      prompt: 'test',
      agentType: 'claude-code',
    });
    expect(result.status).toBe('completed');
  });
});
```

### Manual Service Creation

For fine-grained control:

```typescript
import {
  AgentService,
  ClaudeCodeAdapter,
  CopilotAdapter,
  UnixProcessManager,
  FakeConfigService,
  FakeLogger,
  type AdapterFactory,
} from '@chainglass/shared';

// Create dependencies
const logger = new FakeLogger();
const processManager = new UnixProcessManager(logger);
const config = new FakeConfigService({
  agent: { timeout: 600000 },
});

// Create adapter factory
const adapterFactory: AdapterFactory = (agentType) => {
  if (agentType === 'claude-code') {
    return new ClaudeCodeAdapter(processManager, { logger });
  }
  if (agentType === 'copilot') {
    return new CopilotAdapter(processManager, { logger });
  }
  throw new Error(`Unknown agent type: ${agentType}`);
};

// Create service
const agentService = new AgentService(adapterFactory, config, logger);
```

## Configuration

### Timeout Settings

Configure timeout via YAML or environment variables:

```yaml
# config.yaml
agent:
  timeout: 600000  # 10 minutes in milliseconds (default)
```

```bash
# Environment variable override
export CG_AGENT__TIMEOUT=1800000  # 30 minutes
```

### Available Agent Types

| Agent Type | Description | Token Tracking |
|------------|-------------|----------------|
| `claude-code` | Claude Code CLI | Yes |
| `copilot` | GitHub Copilot CLI | No (null) |

## Error Handling

### Checking Result Status

```typescript
const result = await agentService.run({
  prompt: 'Do something',
  agentType: 'claude-code',
});

switch (result.status) {
  case 'completed':
    console.log('Success:', result.output);
    break;
  case 'failed':
    console.error('Failed:', result.output);
    console.error('Exit code:', result.exitCode);
    console.error('Stderr:', result.stderr);
    break;
  case 'killed':
    console.log('Terminated by user or timeout');
    break;
}
```

### Timeout Behavior

When timeout is exceeded:

```typescript
// Service enforces timeout from config (default 10 minutes)
const result = await agentService.run({
  prompt: 'Very long task',
  agentType: 'claude-code',
});

if (result.status === 'failed' && result.output.includes('Timeout')) {
  console.log('Task timed out');
  // The agent was terminated automatically
}
```

### Invalid Agent Type

```typescript
try {
  await agentService.run({
    prompt: 'test',
    agentType: 'invalid-type',  // Not 'claude-code' or 'copilot'
  });
} catch (error) {
  // Error: Invalid agent type: invalid-type. Allowed: claude-code, copilot
}
```

## Common Patterns

### Building Multi-Turn Conversations

```typescript
class ConversationManager {
  private sessionId?: string;

  constructor(private agentService: AgentService) {}

  async send(prompt: string): Promise<string> {
    const result = await this.agentService.run({
      prompt,
      agentType: 'claude-code',
      sessionId: this.sessionId,
    });

    this.sessionId = result.sessionId;
    return result.output;
  }

  async compact(): Promise<void> {
    if (!this.sessionId) return;
    await this.agentService.compact(this.sessionId, 'claude-code');
  }
}
```

### Token Budget Monitoring

```typescript
async function runWithTokenBudget(
  agentService: AgentService,
  prompt: string,
  maxTokens: number
): Promise<AgentResult> {
  const result = await agentService.run({
    prompt,
    agentType: 'claude-code',
  });

  if (result.tokens && result.tokens.total > maxTokens) {
    console.warn(`Token budget exceeded: ${result.tokens.total}/${maxTokens}`);
    await agentService.compact(result.sessionId, 'claude-code');
  }

  return result;
}
```

## Next Steps

- [Adapters Guide](./3-adapters.md) - How to implement new adapters
- [Testing Guide](./4-testing.md) - Testing patterns with FakeAgentAdapter
- [Overview](./1-overview.md) - Architecture and concepts
