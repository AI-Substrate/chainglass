# Phase 5: Worktree Exemplar — Tasks & Context Brief

**Plan**: [global-state-system-plan.md](../../global-state-system-plan.md)
**Phase**: Phase 5: Worktree Exemplar
**Generated**: 2026-02-27
**Status**: Pending

---

## Executive Briefing

**Purpose**: Build the first real consumer of the GlobalStateSystem — a worktree state domain that publishes live file-change counts and git branch info from FileChangeHub, consumed by a subtitle component in the left panel. This proves the full publish → subscribe → render loop end-to-end.

**What We're Building**: A `worktree` singleton state domain with a publisher component (wired to FileChangeHub + WorkspaceContext), a consumer subtitle component (wired to useGlobalState), and a GlobalStateConnector that bridges domain registration and publisher mounting in the workspace layout.

**Goals**:
- ✅ Register `worktree` as a singleton state domain with `changed-file-count` and `branch` properties
- ✅ Publish live worktree state from FileChangeHub events and WorkspaceContext
- ✅ Display live worktree state in the left panel subtitle
- ✅ Wire via GlobalStateConnector in browser-client.tsx
- ✅ Demonstrate the GlobalStateSystem producer/consumer pattern for future domain adoption

**Non-Goals**:
- ❌ Multi-instance worktree support (one worktree per browser session — singleton)
- ❌ Persisting worktree state (ephemeral only)
- ❌ Replacing the existing `diffStatsSubtitle` — compose alongside it
- ❌ Server-side state or SSE integration (purely client-side file change subscription)
- ❌ Tests for publisher (Task 5.6 is manual verification; publisher test deferred to Phase 6 if needed)

---

## Prior Phase Context

### Phase 1: Types, Interface & Path Engine (✅ Complete)

**A. Deliverables**: Created all types, IStateService interface, path parser, path matcher, DI tokens, barrel exports, and package.json `./state` export entry in `packages/shared/src/state/`.

**B. Dependencies Exported**:
- `IStateService` (11 methods + 2 properties) — the core contract Phase 5 consumes
- `StateDomainDescriptor` — Phase 5 uses this for `registerWorktreeState()`
- `parsePath()` + `createStateMatcher()` — used internally by the system
- `STATE_DI_TOKENS` — available if DI container registration needed
- Import via `@chainglass/shared/state`

**C. Gotchas**:
- DYK-01: Flat path model only (2-3 segments). Worktree paths: `worktree:changed-file-count` and `worktree:branch` (both 2-segment singleton).
- DYK-03: Parser is domain-unaware — domain existence checked at publish/subscribe time.

**D. Incomplete Items**: None.

**E. Patterns**: Interface + Types split, colon-delimited paths, barrel exports with type-only.

### Phase 2: TDD — Path Engine & Contract Tests (✅ Complete)

**A. Deliverables**: 25 path-parser tests, 22 path-matcher tests, 19 contract test cases in `globalStateContractTests` factory.

**B. Dependencies Exported**: `globalStateContractTests(name, factory)` — available for any new IStateService implementation.

**C. Gotchas**:
- DYK-07: Store-first ordering enforced — `get()` returns value inside publish callback.
- DYK-08: All contract tests call `registerTestDomain()` first — domain registration mandatory before publish.

**D. Incomplete Items**: None.

**E. Patterns**: RED-first TDD, decision table tests, helper functions for test prerequisites.

### Phase 3: Implementation + Fake (✅ Complete)

**A. Deliverables**: `GlobalStateSystem` (real implementation), `FakeGlobalStateSystem` (test double), 31 unit tests, 44 contract tests passing.

**B. Dependencies Exported**:
- `GlobalStateSystem` class — the real implementation Phase 5 uses via provider
- `FakeGlobalStateSystem` — with `getPublished()`, `getSubscribers()`, `wasPublishedWith()`, `reset()` — available for Phase 5 tests
- Both exported via `@chainglass/shared/state` and `apps/web/src/lib/state/index.ts`

**C. Gotchas**:
- Store-first ordering (PL-01): Map updates before subscriber notification.
- List cache invalidation: Deletes ALL cache entries on publish/remove (acceptable at scale).
- No defensive copies — `get()` returns same object identity (callers must respect immutability).

**D. Incomplete Items**: None.

**E. Patterns**: Map + Set subscribers, error isolation (try/catch per subscriber), behavioral fakes (not stubs).

