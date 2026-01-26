# Agent Control Testing Guide

Patterns for testing services that depend on the Agent Control Service.

## Core Principle: Fakes Over Mocks

Per [ADR-0002: Exemplar-Driven Development](../../../adr/adr-0002-exemplar-driven-development.md), use `FakeAgentAdapter` instead of `vi.mock()`. This provides:

- Behavior-focused testing
- Assertion helpers for verification
- Contract test parity with production
- No mocking library dependency

## Using FakeAgentAdapter

### Basic Usage

```typescript
import { describe, it, expect } from 'vitest';
import { FakeAgentAdapter } from '@chainglass/shared';

describe('MyFeature', () => {
  it('should process agent output', async () => {
    // Configure fake response
    const fakeAdapter = new FakeAgentAdapter({
      sessionId: 'test-session',
      output: 'Hello from agent',
      status: 'completed',
      tokens: { used: 100, total: 500, limit: 200000 },
    });

    // Use in your code
    const result = await fakeAdapter.run({ prompt: 'test' });

    // Verify behavior
    expect(result.output).toBe('Hello from agent');
    expect(result.sessionId).toBe('test-session');
  });
});
```

### Configuration Options

```typescript
interface FakeAgentAdapterOptions {
  sessionId?: string;        // Default: 'fake-session-<timestamp>'
  output?: string;           // Default: ''
  status?: AgentStatus;      // Default: 'completed'
  exitCode?: number;         // Default: 0
  stderr?: string;           // Default: undefined
  tokens?: TokenMetrics | null;  // Default: { used: 0, total: 0, limit: 200000 }
  runDuration?: number;      // Milliseconds delay for timeout testing
}
```

### Simulating Failures

```typescript
// Agent exits with error
const failingAdapter = new FakeAgentAdapter({
  status: 'failed',
  exitCode: 1,
  output: 'Error: something went wrong',
  stderr: 'Stack trace...',
});

// Copilot without tokens
const copilotAdapter = new FakeAgentAdapter({
  sessionId: 'copilot-session',
  tokens: null,  // Copilot doesn't report tokens
});
```

### Testing Timeouts

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('timeout handling', () => {
  it('should handle slow agents', async () => {
    // Configure slow adapter
    const slowAdapter = new FakeAgentAdapter({
      sessionId: 'slow-session',
      output: 'Eventually finished',
      runDuration: 500,  // 500ms delay
    });

    const result = await slowAdapter.run({ prompt: 'slow task' });
    expect(result.output).toBe('Eventually finished');
  });
});
```

## Assertion Helpers

FakeAgentAdapter provides test verification methods:

### assertRunCalled()

Verify run() was called with expected options:

```typescript
const fake = new FakeAgentAdapter({ sessionId: 'test' });

await fake.run({ prompt: 'Do something', cwd: '/path' });

// Partial matching - all specified fields must match
fake.assertRunCalled({ prompt: 'Do something' });
fake.assertRunCalled({ cwd: '/path' });
fake.assertRunCalled({ prompt: 'Do something', cwd: '/path' });

// Throws if no match found
fake.assertRunCalled({ prompt: 'Different prompt' }); // Error!
```

### assertTerminateCalled()

Verify terminate() was called:

```typescript
const fake = new FakeAgentAdapter();

await fake.terminate('session-123');

fake.assertTerminateCalled('session-123');  // Passes
fake.assertTerminateCalled('other-session'); // Throws!
```

### assertCompactCalled()

Verify compact() was called:

```typescript
const fake = new FakeAgentAdapter();

await fake.compact('session-456');

fake.assertCompactCalled('session-456');  // Passes
```

### History Methods

Access raw call history for complex assertions:

```typescript
const fake = new FakeAgentAdapter();

await fake.run({ prompt: 'first' });
await fake.run({ prompt: 'second', sessionId: 'sess-1' });

const history = fake.getRunHistory();
expect(history).toHaveLength(2);
expect(history[0].prompt).toBe('first');
expect(history[1].sessionId).toBe('sess-1');

// Also available:
fake.getTerminateHistory();  // string[]
fake.getCompactHistory();    // string[]
```

### reset()

Clear history between tests:

```typescript
const fake = new FakeAgentAdapter();

await fake.run({ prompt: 'test' });
expect(fake.getRunHistory()).toHaveLength(1);

fake.reset();
expect(fake.getRunHistory()).toHaveLength(0);
```

## Using FakeProcessManager

For testing adapters directly:

```typescript
import { FakeProcessManager, ClaudeCodeAdapter } from '@chainglass/shared';

describe('ClaudeCodeAdapter', () => {
  it('should parse output from process', async () => {
    const fakeProcess = new FakeProcessManager();
    const adapter = new ClaudeCodeAdapter(fakeProcess);

    // Configure process output
    fakeProcess.setProcessOutput(1, '{"session_id":"abc","type":"result"}');

    const result = await adapter.run({ prompt: 'test' });
    expect(result.sessionId).toBe('abc');
  });
});
```

### FakeProcessManager Helpers

```typescript
// Configure next spawn to fail
fakeProcess.setSpawnError(new Error('CLI not found'));

// Make process ignore SIGINT/SIGTERM
fakeProcess.makeProcessStubborn(pid);

// Exit on specific signal
fakeProcess.exitProcessOnSignal(pid, 'SIGTERM');

// Force process exit
fakeProcess.exitProcess(pid, 0);

// Get signals sent to process
const signals = fakeProcess.getSignalsSent(pid);  // ['SIGINT', 'SIGTERM']
```

## Contract Tests

Contract tests ensure FakeAgentAdapter and real adapters behave identically:

### Using the Contract Test Factory

```typescript
// test/contracts/agent-adapter.contract.test.ts
import { agentAdapterContractTests } from './agent-adapter.contract.js';
import { FakeAgentAdapter, ClaudeCodeAdapter } from '@chainglass/shared';

