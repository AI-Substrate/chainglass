# Agent Interaction Guide

This document describes how to interact with various AI coding agents (Claude Code, GitHub Copilot, OpenCode, Codex, Amp, etc.) from a unified UI perspective. It covers:

- How to send prompts
- How to display output
- How to detect agent state (running, waiting, finished)
- How to get session IDs
- How to resume sessions (multi-turn conversations)
- How to handle compaction/context management

**Reference Implementation**: [Vibe Kanban](https://github.com/stackblitz-labs/vibe-kanban) - a comprehensive agent orchestration platform.

---

## Architecture Overview

All agents in Vibe Kanban implement the `StandardCodingAgentExecutor` trait:

**Reference**: `vibe-kanban/crates/executors/src/executors/mod.rs:200-253`

```rust
#[async_trait]
pub trait StandardCodingAgentExecutor {
    // Inject approval service for interactive approvals
    fn use_approvals(&mut self, approvals: Arc<dyn ExecutorApprovalService>) {}

    // Spawn a new session with initial prompt
    async fn spawn(
        &self,
        current_dir: &Path,
        prompt: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError>;

    // Resume an existing session with a new prompt
    async fn spawn_follow_up(
        &self,
        current_dir: &Path,
        prompt: &str,
        session_id: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError>;

    // Process raw output into normalized conversation entries
    fn normalize_logs(&self, msg_store: Arc<MsgStore>, worktree_path: &Path);
}
```

**Key Data Structures**:

```rust
// Reference: vibe-kanban/crates/executors/src/executors/mod.rs:273-280
pub struct SpawnedChild {
    pub child: AsyncGroupChild,
    pub exit_signal: Option<ExecutorExitSignal>,      // Agent → Container: signals completion
    pub interrupt_sender: Option<InterruptSender>,    // Container → Agent: signals interrupt
}
```

---

## Agent Comparison Table

| Agent | Input Method | Output Format | Session ID Source | Resume Flag | External `/compact` |
|-------|--------------|---------------|-------------------|-------------|---------------------|
| **Claude Code** | `-p` flag + stdin for control | stream-json (NDJSON) | JSON output field | `--fork-session --resume <id>` | ✅ Yes |
| **GitHub Copilot** | `-p` flag or stdin | Plain text | Log file polling | `--resume <id>` | ✅ Yes (stdin only) |
| **OpenCode** | HTTP API | Server-Sent Events | HTTP response | Fork via API | Unknown |
| **Codex** | stdin (JSON-RPC) | JSON-RPC responses | Rollout file | Fork rollout file | Unknown |
| **Amp** | stdin (write + close) | stream-json | JSON output field | `--session <id>` | Unknown |
| **Cursor Agent** | stdin (write + close) | Plain text | Not supported | Not supported | ❌ No |

---

## Claude Code

**Package**: `claude` CLI (installed via `npm i -g @anthropic-ai/claude-code` or run with `npx`)

**Current Version**: 2.1.12

### Sending Prompts

**Simple non-interactive mode** (recommended for scripted usage):
```bash
claude -p "<prompt>" \
  --verbose \
  --output-format=stream-json \
  --dangerously-skip-permissions
```

**With Vibe Kanban's full protocol** (for approval handling):
```bash
claude -p "<prompt>" \
  --verbose \
  --output-format=stream-json \
  --input-format=stream-json \
  --include-partial-messages \
  --permission-prompt-tool=stdio \
  --permission-mode=bypassPermissions \
  --disallowedTools=AskUserQuestion
```

**Reference**: `vibe-kanban/crates/executors/src/executors/claude.rs:78-119`

### Key Flags

| Flag | Purpose |
|------|---------|
| `-p <text>` | Non-interactive mode - print response and exit |
| `--verbose` | Required for stream-json output |
| `--output-format=stream-json` | NDJSON streaming output with session_id |
| `--input-format=stream-json` | Enable bidirectional JSON control protocol |
| `--dangerously-skip-permissions` | Bypass all permission checks (yolo mode) |
| `--permission-mode=bypassPermissions` | Alternative permission bypass |
| `--fork-session` | Create new session ID when resuming |
| `--resume <id>` | Resume from a previous session |
| `-c, --continue` | Continue most recent conversation in current directory |
| `--model <model>` | Specify model (e.g., "sonnet", "opus") |
| `--include-partial-messages` | Include partial message chunks as they arrive |

### Multi-Turn (Resume)

**Resume session** (creates a fork with new session ID):
```bash
claude -p "<new_prompt>" \
  --fork-session \
  --resume <session_id> \
  --verbose \
  --output-format=stream-json \
  --dangerously-skip-permissions
```

**Reference**: `vibe-kanban/crates/executors/src/executors/claude.rs:192-207`

**Key difference from Copilot**: Claude Code uses `--fork-session --resume <id>` together. The `--fork-session` ensures a new session ID is created (original is preserved).

**Tested behavior**: When resumed, Claude Code correctly recalls previous conversation:
- Prompt 1: "Write a short 4-line poem about a dog"
- Prompt 2 (resumed): "Write a haiku about the same subject" → Claude writes a haiku about a dog

### Session ID Extraction

Session ID is available immediately in the **first message** (type: "system") of stream-json output.

**Example first message**:
```json
{"type":"system","subtype":"init","session_id":"6294feda-c7d8-4119-a216-554634f9e17a","model":"claude-opus-4-5-20251101",...}
```

**All subsequent messages also include session_id**:
```json
{"type":"assistant","session_id":"6294feda-c7d8-4119-a216-554634f9e17a","message":{...}}
{"type":"result","session_id":"6294feda-c7d8-4119-a216-554634f9e17a","result":"...","total_cost_usd":0.08}
```

```typescript
// TypeScript extraction example
interface StreamMessage {
  type: string;
  session_id?: string;
  // ... other fields
}

function extractSessionId(line: string): string | null {
  try {
    const msg: StreamMessage = JSON.parse(line);
    return msg.session_id || null;
  } catch {
    return null;
  }
}
```

**Key advantage over Copilot**: Session ID is available immediately in JSON output - no log file polling required.

### Output Format (stream-json / NDJSON)

Each line is a JSON object. Key message types:

| Type | Description |
|------|-------------|
| `system` (subtype: `init`) | First message with session_id, model, tools list |
| `assistant` | Model response with content blocks (text, tool_use) |
| `tool_result` | Result of tool execution |
| `result` | Final message with total cost, duration, success/error |

**Example complete session**:
```json
{"type":"system","subtype":"init","session_id":"abc123","model":"claude-opus-4-5-20251101",...}
{"type":"assistant","session_id":"abc123","message":{"content":[{"type":"text","text":"Hello!"}]}}
{"type":"result","subtype":"success","session_id":"abc123","result":"Hello!","total_cost_usd":0.08,"duration_ms":2757}
```

### Control Protocol (Advanced)

For interactive approval handling, use `--input-format=stream-json --permission-prompt-tool=stdio`:

**Reference**: `vibe-kanban/crates/executors/src/executors/claude/protocol.rs:1-214`

**Messages sent TO Claude (via stdin)**:
```json
// Initialize with hooks
{"type":"sdk_control_request","request":{"type":"initialize","hooks":{...}}}

// Set permission mode
{"type":"sdk_control_request","request":{"type":"set_permission_mode","mode":"bypassPermissions"}}

// Send user message
{"type":"message","role":"user","content":"Your prompt here"}

// Respond to approval request
{"type":"control_response","request_id":"123","response":{"allow":true}}

// Interrupt gracefully
{"type":"sdk_control_request","request":{"type":"interrupt"}}
```

**Messages FROM Claude (via stdout)**:
```json
// Approval request
{"type":"control_request","request_id":"123","request":{"type":"can_use_tool","tool_name":"Bash",...}}
```

### Detecting Agent State

| State | How to Detect |
|-------|---------------|
| **Running** | Process is alive, no `type: "result"` message received |
| **Completed** | Received `{"type": "result", "subtype": "success", ...}` |
| **Waiting for Approval** | Received `control_request` with `type: "can_use_tool"` |
| **Error** | Received `{"type": "result", "subtype": "error", ...}` or process exited non-zero |

### Compaction (External `/compact` Support)

**Claude Code supports external `/compact` triggers!**

To trigger compaction from an external caller, simply send `/compact` as the prompt in a resumed session:

```bash
claude -p "/compact" \
  --fork-session \
  --resume <session_id> \
  --verbose \
  --output-format=stream-json \
  --dangerously-skip-permissions
```

**Output when compacting**:
```json
{"type":"system","subtype":"status","status":"compacting","session_id":"..."}
{"type":"system","subtype":"status","status":null,"session_id":"..."}
{"type":"system","subtype":"init","session_id":"...","tools":[...]}
```

**Detection**:
1. `"status":"compacting"` - Compaction started
2. `"status":null` - Compaction finished
3. `"subtype":"init"` - Session reinitialized with compacted context

This allows external orchestrators to proactively manage context before hitting limits.

### Demo Scripts

See `scripts/agents/claude-code-session-demo.ts` for a working TypeScript example demonstrating:
- Real-time NDJSON parsing and formatted display
- Session ID extraction
- Multi-turn conversations with `--fork-session --resume`

See `scripts/agents/test-external-compact.ts` for testing external `/compact` triggers.

---

## GitHub Copilot CLI

**Package**: `@github/copilot` (latest, or pin version like `@github/copilot@0.0.387`)

### Sending Prompts

**Two methods supported**:

#### Method 1: `-p` flag (Recommended for scripted usage)
```bash
npx -y @github/copilot \
  --no-color \
  --yolo \
  --log-level debug \
  --log-dir /tmp/copilot_logs \
  -p "Your prompt here"
```

#### Method 2: stdin (Vibe Kanban pattern)
```bash
echo "Your prompt here" | npx -y @github/copilot \
  --no-color \
  --yolo \
  --log-level debug \
  --log-dir /tmp/copilot_logs
```

**Reference**: `vibe-kanban/crates/executors/src/executors/copilot.rs:115-140`

```rust
// Write prompt to stdin, then close
if let Some(mut stdin) = child.inner().stdin.take() {
    stdin.write_all(combined_prompt.as_bytes()).await?;
    stdin.shutdown().await?;  // Close stdin = EOF
}
```

### Key Flags

| Flag | Purpose |
|------|---------|
| `--yolo` | Full non-interactive mode (equivalent to `--allow-all --allow-all-tools --allow-all-paths --allow-all-urls`) |
| `--allow-all-tools` | Allow tools without confirmation (subset of --yolo) |
| `-p <text>` | Execute prompt in non-interactive mode (exits after completion) |
| `--no-color` | Disable ANSI colors for clean parsing |
| `--log-level debug` | Enable debug logging (required for session ID extraction) |
| `--log-dir <path>` | Set log directory (required for session ID extraction) |
| `--resume <id>` | Resume from a previous session |
| `-s, --silent` | Output only agent response (useful for scripting) |

### Multi-Turn (Resume)

**Resume session** (Copilot remembers conversation context):
```bash
npx -y @github/copilot \
  --no-color \
  --yolo \
  --log-level debug \
  --log-dir /tmp/copilot_logs \
  --resume <session_id> \
  -p "Follow-up prompt referencing previous context"
```

**Reference**: `vibe-kanban/crates/executors/src/executors/copilot.rs:143-185`

**Tested behavior**: When resumed, Copilot correctly recalls previous conversation. For example:
- Prompt 1: "Write a haiku about code"
- Prompt 2 (resumed): "What was the haiku about?" → Copilot correctly recalls the subject

### Session ID Extraction (UNIQUE APPROACH)

Copilot does NOT output session ID to stdout. Instead, it writes to log files.

**Reference**: `vibe-kanban/crates/executors/src/executors/copilot.rs:272-318`

**Pattern to search**: `events to session ([0-9a-fA-F-]{36})`

**Example log line**:
```
2026-01-20T08:35:15.568Z [DEBUG] Flushed 4 events to session b7d683fd-fd77-4c48-8828-999690801773
```

```typescript
// TypeScript extraction example
async function extractSessionId(logDir: string, timeoutMs: number): Promise<string | null> {
  const sessionRegex = /events to session ([0-9a-fA-F-]{36})/;

  // Poll log files every 200ms
  while (elapsed < timeoutMs) {
    const files = await fs.readdir(logDir);
    for (const file of files.filter(f => f.endsWith('.log'))) {
      const content = await fs.readFile(path.join(logDir, file), 'utf-8');
      const match = content.match(sessionRegex);
      if (match) return match[1];
    }
    await sleep(200);
  }
  return null;
}
```

**Steps**:
1. Create a temp log directory
2. Pass `--log-dir <path>` and `--log-level debug` to Copilot
3. Poll `*.log` files for regex: `events to session ([0-9a-fA-F-]{36})`
4. Extract the UUID

### Detecting Agent State

| State | How to Detect |
|-------|---------------|
| **Running** | Process is alive |
| **Completed** | Process exited (check exit code) |
| **Error** | Process exited with non-zero code |

**No approval protocol** - Use `--yolo` for non-interactive automation.

### Common Issues

#### OAuth App Restrictions
If Copilot hangs with no output, check logs for:
```
403 Although you appear to have the correct authorization credentials,
the `<org>` organization has enabled OAuth App access restrictions
```

**Fix**: Enable GitHub Copilot CLI in organization OAuth settings, or run from a non-restricted directory.

### Compaction (External `/compact` Support)

**Copilot supports `/compact` but ONLY via stdin, NOT via `-p` flag!**

The `-p` flag treats everything as a regular prompt. To trigger `/compact`, you must use stdin:

```bash
# This WORKS - stdin respects slash commands
echo "/compact" | npx -y @github/copilot \
  --no-color \
  --yolo \
  --log-level debug \
  --log-dir /tmp/copilot_logs \
  --resume <session_id>

# Output: "Conversation compacted. Ready for your next request."
```

```bash
# This does NOT work - -p treats it as a regular prompt
npx -y @github/copilot -p "/compact" --resume <session_id>
# Output: (Copilot just responds to "/compact" as text)
```

**Key insight**: Use stdin for slash commands, `-p` for regular prompts.

### Demo Scripts

- `scripts/agents/copilot-session-demo.ts` - Multi-turn conversation demo
- `scripts/agents/test-external-compact.ts` - Tests external `/compact` on both Claude Code and Copilot

---

## OpenCode

**Package**: `opencode-ai@1.1.3`

### Architecture

OpenCode uses an **HTTP server model** instead of CLI stdin/stdout.

**Reference**: `vibe-kanban/crates/executors/src/executors/opencode.rs:49-56`

```rust
let builder = CommandBuilder::new("npx -y opencode-ai@1.1.3")
    .extend_params(["serve", "--hostname", "127.0.0.1", "--port", "0"]);
```

### Sending Prompts

**Start server, then use HTTP API**:

```bash
# 1. Start server
npx -y opencode-ai@1.1.3 serve --hostname 127.0.0.1 --port 0

# Server outputs: "opencode server listening on http://127.0.0.1:XXXXX"

# 2. Create session
curl -X POST http://127.0.0.1:XXXXX/sessions \
  -H "X-Opencode-Dir: /path/to/project" \
  -H "Content-Type: application/json"
# Returns: {"id": "session-uuid"}

# 3. Send prompt
curl -X POST http://127.0.0.1:XXXXX/sessions/{session_id}/prompt \
  -H "X-Opencode-Dir: /path/to/project" \
  -H "Content-Type: application/json" \
  -d '{"parts": [{"type": "text", "text": "Your prompt"}]}'
```

**Reference**: `vibe-kanban/crates/executors/src/executors/opencode/sdk.rs:70-80`

### Multi-Turn (Resume)

**Fork an existing session**:

```bash
curl -X POST http://127.0.0.1:XXXXX/sessions/{parent_session_id}/fork \
  -H "X-Opencode-Dir: /path/to/project"
# Returns: {"id": "new-session-uuid"}
```

**Reference**: `vibe-kanban/crates/executors/src/executors/opencode/sdk.rs:172-183`

### Session ID Extraction

Session ID is returned directly from HTTP API responses.

```rust
#[derive(Debug, Deserialize)]
struct SessionResponse {
    id: String,  // This is the session ID
}
```

### Output Streaming

OpenCode uses **Server-Sent Events (SSE)** for streaming:

```bash
curl -N http://127.0.0.1:XXXXX/events \
  -H "X-Opencode-Dir: /path/to/project"
```

**Reference**: `vibe-kanban/crates/executors/src/executors/opencode/sdk.rs:196-199`

### Detecting Agent State

| State | How to Detect |
|-------|---------------|
| **Running** | SSE stream is active, receiving events |
| **Completed** | Received `idle` control event |
| **Waiting for Approval** | Received approval request event |
| **Error** | Received `error` event or HTTP error |

### Compaction

Not explicitly documented. Server manages context internally.

---

## Codex (OpenAI)

**Package**: `@openai/codex@0.77.0`

### Architecture

Codex uses **JSON-RPC over stdin/stdout** for bidirectional communication.

**Reference**: `vibe-kanban/crates/executors/src/executors/codex.rs:1-57`

### Sending Prompts

```bash
npx -y @openai/codex@0.77.0
# Process starts and waits for JSON-RPC messages on stdin
```

**Then send JSON-RPC messages**:

```json
{"jsonrpc":"2.0","method":"initialize","id":1,"params":{}}
{"jsonrpc":"2.0","method":"new_conversation","id":2,"params":{"prompt":"Your prompt"}}
```

**Reference**: `vibe-kanban/crates/executors/src/executors/codex/jsonrpc.rs:60-73`

### Multi-Turn (Resume)

Codex uses **rollout files** for session persistence:

**Reference**: `vibe-kanban/crates/executors/src/executors/codex/session.rs`

```
~/.codex/sessions/
  └── <timestamp>-<uuid>.rollout
```

To resume:
1. Find the rollout file
2. Fork it (copy with new UUID)
3. Pass the fork to the new session

### Session ID Extraction

Session ID is embedded in the rollout filename and returned via JSON-RPC responses.

### Detecting Agent State

| State | How to Detect |
|-------|---------------|
| **Running** | JSON-RPC responses being received |
| **Completed** | Received completion response |
| **Waiting for Approval** | Received approval JSON-RPC request |
| **Error** | JSON-RPC error response |

---

## Amp (Sourcegraph)

**Package**: `@sourcegraph/amp@0.0.1764777697`

### Sending Prompts

**Input method**: Write to stdin, then close stdin.

**Reference**: `vibe-kanban/crates/executors/src/executors/amp.rs:62-77`

```bash
echo "Your prompt" | npx -y @sourcegraph/amp@0.0.1764777697 \
  --output-format json \
  --no-color
```

### Multi-Turn (Resume)

```bash
echo "Follow-up prompt" | npx -y @sourcegraph/amp@0.0.1764777697 \
  --session <session_id> \
  --output-format json
```

**Reference**: `vibe-kanban/crates/executors/src/executors/amp.rs:135-150`

### Session ID Extraction

Extracted from JSON output stream (similar to Claude Code).

### Detecting Agent State

Same as Claude Code - process exit and JSON message types.

---

## Cursor Agent

**Package**: Custom (not public npm)

### Sending Prompts

**Input method**: Write to stdin, then close stdin.

**Reference**: `vibe-kanban/crates/executors/src/executors/cursor.rs:91-105`

### Multi-Turn (Resume)

**NOT SUPPORTED** - Cursor Agent does not support session resumption.

**Reference**: `vibe-kanban/crates/executors/src/executors/mod.rs:174-175`
```rust
Self::CursorAgent(_) => vec![BaseAgentCapability::SetupHelper],  // No SessionFork
```

---

## Unified UI Implementation Patterns

### 1. Output Display (Web Terminal)

For all agents, use a **WebSocket connection** to stream output:

**Reference**: `vibe-kanban/crates/server/src/routes/execution_processes.rs`

```typescript
// Connect to WebSocket
const ws = new WebSocket(`/api/execution-processes/${processId}/normalized-logs/ws`);

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  if ('JsonPatch' in msg) {
    // Apply JSON patch to conversation state
    setConversation(draft => applyPatch(draft, msg.JsonPatch));
  } else if (msg.finished) {
    // Agent completed
    setStatus('completed');
  }
};
```

### 2. Sending New Input

```typescript
// For follow-up messages
async function sendFollowUp(sessionId: string, prompt: string) {
  const response = await fetch(`/api/sessions/${sessionId}/follow-up`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt })
  });
  return response.json();
}

// Queue message while agent is running
async function queueMessage(sessionId: string, message: string) {
  await fetch(`/api/sessions/${sessionId}/queue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message })
  });
}
```

### 3. Detecting Agent State

```typescript
interface AgentState {
  status: 'idle' | 'running' | 'waiting_approval' | 'completed' | 'failed';
  sessionId: string | null;
  pendingApproval: ApprovalRequest | null;
}

