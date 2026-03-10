# PR View & File Notes

**Mode**: Full

📚 This specification incorporates findings from [research-dossier.md](research-dossier.md) and [Workshop 001: UI Design](workshops/001-ui-design-github-inspired.md).

## Research Context

74 research findings across 8 subagent investigations confirmed:
- **Overlay pattern is production-proven** (Terminal Plan 064, Activity Log Plan 065) — ~90% structural reuse
- **Per-worktree JSONL persistence** follows ADR-0008 (split storage) and ADR-0010 (central event notification)
- **15 prior learnings** from Plans 041–068 document specific gotchas (overlay mutual exclusion, React state registration, path matching)
- **File Notes requires generic link-type design** from day one to avoid schema migration when adding workflow/agent-run links
- **UI workshop** fully specifies component hierarchy, Tailwind tokens, interaction flows, and keyboard shortcuts

## Summary

Two tightly-related features that transform how developers interact with worktree changes and communicate intent:

1. **PR View** — A GitHub-style "Files Changed" overlay showing all worktree changes in one scrollable view. Each changed file displays its diff with syntax highlighting, can be collapsed/expanded, and can be marked as "reviewed." Reviewed status auto-invalidates when the underlying file changes. The overlay pops over the main browsing area (mutually exclusive with terminal, activity log, and notes overlays). A file list on the left shows all changed files with status badges; clicking scrolls to that file's diff in the main area.

2. **File Notes** — A generic annotation system where humans and agents attach markdown notes to files (at file-level or specific lines), workflow nodes, or agent runs. Notes are addressable ("to human" or "to agent"), threadable (replies), and completable. They persist per-worktree in committed storage, building cross-worktree history through merges. The file tree shows indicator dots for files with notes. A collated notes overlay shows all notes grouped by file. The CLI provides full note management (`cg notes list/add/complete`). Bulk deletion requires type-to-confirm safety ("YEES").

**Why these together**: PR View shows WHAT changed; File Notes captures WHY and WHAT TO DO about it. Together they create a review-and-annotate workflow where a human can review changes, leave notes for an agent, and the agent can respond — all persisted and visible across sessions.

## Goals

- **G1**: Developers see all worktree changes in a single scrollable overlay with collapsible per-file diffs
- **G2**: Developers track review progress by marking files as "reviewed" — status auto-resets when files change
- **G3**: PR View dynamically updates as files change on disk (live via SSE)
- **G4**: Humans and agents annotate files (or specific lines) with markdown notes that persist across sessions
- **G5**: Notes support threading (replies), completion tracking, and addressee targeting (human/agent)
- **G6**: Notes use a generic link-type system (file, workflow, agent-run) that is extensible without schema changes
- **G7**: File tree and PR View file list show indicator dots for files that have notes
- **G8**: Tree can be filtered to show only files with notes
- **G9**: A collated notes overlay shows all worktree notes grouped by file with navigation links
- **G10**: CLI provides full note lifecycle: list (all, per-file, files-with-notes), add, complete, with JSON output for agent consumption
- **G11**: Bulk deletion of notes (per-file or all) is guarded by a type-to-confirm dialog requiring "YEES"
- **G12**: All data is per-worktree, committed to `.chainglass/data/`, and merges cleanly across worktrees

## Non-Goals

- **NG1**: Full GitHub PR integration (fetching remote PRs, pushing reviews to GitHub) — this is local worktree review only
- **NG2**: Tree-form file list in PR View — flat list is sufficient for v1 (user confirmed)
- **NG3**: Inline diff commenting (clicking a line in the diff to add a note) — future enhancement
- **NG4**: Rich markdown editor toolbar in note creation — plain textarea with markdown support is sufficient
- **NG5**: Note permissions or access control — all notes are visible to all users of the worktree
- **NG6**: Real-time collaborative note editing — notes are append-only, no live co-editing
- **NG7**: PR View comparing arbitrary branches — v1 supports Working (vs HEAD) and Branch (vs main) only, not arbitrary ref selection
- **NG8**: Note notifications or email alerts
- **NG9**: Note search (full-text) — filter by file/status/addressee is sufficient for v1

## Target Domains

