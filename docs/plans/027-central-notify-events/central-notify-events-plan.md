# Central Domain Event Notification System — Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-02-02
**Spec**: [./central-notify-events-spec.md](./central-notify-events-spec.md)
**Status**: COMPLETE
**Mode**: Full
**Testing**: Full TDD (fakes only, no vi.mock())
**File Management**: PlanPak

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Critical Research Findings](#critical-research-findings)
4. [Testing Philosophy](#testing-philosophy)
5. [File Placement Manifest](#file-placement-manifest)
6. [Phase 1: Types, Interfaces, and Fakes](#phase-1-types-interfaces-and-fakes)
7. [Phase 2: Central Event Notifier Service and DI Wiring](#phase-2-central-event-notifier-service-and-di-wiring)
8. [Phase 3: Workgraph Domain Event Adapter, Debounce, and Toast](#phase-3-workgraph-domain-event-adapter-debounce-and-toast)
9. [Phase 4: Deprecation Markers and Validation](#phase-4-deprecation-markers-and-validation)
10. [Cross-Cutting Concerns](#cross-cutting-concerns)
11. [Complexity Tracking](#complexity-tracking)
12. [Progress Tracking](#progress-tracking)
13. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

The application has two independent notification systems (agents and workgraphs) with no shared
abstraction. External filesystem changes to workgraph `state.json` files never reach the browser
because the `CentralWatcherService` is not started, not in DI, and not connected to SSE broadcast.

This plan introduces a **central domain event notification system** that:
- Defines `WorkspaceDomain` as a first-class concept with an enumerated identity
- Creates `ICentralEventNotifier` with `emit()` (suppression removed — client-side `isRefreshing` guard is sufficient)
- Wires `CentralWatcherService` into web DI and bootstrap
- Bridges watcher events through a `WorkgraphDomainEventAdapter` to the central notifier
- Triggers toast notification in the workgraph detail page via the existing `onExternalChange` callback
- Deprecates `broadcastGraphUpdated()` and `AgentNotifierService` with migration guidance

**Expected outcomes**: Users editing workgraphs via CLI or external tools see automatic UI refresh
with a toast notification. Future domains can plug into the central system without reinventing
notification plumbing.

---

## Technical Context

### Current State
All components exist but are not connected at runtime:
1. `CentralWatcherService` — filesystem watcher (Plan 023), **NOT started, NOT in DI**
2. `WorkGraphWatcherAdapter` — filters for `state.json` changes, **NOT registered**
3. `broadcastGraphUpdated()` — SSE broadcast for `graph-updated` events, **NOT connected to watcher**
4. `useWorkGraphSSE` — client hook with `onExternalChange` callback, **receives no watcher events**
5. DI token `WORKSPACE_DI_TOKENS.CENTRAL_WATCHER_SERVICE` — reserved but unregistered

### Architecture Constraints
- **ADR-0004**: Decorator-free DI (`useFactory` pattern, child container isolation)
- **ADR-0007**: Notification-fetch pattern (SSE carries only IDs, client fetches via REST)
- **Callback-Set pattern**: `Set<Callback>` with `onX() -> unsubscribe` (not EventEmitter)
- **globalThis singleton**: SSEManager survives HMR via `globalThis`
- **PL-12**: Barrel exports must be wired before TDD GREEN
- **PL-13**: New DI tokens in `WORKSPACE_DI_TOKENS`
- **PL-14**: Routes use `getContainer()` from `bootstrap-singleton`

### Assumptions
- Web server is long-lived (not serverless/edge)
- One web server instance per workspace
- `onExternalChange` in `useWorkGraphSSE` fires after refresh completes
- Client-side `isRefreshing` guard in `useWorkGraphSSE` is sufficient to prevent duplicate refreshes (server-side debounce removed)

---

## Critical Research Findings

### Deduplication Log
| Final # | Sources | Merge Reason |
|---------|---------|--------------|
| 01 | I1-01, I1-02 | Phase ordering and package placement are interdependent |
| 02 | I1-06, R1-01, R1-02 | Bootstrap, async start, and HMR lifecycle are one problem |
| 03 | R1-06 | DI resolution failure is standalone critical risk |
| 04 | I1-03, I1-04, R1-04 | Notifier API design, debounce, and race conditions are one design |
| 05 | R1-05, I1-08 | SSE string mismatches and cross-feature imports are related |
| 06 | I1-07, R1-03 | Barrel export strategy and build chain breakage are one concern |
| 07 | I1-05, R1-07 | Testing strategy and test isolation are interrelated |
| 08 | R1-08 | PlanPak structure is standalone |

### Discovery 01: Phase Ordering and Package Placement (Critical)
**Sources**: I1-01, I1-02
**Affects Phases**: All

The optimal phase ordering follows the dependency direction: `packages/shared` (types) ->
`apps/web` (service + DI) -> `apps/web` + `packages/workflow` (adapter + wiring) -> cross-cutting
(deprecation). Each phase gates the next. New types in `packages/shared` must compile and export
before `apps/web` can import them.

Package placement:
| Artifact | Location | Rationale |
|----------|----------|-----------|
| `WorkspaceDomain` const + type | `packages/shared/src/features/027-central-notify-events/` | Cross-cutting identity |
| `ICentralEventNotifier` interface | `packages/shared/src/features/027-central-notify-events/` | Interface in shared (Principle 7) |
| `FakeCentralEventNotifier` | `packages/shared/src/features/027-central-notify-events/` | Fakes co-locate with interfaces |
| DI tokens | `packages/shared/src/di-tokens.ts` (extend `WORKSPACE_DI_TOKENS`) | PL-13 |
| `CentralEventNotifierService` | `apps/web/src/features/027-central-notify-events/` | Depends on SSEManager (apps/web) |
| `WorkgraphDomainEventAdapter` | `apps/web/src/features/027-central-notify-events/` | Bridges watcher to notifier |
| Debounce tracker | Inside `CentralEventNotifierService` | Co-located with emission |

### Discovery 02: Async Start and HMR Lifecycle (Critical)
**Sources**: I1-06, R1-01, R1-02
**Affects Phases**: 2, 3

`CentralWatcherService.start()` is async but the DI container and bootstrap are synchronous.
Solution: separate construction (sync, in DI) from activation (async, post-bootstrap). Use the
`globalThis` pattern (matching `sseManager`) to ensure the watcher survives HMR. Gate the start
with a flag to prevent double-start.

The `CentralEventNotifierService` is synchronous (just wraps `ISSEBroadcaster`), so it can be
registered normally in DI. The async watcher start happens via a `startCentralNotificationSystem()`
function called lazily from the first request or from `instrumentation.ts`.

### Discovery 03: DI Resolution Chain for CentralWatcherService (Critical)
**Sources**: R1-06
**Affects Phases**: 2, 3

`CentralWatcherService` has 6 constructor dependencies. Some (`IFileWatcherFactory`) are NOT
currently registered in the web DI container. Before registering the watcher in DI, all 6
dependencies must be resolvable:
1. `IWorkspaceRegistryAdapter` — likely registered
2. `IGitWorktreeResolver` — likely registered
3. `IFileSystem` — registered
4. `IFileWatcherFactory` — **NOT registered**, needs new DI token + registration
5. `registryPath: string` — computed from config
6. `ILogger` — registered

**Action**: Phase 2 must audit all 6 deps and register any missing ones before wiring the watcher.

### Discovery 04: Central Notifier API with Integrated Debounce (High)
**Sources**: I1-03, I1-04, R1-04
**Affects Phases**: 1, 2, 3

The `ICentralEventNotifier` interface should include debounce methods:
```typescript
interface ICentralEventNotifier {
  emit(domain: WorkspaceDomain, eventType: string, data: Record<string, unknown>): void;
  suppressDomain(domain: WorkspaceDomain, key: string, durationMs: number): void;
  isSuppressed(domain: WorkspaceDomain, key: string): boolean;
}
```

`suppressDomain()` sets a leading-edge suppression: the first event broadcasts immediately, then
subsequent events for the same `(domain, key)` pair are suppressed for `durationMs`. API routes
call `suppressDomain('workgraphs', graphSlug, 500)` after mutations. The adapter checks
`isSuppressed()` before calling `emit()`.

Debounce storage: `Map<string, number>` of `"domain:key" -> expiryTimestamp` with lazy cleanup.

### Discovery 05: SSE String Constants Must Be Shared (High)
**Sources**: R1-05, I1-08
**Affects Phases**: 3

The SSE channel name `'workgraphs'` and event type `'graph-updated'` are hardcoded in both server
(`sse-broadcast.ts`) and client (`use-workgraph-sse.ts`). The central notifier must emit using the
exact same strings. The safest approach: the `WorkgraphDomainEventAdapter` should call
`broadcastGraphUpdated()` directly (reusing its string constants) OR the central notifier should
map `WorkspaceDomain.Workgraphs` to channel `'workgraphs'` via a convention
(`domain.toLowerCase()`).

Since the spec says watcher events only (API route broadcasts stay as-is), the adapter should use
the central notifier's `emit()` which maps domains to channel names by convention. The channel
name for workgraphs is `WorkspaceDomain.Workgraphs` = `'workgraphs'` (the const value IS the
channel name).

### Discovery 06: Barrel Export Strategy (High)
**Sources**: I1-07, R1-03
**Affects Phases**: 1, 2

Four barrel export touch points:
1. `packages/shared/src/features/027-central-notify-events/index.ts` — new feature barrel
2. `packages/shared/src/index.ts` — re-export the feature barrel
3. `packages/shared/src/di-tokens.ts` — add `CENTRAL_EVENT_NOTIFIER` token
4. `apps/web/src/lib/di-container.ts` — register implementations

Per PL-12, barrels must be wired when creating new implementations. Per PL-11, run `pnpm build`
after barrel changes and clear `.tsbuildinfo` if phantom import errors occur.

### Discovery 07: Testing Strategy with Existing Fakes (High)
**Sources**: I1-05, R1-07
**Affects Phases**: 1, 2, 3

The testing chain uses only fakes (no `vi.mock()`):
- **Phase 1**: Contract tests for `ICentralEventNotifier` (fake and real both pass)
- **Phase 2**: `CentralEventNotifierService` tested with `FakeSSEBroadcaster`
- **Phase 3**: `WorkgraphDomainEventAdapter` tested with `FakeCentralEventNotifier`
- **Integration**: Full chain with `FakeFileWatcher` -> real adapters -> `FakeCentralEventNotifier`

Test isolation: use DI child containers per test. Never import `globalThis` singletons directly
in unit tests. Integration tests that use `globalThis` must clean up in `afterEach`.

### Discovery 08: PlanPak Feature Folder Structure (Medium)
**Sources**: R1-08
**Affects Phases**: All

Create two feature folders:
- `packages/shared/src/features/027-central-notify-events/` — types, interfaces, fakes
- `apps/web/src/features/027-central-notify-events/` — service, adapter, DI wiring

Cross-plan imports are acceptable within the same app (e.g., importing from `022-workgraph-ui/`).
Cross-package imports MUST go through barrel exports (e.g., `@chainglass/shared`, not deep paths).

---

## Testing Philosophy

### Testing Approach
- **Selected Approach**: Full TDD
- **Rationale**: CS-3 feature with cross-cutting concerns (DI, SSE, filesystem, UI); TDD ensures
  each layer works before integration
- **Focus Areas**:
  - Central event notifier: emit/subscribe contract, SSE delivery, debounce logic
  - Domain event adapters: event transformation, suppression check
  - Factory functions: correct adapter retrieval by domain name
  - Watcher-to-adapter bridge: filesystem events flow through to SSE
  - Contract tests: Fake/real parity for `ICentralEventNotifier`
- **Excluded**: E2E browser tests (manual verification for toast UI); chokidar internals (tested
  in Plan 023)

### Test-Driven Development
- **RED**: Write test first, verify it fails
- **GREEN**: Implement minimal code to pass test
- **REFACTOR**: Improve code quality while keeping tests green

### Test Documentation
Every test includes the 5-field Test Doc comment:
```typescript
/*
Test Doc:
- Why: <business/bug/regression reason>
- Contract: <plain-English invariant(s)>
- Usage Notes: <how to call/configure; gotchas>
- Quality Contribution: <what failure this catches>
- Worked Example: <inputs/outputs summarized>
*/
```

### Mock Usage
- **Policy**: Fakes only — no `vi.mock()`, `vi.spyOn()`, or Sinon stubs
- **Rationale**: Constitution Principle 4; codebase convention; drives interface design
- **Existing fakes to reuse**: `FakeSSEBroadcaster`, `FakeCentralWatcherService`,
  `FakeWatcherAdapter`, `FakeFileWatcher`, `FakeFileWatcherFactory`

---

## File Placement Manifest

| File | Classification | Location | Rationale |
|------|---------------|----------|-----------|
| `workspace-domain.ts` | plan-scoped | `packages/shared/src/features/027-central-notify-events/` | Domain enum for all packages |
| `central-event-notifier.interface.ts` | plan-scoped | `packages/shared/src/features/027-central-notify-events/` | Interface in shared (Principle 7) |
| `fake-central-event-notifier.ts` | plan-scoped | `packages/shared/src/features/027-central-notify-events/` | Fake co-located with interface |
| `index.ts` (feature barrel) | plan-scoped | `packages/shared/src/features/027-central-notify-events/` | PlanPak barrel |
| `central-event-notifier.service.ts` | plan-scoped | `apps/web/src/features/027-central-notify-events/` | Real implementation |
| `workgraph-domain-event-adapter.ts` | plan-scoped | `apps/web/src/features/027-central-notify-events/` | Domain adapter |
| `start-central-notifications.ts` | plan-scoped | `apps/web/src/features/027-central-notify-events/` | Async bootstrap helper |
| `index.ts` (feature barrel) | plan-scoped | `apps/web/src/features/027-central-notify-events/` | PlanPak barrel |
| `di-tokens.ts` | cross-cutting | `packages/shared/src/di-tokens.ts` | Add token to WORKSPACE_DI_TOKENS |
| `di-container.ts` | cross-cutting | `apps/web/src/lib/di-container.ts` | DI registration |
| `index.ts` (shared barrel) | cross-cutting | `packages/shared/src/index.ts` | Re-export feature barrel |
| Contract test file | plan-scoped | `test/contracts/central-event-notifier.contract.ts` | Contract test factory |
| Unit test files | plan-scoped | `test/unit/shared/027-central-notify-events/` | Unit tests |
| Integration test files | plan-scoped | `test/integration/027-central-notify-events/` | Integration tests |
| `instrumentation.ts` | plan-scoped | `apps/web/instrumentation.ts` | Next.js server startup hook (new file) |
| `workgraph-detail-client.tsx` | cross-plan-edit | `apps/web/app/(dashboard)/workspaces/[slug]/workgraphs/[graphSlug]/workgraph-detail-client.tsx` | Add toast callback |
| `sse-broadcast.ts` | cross-plan-edit | `apps/web/src/features/022-workgraph-ui/` | Add `@deprecated` |
| `agent-notifier.service.ts` | cross-plan-edit | `apps/web/src/features/019-agent-manager-refactor/` | Add `@deprecated` |
| `nodes/route.ts` | cross-plan-edit | `apps/web/app/api/workspaces/[slug]/workgraphs/[graphSlug]/nodes/route.ts` | Add `suppressDomain()` calls |
| `edges/route.ts` | cross-plan-edit | `apps/web/app/api/workspaces/[slug]/workgraphs/[graphSlug]/edges/route.ts` | Add `suppressDomain()` calls |

---

## Phase 1: Types, Interfaces, and Fakes

**Objective**: Define the domain event model types, `ICentralEventNotifier` interface, and
`FakeCentralEventNotifier` with contract tests — all in `packages/shared`.

**Deliverables**:
- `WorkspaceDomain` const object and type in `packages/shared`
- `ICentralEventNotifier` interface with `emit()`, `suppressDomain()`, `isSuppressed()`
- `DomainEvent` type
- `FakeCentralEventNotifier` with inspectable state
- Contract test factory for `ICentralEventNotifier`
- Feature barrel + shared barrel re-export
- DI token `CENTRAL_EVENT_NOTIFIER` in `WORKSPACE_DI_TOKENS`

**Dependencies**: None (foundational phase)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Barrel export breaks downstream build | Low | High | Run `pnpm build` after barrel changes; clear `.tsbuildinfo` if needed (PL-11) |
| Interface design needs revision later | Medium | Low | Keep interface minimal; `emit()` + debounce methods cover all ACs |

### Tasks (Full TDD)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 1.0 | [x] | Create PlanPak feature folder structure | CS-1 | Directories exist: `packages/shared/src/features/027-central-notify-events/`, `apps/web/src/features/027-central-notify-events/` | - | T000 setup |
| 1.1 | [x] | Write contract tests for `ICentralEventNotifier` | CS-2 | Tests cover: `emit()` records event, `suppressDomain()` prevents emission for key within window, `isSuppressed()` returns false after expiry, multiple domains independent. All tests fail (RED) | - | `test/contracts/central-event-notifier.contract.ts` |
| 1.2 | [x] | Create `WorkspaceDomain` const and type | CS-1 | `WorkspaceDomain.Workgraphs === 'workgraphs'`, `WorkspaceDomain.Agents === 'agents'`, type exported | - | `packages/shared/src/features/027-central-notify-events/workspace-domain.ts` |
| 1.3 | [x] | Create `DomainEvent` type and `ICentralEventNotifier` interface | CS-2 | Interface defines `emit()`, `suppressDomain()`, `isSuppressed()`. Types compile and export | - | `packages/shared/src/features/027-central-notify-events/central-event-notifier.interface.ts` |
| 1.4 | [x] | Implement `FakeCentralEventNotifier` | CS-2 | Fake passes all contract tests from 1.1 (GREEN). Exposes `emittedEvents`, `suppressions` for inspection. Includes `advanceTime(ms)` for deterministic debounce testing (no real timers). Uses injectable `now()` function defaulting to `Date.now()` | - | `packages/shared/src/features/027-central-notify-events/fake-central-event-notifier.ts` |
| 1.5 | [x] | Wire barrel exports and DI token | CS-1 | Feature barrel `index.ts` exports all. `packages/shared/src/index.ts` re-exports. `WORKSPACE_DI_TOKENS.CENTRAL_EVENT_NOTIFIER` added. `pnpm build` succeeds | - | PL-12: wire before consumers |
| 1.6 | [x] | Refactor and validate | CS-1 | All 1.1 tests pass, `pnpm typecheck` and `pnpm build` clean, `pnpm test` passes all existing tests | - | |

### Test Examples (Write First!)

```typescript
// test/contracts/central-event-notifier.contract.ts

import { WorkspaceDomain } from '@chainglass/shared';
import type { ICentralEventNotifier } from '@chainglass/shared';

export function centralEventNotifierContractTests(
  name: string,
  createNotifier: () => ICentralEventNotifier
) {
  describe(`${name} implements ICentralEventNotifier contract`, () => {
    let notifier: ICentralEventNotifier;

    beforeEach(() => {
      notifier = createNotifier();
    });

    it('should emit domain events', () => {
      /*
      Test Doc:
      - Why: Core contract — emit() must accept and forward domain events
      - Contract: emit(domain, eventType, data) records or broadcasts the event
      - Usage Notes: Data is Record<string, unknown>, kept minimal per ADR-0007
      - Quality Contribution: Catches missing broadcast calls
      - Worked Example: emit('workgraphs', 'graph-updated', {graphSlug: 'my-graph'})
      */
      notifier.emit(WorkspaceDomain.Workgraphs, 'graph-updated', { graphSlug: 'my-graph' });
      // Assertion depends on implementation (fake: check emittedEvents, real: check broadcaster)
    });

    it('should suppress events after suppressDomain()', () => {
      /*
      Test Doc:
      - Why: Debounce contract — prevent duplicate events from UI-initiated saves
      - Contract: isSuppressed() returns true within the suppression window
      - Usage Notes: Key is typically graphSlug; duration in ms
      - Quality Contribution: Prevents duplicate SSE events (AC-07)
      - Worked Example: suppress('workgraphs', 'my-graph', 500) -> isSuppressed returns true
      */
      notifier.suppressDomain(WorkspaceDomain.Workgraphs, 'my-graph', 500);
      expect(notifier.isSuppressed(WorkspaceDomain.Workgraphs, 'my-graph')).toBe(true);
    });

    it('should not suppress events for different keys', () => {
      notifier.suppressDomain(WorkspaceDomain.Workgraphs, 'graph-a', 500);
      expect(notifier.isSuppressed(WorkspaceDomain.Workgraphs, 'graph-b')).toBe(false);
    });

    it('should not suppress events for different domains', () => {
      notifier.suppressDomain(WorkspaceDomain.Workgraphs, 'my-key', 500);
      expect(notifier.isSuppressed(WorkspaceDomain.Agents, 'my-key')).toBe(false);
    });
  });
}
```

### Non-Happy-Path Coverage
- [ ] `emit()` with empty data object
- [ ] `suppressDomain()` with 0ms duration (immediate expiry)
- [ ] `isSuppressed()` after exact expiry time

### Acceptance Criteria
- [ ] `WorkspaceDomain` enum has `Workgraphs` and `Agents` members (AC-01 partial)
- [ ] `ICentralEventNotifier` interface exists with `emit()`, `suppressDomain()`, `isSuppressed()` (AC-02 partial)
- [ ] `FakeCentralEventNotifier` passes contract tests (AC-02, AC-12)
- [ ] All contract tests have Test Doc comments
- [ ] DI token registered
- [ ] `pnpm build` and `pnpm test` pass (AC-11)

---

## Phase 2: Central Event Notifier Service and DI Wiring

**Objective**: Implement `CentralEventNotifierService` in `apps/web`, register it in DI, and
prepare the bootstrap lifecycle for the watcher.

**Deliverables**:
- `CentralEventNotifierService` implementing `ICentralEventNotifier`
- DI registration in `createProductionContainer()` and `createTestContainer()`
- `startCentralNotificationSystem()` async bootstrap helper
- `CentralWatcherService` DI registration (construction only, not start)
- All missing DI dependencies for `CentralWatcherService` identified and registered

**Dependencies**: Phase 1 complete (types, interfaces, fakes, barrel exports)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `CentralWatcherService` has unregistered deps | High | High | Audit all 6 constructor params before registration (Discovery 03) |
| globalThis watcher accumulates during HMR | Medium | Medium | Gate start with `globalThis` flag (Discovery 02) |
| Async start doesn't integrate with sync bootstrap | Medium | Medium | Lazy-start pattern gated by Promise |

### Tasks (Full TDD)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 2.1 | [x] | Write unit tests for `CentralEventNotifierService` | CS-2 | Tests cover: `emit()` calls `ISSEBroadcaster.broadcast()` with correct channel/eventType/data, `suppressDomain()` prevents `emit()` for key within window, debounce expiry allows subsequent events. All fail (RED) | [📋](tasks/phase-2-central-event-notifier-service-and-di-wiring/execution.log.md#task-t001) | Uses `FakeSSEBroadcaster` [^1] |
| 2.2 | [x] | Run contract tests against `CentralEventNotifierService` | CS-1 | Wire the contract test factory from 1.1 to run against the real service (with `FakeSSEBroadcaster`). Tests fail (RED) | [📋](tasks/phase-2-central-event-notifier-service-and-di-wiring/execution.log.md#task-t002) | Contract parity [^1] |
| 2.3 | [x] | Implement `CentralEventNotifierService` | CS-3 | All unit tests from 2.1 pass. All contract tests from 2.2 pass (GREEN). Service maps `WorkspaceDomain` to SSE channel names | [📋](tasks/phase-2-central-event-notifier-service-and-di-wiring/execution.log.md#task-t003) | `apps/web/src/features/027-central-notify-events/central-event-notifier.service.ts` [^2] |
| 2.4 | [x] | Audit and register `CentralWatcherService` DI dependencies | CS-2 | All 6 constructor deps resolvable: (1) `IWorkspaceRegistryAdapter` via `WORKSPACE_DI_TOKENS.WORKSPACE_REGISTRY_ADAPTER`, (2) `IGitWorktreeResolver` via `WORKSPACE_DI_TOKENS.GIT_WORKTREE_RESOLVER`, (3) `IFileSystem` via `SHARED_DI_TOKENS.FILESYSTEM`, (4) `IFileWatcherFactory` — add `FILE_WATCHER_FACTORY: 'IFileWatcherFactory'` to `WORKSPACE_DI_TOKENS` in `packages/shared/src/di-tokens.ts` and register `ChokidarFileWatcherFactory` from `packages/workflow/src/adapters/chokidar-file-watcher.adapter.ts`, (5) `registryPath` string computed from config, (6) `ILogger` via `SHARED_DI_TOKENS.LOGGER`. Test resolves `CentralWatcherService` without throwing | [📋](tasks/phase-2-central-event-notifier-service-and-di-wiring/execution.log.md#task-t004) | Cross-cutting: `packages/shared/src/di-tokens.ts`, `apps/web/src/lib/di-container.ts` [^3] |
| 2.5 | [x] | Register `CentralEventNotifierService` in DI | CS-2 | `createProductionContainer()` registers real service. `createTestContainer()` registers fake. Both resolvable by token | [📋](tasks/phase-2-central-event-notifier-service-and-di-wiring/execution.log.md#task-t005) | `apps/web/src/lib/di-container.ts` [^3] |
| 2.6 | [x] | Write `startCentralNotificationSystem()` bootstrap helper | CS-2 | Async function: (1) resolves `CentralWatcherService` and `CentralEventNotifierService` from DI via `getContainer()`, (2) creates `WorkgraphDomainEventAdapter(notifier)`, (3) calls `watcher.registerAdapter(workgraphWatcherAdapter)`, (4) subscribes `workgraphWatcherAdapter.onGraphChanged()` to adapter's handler, (5) calls `watcher.start()`. Gates with `globalThis.centralWatcherStarted = true` to prevent double-start. Unit test verifies single-start idempotency | [📋](tasks/phase-2-central-event-notifier-service-and-di-wiring/execution.log.md#task-t006) | `apps/web/src/features/027-central-notify-events/start-central-notifications.ts` [^4] |
| 2.7 | [x] | Wire barrel exports for apps/web feature | CS-1 | Feature barrel exports all new modules. `pnpm build` succeeds | [📋](tasks/phase-2-central-event-notifier-service-and-di-wiring/execution.log.md#task-t007) | PL-12 [^4] |
| 2.8 | [x] | Refactor and validate | CS-1 | All tests pass, `pnpm typecheck` clean, `pnpm build` clean, `pnpm test` passes all existing + new tests | [📋](tasks/phase-2-central-event-notifier-service-and-di-wiring/execution.log.md#task-t008) | 2749 tests pass |

### Test Examples

```typescript
// test/unit/web/027-central-notify-events/central-event-notifier.service.test.ts

import { FakeSSEBroadcaster } from '@chainglass/shared';
import { CentralEventNotifierService } from
  '@/features/027-central-notify-events/central-event-notifier.service';
import { WorkspaceDomain } from '@chainglass/shared';

describe('CentralEventNotifierService', () => {
  let broadcaster: FakeSSEBroadcaster;
  let notifier: CentralEventNotifierService;

  beforeEach(() => {
    broadcaster = new FakeSSEBroadcaster();
    notifier = new CentralEventNotifierService(broadcaster);
  });

  it('should broadcast emit() to correct SSE channel', () => {
    /*
    Test Doc:
    - Why: Core delivery — emit() must reach SSE clients on the correct channel
    - Contract: emit('workgraphs', 'graph-updated', data) calls broadcaster.broadcast('workgraphs', 'graph-updated', data)
    - Usage Notes: Channel name equals WorkspaceDomain value
    - Quality Contribution: Catches channel routing bugs
    - Worked Example: emit(Workgraphs, 'graph-updated', {graphSlug:'g1'}) -> broadcast('workgraphs','graph-updated',{graphSlug:'g1'})
    */
    notifier.emit(WorkspaceDomain.Workgraphs, 'graph-updated', { graphSlug: 'g1' });

    expect(broadcaster.broadcasts).toHaveLength(1);
    expect(broadcaster.broadcasts[0]).toEqual({
      channel: 'workgraphs',
      eventType: 'graph-updated',
      data: { graphSlug: 'g1' },
    });
  });

  it('should broadcast emit() with correct eventType', () => {
    /*
    Test Doc:
    - Why: Core delivery — eventType must be forwarded to broadcaster
    - Contract: emit('workgraphs', 'graph-updated', data) passes eventType through
    - Usage Notes: eventType is opaque string, not validated by notifier
    - Quality Contribution: Catches eventType routing bugs
    - Worked Example: emit(Workgraphs, 'graph-updated', {graphSlug:'g1'}) -> broadcast eventType='graph-updated'
    */
    notifier.emit(WorkspaceDomain.Workgraphs, 'graph-updated', { graphSlug: 'g1' });

    expect(broadcaster.broadcasts[0].eventType).toBe('graph-updated');
  });
});
```

### Non-Happy-Path Coverage
- [ ] `startCentralNotificationSystem()` called twice (idempotent)
- [ ] DI resolution with missing dependency (throws meaningful error)

### Acceptance Criteria
- [ ] `CentralEventNotifierService` passes all contract tests from Phase 1 (AC-02)
- [ ] Service registered in web DI container (AC-03)
- [ ] `CentralWatcherService` registered in web DI container (AC-04 partial — registered but not started)
- [ ] Bootstrap helper can start the notification system (AC-03, AC-04)
- [ ] All tests pass (AC-11, AC-12)
- [ ] ADR-0004 constraints respected (useFactory, child container isolation)

---

## Phase 3: Workgraph Domain Event Adapter and Toast

**Objective**: Bridge filesystem watcher events through the `WorkgraphDomainEventAdapter` to the
central notifier, remove unused suppression infrastructure from Phases 1-2, wire toast notification in the UI.

**Deliverables**:
- `WorkgraphDomainEventAdapter` that receives `WorkGraphChangedEvent` and emits via central notifier
- Remove suppression code (`suppressDomain`, `isSuppressed`, `extractSuppressionKey`) from interface, service, fake, and tests
- `startCentralNotificationSystem()` called at server boot
- Toast notification in workgraph detail page via `onExternalChange`
- Integration test: filesystem change -> SSE event

**Dependencies**: Phase 2 complete (notifier service in DI, watcher registered)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| SSE channel/event strings mismatch | Medium | High | Use `WorkspaceDomain.Workgraphs` as channel name; verify against existing `use-workgraph-sse.ts` filter |
| Watcher not started before first filesystem change | Medium | Medium | Start watcher eagerly in `instrumentation.ts` or lazily on first SSE route request |
| Duplicate SSE on UI-initiated save | Low | Low | Client-side `isRefreshing` guard in `useWorkGraphSSE` already deduplicates (server-side suppression removed) |

### Tasks (Full TDD)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 3.1 | [x] | Write unit tests for `WorkgraphDomainEventAdapter` | CS-2 | Tests cover: receives `WorkGraphChangedEvent` -> calls `notifier.emit()` with correct domain/eventType/graphSlug; multiple events emit in order; data contains only graphSlug (ADR-0007). All fail (RED) | - | Uses `FakeCentralEventNotifier` |
| 3.2 | [x] | Implement `WorkgraphDomainEventAdapter` | CS-2 | All unit tests from 3.1 pass (GREEN). Adapter extends `DomainEventAdapter<WorkGraphChangedEvent>` base class, calls `emit()` | - | Base class in `packages/shared`, concrete in `apps/web` |
| 3.3 | [x] | Remove suppression code from Phases 1-2 | CS-2 | Remove `suppressDomain()`, `isSuppressed()` from `ICentralEventNotifier` interface, `CentralEventNotifierService`, `FakeCentralEventNotifier`. Delete `extract-suppression-key.ts`. Remove suppression-related contract tests (C02-C05, C07-C08) and unit tests (U04-U08). Remove companion tests B02-B03. Update barrels. All remaining tests pass | - | Client-side `isRefreshing` guard is sufficient |
| 3.4 | [x] | Wire `startCentralNotificationSystem()` into server boot | CS-2 | Create `apps/web/instrumentation.ts` with an exported `register()` function (Next.js server startup hook). Inside `register()`, import and call `startCentralNotificationSystem()` from `@/features/027-central-notify-events/start-central-notifications`. The function resolves watcher + notifier from DI via `getContainer()`, registers the workgraph adapter, calls `watcher.start()`, and gates with `globalThis.centralWatcherStarted` flag. `instrumentation.ts` does NOT currently exist — create it | - | Cross-cutting: new file `apps/web/instrumentation.ts` |
| 3.5 | [x] | Write integration test: filesystem change -> notifier emit | CS-3 | Full chain test: `FakeFileWatcher.simulateChange('state.json')` -> `CentralWatcherService.dispatchEvent()` -> `WorkGraphWatcherAdapter` -> `WorkgraphDomainEventAdapter` -> `FakeCentralEventNotifier.emittedEvents` contains `{domain:'workgraphs', eventType:'graph-updated', data:{graphSlug:'test-graph'}}` | - | Uses fakes at boundaries only |
| 3.6 | [x] | Add toast notification to workgraph detail page | CS-1 | In `apps/web/app/(dashboard)/workspaces/[slug]/workgraphs/[graphSlug]/workgraph-detail-client.tsx`, the component already has a custom toast pattern using `useState<string \| null>` (line ~40) with `setToast()` and a timed dismiss via `setTimeout(() => setToast(null), 3000)` (lines ~103-104, ~170-174). Wire the `onExternalChange` callback in `useWorkGraphSSE` to call `setToast('Graph updated from external change')`. No new toast library needed — reuse existing inline toast UI | - | Cross-plan-edit: existing custom toast pattern, no new deps |
| 3.7 | [x] | Refactor and validate | CS-1 | All tests pass, `pnpm typecheck` clean, `pnpm build` clean, manual test: filesystem change -> SSE event -> toast | - | Manual verification for AC-06, AC-08 |

### Test Examples

```typescript
// test/unit/web/027-central-notify-events/workgraph-domain-event-adapter.test.ts

import { FakeCentralEventNotifier, WorkspaceDomain } from '@chainglass/shared';
import { WorkgraphDomainEventAdapter } from
  '@/features/027-central-notify-events/workgraph-domain-event-adapter';

describe('WorkgraphDomainEventAdapter', () => {
  let notifier: FakeCentralEventNotifier;
  let adapter: WorkgraphDomainEventAdapter;

  beforeEach(() => {
    notifier = new FakeCentralEventNotifier();
    adapter = new WorkgraphDomainEventAdapter(notifier);
  });

  it('should emit graph-updated event when watcher fires', () => {
    /*
    Test Doc:
    - Why: AC-05 — adapter transforms watcher events into domain events
    - Contract: onGraphChanged({graphSlug}) -> emit(Workgraphs, 'graph-updated', {graphSlug})
    - Usage Notes: Adapter subscribes to WorkGraphWatcherAdapter.onGraphChanged()
    - Quality Contribution: Catches broken watcher-to-notifier bridge
    - Worked Example: graphChanged({graphSlug:'g1'}) -> emittedEvents [{domain:'workgraphs', eventType:'graph-updated', data:{graphSlug:'g1'}}]
    */
    adapter.handleGraphChanged({ graphSlug: 'g1', worktreePath: '/tmp', workspaceSlug: 'ws1' });

    expect(notifier.emittedEvents).toHaveLength(1);
    expect(notifier.emittedEvents[0]).toEqual({
      domain: WorkspaceDomain.Workgraphs,
      eventType: 'graph-updated',
      data: { graphSlug: 'g1' },
    });
  });

  it('should emit only graphSlug in event data (ADR-0007)', () => {
    /*
    Test Doc:
    - Why: ADR-0007 — minimal payload, client fetches state via REST
    - Contract: event data contains only { graphSlug }, no extra fields
    - Usage Notes: WorkGraphChangedEvent has many fields, adapter extracts only graphSlug
    - Quality Contribution: Prevents data leakage into SSE payloads
    - Worked Example: graphChanged({graphSlug:'g1', worktreePath:'/tmp', ...}) -> data is exactly {graphSlug:'g1'}
    */
    adapter.handleGraphChanged({ graphSlug: 'g1', worktreePath: '/tmp', workspaceSlug: 'ws1' });

    expect(notifier.emittedEvents[0].data).toEqual({ graphSlug: 'g1' });
  });
});
```

### Non-Happy-Path Coverage
- [ ] `handleGraphChanged` with undefined graphSlug
- [ ] `startCentralNotificationSystem()` when watcher deps are unavailable (graceful error)
- [ ] SSE connection not yet established when event fires (event is fire-and-forget)

### Acceptance Criteria
- [ ] Workgraph domain event adapter transforms watcher events to domain events (AC-05)
- [ ] Filesystem change to `state.json` produces `graph-updated` SSE event (AC-06)
- [ ] Workgraph detail page shows toast on external change (AC-08)
- [ ] Domain event adapters can emit for any reason, not just filesystem (AC-13)
- [ ] Suppression code removed from Phases 1-2 (interface, service, fake, tests, shared utility)
- [ ] All tests pass (AC-11, AC-12)

---

## Phase 4: Deprecation Markers and Validation

**Objective**: Mark existing ad-hoc notification code as deprecated, validate the full system,
and create the documentation guide.

**Deliverables**:
- `@deprecated` JSDoc on `broadcastGraphUpdated()`
- `@deprecated` JSDoc on `AgentNotifierService`
- Validation that all existing tests still pass
- Documentation guide in `docs/how/`

**Dependencies**: Phase 3 complete (full system functional)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Deprecation changes break barrel exports | Low | High | Add JSDoc only, do not remove or rename exports |
| Existing tests import deprecated code | None | None | `@deprecated` is advisory only |

### Tasks

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 4.1 | [x] | Add `@deprecated` to `broadcastGraphUpdated()` | CS-1 | JSDoc `@deprecated Use WorkgraphDomainEventAdapter via CentralEventNotifierService instead` added. Function still works. Tests pass | - | AC-09. `apps/web/src/features/022-workgraph-ui/sse-broadcast.ts` |
| 4.2 | [x] | Add `@deprecated` to `AgentNotifierService` | CS-1 | JSDoc `@deprecated Future migration to domain event adapters via CentralEventNotifierService` added. Service still works. Tests pass | - | AC-10. `apps/web/src/features/019-agent-manager-refactor/agent-notifier.service.ts` |
| 4.3 | [x] | Run full quality gate | CS-1 | `just check` passes (lint, typecheck, test). All 2711+ existing tests pass. Build succeeds | - | AC-11 |
| 4.4 | [x] | Create documentation guide | CS-2 | `docs/how/central-events/1-architecture.md`: system overview, how to add a new domain adapter, deprecation migration path. Target audience: developers adding new domains | - | Documentation Strategy: docs/how/ only |
| 4.5 | [x] | Final validation and cleanup | CS-1 | Manual test: edit `state.json` from terminal -> browser shows toast. Remove any debug code. Update plan status to COMPLETE | - | AC-06, AC-08 manual verification |

### Acceptance Criteria
- [x] `broadcastGraphUpdated()` marked `@deprecated` (AC-09)
- [x] `AgentNotifierService` marked `@deprecated` (AC-10)
- [x] All existing tests pass (AC-11) — 2736 tests pass, 0 failures
- [x] Documentation created in `docs/how/central-events/`
- [x] Manual verification of end-to-end flow

---

## Cross-Cutting Concerns

### Security Considerations
- No new external inputs; all events originate from filesystem changes or internal API routes
- SSE channel names are not user-controlled
- No sensitive data in SSE payloads (only `graphSlug`, per ADR-0007)

### Observability
- `CentralEventNotifierService.emit()` should log at DEBUG level: domain, eventType
- Watcher start/stop lifecycle logged at INFO level
- Errors in adapter chain logged at ERROR level with stack trace

### Documentation
- **Location**: `docs/how/central-events/1-architecture.md`
- **Content**: System overview (notifier, adapters, watcher bridge), how to add a new domain
  adapter (step-by-step), deprecation migration path, SSE channel conventions
- **Target audience**: Developers adding new workspace data domains
- **Maintenance**: Update when new domains are added or deprecated code is removed

---

## Complexity Tracking

| Component | CS | Label | Breakdown (S,I,D,N,F,T) | Justification | Mitigation |
|-----------|-----|-------|------------------------|---------------|------------|
| CentralEventNotifierService | CS-3 | Medium | S=1,I=0,D=1,N=1,F=0,T=1 | New service with debounce logic, DI wiring, SSE integration | Follow AgentNotifierService reference pattern |
| WorkgraphDomainEventAdapter | CS-2 | Small | S=1,I=0,D=0,N=1,F=0,T=1 | Bridges two existing systems with suppression check | Thin adapter, minimal logic |
| DI Wiring + Bootstrap | CS-3 | Medium | S=2,I=0,D=1,N=1,F=0,T=1 | 6-dep watcher registration, async start, globalThis lifecycle | Audit deps before registration; gate with globalThis |

---

## Progress Tracking

### Phase Completion Checklist
- [x] Phase 1: Types, Interfaces, and Fakes — COMPLETE
- [x] Phase 2: Central Event Notifier Service and DI Wiring — COMPLETE
- [x] Phase 3: Workgraph Domain Event Adapter and Toast — COMPLETE
- [x] Phase 4: Deprecation Markers and Validation — COMPLETE

### STOP Rule
**IMPORTANT**: This plan must be complete before creating tasks. After writing this plan:
1. Run `/plan-4-complete-the-plan` to validate readiness
2. Only proceed to `/plan-5-phase-tasks-and-brief` after validation passes

---

## ADR Ledger

| ADR | Status | Affects Phases | Notes |
|-----|--------|----------------|-------|
| ADR-0004 (DI Architecture) | Accepted | 1, 2 | `useFactory` pattern, child container isolation, token naming |
| ADR-0007 (SSE Routing) | Accepted | 2, 3 | Notification-fetch pattern, single channel per domain |
| ADR-0008 (Workspace Storage) | Accepted | 3 | Data path structure for workgraph detection |
| ADR-0009 (Module Registration) | Accepted | 2 | `registerXxxServices()` pattern for DI composition |

No new ADR is recommended — the central event notifier follows established patterns (thin wrapper
over `ISSEBroadcaster` with domain routing, matching `AgentNotifierService`).

---

## Deviation Ledger

| Principle Violated | Why Needed | Simpler Alternative Rejected | Risk Mitigation |
|-------------------|------------|------------------------------|-----------------|
| _(none — debounce deviation removed)_ | Server-side suppression (`suppressDomain`, `isSuppressed`, `extractSuppressionKey`) was removed. Client-side `isRefreshing` guard in `useWorkGraphSSE` provides sufficient deduplication | — | — |

---

## Change Footnotes Ledger

[^1]: Phase 2 T001/T002 - Unit tests and contract tests
  - `file:test/unit/web/027-central-notify-events/central-event-notifier.service.test.ts`
  - `file:test/contracts/central-event-notifier.contract.test.ts`

[^2]: Phase 2 T003 - CentralEventNotifierService + shared extractSuppressionKey
  - `class:apps/web/src/features/027-central-notify-events/central-event-notifier.service.ts:CentralEventNotifierService`
  - `function:packages/shared/src/features/027-central-notify-events/extract-suppression-key.ts:extractSuppressionKey`

[^3]: Phase 2 T004/T005 - DI wiring (tokens + container registrations)
  - `file:packages/shared/src/di-tokens.ts`
  - `file:apps/web/src/lib/di-container.ts`

[^4]: Phase 2 T006/T007 - Bootstrap helper + barrel exports
  - `function:apps/web/src/features/027-central-notify-events/start-central-notifications.ts:startCentralNotificationSystem`
  - `file:apps/web/src/features/027-central-notify-events/index.ts`