// Same tests run against fake
agentAdapterContractTests('FakeAgentAdapter', () =>
  new FakeAgentAdapter({ sessionId: 'contract-test' })
);

// Same tests run against real adapter (with FakeProcessManager)
agentAdapterContractTests('ClaudeCodeAdapter', () =>
  new ClaudeCodeAdapter(fakeProcessManager)
);
```

### Contract Test Coverage

The factory tests:

- Result contains sessionId (AC-1)
- Status is 'completed' on success (AC-5)
- Output is included in result (AC-4)
- Tokens are properly structured (AC-9/10/11)
- Session resumption works (AC-2)
- compact() returns valid result (AC-12/13)
- terminate() returns status='killed' (AC-7)
- cwd option is passed through
- Failures are handled gracefully

## Testing AgentService

### With Test Container

```typescript
import { createTestContainer, DI_TOKENS, AgentService } from '@chainglass/shared';

describe('MyFeature with AgentService', () => {
  let agentService: AgentService;

  beforeEach(() => {
    const container = createTestContainer();
    agentService = container.resolve<AgentService>(DI_TOKENS.AGENT_SERVICE);
  });

  it('should run prompt through service', async () => {
    const result = await agentService.run({
      prompt: 'test',
      agentType: 'claude-code',
    });

    expect(result.status).toBe('completed');
  });
});
```

### With Manual Setup

```typescript
import {
  AgentService,
  FakeAgentAdapter,
  FakeConfigService,
  FakeLogger,
  type AdapterFactory,
} from '@chainglass/shared';

describe('AgentService unit tests', () => {
  it('should use correct adapter for agentType', async () => {
    const claudeAdapter = new FakeAgentAdapter({ sessionId: 'claude' });
    const copilotAdapter = new FakeAgentAdapter({ sessionId: 'copilot' });

    const factory: AdapterFactory = (type) => {
      if (type === 'claude-code') return claudeAdapter;
      if (type === 'copilot') return copilotAdapter;
      throw new Error(`Unknown: ${type}`);
    };

    const config = new FakeConfigService({ agent: { timeout: 60000 } });
    const service = new AgentService(factory, config, new FakeLogger());

    const result = await service.run({
      prompt: 'test',
      agentType: 'copilot',
    });

    expect(result.sessionId).toBe('copilot');
    copilotAdapter.assertRunCalled({ prompt: 'test' });
  });
});
```

## Integration Tests with Real CLI

For real CLI testing (skipped when CLI unavailable):

```typescript
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { ClaudeCodeAdapter, UnixProcessManager, FakeLogger } from '@chainglass/shared';

function hasClaudeCli(): boolean {
  try {
    execSync('claude --version', { stdio: 'ignore', timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!hasClaudeCli())('ClaudeCodeAdapter Integration', () => {
  it('should run real CLI and get session ID', async () => {
    const processManager = new UnixProcessManager(new FakeLogger());
    const adapter = new ClaudeCodeAdapter(processManager, {
      logger: new FakeLogger(),
    });

    const result = await adapter.run({ prompt: 'Say hello' });

    expect(result.sessionId).toBeDefined();
    expect(result.status).toBe('completed');
  }, 60000);  // 60s timeout for real CLI
});
```

## Test Isolation

### Fresh Fakes Per Test

```typescript
// BAD - State leakage
const sharedFake = new FakeAgentAdapter();

describe('tests', () => {
  it('test 1', async () => {
    await sharedFake.run({ prompt: 'first' });
  });
  it('test 2', () => {
    // Sees history from test 1!
    expect(sharedFake.getRunHistory()).toHaveLength(1);
  });
});

// GOOD - Fresh fakes
describe('tests', () => {
  it('test 1', async () => {
    const fake = new FakeAgentAdapter();
    await fake.run({ prompt: 'first' });
  });
  it('test 2', () => {
    const fake = new FakeAgentAdapter();
    // Clean slate
    expect(fake.getRunHistory()).toHaveLength(0);
  });
});
```

### Container Isolation

```typescript
describe('with containers', () => {
  let container: DependencyContainer;

  beforeEach(() => {
    // Fresh container per test
    container = createTestContainer();
  });

  it('test 1', async () => {
    const service = container.resolve<AgentService>(DI_TOKENS.AGENT_SERVICE);
    // Isolated from other tests
  });
});
```

## Anti-Patterns to Avoid

### Don't Use vi.mock()

```typescript
// BAD - Banned by architecture rules
vi.mock('@chainglass/shared', () => ({
  ClaudeCodeAdapter: vi.fn(),
}));

// GOOD - Use fakes
const fakeAdapter = new FakeAgentAdapter({ ... });
```

### Don't Access Internal State

```typescript
// BAD - Implementation details
expect((fakeAdapter as any)._runHistory.length).toBe(1);

// GOOD - Use provided helpers
expect(fakeAdapter.getRunHistory()).toHaveLength(1);
```

### Don't Share Fakes Between Tests

```typescript
// BAD - State pollution
const globalFake = new FakeAgentAdapter();

// GOOD - Create in test or beforeEach
beforeEach(() => {
  const fake = new FakeAgentAdapter();
});
```

## Next Steps

- [Usage Guide](./2-usage.md) - Using the Agent Control Service
- [Adapters Guide](./3-adapters.md) - Implementing new adapters
- [Overview](./1-overview.md) - Architecture and concepts
- [Configuration Testing](../../configuration/3-testing.md) - Testing with FakeConfigService