| Domain | Status | Relationship | Contracts Consumed | Role in This Feature |
|--------|--------|-------------|-------------------|---------------------|
| pr-view | **NEW** | **create** | — | Owns PR View overlay, reviewed-file tracking, diff aggregation |
| file-notes | **NEW** | **create** | — | Owns note CRUD, link-type system, threading, CLI commands, notes overlay |
| file-browser | existing | **modify** | NoteIndicatorDot (from file-notes) | Consume NoteIndicatorDot for tree decoration, add "notes" filter to left panel |
| _platform/viewer | existing | **consume** | DiffViewer, detectContentType | Use DiffViewer for rendering diffs (no changes) |
| _platform/panel-layout | existing | **consume** | PanelShell, overlay anchor, PanelMode | Use PanelShell and overlay anchor positioning (no changes) |
| _platform/events | existing | **consume** | useFileChanges, ICentralEventNotifier, toast() | Use useFileChanges for live updates, toast() for feedback (no changes) |
| _platform/sdk | existing | **consume** | IUSDK, ICommandRegistry, SDKContribution | Register commands and keybindings (no changes to SDK itself) |
| _platform/file-ops | existing | **consume** | IFileSystem, IPathResolver | Use IFileSystem for JSONL persistence (no changes) |
| _platform/workspace-url | existing | **consume** | workspaceHref | Use workspaceHref for navigation (no changes) |
| terminal | existing | **consume** | overlay:close-all pattern | Reference overlay pattern only (no changes) |
| activity-log | existing | **consume** | JSONL writer/reader pattern | Reference overlay + JSONL pattern only (no changes) |

### New Domain Sketches

#### pr-view [NEW]
- **Purpose**: Workspace-scoped overlay showing all changed files with syntax-highlighted diffs, collapsible sections, and per-file reviewed tracking. Lets developers review all worktree changes in one place with persistent progress.
- **Boundary Owns**: PR View overlay (provider, panel, header, file list, diff sections), reviewed-file state persistence (JSONL with content hash invalidation), diff aggregation across all changed files, sidebar/explorer buttons, SDK commands
- **Boundary Excludes**: Diff rendering (consumes `_platform/viewer` DiffViewer), file change detection (consumes `file-browser` working-changes service), file tree (PR View uses its own flat file list), note system (separate `file-notes` domain)

#### file-notes [NEW]
- **Purpose**: Generic annotation system allowing humans and agents to attach markdown notes to any linkable entity (files, lines, workflow nodes, agent runs). Provides CRUD, threading, completion tracking, CLI access, and cross-domain indicator components.
- **Boundary Owns**: Note data model with generic link types, JSONL persistence (writer/reader), INoteService interface, API routes, notes overlay (provider, panel, grouped list), note modal (add/edit), NoteIndicatorDot component, bulk delete dialog, CLI commands (`cg notes`), SDK commands
- **Boundary Excludes**: Tree rendering (provides NoteIndicatorDot consumed by `file-browser`), workflow integration details (provides hooks, consumed by `workflow-ui`), agent integration details (provides hooks, consumed by `agents`), markdown rendering (uses existing prose/markdown utilities)

## Complexity

**Score**: CS-4 (large)

**Breakdown**:
- S=2 (Surface Area): Two new domains, modifications to file-browser, CLI, SDK, sidebar, explorer panel, workspace layout — cross-cutting across web + CLI + shared packages
- I=1 (Integration): Depends on proven internal systems (overlay, JSONL, DiffViewer) — no external/unstable deps
- D=2 (Data/State): New JSONL schemas for both PR View state and notes, generic link-type system, content hash tracking, threading model
- N=1 (Novelty): Well-specified via research + workshop, but some design decisions remain (e.g., exact merge behavior)
- F=1 (Non-Functional): Reviewed status auto-invalidation needs content hashing; bulk delete needs safety gate; notes must be append-safe for merge
- T=1 (Testing/Rollout): Contract tests for INoteService, overlay tests, CLI tests, JSONL tests — proven patterns exist

**Total**: P = 2+1+2+1+1+1 = **8** → CS-4 (large)

**Confidence**: 0.85 — Research dossier and workshop provide high confidence. Remaining uncertainty is around merge behavior and exact diff-per-file performance with many files.

**Assumptions**:
- Overlay anchor positioning continues to work reliably with 5 overlays
- `@git-diff-view/react` handles multiple DiffViewer instances in one scrollable container
- JSONL append-only format merges cleanly via git (no binary conflicts)
- `git hash-object` is fast enough for content hash checking on overlay open

**Dependencies**:
- No external blockers — all dependencies are internal and stable

**Risks**:
- Performance with many changed files (50+) — each needing a separate `git diff` call and DiffViewer instance
- JSONL merge conflicts if two worktrees edit the same note (mitigated by UUID-based IDs and append-only format)

