# Research Report: Central Watcher & Notification System Re-think

**Generated**: 2026-01-31T03:55:00Z
**Research Query**: "Watching system re-think -- simple watcher for all workspace data paths with adapter pattern for domain-specific events"
**Mode**: Plan-Associated (023-central-watcher-notifications)
**Location**: `docs/plans/023-central-watcher-notifications/research-dossier.md`
**FlowSpace**: Available
**Findings**: 68 across 7 subagents

---

## Executive Summary

### What It Does
The existing codebase has a nearly-complete file watching and notification system built during Plan 022 Phase 4. A `WorkspaceChangeNotifierService` watches all registered workspace worktrees for workgraph `state.json` changes and emits `GraphChangedEvent` via a callback-based pub/sub pattern. An SSE infrastructure (`SSEManager`, route handlers, client hooks) exists but is NOT yet wired to the file watcher.

### Business Purpose
Enable real-time UI updates when CLI commands modify workspace data (workgraphs, agents, samples). Without this, users must manually refresh the browser to see changes made via CLI.

### Key Insights
1. **The existing `WorkspaceChangeNotifierService` is workgraph-specific** -- it only watches `work-graphs/*/state.json`. The user's vision is a **generic watcher** that watches ALL data paths (`<worktree>/.chainglass/data/`) with domain-agnostic adapters that filter and transform events.
2. **The existing code is well-structured but too narrow** -- it has clean interfaces (`IFileWatcher`, `IFileWatcherFactory`), proven chokidar config, and comprehensive fakes/tests (32 unit + 4 integration). But the architecture hardcodes workgraph knowledge into the watcher service itself.
3. **The adapter pattern already exists for data storage** (`WorkspaceDataAdapterBase` with domain subclasses). Extending this pattern to watching is natural -- each domain adapter would also define what it wants to watch and how to interpret file events.

### Quick Stats
- **Existing Components**: 15+ files across packages/workflow, apps/web
- **Existing Tests**: 36 tests (32 unit + 4 integration) for WorkspaceChangeNotifierService
- **Dependencies**: chokidar v5.0 (in packages/workflow), no EventEmitter
- **Fakes**: FakeFileWatcher (270 lines), FakeWorkspaceChangeNotifierService (233 lines)
- **Prior Learnings**: 14 relevant discoveries from previous implementations
- **DI Gap**: Neither `WorkspaceChangeNotifierService` nor `IFileWatcherFactory` is registered in the web DI container

---

## How It Currently Works

### Entry Points

| Entry Point | Type | Location | Purpose |
|------------|------|----------|---------|
| `WorkspaceChangeNotifierService.start()` | Service | `packages/workflow/src/services/workspace-change-notifier.service.ts:1` | Starts watching all worktree workgraph dirs |
| `/api/events/[channel]/route.ts` | API Route | `apps/web/app/api/events/[channel]/route.ts` | SSE endpoint for browser connections |
| `useWorkGraphSSE()` | React Hook | `apps/web/src/features/022-workgraph-ui/use-workgraph-sse.ts` | Client subscribes to workgraph SSE events |
| `broadcastGraphUpdated()` | Broadcast | `apps/web/src/features/022-workgraph-ui/sse-broadcast.ts` | Pushes events to SSE clients |

### Core Execution Flow (Current -- Incomplete)

1. **Workspace Discovery**: `WorkspaceRegistryAdapter.list()` reads `~/.config/chainglass/workspaces.json` → returns `Workspace[]`
2. **Worktree Resolution**: `GitWorktreeResolver.detectWorktrees(workspace.path)` → returns `Worktree[]` per workspace
3. **Watch Path Collection**: For each worktree, watches `<worktreePath>/.chainglass/data/work-graphs/` (hardcoded to workgraph domain)
4. **File Change Detection**: Chokidar detects `state.json` changes → filters for `state.json` only → extracts `graphSlug` from path
5. **Event Emission**: Calls all registered `GraphChangedCallback` with `{ graphSlug, workspaceSlug, worktreePath, filePath, timestamp }`
6. **[MISSING BRIDGE]**: No wiring exists from `onGraphChanged()` → `sseManager.broadcast()`
7. **[MISSING REGISTRATION]**: `WorkspaceChangeNotifierService` and `IFileWatcherFactory` not in DI container
8. **[MISSING INITIALIZATION]**: No `instrumentation.ts` to start the service on app boot

