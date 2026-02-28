# Flight Plan: Phase 1 — Replace Chokidar with Native File Watcher

**Plan**: [native-file-watcher-plan.md](../../native-file-watcher-plan.md)
**Phase**: Phase 1: Replace Chokidar (only phase)
**Generated**: 2026-02-28
**Status**: Landed

---

## Departure → Destination

**Where we are**: The CentralWatcherService uses `ChokidarFileWatcherAdapter` (chokidar v5) which on macOS opens 1 file descriptor per watched file via kqueue. With 4 worktrees, this accumulates ~12,700 FDs, causing `spawn EBADF` when Next.js tries to fork jest-worker processes. The dev server is unusable for multi-workspace development.

**Where we're going**: A developer starts `just dev` with 4+ worktrees registered and the dev server works without errors. File change events continue to fire correctly. The process uses < 200 FDs. chokidar is removed from the dependency tree.

---

## Domain Context

### Domains We're Changing

| Domain | What Changes | Key Files |
|--------|-------------|-----------|
| _platform/events | Replace ChokidarFileWatcherAdapter with NativeFileWatcherAdapter; swap factory in DI; remove chokidar dep | `packages/workflow/src/adapters/native-file-watcher.adapter.ts` (new), `apps/web/src/lib/di-container.ts`, `packages/workflow/package.json` |

### Domains We Depend On (no changes)

| Domain | What We Consume | Contract |
|--------|----------------|----------|
| _platform/events | IFileWatcher, IFileWatcherFactory, FileWatcherOptions | `packages/workflow/src/interfaces/file-watcher.interface.ts` |
| _platform/events | SOURCE_WATCHER_IGNORED | `packages/workflow/src/features/023-central-watcher-notifications/source-watcher.constants.ts` |

---

## Flight Status

<!-- Updated by /plan-6-v2: pending → active → done -->

```mermaid
stateDiagram-v2
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef active fill:#FFC107,stroke:#FFA000,color:#000
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    state "1: Build adapter (TDD)" as S1
    state "2: Wire + swap" as S2
    state "3: Clean + verify" as S3

    [*] --> S1
    S1 --> S2
    S2 --> S3
    S3 --> [*]

    class S1,S2,S3 pending
```

**Legend**: grey = pending | yellow = active | red = blocked/needs input | green = done

---

## Stages

- [ ] **Stage 1: Build adapter with TDD** — Implement NativeFileWatcherAdapter + Factory with event normalization, ignored filtering, write stabilization (`native-file-watcher.adapter.ts` — new file)
- [ ] **Stage 2: Wire and swap** — Update DI, barrel exports, integration test (`di-container.ts`, `index.ts`, integration test)
- [ ] **Stage 3: Clean and verify** — Remove chokidar dep, delete old adapter, smoke test dev server (`package.json`, `chokidar-file-watcher.adapter.ts` — delete)

---

## Architecture: Before & After

```mermaid
flowchart LR
    classDef existing fill:#E8F5E9,stroke:#4CAF50,color:#000
    classDef changed fill:#FFF3E0,stroke:#FF9800,color:#000
    classDef new fill:#E3F2FD,stroke:#2196F3,color:#000
    classDef removed fill:#FFCDD2,stroke:#F44336,color:#000

    subgraph Before["Before"]
        B_CWS["CentralWatcherService"]:::existing
        B_IF["IFileWatcher"]:::existing
        B_CFA["ChokidarFileWatcher<br/>Adapter (chokidar v5)"]:::removed
        B_KQ["kqueue<br/>1 FD/file<br/>~12,700 FDs"]:::removed
        B_CWS --> B_IF --> B_CFA --> B_KQ
    end

    subgraph After["After"]
        A_CWS["CentralWatcherService"]:::existing
        A_IF["IFileWatcher"]:::existing
        A_NFA["NativeFileWatcher<br/>Adapter (fs.watch)"]:::new
        A_FSE["FSEvents<br/>1 FD/tree<br/>~20 FDs"]:::new
        A_CWS --> A_IF --> A_NFA --> A_FSE
    end
```

**Legend**: green = existing (unchanged) | blue = new (created) | red = removed

---

## Acceptance Criteria

- [ ] AC-01: Dev server starts without `spawn EBADF` with 4+ worktrees
- [ ] AC-02: NativeFileWatcherAdapter implements IFileWatcher (add, unwatch, close, on)
- [ ] AC-03: File change events (add, change, unlink, addDir, unlinkDir) fire correctly
- [ ] AC-04: SOURCE_WATCHER_IGNORED patterns suppressed
- [ ] AC-05: Write stabilization works (rapid writes → single event)
- [ ] AC-06: FD count < 200 after startup
- [ ] AC-07: Existing unit tests pass unchanged
- [ ] AC-08: Integration test passes with real filesystem
- [ ] AC-09: chokidar removed from package.json
- [ ] AC-10: Startup log shows watcher backend

## Goals & Non-Goals

**Goals**: Eliminate FD exhaustion, drop-in adapter swap, remove chokidar, FDs < 200
**Non-Goals**: Architecture changes, watcher budgets, new docs, new fakes

---

## Checklist

- [ ] T001: Create NativeFileWatcherAdapter with add/on/close
- [ ] T002: Event normalization (rename → add/unlink/addDir/unlinkDir via stat)
- [ ] T003: Ignored pattern filtering (string, RegExp, function)
- [ ] T004: Write stabilization (per-file debounce)
- [ ] T005: unwatch() implementation
- [ ] T006: NativeFileWatcherFactory
- [ ] T007: Swap DI registration
- [ ] T008: Update barrel exports
- [ ] T009: Update integration test
- [ ] T010: Remove chokidar dependency
- [ ] T011: Delete chokidar adapter
- [ ] T012: Smoke test dev server
