# Workshop: SdkCopilotAdapter Improvements for Agent Runner

**Type**: Integration Pattern
**Plan**: 070-harness-agent-runner
**Spec**: [agent-runner-spec.md](../agent-runner-spec.md)
**Created**: 2026-03-07
**Status**: Draft

**Related Documents**:
- [Workshop 001](001-copilot-sdk-adapter-reuse-and-agent-runner-design.md) — Agent runner design (corrected to SDK-direct)
- [Copilot SDK Source](~/github/copilot-sdk/nodejs/src/) — Upstream SDK
- [SdkCopilotAdapter](../../../../packages/shared/src/adapters/sdk-copilot-adapter.ts) — Our adapter
- [ICopilotClient](../../../../packages/shared/src/interfaces/copilot-sdk.interface.ts) — Our interface
- [POC](../../../../scratch/copilot-sdk-poc/run.ts) — Validated proof-of-concept

**Domain Context**:
- **Primary Domain**: `agents` — owns IAgentAdapter, SdkCopilotAdapter
- **Related Domains**: `_platform/sdk` — CopilotClient singleton

---

## Purpose

Define the exact changes needed to `SdkCopilotAdapter`, `ICopilotClient`, and related types to support the harness agent runner. The POC proved the SDK works standalone — now we need to close the gaps between what the SDK offers and what our adapter exposes, so the harness can use the adapter properly instead of bypassing it.

## Key Questions Addressed

- What SDK capabilities does our adapter not expose yet?
- What changes to `AgentRunOptions` and `ICopilotClient` are needed?
- How do we add model selection and reasoning effort?
- How do we expose `listModels()` for agent configuration?
- What should we import from the SDK vs define ourselves?
- What's the priority order for these changes?

---

## 2. Gap Analysis: SDK vs Adapter

### SessionConfig Fields

The SDK's `SessionConfig` has ~20 fields. Our `CopilotSessionConfig` interface exposes 4. Here's the full comparison:

| SDK Field | Type | Our Interface | Adapter Uses | Priority | Notes |
|-----------|------|--------------|-------------|----------|-------|
| `sessionId` | `string?` | ✅ Exposed | ✅ Yes | — | Already works |
| `model` | `string?` | ✅ Exposed | ❌ **Not passed** | 🔴 Critical | Interface has it, adapter ignores it |
| `streaming` | `boolean?` | ✅ Exposed | ✅ Yes | — | Wired to `!!onEvent` |
| `onPermissionRequest` | `PermissionHandler` | ✅ Exposed | ✅ Yes | — | Uses `approveAll` |
| `reasoningEffort` | `ReasoningEffort?` | ❌ Missing | ❌ No | 🔴 Critical | `"low" \| "medium" \| "high" \| "xhigh"` |
| `workingDirectory` | `string?` | ❌ Missing | ❌ No | 🟡 High | SDK handles cwd natively — better than our validation |
| `clientName` | `string?` | ❌ Missing | ❌ No | 🟢 Low | Useful for analytics but not blocking |
| `availableTools` | `string[]?` | ❌ Missing | ❌ No | 🟡 High | Whitelist tools for constrained agents |
| `excludedTools` | `string[]?` | ❌ Missing | ❌ No | 🟡 High | Blacklist tools (e.g., no bash for read-only agents) |
| `systemMessage` | `SystemMessageConfig?` | ❌ Missing | ❌ No | 🟡 High | Inject system prompt — crucial for agent instructions |
| `onUserInputRequest` | `UserInputHandler?` | ❌ Missing | ❌ No | 🟢 Low | Enables `ask_user` tool — future |
| `hooks` | `SessionHooks?` | ❌ Missing | ❌ No | 🟢 Low | Lifecycle interceptors — future |
| `configDir` | `string?` | ❌ Missing | ❌ No | 🟢 Low | Override config directory |
| `tools` | `Tool[]?` | ❌ Missing | ❌ No | 🟢 Low | Custom tools — Phase 2+ |
| `mcpServers` | `Record<string, MCPServerConfig>?` | ❌ Missing | ❌ No | 🟢 Low | MCP server configs — future |
| `customAgents` | `CustomAgentConfig[]?` | ❌ Missing | ❌ No | 🟢 Low | Sub-agents — future |
| `skillDirectories` | `string[]?` | ❌ Missing | ❌ No | 🟢 Low | Skill loading — future |
| `disabledSkills` | `string[]?` | ❌ Missing | ❌ No | 🟢 Low | Skill control — future |
| `provider` | `ProviderConfig?` | ❌ Missing | ❌ No | 🟢 Low | BYOK — future |
| `infiniteSessions` | `InfiniteSessionConfig?` | ❌ Missing | ❌ No | 🟢 Low | Auto-compaction — future |

