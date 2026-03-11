# PR View & File Notes Features — Interface & Contract Documentation

**Date:** 2025  
**Context:** Research for two new features - PR View (GitHub-style diff view, worktree data, mark-as-reviewed) and File Notes (generic note system with links)

---

## IC-01: IFileSystem Interface

**File:** `/Users/jordanknight/substrate/071-pr-view/packages/shared/src/interfaces/filesystem.interface.ts`

**Purpose:** Abstract filesystem operations for Node.js file handling. Critical for isolation and testing.

**Key Methods:**
- `exists(path: string): Promise<boolean>` — Check path existence
- `readFile(path: string): Promise<string>` — Read UTF-8 file content
- `writeFile(path: string, content: string | Buffer): Promise<void>` — Write file (parent must exist)
- `readDir(path: string): Promise<string[]>` — List directory contents
- `mkdir(path: string, options?: { recursive?: boolean }): Promise<void>` — Create directory
- `stat(path: string): Promise<FileStat>` — Get file/directory metadata
- `copyFile(source: string, dest: string): Promise<void>` — Copy single file
- `copyDirectory(source: string, dest: string, options?: { exclude?: string[] }): Promise<void>` — Recursive copy with exclusions
- `glob(pattern: string, options?: { cwd?: string; absolute?: boolean }): Promise<string[]>` — Glob pattern matching
- `unlink(path: string): Promise<void>` — Delete file
- `rmdir(path: string, options?: { recursive?: boolean }): Promise<void>` — Delete directory
- `rename(oldPath: string, newPath: string): Promise<void>` — Atomic rename/move
- `realpath(path: string): Promise<string>` — Resolve symlinks

**Error Handling:** Custom `FileSystemError(message, code, path, cause?)` with error codes like `ENOENT`, `ENOTDIR`, `ENOTEMPTY`, `EISDIR`

**Implementations:**
- `NodeFileSystemAdapter` — Production (uses fs/promises)
- `FakeFileSystem` — Testing (in-memory)

**Key Contract:** All methods use absolute paths. Per CD-04, all services must use `IFileSystem`, never `fs` directly.

---

## IC-02: IPathResolver Interface

**File:** `/Users/jordanknight/substrate/071-pr-view/packages/shared/src/interfaces/path-resolver.interface.ts`

**Purpose:** Secure path operations with directory traversal protection (Critical Discovery 11).

**Key Methods:**
- `resolvePath(base: string, relative: string): string` — Resolve relative path securely within base directory
- `join(...segments: string[]): string` — Join and normalize path segments
- `dirname(filePath: string): string` — Get directory name
- `basename(filePath: string, ext?: string): string` — Get file name
- `normalize(filePath: string): string` — Normalize path, resolve . and ..
- `isAbsolute(filePath: string): boolean` — Check if path is absolute
- `relative(from: string, to: string): string` — Get relative path between two paths

**Error Handling:** `PathSecurityError(message, base, requested)` thrown when resolution escapes base directory

**Implementations:**
- `PathResolverAdapter` — Production (uses path module)
- `FakePathResolver` — Testing (configurable)

**Key Contract:** Prevents directory traversal attacks (e.g., `../../../etc/passwd`). Results always stay within base directory.

---

## IC-03: IStateService Interface

**File:** `/Users/jordanknight/substrate/071-pr-view/packages/shared/src/interfaces/state.interface.ts`

**Purpose:** Centralized ephemeral runtime state system (Plan 053: GlobalStateSystem). Domains publish to colon-delimited paths; consumers subscribe without coupling.

**Path Format:** `domain:property` (singleton, 2 segments) or `domain:instanceId:property` (multi-instance, 3 segments)

**Key Methods - Domain Registration:**
- `registerDomain(descriptor: StateDomainDescriptor): void` — Register domain at bootstrap
- `listDomains(): StateDomainDescriptor[]` — List registered domains

**Key Methods - Publishing:**
- `publish<T>(path: string, value: T, source?: StateEntrySource): void` — Set state at path, notify subscribers
- `remove(path: string): void` — Remove specific entry
- `removeInstance(domain: string, instanceId: string): void` — Remove all entries for instance

**Key Methods - Reading:**
- `get<T>(path: string): T | undefined` — Get current value at path
- `list(pattern: string): StateEntry[]` — List entries matching pattern
- `listInstances(domain: string): string[]` — List instance IDs for multi-instance domain

