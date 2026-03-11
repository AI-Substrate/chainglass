# Comprehensive Dependency Map: PR View & File Notes Features

## Context
This map captures the architectural dependencies for building two mutually exclusive features:
- **PR View**: GitHub-style diff view overlay (Plan 071)
- **File Notes**: Generic note system with CLI integration (Plan 072)

Both require understanding: overlay mutual exclusion, worktree resolution, event propagation, state management, and per-worktree persistence.

---

# FINDINGS

## DC-01: Overlay Mutual Exclusion via CustomEvent

**Event Mechanism**: Browser CustomEvent (native, not SSE)
- **Event name**: `overlay:close-all` (string constant, no namespace collision risk)
- **Dispatch pattern**: All opening overlays dispatch BEFORE state update
- **Guard pattern**: `isOpeningRef` prevents self-close when dispatching

**Files with implementation**:
1. `/Users/jordanknight/substrate/071-pr-view/apps/web/src/hooks/use-agent-overlay.tsx` (lines 50-89)
   - `openAgent()` dispatches, sets `isOpeningRef = true` during dispatch
   - `useEffect` listener skips close if `isOpeningRef === true`

2. `/Users/jordanknight/substrate/071-pr-view/apps/web/src/features/064-terminal/hooks/use-terminal-overlay.tsx` (lines 37-48, 81-89)
   - Same pattern: `isOpeningRef` guard in `openTerminal()`/`toggleTerminal()`
   - `overlay:close-all` listener closes via `closeTerminal()`

3. `/Users/jordanknight/substrate/071-pr-view/apps/web/src/features/065-activity-log/hooks/use-activity-log-overlay.tsx` (lines 51-88)
   - Identical: `isOpeningRef` in `openActivityLog()`/`toggleActivityLog()`
   - Listener in `useEffect`

**Key Invariants** (from Plan 065 Phase 3):
- CustomEvent dispatch is **synchronous** → `isOpeningRef` race-free
- **DYK-01**: Set ref `true` BEFORE dispatch, reset after
- All three overlays (terminal, activity-log, agent) are mutually exclusive at z-45+
- Dispatch happens BEFORE `setState` call for safety

**For PR View**: 
- Overlay should dispatch `overlay:close-all` in `openPRView()` before opening
- Add listener to close self on event (with `isOpeningRef` guard)

---

## DC-02: Workspace Layout & Overlay Nesting Structure

**File**: `/Users/jordanknight/substrate/071-pr-view/apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx`

**Hierarchy** (top to bottom):
```
WorkspaceLayout (server component, fetches prefs)
  ↓
WorkspaceProvider (context: slug, name, emoji, color, worktreePreferences)
  ↓
SDKWorkspaceConnector (manages SDK workspace state)
  ↓
WorkspaceAttentionWrapper (manages tab title + "attention" system)
  ↓
TerminalOverlayWrapper (provides terminal overlay context + anchor)
  ↓
ActivityLogOverlayWrapper (provides activity-log overlay context + anchor)
  ↓
WorkspaceAgentChrome (agent chat overlay, sidebar buttons)
  ↓
{children} (page content: file browser, etc.)
```

**Key props passed down**:
- `slug`: Workspace slug identifier
- `worktreePreferences`: Per-worktree emoji/color/terminal theme (from server)
- `defaultWorktreePath`: Default worktree root (derived from `ws.path`)
- `defaultBranch`: Branch name (from path tail)

**Overlay anchor point**: `data-terminal-overlay-anchor` (shared by terminal & activity-log)
- Do NOT rename — locked in UI positioning

**For PR View**:
- Mount `PRViewOverlayWrapper` as sibling to TerminalOverlayWrapper/ActivityLogOverlayWrapper
- Pass `defaultWorktreePath` for initial diff context
- Or insert between ActivityLogOverlayWrapper and WorkspaceAgentChrome

---

## DC-03: File Changes Data Pipeline (Git → UI)