function detectAgentState(entries: ConversationEntry[]): AgentState {
  // Check if any execution is running
  const isRunning = executions.some(e => e.status === 'running');

  // Check for pending approval
  const pendingApproval = entries.find(e =>
    e.entry_type.type === 'tool_use' &&
    e.entry_type.status.status === 'pending_approval'
  );

  if (pendingApproval) {
    return { status: 'waiting_approval', pendingApproval, ... };
  }

  if (isRunning) {
    return { status: 'running', ... };
  }

  return { status: 'idle', ... };
}
```

### 4. Approval Handling

```typescript
async function handleApproval(approvalId: string, approved: boolean, reason?: string) {
  await fetch(`/api/approvals/${approvalId}/respond`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: approved
        ? { status: 'approved' }
        : { status: 'denied', reason }
    })
  });
}
```

---

## Session Management Database Schema

**Reference**: `vibe-kanban/crates/db/src/models/`

```sql
-- High-level session container
CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  workspace_id UUID,
  executor TEXT,  -- "CLAUDE_CODE", "COPILOT", etc.
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Individual agent runs
CREATE TABLE execution_processes (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES sessions(id),
  run_reason TEXT,  -- 'codingagent', 'setupscript', etc.
  status TEXT,      -- 'running', 'completed', 'failed', 'killed'
  dropped BOOLEAN,  -- Soft delete for time-travel
  started_at TIMESTAMP,
  completed_at TIMESTAMP
);