**Key Methods - Subscriptions:**
- `subscribe(pattern: string, callback: StateChangeCallback): () => void` — Subscribe to changes
  - Pattern types: exact, domain wildcard (`*`), instance wildcard, domain-all (`**`), global (`*`)
  - Returns unsubscribe function

**Subscribers:**
- `readonly subscriberCount: number` — Total active subscriptions
- `readonly entryCount: number` — Total stored entries

**Key Contracts:**
- Per PL-01: Store updated BEFORE subscribers notified
- Per PL-07: Subscriber errors isolated (one error doesn't block others)
- Per PL-08: Dispatch unidirectional (never calls back to publishers)
- Per Workshop 002: Consumers are read-only (`useGlobalState` returns value, not tuple)

**Source Metadata (`StateEntrySource`):**
```typescript
interface StateEntrySource {
  origin: 'client' | 'server';
  channel?: string;      // SSE channel (server-origin only)
  eventType?: string;    // Server event type (server-origin only)
}
```

---

## IC-04: IUSDK Interface (Command Registry, Settings, Context Keys, Keybindings)

**File:** `/Users/jordanknight/substrate/071-pr-view/packages/shared/src/interfaces/sdk.interface.ts`

**Purpose:** Top-level SDK facade for commands, settings, context, and keybindings (Plan 047: USDK).

### ICommandRegistry
- `register(command: SDKCommand): { dispose: () => void }` — Register command (throws if ID exists)
- `execute(id: string, params?: unknown): Promise<void>` — Execute command with Zod validation
- `list(filter?: { domain?: string }): SDKCommand[]` — List commands
- `isAvailable(id: string): boolean` — Check command availability via when-clause

**Contract:** DYK-05 — execute() wraps handler in try/catch, never crashes caller

### ISDKSettings
- `hydrate(sdkSettings: Record<string, unknown>): void` — Seed with persisted values
- `contribute(setting: SDKSetting): void` — Contribute setting definition
- `get(key: string): unknown` — Get setting value (returns stable reference per DYK-02)
- `set(key: string, value: unknown): void` — Set value with Zod validation
- `reset(key: string): void` — Reset to schema default
- `onChange(key: string, callback: (value: unknown) => void): { dispose: () => void }` — Subscribe to changes
- `list(): SDKSetting[]` — List all settings
- `toPersistedRecord(): Record<string, unknown>` — Export overridden values only

**Contract:** DYK-02 — get() returns exact same reference for unchanged values (required for React hooks)

### IContextKeyService
- `set(key: string, value: unknown): void` — Set context key
- `get(key: string): unknown` — Get context key value
- `evaluate(expression: string | undefined): boolean` — Evaluate when-clause (supports `key`, `!key`, `key == value`)
- `onChange(callback: (key: string, value: unknown) => void): { dispose: () => void }` — Subscribe to changes

### IKeybindingService
- `register(binding: SDKKeybinding): { dispose: () => void }` — Register keybinding (throws if duplicate)
- `getBindings(): SDKKeybinding[]` — Get all bindings
- `buildTinykeysMap(execute, isAvailable): Record<string, (event: KeyboardEvent) => void>` — Build tinykeys-compatible map

**Contract:** DYK-P4-01 tinykeys owns chord resolution; DYK-P4-05 bindings are static

### IUSDK (Top-Level Facade)
```typescript
interface IUSDK {
  readonly commands: ICommandRegistry;
  readonly settings: ISDKSettings;
  readonly context: IContextKeyService;
  readonly keybindings: IKeybindingService;
  readonly toast: {
    success(message: string): void;
    error(message: string): void;
    info(message: string): void;
    warning(message: string): void;
  };
}
```

**Contract:** DYK-03 — SDKProvider is global (not workspace-scoped)

---

## IC-05: IGitDiffService Interface

**File:** `/Users/jordanknight/substrate/071-pr-view/packages/shared/src/interfaces/diff.interface.ts`

**Purpose:** Git diff service for DiffViewer component (Phase 5).

**Types:**
- `DiffError = 'not-git' | 'no-changes' | 'git-not-available'`
- `DiffResult { diff: string | null; error: DiffError | null }` — Result union

**Key Method:**
- `getGitDiff(filePath: string): Promise<DiffResult>` — Get git diff for file

**Implementations:**
- Real: `getGitDiff` server action
- Test: `FakeDiffAction`

---

## IC-06: ViewerFile Interface

**File:** `/Users/jordanknight/substrate/071-pr-view/packages/shared/src/interfaces/viewer.interface.ts`

**Purpose:** Shared interface for file viewer components (FileViewer, MarkdownViewer, DiffViewer). Pure data structure.

**Properties:**
```typescript
interface ViewerFile {
  path: string;           // Relative to project root (e.g., 'src/components/Button.tsx')
  filename: string;       // File name only for language detection
  content: string;        // File content as string
}
```

---

## IC-07: IWorkUnitStateService Interface

**File:** `/Users/jordanknight/substrate/071-pr-view/packages/shared/src/interfaces/work-unit-state.interface.ts`

**Purpose:** Centralized work unit status registry (Plan 059). Tracks status for agents, workflow nodes, pods. Publishes via CentralEventNotifier → SSE → GlobalStateSystem.

**State Paths:** `work-unit-state:{id}:status`, `work-unit-state:{id}:intent`, `work-unit-state:{id}:name`

**Key Methods:**
- `register(input: RegisterWorkUnitInput): void` — Register work unit (emits 'registered' event)
- `unregister(id: string): void` — Remove work unit (emits 'removed' event)
- `updateStatus(id: string, input: UpdateWorkUnitInput): void` — Update status/intent (emits 'status-changed' event)
- `getUnit(id: string): WorkUnitEntry | undefined` — Get single work unit
- `getUnits(filter?: WorkUnitFilter): WorkUnitEntry[]` — Get all units (optionally filtered)
- `getUnitBySourceRef(graphSlug: string, nodeId: string): WorkUnitEntry | undefined` — Look up by source reference
- `tidyUp(): void` — Remove stale entries (> 24h old, not working/waiting)

**Key Contract:** NOT the orchestrator (Plan 032). Only observes status. Persists to JSON for server restart survival.

---

## IC-08: IWorkflowEvents Interface

**File:** `/Users/jordanknight/substrate/071-pr-view/packages/shared/src/interfaces/workflow-events.interface.ts`

**Purpose:** Intent-based API for workflow event interactions (Plan 061). Hides raiseEvent(), event handlers, state transitions, and 3-event QnA handshake.

**Actions (5 methods):**
- `askQuestion(graphSlug: string, nodeId: string, question: QuestionInput): Promise<{ questionId: string }>` — Ask question
- `answerQuestion(graphSlug: string, nodeId: string, questionId: string, answer: unknown): Promise<void>` — Answer (handles 3-event handshake)
- `getAnswer(graphSlug: string, nodeId: string, questionId: string): Promise<AnswerResult | null>` — Get previous answer
- `reportProgress(graphSlug: string, nodeId: string, progress: ProgressInput): Promise<void>` — Report progress
- `reportError(graphSlug: string, nodeId: string, error: ErrorInput): Promise<void>` — Report error

**Observers (4 methods):**
- `onQuestionAsked(graphSlug: string, handler: (event: QuestionAskedEvent) => void): () => void` — Subscribe to questions
- `onQuestionAnswered(graphSlug: string, handler: (event: QuestionAnsweredEvent) => void): () => void` — Subscribe to answers
- `onProgress(graphSlug: string, handler: (event: ProgressEvent) => void): () => void` — Subscribe to progress
- `onEvent(graphSlug: string, handler: (event: WorkflowEvent) => void): () => void` — Subscribe to all events

**Contract:** AC-01 — 5 actions + 4 observers = 9 total methods. Per AC-03, callers don't need to know about 3-event handshake.

---

## IC-09: ICentralEventNotifier & ISSEBroadcaster Interfaces

**Files:**
- `/Users/jordanknight/substrate/071-pr-view/packages/shared/src/features/027-central-notify-events/central-event-notifier.interface.ts`
- `/Users/jordanknight/substrate/071-pr-view/packages/shared/src/features/019-agent-manager-refactor/sse-broadcaster.interface.ts`

**Purpose:** Plan 027 — Central domain event notification system. Two-layer architecture:
1. ICentralEventNotifier — Domain-facing API
2. ISSEBroadcaster — SSE transport layer

### ICentralEventNotifier
- `emit(domain: WorkspaceDomainType, eventType: string, data: Record<string, unknown>): void` — Emit domain event

**Domain Enum (WorkspaceDomain):**
```typescript
const WorkspaceDomain = {
  Workgraphs: 'workgraphs',          // @deprecated (Plan 050 Phase 7)
  Agents: 'agents',                  // SSE channel: 'agents'
  FileChanges: 'file-changes',        // SSE channel: 'file-changes'
  Workflows: 'workflows',             // SSE channel: 'workflows' (Plan 050)
  WorkUnitState: 'work-unit-state',  // SSE channel: 'work-unit-state' (Plan 059)
  UnitCatalog: 'unit-catalog',        // SSE channel: 'unit-catalog' (Plan 058)
} as const;
type WorkspaceDomainType = typeof WorkspaceDomain[keyof typeof WorkspaceDomain];
```

**Implementations:**
- `FakeCentralEventNotifier` — Test double (packages/shared) with inspectable `emittedEvents` state
- `CentralEventNotifierService` — Real (apps/web, Phase 2) wrapping ISSEBroadcaster

**Contract:** Per ADR-0004 resolved via DI token `WORKSPACE_DI_TOKENS.CENTRAL_EVENT_NOTIFIER`

### ISSEBroadcaster
- `broadcast(channel: string, eventType: string, data: unknown): void` — Broadcast SSE message

**Implementations:**
- `SSEManagerBroadcaster` — Production (apps/web, wraps SSEManager)
- `FakeSSEBroadcaster` — Testing (packages/shared)

**Contract:** Per ADR-0007 — data is `Record<string, unknown>`, carries only domain identifiers (e.g., `{ graphSlug }`). Clients fetch full state via REST.

---

## IC-10: IAgentManagerService Interface

**Files:**
- `/Users/jordanknight/substrate/071-pr-view/packages/shared/src/features/019-agent-manager-refactor/agent-manager.interface.ts` (Plan 019, Phase 3+)
- `/Users/jordanknight/substrate/071-pr-view/packages/shared/src/features/034-agentic-cli/agent-manager-service.interface.ts` (Plan 034, simpler version)

**Purpose:** Central agent management — single source of truth for all agent state across all workspaces.

### Plan 019 Version (Full)
```typescript
interface IAgentManagerService {
  initialize(): Promise<void>;  // Load persisted agents from storage
  createAgent(params: CreateAgentParams): IAgentInstance;
  getAgents(filter?: AgentFilter): IAgentInstance[];
  getAgent(agentId: string): IAgentInstance | null;
  terminateAgent(agentId: string): Promise<boolean>;
}

interface CreateAgentParams {
  name: string;
  type: AgentType;
  workspace: string;
  sessionId?: string;
  tmuxWindow?: string;
  tmuxPane?: string;
}

interface AgentFilter {
  workspace?: string;
}
```

**Key Contracts:**
- Per AC-01: Creates agents with unique IDs
- Per AC-02: Returns all agents regardless of workspace (when no filter)
- Per AC-03: Filters agents by workspace when filter.workspace provided
- Per AC-04: Returns null for unknown agent (graceful handling)
- Per AC-23: Validates agent name/ID to prevent path traversal
- Per DYK-12: initialize() only required when storage provided
- Per DYK-13: Uses AgentInstance.hydrate() for persisted agents
- Per AC-05: Enables agents to survive process restart

### Plan 034 Version (Agentic CLI)
```typescript
interface IAgentManagerService {
  getNew(params: CreateAgentParams): IAgentInstance;
  getWithSessionId(sessionId: string, params: CreateAgentParams): IAgentInstance;
  getAgent(agentId: string): IAgentInstance | null;
  getAgents(filter?: AgentFilter): IAgentInstance[];
  terminateAgent(agentId: string): Promise<boolean>;
  initialize(): Promise<void>;
}
```

**Key Contract:** Same-instance guarantee (MUST) — repeated calls with same `sessionId` return identical object reference (`===`). Ensures multiple consumers (UI, CLI, orchestrator) share cohesive state.

**Implementations:**
- `AgentManagerService` — Real implementation (in-memory registry)
- `FakeAgentManagerService` — Test double with state setup helpers

---

## IC-11: IAgentInstance Interface

**File:** `/Users/jordanknight/substrate/071-pr-view/packages/shared/src/features/034-agentic-cli/agent-instance.interface.ts`

**Purpose:** Domain-agnostic agent session wrapper (Plan 034, Workshop 02). Owns identity, status, session, metadata. Passes adapter events through. Does NOT store events, broadcast SSE, or depend on storage/notifier.

**Identity (Immutable):**
```typescript
readonly id: string;
readonly name: string;
readonly type: AgentType;
readonly workspace: string;
```

**State:**
```typescript
readonly status: AgentInstanceStatus;  // 'working' | 'stopped' | 'error'
readonly isRunning: boolean;            // Convenience: status === 'working'
readonly sessionId: string | null;      // Updated after run()/compact()
readonly createdAt: Date;
readonly updatedAt: Date;
```

**Metadata (Property Bag):**
```typescript
readonly metadata: Readonly<Record<string, unknown>>;
setMetadata(key: string, value: unknown): void;  // Freeform, no validation
```

**Event Pass-Through:**
```typescript
addEventHandler(handler: AgentEventHandler): void;
removeEventHandler(handler: AgentEventHandler): void;
```

**Actions:**
```typescript
run(options: AgentRunOptions): Promise<AgentResult>;        // Throws if already working
compact(options?: AgentCompactOptions): Promise<AgentResult>; // Throws if no session
terminate(): Promise<AgentResult>;                          // Always succeeds
```

**Contract:**
- Transitions: `stopped → working → stopped|error`
- Double-run guard — throws if `status === 'working'`
- If `sessionId` is null before terminate(), skips adapter call, returns synthetic `status: 'killed'`

---

## Key Design Patterns Across Interfaces

### 1. **Adapter Pattern**
- **Examples:** `IAgentAdapter`, `IOutputAdapter`, `IFileSystem`, `IPathResolver`
- **Contract:** Interfaces in `packages/shared/src/interfaces/`, implementations vary by context
- **Fake implementations:** Always available in packages/shared for testing

### 2. **Service Registry / Manager Pattern**
- **Examples:** `IAgentManagerService`, `IWorkUnitStateService`, `IStateService`
- **Contract:** Single source of truth, publish/subscribe for state changes
- **Lifecycle:** Initialize at bootstrap, persisted state optional

### 3. **Domain Event System**
- **Examples:** `ICentralEventNotifier`, `IWorkflowEvents`, `IWorkUnitStateService`
- **Contract:** Minimal payload (per ADR-0007), clients fetch full state via REST
- **Transport:** SSE channel + event type + data record

### 4. **State Path Hierarchies**
- **Format:** `domain:property` (singleton) or `domain:instanceId:property` (multi-instance)
- **Examples:**
  - `work-unit-state:agent-abc:status`
  - `workflow:wf-1:status`
  - `worktree:main:branch`

### 5. **Error Handling**
- **File errors:** `FileSystemError(message, code, path, cause?)`
- **Path errors:** `PathSecurityError(message, base, requested)`
- **Commands:** ZodError on validation, try/catch wrapper (never propagates)

### 6. **Subscription Pattern**
- **Pattern matching:** Exact, wildcard (`*`), domain-all (`**`), global (`*`)
- **Return:** Unsubscribe function `() => void`
- **Contract:** Isolated errors, store-first updates

---

## Contract Summary for PR View & File Notes

### For PR View:
1. Use `IFileSystem` for file operations (not fs directly)
2. Use `IPathResolver.resolvePath()` for secure path handling
3. Store PR view state in `IStateService` with paths like `pr-view:{worktreeId}:diffs`
4. Emit state changes via `ICentralEventNotifier.emit('file-changes', 'pr-diff-reviewed', { ... })`
5. Use `IGitDiffService.getGitDiff()` for diff fetching
6. Per-worktree data via `domain:worktreeId:property` state paths

### For File Notes:
1. Define note state domain in `IStateService` (singleton or multi-instance)
2. Emit note events via `ICentralEventNotifier` with domain `'file-notes'`
3. Link types: use `data: { fileSlug, workflowSlug, agentId, ... }`
4. Use `IFileSystem` for note file storage (JSON or YAML)
5. Register commands in `IUSDK.commands` for CLI + web
6. Use `ISDKSettings` for note display preferences

