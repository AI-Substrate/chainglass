# Flight Plan: Simple Implementation — FlowSpace Code Search

**Plan**: [flowspace-search-plan.md](../../flowspace-search-plan.md)
**Phase**: Simple Implementation
**Generated**: 2026-02-26
**Status**: Ready for takeoff

---

## Departure → Destination

**Where we are**: The command palette has three working modes: `>` for commands, plain text for file search, and `#` which shows a "coming later" stub toast. FlowSpace (fs2) is installed and the codebase is indexed with ~10,000+ nodes including semantic embeddings.

**Where we're going**: A developer can type `# useFileFilter` to instantly find code by name (text search, ~200ms), or `$ error handling` to find code by concept (semantic search, ~500ms). Results show category icons, file paths, line numbers, and AI summaries. Context menu provides copy/download. When fs2 isn't installed, the UI shows the install URL with a copy button.

---

## Domain Context

### Domains We're Changing

| Domain | What Changes | Key Files |
|--------|-------------|-----------|
| _platform/panel-layout | Add FlowSpace types, enhance dropdown with `symbols`+`semantic` modes, add `$` detection to ExplorerPanel, remove stub handler, update Quick Access hints | `types.ts`, `command-palette-dropdown.tsx`, `explorer-panel.tsx`, `stub-handlers.ts`, `index.ts` |
| file-browser | Add FlowSpace search hook, wire through browser-client | `use-flowspace-search.ts` (new), `browser-client.tsx` |

### Domains We Depend On (no changes)

| Domain | What We Consume | Contract |
|--------|----------------|----------|
| _platform/sdk | IUSDK, ICommandRegistry | Command palette infrastructure |
| _platform/events | toast() | Removed (was used by stub) |

---

## Flight Status

<!-- Updated by /plan-6-v2: pending → active → done. Use blocked for problems/input needed. -->

```mermaid
stateDiagram-v2
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef active fill:#FFC107,stroke:#FFA000,color:#000
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    state "1: Types" as S1
    state "2: Server Action" as S2
    state "3: Hook" as S3
    state "4: Dropdown UI" as S4
    state "5: ExplorerPanel" as S5
    state "6: Remove Stub" as S6
    state "7: Browser Wiring" as S7
    state "8: Hints" as S8
    state "9: Tests" as S9
    state "10: Quality Gate" as S10

    [*] --> S1
    S1 --> S2
    S2 --> S3
    S1 --> S4
    S4 --> S5
    S3 --> S7
    S5 --> S7
    S6 --> S7
    S4 --> S8
    S7 --> S9
    S9 --> S10
    S10 --> [*]

    class S1,S2,S3,S4,S5,S6,S7,S8,S9,S10 pending
```

**Legend**: grey = pending | yellow = active | red = blocked/needs input | green = done

---

## Stages

<!-- Updated by /plan-6-v2 during implementation: [ ] → [~] → [x] -->

- [ ] **Stage 1: Foundation** — Add FlowSpace types to panel-layout (`types.ts`)
- [ ] **Stage 2: Server Action** — Create fs2 CLI wrapper with availability detection (`flowspace-search-action.ts` — new file)
- [ ] **Stage 3: Hook** — Create useFlowspaceSearch with debounce and state management (`use-flowspace-search.ts` — new file)
- [ ] **Stage 4: Dropdown UI** — Enhance symbols + semantic modes with result rendering (`command-palette-dropdown.tsx`)
- [ ] **Stage 5: ExplorerPanel** — Add `$` mode detection and prop threading (`explorer-panel.tsx`)
- [ ] **Stage 6: Cleanup** — Remove createSymbolSearchStub (`stub-handlers.ts`, `index.ts`)
- [ ] **Stage 7: Wiring** — Connect hook → ExplorerPanel → Dropdown in browser-client (`browser-client.tsx`)
- [ ] **Stage 8: Hints** — Update Quick Access with `#` and `$` labels (`command-palette-dropdown.tsx`)
- [ ] **Stage 9: Tests** — Server action JSON parsing + availability detection (`flowspace-search-action.test.ts` — new file)
- [ ] **Stage 10: Gate** — `just fft` passes, zero new failures

---

## Architecture: Before & After

```mermaid
flowchart LR
    classDef existing fill:#E8F5E9,stroke:#4CAF50,color:#000
    classDef changed fill:#FFF3E0,stroke:#FF9800,color:#000
    classDef new fill:#E3F2FD,stroke:#2196F3,color:#000
    classDef removed fill:#FFEBEE,stroke:#F44336,color:#000

    subgraph Before["Before"]
        B_EP["ExplorerPanel<br/># → stub toast"]:::existing
        B_CPD["CommandPaletteDropdown<br/>symbols = 'coming later'"]:::existing
        B_SH["createSymbolSearchStub"]:::existing
        B_BC["browser-client"]:::existing
    end

    subgraph After["After"]
        A_FSA["flowspace-search-action<br/>execFile fs2 CLI"]:::new
        A_HOOK["useFlowspaceSearch<br/>debounce + state"]:::new
        A_EP["ExplorerPanel<br/># text · $ semantic"]:::changed
        A_CPD["CommandPaletteDropdown<br/>symbols + semantic modes<br/>rich results rendering"]:::changed
        A_BC["browser-client<br/>hook wired"]:::changed
        A_TYPES["FlowSpace types"]:::new
        A_TEST["server action tests"]:::new

        A_TYPES --> A_FSA
        A_FSA --> A_HOOK
        A_HOOK --> A_BC
        A_BC --> A_EP
        A_EP --> A_CPD
    end
```

**Legend**: 🟢 existing (unchanged) | 🟠 changed (modified) | 🔵 new (created) | 🔴 removed

---

## Acceptance Criteria

- [ ] AC-01: `# useFileFilter` shows text results within 1 second
- [ ] AC-02: Results show category icon, name, file path, line range
- [ ] AC-03: Smart content shown as one-line summary
- [ ] AC-05: Arrow keys navigate, Enter selects, Escape exits
- [ ] AC-06: 300ms debounce
- [ ] AC-07: "FlowSpace not installed" + URL with copy button
- [ ] AC-09: Quick Access hints: `#` = code search, `$` = semantic
- [ ] AC-10: Stub removed, no toast
- [ ] AC-13: `#` = text mode, regex auto-upgrade
- [ ] AC-15: Folder distribution in header
- [ ] AC-16: Context menu (Copy Path, Copy Content, Download)
- [ ] AC-17: Graph age ("indexed 19 mins ago")
- [ ] AC-18: `$` = semantic mode
- [ ] AC-19: 🧠 semantic badge
- [ ] AC-20: Empty prefix hints + install URL with copy

## Goals & Non-Goals

**Goals**: Fast text code search (`#`), semantic code search (`$`), graceful degradation, rich result rendering
**Non-Goals**: Graph management, real-time updates, tree navigation, Wormhole/LSP

---

## Checklist

- [ ] T001: Add FlowSpace types to panel-layout
- [ ] T002: Create server-side fs2 search action
- [ ] T003: Create useFlowspaceSearch hook
- [ ] T004: Enhance dropdown for symbols + semantic modes
- [ ] T005: Wire ExplorerPanel with `$` detection + props
- [ ] T006: Remove createSymbolSearchStub
- [ ] T007: Wire browser-client with useFlowspaceSearch
- [ ] T008: Update Quick Access hints
- [ ] T009: Write tests for server action
- [ ] T010: Verify `just fft` passes