### Client Methods

| SDK Method | Our Interface | Priority | Notes |
|-----------|--------------|----------|-------|
| `createSession(config)` | ✅ `ICopilotClient` | — | Works |
| `resumeSession(id, config)` | ✅ `ICopilotClient` | — | Works |
| `stop()` | ✅ `ICopilotClient` | — | Works |
| `getStatus()` | ✅ `ICopilotClient` | — | Works |
| `listModels()` | ❌ **Missing** | 🔴 Critical | Returns `ModelInfo[]` with capabilities |
| `getAuthStatus()` | ❌ Missing | 🟡 High | Check if authenticated before running |

### Session Methods

| SDK Method | Our Interface | Priority | Notes |
|-----------|--------------|----------|-------|
| `sendAndWait({prompt})` | ✅ `ICopilotSession` | — | Works |
| `on(handler)` | ✅ `ICopilotSession` | — | Works |
| `destroy()` | ✅ `ICopilotSession` | — | Works |
| `abort()` | ✅ `ICopilotSession` | — | Used in `terminate()` |
| `setModel(model)` | ❌ **Missing** | 🟡 High | Switch model mid-session |
| `sessionId` | ✅ `ICopilotSession` | — | Works |

### SDK Exports We Should Use

| SDK Export | Current Usage | Change Needed |
|-----------|--------------|---------------|
| `approveAll` | ❌ We define our own | 🔴 Import from SDK — ours had wrong `kind` value |
| `CopilotClient` | ✅ Used in DI wiring | — |
| `ModelInfo` type | ❌ Not imported | 🔴 Need for `listModels()` return type |
| `ReasoningEffort` type | ❌ Not imported | 🔴 Need for session config |
| `defineTool` | ❌ Not imported | 🟢 Future — custom tools |

---

## 3. Changes Required

### Change 1: Add `model` and `reasoningEffort` to AgentRunOptions

**File**: `packages/shared/src/interfaces/agent-types.ts`

**Current**:
```typescript
export interface AgentRunOptions {
  prompt: string;
  sessionId?: string;
  cwd?: string;
  onEvent?: AgentEventHandler;
}
```

**Proposed**:
```typescript
export interface AgentRunOptions {
  prompt: string;
  sessionId?: string;
  cwd?: string;
  onEvent?: AgentEventHandler;
  /** Model to use (e.g., "gpt-5.4", "claude-sonnet-4"). Adapter-specific. */
  model?: string;
  /** Reasoning effort for models that support it. Use listModels() to check support. */
  reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh';
}
```

**Impact**: IAgentAdapter contract change — all adapters receive these fields. Non-SDK adapters ignore them (ClaudeCode, CopilotCLI). Fakes need updating.

### Change 2: Wire `model` and `reasoningEffort` into `createSession()`

**File**: `packages/shared/src/adapters/sdk-copilot-adapter.ts` (line 107)

**Current**:
```typescript
const session = sessionId
  ? await this._client.resumeSession(sessionId, { onPermissionRequest: approveAll })
  : await this._client.createSession({ streaming: !!onEvent, onPermissionRequest: approveAll });
```

**Proposed**:
```typescript
const session = sessionId
  ? await this._client.resumeSession(sessionId, {
      onPermissionRequest: approveAll,
      ...(model && { model }),
      ...(reasoningEffort && { reasoningEffort }),
    })
  : await this._client.createSession({
      streaming: !!onEvent,
      onPermissionRequest: approveAll,
      ...(model && { model }),
      ...(reasoningEffort && { reasoningEffort }),
    });
```

