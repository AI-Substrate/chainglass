# Panel Layout System Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-02-24
**Spec**: [panel-layout-spec.md](./panel-layout-spec.md)
**Status**: DRAFT

**Workshops**:
- [file-path-utility-bar.md](workshops/file-path-utility-bar.md) — ExplorerPanel design, handler chain
- [left-panel-view-modes.md](workshops/left-panel-view-modes.md) — LeftPanel modes, ChangesView, git services

---

## Summary

The browser page composes its layout with raw `div+flex` — no reusable panel components exist. This plan creates a three-panel layout system (ExplorerPanel + LeftPanel + MainPanel) in the `_platform/panel-layout` infrastructure domain, adds a git changes view with `git status --porcelain` parsing to the `file-browser` domain, and wires everything into BrowserClient. The result: users can navigate by typing paths, toggle between tree and changes views, and all state is deep-linkable.

---

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| _platform/panel-layout | existing (domain doc created, no code yet) | **modify** | Create PanelShell, ExplorerPanel, LeftPanel, MainPanel, PanelHeader, types |
| file-browser | existing | **modify** | ChangesView, git services, refactor FileTree/FileViewerPanel, wire panels |
| _platform/workspace-url | existing | **consume** | nuqs for `panel` URL param |
| _platform/notifications | existing | **consume** | `toast()` for mode switch + path errors |

