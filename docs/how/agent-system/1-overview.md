# Agent System Overview

The agent system provides a domain-agnostic wrapper around AI coding agents. It abstracts the differences between adapter implementations (Claude Code CLI, GitHub Copilot SDK) behind a unified lifecycle model.

## Key Concepts

- **AgentInstance**: Wraps a single agent session with lifecycle management, event pass-through, and metadata
- **AgentManagerService**: Creates and tracks agent instances with same-instance guarantee for session-based lookups
- **IAgentAdapter**: The adapter interface (unchanged) — implemented by `ClaudeCodeAdapter` and `SdkCopilotAdapter`

## Status Model

AgentInstance uses a 3-state status model:

```
         run() / compact()                 run() / compact()
              ┌──────┐                          ┌──────┐
              │      v                          │      v
    ┌─────────┴──┐  ┌──────────┐  ┌─────────┴──┐
    │  stopped   │──│  working  │──│   error    │
    └────────────┘  └──────────┘  └────────────┘
          ^              │              │
          │              │              │
          └──────────────┘              │
           success / terminate          │
          └─────────────────────────────┘
                    run() (retry)
```

- **stopped**: Initial state and state after successful completion or termination
- **working**: Agent is executing (run or compact in progress)
- **error**: Adapter returned a failed result

## IAgentInstance Methods

| Method | Description |
|--------|-------------|
| `run(options)` | Execute a prompt. Transitions `stopped → working → stopped\|error`. |
| `compact()` | Reduce session context. Same transition as `run()`. Requires existing sessionId. |
| `terminate()` | Force-stop the agent. Always transitions to `stopped`. |
| `addEventHandler(handler)` | Register a handler to receive events during `run()`. |
| `removeEventHandler(handler)` | Unregister a previously added handler. |
| `setMetadata(key, value)` | Set a key-value pair in the metadata bag. |

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Unique instance identifier |
| `name` | `string` | Human-readable name |
| `type` | `AgentInstanceType` | Adapter type (`claude-code` or `copilot`) |
| `workspace` | `string` | Working directory |
| `status` | `AgentInstanceStatus` | Current lifecycle state |
| `isRunning` | `boolean` | `true` iff `status === 'working'` |
| `sessionId` | `string \| null` | Session ID from adapter (null before first run) |
| `createdAt` | `Date` | Creation timestamp |
| `updatedAt` | `Date` | Last state change timestamp |
| `metadata` | `Readonly<Record<string, unknown>>` | Freeform metadata bag |

## Event Pass-Through

Unlike the old `AgentInstance` (Plan 019) which stored events internally via `getEvents()`, the redesigned version passes events through to registered handlers without storing them. This eliminates memory growth and makes the instance domain-agnostic.

```
Adapter.run()  ──events──►  AgentInstance._dispatch()  ──►  Handler 1
                                                        ──►  Handler 2
                                                        ──►  Per-run onEvent
```

- Multiple handlers receive the same event objects (same reference)
- Handlers are called synchronously but errors are caught per-handler
- Events are NOT stored on the instance — consumers own their event lifecycle
- `removeEventHandler()` stops delivery immediately

## Guards

- **Double-run guard**: `run()` and `compact()` throw if `status === 'working'`
- **No-session guard**: `compact()` throws if `sessionId` is null
- **Terminate safety**: `terminate()` always transitions to `stopped` regardless of adapter errors

## AgentManagerService

The manager creates and tracks instances:

- `getNew(params)` — Fresh instance with no session
- `getWithSessionId(sessionId, params)` — Instance pre-loaded with a session ID
- **Same-instance guarantee**: `getWithSessionId(id)` called twice returns the same object (`===`)
- **Session index**: Automatically updated when a `getNew()` instance acquires a sessionId after `run()`

## File Locations

| Component | Path |
|-----------|------|
| IAgentInstance interface | `packages/shared/src/features/034-agentic-cli/agent-instance.interface.ts` |
| AgentInstance implementation | `packages/shared/src/features/034-agentic-cli/agent-instance.ts` |
| IAgentManagerService interface | `packages/shared/src/features/034-agentic-cli/agent-manager-service.interface.ts` |
| AgentManagerService implementation | `packages/shared/src/features/034-agentic-cli/agent-manager-service.ts` |
| FakeAgentInstance | `packages/shared/src/features/034-agentic-cli/fakes/fake-agent-instance.ts` |
| FakeAgentManagerService | `packages/shared/src/features/034-agentic-cli/fakes/fake-agent-manager-service.ts` |
| CLI handlers | `apps/cli/src/features/034-agentic-cli/` |