**Impact**: Minimal — conditional spread only adds fields when provided. No change when options are omitted.

### Change 3: Add `listModels()` to `ICopilotClient`

**File**: `packages/shared/src/interfaces/copilot-sdk.interface.ts`

**Add to `ICopilotClient` interface**:
```typescript
export interface ICopilotClient {
  // ... existing methods ...

  /**
   * List available models with their metadata.
   * Results are cached after the first call.
   */
  listModels(): Promise<CopilotModelInfo[]>;
}
```

**Add new types**:
```typescript
/** Valid reasoning effort levels for models that support it. */
export type CopilotReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';

/** Information about an available model */
export interface CopilotModelInfo {
  /** Model identifier (e.g., "gpt-5.4", "claude-sonnet-4") */
  id: string;
  /** Display name */
  name: string;
  /** Whether this model supports reasoning effort */
  supportsReasoningEffort: boolean;
  /** Supported reasoning effort levels (empty if not supported) */
  supportedReasoningEfforts: CopilotReasoningEffort[];
  /** Default reasoning effort (undefined if not supported) */
  defaultReasoningEffort?: CopilotReasoningEffort;
}
```

**Impact**: Interface change — FakeCopilotClient needs a `listModels()` method.

### Change 4: Add `reasoningEffort` and `model` to `CopilotSessionConfig`

**File**: `packages/shared/src/interfaces/copilot-sdk.interface.ts`

**Current**:
```typescript
export interface CopilotSessionConfig {
  sessionId?: string;
  model?: string;
  streaming?: boolean;
  onPermissionRequest?: (...) => ...;
}
```

**Proposed**:
```typescript
export interface CopilotSessionConfig {
  sessionId?: string;
  model?: string;
  streaming?: boolean;
  onPermissionRequest?: (...) => ...;
  /** Reasoning effort for models that support it */
  reasoningEffort?: CopilotReasoningEffort;
  /** Working directory for tool operations */
  workingDirectory?: string;
  /** System message configuration */
  systemMessage?: { content: string };
  /** Whitelist of allowed tool names */
  availableTools?: string[];
  /** Blacklist of excluded tool names */
  excludedTools?: string[];
}
```

**Also update `CopilotResumeSessionConfig`**:
```typescript
export interface CopilotResumeSessionConfig {
  onPermissionRequest?: (...) => ...;
  model?: string;
  reasoningEffort?: CopilotReasoningEffort;
}
```

### Change 5: Import `approveAll` from SDK

**File**: `packages/shared/src/adapters/sdk-copilot-adapter.ts`

**Current**: We define our own `approveAll`:
```typescript
const approveAll = () => ({ kind: 'approve' as const });
// BUG: SDK expects { kind: "approved" } not { kind: "approve" }
```

**Proposed**: Import from SDK:
```typescript
import { approveAll } from '@github/copilot-sdk';
```

Or if we want to keep the adapter decoupled from the SDK import (since it uses `ICopilotClient` interface), fix the value:
```typescript
const approveAll = () => ({ kind: 'approved' as const });
```

**Decision**: Fix the value in our code. Don't add a direct SDK import to the adapter — the adapter works via the `ICopilotClient` interface for testability. The harness can import `approveAll` from the SDK directly.

### Change 6: Add `setModel()` to `ICopilotSession`

**File**: `packages/shared/src/interfaces/copilot-sdk.interface.ts`

**Add to `ICopilotSession` interface**:
```typescript
export interface ICopilotSession {
  // ... existing methods ...

  /**
   * Change the model for this session mid-conversation.
   * History is preserved. Takes effect on next message.
   */
  setModel(model: string): Promise<void>;
}
```

**Impact**: FakeCopilotSession needs a `setModel()` stub. Not immediately needed for harness but useful for multi-turn agents switching models.

### Change 7: Update FakeCopilotClient

**File**: `packages/shared/src/fakes/fake-copilot-client.ts`