---

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `apps/web/src/components/ui/resizable.tsx` | panel-layout | contract | shadcn resizable wrapper (react-resizable-panels) |
| `apps/web/src/features/_platform/panel-layout/types.ts` | panel-layout | contract | PanelMode, BarHandler, BarContext exported types |
| `apps/web/src/features/_platform/panel-layout/components/panel-shell.tsx` | panel-layout | contract | Root compositor |
| `apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx` | panel-layout | contract | Top utility bar |
| `apps/web/src/features/_platform/panel-layout/components/left-panel.tsx` | panel-layout | contract | Mode-switching sidebar |
| `apps/web/src/features/_platform/panel-layout/components/main-panel.tsx` | panel-layout | contract | Content area wrapper |
| `apps/web/src/features/_platform/panel-layout/components/panel-header.tsx` | panel-layout | contract | Shared header component |
| `apps/web/src/features/_platform/panel-layout/index.ts` | panel-layout | contract | Barrel export |
| `apps/web/src/features/041-file-browser/services/working-changes.ts` | file-browser | internal | git status --porcelain parser |
| `apps/web/src/features/041-file-browser/services/recent-files.ts` | file-browser | internal | git log --name-only parser |
| `apps/web/src/features/041-file-browser/components/changes-view.tsx` | file-browser | internal | Changes list UI |
| `apps/web/app/actions/file-actions.ts` | file-browser | cross-domain | Add fetchWorkingChanges, fetchRecentFiles, fileExists server actions |
| `apps/web/src/features/041-file-browser/services/directory-listing.ts` | file-browser | internal | DYK-P2-02: tree shows all files via readDir (removed git ls-files branch) |
| `apps/web/src/features/041-file-browser/params/file-browser.params.ts` | file-browser | internal | Replace `changed` with `panel` param |
| `apps/web/src/features/041-file-browser/components/file-tree.tsx` | file-browser | internal | Remove header (extracted to PanelHeader) |
| `apps/web/src/features/041-file-browser/components/file-viewer-panel.tsx` | file-browser | internal | Remove path row (moved to ExplorerPanel) |
| `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | file-browser | internal | Compose PanelShell, wire all panels |

---

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | High | Ctrl+P handler will conflict with CodeMirror when editor is focused — CodeMirror captures keyboard events in its view layer | Check `document.activeElement` is not inside `.cm-editor` before capturing Ctrl+P. Phase 3 task. |
| 02 | High | No `_platform` feature folder exists yet — this creates the first infrastructure feature folder, setting the precedent | Create `features/_platform/panel-layout/` in Phase 1. Follow existing barrel export pattern from 041-file-browser. |
| 03 | Medium | `git status --porcelain` shows submodules as `MM` which would break file reads if treated as regular files | Use `--ignore-submodules` flag instead of manual filtering. `MM` is valid (staged+unstaged same file). |
| 04 | Medium | FileTree header (`"FILES" + refresh`) is tested via `screen.getByRole('button', { name: /refresh file tree/i })` — extraction will break this assertion | Update test to find refresh button in PanelHeader context. Phase 3 task. |
| 05 | Medium | `?changed=true` param is defined in `fileBrowserParams` but only consumed by FileTree's `showChangedOnly` prop — removal is clean | Replace with `panel` param. Update any test that references `changed`. Phase 3 task. |
| 06 | Low | shadcn `Tabs` component exists and could be used for mode switching buttons in PanelHeader. No ToggleGroup installed. | Use simple icon-only buttons with tooltips (matching existing icon button pattern). Compact enough for narrow panel at min-width. |
| DYK-01 | High | FileTree unmounts on mode switch (`children[mode]` keyed lookup). Remount triggers N API calls to re-expand ancestor directories. | Make `handleExpand` cache-aware: skip fetch when `childEntries[dirPath]` already exists. One-line fix in BrowserClient. Phase 3. |
| DYK-02 | Medium | `react-resizable-panels` loses panel sizes on page navigation/refresh without persistence. | Add `autoSaveId="browser-panels"` prop to ResizablePanelGroup — library auto-persists to localStorage. Phase 1 T009. |
| DYK-03 | Medium | ExplorerPanel Enter → fileExists server round-trip has no loading indicator. User thinks Enter didn't register. | ASCII terminal spinner (`\| / — \\` cycling 80ms) replaces copy button while handler chain processes. Phase 1 T005/T006. |
| DYK-04 | Medium | Ctrl+P must be on `document.addEventListener` to beat browser print dialog. Component-level handlers fire too late. | ExplorerPanel exposes `focusInput()` via `useImperativeHandle` + `forwardRef`. Phase 3 calls it from document-level listener. |
| DYK-05 | Low | PanelHeader mode buttons with icon+label crowd the 200-256px left panel header. Labels won't fit at min-width (15%). | Icon-only mode buttons with tooltips. Same pattern as existing refresh button (icon + aria-label). |

---

## Testing Philosophy

**Full TDD** — same approach as Plan 041 Phase 4.

- Panel components: Render tests, prop callbacks, mode switching
- Git services: Unit tests for porcelain parser, recent files parser, dedup logic
- Handler chain: Unit tests for file path handler (normalize, strip prefix, exists check)
- Integration: Updated tests for FileTree (no header) and FileViewerPanel (no path row)
- Mocking: `vi.mock` for git commands (execFile) — same justified pattern as existing tests

---

## Phase 1: Panel Infrastructure

**Objective**: Create the `_platform/panel-layout` feature folder with all structural components and types.
**Domain**: _platform/panel-layout
**Delivers**:
- PanelShell, ExplorerPanel, LeftPanel, MainPanel, PanelHeader components
- BarHandler, BarContext, PanelMode types
- Feature folder scaffold + barrel export
- Unit tests for all components
**Depends on**: None
**Key risks**: First `_platform` feature folder — sets naming/structure precedent.

| # | Task | Domain | CS | Success Criteria | Notes |
|---|------|--------|----|-----------------|-------|
| 1.1 | Create `_platform/panel-layout` feature folder scaffold: `types.ts`, `index.ts`, `components/` | panel-layout | 1 | Directory exists, barrel exports compile | Per finding 02 |
| 1.2 | Install `react-resizable-panels` (shadcn resizable component) | panel-layout | 1 | `npx shadcn@latest add resizable` installs component + dependency. `ResizablePanel`, `ResizablePanelGroup`, `ResizableHandle` available. | shadcn wraps react-resizable-panels (same lib) |
| 1.3 | Write tests for PanelHeader — renders title, mode buttons, action buttons, fires callbacks | panel-layout | 1 | Tests: title text, button click fires onModeChange, active button highlighted |  |
| 1.4 | Implement PanelHeader component | panel-layout | 1 | All 1.3 tests pass. Accepts title, mode buttons config, action buttons config. | Follow ModeButton pattern from FileViewerPanel (per finding 06) |
| 1.5 | Write tests for ExplorerPanel — renders path, copy button, edit mode, Enter navigates, Escape reverts, handler chain dispatch | panel-layout | 2 | Tests: displays path, copy fires onCopy, click enters edit, Enter calls handler chain, Escape reverts, empty input no-op |  |
| 1.6 | Implement ExplorerPanel component | panel-layout | 2 | All 1.5 tests pass. Input with display/edit modes. Handler chain runs in sequence. | Per workshop: file-path-utility-bar.md |
| 1.7 | Write tests for LeftPanel — renders correct child for mode, mode switch fires callback | panel-layout | 1 | Tests: mode=tree renders children[0], mode=changes renders children[1], mode button fires onModeChange |  |
| 1.8 | Implement LeftPanel component — mode header + content slot | panel-layout | 1 | All 1.7 tests pass. Uses PanelHeader for mode buttons. Renders children by mode. |  |
| 1.9 | Implement MainPanel + PanelShell — resizable layout wrappers | panel-layout | 2 | PanelShell uses `ResizablePanelGroup` with horizontal direction. LeftPanel in `ResizablePanel` (defaultSize=20, minSize=15, maxSize=40). `ResizableHandle` between panels. MainPanel in `ResizablePanel` (flex-1). ExplorerPanel above the resizable group (not resizable). | Uses shadcn resizable (react-resizable-panels) |

### Acceptance Criteria
- [ ] AC-26: PanelShell composes ExplorerPanel + LeftPanel + MainPanel in flex layout
- [ ] AC-27: PanelHeader provides consistent header with title + mode buttons
- [ ] AC-28: MainPanel wraps content with flex-1 overflow
- [ ] AC-10: ExplorerPanel handler chain is composable (extensibility point)

### Risks
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| PanelShell height calculation breaks when ExplorerPanel added | Low | Medium | Keep h-[calc(100vh-4rem)] on root, ExplorerPanel is shrink-0 |
| react-resizable-panels adds bundle weight | Low | Low | ~5KB gzip, lazy-loaded with PanelShell. Same lib shadcn/ui uses. |
| Resize handle hard to grab on touch devices | Low | Low | Set handle width to 4px with hover expand to 8px. Touch targets fine at desktop (not targeting mobile). |

---

## Phase 2: Git Services + Changes View

**Objective**: Add `git status --porcelain` parser, recent files service, and the ChangesView component.
**Domain**: file-browser
**Delivers**:
- `getWorkingChanges` service (porcelain parser)
- `getRecentFiles` service (git log parser)
- `fetchWorkingChanges` and `fetchRecentFiles` server actions
- `fileExists` server action (for ExplorerPanel handler)
- ChangesView component with status badges + recent section
- Unit tests for parsers and component
**Depends on**: None (independent of Phase 1)
**Key risks**: git porcelain edge cases (renames, submodules, merge conflicts).

| # | Task | Domain | CS | Success Criteria | Notes |
|---|------|--------|----|-----------------|-------|
| 2.1 | Write tests for `getWorkingChanges` — parse porcelain output for M, A, D, ??, R statuses; staged vs unstaged; handle empty output, MM (both staged+unstaged) | file-browser | 2 | Tests: parse each status code, classify staged/unstaged/untracked, handle rename format, MM emits two entries, empty repo | Uses `--ignore-submodules` flag |
| 2.2 | Implement `getWorkingChanges` service | file-browser | 2 | All 2.1 tests pass. Uses `git status --porcelain=v1 --ignore-submodules`. Returns `ChangedFile[]`. | Single git command, machine-parseable output |
| 2.3 | Write tests for `getRecentFiles` — deduplicated list of recent files from git log | file-browser | 1 | Tests: returns unique paths, most recent first, respects limit, handles empty repo |  |
| 2.4 | Implement `getRecentFiles` service | file-browser | 1 | All 2.3 tests pass. Uses `git log --name-only --pretty=format: -n N`. |  |
| 2.5 | Add server actions: `fetchWorkingChanges`, `fetchRecentFiles`, `fileExists` | file-browser | 1 | Server actions wrap service functions. `fileExists` does lightweight stat check. | Follow dynamic import pattern from existing file-actions.ts |
| 2.6 | Write tests for ChangesView — renders working changes with badges, recent section, dedup, empty state, selection | file-browser | 2 | Tests: renders M/A/D/?/R badges, dedup recent vs working, "clean" state, click fires onSelect, selected file highlighted |  |
| 2.7 | Implement ChangesView component | file-browser | 2 | All 2.6 tests pass. Two sections, status badges, context menu, selection indicator. | Per workshop: left-panel-view-modes.md |

### Acceptance Criteria
- [ ] AC-16: Changes view shows Working Changes + Recent sections
- [ ] AC-17: Status badges (M amber, A green, D red, ? muted, R blue)
- [ ] AC-18: Flat path display with muted directory, bold filename
- [ ] AC-19: Recent deduplicated against working changes
- [ ] AC-20: Clean working tree shows "Working tree clean"
- [ ] AC-21: Click selects file with ▶ indicator
- [ ] AC-22: Context menu matches tree view (Copy Path, Content, Download)
- [ ] AC-6: ExplorerPanel verifies file exists before navigating

### Risks
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Porcelain parsing fails on renames with spaces | Medium | Low | Handle `R  old -> new` format; use new path |
| Submodule lines in output | Low | Low | `--ignore-submodules` flag eliminates them at git level |

---

## Phase 3: Wire Into BrowserClient + Migration

**Objective**: Compose panel components into BrowserClient, refactor FileTree and FileViewerPanel, migrate URL params.
**Domain**: file-browser (primary), panel-layout (consume)
**Delivers**:
- BrowserClient uses PanelShell layout
- ExplorerPanel wired with file path handler + Ctrl+P shortcut
- LeftPanel switches between FileTree and ChangesView
- FileTree header extracted (renders as pure scrollable list)
- FileViewerPanel path row removed (single-row toolbar)
- `?changed` param replaced with `?panel`
- All existing tests updated
**Depends on**: Phase 1, Phase 2
**Key risks**: Refactoring two established components with existing tests.

| # | Task | Domain | CS | Success Criteria | Notes |
|---|------|--------|----|-----------------|-------|
| 3.1 | Update `fileBrowserParams` — remove `changed`, add `panel` | file-browser | 1 | Param defined. `?panel=tree` is default. Old `?changed=true` silently ignored. | Per finding 05 |
| 3.2 | Remove FileTree header — FileTree becomes pure scrollable list | file-browser | 1 | FileTree renders entries only, no sticky header div. Existing tests updated. | Per finding 04 |
| 3.3 | Remove FileViewerPanel path row — toolbar is single row only | file-browser | 1 | Path row div removed. `filePath` prop stays (used by DiffViewer). Existing tests updated. |  |
| 3.4 | Implement file path BarHandler — normalize, strip worktree prefix, check exists, navigate | file-browser | 2 | Handler: strips `./`, `/`, worktree prefix. Calls fileExists. Returns true on success. Tests: normalize cases, prefix stripping, not-found returns false. |  |
| 3.5 | Wire PanelShell into BrowserClient — ExplorerPanel + LeftPanel + MainPanel | file-browser | 3 | Layout renders: ExplorerPanel at top, FileTree/ChangesView in LeftPanel, FileViewerPanel in MainPanel. URL state drives panel mode. Mode switch shows toast. | Core integration task |
| 3.6 | Add Ctrl+P / Cmd+P keyboard shortcut — focuses ExplorerPanel input | file-browser | 1 | Shortcut works. Suppresses print dialog. Does NOT fire when CodeMirror is focused. | Per finding 01: check activeElement not in .cm-editor |
| 3.7 | Wire ChangesView data — lazy fetch on first switch, refresh button | file-browser | 2 | Changes data fetched on panel=changes. Cached in state. Refresh re-fetches. Non-git hides changes button. |  |
| 3.8 | Verify cross-mode selection sync | file-browser | 1 | Select in changes → switch to tree → tree expands to file. Select in tree → switch to changes → file highlighted if present. |  |
| 3.9 | Update all affected tests — FileTree, FileViewerPanel, params | file-browser | 2 | All existing tests pass with structural changes. New assertions for panel composition. `just fft` passes. | Per finding 04, 05 |
| 3.10 | Update domain docs — panel-layout domain.md history + file-browser domain.md composition | panel-layout, file-browser | 1 | Both domain.md files updated with new components, contracts, history entries. |  |

### Acceptance Criteria
- [ ] AC-1: Explorer bar always visible above two-panel split
- [ ] AC-2: Path displayed in monospace with copy button
- [ ] AC-3: Placeholder shown when no file selected
- [ ] AC-4: Click path enters edit mode, select all
- [ ] AC-5: Enter navigates to typed path
- [ ] AC-7: Absolute path auto-strips worktree prefix
- [ ] AC-8: Escape/blur reverts without navigating
- [ ] AC-9: Ctrl+P focuses explorer bar
- [ ] AC-11: Mode toggle buttons in left panel header
- [ ] AC-12: Mode switch shows toast
- [ ] AC-13: `?panel=tree|changes` in URL
- [ ] AC-14: `?changed=true` gracefully ignored
- [ ] AC-15: Changes button hidden in non-git
- [ ] AC-23: Cross-mode sync: changes → tree expands
- [ ] AC-24: Cross-mode sync: tree → changes highlights
- [ ] AC-25: Selected file persists in URL across modes
- [ ] AC-29: FileTree has no header
- [ ] AC-30: FileViewerPanel has no path row
- [ ] AC-31: Toolbar is single row: Save, Edit, Preview, Diff, Refresh
- [ ] AC-32: Existing tests updated and passing
- [ ] AC-33: `just fft` passes

### Risks
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| BrowserClient grows too large with panel wiring | Medium | Low | Panel components handle their own layout; BrowserClient just passes props/callbacks |
| Ctrl+P conflicts with CodeMirror in edit mode | Medium | Medium | Check activeElement before capturing; CodeMirror doesn't use Ctrl+P by default |

---

## Phase Completion Checklist

- [x] Phase 1: Panel Infrastructure — COMPLETE (19 tests, 5 components, types, barrel)
- [ ] Phase 2: Git Services + Changes View — COMPLETE (21 tests, 2 services, 1 component, 3 server actions)
- [ ] Phase 3: Wire Into BrowserClient + Migration — COMPLETE (10 tasks, 3 hooks extracted, all tests passing)

---

## Complexity Tracking

| Component | CS | Breakdown | Justification |
|-----------|-----|-----------|---------------|
| Panel components (Phase 1) | 2 | S=1,I=0,D=0,N=1,F=0,T=0 | New domain folder, presentational components |
| Git services (Phase 2) | 2 | S=1,I=0,D=0,N=1,F=0,T=0 | New parsers, known git commands |
| ChangesView (Phase 2) | 2 | S=1,I=0,D=0,N=0,F=0,T=1 | New component, follows existing patterns |
| BrowserClient wiring (Phase 3) | 3 | S=2,I=0,D=0,N=0,F=0,T=1 | Touches many files, refactors two components |
| Overall plan | 3 | S=2,I=0,D=0,N=0,F=0,T=1 | Well-specified via workshops |

---

## ADR Alignment

| ADR | Status | Relevance | Notes |
|-----|--------|-----------|-------|
| ADR-0004: DI Container | Aligned | Phase 2 git services use DI-compatible patterns | Services are pure functions, not DI-registered (no IWorkingChangesService needed — they're thin wrappers around execFile) |
| ADR-0007: SSE Single Channel | Aligned | Notifications domain consumed for toast() | Toast on mode switch + path errors per ADR-0007 notification-fetch pattern |
| ADR-0009: Module Registration | Aligned (future) | Panel components are React components, not DI services | No module registration needed — components are imported directly |
| ADR-0010: Central Notifications | Deferred | Plan explicitly defers SSE live-update of file changes | Manual refresh only; future plan will wire ChangesView refresh into CentralEventNotifier |
| ADR-0011: Domain Concepts | Aligned | Git services are simple utility functions (2-3 lines of git + parsing) | Not elevated to full interface+fake — proportional to complexity |

---

## Deviation Ledger

| Deviation | Justification | Risk |
|-----------|--------------|------|
| Do NOT remove or modify unrecognized code/files | Parallel work may be in progress on other plans (e.g., Plan 041 Phase 5). Only touch files explicitly listed in the Domain Manifest. If you encounter unfamiliar changes, leave them alone. | Low |
| `vi.fn()` for React component callback props | R-TEST-007 targets `vi.mock()` on service/module boundaries, not `vi.fn()` for prop spies. Every existing React test in the codebase (workspace-card, fleet-status-bar, file-tree, file-viewer-panel — 40+ test files) uses `vi.fn()` for `onSelect`, `onRefresh`, `onChange` etc. Creating `FakeCallbackRecorder` wrappers would add complexity with no benefit. | Low — established codebase convention |
| `vi.mock` for `execFile` in git service tests | Git services call `execFile` to spawn child processes — there is no injectable DI interface for this (it's a Node.js built-in). Creating a full `IExecService` abstraction would be over-engineering for simple git CLI calls. Same justified pattern as Plan 041's `changed-files.test.ts` and Plan 042's `vi.mock('sonner')`. Constitution R-TEST-007 targets domain service mocks, not child process stubs. | Low — contained to test files, real git commands tested via manual verification |
| `_platform` feature folder lives in `apps/web/src/features/` not `packages/shared/` | Panel layout components are React/Next.js-specific (JSX, hooks, Tailwind CSS). They cannot live in `@chainglass/shared` (pure TypeScript, no React dependency). The `_platform/` prefix signals infrastructure-for-web, distinguishing from plan-scoped feature folders (e.g., `041-file-browser/`). | Low — precedent is clear, follows existing feature folder pattern |
| `file-actions.ts` classified as cross-domain (server actions) | Server actions are Next.js-specific — they cannot move to `@chainglass/shared`. The "cross-domain" classification means they bridge the file-browser domain's services with Next.js server action runtime, not that they're shared across packages. | Low — web-only by nature |

---

## Change Footnotes Ledger

| ID | Created | Summary | Domain(s) | Status | Source |
|----|---------|---------|-----------|--------|--------|
