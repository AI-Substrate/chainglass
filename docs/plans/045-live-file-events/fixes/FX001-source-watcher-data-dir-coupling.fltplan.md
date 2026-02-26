# Flight Plan: Fix FX001 — Source Watchers Gated on .chainglass/data/ Existence

**Fix**: [FX001-source-watcher-data-dir-coupling.md](./FX001-source-watcher-data-dir-coupling.md)
**Status**: Landed

## What → Why

**Problem**: Source watchers (Plan 045) only get created for worktrees that have `.chainglass/data/`, so newly added workspaces without Chainglass initialization get no live file events in the browser.

**Fix**: Decouple source watcher creation from data watcher metadata — source watchers should be created for ALL registered worktrees.

## Domain Context

| Domain | Relationship | What Changes |
|--------|-------------|-------------|
| _platform/events | modify | `CentralWatcherService` — source watcher discovery decoupled from data watcher gate |

## Flight Status

```mermaid
stateDiagram-v2
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef active fill:#FFC107,stroke:#FFA000,color:#000
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    state "1: Decouple createSourceWatchers" as S1
    state "2: Update performRescan" as S2
    state "3: Update + add tests" as S3

    [*] --> S1
    S1 --> S2
    S2 --> S3
    S3 --> [*]

    class S1,S2,S3 done
```

**Legend**: grey = pending | yellow = active | red = blocked/needs input | green = done

## Stages

- [x] **Stage 1: Decouple createSourceWatchers** — give it own worktree discovery via registry + resolver (`central-watcher.service.ts`)
- [x] **Stage 2: Update performRescan** — separate source watcher lifecycle from data watcher lifecycle (`central-watcher.service.ts`)
- [x] **Stage 3: Update + add tests** — fix existing count assertion, add no-data-dir and rescan tests (`central-watcher.service.test.ts`)

## Architecture: Before & After

```mermaid
flowchart LR
    classDef existing fill:#E8F5E9,stroke:#4CAF50,color:#000
    classDef changed fill:#FFF3E0,stroke:#FF9800,color:#000
    classDef new fill:#E3F2FD,stroke:#2196F3,color:#000

    subgraph Before["Before Fix"]
        B_DW["createDataWatchers()<br/>populates watcherMetadata"]:::existing
        B_SW["createSourceWatchers()<br/>iterates watcherMetadata"]:::existing
        B_DW -->|"coupled"| B_SW
    end

    subgraph After["After Fix"]
        A_DW["createDataWatchers()<br/>populates watcherMetadata"]:::existing
        A_SW["createSourceWatchers()<br/>own registry + resolver query"]:::changed
        A_REG["registry.list()"]:::existing
        A_RES["worktreeResolver"]:::existing
        A_REG -->|"all workspaces"| A_SW
        A_RES -->|"all worktrees"| A_SW
    end
```

**Legend**: existing (green, unchanged) | changed (orange, modified) | new (blue, created)

## Acceptance

- [x] Workspace without `.chainglass/data/` gets source watcher + SSE events
- [x] Data watchers still require `.chainglass/data/` (no regression)
- [x] `performRescan()` handles source watchers independently
- [x] All existing tests pass

## Checklist

- [x] FX001-1: Decouple `createSourceWatchers()` from `watcherMetadata`
- [x] FX001-2: Update `performRescan()` source watcher lifecycle
- [x] FX001-3: Update existing "skip worktrees without data dir" test
- [x] FX001-4: Add test: source watchers for workspaces without data dir
- [x] FX001-5: Add test: rescan adds source watchers for new workspaces without data dir
