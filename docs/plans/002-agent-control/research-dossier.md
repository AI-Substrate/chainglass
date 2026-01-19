# Research Report: Agent Control and Integration with Coding Agents

**Generated**: 2026-01-19T12:00:00Z
**Research Query**: "How Vibe Kanban works with coding agents like Claude Code, OpenCode, and Copilot for web interaction, non-interactive control, and session resumption"
**Mode**: Pre-Plan (docs/plans/002-agent-control)
**FlowSpace**: Available (vibe-kanban graph)
**Findings**: 70+ findings across 7 research subagents

## Executive Summary

### What It Does
Vibe Kanban is a comprehensive orchestration platform for AI coding agents that provides unified interfaces for spawning, controlling, and monitoring multiple agent types (Claude Code, OpenCode, Copilot, Codex, Gemini, etc.) through both web UI and programmatic APIs.

### Business Purpose
Enables developers to safely execute AI-assisted coding tasks with full control over agent sessions, real-time monitoring of agent output, and the ability to interact with agents both interactively (web UI) and non-interactively (CLI/API).

### Key Insights
1. **Trait-Based Executor Architecture**: All agents implement `StandardCodingAgentExecutor` trait with `spawn()` and `spawn_follow_up()` methods for unified session management
2. **Session ID Extraction Pattern**: Agent session IDs are extracted from output streams (not pre-generated), enabling resume via `--fork-session --resume <session_id>`
3. **WebSocket JSON-Patch Protocol**: Real-time UI updates use RFC6902 JSON Patch over WebSocket for efficient incremental state sync

### Quick Stats
- **Supported Agents**: 10+ (Claude Code, OpenCode, Copilot, Codex, Gemini, Cursor Agent, Qwen, Amp, Droid, CCR)
- **Architecture Pattern**: Rust backend (Axum) + React/TypeScript frontend
- **Communication**: WebSocket streaming with JSON-Patch, stdin/stdout piping for CLI agents
- **Session Persistence**: SQLite with `sessions`, `execution_processes`, `coding_agent_turns` tables

---

## How It Currently Works

### Entry Points

| Entry Point | Type | Location | Purpose |
|------------|------|----------|---------|
| `/api/tasks/create-and-start` | REST API | `crates/server/src/routes/tasks.rs` | Create task and start agent in one call |
| `/api/sessions/{id}/follow-up` | REST API | `crates/server/src/routes/sessions/mod.rs` | Send follow-up prompt to running session |
| `/api/execution-processes/{id}/raw-logs/ws` | WebSocket | `crates/server/src/routes/execution_processes.rs` | Stream raw stdout/stderr |
| `/api/execution-processes/{id}/normalized-logs/ws` | WebSocket | `crates/server/src/routes/execution_processes.rs` | Stream parsed conversation entries |
| MCP Server `create_task` | MCP Tool | `crates/server/src/mcp/task_server.rs` | Programmatic task creation |

### Core Execution Flow

1. **Task/Workspace Creation**
   - User creates task via API or MCP
   - System creates isolated git worktree for the task
   - Session record created in database with UUID

2. **Agent Spawn**
   - `ContainerService.start_workspace()` orchestrates spawn
   - Selects executor based on `ExecutorProfileId` (agent + variant)
   - Spawns process with piped stdin/stdout/stderr
   - Writes prompt to stdin, closes pipe to signal EOF

3. **Output Streaming**
   - `LocalContainerService.track_child_msgs_in_store()` captures stdout/stderr
   - Streams merged to `MsgStore` with atomic indexing
   - WebSocket handlers convert to JSON-Patch format
   - Frontend applies patches with Immer for efficient updates

4. **Session ID Extraction**
   - Log processor parses stream-json output
   - Extracts `session_id` from first message containing it
   - Stores in `coding_agent_turns.agent_session_id`

5. **Follow-Up/Resume**
   - API looks up latest `agent_session_id` from database
   - If found, spawns with `--fork-session --resume <session_id>`
   - If not found, starts fresh initial request

### Data Flow