### Phase 4: React Integration (✅ Complete)

**A. Deliverables**: `useGlobalState<T>`, `useGlobalStateList`, `GlobalStateProvider` + `useStateSystem`, barrel exports, mounted in `providers.tsx`, 9 hook tests.

**B. Dependencies Exported**:
- `useGlobalState<T>(path, default?) → T` — Phase 5 consumer uses this
- `useGlobalStateList(pattern) → StateEntry[]` — available for multi-value consumption
- `useStateSystem() → IStateService` — Phase 5 publisher/connector uses this for `registerDomain()` and `publish()`
- `GlobalStateProvider` — already mounted in providers.tsx
- `StateContext` — exported for test injection (DYK-20)

**C. Gotchas**:
- DYK-16: Inline defaults create new object identity → pin with `useRef(defaultValue).current`
- DYK-17: Don't subscribe with `'*'` — use actual pattern to avoid over-notification
- DYK-19: Wrap subscribe/getSnapshot in `useCallback` with stable deps
- DYK-18: No graceful degradation — fail-fast on provider errors

**D. Incomplete Items**: None.

**E. Patterns**: `useSyncExternalStore` wiring, `useRef` for default pinning, context export for test injection, pattern-scoped subscriptions.

---

## Pre-Implementation Check

| File | Exists? | Domain Check | Notes |
|------|---------|-------------|-------|
| `apps/web/src/features/041-file-browser/state/register.ts` | ❌ Create | `file-browser` ✅ | New directory `state/` needed under 041-file-browser |
| `apps/web/src/features/041-file-browser/state/worktree-publisher.ts` | ❌ Create | `file-browser` ✅ | Publisher component — consumes `_platform/events` + `_platform/state` |
| `apps/web/src/features/041-file-browser/components/worktree-state-subtitle.tsx` | ❌ Create | `file-browser` ✅ | Consumer component — consumes `_platform/state` |
| `apps/web/src/lib/state/state-connector.tsx` | ❌ Create | `_platform/state` ✅ | Cross-domain wiring component — listed in domain.md |
| `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | ✅ Modify | `file-browser` ✅ | Wire GlobalStateConnector + pass subtitle. **Subtitle slot occupied** — compose with existing `diffStatsSubtitle` |
| `test/unit/web/state/worktree-publisher.test.ts` | ❌ Create | `file-browser` ✅ | Unit tests for publisher logic |

**Concept Duplication Check**: All 4 new concepts (`registerWorktreeState`, `GlobalStateConnector`, `WorktreeStateSubtitle`, `WorktreeStatePublisher`) confirmed genuinely new — no existing implementations found.

**⚠️ Integration Risk**: The `subtitle` prop on `<LeftPanel>` is currently wired to `diffStatsSubtitle` (Plan 049 diff stats). Phase 5 must **compose** both subtitles (e.g., render both in a flex container), NOT replace the existing one.

---

## Architecture Map

```mermaid
flowchart TD
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef completed fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef existing fill:#E8F5E9,stroke:#4CAF50,color:#000

    subgraph Prior["Prior Phases (Complete)"]
        GSS["GlobalStateSystem"]:::completed
        Provider["GlobalStateProvider"]:::completed
        Hooks["useGlobalState / useStateSystem"]:::completed
        Types["IStateService / types"]:::completed
    end

    subgraph Phase5["Phase 5: Worktree Exemplar"]
        T001["T001: registerWorktreeState()"]:::pending
        T002["T002: WorktreeStatePublisher"]:::pending
        T003["T003: WorktreeStateSubtitle"]:::pending
        T004["T004: GlobalStateConnector"]:::pending
        T005["T005: Wire browser-client.tsx"]:::pending
        T006["T006: Publisher tests"]:::pending
        T007["T007: Manual verification"]:::pending

        T001 --> T004
        T002 --> T004
        T003 --> T005
        T004 --> T005
        T006 --> T007
        T005 --> T007
    end

    subgraph Existing["Existing Infrastructure"]
        FCH["FileChangeHub / useFileChanges"]:::existing
        WC["WorkspaceContext / worktreeIdentity"]:::existing
        LP["LeftPanel (subtitle prop)"]:::existing
    end

    Types --> T001
    Provider --> T004
    Hooks --> T002
    Hooks --> T003
    FCH --> T002
    WC --> T002
    LP --> T005
