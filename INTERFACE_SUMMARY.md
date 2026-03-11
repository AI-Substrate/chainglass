# Interface & Contract Summary — Quick Reference

## 11 Key Interface Findings (IC-01 through IC-11)

### IC-01: **IFileSystem** — File operations abstraction
- 13 async methods: `read`, `write`, `mkdir`, `glob`, `stat`, `copy`, `delete`, `rename`, `realpath`
- Error: `FileSystemError(code, path)`
- Contract: Always use absolute paths, no direct `fs` usage

### IC-02: **IPathResolver** — Secure path operations
- 7 methods: `resolvePath`, `join`, `dirname`, `basename`, `normalize`, `isAbsolute`, `relative`
- Error: `PathSecurityError(base, requested)`
- Contract: Prevents directory traversal (`../../../etc/passwd`)

### IC-03: **IStateService** — Centralized runtime state system (Plan 053)
- Path format: `domain:property` or `domain:instanceId:property`
- 10 methods: `registerDomain`, `publish`, `remove`, `get`, `list`, `listInstances`, `subscribe`
- Contract: Store-first, unidirectional dispatch, isolated subscriber errors

### IC-04: **IUSDK** — SDK facade (4 sub-interfaces)
- **ICommandRegistry**: `register`, `execute`, `list`, `isAvailable`
- **ISDKSettings**: `hydrate`, `contribute`, `get`, `set`, `reset`, `onChange`, `toPersistedRecord`
- **IContextKeyService**: `set`, `get`, `evaluate` (when-clauses), `onChange`
- **IKeybindingService**: `register`, `getBindings`, `buildTinykeysMap`
- Contract: Global singleton, settings persistence lazy via callback

### IC-05: **IGitDiffService** — Git diff provider
- 1 method: `getGitDiff(filePath): Promise<DiffResult>`
- Error types: `'not-git'`, `'no-changes'`, `'git-not-available'`

### IC-06: **ViewerFile** — File display interface
- 3 properties: `path`, `filename`, `content`
- Used by: FileViewer, MarkdownViewer, DiffViewer

### IC-07: **IWorkUnitStateService** — Work unit status registry (Plan 059)
- 7 methods: `register`, `unregister`, `updateStatus`, `getUnit`, `getUnits`, `getUnitBySourceRef`, `tidyUp`
- State paths: `work-unit-state:{id}:status`, `:intent`, `:name`
- Contract: Observes status, persists to JSON, 24h cleanup

### IC-08: **IWorkflowEvents** — Intent-based workflow API (Plan 061)
- 9 methods (5 actions + 4 observers)
- Actions: `askQuestion`, `answerQuestion`, `getAnswer`, `reportProgress`, `reportError`
- Observers: `onQuestionAsked`, `onQuestionAnswered`, `onProgress`, `onEvent`
- Contract: Hides 3-event handshake, intent-based API

### IC-09: **ICentralEventNotifier** & **ISSEBroadcaster** — Event system (Plan 027)
- **ICentralEventNotifier**: `emit(domain, eventType, data)`
  - Domains: `Agents`, `FileChanges`, `Workflows`, `WorkUnitState`, `UnitCatalog`
- **ISSEBroadcaster**: `broadcast(channel, eventType, data)`
- Contract: Minimal payload (ADR-0007), full state via REST, SSE transport

### IC-10: **IAgentManagerService** — Central agent registry
- 5-6 methods: `getNew`, `getWithSessionId`, `getAgent`, `getAgents`, `terminateAgent`, `initialize`
- Contract: Same-instance guarantee (same `sessionId` → same object reference)
- Implementations: Real (registry) + Fake (test helpers)

### IC-11: **IAgentInstance** — Agent session wrapper
- Identity: `id`, `name`, `type`, `workspace` (immutable)
- State: `status`, `isRunning`, `sessionId`, `createdAt`, `updatedAt`
- Metadata: Property bag, `setMetadata(key, value)`
- Actions: `run()`, `compact()`, `terminate()`, event handlers
- Contract: No storage/SSE/notifier dependency, transitions `stopped → working → stopped|error`

