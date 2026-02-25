# Panel Layout System

📚 This specification incorporates findings from [research-dossier.md](./research-dossier.md)

---

## Research Context

The file browser page currently composes its layout with raw `div+flex+Tailwind` — a fixed-width left panel (FileTree) and a flex-1 right panel (FileViewerPanel). The same pattern appears in the agent chat page. No reusable layout components exist. The FileTree owns its own sticky header, and the FileViewerPanel embeds a file path row in its toolbar. Two workshops have designed the replacement: an ExplorerPanel (composable path/command bar) and a LeftPanel with mode switching (tree vs changes view). A `_platform/panel-layout` domain has been extracted to own the structural shell. Two new git services are needed for the changes view: `git status --porcelain` parsing and `git log --name-only` for recent files.

---

## Summary

**WHAT**: A three-panel layout system for the browser page — ExplorerPanel (top utility bar with path navigation), LeftPanel (mode-switching sidebar showing either the file tree or a changes view), and MainPanel (content area for the file viewer). The ExplorerPanel shows the current file path and lets users type/paste a path to navigate directly. The LeftPanel switches between a file tree view and a git changes view (working changes + recent activity). The system is built as reusable infrastructure so future workspace pages can adopt the same layout.

**WHY**: The browser page needs richer navigation beyond a file tree — users want to see what changed at a glance, quickly jump to files by path, and have these interactions deep-linkable. The current layout is hardcoded and duplicated across pages. A composable panel system reduces duplication, ensures consistency, and makes it trivial to add new left panel modes (search, bookmarks) or adopt the layout on other workspace pages (agent chat, workflows).

---

## Goals

- Users can see the current file path at all times and navigate to any file by typing or pasting a path (ExplorerPanel)
- Users can switch between a full directory tree and a focused changes view in the left panel
- The changes view shows working changes (staged, unstaged, untracked) with status badges and a "recent activity" section of the last 20 committed files
- Selecting a file in any left panel mode opens it in the editor and syncs across modes (click in changes → tree auto-expands to that file when switching back)
- The active left panel mode is preserved in the URL (`?panel=tree|changes`) for deep linking
- The panel layout components are domain-owned infrastructure that any workspace page can compose
- The `Ctrl+P` / `Cmd+P` keyboard shortcut focuses the explorer bar (VS Code convention)

---

## Non-Goals

- SSE/live-update of changed files (manual refresh only; future central notification system will handle this)
- Autocomplete/suggestions in the explorer bar (type and Enter only; future enhancement)
- Search mode, bookmarks mode, or recent files mode in the left panel (extensible union type is ready, but only tree + changes built now)
- Responsive phone/tablet layout changes (the panel system works at desktop widths; phone layout is separate concern)
- Agent chat or workgraph page migration to panel layout (future consumers, not this plan)
- Go-to-line (`:123`) or command palette (`>`) in the explorer bar (handler chain is extensible but only file path handler ships)

---

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| _platform/panel-layout | existing | **modify** | Create all panel components (PanelShell, ExplorerPanel, LeftPanel, MainPanel, PanelHeader) and types (BarHandler, BarContext, PanelMode) |
| file-browser | existing | **modify** | Wire panels into BrowserClient, create ChangesView, add git services, extract FileTree header, remove path row from FileViewerPanel, replace `?changed` with `?panel` |
| _platform/workspace-url | existing | **consume** | Use nuqs for `panel` URL param (no changes to domain) |
| _platform/notifications | existing | **consume** | Use `toast()` for mode switch feedback and path errors (no changes to domain) |

---

## Complexity

- **Score**: CS-3 (medium)
- **Breakdown**: S=2, I=0, D=0, N=0, F=0, T=1
  - S=2: Touches multiple files across two domains (panel-layout new components + file-browser refactoring)
  - I=0: All internal — git CLI is already used extensively
  - D=0: No schema/migration changes (URL param swap is additive)
  - N=0: Well-specified via two workshops + domain doc + research dossier
  - F=0: No new security/perf concerns beyond existing patterns
  - T=1: Integration tests needed for handler chain + git porcelain parser
- **Confidence**: 0.90
- **Assumptions**: Workshops are authoritative; cross-mode sync works via shared selectedFile state; git status porcelain output is stable
- **Dependencies**: None external — all git commands are standard
- **Risks**: FileTree header extraction may break 6 existing tests; `?changed` param removal affects existing bookmarks (graceful degradation)
- **Phases**: (1) Panel infrastructure + ExplorerPanel, (2) LeftPanel + ChangesView + git services, (3) Wire into BrowserClient + migration

---

## Acceptance Criteria

### ExplorerPanel

1. A full-width utility bar appears above the two-panel split, always visible regardless of whether a file is selected.
2. When a file is selected, the bar displays the relative file path in monospace font with a copy button on the left.
3. When no file is selected, the bar shows placeholder text "Type or paste a file path...".
4. Clicking the path text enters edit mode — the text becomes an editable input with all text selected.
5. Pressing Enter in the input navigates to the typed path: the file loads in the editor, the tree expands to it, and the URL updates.
6. The explorer bar verifies the file exists on the server before navigating. If not found, a toast error appears and the input reverts.
7. Pasting an absolute path that starts with the worktree prefix auto-strips the prefix and navigates to the relative path.
8. Pressing Escape or clicking away from the input reverts to the current file path without navigating.
9. `Ctrl+P` / `Cmd+P` focuses the explorer bar and selects all text (suppresses browser print dialog).
10. The explorer bar uses a composable handler chain — the file path handler runs first; if it doesn't match, future handlers can try (extensibility point, not visible to users yet).