**Server-Side Services** (execute git commands):
1. `changed-files.ts`: `getChangedFiles(worktreePath)` 
   - Returns `{ ok: true; files: string[] }` (relative paths from `git diff --name-only`)
   - Error: `{ ok: false; error: 'not-git' }`

2. `working-changes.ts`: `getWorkingChanges(worktreePath)`
   - Parses `git status --porcelain=v1` into `ChangedFile[]`
   - Each file has `.path`, `.status` (modified|added|deleted|untracked|renamed), `.area` (staged|unstaged|untracked)
   - Export: `parsePorcelainOutput(output)` (pure function for testing)

3. `git-diff-action.ts`: `getGitDiff(filePath, cwd?)`
   - Returns `{ diff: string | null; error: null | 'git-not-available' | 'not-git' | 'no-changes' }`
   - Validates path with `PathResolverAdapter` (path traversal prevention)
   - Runs `git diff -- <path>` with 10MB buffer limit

**Server Actions** (Next.js 'use server' boundary):
- `/Users/jordanknight/substrate/071-pr-view/apps/web/app/actions/file-actions.ts`
  - `readFile(slug, worktreePath, filePath)` → `ReadFileResult` (content + syntax highlighting + markdown)
  - `saveFile(slug, worktreePath, filePath, content, expectedMtime?, force?)` → `SaveFileResult`
  - `fetchGitDiff(filePath, cwd?)` (lazy-loads `git-diff-action`)
  - `fetchChangedFiles(worktreePath)` (lazy-loads `changed-files.ts`)
  - All require auth via `requireAuth()`
  - All use DI container: `container.resolve<IFileSystem>()`, `container.resolve<IPathResolver>()`

**Client-Side File Hub** (SSE-based):
- `/Users/jordanknight/substrate/071-pr-view/apps/web/src/features/045-live-file-events/file-change-hub.ts`
  - `FileChangeHub` class: in-memory pub/sub with pattern matching
  - Methods: `subscribe(pattern, callback) → () => void`, `dispatch(changes: FileChange[])`
  - Pattern types: `'src/App.tsx'` (exact), `'src/components/'` (direct), `'src/**'` (recursive), `'*'` (all)
  - No EventEmitter — callback-set pattern (lower overhead)

- `/Users/jordanknight/substrate/071-pr-view/apps/web/src/features/045-live-file-events/file-change-provider.tsx`
  - Mounts per-worktree: creates fresh `FileChangeHub` when `worktreePath` changes
  - Opens SSE to `/api/events/file-changes` (Note: `WorkspaceDomain.FileChanges` = `'file-changes'`)
  - Filters SSE messages by worktreePath before dispatching
  - Provides `FileChangeHubContext` + `SSEConnectionStateContext`
  - Reconnection backoff: 2000–30000ms, max 50 attempts

**Client-Side Hook**:
- `/Users/jordanknight/substrate/071-pr-view/apps/web/src/features/045-live-file-events/use-file-changes.ts`
  - `useFileChanges(pattern, options?)` → `{ changes, hasChanges, clearChanges }`
  - Options: `debounce` (100ms default), `mode` ('replace' | 'accumulate')
  - Debounce resets on rapid changes; buffer prevents lost events
  - Per DYK #5: replace-mode drops intermediate batches; accumulate grows unbounded

**For PR View**:
- **Diff fetching**: Call `fetchGitDiff(filePath, worktreePath)` server action when file selected
- **Changed files list**: Subscribe to `useFileChanges('*')` to show real-time count
- **Per-file changes**: Create PR diff viewer that tracks changes via SSE (FileChangeHub dispatch)

---

## DC-04: Worktree Resolution & Active Worktree Context

