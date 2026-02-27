# Workshop: CopilotCLI Adapter — Intent & Design

**Type**: Integration Pattern
**Plan**: 057-copilot-cli-adapter
**Research**: [research-dossier.md](../research-dossier.md)
**Created**: 2026-02-27
**Status**: Draft

**Related Documents**:
- [Research Dossier](../research-dossier.md) — 65 findings from 8 research subagents
- Prototype: `scratch/session-watcher.ts` — proven file-tailing + tmux input loop
- Prototype: `scratch/dual-client-prototype.ts` — SDK headless server experiment

**Domain Context**:
- **Primary Domain**: Infrastructure adapter (alongside `_platform/file-ops`, `_platform/events`)
- **Related Domains**: None consumed — adapters are leaf nodes in the dependency graph

---

## Purpose

Clarify **what** the CopilotCLI Adapter is, **why** it exists alongside the SDK adapter, and **how** it fundamentally differs in its approach. This workshop ensures we're aligned on the problem before committing to architecture.

## Key Questions Addressed

- What problem does this solve that the SDK adapter doesn't?
- What is the exact boundary between "adapter" and "session management"?
- How does this enable the dual-view (web + terminal) use case?
- What are we NOT building?

---

## The Problem

### What we have today

```
┌─────────────────────────────────┐
│ SdkCopilotAdapter               │
│                                  │
│  Uses: @github/copilot-sdk       │
│  Transport: JSON-RPC (stdio/TCP) │
│  Input: session.sendAndWait()    │
│  Output: session.on() events     │
│  Session: SDK-managed            │
└─────────────────────────────────┘
```

The SDK adapter owns the entire lifecycle — it spawns the CLI, creates sessions, sends prompts, receives events. It works well for **programmatic agent orchestration** (workflow nodes, automated pipelines).

### What's missing

A user is working in the Copilot CLI terminal. They want their Chainglass web UI to **observe and participate** in that same session. Today this is impossible because:

1. **The SDK adapter owns the CLI process** — you can't attach to a user's running CLI
2. **The SDK doesn't fan out events** — only the client that sends a message sees the response events
3. **`copilot --resume` reads files, not the server** — it's sequential, not concurrent
4. **No "connect to existing session" in the CLI's public flags** — `--headless --port` are SDK-internal

### The insight from prototyping

We discovered that:
- `~/.copilot/session-state/{id}/events.jsonl` contains **every event** the CLI produces, appended in real-time
- `tmux send-keys` can reliably inject prompts into a running Copilot CLI TUI
- Combining these gives us a **full read/write interface** to any running Copilot session — without the SDK

---

## What We're Building

### The Core Idea

An `IAgentAdapter` implementation that controls Copilot **through the CLI binary** rather than the SDK, using two side-channel mechanisms:

```
┌─────────────────────────────────────────────────────┐
│ CopilotCLIAdapter                                    │
│                                                       │
│  INPUT:  tmux send-keys → Copilot CLI TUI            │
│  OUTPUT: fs.watch on events.jsonl → parsed events    │
│                                                       │
│  No SDK dependency. No JSON-RPC. No spawned process. │
│  Works with ANY running Copilot CLI instance.        │
└─────────────────────────────────────────────────────┘
```

### Why this approach

| Concern | SDK Adapter | CLI Adapter |
|---------|-------------|-------------|
| **Who owns the process?** | SDK spawns & manages it | User runs it in their terminal |
| **Can user see what's happening?** | No (headless) | Yes (full TUI) |
| **Can user type alongside automation?** | No | Yes — both tmux and keyboard work |
| **Event visibility** | Only sending client gets events | events.jsonl is shared, any reader sees all |
| **Dependency** | `@github/copilot-sdk` npm package | `copilot` binary + `tmux` |
| **Session ownership** | Adapter creates/destroys | User creates; adapter attaches/detaches |

### The dual-view scenario

```
Terminal (user's tmux pane)          Chainglass Web UI
┌────────────────────────┐          ┌────────────────────────┐
│ $ copilot              │          │ Agent Session View     │
│                        │          │                        │
│ ❯ fix the auth bug     │  ←───── │ [Send] "fix auth bug"  │
│                        │          │                        │
│ 🔧 Reading src/auth.ts │  ─────→ │ 🔧 Tool: read(auth.ts) │
│ 📝 Editing...          │  ─────→ │ 📝 Tool: write(auth.ts)│
│ ✅ Fixed               │  ─────→ │ ✅ Response: Fixed      │
│                        │          │                        │
│ ❯ (user types here)    │          │ [Send] (web sends here)│
└────────────────────────┘          └────────────────────────┘
         │                                    │
         └──────────┬─────────────────────────┘
                    │
         events.jsonl (shared source of truth)
```

