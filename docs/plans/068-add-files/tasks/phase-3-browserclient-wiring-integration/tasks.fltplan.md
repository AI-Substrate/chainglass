# Flight Plan: Phase 3 — BrowserClient Wiring & Integration

**Plan**: [add-files-plan.md](../../add-files-plan.md)
**Phase**: Phase 3: BrowserClient Wiring & Integration
**Generated**: 2026-03-07
**Status**: Landed

---

## Departure → Destination

**Where we are**: Phase 1 delivered 4 server actions for file CRUD with full TDD coverage and path security. Phase 2 delivered all the UI — InlineEditInput, hover buttons, context menus, keyboard shortcuts, and DeleteConfirmationDialog in the FileTree. But clicking "New File" and typing a name does nothing — the callbacks are unconnected. The CRUD UI is visible but inert.

**Where we're going**: A user hovers a folder → clicks New File → types `notes.md` → presses Enter → the file is created on disk, a success toast appears, the tree refreshes with a green fade-in animation, and the new file auto-opens in the viewer. Rename updates the URL and viewer. Delete clears the selection if the viewed file was removed. All operations give instant toast feedback.

---

## Domain Context

### Domains We're Changing

| Domain | What Changes | Key Files |
|--------|-------------|-----------|
| file-browser | New useFileMutations hook, BrowserClient wired with CRUD callbacks + edge case handling | `hooks/use-file-mutations.ts` (new), `browser-client.tsx` (modify), `domain.md` (modify) |

### Domains We Depend On (no changes)

| Domain | What We Consume | Contract |
|--------|----------------|----------|
| file-browser (Phase 1) | Server actions for CRUD | `createFile`, `createFolder`, `deleteItem`, `renameItem` |
| file-browser (Phase 2) | FileTree CRUD callback props | `onCreateFile`, `onCreateFolder`, `onRename`, `onDelete` |
| file-browser | Tree refresh + file selection | `handleRefreshDir`, `handleSelect` from useFileNavigation |
| file-browser | SSE-driven new paths | `newPaths` from useTreeDirectoryChanges |
| _platform/workspace-url | URL state | `fileBrowserParams`, `setParams` |

---

## Flight Status

<!-- Updated by /plan-6-v2: pending → active → done. Use blocked for problems/input needed. -->

```mermaid
stateDiagram-v2
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef active fill:#FFC107,stroke:#FFA000,color:#000
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    state "1: useFileMutations hook" as S1
    state "2: BrowserClient wiring" as S2
    state "3: Rename edge cases" as S3
    state "4: Delete edge cases" as S4
    state "5: Animation + auto-select" as S5
    state "6: Domain docs" as S6

    [*] --> S1
    S1 --> S2
    S2 --> S3
    S2 --> S4
    S2 --> S5
    S3 --> S6
    S4 --> S6
    S5 --> S6
    S6 --> [*]

    class S1,S2,S3,S4,S5,S6 done
```

**Legend**: grey = pending | yellow = active | red = blocked/needs input | green = done

---

## Stages

<!-- Updated by /plan-6-v2 during implementation: [ ] → [~] → [x] -->

- [x] **Stage 1: useFileMutations hook** — Server action calls with toast feedback, refreshDir on success (`use-file-mutations.ts` — new file)
- [x] **Stage 2: BrowserClient wiring** — Pass CRUD callbacks from hook to FileTree, immediate refresh (`browser-client.tsx`)
- [x] **Stage 3: Rename edge cases** — Detect renamed open file, sync URL/viewer (`use-file-mutations.ts`, `browser-client.tsx`)
- [x] **Stage 4: Delete edge cases** — Clear selection on delete of open file/folder, clean expanded state (`browser-client.tsx`)
- [x] **Stage 5: Animation + auto-select** — Local newlyAddedPaths with 1.5s timeout, auto-select/expand after create/rename (`browser-client.tsx`)
- [x] **Stage 6: Domain docs** — Update domain.md composition, history, source location (`domain.md`)

---

## Architecture: Before & After

```mermaid
flowchart LR
    classDef existing fill:#E8F5E9,stroke:#4CAF50,color:#000
    classDef changed fill:#FFF3E0,stroke:#FF9800,color:#000
    classDef new fill:#E3F2FD,stroke:#2196F3,color:#000

    subgraph Before["Before Phase 3"]
        B_FT["FileTree<br/>(CRUD UI — inert)"]:::existing
        B_SA["Server Actions<br/>(untouched)"]:::existing
        B_BC["BrowserClient<br/>(no CRUD wiring)"]:::existing
    end

    subgraph After["After Phase 3"]
        A_FT["FileTree<br/>(CRUD UI — live)"]:::existing
        A_HK["useFileMutations<br/>(toast + refresh +<br/>edge cases)"]:::new
        A_SA["Server Actions"]:::existing
        A_BC["BrowserClient<br/>(CRUD wired +<br/>edge cases)"]:::changed

        A_FT -->|"callbacks"| A_BC
        A_BC --> A_HK
        A_HK --> A_SA
    end
```

**Legend**: existing (green, unchanged) | changed (orange, modified) | new (blue, created)

---

## Acceptance Criteria

- [x] AC-01: Hover New File → type name → Enter → file created + toast + green animation + auto-opens in viewer
- [x] AC-02: Hover New Folder → type name → Enter → folder created + toast + auto-expands
- [x] AC-06: Right-click Delete → confirm → item deleted + toast
- [x] AC-10: Rename currently-viewed file → URL updates, viewer shows new file
- [x] AC-11: Delete currently-viewed file → viewer clears to empty state
- [x] AC-12: Toast feedback on all operations (create/rename/delete, success/error)
- [x] `just fft` passes (lint, format, typecheck, test)
- [x] No changes to existing read/save/copy behavior (regression-free)

## Goals & Non-Goals

**Goals**:
- ✅ useFileMutations hook with toast feedback
- ✅ End-to-end CRUD wiring through BrowserClient
- ✅ Edge case handling (rename open file, delete open file/folder)
- ✅ Green fade-in animation for new items
- ✅ Auto-select/expand after create and rename
- ✅ Domain documentation updated

**Non-Goals**:
- ❌ No new UI components
- ❌ No service layer changes
- ❌ No FileTree modifications
- ❌ No new server actions

---

## Checklist

- [x] T001: Create useFileMutations hook
- [x] T002: Wire useFileMutations into BrowserClient
- [x] T003: Handle rename of currently-viewed file
- [x] T004: Handle delete of currently-viewed file
- [x] T005: Handle delete of expanded folder
- [x] T006: Add locally-created items to newlyAddedPaths
- [x] T007: Auto-select and auto-expand after create/rename
- [x] T008: Update file-browser domain.md