```
User Input (Web/API)
       │
       ▼
┌─────────────────┐
│  Axum Router    │ ─── REST/WebSocket endpoints
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ContainerService │ ─── Orchestrates workspace lifecycle
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Executors     │ ─── Agent-specific spawn logic
│ (StandardCoding │     (ClaudeCode, OpenCode, Copilot...)
│ AgentExecutor)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Child Process  │ ─── Agent CLI running with piped I/O
│  (e.g. claude)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    MsgStore     │ ─── Thread-safe message buffer
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  WebSocket      │ ─── JSON-Patch streaming to frontend
│  Handlers       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  React Frontend │ ─── Real-time conversation display
└─────────────────┘
```

---

## Architecture & Design

### Component Map

#### Core Components

| Component | Purpose | Location |
|-----------|---------|----------|
| `CodingAgent` enum | Type registry for all supported agents | `crates/executors/src/executors/mod.rs:94-109` |
| `StandardCodingAgentExecutor` trait | Unified spawn interface | `crates/executors/src/executors/mod.rs:202-253` |
| `SpawnedChild` | Process handle with channels | `crates/executors/src/executors/mod.rs:274-280` |
| `ContainerService` trait | Workspace lifecycle management | `crates/services/src/services/container.rs` |
| `SessionManager` | File-based session persistence | `crates/executors/src/executors/acp/session.rs` |
| `ProtocolPeer` | Bidirectional control protocol | `crates/executors/src/executors/claude/protocol.rs` |

### Design Patterns Identified

1. **Strategy Pattern (Executors)**
   - Each agent type implements `StandardCodingAgentExecutor`
   - Uniform `spawn()` / `spawn_follow_up()` interface
   - Agent-specific behavior encapsulated in implementations

2. **Observer Pattern (Message Streaming)**
   - `MsgStore` acts as subject
   - WebSocket handlers subscribe to streams
   - JSON-Patch format for efficient diff updates

3. **State Machine (Execution Status)**
   - `ExecutionProcessStatus`: Running → Completed/Failed/Killed
   - Frontend `ExecutionStatus`: idle/sending/running/queued/stopping

4. **Repository Pattern (Session Persistence)**
   - `Session`, `ExecutionProcess`, `CodingAgentTurn` models
   - SQLite with sqlx for async queries

---

## Agent-Specific Integration Patterns

### Claude Code

**Command Pattern**:
```bash
npx -y @anthropic-ai/claude-code@2.1.2 \
  -p "<prompt>" \
  --verbose \
  --output-format=stream-json \
  --input-format=stream-json \
  --include-partial-messages \
  --permission-mode=bypassPermissions \
  --permission-prompt-tool=stdio \
  --disallowedTools=AskUserQuestion
```

**Resume Pattern**:
```bash
npx -y @anthropic-ai/claude-code@2.1.2 \
  -p "<new_prompt>" \
  --fork-session \
  --resume <session_id> \
  [same flags as above]
```

**Session ID Extraction**:
- Parsed from stream-json output messages
- Any message with `session_id` field works (Assistant, User, ToolUse, ToolResult, Result)
- Stored in `coding_agent_turns.agent_session_id`

**Control Protocol**:
- `--permission-prompt-tool=stdio` enables bidirectional control
- Can send `set_permission_mode` messages via stdin
- Handles tool approval requests via stdio

### OpenCode

**Pattern**: HTTP Server Model
```bash
npx -y opencode-ai@1.1.3 serve --hostname 127.0.0.1 --port 0
```

**Session Management**:
- Server-side session creation via `POST /sessions`
- Fork via `POST /sessions/{parent_id}/fork`
- Event streaming via Server-Sent Events (SSE)

### GitHub Copilot

**Command Pattern**:
```bash
npx -y @github/copilot@0.0.375 \
  --no-color \
  --log-level debug \
  --log-dir <log_dir>
```

**Resume Pattern**:
```bash
--resume <session_id>
```

**Session ID Extraction**:
- Parsed from log files via regex
- Not available in stdout

### Codex (OpenAI)

**Session Management**:
- File-based via "rollout files" in `~/.codex/sessions/`
- Session IDs embedded in filenames (timestamp + UUID)
- Fork copies rollout file with new session ID

