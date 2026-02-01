# Central Watcher Notification System Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-01-31
**Spec**: [./central-watcher-notifications-spec.md](./central-watcher-notifications-spec.md)
**Status**: DRAFT
**Mode**: Full
**File Management**: PlanPak

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Critical Research Findings](#critical-research-findings)
4. [Testing Philosophy](#testing-philosophy)
5. [File Placement Manifest](#file-placement-manifest)
6. [Phase 1: Interfaces & Fakes](#phase-1-interfaces--fakes)
7. [Phase 2: CentralWatcherService (TDD)](#phase-2-centralwatcherservice-tdd)
8. [Phase 3: WorkGraphWatcherAdapter (TDD)](#phase-3-workgraphwatcheradapter-tdd)
9. [Phase 4: Integration Tests](#phase-4-integration-tests)
10. [Phase 5: Cleanup & Validation](#phase-5-cleanup--validation)
11. [Cross-Cutting Concerns](#cross-cutting-concerns)
12. [Complexity Tracking](#complexity-tracking)
13. [Progress Tracking](#progress-tracking)
14. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

The existing `WorkspaceChangeNotifierService` watches only workgraph `state.json` files, baking domain knowledge into the watcher. This plan replaces it with a domain-agnostic `CentralWatcherService` that watches `<worktree>/.chainglass/data/` recursively and forwards ALL file events to registered `IWatcherAdapter` instances. Each adapter self-filters for relevance. A concrete `WorkGraphWatcherAdapter` is delivered as proof-of-concept.

**Solution approach**:
- Define new interfaces (`ICentralWatcherService`, `IWatcherAdapter`, `WatcherEvent`) and fakes
- TDD-implement `CentralWatcherService` reusing existing `IFileWatcher`/`IFileWatcherFactory`
- TDD-implement `WorkGraphWatcherAdapter` that filters for workgraph state changes
- Integration tests with real chokidar + temp directories
- Remove old service, interface, fake, and 36 tests; update all barrel exports

**Expected outcomes**: Extensible watcher architecture where future domains (agents, samples) can plug in without modifying core watcher code. Clean codebase with no remnants of old service.

---

## Technical Context

### Current System State

- `WorkspaceChangeNotifierService` (283 lines) watches `work-graphs/*/state.json` only
- Has NO active consumers (SSE bridge was never wired, confirmed: zero references in `apps/`)
- NOT registered in any DI container (no token exists)
- 36 tests exist (32 unit + 4 integration) but test a service that will be replaced
- Reusable infrastructure: `IFileWatcher`, `ChokidarFileWatcherAdapter`, `FakeFileWatcher`, `WorkspaceRegistryAdapter`, `GitWorktreeResolver`

### Integration Requirements

- New code reuses `IFileWatcher`/`IFileWatcherFactory` from `packages/workflow/src/interfaces/file-watcher.interface.ts`
- New code reuses `FakeFileWatcher`/`FakeFileWatcherFactory` from `packages/workflow/src/fakes/fake-file-watcher.ts`
- Workspace discovery chain: `WorkspaceRegistryAdapter.list()` -> `GitWorktreeResolver.detectWorktrees()` -> worktree paths
- chokidar v5.0 config: `atomic: true`, `awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 }`, `ignoreInitial: true`

### Constraints

- Callback-set pattern (`Set<Callback>` with `onX() -> unsubscribe`), NOT EventEmitter
- Fakes over mocks -- no `vi.fn()`, no `vi.mock()`, no `vi.spyOn()`
- `useFactory` for DI registration (no decorators)
- Services import only from interfaces, never from adapters directly
- All data lives at `<worktree>/.chainglass/data/<domain>/`

### Assumptions

- Old service has zero runtime consumers (verified: no imports in `apps/`)
- chokidar watches directories recursively by default (no explicit `recursive` option needed)
- `tsconfig.json` `include: ["src/**/*"]` covers `src/features/` automatically

### ADR Ledger

| ADR | Status | Affects Phases | Notes |
|-----|--------|----------------|-------|
| ADR-0004 | Accepted | All | DI pattern: `useFactory`, child containers, token constants |
| ADR-0008 | Accepted | Phase 5 | Module registration function pattern (`adr-0008-module-registration-function-pattern.md`) -- future DI integration |

### Deviation Ledger

| Principle Violated | Why Needed | Simpler Alternative Rejected | Risk Mitigation |
|-------------------|------------|------------------------------|-----------------|
| None | N/A | N/A | N/A |

---

## Critical Research Findings

### 01: Old Service Has Zero Runtime Consumers
**Impact**: Critical (risk-reducing)
**Sources**: [R1-05, R1-06]
**What**: `WorkspaceChangeNotifierService` is not registered in any DI container, not imported in `apps/web/` or `apps/cli/`. The only consumers are 36 test cases and barrel exports. Removal has zero runtime impact.
**Action Required**: Remove with confidence. No gradual migration needed.
**Affects Phases**: Phase 5

### 02: Barrel Export Chain is 3 Layers Deep
**Impact**: Critical
**Sources**: [R1-01, R1-02, I1-08]
**What**: Old types are exported from `interfaces/index.ts` -> `services/index.ts` -> `fakes/index.ts` -> main `index.ts` (lines 376-400). All 4 barrels must update atomically. The `IFileWatcher` family exports (lines 384-393) MUST be preserved -- only notifier-specific exports are removed.
**Action Required**: Update all 4 barrel files in a single phase. Run `just typecheck` immediately after. Keep `IFileWatcher`/`ChokidarFileWatcherAdapter`/`FakeFileWatcher` exports untouched.
**Affects Phases**: Phase 5

### 03: Cleanup Scope is 12 Files
**Impact**: Critical
**Sources**: [R1-01]
**What**: 5 source files to delete, 2 test files to delete, 4 barrel files to update, 3 files with comment references to update.

| File | Action |
|------|--------|
| `packages/workflow/src/services/workspace-change-notifier.service.ts` | Delete |
| `packages/workflow/src/interfaces/workspace-change-notifier.interface.ts` | Delete |
| `packages/workflow/src/fakes/fake-workspace-change-notifier.service.ts` | Delete |
| `test/unit/workflow/workspace-change-notifier.service.test.ts` | Delete |
| `test/integration/workflow/workspace-change-notifier.integration.test.ts` | Delete |
| `packages/workflow/src/services/index.ts` | Remove notifier export |
| `packages/workflow/src/interfaces/index.ts` | Remove notifier exports |
| `packages/workflow/src/fakes/index.ts` | Remove notifier exports |
| `packages/workflow/src/index.ts` (lines 376-382, 394-400) | Replace with new exports |
| `packages/workflow/src/fakes/fake-file-watcher.ts` | Update comment refs |
| `packages/workflow/src/interfaces/file-watcher.interface.ts` | Update comment refs |
| `packages/workflow/src/adapters/chokidar-file-watcher.adapter.ts` | Update comment refs |

**Action Required**: Delete files bottom-up. Update barrels atomically. Verify with `just check`.
**Affects Phases**: Phase 5

### 04: Integration Test Timing Pattern
**Impact**: High
**Sources**: [R1-03]
**What**: Existing integration tests use specific timing: `sleep(200)` after `start()` for chokidar init, `sleep(300)` between writes for debounce separation, `sleep(500)` for "no event" assertions, `Promise.race` with 5s timeout for event capture.
**Action Required**: Replicate exact timing patterns in Phase 4 integration tests. Use same `awaitWriteFinish` config.
**Affects Phases**: Phase 4

### 05: PlanPak `features/` Directory is New to `packages/workflow`
**Impact**: High
**Sources**: [R1-08, I1-06]
**What**: `packages/workflow/src/features/` does not exist. Must create it plus add export map entry to `package.json` following `packages/shared` precedent (`"./features/023-..."` entry).
**Action Required**: Phase 1 T000 creates the directory. Add `package.json` exports entry. Re-export from main `index.ts`.
**Affects Phases**: Phase 1, Phase 5

### 06: Interface Design -- WatcherEvent as Object
**Impact**: High
**Sources**: [I1-02, I1-03]
**What**: Use a single `WatcherEvent` object (not positional params) for `handleEvent()`. Include `path`, `eventType` (reuse `FileWatcherEvent`), `worktreePath`, `workspaceSlug`. This matches `GraphChangedEvent` pattern and is extensible.
**Action Required**: Define `WatcherEvent` interface in Phase 1. `IWatcherAdapter.handleEvent(event: WatcherEvent): void`.
**Affects Phases**: Phase 1, Phase 2, Phase 3

### 07: One IFileWatcher Per Worktree
**Impact**: High
**Sources**: [I1-04]
**What**: Per AC1, create one `IFileWatcher` per worktree watching `<worktree>/.chainglass/data/` recursively. Store in `Map<string, IFileWatcher>`. When a worktree is removed, close its watcher and delete from map. Plus one registry watcher for `workspaces.json`.
**Action Required**: `CentralWatcherService` maintains `Map<string, IFileWatcher>` + single registry watcher.
**Affects Phases**: Phase 2

### 08: CentralWatcherService Should NOT Clear Adapters on Stop
**Impact**: Medium
**Sources**: [I1-02]
**What**: The old service clears its callback set on `stop()`. The new service should NOT clear registered adapters on `stop()` -- adapters may hold subscriber state and callers may want to `start()` again with same adapters. Only clear watchers.
**Action Required**: `stop()` closes all `IFileWatcher` instances but preserves the adapter set.
**Affects Phases**: Phase 2

### 09: WorkGraphChangedEvent Should Match Old Shape
**Impact**: Medium
**Sources**: [I1-10]
**What**: The `WorkGraphWatcherAdapter` should emit a `WorkGraphChangedEvent` with the same fields as the old `GraphChangedEvent`: `graphSlug`, `workspaceSlug`, `worktreePath`, `filePath`, `timestamp`. This enables trivial future consumer migration.
**Action Required**: Define `WorkGraphChangedEvent` with identical shape. Adapter exposes `onGraphChanged(callback)` returning unsubscribe function.
**Affects Phases**: Phase 3

### 10: Add DI Token for Future Use
**Impact**: Medium
**Sources**: [I1-07]
**What**: No DI registration needed (per NG2), but add `CENTRAL_WATCHER_SERVICE: 'ICentralWatcherService'` to `WORKSPACE_DI_TOKENS` for future SSE integration plan.
**Action Required**: Add token to `packages/shared/src/di-tokens.ts`. Do not register in containers.
**Affects Phases**: Phase 1

---

## Testing Philosophy

### Testing Approach
- **Selected Approach**: Full TDD
- **Rationale**: Core infrastructure service with adapter extension point. Correctness matters and the existing codebase has strong TDD patterns to follow.
- **Focus Areas**: Service lifecycle, adapter dispatch, workspace add/remove, workgraph adapter filtering, integration with real chokidar
- **Excluded**: chokidar internals, workspace registry adapter (already tested), git worktree resolver (already tested)

### Test-Driven Development
- Write tests FIRST (RED)
- Implement minimal code (GREEN)
- Refactor for quality (REFACTOR)

### Mock Usage
- **Fakes only** -- no `vi.fn()`, `vi.mock()`, `vi.spyOn()`
- Use existing `FakeFileWatcher`/`FakeFileWatcherFactory` for unit tests
- Create new `FakeCentralWatcherService` and `FakeWatcherAdapter` for consumer testing
- Integration tests use real `ChokidarFileWatcherFactory` + temp directories

### Test Documentation
Every test includes 5-field Test Doc comment:
```typescript
it('should [behavior]', () => {
  /*
  Test Doc:
  - Why: [reason]
  - Contract: [invariant]
  - Usage Notes: [how to use]
  - Quality Contribution: [what failure this catches]
  - Worked Example: [inputs/outputs]
  */
});
```

---

## File Placement Manifest

| File | Classification | Location | Rationale |
|------|---------------|----------|-----------|
| `central-watcher.interface.ts` | plan-scoped | `packages/workflow/src/features/023-central-watcher-notifications/` | New interface for this plan |
| `watcher-adapter.interface.ts` | plan-scoped | `packages/workflow/src/features/023-central-watcher-notifications/` | New adapter interface |
| `central-watcher.service.ts` | plan-scoped | `packages/workflow/src/features/023-central-watcher-notifications/` | Service implementation |
| `workgraph-watcher.adapter.ts` | plan-scoped | `packages/workflow/src/features/023-central-watcher-notifications/` | Concrete adapter |
| `fake-central-watcher.service.ts` | plan-scoped | `packages/workflow/src/features/023-central-watcher-notifications/` | Fake for testing |
| `fake-watcher-adapter.ts` | plan-scoped | `packages/workflow/src/features/023-central-watcher-notifications/` | Fake for testing |
| `index.ts` | plan-scoped | `packages/workflow/src/features/023-central-watcher-notifications/` | Feature barrel export |
| `di-tokens.ts` | cross-cutting | `packages/shared/src/di-tokens.ts` | Add token to WORKSPACE_DI_TOKENS |
| `packages/workflow/src/index.ts` | cross-cutting | (existing) | Update barrel: remove old, add new |
| `packages/workflow/package.json` | cross-cutting | (existing) | Add exports entry for feature |

**T000 Setup Task**: Creates `packages/workflow/src/features/023-central-watcher-notifications/` directory and adds `package.json` exports entry.

---

## Phase 1: Interfaces & Fakes

**Objective**: Define the complete type surface (interfaces, events, fakes) that all subsequent phases depend on.

**Deliverables**:
- `ICentralWatcherService` interface
- `IWatcherAdapter` interface with `WatcherEvent` type
- `FakeCentralWatcherService` with call tracking and event simulation
- `FakeWatcherAdapter` with call tracking
- Feature barrel export (`index.ts`)
- DI token added to `WORKSPACE_DI_TOKENS`
- PlanPak directory and `package.json` exports entry

**Dependencies**: None (foundational phase)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Interface design insufficient for Phase 2-3 | Low | Medium | Research dossier + spec fully define the shape |
| PlanPak export path doesn't resolve | Low | High | Follow `packages/shared` precedent exactly |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 1.0 | [ ] | Create PlanPak feature directory and `package.json` exports entry | CS-1 | Directory exists at `packages/workflow/src/features/023-central-watcher-notifications/`. `package.json` exports field has entry: `"./features/023-central-watcher-notifications": { "import": "./dist/features/023-central-watcher-notifications/index.js", "types": "./dist/features/023-central-watcher-notifications/index.d.ts" }` (matching `packages/shared/package.json` lines 28-31 pattern). Verify import resolves: `import { ... } from '@chainglass/workflow/features/023-central-watcher-notifications'`. | - | T000 setup |
| 1.1 | [ ] | Define `WatcherEvent` type and `IWatcherAdapter` interface | CS-1 | `WatcherEvent` has: `path`, `eventType` (reuses `FileWatcherEvent`), `worktreePath`, `workspaceSlug`. `IWatcherAdapter` has: `name: string`, `handleEvent(event: WatcherEvent): void` | - | `watcher-adapter.interface.ts` |
| 1.2 | [ ] | Define `ICentralWatcherService` interface | CS-1 | Interface has: `start(): Promise<void>`, `stop(): Promise<void>`, `isWatching(): boolean`, `rescan(): Promise<void>`, `registerAdapter(adapter: IWatcherAdapter): void` | - | `central-watcher.interface.ts` |
| 1.3 | [ ] | Write tests for `FakeWatcherAdapter` | CS-1 | Tests verify: records `handleEvent()` calls with events, exposes `calls` array, `reset()` clears calls | - | RED phase |
| 1.4 | [ ] | Implement `FakeWatcherAdapter` to pass tests | CS-1 | All tests from 1.3 pass. Has `name`, `handleEvent()`, `calls` tracking, `reset()` | - | GREEN phase |
| 1.5 | [ ] | Write tests for `FakeCentralWatcherService` | CS-2 | Tests verify: start/stop lifecycle tracking, adapter registration, `simulateEvent()` dispatches to adapters, `isWatching()` state, error injection | - | RED phase |
| 1.6 | [ ] | Implement `FakeCentralWatcherService` to pass tests | CS-2 | All tests from 1.5 pass. Has call tracking (`StartCall`, `StopCall`, `RegisterAdapterCall`), `simulateEvent()`, configurable errors | - | GREEN phase |
| 1.7 | [ ] | Create feature barrel export and update main `index.ts` | CS-1 | `features/023.../index.ts` exports all new types. Main `index.ts` re-exports from feature barrel. `just typecheck` passes. | - | |
| 1.8 | [ ] | Add `CENTRAL_WATCHER_SERVICE` DI token (reserved placeholder) | CS-1 | Token `CENTRAL_WATCHER_SERVICE: 'ICentralWatcherService'` added to `WORKSPACE_DI_TOKENS` in `packages/shared/src/di-tokens.ts`. Token is NOT registered in any container (per NG2). JSDoc comment: `/** Reserved for future SSE integration plan */`. `just typecheck` passes. | - | Placeholder only -- no container registration |

### Test Examples (Write First!)

```typescript
// test/unit/workflow/features/023/fake-watcher-adapter.test.ts
import { FakeWatcherAdapter } from '@chainglass/workflow';
import type { WatcherEvent } from '@chainglass/workflow';

describe('FakeWatcherAdapter', () => {
  it('should record handleEvent calls', () => {
    /*
    Test Doc:
    - Why: Fakes must track calls for test assertions
    - Contract: Every handleEvent() call is recorded in calls array
    - Usage Notes: Access via adapter.calls; reset with adapter.reset()
    - Quality Contribution: Ensures fake faithfully records all dispatched events
    - Worked Example: handleEvent(event) -> calls.length === 1, calls[0] === event
    */
    const adapter = new FakeWatcherAdapter('test-adapter');
    const event: WatcherEvent = {
      path: '/worktree/.chainglass/data/work-graphs/my-graph/state.json',
      eventType: 'change',
      worktreePath: '/worktree',
      workspaceSlug: 'my-workspace',
    };

    adapter.handleEvent(event);

    expect(adapter.calls).toHaveLength(1);
    expect(adapter.calls[0]).toEqual(event);
  });
});
```

### Acceptance Criteria
- [ ] All new interfaces compile with `just typecheck`
- [ ] All fake tests pass
- [ ] Feature barrel exports all types correctly
- [ ] Main `index.ts` re-exports new types
- [ ] `package.json` exports entry resolves correctly
- [ ] DI token added to `WORKSPACE_DI_TOKENS`
- [ ] No domain-specific imports in interface files (AC12)

---

## Phase 2: CentralWatcherService (TDD)

**Objective**: TDD-implement the domain-agnostic watcher service that watches all worktree data directories and dispatches events to registered adapters.

**Deliverables**:
- `CentralWatcherService` implementation
- Comprehensive unit tests using `FakeFileWatcherFactory`, `FakeWorkspaceRegistryAdapter`, `FakeGitWorktreeResolver`

**Dependencies**: Phase 1 complete (interfaces and fakes exist)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Event dispatch to multiple adapters has ordering issues | Low | Medium | Document that dispatch order is registration order |
| Registry watcher rescan races with worktree watcher creation | Medium | Medium | Serialize rescan operations with `isRescanning` guard |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 2.1 | [ ] | Write tests: service lifecycle (start/stop/isWatching) | CS-2 | Tests cover: start creates watchers per worktree + registry watcher, stop closes all watchers, isWatching reflects state, double-start throws, stop-when-not-watching is safe | - | RED phase. Use `FakeFileWatcherFactory`, `FakeWorkspaceRegistryAdapter`, `FakeGitWorktreeResolver` |
| 2.2 | [ ] | Write tests: adapter registration and event dispatch | CS-2 | Tests cover: `registerAdapter()` stores adapter, file event dispatched to all adapters as `WatcherEvent`, multiple adapters all receive same event, adapter registered after start receives events from existing watchers | - | RED phase |
| 2.3 | [ ] | Write tests: workspace add/remove via registry watcher | CS-2 | Tests cover: registry watcher `change` triggers rescan, new worktree gets watcher, removed worktree's watcher closed, workspace slug correctly mapped to worktree paths | - | RED phase |
| 2.4 | [ ] | Write tests: error handling | CS-1 | Tests cover: watcher creation failure logged (not thrown), adapter `handleEvent` exception doesn't crash service, registry read failure logged | - | RED phase |
| 2.5 | [ ] | Implement `CentralWatcherService` to pass lifecycle tests | CS-3 | All tests from 2.1 pass. Constructor takes: `IWorkspaceRegistryAdapter`, `IGitWorktreeResolver`, `IFileSystem`, `IFileWatcherFactory`, `registryPath`, and optional `ILogger` (falls back to `console.error` if not provided). `start()` discovers worktrees and creates `Map<string, IFileWatcher>`. | - | GREEN phase |
| 2.6 | [ ] | Implement adapter dispatch to pass registration tests | CS-2 | All tests from 2.2 pass. Adapters stored in `Set<IWatcherAdapter>`. File events create `WatcherEvent` and call `handleEvent` on all adapters. | - | GREEN phase |
| 2.7 | [ ] | Implement registry watching to pass workspace add/remove tests | CS-2 | All tests from 2.3 pass. Registry watcher fires `rescan()` on change. Rescan diffs current vs new worktrees, creates/closes watchers accordingly. | - | GREEN phase |
| 2.8 | [ ] | Implement error handling to pass error tests | CS-1 | All tests from 2.4 pass. try/catch around watcher creation, adapter dispatch, and registry reads. Errors logged via optional `ILogger` at ERROR level (falls back to `console.error` if not injected). | - | GREEN phase |
| 2.9 | [ ] | Refactor for quality | CS-1 | Code meets idioms (clean architecture, no domain imports). All tests still pass. | - | REFACTOR phase |

### Test Examples (Write First!)

```typescript
// test/unit/workflow/features/023/central-watcher.service.test.ts
import { CentralWatcherService } from '@chainglass/workflow';
import {
  FakeFileWatcherFactory,
  FakeWorkspaceRegistryAdapter,
  FakeGitWorktreeResolver,
  FakeWatcherAdapter,
} from '@chainglass/workflow';
import { FakeFileSystem } from '@chainglass/shared';

describe('CentralWatcherService', () => {
  let service: CentralWatcherService;
  let fileWatcherFactory: FakeFileWatcherFactory;
  let registry: FakeWorkspaceRegistryAdapter;
  let worktreeResolver: FakeGitWorktreeResolver;
  let fs: FakeFileSystem;

  beforeEach(() => {
    fileWatcherFactory = new FakeFileWatcherFactory();
    registry = new FakeWorkspaceRegistryAdapter();
    worktreeResolver = new FakeGitWorktreeResolver();
    fs = new FakeFileSystem();

    service = new CentralWatcherService(
      registry,
      worktreeResolver,
      fs,
      fileWatcherFactory,
      '/home/user/.config/chainglass/workspaces.json',
    );

    // Configure fakes with test data
    registry.setWorkspaces([
      Workspace.create({ slug: 'ws-1', path: '/repo-1' }),
      Workspace.create({ slug: 'ws-2', path: '/repo-2' }),
    ]);
    worktreeResolver.setWorktrees('/repo-1', [{ path: '/repo-1', isMain: true }]);
    worktreeResolver.setWorktrees('/repo-2', [{ path: '/repo-2', isMain: true }]);
  });

  describe('start()', () => {
    it('should create one watcher per worktree plus registry watcher', async () => {
      /*
      Test Doc:
      - Why: AC1 requires one IFileWatcher per worktree
      - Contract: start() creates N+1 watchers (N worktrees + 1 registry)
      - Usage Notes: Use FakeFileWatcherFactory.getWatcherCount() to verify
      - Quality Contribution: Ensures correct watcher-per-worktree granularity
      - Worked Example: 2 workspaces * 1 worktree each = 2 data watchers + 1 registry = 3
      */
      // ... Arrange with 2 workspaces, each with 1 worktree
      await service.start();
      expect(fileWatcherFactory.getWatcherCount()).toBe(3);
    });
  });

  describe('event dispatch', () => {
    it('should forward file events to all registered adapters', async () => {
      /*
      Test Doc:
      - Why: AC3 requires events forwarded to ALL adapters
      - Contract: Every registered adapter receives every file event
      - Usage Notes: Register adapters before or after start()
      - Quality Contribution: Ensures domain-agnostic dispatch works
      - Worked Example: 2 adapters registered, 1 file change -> both get WatcherEvent
      */
      const adapter1 = new FakeWatcherAdapter('adapter-1');
      const adapter2 = new FakeWatcherAdapter('adapter-2');
      service.registerAdapter(adapter1);
      service.registerAdapter(adapter2);

      await service.start();

      // Simulate file change via FakeFileWatcher
      const watcher = fileWatcherFactory.getWatcher(1); // first data watcher
      watcher.simulateChange('/worktree/.chainglass/data/work-graphs/g1/state.json');

      expect(adapter1.calls).toHaveLength(1);
      expect(adapter2.calls).toHaveLength(1);
      expect(adapter1.calls[0].eventType).toBe('change');
    });
  });
});
```

### Non-Happy-Path Coverage
- [ ] Double `start()` throws error
- [ ] `stop()` when not watching is safe (no-op)
- [ ] Watcher creation failure for one worktree doesn't prevent others
- [ ] Adapter `handleEvent()` exception doesn't crash service or other adapters
- [ ] Registry read failure during rescan is logged, not thrown
- [ ] Empty workspace list (no worktrees) starts successfully with only registry watcher
- [ ] Multiple rapid registry changes don't create duplicate watchers (rescan serialization)
- [ ] Adapter registered after `start()` receives events from existing watchers

### Acceptance Criteria
- [ ] All unit tests pass (AC1, AC2, AC3, AC6, AC7, AC8)
- [ ] Service has zero imports from domain modules (AC12)
- [ ] `start()` creates one `IFileWatcher` per worktree watching `.chainglass/data/` (AC1)
- [ ] `registerAdapter()` works before and after `start()` (AC2)
- [ ] All adapters receive all file events (AC3)
- [ ] Registry changes trigger workspace add/remove (AC6, AC7)
- [ ] `stop()` closes all watchers (AC8)
- [ ] `just typecheck` passes

---

## Phase 3: WorkGraphWatcherAdapter (TDD)

**Objective**: TDD-implement the concrete workgraph watcher adapter that filters for state.json changes and emits domain-specific events.

**Deliverables**:
- `WorkGraphWatcherAdapter` implementation
- `WorkGraphChangedEvent` type
- Comprehensive unit tests

**Dependencies**: Phase 1 complete (IWatcherAdapter interface exists)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Path parsing regex breaks on edge-case graph slugs | Low | Medium | Test with slugs containing hyphens, dots, underscores |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 3.1 | [x] | Define `WorkGraphChangedEvent` type | CS-1 | Type has: `graphSlug`, `workspaceSlug`, `worktreePath`, `filePath`, `timestamp`. Matches old `GraphChangedEvent` shape exactly. | [📋 log](tasks/phase-3-workgraphwatcheradapter-tdd/execution.log.md#task-t001-setup) | In feature directory |
| 3.2 | [x] | Write tests: state.json change detection and filtering | CS-2 | Tests cover: `state.json` change emits event, `graph.yaml` change ignored, `layout.json` change ignored, file in non-workgraph domain ignored, `state.json` add emits event, `state.json` unlink emits event | [📋 log](tasks/phase-3-workgraphwatcheradapter-tdd/execution.log.md#tasks-t002-t004-red) | RED phase — 6 tests |
| 3.3 | [x] | Write tests: graphSlug extraction from path | CS-1 | Tests cover: correct slug extracted from `/.chainglass/data/work-graphs/<slug>/state.json`, nested node data paths ignored, edge-case slugs (hyphens, dots) work | [📋 log](tasks/phase-3-workgraphwatcheradapter-tdd/execution.log.md#tasks-t002-t004-red) | RED phase — 4 tests |
| 3.4 | [x] | Write tests: subscriber callback pattern | CS-1 | Tests cover: `onGraphChanged(callback)` returns unsubscribe fn, unsubscribe removes callback, multiple subscribers all notified, `WorkGraphChangedEvent` has correct fields | [📋 log](tasks/phase-3-workgraphwatcheradapter-tdd/execution.log.md#tasks-t002-t004-red) | RED phase — 6 tests |
| 3.5 | [x] | Implement `WorkGraphWatcherAdapter` to pass all tests | CS-2 | All tests from 3.2-3.4 pass. Adapter implements `IWatcherAdapter`, `handleEvent()` filters for `state.json` under `work-graphs/`, extracts slug, emits to subscribers. | [📋 log](tasks/phase-3-workgraphwatcheradapter-tdd/execution.log.md#task-t005-green) | GREEN phase — 16/16 pass |
| 3.6 | [x] | Update feature barrel export | CS-1 | `WorkGraphWatcherAdapter`, `WorkGraphChangedEvent` exported from feature `index.ts`. Main `index.ts` re-exports. `just typecheck` passes. | [📋 log](tasks/phase-3-workgraphwatcheradapter-tdd/execution.log.md#task-t006-barrel) | Done with T005 |

### Test Examples (Write First!)

```typescript
// test/unit/workflow/features/023/workgraph-watcher.adapter.test.ts
import { WorkGraphWatcherAdapter } from '@chainglass/workflow';
import type { WatcherEvent, WorkGraphChangedEvent } from '@chainglass/workflow';

describe('WorkGraphWatcherAdapter', () => {
  let adapter: WorkGraphWatcherAdapter;
  let receivedEvents: WorkGraphChangedEvent[];

  beforeEach(() => {
    adapter = new WorkGraphWatcherAdapter();
    receivedEvents = [];
    adapter.onGraphChanged((event) => receivedEvents.push(event));
  });

  it('should emit event when state.json changes', () => {
    /*
    Test Doc:
    - Why: AC5 requires adapter to filter for state.json changes
    - Contract: state.json change under work-graphs/ emits WorkGraphChangedEvent
    - Usage Notes: Subscribe via onGraphChanged() before dispatching events
    - Quality Contribution: Verifies correct domain filtering from raw FS events
    - Worked Example: change to work-graphs/my-graph/state.json -> event with graphSlug 'my-graph'
    */
    const event: WatcherEvent = {
      path: '/wt/.chainglass/data/work-graphs/my-graph/state.json',
      eventType: 'change',
      worktreePath: '/wt',
      workspaceSlug: 'my-ws',
    };

    adapter.handleEvent(event);

    expect(receivedEvents).toHaveLength(1);
    expect(receivedEvents[0].graphSlug).toBe('my-graph');
    expect(receivedEvents[0].workspaceSlug).toBe('my-ws');
  });

  it('should ignore non-state.json files', () => {
    /*
    Test Doc:
    - Why: Adapter must self-filter (ADR-02 decision)
    - Contract: Only state.json under work-graphs/ triggers events
    - Usage Notes: layout.json, graph.yaml, and files in other domains are ignored
    - Quality Contribution: Prevents false notifications for irrelevant changes
    - Worked Example: change to work-graphs/g1/layout.json -> no event emitted
    */
    adapter.handleEvent({
      path: '/wt/.chainglass/data/work-graphs/g1/layout.json',
      eventType: 'change',
      worktreePath: '/wt',
      workspaceSlug: 'ws',
    });

    expect(receivedEvents).toHaveLength(0);
  });
});
```

### Non-Happy-Path Coverage
- [ ] Path with no `work-graphs/` segment ignored
- [ ] Path with `state.json` NOT under `work-graphs/` ignored (e.g., `agents/x/state.json`)
- [ ] Unsubscribe function actually removes callback
- [ ] Multiple subscribers all receive events independently

### Acceptance Criteria
- [ ] All unit tests pass (AC4, AC5)
- [ ] Adapter filters correctly for `state.json` under `work-graphs/` only (AC5)
- [ ] `WorkGraphChangedEvent` has same fields as old `GraphChangedEvent` (09)
- [ ] `onGraphChanged()` returns unsubscribe function (callback-set pattern)
- [ ] `just typecheck` passes

---

## Phase 4: Integration Tests

**Objective**: Verify end-to-end behavior with real chokidar watching real files in temp directories.

**Deliverables**:
- Integration test file covering full pipeline: file write -> chokidar detect -> service dispatch -> adapter filter -> callback

**Dependencies**: Phases 2 and 3 complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Test flakiness due to chokidar timing | Medium | Medium | Use proven timing constants from existing tests |
| Platform-specific FS event behavior | Low | Medium | CI runs on consistent platform |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 4.1 | [x] | Write integration test: service detects file creation | CS-2 | Test creates temp dir with `.chainglass/data/` structure, starts service with real `ChokidarFileWatcherFactory`, writes file, verifies `FakeWatcherAdapter` receives event | [📋](tasks/phase-4-integration-tests/execution.log.md#task-t001-file-detection) | Completed · [^4] |
| 4.2 | [x] | Write integration test: workgraph adapter end-to-end | CS-2 | Test writes `state.json` under `work-graphs/<slug>/`, verifies `WorkGraphWatcherAdapter.onGraphChanged()` callback fires with correct `graphSlug` | [📋](tasks/phase-4-integration-tests/execution.log.md#task-t002-adapter-e2e) | Completed · [^4] |
| 4.3 | [x] | Write integration test: non-matching file ignored | CS-1 | Test writes `layout.json` under `work-graphs/`, verifies no `WorkGraphChangedEvent` emitted within timeout | [📋](tasks/phase-4-integration-tests/execution.log.md#task-t003-filter) | Completed · [^4] |
| 4.4 | [x] | Write integration test: service cleanup on stop | CS-1 | Test starts service, stops it, writes file, verifies no events dispatched. No leaked watchers. | [📋](tasks/phase-4-integration-tests/execution.log.md#task-t004-cleanup) | Completed · [^4] |

### Test Examples (Write First!)

```typescript
// test/integration/workflow/features/023/central-watcher.integration.test.ts
import { CentralWatcherService, WorkGraphWatcherAdapter } from '@chainglass/workflow';
import { ChokidarFileWatcherFactory } from '@chainglass/workflow';
import { FakeWorkspaceRegistryAdapter, FakeGitWorktreeResolver } from '@chainglass/workflow';
import { NodeFileSystemAdapter } from '@chainglass/shared';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const INIT_DELAY = 200;
const EVENT_TIMEOUT = 5000;

describe('CentralWatcherService integration', () => {
  let tmpDir: string;
  let service: CentralWatcherService;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'cw-test-'));
    // Create .chainglass/data/work-graphs/test-graph/ structure
    await mkdir(path.join(tmpDir, '.chainglass', 'data', 'work-graphs', 'test-graph'), {
      recursive: true,
    });
  });

  it('should detect state.json write via workgraph adapter', async () => {
    /*
    Test Doc:
    - Why: End-to-end verification that real chokidar events flow through service to adapter
    - Contract: Writing state.json triggers WorkGraphChangedEvent with correct graphSlug
    - Usage Notes: Requires sleep(200) for chokidar init, Promise.race for timeout
    - Quality Contribution: Catches real FS event propagation issues
    - Worked Example: write state.json -> adapter.onGraphChanged fires within 5s
    */
    // ... setup with real ChokidarFileWatcherFactory
    // ... start service, write state.json, wait for event
  });
});
```

### Acceptance Criteria
- [x] All integration tests pass
- [x] Real file writes detected by real chokidar
- [x] Events flow through service to adapter correctly
- [x] Timing constants match existing proven values (200ms init, 5s timeout)
- [x] Tests clean up temp directories

---

## Phase 5: Cleanup & Validation

**Objective**: Remove all old service code and tests, update barrel exports, verify clean build.

**Deliverables**:
- 5 source files deleted
- 2 test files deleted
- 4 barrel files updated
- 3 comment references updated
- `just check` passes with zero failures

**Dependencies**: Phases 1-4 complete and all tests passing

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Stale `.d.ts` files in `dist/` mask broken exports | Medium | High | Run `just clean && just build` |
| Missed reference in unexpected file | Low | Medium | `just typecheck` catches all |

### Tasks

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 5.1 | [ ] | Delete old source files (3 files) | CS-1 | Delete: `workspace-change-notifier.service.ts`, `workspace-change-notifier.interface.ts`, `fake-workspace-change-notifier.service.ts` | - | |
| 5.2 | [ ] | Delete old test files (2 files) | CS-1 | Delete: `test/unit/workflow/workspace-change-notifier.service.test.ts`, `test/integration/workflow/workspace-change-notifier.integration.test.ts` | - | |
| 5.3 | [ ] | Update `packages/workflow/src/services/index.ts` | CS-1 | Remove line 33: `WorkspaceChangeNotifierService` export | - | |
| 5.4 | [ ] | Update `packages/workflow/src/interfaces/index.ts` | CS-1 | Remove lines 128-133: `GraphChangedEvent`, `GraphChangedCallback`, `IWorkspaceChangeNotifierService` exports | - | Keep `IFileWatcher` exports |
| 5.5 | [ ] | Update `packages/workflow/src/fakes/index.ts` | CS-1 | Remove lines 103-110: `FakeWorkspaceChangeNotifierService` and call type exports | - | Keep `FakeFileWatcher` exports |
| 5.6 | [ ] | Update `packages/workflow/src/index.ts` barrel | CS-2 | Remove lines 376-382 and 394-400 (old notifier exports). Add new exports from feature barrel. Keep lines 384-393 (`IFileWatcher` family). | - | Critical: preserve `IFileWatcher` exports |
| 5.7 | [ ] | Update comment references in 3 files | CS-1 | Update `WorkspaceChangeNotifierService` comment references in: `fake-file-watcher.ts`, `file-watcher.interface.ts`, `chokidar-file-watcher.adapter.ts` | - | |
| 5.8 | [ ] | Run `just clean && just build && just check` | CS-1 | Zero errors from lint, typecheck, build, and test. AC9, AC11 verified. | - | Full clean build |

### Acceptance Criteria
- [ ] All 5 old source files deleted (AC9)
- [ ] All 2 old test files deleted (AC9)
- [ ] All 4 barrel files updated correctly
- [ ] `IFileWatcher`/`ChokidarFileWatcherAdapter`/`FakeFileWatcher` exports preserved
- [ ] New feature exports present in main `index.ts`
- [ ] `just check` passes with zero failures (AC11)
- [ ] No stale references to old types anywhere in codebase

---

## Cross-Cutting Concerns

### Security Considerations
- No user input processing (watches filesystem paths derived from internal config)
- No network exposure (SSE integration is OOS)
- File paths validated by existing workspace discovery chain

### Observability
- Service logs watcher creation/close events at INFO level
- Service logs errors at ERROR level (watcher creation failure, adapter dispatch exception)
- No metrics (OOS for this plan)

### Documentation
- ADR captures architectural decisions (per Documentation Strategy)
- Interfaces serve as living documentation
- Test Doc comments document behavior contracts

---

## Complexity Tracking

| Component | CS | Label | Breakdown (S,I,D,N,F,T) | Justification | Mitigation |
|-----------|-----|-------|------------------------|---------------|------------|
| Overall Plan | CS-3 | Medium | S=1,I=0,D=0,N=0,F=0,T=2 | Multiple files within one package, TDD + integration tests | Phased delivery, proven infrastructure |

No components individually exceed CS-3. No deviations required.

---

## Progress Tracking

### Phase Completion Checklist
- [x] Phase 1: Interfaces & Fakes - COMPLETE
- [x] Phase 2: CentralWatcherService (TDD) - COMPLETE
- [x] Phase 3: WorkGraphWatcherAdapter (TDD) - COMPLETE
- [x] Phase 4: Integration Tests - COMPLETE
- [ ] Phase 5: Cleanup & Validation - Pending

Overall Progress: 4/5 phases (80%)

### STOP Rule
This plan must be validated before creating tasks. After writing this plan:
1. Run `/plan-4-complete-the-plan` to validate readiness
2. Only proceed to `/plan-5-phase-tasks-and-brief` after validation passes

---

## Change Footnotes Ledger

[^1]: [To be added during implementation via plan-6a]
[^2]: [To be added during implementation via plan-6a]
[^3]: [To be added during implementation via plan-6a]
[^4]: Phase 4 Tasks 4.1-4.4 — Integration tests (4 tests in 1 file)
  - `file:test/integration/workflow/features/023/central-watcher.integration.test.ts`