### LeftPanel Mode Switching

11. The left panel header contains mode toggle buttons: a tree icon (file tree mode) and a diff icon (changes mode).
12. Clicking a mode button switches the left panel content and shows a brief toast ("Tree view" / "Changes view").
13. The active mode is reflected in the URL as `?panel=tree` or `?panel=changes`. Bookmarking and reopening restores the mode.
14. The old `?changed=true` URL parameter is removed. Existing bookmarks with `?changed=true` gracefully degrade (param is ignored, tree mode shown).
15. In non-git workspaces, the changes mode button is hidden (not disabled). Only tree mode is available.

### Changes View

16. The changes view shows two sections: "Working Changes" at top, "Recent (committed)" below a separator.
17. Working Changes lists files from `git status` with status badges: `M` (modified, amber), `A` (added, green), `D` (deleted, red), `?` (untracked, muted), `R` (renamed, blue).
18. Files are displayed as flat paths with the directory prefix muted and the filename emphasized.
19. Recent section shows the last 20 unique files changed across recent commits, deduplicated against Working Changes (no file appears in both sections).
20. When working tree is clean, the Working Changes section shows "Working tree clean" with a green check.
21. Clicking a file in either section selects it — the file loads in the editor with the orange ▶ indicator, same as tree view.
22. The changes view has the same context menu as tree view files (Copy Full Path, Copy Relative Path, Copy Content, Download).

### Cross-Mode Sync

23. Selecting a file in changes view, then switching to tree view, auto-expands the tree to that file and scrolls it into view.
24. Selecting a file in tree view, then switching to changes view, highlights that file if it appears in either section.
25. The selected file persists in the URL (`?file=...`) and is shared across both modes.

### Panel Infrastructure

26. A `PanelShell` component composes ExplorerPanel + LeftPanel + MainPanel in a flex layout.
27. A `PanelHeader` component provides a consistent header with title, mode buttons, and action buttons — used by the LeftPanel.
28. The `MainPanel` wraps content with flex-1 overflow handling.
29. FileTree no longer renders its own header — the header is provided by PanelHeader via LeftPanel.
30. FileViewerPanel no longer renders the path row — path display is provided by ExplorerPanel.

### Refactoring

31. The file path row is removed from FileViewerPanel. The toolbar simplifies to a single row: Save, Edit, Preview, Diff, Refresh.
32. The FileTree sticky header ("FILES" + refresh) is removed from FileTree. FileTree becomes a pure scrollable list.
33. Existing tests for FileTree and FileViewerPanel are updated to reflect the structural changes.

---

## Risks & Assumptions

- **Risk**: Extracting the FileTree header breaks 6 existing tests. **Mitigation**: Tests are straightforward — update selectors to match new PanelHeader placement.
- **Risk**: `git status --porcelain` output has edge cases (merge conflicts, submodules, renamed files with spaces). **Mitigation**: Parse conservatively; test with real repos; skip lines we can't parse rather than crashing.
- **Risk**: `Ctrl+P` shortcut conflicts with browser print dialog. **Mitigation**: `e.preventDefault()` in the keydown handler. Only active when browser page route is mounted.
- **Risk**: ExplorerPanel input captures focus when CodeMirror should have it. **Mitigation**: `Ctrl+P` handler checks if `e.target` is inside `.cm-editor` before capturing.
- **Assumption**: Cross-mode file selection sync works via shared `selectedFile` URL state — FileTree's existing auto-expand logic handles the tree expansion automatically.
- **Assumption**: The panel layout system is scoped to the browser page for now. Other pages can adopt it later without changes to the panel components.
- **Assumption**: The `?changed=true` boolean param can be removed without migration — it's a URL bookmark concern, not persisted data.

---

## Open Questions

All questions resolved via workshops — no open questions remain.

---

## Workshop Opportunities

All workshops have been completed:

| Topic | Type | Status | Document |
|-------|------|--------|----------|
| Explorer bar (path utility bar) | UI Component | ✅ Complete | [file-path-utility-bar.md](workshops/file-path-utility-bar.md) |
| Left panel view modes | State Machine | ✅ Complete | [left-panel-view-modes.md](workshops/left-panel-view-modes.md) |

---

## Testing Strategy

**Full TDD** — same approach as Plan 041 Phase 4.

- Panel components: Unit tests for rendering, mode switching, handler chain dispatch
- Git services: Unit tests for porcelain parser, recent files parser, dedup logic
- Integration: BrowserClient with panel composition, cross-mode sync
- Existing tests: Updated for structural changes (header/path row extraction)

---

## Documentation Strategy

Update `docs/how/file-browser.md` (planned in Plan 041 Phase 6) to document the panel layout system and how to add new left panel modes.