```

---

## Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T001 | Create `registerWorktreeState()` — domain registration function | `file-browser` | `/Users/jordanknight/substrate/chainglass-048/apps/web/src/features/041-file-browser/state/register.ts` | Exports `registerWorktreeState(state: IStateService)` that registers `worktree` as singleton domain with `changed-file-count` (number) and `branch` (string) properties | Finding 03; Workshop 001 registration pattern. Create `state/` directory. |
| [ ] | T002 | Create `WorktreeStatePublisher` — React component publishing worktree state | `file-browser` | `/Users/jordanknight/substrate/chainglass-048/apps/web/src/features/041-file-browser/state/worktree-publisher.ts` | Invisible component that: (1) subscribes to FileChangeHub via `useFileChanges('*', {mode:'accumulate'})` and publishes `worktree:changed-file-count` with count, (2) reads `useWorkspaceContext().worktreeIdentity.branch` and publishes `worktree:branch`. Cleans up on unmount. | Finding 03 — must mount inside FileChangeProvider scope. Use `useStateSystem()` to get IStateService. DYK-16 — pin defaults with useRef. |
| [ ] | T003 | Create `WorktreeStateSubtitle` — consumer component for left panel | `file-browser` | `/Users/jordanknight/substrate/chainglass-048/apps/web/src/features/041-file-browser/components/worktree-state-subtitle.tsx` | Component using `useGlobalState<number>('worktree:changed-file-count', 0)` and `useGlobalState<string>('worktree:branch', '')` to render branch name and file count. Returns `ReactNode` compatible with LeftPanel subtitle prop. Tailwind-styled matching existing `diffStatsSubtitle` pattern. | Finding 05 — subtitle is `ReactNode`. Follow `diffStatsSubtitle` styling pattern (text-xs, text-muted-foreground). |
| [ ] | T004 | Create `GlobalStateConnector` — invisible wiring component | `_platform/state` | `/Users/jordanknight/substrate/chainglass-048/apps/web/src/lib/state/state-connector.tsx` | Component that: (1) calls `useStateSystem()` to get IStateService, (2) calls `registerWorktreeState(state)` once via `useEffect`, (3) renders `<WorktreeStatePublisher />` as child. Returns no visible UI. Export from `apps/web/src/lib/state/index.ts`. | Mirrors SDKWorkspaceConnector pattern. Registration in useEffect to avoid render-phase side effects. |
| [ ] | T005 | Wire into `browser-client.tsx` — mount connector + compose subtitle | `file-browser` | `/Users/jordanknight/substrate/chainglass-048/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | (1) Mount `<GlobalStateConnector />` inside `<FileChangeProvider>` in BrowserClientInner. (2) Compose `<WorktreeStateSubtitle />` alongside existing `diffStatsSubtitle` in the LeftPanel subtitle prop — render both in a flex container. No regressions to existing diff stats display. | ⚠️ Subtitle slot occupied — must compose, not replace. Keep `diffStatsSubtitle` as-is, add worktree state alongside. |
| [ ] | T006 | Create publisher unit tests | `file-browser` | `/Users/jordanknight/substrate/chainglass-048/test/unit/web/state/worktree-publisher.test.ts` | Tests with FakeGlobalStateSystem: (1) publishes changed-file-count from file changes, (2) publishes branch from workspace context, (3) updates on new file changes, (4) cleans up on unmount | Use StateContext.Provider for fake injection (DYK-20). Mock useFileChanges and useWorkspaceContext. |
| [ ] | T007 | Manual verification — live state updates | `file-browser` | — | File save in browser → `worktree:changed-file-count` updates in left panel subtitle without page refresh. Branch name displays correctly. Existing diff stats subtitle still works. | CS 1 — verify in dev environment. |

---

## Context Brief

### Key Findings from Plan

- **Finding 03** (High): FileChangeProvider is mounted in BrowserClient (page-level). GlobalStateProvider is app-level (providers.tsx). The publisher must sit **inside** FileChangeProvider scope to access `useFileChanges()`. Solution: `WorktreeStatePublisher` renders inside `<FileChangeProvider>`, wired by `GlobalStateConnector` which also mounts inside the provider.
- **Finding 05** (High): LeftPanel accepts `subtitle` as `ReactNode`. The worktree consumer should be a `<WorktreeStateSubtitle>` component. browser-client.tsx is `'use client'` so hooks work. **Integration note**: existing `diffStatsSubtitle` already uses this slot — compose both.
- **Finding 06** (High): FakeGlobalStateSystem follows behavioral fake pattern with inspection methods. Use for publisher tests.

