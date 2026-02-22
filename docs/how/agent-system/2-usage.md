# Agent System Usage

## Session Chaining

Each `run()` returns a sessionId in the `AgentResult`. Pass it to `getWithSessionId()` to resume the conversation:

```typescript
import { AgentManagerService, ClaudeCodeAdapter, UnixProcessManager, FakeLogger } from '@chainglass/shared';

const manager = new AgentManagerService(
  (type) => new ClaudeCodeAdapter(new UnixProcessManager(new FakeLogger()))
);

// Turn 1: new session
const agent = manager.getNew({ name: 'coder', type: 'claude-code', workspace: '.' });
await agent.run({ prompt: 'Write a fibonacci function in TypeScript' });
const sessionId = agent.sessionId; // e.g., 'ses-abc123'

// Turn 2: resume (agent remembers Turn 1)
const resumed = manager.getWithSessionId(sessionId, {
  name: 'coder-t2', type: 'claude-code', workspace: '.',
});
await resumed.run({ prompt: 'Add unit tests for that function' });
```

In CLI mode, each invocation is a separate process — session continuity is maintained by the adapter (Claude Code reads from disk, Copilot SDK from session state):

```bash
# Turn 1
cg agent run -t claude-code -p "Write fibonacci.ts"
# Output: {"sessionId":"ses-abc123","status":"completed",...}

# Turn 2: resume
cg agent run -t claude-code -s ses-abc123 -p "Add unit tests"
```

## Event Handlers

Register handlers to observe agent activity in real time:

```typescript
import type { AgentEvent } from '@chainglass/shared';

const events: AgentEvent[] = [];
agent.addEventHandler((event) => {
  events.push(event);
  if (event.type === 'text_delta') {
    process.stdout.write(event.data.content);
  }
});

await agent.run({ prompt: 'Say hello' });
console.log(`Received ${events.length} events`);
```

### Event Types

> Common event types shown below. See `AgentEvent` union type for the complete list.

| Type | Data | Description |
|------|------|-------------|
| `text_delta` | `{ content: string }` | Streaming text output |
| `message` | `{ content: string }` | Complete message |
| `tool_call` | `{ toolName, toolCallId, input }` | Agent invoked a tool |
| `tool_result` | `{ toolCallId, output, isError }` | Tool returned a result |
| `thinking` | `{ content: string }` | Agent reasoning (Claude) |

### Multiple Handlers

All registered handlers receive the same event objects (same reference):

```typescript
const handler1Events: AgentEvent[] = [];
const handler2Events: AgentEvent[] = [];

agent.addEventHandler((e) => handler1Events.push(e));
agent.addEventHandler((e) => handler2Events.push(e));

await agent.run({ prompt: 'test' });

// Same count, same references
handler1Events.length === handler2Events.length; // true
handler1Events[0] === handler2Events[0]; // true (same object)
```

## Compact

Reduce session context to save tokens:

```typescript
// After a long conversation...
await agent.compact();

// Session still works after compaction
await agent.run({ prompt: 'Continue our discussion' });
```

Claude Code adapter sends `/compact` as a prompt. Copilot SDK uses a keep-alive compaction strategy. `AgentInstance.compact()` abstracts both behind the same API.

## Testing with Fakes

Use `FakeAgentInstance` and `FakeAgentManagerService` for unit tests:

```typescript
import { FakeAgentInstance, FakeAgentManagerService } from '@chainglass/shared';

// Direct fake instance
const instance = new FakeAgentInstance({
  id: 'test-1', name: 'test', type: 'claude-code', workspace: '/tmp',
});

// Configure behavior
instance.setNextRunResult({
  status: 'completed', output: 'hello', sessionId: 'ses-1',
  exitCode: 0, tokens: null,
});
instance.setEventsToEmit([
  { type: 'text_delta', timestamp: new Date().toISOString(), data: { content: 'hello' } },
]);

await instance.run({ prompt: 'test' });

// Assert
instance.assertRunCalled();
expect(instance.getRunHistory()).toHaveLength(1);

// Fake manager with defaults
const fakeManager = new FakeAgentManagerService({
  defaultInstanceOptions: {
    runResult: { status: 'completed', output: 'ok', sessionId: 'ses-1', exitCode: 0, tokens: null },
  },
});

const agent = fakeManager.getNew({ name: 'test', type: 'claude-code', workspace: '.' });
await agent.run({ prompt: 'test' });
expect(agent.status).toBe('stopped');
```

## Metadata

The metadata bag stores arbitrary key-value pairs:

```typescript
const agent = manager.getNew({
  name: 'worker',
  type: 'claude-code',
  workspace: '.',
  metadata: { project: 'demo', priority: 'high' },
});

agent.setMetadata('attempt', 1);
console.log(agent.metadata); // { project: 'demo', priority: 'high', attempt: 1 }
```

After `compact()`, token metrics are automatically stored under the `tokens` key if returned by the adapter.

## Parallel Execution

Run multiple agents concurrently:

```typescript
const agentA = manager.getNew({ name: 'agent-a', type: 'claude-code', workspace: '.' });
const agentB = manager.getNew({ name: 'agent-b', type: 'claude-code', workspace: '.' });

await Promise.all([
  agentA.run({ prompt: 'Task A' }),
  agentB.run({ prompt: 'Task B' }),
]);

// Independent sessions
agentA.sessionId !== agentB.sessionId; // true
```