### Data Storage Layout

```
~/.config/chainglass/workspaces.json              # Global registry
<worktree>/.chainglass/data/
  ├── samples/<slug>.json                          # Sample domain
  ├── agents/<sessionId>/session.json              # Agent sessions
  ├── agents/<sessionId>/events.ndjson             # Agent events
  └── work-graphs/<graphSlug>/
      ├── graph.yaml                               # Graph definition
      ├── state.json                               # Runtime state (CURRENTLY WATCHED)
      ├── layout.json                              # UI layout positions
      └── <nodeId>/
          ├── node.yaml                            # Node definition
          └── data/                                # Node data files
```

### Current Watcher Service Architecture

```
WorkspaceChangeNotifierService
  ├── registryWatcher: IFileWatcher    (watches workspaces.json for add/remove)
  ├── workgraphWatcher: IFileWatcher   (watches ALL worktree work-graph dirs)
  └── callbacks: Set<GraphChangedCallback>
      └── onGraphChanged(callback) → () => void (unsubscribe)
```

**Problem with current design**: The service has domain knowledge baked in:
- Hardcoded to watch `work-graphs/` subdirectory only
- Hardcoded to filter for `state.json` only
- Hardcoded to extract `graphSlug` from path pattern
- Cannot be extended to watch samples, agents, or future domains without modifying the service

---

## Architecture & Design

### Component Map

#### Core Components (Existing)

| Component | Location | Status |
|-----------|----------|--------|
| `IFileWatcher` / `IFileWatcherFactory` | `packages/workflow/src/interfaces/file-watcher.interface.ts` | COMPLETE, reusable |
| `ChokidarFileWatcherAdapter` | `packages/workflow/src/adapters/chokidar-file-watcher.adapter.ts` | COMPLETE, reusable |
| `FakeFileWatcher` / `FakeFileWatcherFactory` | `packages/workflow/src/fakes/fake-file-watcher.ts` | COMPLETE, reusable |
| `WorkspaceChangeNotifierService` | `packages/workflow/src/services/workspace-change-notifier.service.ts` | COMPLETE but **too narrow** |
| `FakeWorkspaceChangeNotifierService` | `packages/workflow/src/fakes/fake-workspace-change-notifier.service.ts` | COMPLETE but **workgraph-specific** |
| `WorkspaceRegistryAdapter` | `packages/workflow/src/adapters/workspace-registry.adapter.ts` | COMPLETE, reusable |
| `GitWorktreeResolver` | `packages/workflow/src/resolvers/git-worktree.resolver.ts` | COMPLETE, reusable |
| `WorkspaceDataAdapterBase` | `packages/workflow/src/adapters/workspace-data-adapter-base.ts` | COMPLETE, reusable |
| `SSEManager` | `apps/web/src/lib/sse-manager.ts` | COMPLETE (OOS for this plan) |
| `useSSE` / `useWorkGraphSSE` | `apps/web/src/hooks/useSSE.ts` | COMPLETE (OOS for this plan) |

### Design Patterns Identified

1. **Adapter Pattern**: Every external dependency wrapped behind `I`-prefixed interface → concrete adapter → fake for testing
2. **Factory Pattern**: `IFileWatcherFactory.create(options)` enables DI-based injection
3. **Callback Set Pattern**: `Set<Callback>` with `onX(callback) → () => void` (returns unsubscribe). NOT EventEmitter
4. **Result Types**: `{ ok: boolean, data?, errorMessage? }` for I/O; `BaseResult` with `errors[]` for business operations
5. **globalThis Singleton**: Server-side singletons use `globalThis` for HMR survival
6. **Fakes over Mocks**: Every interface has a `Fake{Name}` with call tracking, error injection, and programmatic event emission. No `vi.fn()` allowed
7. **WorkspaceDataAdapterBase**: Abstract base class with `domain` property defining storage subdirectory