**Interface** (abstract contract):
- `IGitWorktreeResolver` in `/Users/jordanknight/substrate/071-pr-view/packages/workflow/src/interfaces/git-worktree-resolver.interface.ts`
  - `getGitVersion(): Promise<string | null>`
  - `isWorktreeSupported(): Promise<boolean>` (git ≥ 2.13)
  - `detectWorktrees(repoPath): Promise<Worktree[]>`
  - `getMainRepoPath(path): Promise<string | null>`
  - `isMainWorktree(path): Promise<boolean>`

**Implementations**:
- `GitWorktreeResolver`: Real, uses `IProcessManager` (calls `git worktree list --porcelain`)
- `FakeGitWorktreeResolver`: Testable, configurable in DI container

**Active Worktree Discovery** (URL-based):
- Terminal overlay (`use-terminal-overlay.tsx` line 62-71):
  ```tsx
  const params = new URLSearchParams(window.location.search);
  const worktree = params.get('worktree');
  // Falls back to prev state (server defaults)
  ```
- Activity Log overlay (`use-activity-log-overlay.tsx` line 75-77):
  ```tsx
  const urlWorktree = params.get('worktree');
  const resolved = worktreePath ?? urlWorktree ?? prev.worktreePath;
  ```

**Workspace Context** (React Context for worktree identity):
- Provider: `/Users/jordanknight/substrate/071-pr-view/apps/web/src/features/041-file-browser/hooks/use-workspace-context.tsx`
  - `WorkspaceContextValue`: `slug`, `name`, `emoji`, `color`, `hasChanges`, `worktreeIdentity`
  - `WorktreeIdentity`: `{ branch, emoji, color, pageTitle, terminalTheme }`
  - Input: `WorktreeIdentityInput` — `{ worktreePath, branch, pageTitle? }`
  - Provider resolves emoji/color from `worktreePreferences[worktreePath]` map (per-worktree overrides)

**For PR View**:
- Use URL param `?worktree=<path>` to identify active worktree
- Call `IGitWorktreeResolver` to detect all worktrees if showing multi-worktree view
- Store per-worktree PR view state in `GlobalStateSystem` under `pr-view:<slug>:*` paths

---

## DC-05: GlobalStateSystem — Runtime State Persistence

**File**: `/Users/jordanknight/substrate/071-pr-view/apps/web/src/lib/state/global-state-system.ts`

**Class**: `GlobalStateSystem implements IStateService`

**Key Methods**:
- `publish<T>(path: string, value: T, source?: StateEntrySource): void`
  - **PL-01**: Store updated BEFORE subscribers notified (consistency)
  - Invalidates list-cache for affected patterns
  - Emits `StateChange` to all matching subscriptions

- `get(path: string): T | undefined`
  - Stable reference (no defensive copies per AC-03)

- `list(pattern: string): StateEntry[]`
  - Version-counter caching per AC-26

- `subscribe(pattern: string, callback: StateChangeCallback): () => void`
  - Pattern matching: `worktree:slug:*` matches all worktree state for that slug
  - Callback: `(change: StateChange) => void`
  - **PL-07**: Error isolation — try/catch per callback

**State Path Naming** (colon-delimited):
- Domain: `worktree`, `file-browser`, `pr-view`, etc.
- Instance: `<slug>` (workspace slug)
- Property: `branch`, `changed-file-count`, `pr-diff-open`, etc.
- Example: `worktree:my-workspace:branch` = `'main'`
- Multi-instance: `worktree:my-workspace:*` matches all properties for that worktree

**Usage Example** (from WorktreeStatePublisher):
```tsx
const state = useStateSystem();
state.publish(`worktree:${slug}:branch`, worktreeBranch);
state.publish(`worktree:${slug}:changed-file-count`, changes.length);
```

**Hooks for consumers**:
- `useGlobalState(path)` → `{ value: T | undefined, isLoading, error }`
- `useGlobalStateList(pattern)` → `{ entries: StateEntry[], isLoading, error }`

