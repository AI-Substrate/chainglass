# Central Watcher Notification System

**Mode**: Full
**File Management**: PlanPak

## Research Context

This specification incorporates findings from `research-dossier.md`.

- **Components affected**: `WorkspaceChangeNotifierService` (replaced), `IWorkspaceChangeNotifierService` interface (replaced), `FakeWorkspaceChangeNotifierService` (replaced), 36 tests (removed)
- **Critical dependencies**: `IFileWatcher`/`IFileWatcherFactory` (reused), `ChokidarFileWatcherAdapter` (reused), `FakeFileWatcher`/`FakeFileWatcherFactory` (reused), `WorkspaceRegistryAdapter` (reused), `GitWorktreeResolver` (reused), `WorkspaceDataAdapterBase` (pattern reference)
- **Modification risks**: Replacing the existing service removes workgraph-specific watching that no consumer currently uses (the SSE bridge was never wired). Risk is low because the old service has no active callers.
- **Link**: See `research-dossier.md` for full analysis

## Summary

Replace the existing domain-specific `WorkspaceChangeNotifierService` with a domain-agnostic central watcher service that monitors all workspace data directories. Domain-specific behavior is handled by watcher adapters that register with the service, declare what file events they care about, and transform raw filesystem events into domain-specific events.

**Why**: The current watcher only handles workgraph `state.json` changes. As the system grows to include agents, samples, and future domains, each would require modifying the watcher service itself. A generic watcher with pluggable adapters allows any domain to participate in file-change notifications without touching core watcher code.

## Goals

- **G1**: Provide a single service that watches `<worktree>/.chainglass/data/` for every worktree across all registered workspaces
- **G2**: Enable domain-specific handling through a watcher adapter interface -- adapters register with the service and declare their file event interests
- **G3**: Keep the central service entirely free of domain knowledge (no references to workgraphs, agents, samples, or any specific data structure)
- **G4**: Deliver one concrete adapter (WorkGraphWatcherAdapter) as a proof-of-concept that watches workgraph state changes
- **G5**: Dynamically react to workspace registry changes -- add watchers when workspaces are registered, remove when unregistered
- **G6**: Replace the existing `WorkspaceChangeNotifierService` completely, removing all old code and tests with no remnants
- **G7**: Maintain TDD discipline with comprehensive unit tests (using fakes) and integration tests (using real chokidar + temp directories)

## Non-Goals

- **NG1**: SSE integration -- no `instrumentation.ts`, no SSE broadcast wiring, no deduplication logic (future plan)
- **NG2**: Web layer DI registration -- the watcher service is not registered in the web DI container (future plan)
- **NG3**: Client-side code -- no hooks, no browser APIs, no polling fallback
- **NG4**: Polling fallback for watcher failure -- if chokidar fails, log the error and move on
- **NG5**: Multiple concrete adapters beyond WorkGraphWatcherAdapter -- agent and sample adapters are future work
- **NG6**: Event delivery guarantees or persistence -- events are fire-and-forget to registered callbacks

## Complexity

- **Score**: CS-3 (medium)
- **Breakdown**: S=1, I=0, D=0, N=0, F=0, T=2
  - Surface Area (S=1): Multiple files touched within `packages/workflow` -- new service, new interface, new adapter, new fakes, replacement of old files. All within one package though.
  - Integration (I=0): Pure internal; reuses existing chokidar adapter and workspace discovery. No new external dependencies.
  - Data/State (D=0): No schema changes, no migrations. Watches existing file structures.
  - Novelty (N=0): Well-specified by user. Research dossier maps the entire existing system. Adapter pattern is well-understood and already used for data storage.
  - Non-Functional (F=0): Standard error logging. No security, performance, or compliance concerns beyond existing patterns.
  - Testing/Rollout (T=2): TDD with both unit tests (fakes) and integration tests (real chokidar + real filesystem). Must also remove 36 old tests cleanly.
