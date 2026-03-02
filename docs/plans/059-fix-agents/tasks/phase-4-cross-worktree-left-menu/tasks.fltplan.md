# Flight Plan: Phase 4 — Cross-Worktree & Left Menu

**Plan**: [fix-agents-plan.md](../../fix-agents-plan.md) (Phase D)
**Phase**: Phase 4: Cross-Worktree & Left Menu
**Generated**: 2026-03-02
**Status**: Ready for takeoff

---

## Departure → Destination

**Where we are**: Agents can be created, tracked via WorkUnitStateService, and managed through the top bar chip bar + overlay. But agent activity is only visible within the current worktree. If agents in another worktree need attention, the user has no way to know without manually switching.

**Where we're going**: A developer can see at a glance which other worktrees have agents needing attention — colored badges (🟡 questions, 🔴 errors, 🔵 working) appear next to worktree entries in the left sidebar. Clicking a badge navigates directly to that worktree's agent page.

---

## Domain Context

### Domains We're Changing

| Domain | What Changes | Key Files |
|--------|-------------|-----------|
| work-unit-state | Add cross-worktree query API endpoint | `apps/web/app/api/worktree-activity/route.ts` |
| agents | New useWorktreeActivity hook for badge data | `apps/web/src/hooks/use-worktree-activity.ts` |
| _platform/panel-layout | Activity badges in sidebar worktree list | `apps/web/src/components/workspaces/workspace-nav.tsx` |

### Domains We Depend On (no changes)

| Domain | What We Consume | Contract |
|--------|----------------|----------|
| work-unit-state | WorkUnitStateService JSON persistence format | `<worktree>/.chainglass/data/work-unit-state.json` |
| agents | useRecentAgents for current worktree contrast | `useRecentAgents()` |
| _platform/panel-layout | WorkspaceNav worktree rendering | `workspace-nav.tsx` |

---

## Flight Status

```mermaid
stateDiagram-v2
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef active fill:#FFC107,stroke:#FFA000,color:#000
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    state "1: API + query" as S1
    state "2: Client hook" as S2
    state "3: Sidebar badges" as S3
    state "4: E2E verification" as S4

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

- [ ] **Stage 1: API + query** — Cross-worktree activity API endpoint reading JSON from all worktrees (T001)
- [ ] **Stage 2: Client hook** — useWorktreeActivity polling hook with current-worktree exclusion (T002)
- [ ] **Stage 3: Sidebar badges** — Activity dots in WorkspaceNav + badge click navigation (T003, T004)
- [ ] **Stage 4: E2E verification** — All 4 phases working together end-to-end (T005)

---

## Architecture: Before & After

```mermaid
flowchart LR
    classDef existing fill:#E8F5E9,stroke:#4CAF50,color:#000
    classDef new fill:#E3F2FD,stroke:#2196F3,color:#000

    subgraph Before["Before Phase 4"]
        B_NAV["WorkspaceNav<br/>(worktree list only)"]:::existing
        B_WUS["WorkUnitStateService<br/>(single worktree)"]:::existing
    end

    subgraph After["After Phase 4"]
        A_API["GET /api/worktree-activity<br/>(cross-worktree read)"]:::new
        A_HOOK["useWorktreeActivity<br/>(30s poll)"]:::new
        A_NAV["WorkspaceNav<br/>+ activity badges"]:::existing
        A_BADGE["🟡🔴🔵 dots"]:::new

        A_HOOK -->|"fetch"| A_API
        A_HOOK --> A_NAV
        A_NAV --> A_BADGE
    end
```

**Legend**: existing (green, unchanged) | new (blue, created)

---

## Acceptance Criteria

- [ ] AC-29: Left menu shows activity badges (🟡 questions, 🔴 errors, 🔵 working) from cross-worktree state
- [ ] AC-30: Badges only for OTHER worktrees
- [ ] AC-31: Click badge → navigate to that worktree's agent page

## Goals & Non-Goals

**Goals**: Cross-worktree activity awareness in sidebar, colored badges per status, navigation on click, graceful handling of missing state files.

**Non-Goals**: Real-time SSE for cross-worktree state, cross-worktree overlay, cross-worktree agent management.

---

## Checklist

- [ ] T001: Cross-worktree activity API endpoint
- [ ] T002: useWorktreeActivity polling hook
- [ ] T003: Activity badges in WorkspaceNav
- [ ] T004: Badge click → navigate to agent page
- [ ] T005: End-to-end verification
