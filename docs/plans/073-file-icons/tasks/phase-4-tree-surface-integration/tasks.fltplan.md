# Flight Plan: Phase 4 — Tree & Surface Integration

**Plan**: [file-icons-plan.md](../../file-icons-plan.md)
**Phase**: Phase 4: Tree & Surface Integration
**Generated**: 2026-03-10
**Status**: Landed

---

## Departure → Destination

**Where we are**: Phases 1-3 built a complete icon infrastructure: resolver (35 tests), asset pipeline (1,117 SVGs), React components (`<FileIcon>`, `<FolderIcon>`), and an `<IconThemeProvider>` mounted in the app. But every file-presenting surface still renders generic grey Lucide icons. The themed icons exist but nobody uses them yet.

**Where we're going**: A developer opens the file browser and sees distinct TypeScript, Python, JSON, Dockerfile icons for files, and themed src/test/node_modules icons for folders. The same themed icons appear in the changes view, command palette search results, binary placeholder, and audio viewer. All existing tests pass with updated assertions.

---

## Domain Context

### Domains We're Changing

| Domain | What Changes | Key Files |
|--------|-------------|-----------|
| `file-browser` | Replace Lucide icons with FileIcon/FolderIcon in FileTree, ChangesView, BinaryPlaceholder, AudioViewer | `file-tree.tsx`, `changes-view.tsx`, `binary-placeholder.tsx`, `audio-viewer.tsx`, `file-tree.test.tsx` |
| `_platform/panel-layout` | Replace Lucide File icon in CommandPaletteDropdown search results | `command-palette-dropdown.tsx` |

### Domains We Depend On (no changes)

| Domain | What We Consume | Contract |
|--------|----------------|----------|
| `_platform/themes` (Phase 3) | `FileIcon`, `FolderIcon` components | `@/features/_platform/themes` barrel |

---

## Flight Status

```mermaid
stateDiagram-v2
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef active fill:#FFC107,stroke:#FFA000,color:#000
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    state "1: Fix test assertions" as S1
    state "2: FileTree files" as S2
    state "3: FileTree folders" as S3
    state "4: ChangesView" as S4
    state "5: CommandPalette" as S5
    state "6: BinaryPlaceholder" as S6
    state "7: AudioViewer" as S7
    state "8: just fft" as S8
    state "9: Harness visual" as S9

    [*] --> S1
    S1 --> S2
    S1 --> S3
    S2 --> S4
    S3 --> S4
    S4 --> S5
    S5 --> S6
    S6 --> S7
    S7 --> S8
    S8 --> S9
    S9 --> [*]

    class S1,S2,S3,S4,S5,S6,S7,S8,S9 done
```

**Legend**: grey = pending | yellow = active | red = blocked/needs input | green = done

---

## Stages

- [x] **Stage 1: Fix test assertions** — Update `file-tree.test.tsx` SVG count checks to accept `img` tags (`file-tree.test.tsx` — modify)
- [x] **Stage 2: FileTree files** — Replace `<File>` with `<FileIcon>` for file entries (`file-tree.tsx` — modify)
- [x] **Stage 3: FileTree folders** — Replace `<Folder>`/`<FolderOpen>` with `<FolderIcon>` (`file-tree.tsx` — modify)
- [x] **Stage 4: ChangesView** — Replace `<File>` with `<FileIcon>` (`changes-view.tsx` — modify)
- [x] **Stage 5: CommandPalette** — Replace `<File>` with `<FileIcon>` in search results (`command-palette-dropdown.tsx` — modify)
- [x] **Stage 6: BinaryPlaceholder** — Replace `<FileQuestion>` with `<FileIcon>` (`binary-placeholder.tsx` — modify)
- [x] **Stage 7: AudioViewer** — Replace `<Music>` with `<FileIcon>` (`audio-viewer.tsx` — modify)
- [x] **Stage 8: just fft** — Full quality gate (`evidence`)
- [x] **Stage 9: Harness visual** — Screenshot verification of icons in running app (`evidence`)

---

## Architecture: Before & After

```mermaid
flowchart LR
    classDef existing fill:#E8F5E9,stroke:#4CAF50,color:#000
    classDef changed fill:#FFF3E0,stroke:#FF9800,color:#000

    subgraph Before["Before Phase 4"]
        B1["FileTree"]:::existing
        B2["ChangesView"]:::existing
        B3["CommandPalette"]:::existing
        B4["BinaryPlaceholder"]:::existing
        B5["AudioViewer"]:::existing
        B6["Lucide: File,<br/>Folder, FolderOpen,<br/>FileQuestion, Music"]:::existing
        B1 --> B6
        B2 --> B6
        B3 --> B6
        B4 --> B6
        B5 --> B6
    end

    subgraph After["After Phase 4"]
        A1["FileTree"]:::changed
        A2["ChangesView"]:::changed
        A3["CommandPalette"]:::changed
        A4["BinaryPlaceholder"]:::changed
        A5["AudioViewer"]:::changed
        A6["FileIcon /<br/>FolderIcon"]:::existing
        A1 --> A6
        A2 --> A6
        A3 --> A6
        A4 --> A6
        A5 --> A6
    end
```

**Legend**: existing (green, unchanged) | changed (orange, modified)

---

## Acceptance Criteria

- [ ] AC-1: File type icons render in tree view (`.ts`, `.py`, `.json`, `.md`, `.html`, `.css`, `.go`, `.rs`, `.java` all distinct)
- [ ] AC-2: Folder-specific icons render (`src`, `test`, `node_modules`, `.git`, `docs`, `public`)
- [ ] AC-3: Unknown extensions fall back gracefully (`.xyz` → generic file icon)
- [ ] AC-4: Special filenames recognized (`Dockerfile`, `package.json`, `.gitignore`)
- [ ] AC-8: ChangesView shows file icons
- [ ] AC-9: Command palette search shows file icons
- [ ] AC-10: Binary file viewers show file icons
- [ ] AC-11: Existing tests pass (updated assertions)

## Goals & Non-Goals

**Goals**:
- ✅ Themed icons in all 5 file-presenting surfaces
- ✅ Existing tests green with updated assertions
- ✅ Visual verification via harness

**Non-Goals**:
- ❌ PdfViewer (no file icon to replace)
- ❌ Light-mode contrast testing (Phase 5)
- ❌ Cache headers or standalone build (Phase 5)

---

## Checklist

- [x] T001: Fix `file-tree.test.tsx` SVG count assertions
- [x] T002: FileTree — replace file icons with `<FileIcon>`
- [x] T003: FileTree — replace folder icons with `<FolderIcon>`
- [x] T004: ChangesView — replace `<File>` with `<FileIcon>`
- [x] T005: CommandPaletteDropdown — replace `<File>` with `<FileIcon>`
- [x] T006: BinaryPlaceholder — replace `<FileQuestion>` with `<FileIcon>`
- [x] T007: AudioViewer — replace `<Music>` with `<FileIcon>`
- [x] T008: Run `just fft`
- [x] T009: Harness visual verification