---

## Dependencies & Integration

### Package Dependency Graph

```
@chainglass/shared (IFileSystem, IPathResolver)
    ↑
@chainglass/workflow (IFileWatcher, WorkspaceChangeNotifier, adapters, fakes)
    ↑
@chainglass/workgraph (WorkGraphService, atomicWriteFile, state.json)
    ↑
@chainglass/web (DI container, SSEManager, routes, hooks)
```

**Key**: `chokidar` v5.0 is a dependency of `@chainglass/workflow` only.

### What Writes to Workspace Data (Event Sources)

| Writer | Domain | Path Pattern | Write Method |
|--------|--------|--------------|-------------|
| `WorkGraphService` | work-graphs | `state.json`, `graph.yaml` | `atomicWriteJson()` (temp→rename) |
| `WorkNodeService` | work-graphs | `state.json`, `<nodeId>/node.yaml` | `atomicWriteJson()` |
| `SampleAdapter` | samples | `<slug>.json` | `writeJson()` |
| `AgentSessionAdapter` | agents | `<id>/session.json` | `writeJson()` |
| `AgentEventAdapter` | agents | `<id>/events.ndjson` | append |
| CLI commands | all | varies | via service layer |

### What Reads Workspace Data (Event Consumers)

| Consumer | Domain | Pattern |
|----------|--------|---------|
| Web API routes | work-graphs, agents | REST endpoints |
| Server Components | work-graphs | Direct service calls |
| `useWorkGraphSSE` hook | work-graphs | SSE-triggered REST refresh |
| CLI commands | all | Direct service calls |

---

## Quality & Testing

### Current Test Coverage

| Area | Tests | Type | Quality |
|------|-------|------|---------|
| WorkspaceChangeNotifierService | 32 unit + 4 integration | Fakes + Real FS | Excellent |
| File Watcher Adapter | 0 contract tests | N/A | Gap |
| Workspace Registry Adapter | Contract tests (both impls) | Contract | Excellent |
| Notifier Service Fake | 0 contract tests | N/A | Gap |

### Testing Approach
- **Vitest** with `fileParallelism: false`
- **Fakes only** (17 fake classes in `packages/workflow/src/fakes/`)
- **Contract tests** for adapter parity (real vs fake)
- **Integration tests** use real chokidar + temp directories with `sleep()` for timing
- **Coverage threshold**: 50% (V8 provider)

### Testing Infrastructure Available

| Fake | Location | Features |
|------|----------|----------|
| `FakeFileWatcher` | `packages/workflow/src/fakes/fake-file-watcher.ts` | `simulateChange/Add/Unlink()`, path tracking, close tracking |
| `FakeFileWatcherFactory` | same file | `getWatcher(index)`, `getLastWatcher()`, `getWatcherCount()` |
| `FakeWorkspaceRegistryAdapter` | `packages/workflow/src/fakes/` | Full CRUD tracking |
| `FakeGitWorktreeResolver` | `packages/workflow/src/fakes/` | `setWorktrees()`, call tracking |
| `FakeWorkspaceChangeNotifierService` | `packages/workflow/src/fakes/` | `emitGraphChanged()`, call tracking, error injection |

---

## Prior Learnings (From Previous Implementations)

### Must Apply

| ID | Type | Source | Key Insight | Action |
|----|------|--------|-------------|--------|
| PL-01 | decision | P022 ST001 | chokidar `atomic: true` + `awaitWriteFinish: { stabilityThreshold: 200 }` handles CLI atomic writes | Reuse proven config |
| PL-03 | gotcha | P022 ST002 | Double-broadcast race: API route AND file watcher both broadcast for same change | Dedup at adapter level |
| PL-04 | decision | P015, P022 | SSE = cache invalidation signal, NOT data delivery. Client fetches via REST | Lightweight event payloads |
| PL-05 | workaround | P011, P012 | `globalThis` pattern for singletons to survive HMR | Apply to watcher service (OOS - SSE plan) |
| PL-06 | decision | P022 ST002 | `instrumentation.ts` for service init (runs at server boot) | Apply when wiring SSE (OOS) |
| PL-14 | constraint | P022 ST001 | No mocks allowed; adapter pattern with fakes for all external deps | Continue existing pattern |

