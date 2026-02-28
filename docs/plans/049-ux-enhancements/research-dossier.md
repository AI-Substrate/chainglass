# Research Report: UX Enhancements — Browser Page File Statistics & More

**Generated**: 2026-02-26T01:03:00Z
**Research Query**: "Review plans 041, 047, 043, 045 — UX enhancements starting with showing changed file count (+/- lines) in the FILES header"
**Mode**: Pre-Plan
**Location**: docs/plans/049-ux-enhancements/research-dossier.md
**FlowSpace**: Available
**Findings**: 71 across 8 subagents

## Executive Summary

### What It Does
The browser page renders a three-panel layout (ExplorerPanel top + LeftPanel sidebar + MainPanel content) where the LeftPanel shows either a file tree or a git changes view. The header of the LeftPanel displays a static "FILES" title with mode toggle buttons and a refresh action — it currently shows **no statistics about changed files, line counts, or diff metrics**.

### Business Purpose
Users managing AI agent fleets need at-a-glance awareness of workspace state. The FILES header is visible at all times but provides no quantitative context about what has changed. Adding changed file counts and +/- line statistics transforms a passive label into an active status indicator.

### Key Insights
1. **No diff stats exist anywhere** — `git diff --numstat` or `--stat` has never been called. Changed file counts exist in `workingChanges[]` array length but are not surfaced in the header.
2. **PanelHeader is easily extensible** — The component accepts `title: string` and `actions[]`; adding a `stats` prop or enriching the title is a small change within the `_platform/panel-layout` domain.
3. **Data is already available** — `usePanelState` owns `workingChanges: ChangedFile[]` and `changedFiles: string[]`. Counts can be derived without any new git commands. For +/- line stats, a new `git diff --numstat` service call is needed.

### Quick Stats
- **Components**: 6 files directly involved (PanelHeader, LeftPanel, BrowserClient, working-changes, changed-files, usePanelState)
- **Dependencies**: 3 internal domains (file-browser, panel-layout, events)
- **Test Coverage**: 25+ panel tests, 12 working-changes tests, 8 changes-view tests
- **Complexity**: Low for file count display; Medium for +/- line stats
- **Prior Learnings**: 15 relevant discoveries from plans 041, 043, 045, 047
- **Domains**: 2 relevant (file-browser, _platform/panel-layout)

## How It Currently Works

### Entry Points
| Entry Point | Type | Location | Purpose |
|-------------|------|----------|---------|
| Browser page | Route | `app/(dashboard)/workspaces/[slug]/browser/page.tsx` | Server component that resolves workspace + initial entries |
| BrowserClient | Component | `app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | Client orchestrator composing PanelShell with hooks |
| usePanelState | Hook | `features/041-file-browser/hooks/use-panel-state.ts` | Owns panel mode, working changes, changed files state |

### Core Execution Flow

1. **Page load**: Server component resolves workspace info (including `isGit` flag) and initial directory entries
2. **BrowserClient mount**: Calls `usePanelState()` which:
   - Fetches `changedFiles` via `git diff --name-only` on mount (for tree amber highlighting)
   - Lazy-fetches `workingChanges` via `git status --porcelain` on first "changes" mode switch
3. **LeftPanel render**: Passes hardcoded `title="Files"` to `PanelHeader`
4. **PanelHeader render**: Displays title as `text-xs font-medium text-muted-foreground uppercase`

### Data Flow
```
BrowserClient
  └─ usePanelState()
      ├─ changedFiles: string[] (git diff --name-only, fetched on mount)
      ├─ workingChanges: ChangedFile[] (git status --porcelain, lazy-fetched)
      └─ recentFiles: string[] (git log --name-only, lazy-fetched)
  └─ PanelShell
      └─ LeftPanel
          └─ PanelHeader(title="Files", modes=[tree,changes], actions=[refresh])
