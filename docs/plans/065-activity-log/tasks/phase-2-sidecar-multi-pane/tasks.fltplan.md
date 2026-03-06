# Flight Plan: Phase 2 — Sidecar Multi-Pane Polling + Activity Writes

**Plan**: [activity-log-plan.md](../../activity-log-plan.md)
**Phase**: Phase 2: Terminal Sidecar — Multi-Pane Polling + Activity Writes
**Generated**: 2026-03-06
**Status**: Landed

---

## Departure → Destination

**Where we are**: Phase 1 delivered the activity-log domain with pure function writer/reader/ignore-patterns (32 tests passing). The terminal sidecar currently polls a single pane title and sends it as a WS message for a badge display in the terminal header (PR #37 stepping-stone code). No activity is written to disk.

**Where we're going**: The terminal sidecar polls ALL panes across ALL windows in the tmux session, filters noise via `shouldIgnorePaneTitle()`, and writes entries to `<worktree>/.chainglass/data/activity-log.jsonl` via `appendActivityLogEntry()`. The pane title badge UI is removed. After restarting the sidecar, `activity-log.jsonl` files appear and grow as agents work.

---

## Domain Context

### Domains We're Changing

| Domain | What Changes | Key Files |
|--------|-------------|-----------|
| terminal | Add `getPaneTitles()`, replace badge poll with activity writes, resolve worktree root, remove badge UI | `tmux-session-manager.ts`, `terminal-ws.ts`, 7 UI components |

### Domains We Depend On (no changes)

| Domain | What We Consume | Contract |
|--------|----------------|----------|
| activity-log | Write entries + filter noise | `appendActivityLogEntry()`, `shouldIgnorePaneTitle()` |

---

## Flight Status

```mermaid
stateDiagram-v2
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef active fill:#FFC107,stroke:#FFA000,color:#000
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    state "1: getPaneTitles()" as S1
    state "2: Worktree resolution" as S2
    state "3: Activity writes" as S3
    state "4: Remove badge UI" as S4
    state "5: Update tests" as S5

    [*] --> S1
    [*] --> S2
    S1 --> S3
    S2 --> S3
    S3 --> S4
    S4 --> S5
    S5 --> [*]

    class S1,S2,S3,S4,S5 pending
```

**Legend**: grey = pending | yellow = active | red = blocked/needs input | green = done

---

## Stages

- [x] **Stage 1: Add getPaneTitles()** — multi-window pane listing with `-s` flag, TDD (`tmux-session-manager.ts`)
- [x] **Stage 2: Resolve worktree root** — `git rev-parse --show-toplevel` in handleConnection (`terminal-ws.ts`)
- [x] **Stage 3: Replace badge poll with activity writes** — import Phase 1 utilities, write entries (`terminal-ws.ts`)
- [x] **Stage 4: Remove badge UI** — strip paneTitle/onPaneTitle from 7 components + hook + types
- [x] **Stage 5: Update tests** — add getPaneTitles tests, keep getPaneTitle tests

---

## Architecture: Before & After

```mermaid
flowchart LR
    classDef existing fill:#E8F5E9,stroke:#4CAF50,color:#000
    classDef changed fill:#FFF3E0,stroke:#FF9800,color:#000
    classDef new fill:#E3F2FD,stroke:#2196F3,color:#000
    classDef removed fill:#FFEBEE,stroke:#F44336,color:#000

    subgraph Before["Before Phase 2"]
        B1["Sidecar polls<br/>1 pane title"]:::existing
        B2["WS → pane_title msg"]:::existing
        B3["Badge in header"]:::existing
        B1 --> B2 --> B3
    end

    subgraph After["After Phase 2"]
        A1["Sidecar polls<br/>ALL panes (-s)"]:::changed
        A2["git rev-parse<br/>worktree root"]:::new
        A3["appendActivityLogEntry()"]:::existing
        A4["activity-log.jsonl"]:::new
        A1 --> A3
        A2 --> A3
        A3 --> A4
    end
```

**Legend**: existing (green) | changed (orange) | new (blue) | removed (red, not shown — badge code deleted)

---

## Acceptance Criteria

- [ ] AC-01: Pane title changes append entries to `<worktree>/.chainglass/data/activity-log.jsonl`
- [ ] AC-02: All panes across all windows in the tmux session are polled
- [ ] AC-03: Hostname/default/shell pane titles are filtered out
- [ ] AC-04: Consecutive identical labels for the same id are deduplicated
- [ ] AC-05: Activity log survives server restarts (persisted to disk)

## Goals & Non-Goals

**Goals**: Multi-pane polling, worktree resolution, activity writes to disk, remove badge UI
**Non-Goals**: No overlay panel, no API route, no SSE broadcasting

---

## Checklist

- [x] T001: Add `getPaneTitles()` to TmuxSessionManager (TDD)
- [x] T002: Add worktree root resolution in sidecar
- [x] T003: Replace pane title polling with activity log writes
- [x] T004: Remove pane title badge from terminal UI (7 files)
- [x] T005: Update terminal tests