Add `listModels()` that returns a canned model list:
```typescript
async listModels(): Promise<CopilotModelInfo[]> {
  return [
    {
      id: 'fake-model',
      name: 'Fake Model',
      supportsReasoningEffort: true,
      supportedReasoningEfforts: ['low', 'medium', 'high'],
      defaultReasoningEffort: 'medium',
    },
  ];
}
```

### Change 8: Fix `approveAll` kind value

**File**: `packages/shared/src/adapters/sdk-copilot-adapter.ts`

**Current** (line ~80):
```typescript
const approveAll = () => ({ kind: 'approve' as const });
```

**Fix**:
```typescript
const approveAll = () => ({ kind: 'approved' as const });
```

This is a **bug** discovered by the POC — our `approveAll` returns `{ kind: "approve" }` but the SDK expects `{ kind: "approved" }`. The adapter works because the SDK's actual `CopilotClient` has its own approval handling, but passing our version through causes permission denials.

---

## 4. Priority-Ordered Task List

### 🔴 Critical (Required for harness agent runner)

| # | Change | Files | LOC | Risk |
|---|--------|-------|-----|------|
| C1 | Fix `approveAll` kind value (`"approve"` → `"approved"`) | sdk-copilot-adapter.ts | 1 | None — bug fix |
| C2 | Add `model` + `reasoningEffort` to `AgentRunOptions` | agent-types.ts | 4 | Low — additive |
| C3 | Wire `model` + `reasoningEffort` into `createSession()` | sdk-copilot-adapter.ts | 6 | Low — conditional spread |
| C4 | Add `reasoningEffort` to `CopilotSessionConfig` | copilot-sdk.interface.ts | 4 | Low — additive |
| C5 | Add `listModels()` to `ICopilotClient` + types | copilot-sdk.interface.ts | 20 | Low — additive |
| C6 | Update `FakeCopilotClient` with `listModels()` | fake-copilot-client.ts | 15 | Low — test double |

### 🟡 High (Valuable for agent runner, not blocking)

| # | Change | Files | LOC | Risk |
|---|--------|-------|-----|------|
| H1 | Add `workingDirectory` to session config | copilot-sdk.interface.ts, sdk-copilot-adapter.ts | 6 | Low |
| H2 | Add `availableTools` / `excludedTools` to config | copilot-sdk.interface.ts, sdk-copilot-adapter.ts | 8 | Low |
| H3 | Add `systemMessage` to config | copilot-sdk.interface.ts, sdk-copilot-adapter.ts | 6 | Low |
| H4 | Add `setModel()` to `ICopilotSession` | copilot-sdk.interface.ts, fake-copilot-session | 6 | Low |
| H5 | Update resume config to include `model` + `reasoningEffort` | copilot-sdk.interface.ts | 4 | Low |

### 🟢 Low (Future — not needed for v1)

Custom tools, MCP servers, infinite sessions, hooks, skill directories, BYOK provider, custom agents, user input handler.

---

## 5. Worked Example: Full Flow After Changes

```typescript
import { CopilotClient } from '@github/copilot-sdk';
import { SdkCopilotAdapter } from '@chainglass/shared';
import type { AgentEvent, CopilotModelInfo } from '@chainglass/shared';

// 1. Create client
const client = new CopilotClient();

// 2. List models (new capability)
const models: CopilotModelInfo[] = await client.listModels();
console.log('Available models:', models.map(m => m.id));
// → ["gpt-5.4", "gpt-4.1", "claude-sonnet-4", "claude-sonnet-4.5", ...]

// 3. Find a model with reasoning support
const reasoningModel = models.find(m => m.supportsReasoningEffort);
console.log(`Using ${reasoningModel.id} with reasoning: ${reasoningModel.supportedReasoningEfforts}`);

// 4. Create adapter
const adapter = new SdkCopilotAdapter(client as any);

// 5. Run with model + reasoning (new parameters)
const result = await adapter.run({
  prompt: 'Analyze the performance of src/health/probe.ts and suggest improvements.',
  model: 'claude-sonnet-4',         // ← NEW
  reasoningEffort: 'low',           // ← NEW
  onEvent: (event: AgentEvent) => {
    if (event.type === 'tool_call') {
      console.log(`🔧 ${event.data.toolName}: ${event.data.input}`);
    }
    if (event.type === 'thinking') {
      console.log(`💭 ${event.data.content.slice(0, 80)}...`);
    }
  },
});

console.log(`Output: ${result.output}`);
console.log(`Session: ${result.sessionId}`);  // For resumption
console.log(`Status: ${result.status}`);       // 'completed'

// 6. Resume session with different model (future: setModel)
const followUp = await adapter.run({
  prompt: 'Now implement the first suggestion.',
  sessionId: result.sessionId,      // Resume same session
  model: 'gpt-5.4',                // Switch to faster model for code gen
  onEvent: (event) => { /* ... */ },
});
```