**For PR View**:
- Publish: `pr-view:<slug>:is-open` (boolean)
- Publish: `pr-view:<slug>:selected-file` (string path)
- Publish: `pr-view:<slug>:diff-stats` (object with +/- line counts)
- Subscribe: Listen for file changes to update diff view

---

## DC-06: Shared Package Structure & DI Tokens

**Directory**: `/Users/jordanknight/substrate/071-pr-view/packages/shared/src/`

**Layout**:
```
interfaces/
  ├── filesystem.interface.ts         (IFileSystem)
  ├── path-resolver.interface.ts     (IPathResolver)
  ├── diff.interface.ts              (DiffResult)
  ├── state.interface.ts             (IStateService)
  ├── copilot-sdk.interface.ts       (USDK types)
  ├── process-manager.interface.ts   (IProcessManager)
  └── ... (20+ total)

services/
  ├── agent.service.ts               (Agent domain logic)
  ├── session-metadata.service.ts    (Session tracking)
  └── index.ts

adapters/
  ├── NodeFileSystemAdapter          (node:fs bindings)
  ├── PathResolverAdapter            (path validation + traversal prevention)
  ├── ProcessManagerAdapter          (node:child_process wrapper)
  └── ... (HashGeneratorAdapter, etc.)

state/
  ├── types.ts                       (StateChange, StateEntry, etc.)
  ├── path-parser.ts                 (Colon-delimited path parsing)
  ├── path-matcher.ts                (Pattern matching: `worktree:slug:*`)
  └── index.ts                       (IStateService barrel)

di-tokens.ts                         (DI token definitions)
├── SHARED_DI_TOKENS
├── WORKSPACE_DI_TOKENS
├── WORKFLOW_DI_TOKENS
└── WORKFLOW_COMMANDS_DI_TOKENS
```

**DI Token Examples** (to resolve services):
```ts
SHARED_DI_TOKENS.FILESYSTEM         // IFileSystem
SHARED_DI_TOKENS.PATH_RESOLVER      // IPathResolver
WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE // IWorkspaceService
WORKFLOW_DI_TOKENS.GIT_WORKTREE_RESOLVER // IGitWorktreeResolver
```

**For File Notes**:
- Define `INoteService` interface in `packages/shared/src/interfaces/note-service.interface.ts`
- Implement `NoteServiceAdapter` in `packages/shared/src/adapters/`
- Register in DI containers (both CLI and web)
- Export from `packages/shared/src/index.ts`

---

## DC-07: CLI Package Structure & Command Registration

**Directory**: `/Users/jordanknight/substrate/071-pr-view/apps/cli/src/`

**Layout**:
```
commands/
  ├── workspace.command.ts           (cg workspace add/list/info/remove)
  ├── workflow.command.ts            (cg workflow <subcommands>)
  ├── phase.command.ts               (cg phase <subcommands>)
  ├── agent.command.ts               (cg agent <subcommands>)
  ├── init.command.ts                (cg init)
  └── index.ts                       (Barrel: export registerXxxCommand)

lib/
  ├── container.ts                   (createCliProductionContainer)
  └── ... (CLI-specific utilities)

features/
  └── ... (CLI feature implementations)
```

**Command Registration Pattern** (e.g., `workspace.command.ts` lines 1–30):
```ts
export async function registerWorkspaceCommands(program: Command): Promise<void> {
  program
    .command('add <name> <path>')
    .option('--json', 'Output as JSON')
    .option('--allow-worktree', 'Allow adding worktree')
    .action(async (name, path, options) => {
      const service = container.resolve<IWorkspaceService>(
        WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
      );
      // ... handle command
    });
  // ... more subcommands
}
```

**Service Resolution** (DI):
- `createCliProductionContainer()` returns a DependencyContainer
- Services resolved from container (not instantiated directly per ADR-0004)
- Output adapters: `ConsoleOutputAdapter` (human) or `JsonOutputAdapter` (machine)

