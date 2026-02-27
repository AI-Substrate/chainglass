# GlobalStateSystem Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-02-26
**Spec**: [global-state-system-spec.md](./global-state-system-spec.md)
**Mode**: Full
**Status**: IN PROGRESS

## Progress

| Phase | Status | Tasks | ACs |
|-------|--------|-------|-----|
| Phase 1: Types, Interface & Path Engine | ✅ Complete | 6/6 | 8/8 |
| Phase 2: TDD — Path Engine & Contract Tests | ✅ Complete | 3/3 | 2/2 |
| Phase 3: Implementation + Fake | ✅ Complete | 4/4 | 23/23 |
| Phase 4: React Integration | ⬜ Not Started | 0/6 | 0/6 |
| Phase 5: Worktree Exemplar | ⬜ Not Started | 0/6 | 0/4 |
| Phase 6: Documentation & Quality Gate | ⬜ Not Started | 0/3 | 0/1 |

### Change Log

| Date | Phase | Domain | Changes |
|------|-------|--------|---------|
| 2026-02-26 | Phase 1 | `_platform/state` | Created: types.ts, state.interface.ts, path-parser.ts, path-matcher.ts, tokens.ts, index.ts. Modified: packages/shared/package.json (added ./state export). Domain docs updated (source locations + history). |
| 2026-02-27 | Phase 2 | `_platform/state` | Created: path-parser.test.ts (25 tests), path-matcher.test.ts (22 tests), state-system.contract.ts (19 contract cases). |
| 2026-02-27 | Phase 3 | `_platform/state` | Created: global-state-system.test.ts (31 unit tests), fake-state-system.ts (FakeGlobalStateSystem + inspection methods), global-state-system.ts (GlobalStateSystem real impl), state-system.contract.test.ts (runner, 44 contract tests pass). Modified: fakes/index.ts (added FakeGlobalStateSystem export). |

### Domain Impact

- `_platform/state`: New contracts created (IStateService, StateChange, StateEntry, StateDomainDescriptor, parsePath, createStateMatcher, STATE_DI_TOKENS). All exported via `@chainglass/shared/state`.
- `docs/domains/domain-map.md`: Already updated during domain extraction (pre-plan).
- No new domain edges needed yet — consumer wiring happens in Phases 4-5.

## Summary