---

## Design Pattern Summary

| Pattern | Examples | Key Contract |
|---------|----------|--------------|
| **Adapter** | `IFileSystem`, `IAgentAdapter`, `IOutputAdapter` | Interface in shared/, impl context-specific |
| **Service Registry** | `IAgentManagerService`, `IWorkUnitStateService` | Single source of truth, optional persistence |
| **Domain Events** | `ICentralEventNotifier`, `IWorkflowEvents` | Minimal payload, SSE transport, REST fetch |
| **State Hierarchy** | `IStateService` | `domain:instanceId:property` paths, pub/sub |
| **Error Handling** | Filesystem, Path, Command | Custom error types with context, graceful |
| **Subscription** | All event APIs | Pattern matching, unsubscribe function, isolated errors |

---

## State Path Examples

```
work-unit-state:agent-abc:status        // Multi-instance: domain:id:property
work-unit-state:agent-abc:intent        // Agent status
work-unit-state:agent-abc:name          // Agent name
workflow:wf-1:status                    // Workflow status
worktree:main:branch                    // Worktree branch
pr-view:worktree-main:reviewed-files    // PR view (proposed)
file-notes:file-123:notes               // File notes (proposed)
```

---

## For PR View Feature

**State Domain:** Register `pr-view` with multi-instance paths:
- `pr-view:{worktreeId}:diffs` — Active diffs
- `pr-view:{worktreeId}:reviewed` — Mark-as-reviewed tracking
- `pr-view:{worktreeId}:comments` — Inline comments

**Events:** Emit via `ICentralEventNotifier`:
- `emit('file-changes', 'pr-diff-reviewed', { worktreeId, filePath, reviewed })`

**File Operations:** Use `IFileSystem` + `IPathResolver`

**Diff Fetching:** Use `IGitDiffService.getGitDiff()`

---

## For File Notes Feature

**State Domain:** Register `file-notes` with multi-instance paths:
- `file-notes:{noteId}:content` — Note body
- `file-notes:{noteId}:links` — Link targets (file, workflow, agent)
- `file-notes:{noteId}:metadata` — Created/updated timestamps, author

**Events:** Emit via `ICentralEventNotifier`:
- `emit('file-notes', 'note-created', { noteId, linked })`
- `emit('file-notes', 'note-updated', { noteId })`
- `emit('file-notes', 'note-deleted', { noteId })`

**CLI/SDK:** Register commands in `IUSDK.commands`:
- `note.create`, `note.list`, `note.read`, `note.update`, `note.delete`

**Settings:** Use `IUSDK.settings` for display preferences (sort, filter, etc.)

**Storage:** Use `IFileSystem` for note files (JSON/YAML in workspace)

---

## Critical Contracts Summary

1. **Filesystem**: Always absolute paths, never `fs` direct, use `IFileSystem`
2. **Paths**: Use `resolvePath()` to prevent traversal attacks
3. **State**: Register domains at bootstrap, store-first updates, unidirectional dispatch
4. **Events**: Minimal payload (IDs only), clients fetch full state
5. **Agents**: Same-instance guarantee for session continuity
6. **Services**: Graceful error handling, never crash consumer
7. **Subscriptions**: Pattern matching, isolated errors, unsubscribe functions
8. **SDK**: Global singleton, settings lazy-persisted

---

## Files to Review

- `/packages/shared/src/interfaces/` — Core interfaces
- `/packages/shared/src/state/` — State system types
- `/packages/shared/src/features/027-central-notify-events/` — Event domain
- `/packages/shared/src/features/034-agentic-cli/` — Agent manager/instance
- `/packages/shared/src/features/019-agent-manager-refactor/` — Alternative agent patterns

---

**Total Coverage:** 11 interfaces + 4 sub-interfaces (IUSDK) = 15 total contracts documented
