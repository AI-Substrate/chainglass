# Domain: Panel Layout

**Slug**: _platform/panel-layout
**Type**: infrastructure
**Created**: 2026-02-24
**Created By**: extracted from Plan 041 file browser layout patterns
**Status**: active
**C4 Diagram**: [C4 Component](../../../c4/components/_platform/panel-layout.md)

## Purpose

Reusable three-panel layout system for workspace detail pages. Provides the structural shell — ExplorerPanel (top utility bar), LeftPanel (mode-switching sidebar), and MainPanel (primary content area) — that workspace features plug their content into. Any workspace page (browser, agent chat, workflows) can compose these panels for a consistent, deep-linkable layout.

## Boundary

### Owns
- `PanelShell` — root layout compositor that arranges ExplorerPanel + LeftPanel + MainPanel
- `ExplorerPanel` — full-width top utility bar (path bar, command input, future search). Always visible, composable handler chain.
- `LeftPanel` — fixed-width left sidebar with mode switching header. Renders pluggable view modes (tree, changes, search, bookmarks). Manages mode state in URL.
- `MainPanel` — flex-1 content area. Renders whatever content the page passes in.
- `PanelHeader` — shared header component for panel sections (title + mode buttons + action buttons). Used by LeftPanel and potentially MainPanel.
- Panel URL param (`panel`) — the mode state for LeftPanel
- Layout constants — widths, breakpoints, z-indexes for panel composition

### Does NOT Own
- Content rendered INSIDE panels — FileTree, ChangesView, FileViewerPanel, CodeEditor stay in their respective business domains
- Dashboard sidebar/navigation — the shadcn `<Sidebar>` and `DashboardShell` are separate
- Page-specific business logic — server actions, data fetching, file operations
- Viewer components — `_platform/viewer` owns FileViewer, MarkdownViewer, DiffViewer
- URL params beyond `panel` — `file`, `dir`, `mode`, `changed` belong to file-browser domain

## Contracts (Public Interface)

| Contract | Type | Consumers | Description |
|----------|------|-----------|-------------|
| `PanelShell` | Component | file-browser, future workspace pages | Root compositor: Explorer + Left + Main |
| `ExplorerPanel` | Component | file-browser | Top utility bar with composable input handlers |
| `LeftPanel` | Component | file-browser | Mode-switching left sidebar |
| `MainPanel` | Component | file-browser | Flexible content area |
| `PanelHeader` | Component | LeftPanel, MainPanel | Shared header with mode buttons + actions |
| `BarHandler` | Type | file-browser (path handler), future (search handler) | Handler chain type for ExplorerPanel input |
| `BarContext` | Type | BarHandler implementations | Context passed to input handlers |
| `ExplorerPanelHandle` | Type | file-browser | Imperative handle: focusInput(), openPalette() |
| `FlowSpaceSearchResult` | Type | file-browser | Code search result from FlowSpace |
| `FlowSpaceAvailability` | Type | file-browser | FlowSpace availability states (`available`, `not-installed`, `no-graph`, `no-embeddings`) |
| `FlowSpaceSearchMode` | Type | file-browser | Search mode: `text` or `semantic` |
| `FLOWSPACE_CATEGORY_ICONS` | Constant | file-browser | Icon map for code node categories |
| `PanelMode` | Type | LeftPanel consumers | Union type for left panel modes (`'tree' \| 'changes' \| ...`) |
| `AsciiSpinner` | Component | file-browser | `<AsciiSpinner active={boolean} />` spinning \| / — \ indicator |

## Composition (Internal)

| Component | Role | Depends On |
|-----------|------|------------|
| PanelShell | Arranges three panels in flex layout | ExplorerPanel, LeftPanel, MainPanel |
| ExplorerPanel | Top bar with input + handler chain + command palette | BarHandler, BarContext, CommandPaletteDropdown, IUSDK, MruTracker |
| CommandPaletteDropdown | Multi-mode dropdown below explorer bar | IUSDK (commands.list), MruTracker |
| LeftPanel | Mode header + content slot | PanelHeader, PanelMode, URL state |
| MainPanel | Content wrapper with flex-1 | — (pure layout) |
| PanelHeader | Title + icon buttons + mode toggle | — (pure presentational) |
| AsciiSpinner | ASCII character spinner | Nothing (standalone) |

## Source Location

Primary: `apps/web/src/features/_platform/panel-layout/`