**For File Notes CLI**:
- Create `notes.command.ts`:
  - `cg notes add <file> <line?> <message>`
  - `cg notes list <file>`
  - `cg notes delete <file> <id>`
  - `cg notes export <file>` (JSON)
- Call `INoteService` from DI container
- Register in `apps/cli/src/commands/index.ts` export

---

## DC-08: SSE Event Infrastructure & WorkspaceDomain

**SSE Endpoint Pattern**:
- Base: `/api/events/<domain>`
- Example: `/api/events/file-changes`
- Uses `WorkspaceDomain` enum from `@chainglass/shared/features/027-central-notify-events/workspace-domain`
  - `WorkspaceDomain.FileChanges = 'file-changes'`

**SSE Message Structure** (per FileChangeProvider line 85-88):
```ts
interface FileChangeSSEMessage {
  type: 'file-changed';
  changes: Array<{
    path: string;
    eventType: 'added' | 'modified' | 'deleted';
    timestamp: number;
    worktreePath: string;  // CRITICAL: Filter by this
  }>;
}
```

**Filter by Worktree** (DYK #1, line 91-92):
```ts
const relevantChanges = data.changes
  .filter((c) => c.worktreePath === worktreePath)
  .map((c) => ({ path: c.path, eventType: c.eventType, timestamp: c.timestamp }));
```

**Connection Lifecycle** (FileChangeProvider):
1. `onopen`: Reset reconnect counter, set `connected`
2. `onmessage`: Parse JSON, filter by worktree, dispatch to hub
3. `onerror`: Set `reconnecting`, attempt backoff retry (capped at 30s)
4. Browser auto-reconnects per SSE spec

**Note**: SSE connection is raw `EventSource` with manual reconnection logic (not Socket.io, not WebSocket)

**For PR View**:
- Create new SSE domain: `WorkspaceDomain.PRDiffs = 'pr-diffs'`
- Message: `{ type: 'pr-diff-updated', diff: DiffResult, filePath, worktreePath }`
- Or reuse `file-changes` and compute diffs on client (simpler)

---

## DC-09: Worktree-Scoped Data Persistence Pattern

**Pattern** (from WorktreeStatePublisher):
1. **Mount inside FileChangeProvider**: Access `useFileChanges()` → worktree context
2. **Publish to state paths**: `worktree:${slug}:<property>`
3. **Subscribe from other components**: `useGlobalState('worktree:slug:branch')`

**Example Flow**:
```tsx
// BrowserClient mounts per-worktree:
<FileChangeProvider worktreePath={worktreePath}>
  <WorktreeStatePublisher slug={slug} worktreeBranch={branch} />
  <FileTreeView />  // subscribes via useGlobalState
</FileChangeProvider>

// FileTreeView:
const { value: branch } = useGlobalState(`worktree:${slug}:branch`);
```

**For File Notes**:
- Create `NoteStatePublisher` (invisible, mounts in FileChangeProvider scope)
- Publish: `file-notes:${slug}:<filePath>:<action>` with note data
- Consumers subscribe: `useGlobalState('file-notes:slug:src/App.tsx:list')` → `Note[]`
- Or publish aggregated: `file-notes:${slug}:count` = total notes

**Per-Worktree Persistence**:
- Backend: Store notes in workspace metadata (like worktreePreferences)
- Frontend: State system as cache; persist on unmount via server action
- CLI: Read notes from metadata, display with `cg notes list <file>`

---

## DC-10: Integration Checklist: PR View & File Notes

### PR View (Plan 071)
**Dependencies**:
1. ✓ Overlay mutual exclusion (`overlay:close-all` CustomEvent, `isOpeningRef` guard)
2. ✓ Workspace layout nesting (mount in layout.tsx between overlays)
3. ✓ Worktree resolution (URL param `?worktree=<path>`)
4. ✓ Diff fetching (`fetchGitDiff` server action)
5. ✓ File change tracking (`useFileChanges('*')` for real-time updates)
6. ✓ State persistence (`GlobalStateSystem` for UI state)
7. ✓ WorkspaceContext (for branch/emoji in PR header)

**Files to create**:
- `apps/web/src/features/071-pr-view/hooks/use-pr-view-overlay.tsx` (context + hook)
- `apps/web/src/features/071-pr-view/components/pr-view-panel.tsx` (overlay UI)
- `apps/web/app/(dashboard)/workspaces/[slug]/pr-view-overlay-wrapper.tsx` (layout wrapper)
- `apps/web/src/features/071-pr-view/services/pr-diff.service.ts` (diff parsing)

**Key imports**:
```ts
import { useFileChanges } from '@/features/045-live-file-events';
import { useGlobalState, useStateSystem } from '@/lib/state';
import { useWorkspaceContext } from '@/features/041-file-browser/hooks/use-workspace-context';
import { fetchGitDiff } from '@/app/actions/file-actions';
```

### File Notes (Plan 072)
**Dependencies**:
1. ✓ WorktreeContext (per-worktree notes)
2. ✓ State persistence (`GlobalStateSystem` for note cache)
3. ✓ Server actions (read/save notes from backend)
4. ✓ Worktree resolution (fetch notes for active worktree)
5. ✓ CLI integration (commands via DI container)

**Files to create** (web):
- `packages/shared/src/interfaces/note-service.interface.ts` (INoteService)
- `packages/shared/src/adapters/note.adapter.ts` (NoteServiceAdapter)
- `apps/web/src/features/072-file-notes/services/note-actions.ts` (server actions)
- `apps/web/src/features/072-file-notes/hooks/use-file-notes.ts` (hook)
- `apps/web/src/features/072-file-notes/components/note-gutter.tsx` (sidebar UI)

**Files to create** (CLI):
- `apps/cli/src/commands/notes.command.ts` (note management commands)
- Register in `apps/cli/src/commands/index.ts`

**Key imports**:
```ts
import { INoteService } from '@chainglass/shared/interfaces';
import { SHARED_DI_TOKENS } from '@chainglass/shared';
import { useGlobalState } from '@/lib/state';
import { useWorkspaceContext } from '@/features/041-file-browser/hooks/use-workspace-context';
```

---

## Summary Table

| Finding | Component | Key File | Pattern |
|---------|-----------|----------|---------|
| DC-01 | Overlay Mutual Exclusion | `use-agent-overlay.tsx`, `use-terminal-overlay.tsx`, `use-activity-log-overlay.tsx` | CustomEvent `overlay:close-all` + `isOpeningRef` guard |
| DC-02 | Workspace Layout | `app/(dashboard)/workspaces/[slug]/layout.tsx` | Provider nesting: Workspace → Attention → Terminal → ActivityLog → Agent → children |
| DC-03 | File Changes | `changed-files.ts`, `git-diff-action.ts`, `use-file-changes.ts`, `FileChangeHub` | Server services + SSE → client hub → React hook |
| DC-04 | Worktree Resolution | `IGitWorktreeResolver`, `use-workspace-context.tsx`, URL param `?worktree` | Interface-driven DI, URL-based discovery, context fallback |
| DC-05 | State Persistence | `GlobalStateSystem`, `use-global-state.ts` | Colon-delimited paths, pattern-matching subscriptions |
| DC-06 | Shared Package | `packages/shared/src/` | Interfaces, adapters, DI tokens, no implementation details |
| DC-07 | CLI Commands | `apps/cli/src/commands/` | Commander.js + DI container, output adapters |
| DC-08 | SSE Events | `FileChangeProvider`, `/api/events/<domain>` | Per-worktree filtering, raw EventSource, reconnection backoff |
| DC-09 | Worktree Data Persistence | `WorktreeStatePublisher` | Mount in FileChangeProvider, publish to state, subscribe globally |
| DC-10 | Integration Checklist | PR View & File Notes | Dependencies documented, file templates provided |

