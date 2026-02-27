# Flight Plan: Phase 5 — Worktree Exemplar

**Plan**: [global-state-system-plan.md](../../global-state-system-plan.md)
**Phase**: Phase 5: Worktree Exemplar
**Generated**: 2026-02-27
**Status**: Ready for takeoff

---

## Departure → Destination

**Where we are**: Phases 1–4 delivered a complete GlobalStateSystem with types, interface, path engine, real + fake implementations (44 contract tests passing), React hooks (`useGlobalState`, `useGlobalStateList`), and a `GlobalStateProvider` mounted in the app tree. The infrastructure works — but no domain actually uses it yet. The state system has zero registered domains and zero published values in production.

**Where we're going**: A developer opening a workspace browser page sees live worktree state in the left panel — file change count updates instantly on save, branch name displays without refresh. This proves the full loop: domain registration → publisher → GlobalStateSystem → hook → React render. Future domains (workflow status, agent heartbeats) follow this exact pattern.

---

## Domain Context

### Domains We're Changing

| Domain | What Changes | Key Files |
|--------|-------------|-----------|
| `file-browser` | New `state/` directory with domain registration, publisher component, and subtitle consumer. Modify browser-client.tsx to wire connector + subtitle. | `features/041-file-browser/state/register.ts`, `state/worktree-publisher.ts`, `components/worktree-state-subtitle.tsx`, `browser-client.tsx` |
| `_platform/state` | New GlobalStateConnector wiring component. Update barrel exports. | `lib/state/state-connector.tsx`, `lib/state/index.ts` |

### Domains We Depend On (no changes)

| Domain | What We Consume | Contract |
|--------|----------------|----------|
| `_platform/events` | File change events | `useFileChanges(pattern, options)` from `FileChangeProvider` |
| `_platform/panel-layout` | Left panel subtitle slot | `LeftPanel` component, `subtitle?: ReactNode` prop |
| `_platform/state` (existing) | State system infrastructure | `IStateService`, `useStateSystem()`, `useGlobalState<T>()`, `GlobalStateProvider` |
| `file-browser` (existing) | Workspace identity | `useWorkspaceContext().worktreeIdentity.branch` |

---

## Flight Status

<!-- Updated by /plan-6-v2: pending → active → done. Use blocked for problems/input needed. -->

```mermaid
stateDiagram-v2
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef active fill:#FFC107,stroke:#FFA000,color:#000
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    state "1: Domain Registration" as S1
    state "2: Publisher + Consumer" as S2
    state "3: Connector + Wiring" as S3
    state "4: Tests + Verification" as S4

    [*] --> S1
    S1 --> S2
    S2 --> S3
    S3 --> S4
    S4 --> [*]

    class S1,S2,S3,S4 pending
```

**Legend**: grey = pending | yellow = active | red = blocked/needs input | green = done

---

## Stages

<!-- Updated by /plan-6-v2 during implementation: [ ] → [~] → [x] -->

- [ ] **Stage 1: Register worktree domain** — Create `state/register.ts` with `registerWorktreeState()` declaring singleton domain with `changed-file-count` and `branch` properties (`register.ts` — new file)
- [ ] **Stage 2: Build publisher** — Create `WorktreeStatePublisher` that subscribes to FileChangeHub and publishes worktree state to GlobalStateSystem (`worktree-publisher.ts` — new file)
- [ ] **Stage 3: Build consumer** — Create `WorktreeStateSubtitle` reading worktree state via `useGlobalState` and rendering branch + file count (`worktree-state-subtitle.tsx` — new file)
- [ ] **Stage 4: Build connector** — Create `GlobalStateConnector` that registers domain and mounts publisher (`state-connector.tsx` — new file)
- [ ] **Stage 5: Wire in browser-client** — Mount connector inside FileChangeProvider, compose subtitle alongside existing diffStatsSubtitle (`browser-client.tsx` — modified)
- [ ] **Stage 6: Tests + verification** — Publisher unit tests with FakeGlobalStateSystem, manual live verification (`worktree-publisher.test.ts` — new file)

---

## Architecture: Before & After

```mermaid
flowchart LR
    classDef existing fill:#E8F5E9,stroke:#4CAF50,color:#000
    classDef changed fill:#FFF3E0,stroke:#FF9800,color:#000
    classDef new fill:#E3F2FD,stroke:#2196F3,color:#000

    subgraph Before["Before Phase 5"]
        B_GSS["GlobalStateSystem<br/>(no domains registered)"]:::existing
        B_Provider["GlobalStateProvider<br/>(mounted, idle)"]:::existing
        B_FCH["FileChangeHub"]:::existing
        B_LP["LeftPanel<br/>(diffStatsSubtitle)"]:::existing
        B_BC["browser-client.tsx"]:::existing

        B_BC --> B_FCH
        B_BC --> B_LP
    end

    subgraph After["After Phase 5"]
        A_GSS["GlobalStateSystem<br/>(worktree domain active)"]:::changed
        A_Provider["GlobalStateProvider"]:::existing
        A_FCH["FileChangeHub"]:::existing
        A_LP["LeftPanel<br/>(diffStats + worktreeState)"]:::changed
        A_BC["browser-client.tsx"]:::changed
        A_Reg["registerWorktreeState()"]:::new
        A_Pub["WorktreeStatePublisher"]:::new
        A_Sub["WorktreeStateSubtitle"]:::new
        A_Conn["GlobalStateConnector"]:::new

        A_Conn -->|"registers"| A_Reg
        A_Reg -->|"registerDomain()"| A_GSS
        A_Conn -->|"mounts"| A_Pub
        A_Pub -->|"useFileChanges"| A_FCH
        A_Pub -->|"publish()"| A_GSS
        A_GSS -->|"useGlobalState"| A_Sub
        A_Sub -->|"subtitle"| A_LP
        A_BC --> A_Conn
        A_BC --> A_LP
    end
```

**Legend**: existing (green, unchanged) | changed (orange, modified) | new (blue, created)

---

## Acceptance Criteria

- [ ] AC-38: worktree domain registered with `changed-file-count` and `branch` properties
- [ ] AC-39: Publisher updates live from file changes — `worktree:changed-file-count` reflects FileChangeHub state
- [ ] AC-40: Consumer displays in left panel subtitle, updates live without page refresh
- [ ] AC-41: Exemplar demonstrates both publisher and consumer patterns via GlobalStateConnector

## Goals & Non-Goals

**Goals**:
- ✅ First real domain using GlobalStateSystem end-to-end
- ✅ Live file change count in left panel
- ✅ Git branch name in left panel
- ✅ Pattern exemplar for future domain onboarding

**Non-Goals**:
- ❌ Multi-instance worktree support
- ❌ Persisted state
- ❌ Replacing existing diffStatsSubtitle
- ❌ SSE integration (client-side only)

---

## Checklist

- [ ] T001: Create `registerWorktreeState()` domain registration
- [ ] T002: Create `WorktreeStatePublisher` component
- [ ] T003: Create `WorktreeStateSubtitle` consumer component
- [ ] T004: Create `GlobalStateConnector` wiring component
- [ ] T005: Wire into `browser-client.tsx`
- [ ] T006: Publisher unit tests
- [ ] T007: Manual verification — live state updates