| File | Role | Notes |
|------|------|-------|
| `apps/web/src/features/_platform/panel-layout/types.ts` | PanelMode, BarHandler, BarContext, ExplorerPanelHandle | Created Phase 1 |
| `apps/web/src/features/_platform/panel-layout/index.ts` | Barrel export | Created Phase 1 |
| `apps/web/src/features/_platform/panel-layout/components/panel-header.tsx` | Shared header | Created Phase 1 |
| `apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx` | Top utility bar | Created Phase 1 |
| `apps/web/src/features/_platform/panel-layout/components/left-panel.tsx` | Mode-switching sidebar | Created Phase 1 |
| `apps/web/src/features/_platform/panel-layout/components/main-panel.tsx` | Content area wrapper | Created Phase 1 |
| `apps/web/src/features/_platform/panel-layout/components/panel-shell.tsx` | Root compositor with resizable panels | Created Phase 1 |
| `apps/web/src/components/ui/resizable.tsx` | shadcn resizable wrapper | Installed Phase 1 |
| `apps/web/src/features/_platform/panel-layout/components/ascii-spinner.tsx` | AsciiSpinner component | Extracted from ExplorerPanel |
| `apps/web/src/features/_platform/panel-layout/components/command-palette-dropdown.tsx` | Multi-mode palette dropdown | Created Phase 3 (047) |
| `apps/web/src/features/_platform/panel-layout/stub-handlers.ts` | Symbol search stub handler | Created Phase 3 (047) |

**Migration note**: The current raw `div+flex` layout in `browser-client.tsx` (lines 305-358) and the sticky header in `file-tree.tsx` (lines 107-118) will be refactored to use these components when implemented. The agent chat page (`agents/[id]/page.tsx`) is a future consumer.

## Dependencies

### This Domain Depends On
- `_platform/workspace-url` — URL state management for `panel` param
- `_platform/sdk` — IUSDK, MruTracker for command palette
- `_platform/themes` — `FileIcon` for themed file-type icons in CommandPaletteDropdown search results (Plan 073)
- `nuqs` — URL param persistence (npm)
- `lucide-react` — icons for panel headers (npm)
- `sonner` — toast notifications for stubs (npm)

### Domains That Depend On This
- `file-browser` — browser page will compose PanelShell with FileTree, ChangesView, FileViewerPanel
- Future: agent-ui, workflow-ui — any workspace detail page with multi-panel layout

## History

| Plan | What Changed | Date |
|------|-------------|------|
| *(extracted)* | Domain formalized from Plan 041 browser layout + workshops (file-path-utility-bar, left-panel-view-modes) | 2026-02-24 |
| Plan 043 Phase 1 | Created all 5 components (PanelShell, ExplorerPanel, LeftPanel, MainPanel, PanelHeader), types, barrel export. Installed react-resizable-panels. 19 tests. | 2026-02-24 |
| Plan 043 Phase 3 | Wired into BrowserClient. PanelShell with resizable layout, ExplorerPanel with file path handler, LeftPanel with tree/changes modes. First active consumer. | 2026-02-24 |
| Plan 046 | Extracted AsciiSpinner from ExplorerPanel as reusable component, exported via barrel | 2026-02-24 |
| Plan 047 Phase 3 | Command palette: ExplorerPanel centered with border/shadow, palette mode (> prefix), CommandPaletteDropdown (multi-mode: commands/symbols/search), keyboard delegation, openPalette() handle, # stub handler, search fallback | 2026-02-25 |
| Plan 049 Feature 1 | PanelHeader + LeftPanel gain optional `subtitle?: ReactNode` prop for inline metadata display | 2026-02-26 |
| Plan 049 Feature 2 | ExplorerPanel extended with file search props + keyboard delegation for search mode. CommandPaletteDropdown search mode replaced "coming soon" stub with live file results (badges, sort/hidden toggles, keyboard nav) | 2026-02-26 |
| Plan 051 | FlowSpace code search: removed createSymbolSearchStub, added `#` (text) and `$` (semantic) search modes to CommandPaletteDropdown, added FlowSpace types (FlowSpaceSearchResult, FlowSpaceAvailability, FlowSpaceSearchMode), ExplorerPanel `$` mode detection + keyboard delegation for FlowSpace result modes, Quick Access hints updated | 2026-02-26 |
| Plan 073 Phase 4 | Replaced Lucide File icon with FileIcon from _platform/themes in CommandPaletteDropdown search results. Badge+icon now coexist for working changes. | 2026-03-10 |
| Plan 084 (flowspace-mcp-search) | CommandPaletteDropdown + ExplorerPanel + MobileSearchOverlay gain `codeSearchSpawning` prop. New "Loading FlowSpace, please wait…" UX state above the existing "Searching…" branch in semantic mode — first-call cold-start indicator while the per-worktree fs2 mcp child loads its graph. | 2026-04-26 |