### Should Apply

| ID | Type | Source | Key Insight | Action |
|----|------|--------|-------------|--------|
| PL-08 | gotcha | P006, P019 | "Subscribe before send" -- register event listeners BEFORE triggering actions | Register adapters before `start()` |
| PL-12 | gotcha | P022 ST002 | DI registration missing for watcher services | Register new services in DI |
| PL-13 | decision | P018, P021 | All data at `<worktree>/.chainglass/data/<domain>/` via WorkspaceContext | Watch at `.chainglass/data/` level |

### Be Aware Of

| ID | Type | Source | Key Insight |
|----|------|--------|-------------|
| PL-02 | gotcha | P022 ST001 | chokidar needs ~200ms init; integration tests need `sleep(200)` |
| PL-07 | insight | P022 ST001 | chokidar handles missing paths gracefully; skip defensive checks |
| PL-09 | gotcha | P022 ST001 | `Workspace.create()` factory required (private constructor) |
| PL-10 | decision | P022 ST002 | SSE-activity-gated polling fallback for silent watcher failure (OOS) |

---

## Modification Considerations

### What to Reuse (Keep As-Is)

1. **`IFileWatcher` / `IFileWatcherFactory`** -- clean abstraction, proven
2. **`ChokidarFileWatcherAdapter`** -- production adapter, handles atomic writes
3. **`FakeFileWatcher` / `FakeFileWatcherFactory`** -- comprehensive test fakes
4. **`WorkspaceRegistryAdapter`** -- workspace discovery
5. **`GitWorktreeResolver`** -- worktree enumeration
6. **`WorkspaceDataAdapterBase`** -- storage path conventions
7. **`atomicWriteFile()` / `atomicWriteJson()`** -- safe write utilities
8. **chokidar config** (`atomic: true`, `awaitWriteFinish`, `ignoreInitial: true`)

### What to Replace

1. **`WorkspaceChangeNotifierService`** -- too narrow, hardcoded to workgraph `state.json`. Replace with generic `CentralWatcherService` that watches all `.chainglass/data/` directories and delegates to registered watcher adapters.
2. **`FakeWorkspaceChangeNotifierService`** -- replace with fake for new generic service
3. **`IWorkspaceChangeNotifierService`** interface -- replace with generic `ICentralWatcherService`
4. **`GraphChangedEvent`** -- generalize to per-adapter event types

### What to Remove (Old Tests to Clean Up)

| File | Reason |
|------|--------|
| `test/unit/workflow/workspace-change-notifier.service.test.ts` (32 tests) | Tests for replaced service |
| `test/integration/workflow/workspace-change-notifier.integration.test.ts` (4 tests) | Tests for replaced service |
| `packages/workflow/src/services/workspace-change-notifier.service.ts` | Replaced by generic service |
| `packages/workflow/src/fakes/fake-workspace-change-notifier.service.ts` | Replaced by generic fake |
| `packages/workflow/src/interfaces/workspace-change-notifier.interface.ts` | Replaced by generic interface |

### What is Out of Scope (OOS)

Per the user's requirements, the following are explicitly **out of scope** for this plan:

1. **SSE integration** -- no `instrumentation.ts`, no `broadcastGraphUpdated()` wiring, no SSE deduplication
2. **Web layer wiring** -- no DI container registration for web, no `workspace-change-notifier-web.ts`
3. **Client-side hooks** -- no `useWorkGraphSSE` changes, no polling fallback
4. **Any browser/client code** -- this is wholly server-side

---

## Proposed Architecture (For Specification Phase)

Based on research, the envisioned architecture:

```
CentralWatcherService
  ├── watches: Map<worktreePath, IFileWatcher>        # One watcher per worktree
  │   └── watches <worktree>/.chainglass/data/        # ALL data, not just work-graphs
  ├── registryWatcher: IFileWatcher                    # Watches workspaces.json
  ├── adapters: Set<IWatcherAdapter>                   # Registered domain adapters
  │   ├── WorkGraphWatcherAdapter                      # Knows about work-graphs domain
  │   ├── (future) AgentWatcherAdapter                 # Knows about agents domain
  │   └── (future) SampleWatcherAdapter                # Knows about samples domain
  └── lifecycle: start() / stop()

IWatcherAdapter (new interface)
  ├── name: string                                     # e.g., 'workgraph'
  ├── getFilter(): WatcherFilter                       # What events/paths to match
  │   └── { patterns: string[], events: FileWatcherEvent[] }
  ├── parseEvent(rawEvent): DomainEvent | null         # Transform raw FS event → domain event
  └── onEvent: Set<DomainEventCallback>                # Per-adapter subscribers

Flow:
  1. CentralWatcherService.start() → reads registry → discovers worktrees → watches .chainglass/data/
  2. Raw file event fires (e.g., state.json changed)
  3. CentralWatcherService iterates registered adapters
  4. Each adapter's getFilter() checked against event path/type
  5. Matching adapter's parseEvent() transforms raw → domain event
  6. Adapter emits domain event to its subscribers
```

**Key principle**: CentralWatcherService knows NOTHING about workgraphs, agents, or samples. It just watches directories and delegates to adapters. Adapters own all domain knowledge including debouncing.

---

## Critical Discoveries

### Discovery 01: Existing Service is Too Narrow but Has Proven Infrastructure
**Impact**: Critical
**Sources**: IA-01 through IA-10, DC-03
**What**: `WorkspaceChangeNotifierService` works but hardcodes workgraph knowledge. The infrastructure it uses (chokidar adapter, workspace discovery, registry watching) is excellent and should be reused.
**Required Action**: Replace the service but keep the building blocks.

### Discovery 02: No EventEmitter -- Callback Set Pattern is Canonical
**Impact**: High
**Sources**: DC-10, PS-06
**What**: The codebase deliberately avoids Node.js `EventEmitter`. All event systems use `Set<Callback>` with `onX() → unsubscribe`. The new watcher adapter system must follow this pattern.
**Required Action**: Use callback sets, not EventEmitter.

### Discovery 03: 36 Existing Tests Must Be Removed/Replaced
**Impact**: High
**Sources**: QT-02, QT-03
**What**: The existing 32 unit + 4 integration tests are for the service being replaced. They will break and must be removed. New tests should follow the same patterns (fakes for unit, real chokidar + temp dirs for integration).
**Required Action**: Plan for test removal and replacement in task breakdown.

### Discovery 04: Workspace Discovery Chain is Reusable
**Impact**: High
**Sources**: IA-04, IA-05, IC-02, IC-03, IC-04
**What**: The chain `WorkspaceRegistryAdapter.list()` → `GitWorktreeResolver.detectWorktrees()` → `worktreePath` enumeration is battle-tested and should be reused exactly as-is by the new CentralWatcherService.
**Required Action**: Inject same dependencies into new service.

### Discovery 05: chokidar v5.0 Config is Proven
**Impact**: High
**Sources**: PL-01, PL-02, PL-07, DE-08
**What**: `atomic: true`, `awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 }`, `ignoreInitial: true` handles all CLI write patterns. No polling fallback needed (per user requirement).
**Required Action**: Reuse identical chokidar configuration.

---

## Next Steps

- Run `/plan-1b-specify "Central watcher notification system with domain-agnostic adapter pattern"` to create the specification
- Consider the OOS boundary carefully: this plan stops at the watcher + adapters + workgraph adapter + tests. SSE wiring is a future plan.

---

**Research Complete**: 2026-01-31T03:55:00Z
**Report Location**: `docs/plans/023-central-watcher-notifications/research-dossier.md`