- **Confidence**: 0.90
- **Assumptions**:
  - The existing `WorkspaceChangeNotifierService` has no active callers (SSE bridge was never wired)
  - `IFileWatcher`/`IFileWatcherFactory` interfaces are stable and sufficient
  - chokidar v5.0 recursive watching handles nested directories under `.chainglass/data/`
- **Dependencies**: None external. All building blocks exist in `packages/workflow`.
- **Risks**:
  - Integration test timing sensitivity (chokidar ~200ms init, event propagation delays) -- mitigated by proven `sleep()` patterns from existing tests
  - Recursive watching depth may surface unexpected events -- mitigated by adapter filtering
- **Phases**:
  1. Define interfaces and fakes (ICentralWatcherService, IWatcherAdapter, fakes)
  2. Implement CentralWatcherService with TDD
  3. Implement WorkGraphWatcherAdapter with TDD
  4. Integration tests with real chokidar
  5. Remove old service, interface, fake, and tests; verify clean build

## Acceptance Criteria

1. **AC1**: A `CentralWatcherService` exists that, when started, creates one `IFileWatcher` per worktree watching `<worktree>/.chainglass/data/` recursively
2. **AC2**: The `CentralWatcherService` accepts adapter registrations via a `registerAdapter(adapter: IWatcherAdapter)` method before or after `start()`
3. **AC3**: When a file event occurs under a watched directory, the service forwards it to ALL registered adapters (adapters self-filter)
4. **AC4**: Adapters receive raw file events (path + event type), self-filter for relevance, and can transform them into domain-specific events for their own subscribers
5. **AC5**: A `WorkGraphWatcherAdapter` exists that filters for workgraph `state.json` changes and emits `WorkGraphChangedEvent` to its subscribers
6. **AC6**: When a workspace is added to the registry, the service discovers its worktrees and starts watching them. When removed, it stops watching.
7. **AC7**: The service watches the workspace registry file (`workspaces.json`) for changes to trigger workspace add/remove
8. **AC8**: `CentralWatcherService.stop()` closes all watchers and cleans up
9. **AC9**: The old `WorkspaceChangeNotifierService`, its interface, its fake, and all 36 associated tests are removed from the codebase
10. **AC10**: New unit tests use fakes (no `vi.fn()`) following existing patterns. New integration tests use real chokidar with temp directories.
11. **AC11**: `just check` passes (lint, typecheck, test) with zero failures after all changes
12. **AC12**: The `CentralWatcherService` has no imports from or references to any domain-specific module (workgraph, agent, sample)

## Risks & Assumptions

### Risks

- **R1**: chokidar recursive watching on deeply nested workgraph directories (node data dirs) may generate high event volume -- mitigated by adapter-level filtering and the fact that adapters own debouncing
- **R2**: Removing the old service and tests in one pass may reveal hidden imports or exports elsewhere -- mitigated by `just check` validation
- **R3**: Integration test reliability across platforms (macOS FSEvents vs Linux inotify) -- mitigated by existing proven patterns and CI environment consistency

### Assumptions

- **A1**: The existing `WorkspaceChangeNotifierService` has no active consumers in production code paths (SSE bridge was never wired, per research)
- **A2**: chokidar v5.0's recursive watching is sufficient for `<worktree>/.chainglass/data/` trees
- **A3**: The callback-set pattern (`Set<Callback>` with unsubscribe) is the correct eventing approach (per codebase convention -- no EventEmitter)
- **A4**: Adapters are responsible for their own debouncing, not the central service
- **A5**: One watcher per worktree (not per adapter, not per workspace) is the correct granularity

## Open Questions

- ~~**OQ1**~~: **Resolved** — Explicit `registerAdapter()` calls. No DI-based auto-discovery.
- ~~**OQ2**~~: **Resolved** — Adapters automatically receive events from new worktrees. Register once, receive from all.

## ADR Seeds (Optional)

### ADR-01: Central Watcher Architecture