---

## Web Interaction Capabilities

### Real-Time Output Display

**WebSocket Protocol**:
- Endpoint: `/api/execution-processes/{id}/normalized-logs/ws`
- Format: RFC6902 JSON-Patch
- Message types: `JsonPatch`, `Ready`, `finished`

**Frontend Implementation**:
```typescript
// useJsonPatchWsStream.ts
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if ('JsonPatch' in msg) {
    const next = produce(current, (draft) => {
      applyPatch(draft, msg.JsonPatch);
    });
    setData(next);
  }
};
```

### Sending Input to Agents

**Follow-Up API**:
```typescript
POST /api/sessions/{session_id}/follow-up
{
  "prompt": "new instructions",
  "variant": null
}
```

**Message Queueing** (while agent is running):
```typescript
POST /api/sessions/{session_id}/queue
{
  "message": "queued instructions",
  "variant": null
}
```

### Detecting Agent State

**Is Agent Running**:
```typescript
const isAttemptRunning = executionProcesses.some(
  (process) =>
    process.run_reason === 'codingagent' &&
    process.status === 'running'
);
```

**Is Agent Asking Question** (Pending Approval):
```typescript
const pendingApproval = entries.find(entry =>
  entry.entry_type.type === 'tool_use' &&
  entry.entry_type.status.status === 'pending_approval'
);
```

**Approval Response**:
```typescript
POST /api/approvals/{approval_id}/respond
{
  "execution_process_id": "<uuid>",
  "status": { "status": "approved" } // or { "status": "denied", "reason": "..." }
}
```

---

## Non-Interactive Control

### Kicking Off a Session

**API Call**:
```typescript
POST /api/task-attempts
{
  "task_id": "<uuid>",
  "project_id": "<uuid>",
  "executor_profile_id": {
    "executor": "CLAUDE_CODE",
    "variant": "DEFAULT"
  }
}
```

**Response** includes `workspace_id` and triggers agent spawn.

### Getting Results

**Poll Execution Status**:
```typescript
GET /api/execution-processes?session_id=<session_id>
```

**Or Stream via WebSocket**:
```typescript
ws://host/api/execution-processes/{id}/raw-logs/ws
```

**Terminal Message Detection**:
```json
{ "finished": true }  // WebSocket message
// or
{ "type": "result", "session_id": "...", ... }  // In stream-json output
```

### Direct CLI Usage (Claude Code)

For non-Vibe-Kanban usage, the user's pattern works:
```bash
claude -r <session_id> \
  -p "new prompt" \
  --output-format stream-json \
  --verbose | jq -r 'select(.type == "result") | .result'
```

Key flags:
- `-r <session_id>`: Resume existing session
- `-p "<prompt>"`: Non-interactive prompt mode
- `--output-format stream-json`: Structured NDJSON output
- `--verbose`: Include detailed messages

---

## Session Resumption Mechanisms

### Session ID Flow

```
1. Initial Spawn
   └── Agent outputs stream-json with session_id in messages
       └── ClaudeLogProcessor.extract_session_id() parses output
           └── MsgStore.push_session_id() broadcasts
               └── Stored in coding_agent_turns.agent_session_id

2. Follow-Up Request
   └── ExecutionProcess.find_latest_coding_agent_turn_session_id()
       └── Returns most recent non-dropped session_id
           └── spawn_follow_up() adds --fork-session --resume <id>
```

### Database Schema (Relevant Tables)

```sql
-- High-level session container
CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  workspace_id UUID,
  executor TEXT,  -- "CLAUDE_CODE", "COPILOT", etc.
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Individual agent runs within a session
CREATE TABLE execution_processes (
  id UUID PRIMARY KEY,
  session_id UUID,
  run_reason TEXT,  -- 'codingagent', 'setupscript', etc.
  status TEXT,      -- 'running', 'completed', 'failed', 'killed'
  dropped BOOLEAN,  -- Soft delete for time-travel
  started_at TIMESTAMP,
  completed_at TIMESTAMP
);

-- Agent conversation turns with external session tracking
CREATE TABLE coding_agent_turns (
  id UUID PRIMARY KEY,
  execution_process_id UUID,
  agent_session_id TEXT,  -- External session ID from Claude/etc.
  prompt TEXT,
  summary TEXT,
  created_at TIMESTAMP
);
```