Both the terminal and web are views into the same session. Either can send prompts. Both see all events.

---

## What This IS

1. **An IAgentAdapter implementation** — same 3 methods: `run()`, `compact()`, `terminate()`
2. **A bridge to a running CLI process** — doesn't spawn, doesn't own lifecycle
3. **File-based event reading** — tails `events.jsonl`, translates to `AgentEvent` union
4. **tmux-based input injection** — sends prompts via `tmux send-keys`
5. **Observable by design** — anyone watching the file sees all activity

## What This is NOT

1. **Not a replacement for the SDK adapter** — the SDK adapter is better for programmatic orchestration (workflow nodes, automated pipelines)
2. **Not a process manager** — doesn't spawn, restart, or monitor the CLI process
3. **Not a session creator** — assumes the session already exists (user started `copilot` or `copilot --resume`)
4. **Not platform-independent** — requires tmux (macOS/Linux only)
5. **Not a real-time streaming protocol** — file polling has ~500ms latency (acceptable for observation, not for keystroke-by-keystroke streaming)

---

## Execution Model

### run(options)

```
┌─────────────────────────────────────────────────────────────┐
│ 1. VALIDATE                                                  │
│    • sessionId required (we don't create sessions)           │
│    • tmux target must be reachable                           │
│    • events.jsonl must exist at session path                 │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. START WATCHING                                            │
│    • Record current line count in events.jsonl               │
│    • Start fs.watch + 500ms polling fallback                 │
│    • Begin emitting new events via onEvent callback          │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. SEND PROMPT                                               │
│    • tmux send-keys -t {target} {JSON.stringify(prompt)}     │
│    • sleep 100ms                                             │
│    • tmux send-keys -t {target} Enter                        │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. WAIT FOR IDLE                                             │
│    • Watch for session.idle event in events.jsonl            │
│    • Collect final assistant.message content                  │
│    • Timeout after configurable limit (default: 5 min)       │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. RETURN RESULT                                             │
│    • output: last assistant.message content                  │
│    • sessionId: from session.start event or input param      │
│    • status: 'completed' (or 'failed' on timeout/error)     │
│    • tokens: from assistant.usage event (if available)        │
│    • Stop file watcher                                       │
└─────────────────────────────────────────────────────────────┘
```

### compact(sessionId)

Same as `run({ prompt: '/compact', sessionId })`.

### terminate(sessionId)

```
Disconnect only — we do NOT kill the user's CLI process.
1. Stop the file watcher
2. Clean up internal state
3. Return { status: 'killed', exitCode: 0 }
```

The CLI continues running. The user's terminal session is untouched.

---

## Event Translation Table

| events.jsonl `type` | → AgentEvent `type` | Data Mapping |
|---|---|---|
| `session.start` | `session_start` | `data.sessionId` |
| `user.message` | _(skip — our outbound prompt)_ | — |
| `assistant.message_delta` | `text_delta` | `data.deltaContent` → `content` |
| `assistant.message` | `message` | `data.content` → `content` |
| `assistant.reasoning` | `thinking` | `data.content` → `content` |
| `assistant.reasoning_delta` | `thinking` (delta) | `data.deltaContent` → `content` |
| `tool.execution_start` | `tool_call` | `toolName`, `arguments`, `toolCallId` |
| `tool.execution_complete` | `tool_result` | `result`, `success`, `toolCallId` |
| `assistant.usage` | `usage` | `inputTokens`, `outputTokens` |
| `session.idle` | `session_idle` | _(signals run() can return)_ |
| `assistant.turn_start` | _(skip — lifecycle noise)_ | — |
| `assistant.turn_end` | _(skip — lifecycle noise)_ | — |
| `pending_messages.modified` | _(skip — lifecycle noise)_ | — |

---

## Constructor & Configuration