### Domain Dependencies (contracts this phase consumes)

- `_platform/state`: `IStateService.registerDomain()`, `IStateService.publish()`, `useStateSystem()`, `useGlobalState<T>()` — core state system contracts for registration, publishing, and consumption
- `_platform/events`: `useFileChanges(pattern, options)` from `FileChangeProvider` — file change events that drive worktree publisher
- `_platform/panel-layout`: `LeftPanel` component with `subtitle?: ReactNode` prop — render target for consumer component
- `file-browser`: `useWorkspaceContext().worktreeIdentity.branch` — git branch info for worktree state

### Domain Constraints

- **`file-browser` → `_platform/state`**: Consumer direction. file-browser publishes TO and reads FROM state system. Allowed per domain-map.md edge `fileBrowser -->|"useGlobalState (subscribe worktree)"| state`.
- **`file-browser` → `_platform/events`**: Existing edge. file-browser already consumes `useFileChanges` and `FileChangeProvider`.
- **`_platform/state` domain owns `state-connector.tsx`**: The connector is cross-domain wiring — it imports from file-browser's `register.ts` and `worktree-publisher.ts`. This is intentional per domain.md — connector orchestrates domain publishers.
- **No new domain edges**: All dependencies are already in domain-map.md.

### Reusable from Prior Phases

- `FakeGlobalStateSystem` with `getPublished()`, `wasPublishedWith()`, `reset()` — for publisher tests (T006)
- `StateContext` export — for test injection without mounting full provider tree (DYK-20)
- `useRef(defaultValue).current` pattern — for stable default values in hooks (DYK-16)
- `useSyncExternalStore` wiring pattern — already proven in useGlobalState/useGlobalStateList
- `diffStatsSubtitle` useMemo pattern — reference for WorktreeStateSubtitle styling

### System Flow Diagram

```mermaid
flowchart LR
    A["File Change<br/>(FS event)"] --> B["FileChangeHub<br/>(045-live-file-events)"]
    B --> C["useFileChanges('*')"]
    C --> D["WorktreeStatePublisher"]
    D -->|"publish('worktree:changed-file-count', n)"| E["GlobalStateSystem"]
    F["WorkspaceContext"] -->|"worktreeIdentity.branch"| D
    D -->|"publish('worktree:branch', str)"| E
    E -->|"subscribe"| G["useGlobalState('worktree:changed-file-count')"]
    E -->|"subscribe"| H["useGlobalState('worktree:branch')"]
    G --> I["WorktreeStateSubtitle"]
    H --> I
    I -->|"ReactNode"| J["LeftPanel subtitle"]
```

### Sequence Diagram (actor interactions)

```mermaid
sequenceDiagram
    participant FS as File System
    participant Hub as FileChangeHub
    participant Pub as WorktreeStatePublisher
    participant GSS as GlobalStateSystem
    participant Sub as WorktreeStateSubtitle
    participant LP as LeftPanel

    Note over Pub,GSS: Bootstrap (once)
    Pub->>GSS: registerWorktreeState(state)
    Pub->>GSS: publish('worktree:branch', 'main')

    Note over FS,LP: Runtime (on file change)
    FS->>Hub: file changed event
    Hub->>Pub: useFileChanges callback
    Pub->>GSS: publish('worktree:changed-file-count', 3)
    GSS->>Sub: subscriber notification
    Sub->>Sub: useGlobalState re-render
    Sub->>LP: updated subtitle ReactNode
```

---

## Discoveries & Learnings

_Populated during implementation by plan-6._

| Date | Task | Type | Discovery | Resolution | References |
|------|------|------|-----------|------------|------------|

**Types**: `gotcha` | `research-needed` | `unexpected-behavior` | `workaround` | `decision` | `debt` | `insight`

---

## Directory Layout

```
docs/plans/053-global-state-system/
  ├── global-state-system-plan.md
  └── tasks/phase-5-worktree-exemplar/
      ├── tasks.md                    ← this file
      ├── tasks.fltplan.md            ← flight plan
      └── execution.log.md           # created by plan-6
```