### Resume Query

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

## Permission/Approval Workflow

### Permission Modes (Claude Code)

| Mode | Flag | Behavior |
|------|------|----------|
| Default | `--permission-mode=default` | Requires approval for dangerous operations |
| Accept Edits | `--permission-mode=acceptEdits` | Auto-approve file edits |
| Plan | `--permission-mode=plan` | Read-only exploration |
| Bypass | `--permission-mode=bypassPermissions` | Full autonomy (Vibe Kanban default) |

### Approval Service Interface

```rust
pub trait ExecutorApprovalService: Send + Sync {
    async fn request_tool_approval(
        &self,
        session_id: &str,
        tool_call: ToolCallMetadata,
    ) -> Result<ApprovalResponse, ExecutorApprovalError>;
}

// For non-interactive: NoopExecutorApprovalService auto-approves everything
```

### Frontend Approval Detection

```typescript
// Scan entries for pending approval
const pendingApproval = entries.find(entry =>
  entry.entry_type.type === 'tool_use' &&
  entry.entry_type.status.status === 'pending_approval'
);

if (pendingApproval) {
  // Show approval UI with countdown timer
  // Enable approve/deny buttons
}
```

---

## Process Management

### Spawn Pattern

```rust
let mut command = Command::new(program_path);
command
    .kill_on_drop(true)           // Cleanup on parent exit
    .stdin(Stdio::piped())        // For sending prompts
    .stdout(Stdio::piped())       // For reading responses
    .stderr(Stdio::piped())       // For error capture
    .current_dir(current_dir)     // Workspace directory
    .args(&args);

let mut child = command.group_spawn()?;  // Process group for clean termination
```

### Graceful Termination

Signal escalation with timeouts:
1. SIGINT (graceful)
2. Wait 2 seconds
3. SIGTERM (terminate)
4. Wait 2 seconds
5. SIGKILL (force)

```rust
fn kill_process_group(pid: Pid) {
    signal::killpg(pgid, Signal::SIGINT)?;
    sleep(Duration::from_secs(2)).await;
    signal::killpg(pgid, Signal::SIGTERM)?;
    sleep(Duration::from_secs(2)).await;
    signal::killpg(pgid, Signal::SIGKILL)?;
}
```

### Exit Monitoring

```rust
// Polling strategy (250ms intervals)
loop {
    match child.try_wait()? {
        Some(status) => {
            tx.send(Ok(status)).await;
            break;
        }
        None => sleep(Duration::from_millis(250)).await,
    }
}
```

---

## Modification Considerations

### Safe to Modify
- **UI components**: Well-isolated React components
- **New executor implementations**: Follow `StandardCodingAgentExecutor` trait
- **API extensions**: Add new routes following existing patterns

### Modify with Caution
- **Session ID extraction logic**: Agent-specific parsing
- **WebSocket protocol**: Frontend depends on exact message format
- **Database schema**: Many queries assume current structure

### Danger Zones
- **Executor trait contract**: Breaking changes affect all agents
- **Process group management**: Incorrect handling causes zombie processes
- **MsgStore internals**: Thread-safety critical for streaming

---

## Key Takeaways for Chainglass Implementation

### 1. Web Interaction (See Output, Type to Agents)

**Pattern**: WebSocket streaming with JSON-Patch
- Use RFC6902 JSON-Patch for efficient incremental updates
- Implement `Ready` and `finished` message types for lifecycle
- Frontend uses Immer for immutable state updates

**API Design**:
```
WS /api/agent/{session_id}/stream  → Real-time output
POST /api/agent/{session_id}/input → Send commands
POST /api/agent/{session_id}/stop  → Terminate
```

### 2. Non-Interactive Control (Kick Off, Get Results)