```typescript
interface CopilotCLIAdapterOptions {
  /** tmux session name (e.g. "studio") */
  tmuxSession: string;
  
  /** tmux window.pane index (e.g. "1.0") */
  tmuxPane: string;
  
  /** Session state directory (default: ~/.copilot/session-state/) */
  sessionDir?: string;
  
  /** File polling interval in ms (default: 500) */
  pollIntervalMs?: number;
  
  /** Timeout for run() in ms (default: 300000 = 5 min) */
  runTimeoutMs?: number;
  
  /** Logger */
  logger?: ILogger;
}

// Usage
const adapter = new CopilotCLIAdapter({
  tmuxSession: 'studio',
  tmuxPane: '1.0',
});

const result = await adapter.run({
  prompt: 'Fix the auth bug in src/auth.ts',
  sessionId: 'cee9a7ba-22ce-4cf2-acfd-1f05206c308e',
  onEvent: (event) => console.log(event),
});
```

---

## Dependency Injection

```typescript
// In adapter factory — one new case
const adapterFactory = (agentType: string): IAgentAdapter => {
  if (agentType === 'claude-code') return new ClaudeCodeAdapter(processManager);
  if (agentType === 'copilot') return new SdkCopilotAdapter(copilotClient);
  if (agentType === 'copilot-cli') return new CopilotCLIAdapter(tmuxConfig);
  throw new Error(`Unknown agent type: ${agentType}`);
};
```

---

## Key Design Decisions

### D1: sessionId is REQUIRED for run()

**Decision**: Unlike other adapters that can create new sessions, this adapter requires a pre-existing session.

**Rationale**: The adapter attaches to a running CLI — it doesn't spawn one. The user must have started `copilot` or `copilot --resume` first.

**Implication**: The web UI needs a "connect to session" flow, not a "create session" flow.

### D2: tmux is a hard dependency

**Decision**: Input injection requires tmux. No fallback for raw terminals.

**Rationale**: There's no other reliable way to inject input into a running interactive TUI on macOS/Linux. `/proc/PID/fd/0` doesn't work for Ink-based TUIs in raw mode.

**Implication**: The CLI adapter is tmux-only. Users running Copilot outside tmux can't use this adapter. This is acceptable because our development environment uses tmux.

### D3: File-based events, not SDK events

**Decision**: Read from `events.jsonl` rather than connecting via SDK.

**Rationale**: The SDK's event model doesn't fan out to multiple clients. File-based reading is universal — any number of readers can watch the same file. The file contains the same structured events the SDK provides.

**Implication**: ~500ms latency on event delivery (file write + poll cycle). Acceptable for observation; not suitable for sub-second interactive streaming.

---

## Open Questions

### Q1: Should the adapter spawn the CLI if no session exists?

**RESOLVED**: No. Require it to already be running. Spawning is a separate responsibility — this adapter is single-purpose: attach to an existing CLI instance.

### Q2: How does the web UI discover available sessions?

**RESOLVED**: Out of scope. This adapter just takes a sessionId. Discovery/UI is a separate concern to be built later.

### Q3: What happens if the user types in the terminal WHILE the adapter is sending?

**RESOLVED**: Acceptable. The TUI input is atomic (submits on Enter), so concurrent prompts queue naturally. No locking needed.

### Q4: Should we support read-only mode (watch only, no sending)?

**RESOLVED**: No. Always require tmux for v1. Keep it simple.

### Q5: Is ~500ms polling latency acceptable?

**RESOLVED**: Yes. Acceptable for observation use case.

### Q6: Should the adapter handle tmux pane disappearance?

**RESOLVED**: Return `status: 'failed'`. Caller handles reconnection — the pane might come back in a different tmux window/session.

### Q7: What does terminate() mean for a session we don't own?

**RESOLVED**: **Disconnect only.** We never kill the user's CLI process. `terminate()` stops watching the file, cleans up our resources, returns. The CLI continues running.

### Q8: Should we track which events were caused by our prompts vs user typing?

**RESOLVED**: No. Report everything indiscriminately. Overcomplicating it.

### Q9: Where does the adapter live?

**RESOLVED**: `packages/shared/src/adapters/` — same as the other adapters, despite the tmux platform dependency.

### Q10: AgentType — new type or variant of 'copilot'?

**RESOLVED**: Entirely separate. New type `'copilot-cli'` in the AgentType union.

---

## Quick Reference

```bash
# Start copilot in tmux
tmux new-window -t studio -n copilot 'copilot'

# Or resume a specific session
copilot --resume cee9a7ba-22ce-4cf2-acfd-1f05206c308e

# Watch events (proven prototype)
npx tsx scratch/session-watcher.ts <sessionId> studio 1.0

# Send a prompt via tmux
tmux send-keys -t studio:1.0 "fix the bug" 
tmux send-keys -t studio:1.0 Enter

# Events file location
~/.copilot/session-state/{sessionId}/events.jsonl
```