- **Decision Drivers**: Need to support multiple domains (workgraph, agents, samples) without modifying core watcher code; existing codebase uses adapter pattern extensively; user explicitly requested domain-agnostic service
- **Candidate Alternatives**:
  - A: Central watcher + adapter pattern (proposed) -- single service delegates to registered adapters
  - B: Per-domain watcher services -- each domain creates its own watcher service (more isolation, more resource usage)
  - C: Event bus pattern -- central service emits raw events, domains subscribe to a shared bus (more decoupled, but adds EventEmitter which contradicts codebase conventions)
- **Stakeholders**: Project maintainer (jak)

### ADR-02: Adapter Filtering Strategy

- **Decision Drivers**: Adapters need to express what events they care about efficiently; central service should not parse or understand file paths
- **Decision**: Option B — Adapter receives ALL events and self-filters. Simplest service implementation; adapters own all domain knowledge including filtering and debouncing.
- **Rejected Alternatives**:
  - A: Declarative glob patterns + event types — over-engineered for current needs
  - C: Predicate function — adds indirection without benefit when adapters get all events anyway
- **Stakeholders**: Project maintainer (jak)

## Workshop Opportunities

The adapter interface design workshop is **no longer needed** — the "receive all, self-filter" decision simplifies the interface to a single `handleEvent(path, eventType, worktreePath)` method. No filter declarations, no predicate functions. Remaining design decisions (lifecycle hooks, event shape) are straightforward enough for the architecture phase.

## Testing Strategy

- **Approach**: Full TDD
- **Rationale**: Core infrastructure service with adapter extension point. Correctness matters and the existing codebase has strong TDD patterns to follow.
- **Focus Areas**:
  - CentralWatcherService lifecycle (start/stop, watcher creation per worktree)
  - Adapter registration and event dispatch to all adapters
  - Dynamic workspace add/remove (registry watcher triggers new watchers)
  - WorkGraphWatcherAdapter filtering and event transformation
  - Integration tests: real chokidar + temp dirs with actual file writes
- **Excluded**: chokidar internals, workspace registry adapter (already tested), git worktree resolver (already tested)
- **Mock Usage**: Fakes only (no `vi.fn()`). Use existing `FakeFileWatcher`/`FakeFileWatcherFactory` and create new fakes for `ICentralWatcherService` and `IWatcherAdapter`.

## Documentation Strategy

- **Location**: ADR when ready (during architecture phase)
- **Rationale**: Internal infrastructure refactor. No user-facing changes. ADR captures architectural decisions; code is self-documenting via interfaces.
- **Target Audience**: Future developers adding new watcher adapters
- **Maintenance**: ADR is a point-in-time record; interfaces serve as living documentation

## Clarifications

### Session 2026-01-31

| # | Question | Answer | Sections Updated |
|---|----------|--------|------------------|
| Q1 | Workflow mode? | **Full** — CS-3 with 5 phases, TDD, adapter interface design | Header |
| Q2 | Testing approach? | **Full TDD** — fakes + integration tests, matching codebase conventions | Testing Strategy |
| Q3 | Documentation strategy? | **ADR when ready** — no new docs files, ADR captures decisions | Documentation Strategy |
| Q4 | File management? | **PlanPak** — feature-grouped code with plan traceability | Header |
| Q5 | Adapter registration (OQ1)? | **Explicit `registerAdapter()`** — no DI auto-discovery | Open Questions, AC2 |
| Q6 | Adapter filtering (ADR-02)? | **Receive all, self-filter** — simplest service, adapters own filtering | ADR-02, AC3, AC4, Workshop |
| Q7 | Auto-apply to new worktrees (OQ2)? | **Yes, automatic** — register once, receive from all watchers | Open Questions |

**Coverage Summary**:
- **Resolved**: Mode, Testing Strategy, Documentation Strategy, File Management, OQ1 (registration), OQ2 (auto-apply), ADR-02 (filtering)
- **Deferred**: None
- **Outstanding**: None — all critical ambiguities resolved