**Pattern**: REST API with session tracking
```
POST /api/agent/start { prompt, agent_type } → { session_id }
GET /api/agent/{session_id}/status → { status, result }
GET /api/agent/{session_id}/output → Full conversation log
```

**CLI Execution**:
```bash
claude -p "prompt" --output-format stream-json | process_output
```

### 3. Session Resumption

**Pattern**: Extract and store agent session IDs
- Parse from agent output (not pre-generated)
- Store in database with execution context
- Resume with `--fork-session --resume <id>` (Claude) or equivalent

**Example Resume**:
```bash
claude -r d2e37608-a84a-4444-b68c-a54b322684e0 \
  -p "continue from where we left off" \
  --output-format stream-json
```

### 4. Agent State Detection

**Patterns**:
- **Running**: Process still alive, no `finished` message
- **Waiting for Input**: Pending approval detected in output
- **Completed**: `finished` WebSocket message or `type: "result"` in stream

### 5. Architecture Recommendation

```
┌─────────────────────────────────────────────────────────────┐
│                    Chainglass Web App                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Agent Panel │  │ Task Board  │  │ Session Mgr │         │
│  │ (Terminal)  │  │ (Kanban)    │  │ (History)   │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         └────────────────┼────────────────┘                │
│                          │                                  │
│                   ┌──────▼──────┐                          │
│                   │  WebSocket  │                          │
│                   │   Client    │                          │
│                   └──────┬──────┘                          │
└──────────────────────────┼──────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────┐
│                    Chainglass API                           │
│                   ┌──────▼──────┐                          │
│                   │   Router    │                          │
│                   │   (Axum)    │                          │
│                   └──────┬──────┘                          │
│         ┌────────────────┼────────────────┐                │
│  ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐        │
│  │   Session   │  │  Executor   │  │   Stream    │        │
│  │   Manager   │  │   Registry  │  │   Manager   │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         │                │                │                │
│  ┌──────▼────────────────▼────────────────▼──────┐        │
│  │              Agent Executors                   │        │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐       │        │
│  │  │ Claude  │  │OpenCode │  │ Copilot │  ...  │        │
│  │  │ Code    │  │         │  │         │       │        │
│  │  └────┬────┘  └────┬────┘  └────┬────┘       │        │
│  └───────┼────────────┼────────────┼─────────────┘        │
└──────────┼────────────┼────────────┼──────────────────────┘
           │            │            │
    ┌──────▼──────┐  ┌──▼───┐  ┌────▼────┐
    │ claude CLI  │  │ HTTP │  │ copilot │
    │ (stdin/out) │  │Server│  │  CLI    │
    └─────────────┘  └──────┘  └─────────┘
```

---

## External Research Opportunities

### Research Opportunity 1: Claude Code SDK and Control Protocol

**Why Needed**: The stream-json control protocol for Claude Code enables advanced features like dynamic permission changes and tool approval handling. Current documentation may be incomplete.

**Impact on Plan**: Essential for interactive approval workflows in web UI.

**Ready-to-use prompt**:
```
/deepresearch "Claude Code CLI stream-json protocol 2025-2026:
- Complete message type documentation for --output-format stream-json and --input-format stream-json
- Control protocol messages (set_permission_mode, tool approval requests/responses)
- Session management (--fork-session vs --resume semantics)
- Best practices for bidirectional communication"
```

### Research Opportunity 2: OpenCode API Documentation

**Why Needed**: OpenCode uses HTTP server model instead of CLI. Need complete API documentation for session management and event streaming.

**Impact on Plan**: Required if supporting OpenCode agent.

**Ready-to-use prompt**:
```
/deepresearch "OpenCode AI coding agent HTTP API 2025-2026:
- Session creation and fork endpoints
- Server-Sent Events (SSE) streaming format
- Authentication and configuration options"
```

---

## Next Steps

1. **Review this research** and identify any gaps
2. **Run /deepresearch prompts** if external documentation needed
3. **Run /plan-1b-specify** to create feature specification for agent control system

---

**Research Complete**: 2026-01-19
**Report Location**: docs/plans/002-agent-control/research-dossier.md