```

### What's Missing
- **File count**: `changedFiles.length` exists but is not shown in the header
- **+/- line stats**: No `git diff --numstat` or `--stat` call exists anywhere in the codebase
- **Status summary**: No aggregation of modified/added/deleted counts in the header

## Architecture & Design

### Component Map

#### Core Components
- **PanelHeader** (`_platform/panel-layout/components/panel-header.tsx`): Shared sticky header — renders title + mode buttons + action buttons. Currently accepts `PanelHeaderProps { title, modes, activeMode, onModeChange, actions }`.
- **LeftPanel** (`_platform/panel-layout/components/left-panel.tsx`): Mode-switching sidebar wrapper — hardcodes `title="Files"` into PanelHeader.
- **ChangesView** (`041-file-browser/components/changes-view.tsx`): Renders working changes with M/A/D/?/R status badges.
- **usePanelState** (`041-file-browser/hooks/use-panel-state.ts`): Orchestrates panel mode, lazy-fetches changes data, handles refresh.

### Design Patterns Identified

1. **Status Badge Pattern**: Color-coded single-letter badges (M=amber, A=green, D=red, ?=muted, R=blue) — used in ChangesView, reusable for header stats
2. **Icon + Count Pattern**: `flex items-center gap-1.5` with icon (h-4 w-4) and number — used in FleetStatusBar, WorkspaceCard, WorkflowCard
3. **Lazy Fetch Pattern**: Expensive data loaded on first access, not on mount — used for working changes
4. **PanelHeader Sticky Pattern**: `sticky top-0 bg-background z-10 border-b px-3 py-2 shrink-0`

### System Boundaries
- **_platform/panel-layout**: Structural infrastructure — renders whatever data flows in via props. Does NOT own data fetching.
- **file-browser**: Business domain — owns git service calls, data computation, and passes results to panel-layout for display.

## Dependencies & Integration

### What This Depends On

#### Internal Dependencies
| Dependency | Type | Purpose | Risk if Changed |
|------------|------|---------|-----------------|
| `_platform/panel-layout` | Required | PanelHeader, LeftPanel rendering | Low — well-tested, stable API |
| `file-browser` services | Required | Git data (working-changes, changed-files) | Low — proven services |
| `_platform/events` | Optional | Live file change updates via useFileChanges | Low — stats can piggyback |

#### External Dependencies
| Service/Library | Version | Purpose | Criticality |
|-----------------|---------|---------|-------------|
| Git CLI | System | `git diff --numstat`, `git status --porcelain` | High |

### What Depends on This
- No external consumers — this is a UI-only enhancement.

## Quality & Testing

### Current Test Coverage
- **PanelHeader**: 6 tests (rendering, modes, actions)
- **LeftPanel**: 6 tests (mode switching, refresh, conditional modes)
- **ChangesView**: 8 tests (badges, selection, empty states)
- **working-changes**: 12 tests (porcelain parsing)
- **changed-files**: 2 tests (minimal — only non-git error path)
- **BrowserClient**: No dedicated test file

### Known Issues & Technical Debt
| Issue | Severity | Location | Impact |
|-------|----------|----------|--------|
| No diff stats service | Medium | Missing service | Can't show +/- lines without new git command |
| changed-files minimal tests | Low | test/unit/ | Low risk — simple service |
| BrowserClient untested | Medium | No test file | Integration gaps |

## Modification Considerations

### ✅ Safe to Modify
1. **PanelHeader props**: Adding optional `subtitle` or `stats` prop — well-tested, clear interface
2. **LeftPanel title computation**: Changing from hardcoded "Files" to dynamic title — 6 tests to update
3. **usePanelState return value**: Adding computed stats — hook is internal to file-browser

### ⚠️ Modify with Caution
1. **Adding new git commands**: `git diff --numstat` adds a git call per refresh — must be lazy-fetched
   - Risk: Performance on large repos with many changes
   - Mitigation: Lazy-fetch on mount, cache result, refresh on button click

### Extension Points
1. **PanelHeaderProps**: Add `subtitle?: ReactNode` or `stats?: FilesHeaderStats`
2. **usePanelState return**: Add `stats: { changedCount, insertions, deletions }`
3. **New service**: `getDiffStats(worktreePath)` using `git diff --numstat`

## Prior Learnings (From Previous Implementations)

### 📚 PL-01: PanelHeader Icon-Only Buttons with Tooltips
**Source**: Plan 043-panel-layout, Phase 1, DYK-05
**What They Found**: Mode buttons must be icon-only with tooltips (panel is too narrow for labels).
**Action**: Any new stats display must be compact — no full-text labels, use abbreviated formats like "3M 1A 2D" or "+42 -18".

### 📚 PL-04: react-resizable-panels BROKEN
**Source**: Plan 043-panel-layout, Phase 3, DYK-P3-06
**What They Found**: Library renders incorrect sizes. Replaced with native CSS `resize: horizontal`.
**Action**: Do not use react-resizable-panels for any new panel work.

### 📚 PL-08: Status Badge Color Schema
**Source**: Plan 043-panel-layout, Phase 2, Task T007
**What They Found**: Established color schema: M=amber-500, A=green-500, D=red-500, ?=muted-foreground, R=blue-500.
**Action**: File count badges in the header should use the same color scheme for consistency.

### 📚 PL-12: Lazy-Fetch Pattern for Mode-Switched Views
**Source**: Plan 043-panel-layout, Phase 3, Task T007
**What They Found**: Expensive git data should lazy-load on first access, not on page load.
**Action**: Diff stats (+/- lines) should lazy-fetch on mount since they're always visible in the header.

### 📚 PL-14: Hook Extraction for Complex Components
**Source**: Plan 043-panel-layout, Phase 3, DYK-P3-05
**What They Found**: BrowserClient grew to 500+ lines — extract state to custom hooks.
**Action**: Any new stats computation should live in `usePanelState` hook, not inline in BrowserClient.

### Prior Learnings Summary

| ID | Type | Source Plan | Key Insight | Action |
|----|------|-------------|-------------|--------|
| PL-01 | convention | 043 | Icon-only buttons, no text labels | Keep stats compact |
| PL-04 | gotcha | 043 | react-resizable-panels broken | Use CSS resize |
| PL-08 | convention | 043 | M=amber, A=green, D=red colors | Match in header stats |
| PL-12 | pattern | 043 | Lazy-fetch expensive data | Lazy-fetch diff stats |
| PL-14 | pattern | 043 | Extract state to hooks | Stats in usePanelState |

## Domain Context

### Existing Domains Relevant to This Research

| Domain | Relationship | Relevant Contracts | Key Components |
|--------|-------------|-------------------|----------------|
| `file-browser` | directly relevant | ChangedFile[], WorkingChangesResult, usePanelState | working-changes.ts, changed-files.ts, BrowserClient |
| `_platform/panel-layout` | directly relevant | PanelHeaderProps, LeftPanelProps | PanelHeader, LeftPanel |
| `_platform/events` | tangential | useFileChanges, FileChangeProvider | Live updates for auto-refresh stats |

### Domain Map Position
- **Data owner**: `file-browser` computes stats from git services
- **Display renderer**: `_platform/panel-layout` renders stats via PanelHeader props
- **Event source**: `_platform/events` triggers refresh when files change

### Potential Domain Actions
- **Formalize contract**: `FilesHeaderStats` data interface from `file-browser` → `panel-layout`
- **Extend PanelHeader**: Add optional `subtitle?: ReactNode` prop to display stats

## Critical Discoveries

### 🚨 Critical Finding 01: No Diff Stats Service Exists
**Impact**: Critical
**Source**: DC-06, IC-06
**What**: No `git diff --numstat` or `git diff --stat` call exists anywhere. The codebase only uses `git diff --name-only` (file paths) and `git diff` (unified diff content). There is no aggregated insertion/deletion count available.
**Why It Matters**: To show +/- line counts in the FILES header, a new service function is required.
**Required Action**: Create `getDiffStats(worktreePath)` service using `git diff --numstat` which returns per-file insertions/deletions that can be summed.

### 🚨 Critical Finding 02: Changed File Count Already Available (Unsurfaced)
**Impact**: High
**Source**: IA-08, DC-05
**What**: `usePanelState` already owns `changedFiles: string[]` (fetched on mount) and `workingChanges: ChangedFile[]` (lazy-fetched). Array lengths give file counts immediately — no new git commands needed for basic counts.
**Why It Matters**: The simplest version of this feature (showing "3 files changed") requires zero new backend work.
**Required Action**: Surface `changedFiles.length` in PanelHeader title/subtitle.

### 🚨 Critical Finding 03: PanelHeader Has No Stats Slot
**Impact**: Medium
**Source**: IA-02, IC-02
**What**: PanelHeader accepts only `title: string` — no subtitle, badge, or stats prop. The title renders as a simple uppercase span with no room for additional metadata.
**Required Action**: Extend PanelHeaderProps with a `subtitle?: ReactNode` or `metadata?: ReactNode` prop to allow file-browser to pass in stats display.

## Recommendations

### If Implementing File Count Display (Quick Win)
1. Add `subtitle?: ReactNode` prop to `PanelHeaderProps`
2. Compute stats in `usePanelState`: `{ changedCount: changedFiles.length }`
3. Pass through LeftPanel → PanelHeader
4. Render as muted text next to "FILES" title: `FILES · 3 changed`
5. **MUST** integrate with `useFileChanges('*')` from plan 045 — stats auto-update when any file in the worktree changes (add/modify/delete). The existing `FileChangeProvider` already wraps BrowserClient; hook into it to re-fetch `changedFiles` and `diffStats` on any file change event.

### If Implementing +/- Line Stats (Full Feature)
1. Create `getDiffStats()` service using `git diff --numstat`
2. Add to `usePanelState` as lazy-fetched data (like workingChanges)
3. Surface in header: `FILES · 3 changed +42 −18`
4. **MUST** auto-refresh via `useFileChanges('*')` integration — stats update immediately when files change, no manual refresh required

### Suggested Stats Display Format
```
FILES · 3 changed  +42 −18
```
- "3 changed" — muted text, derived from changedFiles.length
- "+42" — green-500 text, total insertions from git diff --numstat
- "−18" — red-500 text, total deletions from git diff --numstat
- Consistent with established color schema (PL-08)

## External Research Opportunities

No external research gaps identified — all necessary patterns exist within the codebase and git CLI documentation.

## Appendix: File Inventory

### Core Files
| File | Purpose | Lines |
|------|---------|-------|
| `_platform/panel-layout/components/panel-header.tsx` | Shared header component | 77 |
| `_platform/panel-layout/components/left-panel.tsx` | Mode-switching sidebar | 54 |
| `_platform/panel-layout/types.ts` | PanelMode, BarHandler, BarContext types | 38 |
| `041-file-browser/hooks/use-panel-state.ts` | Panel state orchestration | 112 |
| `041-file-browser/services/working-changes.ts` | Git status porcelain parser | 93 |
| `041-file-browser/services/changed-files.ts` | Git diff --name-only | 29 |
| `041-file-browser/components/changes-view.tsx` | Working changes UI | 186 |

### Test Files
| File | Tests |
|------|-------|
| `test/unit/web/features/_platform/panel-layout/panel-header.test.tsx` | 6 |
| `test/unit/web/features/_platform/panel-layout/left-panel.test.tsx` | 6 |
| `test/unit/web/features/041-file-browser/working-changes.test.ts` | 12 |
| `test/unit/web/features/041-file-browser/changed-files.test.ts` | 2 |
| `test/unit/web/features/041-file-browser/changes-view.test.tsx` | 8 |

## Next Steps

This is a pre-plan research dossier for plan **049-ux-enhancements**. The user indicated more UX enhancement ideas are coming beyond the FILES header stats.

**Recommended next step**: Run `/plan-1b-v2-specify` to create the feature specification once all UX enhancement ideas are collected.

---

**Research Complete**: 2026-02-26T01:03:00Z
**Report Location**: docs/plans/049-ux-enhancements/research-dossier.md