-- Agent conversation turns with external session tracking
CREATE TABLE coding_agent_turns (
  id UUID PRIMARY KEY,
  execution_process_id UUID REFERENCES execution_processes(id),
  agent_session_id TEXT,  -- External session ID from agent
  prompt TEXT,
  summary TEXT,
  created_at TIMESTAMP
);
```

**Resume Query**:

**Reference**: `vibe-kanban/crates/db/src/models/execution_process.rs:509-529`

```sql
SELECT cat.agent_session_id
FROM execution_processes ep
JOIN coding_agent_turns cat ON ep.id = cat.execution_process_id
WHERE ep.session_id = $1
  AND ep.run_reason = 'codingagent'
  AND ep.dropped = FALSE
  AND cat.agent_session_id IS NOT NULL
ORDER BY ep.created_at DESC
LIMIT 1
```

---

## Process Management

### Spawn Pattern

**Reference**: `vibe-kanban/crates/executors/src/executors/claude.rs:258-277`

```rust
let mut command = Command::new(program_path);
command
    .kill_on_drop(true)           // Cleanup on parent exit
    .stdin(Stdio::piped())        // For sending prompts/control
    .stdout(Stdio::piped())       // For reading responses
    .stderr(Stdio::piped())       // For error capture
    .current_dir(current_dir)     // Workspace directory
    .args(&args);