**Phases** (high-level):
1. File Notes data layer (types, JSONL writer/reader, API routes, service interface, fakes, contract tests)
2. File Notes web UI (modal, overlay, indicator dot, sidebar button, SDK commands)
3. File Notes CLI (`cg notes list/add/complete/files`)
4. File Notes integration (FileTree indicator wiring, tree filter, BrowserClient wiring)
5. PR View data layer (reviewed state JSONL, content hash tracking, diff aggregation service)
6. PR View overlay (provider, panel, header, file list, diff sections, sidebar button, SDK commands)
7. PR View live updates (SSE subscription, auto-invalidation, dynamic refresh)
8. Cross-feature polish (file-browser modifications, explorer panel buttons, documentation)

## Acceptance Criteria

### PR View

- **AC-01**: A "PR View" button in the sidebar and explorer panel opens an overlay covering the main content area
- **AC-02**: Opening PR View closes any other open overlay (terminal, activity log, notes) — mutual exclusion
- **AC-03**: The overlay shows a header with branch name, comparison mode toggle (Working/Branch), file count, insertion/deletion stats, and viewed progress
- **AC-04**: A left file list (flat, not tree) shows all changed files with status badges (M/A/D/R/?), per-file +/- counts, and viewed checkboxes
- **AC-05**: The right area shows each changed file's diff in a collapsible section with file path, change stats, and viewed checkbox
- **AC-06**: Clicking a file in the left list smooth-scrolls the right area to that file's diff
- **AC-07**: Checking "Viewed" on a file collapses that file's diff section and dims it in the file list
- **AC-08**: If a viewed file changes on disk, the viewed status auto-resets and a "Previously viewed" indicator appears
- **AC-09**: Expand All / Collapse All controls in the header affect all file sections
- **AC-10**: PR View updates live when files change on disk (new files appear, removed files disappear, diffs update)
- **AC-11**: Viewed/collapsed state persists across overlay close/reopen within the same session
- **AC-12**: Viewed state persists across page refreshes (stored in `.chainglass/data/`)
- **AC-13**: Escape key closes the PR View overlay
- **AC-14**: PR View only appears when the workspace has a git worktree
- **AC-14a**: PR View supports two comparison modes: Working (unstaged/uncommitted vs HEAD) and Branch (current branch vs main)
- **AC-14b**: A toggle in the PR View header switches between Working and Branch modes; file list and diffs update accordingly

### File Notes

- **AC-15**: Users can add a markdown note to any file via tree context menu, keyboard shortcut, or CLI
- **AC-16**: Notes can optionally target a specific line number within a file
- **AC-17**: Notes can optionally be addressed "to human" or "to agent"
- **AC-18**: Notes display the author (human or agent), creation time, addressee, and line reference
- **AC-19**: Notes can be marked as complete (recording who completed: human or agent)
- **AC-20**: Notes support replies (flat threading — one level deep)
- **AC-21**: The file tree shows a small indicator dot next to files that have open notes
- **AC-22**: The PR View file list also shows the note indicator dot
- **AC-23**: A "Notes" button in the sidebar opens a notes overlay showing all notes grouped by file
- **AC-24**: Each note in the overlay has a "Go to" link that navigates to the file (and line if specified)
- **AC-25**: The notes overlay supports filtering by status (open/complete), addressee (human/agent), and link type
- **AC-26**: "Delete all notes for file" and "Delete all notes" are guarded by a type-to-confirm dialog requiring "YEES"
- **AC-27**: The tree can be filtered to show only files that have notes
- **AC-28**: `cg notes list` shows all notes with file paths, line numbers, content preview, and status
- **AC-29**: `cg notes list --file <path>` filters to a specific file
- **AC-30**: `cg notes files` lists all files that have notes
- **AC-31**: `cg notes add <file> --content "..." [--line N] [--to human|agent]` creates a note
- **AC-32**: `cg notes complete <id>` marks a note as complete
- **AC-33**: `cg notes list --json` outputs machine-readable JSON for agent consumption
- **AC-34**: All note data persists in `.chainglass/data/notes.jsonl` and is committed to git

### Generic Link-Type System

- **AC-35**: Notes use a `linkType` field that supports "file", "workflow", and "agent-run" values
- **AC-36**: Each link type has its own `targetMeta` shape (e.g., `line` for files, `nodeId` for workflows)
- **AC-37**: Adding a new link type requires no schema migration — only new code to produce/consume that type
- **AC-38**: CLI and API routes support filtering by link type

## Risks & Assumptions

### Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Performance with 50+ changed files | High — overlay may be slow to load | Medium | Lazy-load diffs (only render visible sections), virtualize file list |
| JSONL merge conflicts | Medium — notes from two worktrees may conflict | Low | UUID-based IDs, append-only format, JSONL lines are independent |
| Multiple DiffViewer instances | Medium — memory/rendering overhead | Medium | Mount DiffViewer only when section is expanded and visible |
| Content hash computation speed | Low — git hash-object per file on overlay open | Low | Batch hash computation, cache results for 10s |
| Overlay stack with 5 overlays | Low — mutual exclusion may have edge cases | Low | Proven pattern used 3 times; 15 prior learnings document gotchas |

### Assumptions

- A1: The existing overlay anchor positioning system scales to 5 overlays without changes
- A2: `@git-diff-view/react` renders correctly when multiple instances are in a single scroll container
- A3: Per-worktree `.chainglass/data/` files merge via git without special tooling (JSONL is line-based)
- A4: Users will primarily use the web UI for notes; CLI is for agent integration and power users
- A5: Notes volume will be modest (10s–100s per worktree, not thousands)
- A6: "File" is the primary link type; "workflow" and "agent-run" are initially stub types wired later

## Open Questions

- **OQ-1**: ~~[RESOLVED]~~ PR View has two comparison modes: (1) **Working** — compares working tree to HEAD (unstaged/uncommitted changes, like `git diff`), and (2) **Branch** — compares current branch to main (like `git diff main...HEAD`). Default mode is Working. A toggle in the PR View header switches between them. Both modes use the same overlay layout, file list, and reviewed tracking.
- **OQ-2**: ~~[RESOLVED]~~ Notes on deleted files remain visible in the notes overlay with a "deleted" indicator. They are not auto-removed — manual cleanup via bulk delete if desired.
- **OQ-3**: ~~[RESOLVED]~~ Notes are editable after creation. Edit updates the note's `updatedAt` timestamp and content in-place (JSONL rewrite). No edit history tracked in v1.
- **OQ-4**: ~~[RESOLVED]~~ PR View file list shows both status badges (M/A/D/R) and per-file insertion/deletion counts (+N -M), matching GitHub's Files Changed layout.
- **OQ-5**: ~~[RESOLVED]~~ "Show files with notes" is a toggle filter within the existing tree mode (like the existing "changed files" filter), not a separate PanelMode.

## Testing Strategy

**Approach**: Hybrid — TDD for data layer, Lightweight for UI
**Mock Policy**: No mocks — real data/fixtures only (Constitution P4)

| Layer | Approach | Focus |
|-------|----------|-------|
| Data (JSONL writer/reader, INoteService, PR state) | TDD — tests first | Contract tests (real + fake parity), edge cases (dedup, threading, hash invalidation), JSONL format correctness |
| API Routes | TDD | Request/response contracts, filtering, worktree scoping |
| CLI Commands | TDD | Argument parsing, output format, JSON mode |
| Overlay UI (PR View panel, Notes panel) | Lightweight — tests after | Overlay toggle, mutual exclusion, render states |
| Components (NoteCard, DiffSection, FileList) | Lightweight | Props rendering, click handlers, conditional display |
| Integration (FileTree wiring, BrowserClient) | Lightweight | Indicator dot visibility, filter behavior |

**Excluded**: Shiki/DiffViewer rendering internals (third-party), visual regression, E2E

## Documentation Strategy

**Location**: Hybrid (README + docs/how/)
**Rationale**: CLI commands need quick-reference in README; overlay patterns and note system design need deeper docs/how/ guide

| Document | Location | Content |
|----------|----------|---------|
| CLI `cg notes` reference | README.md (CLI section) | Command synopsis, examples |
| Note system guide | docs/how/file-notes.md | Architecture, link types, JSONL schema, threading model |
| PR View guide | docs/how/pr-view.md | Usage, reviewed tracking, keyboard shortcuts |
| Domain docs | docs/domains/pr-view/domain.md + docs/domains/file-notes/domain.md | Standard domain format |

## Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| ~~UI Design (GitHub-Inspired)~~ | ~~Integration Pattern~~ | ~~COMPLETED~~ | See [Workshop 001](workshops/001-ui-design-github-inspired.md) |
| Note Link-Type Schema | Data Model | Generic link-type system must support file/workflow/agent-run without migration | What fields per link type? How to validate target exists? How to handle stale links? |
| JSONL Merge Semantics | Storage Design | Notes from multiple worktrees will merge via git — need conflict-free design | How to handle same-note edits? Tombstone vs. delete? Compaction strategy? |