---

## 6. Contract Test Updates

The existing contract test factory (`test/contracts/agent-adapter.contract.ts`) tests IAgentAdapter with multiple implementations. We need to add:

```typescript
// New contract test: model parameter passed through
it('should accept model in run options without error', async () => {
  const result = await adapter.run({
    prompt: 'test',
    model: 'fake-model',
  });
  expect(result.status).toBe('completed');
});

// New contract test: reasoningEffort passed through
it('should accept reasoningEffort in run options without error', async () => {
  const result = await adapter.run({
    prompt: 'test',
    reasoningEffort: 'low',
  });
  expect(result.status).toBe('completed');
});

// New contract test: listModels returns model info
it('should list available models', async () => {
  const models = await client.listModels();
  expect(models.length).toBeGreaterThan(0);
  expect(models[0]).toHaveProperty('id');
  expect(models[0]).toHaveProperty('name');
});
```

---

## 7. Open Questions

### Q1: Should `model` and `reasoningEffort` be on `AgentRunOptions` or on adapter construction?

**RESOLVED**: On `AgentRunOptions` (per-run). Reasoning:
- Different agent prompts benefit from different models (fast model for simple tasks, reasoning model for analysis)
- Session resumption may want to switch models mid-conversation
- Adapter construction is for infrastructure (client, logger), run options are for task configuration

### Q2: Should we re-export `approveAll` from `@chainglass/shared`?

**RESOLVED**: No. The harness imports it directly from `@github/copilot-sdk`. The adapter's internal `approveAll` is fixed to `{ kind: "approved" }`. Consumers that need the permission handler can import from either source.

### Q3: How do we handle `listModels()` requiring a connected client?

**RESOLVED**: The POC showed `listModels()` throws if client not connected. The adapter should connect lazily: create+destroy a throwaway session to force connection, then call `listModels()`. Or: expose `listModels()` as a standalone helper that handles connection, not on the adapter itself.

### Q4: Should the adapter validate that the model supports `reasoningEffort` before passing it?

**RESOLVED**: No. Let the SDK return the error (`Model 'X' does not support reasoning effort configuration`). The adapter surfaces it as a failed `AgentResult`. The harness doctor or agent list command shows which models support reasoning — the agent prompt author picks the right combination.

### Q5: Should we add `systemMessage` support now?

**OPEN**: Useful for injecting agent instructions alongside the prompt (e.g., "You are a smoke test agent. Output JSON matching this schema."). Could be done as `AgentRunOptions.systemMessage` or as a separate adapter option. Low effort (passthrough to SDK), high value for the harness agent runner.

---

## Quick Reference

```
Files to change (Critical):
  packages/shared/src/interfaces/agent-types.ts          → Add model, reasoningEffort to AgentRunOptions
  packages/shared/src/interfaces/copilot-sdk.interface.ts → Add reasoningEffort, listModels(), CopilotModelInfo
  packages/shared/src/adapters/sdk-copilot-adapter.ts     → Wire model/reasoning into createSession, fix approveAll
  packages/shared/src/fakes/fake-copilot-client.ts        → Add listModels() stub
  test/contracts/agent-adapter.contract.ts                → Add model/reasoning contract tests

Estimated LOC: ~50 lines changed, ~30 lines added
Risk: Low — all changes are additive (new optional fields)
```