let mut child = command.group_spawn()?;  // Process group for clean termination
```

### Graceful Termination

**Reference**: `vibe-kanban/crates/local-deployment/src/command.rs`

Signal escalation with timeouts:
1. **SIGINT** (graceful) - wait 2 seconds
2. **SIGTERM** (terminate) - wait 2 seconds
3. **SIGKILL** (force) - immediate

### Exit Monitoring

**Reference**: `vibe-kanban/crates/local-deployment/src/container.rs:373-414`

```rust
// Poll child process for completion
loop {
    match child.try_wait()? {
        Some(status) => {
            // Process exited - update DB, cleanup
            break;
        }
        None => {
            // Still running - continue polling
            sleep(Duration::from_millis(250)).await;
        }
    }
}
```

---

## Summary

| Feature | Claude Code | Copilot | OpenCode | Codex | Amp |
|---------|-------------|---------|----------|-------|-----|
| **Multi-turn** | Yes | Yes | Yes | Yes | Yes |
| **Session ID in stdout** | Yes | No (log files) | N/A (HTTP) | Via JSON-RPC | Yes |
| **Approval protocol** | Yes (stdin/stdout JSON) | No | Yes (HTTP) | Yes (JSON-RPC) | No |
| **Interrupt support** | Yes | No | Yes | Yes | No |
| **External `/compact`** | ✅ Yes (`-p`) | ✅ Yes (stdin only) | Unknown | Unknown | Unknown |

For a unified UI, the key abstraction is:
1. **Spawn** with initial prompt
2. **Stream** output via WebSocket
3. **Extract** session ID (agent-specific method)
4. **Follow-up** with session ID for multi-turn
5. **Detect** state from output and process status
6. **Handle** approvals when protocol supports it
7. **Compact** context when approaching limits (Claude Code only)