Runtime state in Chainglass is scattered across ad-hoc React hooks, SSE connections, and polling intervals. This plan implements a centralized, ephemeral runtime state registry (`_platform/state` domain) with colon-delimited hierarchical paths, pattern-based subscriptions, and React hooks — composing proven patterns from FileChangeHub, SettingsStore, and the DI container. A real worktree state exemplar demonstrates end-to-end publisher + consumer wiring.

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| `_platform/state` | new (docs exist) | **create** | New domain — all state system infrastructure |
| `_platform/events` | existing | consume | FileChangeHub events for worktree exemplar publisher |
| `_platform/sdk` | existing | consume | Pattern exemplar (useSDKSetting DX) |
| `_platform/panel-layout` | existing | modify (minor) | Worktree exemplar consumer in left panel subtitle |
| `file-browser` | existing | modify (minor) | Wire GlobalStateConnector + worktree publisher in browser-client |

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `packages/shared/src/interfaces/state.interface.ts` | `_platform/state` | contract | IStateService interface |
| `packages/shared/src/state/types.ts` | `_platform/state` | contract | StateChange, StateEntry, StateDomainDescriptor, StateChangeCallback |
| `packages/shared/src/state/path-matcher.ts` | `_platform/state` | internal | createStateMatcher() for colon-delimited patterns |
| `packages/shared/src/state/path-parser.ts` | `_platform/state` | internal | parsePath() → ParsedPath |
| `packages/shared/src/state/tokens.ts` | `_platform/state` | contract | STATE_DI_TOKENS |
| `packages/shared/src/state/index.ts` | `_platform/state` | contract | Barrel exports |
| `packages/shared/src/fakes/fake-state-system.ts` | `_platform/state` | contract | FakeGlobalStateSystem test double |
| `packages/shared/package.json` | `_platform/state` | internal | Add `./state` export entry |
| `apps/web/src/lib/state/global-state-system.ts` | `_platform/state` | internal | GlobalStateSystem implementation |
| `apps/web/src/lib/state/state-provider.tsx` | `_platform/state` | contract | GlobalStateProvider + useStateSystem |
| `apps/web/src/lib/state/use-global-state.ts` | `_platform/state` | contract | useGlobalState<T> hook |
| `apps/web/src/lib/state/use-global-state-list.ts` | `_platform/state` | contract | useGlobalStateList hook |
| `apps/web/src/lib/state/state-connector.tsx` | `_platform/state` | internal | GlobalStateConnector wiring component |
| `apps/web/src/lib/state/index.ts` | `_platform/state` | contract | App-side barrel exports |
| `apps/web/src/components/providers.tsx` | `_platform/state` | cross-domain | Mount GlobalStateProvider after SDKProvider |
| `apps/web/src/features/041-file-browser/state/register.ts` | `file-browser` | internal | registerWorktreeState() domain registration |
| `apps/web/src/features/041-file-browser/state/worktree-publisher.ts` | `file-browser` | internal | Worktree state publisher (file count, branch) |
| `apps/web/src/features/041-file-browser/components/worktree-state-subtitle.tsx` | `file-browser` | internal | Consumer component using useGlobalState |
| `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | `file-browser` | cross-domain | Wire GlobalStateConnector + publisher |
| `test/contracts/state-system.contract.ts` | `_platform/state` | contract | Contract test factory |
| `test/contracts/state-system.contract.test.ts` | `_platform/state` | internal | Contract test runner (real + fake) |
| `test/unit/web/state/global-state-system.test.ts` | `_platform/state` | internal | Unit tests |
| `test/unit/web/state/path-matcher.test.ts` | `_platform/state` | internal | Path matcher unit tests |
| `test/unit/web/state/path-parser.test.ts` | `_platform/state` | internal | Path parser unit tests |
| `test/unit/web/state/use-global-state.test.tsx` | `_platform/state` | internal | Hook tests |
| `test/unit/web/state/use-global-state.test.tsx` | `_platform/state` | internal | Hook tests |
| `test/unit/web/state/worktree-publisher.test.ts` | `file-browser` | internal | Worktree publisher tests |
| `docs/how/global-state-system.md` | `_platform/state` | contract | Developer guide |
| `docs/domains/_platform/state/domain.md` | `_platform/state` | contract | Domain docs update |

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | `packages/shared/package.json` has no `./state` export entry. Import will fail in production (webpack uses package.json exports, not tsconfig paths). | Add export entry in Phase 1 before any imports. |
| 02 | Critical | No pre-existing GlobalState or state domain code — clean slate. All 8 components are genuinely new. FileChangeHub + SettingsStore serve as reference architecture. | Compose from proven patterns; don't reinvent. |
| 03 | High | FileChangeProvider is mounted in BrowserClient (page-level). GlobalStateProvider must be app-level (providers.tsx). A bridge component is needed to subscribe to FileChangeHub and publish to state system. | Create `WorktreeStatePublisher` component that sits inside FileChangeProvider, subscribes to hub, publishes to state. |
| 04 | High | `list()` must return stable array references for useSyncExternalStore. Implementation needs version-counter caching pattern (proven in SettingsStore). | Copy SettingsStore.get() stable-reference pattern. Cache list results with version invalidation. |
| 05 | High | LeftPanel accepts `subtitle` prop as JSX. Worktree state consumer should be a `<WorktreeStateSubtitle>` component passed as subtitle. browser-client.tsx is `'use client'` so hooks work. | Create thin wrapper component, pass as subtitle prop. |
| 06 | High | `packages/shared/src/fakes/` directory exists with 13 test doubles. FakeGlobalStateSystem should follow the same pattern (implement interface + add inspection methods). | Follow FakeFileChangeHub and FakeUSDK patterns exactly. |

---

## Phases

### Phase 1: Types, Interface & Path Engine

**Objective**: Define the public API surface and path matching engine in packages/shared
**Domain**: `_platform/state`
**Delivers**:
- IStateService interface
- All value types (StateChange, StateEntry, StateDomainDescriptor, etc.)
- Path parser (parsePath)
- Path matcher (createStateMatcher) with all 5 pattern types
- DI tokens
- Barrel exports + package.json export entry
**Depends on**: None
**Key risks**: Export entry must be added to package.json before any consumer can import (Finding 01)

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 1.1 | Create `packages/shared/src/state/types.ts` with StateChange, StateEntry, StateDomainDescriptor, StatePropertyDescriptor, StateChangeCallback, ParsedPath | `_platform/state` | Types compile, exported from barrel | |
| 1.2 | Create `packages/shared/src/interfaces/state.interface.ts` with IStateService | `_platform/state` | Interface includes publish, subscribe, get, list, remove, removeInstance, registerDomain, listDomains, listInstances, subscriberCount, entryCount | Per Workshop 001 API |
| 1.3 | Create `packages/shared/src/state/path-parser.ts` with parsePath() | `_platform/state` | Parses 2 and 3 segment paths; rejects 4+ with descriptive error; validates segment format | AC-11, AC-12, AC-15. DYK-01: 5-segment dropped. |
| 1.4 | Create `packages/shared/src/state/path-matcher.ts` with createStateMatcher() | `_platform/state` | All 5 patterns: exact, domain wildcard, instance wildcard, domain-all, global | AC-16 through AC-20 |
| 1.5 | Create `packages/shared/src/state/tokens.ts` with STATE_DI_TOKENS | `_platform/state` | Token for IStateService resolution | |
| 1.6 | Create `packages/shared/src/state/index.ts` barrel + add `./state` export to package.json | `_platform/state` | `import { IStateService } from '@chainglass/shared/state'` resolves in both dev and build | Per Finding 01 |

### Acceptance Criteria (Phase 1)
- [x] AC-11: Paths use colon-delimited segments
- [x] AC-12: Path segments validated
- [x] AC-15: Paths have 2 or 3 segments only
- [x] AC-16: Exact pattern matching
- [x] AC-17: Domain wildcard matching
- [x] AC-18: Instance wildcard matching
- [x] AC-19: Domain-all matching
- [x] AC-20: Global wildcard matching

---

### Phase 2: TDD — Path Engine & Contract Tests

**Objective**: Write all tests for path parsing, pattern matching, and define the contract test suite
**Domain**: `_platform/state`
**Delivers**:
- Path parser unit tests (all segment counts, validation, error cases)
- Path matcher unit tests (all 5 pattern types, decision table)
- Contract test factory (globalStateContractTests) defining behavioral expectations
**Depends on**: Phase 1
**Key risks**: None — pure function testing

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2.1 | Create `test/unit/web/state/path-parser.test.ts` — TDD tests for parsePath() | `_platform/state` | Tests for 2 and 3 segments; rejects 4+; invalid segment format; empty segments | RED first, then implement |
| 2.2 | Create `test/unit/web/state/path-matcher.test.ts` — TDD tests for createStateMatcher() | `_platform/state` | Tests for all 5 pattern types; decision table from Workshop 001 | RED first, then implement |
| 2.3 | Create `test/contracts/state-system.contract.ts` — contract test factory | `_platform/state` | `globalStateContractTests(name, factory)` covers: publish/get, subscribe/unsubscribe, error isolation, store-first ordering, remove, removeInstance, domain registration, list, listInstances | Per QT-01 pattern |

### Acceptance Criteria (Phase 2)
- [x] AC-34: Contract tests defined (will run in Phase 3)
- [x] AC-35: Path parser and matcher have unit tests

---

### Phase 3: Implementation + Fake

**Objective**: Build GlobalStateSystem (real) and FakeGlobalStateSystem (fake), both passing contract tests
**Domain**: `_platform/state`
**Delivers**:
- GlobalStateSystem class implementing IStateService
- FakeGlobalStateSystem with inspection methods
- Contract tests passing for both
- Unit tests for store operations
**Depends on**: Phase 1, Phase 2
**Key risks**: Stable reference caching for list() (Finding 04)

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 3.1 | Create `test/unit/web/state/global-state-system.test.ts` — TDD unit tests for store operations | `_platform/state` | RED tests for publish, get, subscribe, remove, removeInstance, registerDomain, listDomains, listInstances, subscriberCount, entryCount, error isolation, store-first ordering, stable refs | AC-01 through AC-10, AC-22 through AC-26, AC-36, AC-37. RED first. |
| 3.2 | Create `packages/shared/src/fakes/fake-state-system.ts` — FakeGlobalStateSystem | `_platform/state` | Implements IStateService + getPublished(), getSubscribers(), wasPublishedWith(), reset() | Per Finding 06, AC-33 |
| 3.3 | Create `apps/web/src/lib/state/global-state-system.ts` — IStateService implementation | `_platform/state` | Map-based store, subscriber dispatch, error isolation, store-first ordering, stable refs for get(), version-counter caching for list(). All tests from 3.1 pass GREEN. | Per Finding 04, PL-01, PL-07 |
| 3.4 | Create `test/contracts/state-system.contract.test.ts` — run contract tests against both | `_platform/state` | Both real and fake pass identical contract test suite. Depends on 3.2 and 3.3. | AC-34 |

### Acceptance Criteria (Phase 3)
- [ ] AC-01: publish stores + notifies
- [ ] AC-02: get returns value or undefined
- [ ] AC-03: get returns stable references
- [ ] AC-04: remove notifies with removed flag
- [ ] AC-05: removeInstance removes all entries
- [ ] AC-06: registerDomain registers descriptor
- [ ] AC-07: Duplicate registerDomain throws
- [ ] AC-08: publish to unregistered domain throws
- [ ] AC-09: listDomains returns descriptors
- [ ] AC-10: listInstances returns IDs
- [ ] AC-13: Singleton with instance ID throws
- [ ] AC-14: Multi-instance without instance ID throws
- [ ] AC-21: subscribe returns unsubscribe fn
- [ ] AC-22: Error isolation
- [ ] AC-23: StateChange shape
- [ ] AC-24: Store-first ordering
- [ ] AC-25: list returns matching entries
- [ ] AC-26: list returns stable array ref
- [ ] AC-33: FakeGlobalStateSystem with inspection methods
- [ ] AC-34: Contract tests pass for both real and fake
- [ ] AC-35: Unit tests for all core operations
- [ ] AC-36: subscriberCount
- [ ] AC-37: entryCount

---

### Phase 4: React Integration

**Objective**: Build React hooks and provider, mount in component tree
**Domain**: `_platform/state`
**Delivers**:
- useGlobalState<T> hook
- useGlobalStateList hook
- GlobalStateProvider + useStateSystem
- Mounted in providers.tsx (after SDKProvider)
- Hook tests
**Depends on**: Phase 3
**Key risks**: Bootstrap error must not crash (PL-13)

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 4.1 | Create `apps/web/src/lib/state/use-global-state.ts` — single-value hook | `_platform/state` | useSyncExternalStore pattern, default value support, re-renders on change | AC-27, AC-28 |
| 4.2 | Create `apps/web/src/lib/state/use-global-state-list.ts` — pattern hook | `_platform/state` | Pattern subscription, stable array ref, re-renders on matching change | AC-29 |
| 4.3 | Create `apps/web/src/lib/state/state-provider.tsx` — GlobalStateProvider + useStateSystem | `_platform/state` | useState initializer, try/catch fallback, context throw on missing provider | AC-30, AC-31, AC-32 |
| 4.4 | Create `apps/web/src/lib/state/index.ts` — barrel exports | `_platform/state` | All hooks, provider, and types exported | |
| 4.5 | Mount GlobalStateProvider in `apps/web/src/components/providers.tsx` after SDKProvider | `_platform/state` | Provider wraps children, no render regressions | Per Finding 03 |
| 4.6 | Create `test/unit/web/state/use-global-state.test.tsx` — hook tests | `_platform/state` | Tests with FakeGlobalStateSystem injection, default values, re-render on change | |

### Acceptance Criteria (Phase 4)
- [ ] AC-27: useGlobalState returns value, re-renders on change
- [ ] AC-28: useGlobalState returns default when no value published
- [ ] AC-29: useGlobalStateList returns matching entries, re-renders on change
- [ ] AC-30: GlobalStateProvider creates system once
- [ ] AC-31: Graceful degradation on bootstrap error
- [ ] AC-32: useStateSystem throws outside provider

---

### Phase 5: Worktree Exemplar

**Objective**: Build a real worktree state domain with publisher (file changes, git branch) and consumer (left panel subtitle), demonstrating end-to-end state flow
**Domain**: `file-browser` (publisher), `_platform/panel-layout` (consumer)
**Delivers**:
- Worktree state domain registration
- Publisher wired to FileChangeHub (changed file count, branch)
- Consumer in left panel showing live state
- GlobalStateConnector wiring
**Depends on**: Phase 4
**Key risks**: Finding 03 — publisher must sit inside FileChangeProvider scope; Finding 05 — consumer uses subtitle prop

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 5.1 | Create `apps/web/src/features/041-file-browser/state/register.ts` — registerWorktreeState() | `file-browser` | Registers 'worktree' as singleton domain with changed-file-count, branch properties | AC-38; per ADR-0009 module registration pattern |
| 5.2 | Create `apps/web/src/features/041-file-browser/state/worktree-publisher.ts` — WorktreeStatePublisher component | `file-browser` | Subscribes to FileChangeHub, counts changes, publishes `worktree:changed-file-count`; reads worktree branch, publishes `worktree:branch` | AC-39; Per Finding 03 |
| 5.3 | Create `apps/web/src/features/041-file-browser/components/worktree-state-subtitle.tsx` — consumer component | `file-browser` | Uses useGlobalState to read worktree state, renders in subtitle area | AC-40; Per Finding 05 |
| 5.4 | Create `apps/web/src/lib/state/state-connector.tsx` — GlobalStateConnector | `_platform/state` | Calls registerWorktreeState(), mounts WorktreeStatePublisher; invisible component | AC-41 |
| 5.5 | Wire into browser-client.tsx — mount connector + pass subtitle | `file-browser` | GlobalStateConnector mounted, WorktreeStateSubtitle passed as LeftPanel subtitle | |
| 5.6 | Manual verification — state updates live on file changes | `file-browser` | File save → changed-file-count updates in left panel without page refresh | AC-39, AC-40 |

### Acceptance Criteria (Phase 5)
- [ ] AC-38: worktree domain registered with properties
- [ ] AC-39: Publisher updates live from file changes
- [ ] AC-40: Consumer displays in left panel, updates live
- [ ] AC-41: Exemplar demonstrates both patterns

---

### Phase 6: Documentation & Quality Gate

**Objective**: Developer guide, domain docs update, quality gate
**Domain**: `_platform/state`
**Delivers**:
- Developer guide at docs/how/global-state-system.md
- Updated domain docs
- Full lint + test pass
**Depends on**: Phase 5
**Key risks**: None

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 6.1 | Create `docs/how/global-state-system.md` — developer guide | `_platform/state` | Covers vibe, consumer quick-start, publisher quick-start, pattern cheatsheet, worktree exemplar walkthrough | AC-42 |
| 6.2 | Update `docs/domains/_platform/state/domain.md` — add source file locations, update history | `_platform/state` | All implemented files listed, history entry for Plan 053 implementation | |
| 6.3 | Quality gate: `just fft` passes (lint + format + test) | all | Zero regressions, all new tests pass | |

### Acceptance Criteria (Phase 6)
- [ ] AC-42: Developer guide exists

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| package.json export entry missing breaks prod imports | High (if forgotten) | Critical | Task 1.6 addresses explicitly; Finding 01 |
| list() stable reference breaks useSyncExternalStore | Low | High | Version-counter caching; copy SettingsStore pattern; Finding 04 |
| Bootstrap error crashes provider tree | Low | High | try/catch + no-op fallback (proven in SDKProvider); PL-13 |
| FileChangeProvider scope prevents state publishing | Medium | Medium | Bridge component pattern; WorktreeStatePublisher mounts inside hub scope; Finding 03 |
| Pattern subscription O(n) per publish | Low | Medium | Expected scale ~50-200 entries; acceptable |
