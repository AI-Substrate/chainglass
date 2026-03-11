# PR View & File Notes Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-03-08
**Spec**: [pr-view-spec.md](pr-view-spec.md)
**Research**: [research-dossier.md](research-dossier.md)
**Workshop**: [001-ui-design-github-inspired.md](workshops/001-ui-design-github-inspired.md)
**Status**: COMPLETE (all 8 phases done)
**Mode**: Full
**Complexity**: CS-4 (large)

## Summary

Two new business domains deliver a GitHub-style change review workflow and a generic annotation system. **PR View** provides an overlay showing all worktree changes with collapsible per-file diffs, two comparison modes (Working vs HEAD, Branch vs main), and persistent reviewed-file tracking with auto-invalidation. **File Notes** provides a cross-cutting annotation system where humans and agents attach markdown notes to files, lines, workflow nodes, or agent runs — with threading, completion tracking, CLI access, and tree indicators. Both use per-worktree JSONL persistence in `.chainglass/data/`, overlay mutual exclusion via the proven `overlay:close-all` pattern, and follow the established domain creation workflow (interface → fake → contract tests → real adapter).

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| file-notes | **NEW** | **create** | Note CRUD, link-type system, threading, CLI, notes overlay |
| pr-view | **NEW** | **create** | PR View overlay, reviewed-file tracking, diff aggregation |
| file-browser | existing | **modify** | Consume NoteIndicatorDot for tree decoration, add notes filter |
| _platform/viewer | existing | consume | DiffViewer for rendering diffs (no changes) |
| _platform/panel-layout | existing | consume | PanelShell and overlay anchor (no changes) |
| _platform/events | existing | consume | useFileChanges, toast() (no changes) |
| _platform/sdk | existing | consume | Register commands and keybindings (no changes) |
| _platform/file-ops | existing | consume | IFileSystem for JSONL persistence (no changes) |
| _platform/workspace-url | existing | consume | workspaceHref for navigation (no changes) |

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `packages/shared/src/interfaces/note-service.interface.ts` | file-notes | contract | INoteService interface, Note type, LinkType |
| `packages/shared/src/fakes/fake-note-service.ts` | file-notes | contract | FakeNoteService with inspection methods |
| `apps/web/src/features/071-file-notes/types.ts` | file-notes | internal | Note, NoteFilter, NoteTarget types |
| `apps/web/src/features/071-file-notes/lib/note-writer.ts` | file-notes | internal | JSONL append + versioned edit |
| `apps/web/src/features/071-file-notes/lib/note-reader.ts` | file-notes | internal | JSONL read + filter + latest-version resolution |
| `apps/web/src/features/071-file-notes/hooks/use-notes-overlay.tsx` | file-notes | internal | Overlay provider + hook |
| `apps/web/src/features/071-file-notes/hooks/use-notes.ts` | file-notes | internal | Fetch + cache notes for a target |
| `apps/web/src/features/071-file-notes/components/notes-overlay-panel.tsx` | file-notes | internal | All-notes collated view |
| `apps/web/src/features/071-file-notes/components/note-modal.tsx` | file-notes | internal | Add/edit note dialog |
| `apps/web/src/features/071-file-notes/components/note-card.tsx` | file-notes | internal | Individual note rendering |
| `apps/web/src/features/071-file-notes/components/note-indicator-dot.tsx` | file-notes | contract | Consumed by file-browser FileTree |
| `apps/web/src/features/071-file-notes/components/bulk-delete-dialog.tsx` | file-notes | internal | Type-to-confirm YEES dialog |
| `apps/web/src/features/071-file-notes/sdk/contribution.ts` | file-notes | internal | SDK command manifest |
| `apps/web/src/features/071-file-notes/sdk/register.ts` | file-notes | internal | SDK registration |
| `apps/web/src/features/071-file-notes/index.ts` | file-notes | contract | Barrel exports |
| `apps/web/app/api/file-notes/route.ts` | file-notes | internal | CRUD API routes |
| `apps/web/app/actions/notes-actions.ts` | file-notes | internal | Server actions |
| `apps/web/app/(dashboard)/workspaces/[slug]/notes-overlay-wrapper.tsx` | file-notes | cross-domain | Mounts in workspace layout |
| `apps/cli/src/commands/notes.command.ts` | file-notes | internal | CLI commands |
| `apps/web/src/features/071-pr-view/types.ts` | pr-view | internal | PRViewFile, PRViewFileState |
| `apps/web/src/features/071-pr-view/lib/pr-view-state.ts` | pr-view | internal | Reviewed state JSONL writer/reader |
| `apps/web/src/features/071-pr-view/lib/git-branch-service.ts` | pr-view | internal | getCurrentBranch, getMergeBase |
| `apps/web/src/features/071-pr-view/lib/per-file-diff-stats.ts` | pr-view | internal | git diff --numstat parser |
| `apps/web/src/features/071-pr-view/lib/diff-aggregator.ts` | pr-view | internal | Fetch all diffs for changed files |
| `apps/web/src/features/071-pr-view/hooks/use-pr-view-overlay.tsx` | pr-view | internal | Overlay provider + hook |
| `apps/web/src/features/071-pr-view/components/pr-view-overlay-panel.tsx` | pr-view | internal | Main overlay panel |
| `apps/web/src/features/071-pr-view/components/pr-view-header.tsx` | pr-view | internal | Branch name, stats, toggle, progress |
| `apps/web/src/features/071-pr-view/components/pr-view-file-list.tsx` | pr-view | internal | Left column file list |
| `apps/web/src/features/071-pr-view/components/pr-view-diff-section.tsx` | pr-view | internal | Collapsible per-file diff |
| `apps/web/src/features/071-pr-view/components/pr-view-diff-area.tsx` | pr-view | internal | Scrollable diff container with scroll sync |
| `apps/web/src/features/071-pr-view/sdk/contribution.ts` | pr-view | internal | SDK command manifest |
| `apps/web/src/features/071-pr-view/sdk/register.ts` | pr-view | internal | SDK registration |
| `apps/web/src/features/071-pr-view/index.ts` | pr-view | contract | Barrel exports |
| `apps/web/app/api/pr-view/route.ts` | pr-view | internal | API routes |
| `apps/web/app/actions/pr-view-actions.ts` | pr-view | internal | Server actions |
| `apps/web/app/(dashboard)/workspaces/[slug]/pr-view-overlay-wrapper.tsx` | pr-view | cross-domain | Mounts in workspace layout |
| `apps/web/src/features/041-file-browser/components/file-tree.tsx` | file-browser | cross-domain | Add NoteIndicatorDot prop |
| `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | file-browser | cross-domain | Wire note indicators + filter |
| `apps/web/src/components/dashboard-sidebar.tsx` | _platform/panel-layout | cross-domain | Add PR View + Notes sidebar buttons |
| `apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx` | _platform/panel-layout | cross-domain | Add PR View + Notes toggle buttons |
| `apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx` | — | cross-domain | Mount overlay wrappers |
| `docs/domains/file-notes/domain.md` | file-notes | contract | Domain definition |
| `docs/domains/pr-view/domain.md` | pr-view | contract | Domain definition |

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | No anti-reinvention conflicts — no existing notes/annotations/review concepts in any domain | Green light: create both new domains |
| 02 | Critical | JSONL edit concurrency risk — `appendFileSync` is safe for append but rewriting lines risks corruption with concurrent CLI + web access | Simple model: read all → modify in memory → write-to-temp → atomic rename. Notes volume is modest (10s–100s), concurrent edits are rare. No versioning/supersedes complexity needed. |
| 03 | Critical | CLI requires INoteService in shared package before notes.command.ts can be created | Phase 1 creates interface in packages/shared; Phase 3 (CLI) depends on Phase 1 |
| 04 | High | Git diff lacks branch comparison — `getGitDiff()` only supports working-tree-to-HEAD | Create git branch service with `getCurrentBranch()` + `getMergeBase()`. Extend `getGitDiff()` with optional `baseBranch` param. Phase 4. |
| 05 | High | Diff stats are aggregate only — `getDiffStats()` uses `--shortstat` not `--numstat` | Create `getPerFileDiffStats()` using `git diff --numstat`. Phase 4. |
| 06 | High | Working changes services not exported from file-browser barrel | PR View imports directly from `041-file-browser/services/` path. No extraction needed. |
| 07 | High | Multiple DiffViewer instances are safe — Shiki singleton caches after first init | No blocker. Document singleton dependency. Add lazy mount (only expanded+visible). Phase 5. |
| 08 | Medium | Overlay mounting pattern is mature — 3 wrappers in layout.tsx, z-index 44 for standard overlays | Add 2 wrappers (PR View + Notes) between ActivityLogOverlayWrapper and WorkspaceAgentChrome. Phase 2 + Phase 5. |

## Harness Strategy

Harness: Not applicable. No harness.md exists and this feature uses proven patterns (overlay, JSONL, CLI commands) that don't require automated boot/interact/observe workflows. Testing uses Vitest with fakes.

## Constitution Compliance

| Principle | Compliance | Notes |
|-----------|-----------|-------|
| P1: Clean Architecture | ✅ | Dependencies flow inward: services → interfaces |
| P2: Interface-First | ✅ | INoteService defined before implementation |
| P3: TDD | ⚠️ (hybrid) | TDD for data layer; lightweight for UI. See deviation ledger below. |
| P4: Fakes Over Mocks | ✅ | FakeNoteService, no vi.mock(). FakeNoteService imports only from @chainglass/shared/interfaces — no adapter/service imports. |
| P5: Fast Feedback | ✅ | Tests < 2s via Vitest, lint < 1s via Biome, cached builds < 1s via Turbo |
| P6: Developer Experience | ✅ | Setup via `pnpm install && just install && just dev`; Phase 8 adds docs/how/ guides |
| P7: Shared by Default | ✅ | INoteService in @chainglass/shared, re-exported via `./interfaces` path with `export type` for isolatedModules |

### Deviation Ledger

| Principle Violated | Scope | Why Needed | Simpler Alternative Rejected | Risk Mitigation | Approved |
|-------------------|-------|------------|------------------------------|-----------------|----------|
| P3 (Full TDD) for UI components | Phases 2, 5, 7 — overlay panels, components, integration wiring | Overlay UI is structurally identical to 3 existing overlays (terminal, activity-log, agents) — TDD would add effort without proportional bug-finding benefit | Full TDD for all components | Lightweight tests after implementation; overlay pattern proven over 3 prior implementations; data layer retains full TDD | Spec clarification Q&A approved hybrid approach |

### Related ADRs

- **ADR-0008** (split storage): Phases 1, 4 use `.chainglass/data/` per-worktree JSONL storage
- **ADR-0010** (central event notification): PR View consumes events via `useFileChanges` hook (existing infrastructure, no new domain event adapters required)
- **ADR-0011** (first-class domain concepts): Phase 1 creates INoteService as first-class service (7 methods, interface-first, contract tests)

### Testing Conventions

- All tests include Test Doc comments per R-TEST-002 (Why, Contract, Usage, Contribution, Example)
- Unit tests placed in `test/unit/web/features/071-*/` and `test/unit/shared/file-notes/`
- Contract tests in `test/contracts/note-service.contract.ts`
- FakeNoteService imports ONLY from `@chainglass/shared/interfaces` and types — zero imports from `.adapter.ts` or service files (R-ARCH-001)

## Phases

### Phase Index

| Phase | Title | Primary Domain | Objective (1 line) | Depends On |
|-------|-------|---------------|-------------------|------------|
| 1 | File Notes Data Layer | file-notes | Types, INoteService, JSONL writer/reader, fakes, contract tests, API routes, server actions | None |
| 2 | File Notes Web UI | file-notes | Notes overlay, note modal, NoteIndicatorDot, sidebar button, SDK commands | Phase 1 |
| 3 | File Notes CLI | file-notes | `cg notes list/add/complete/files` commands with JSON output | Phase 1 |
| 4 | PR View Data Layer | pr-view | Domain setup, reviewed state JSONL, git branch service, per-file diff stats, diff aggregator | None |
| 5 | PR View Overlay | pr-view | Overlay panel with header, file list, collapsible diff sections, sidebar/explorer buttons | Phase 4 |
| 6 | PR View Live Updates + Branch Mode | pr-view | Working/Branch mode toggle, SSE-driven refresh, reviewed auto-invalidation | Phase 5 |
| 7 | Cross-Domain Integration | file-browser, pr-view, file-notes | FileTree note indicators, tree filter, PR View note dots, BrowserClient wiring | Phase 2, Phase 5 |
| 8 | Documentation + Polish | all | Domain docs, how-to guides, registry/domain-map updates, explorer panel buttons | Phase 7 |

---

### Phase 1: File Notes Data Layer

**Objective**: Build the complete data infrastructure for File Notes — types, interface, persistence, API, fakes, and contract tests.
**Domain**: file-notes (NEW)
**Delivers**:
- Note type with generic link-type system (file/workflow/agent-run)
- INoteService interface in `@chainglass/shared`
- JSONL writer (read-modify-rewrite with atomic rename for edits)
- JSONL reader (filter by linkType/target/status/to)
- FakeNoteService with inspection methods
- Contract tests (real + fake parity)
- API routes (GET/POST/PATCH/DELETE)
- Server actions
- Domain scaffold (feature folder, domain.md)
**Depends on**: None
**Key risks**: Append-only edit model needs careful latest-version resolution. Per finding 02.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 1.1 | Create feature folder `apps/web/src/features/071-file-notes/` + `types.ts` with Note, NoteFilter, LinkType, NoteTarget types | file-notes | Types compile, linkType is `'file' \| 'workflow' \| 'agent-run'`, targetMeta is typed per linkType | Per AC-35, AC-36 |
| 1.2 | Create `packages/shared/src/interfaces/note-service.interface.ts` with INoteService (addNote, editNote, completeNote, deleteNote, listNotes, listFilesWithNotes, deleteAllForTarget, deleteAll) | file-notes | Interface exported via `@chainglass/shared/interfaces` using `export type` for isolatedModules, types use generic link system, .interface.ts suffix per R-CODE-003 | Per finding 03, AC-37, ADR-0011 |
| 1.3 | Create note writer in `lib/note-writer.ts` — append for new notes; read-modify-rewrite for edits/deletes | file-notes | Writer appends to `.chainglass/data/notes.jsonl` for new notes. Edits: read all lines, update matching note in memory, write to temp file, atomic rename. Uses `mkdirSync({ recursive: true })` for first write. | Simple read-modify-rewrite. Atomic rename prevents corruption. |
| 1.4 | Create note reader in `lib/note-reader.ts` — read JSONL, parse, filter by linkType/target/status/to | file-notes | Reader parses JSONL lines, applies filters, returns `Note[]` newest-first. Gracefully skips malformed lines. Returns `[]` if file doesn't exist. | Per AC-25, AC-38. Follows activity-log-reader.ts pattern. |
| 1.5 | Create `packages/shared/src/fakes/fake-note-service.ts` with FakeNoteService (in-memory, inspection: getAdded, getEdited, getCompleted) | file-notes | Fake implements INoteService, passes contract tests, imports ONLY from `@chainglass/shared/interfaces` and types — zero imports from .adapter.ts or service files | Constitution P4, R-ARCH-001 |
| 1.6 | Create contract test factory `test/contracts/note-service.contract.ts` + runner, unit tests in `test/unit/web/features/071-file-notes/` | file-notes | Same tests pass against both real JSONL implementation and FakeNoteService. All tests include Test Doc comments (Why/Contract/Usage/Contribution/Example per R-TEST-002) | Constitution P2 |
| 1.7 | Create API route `apps/web/app/api/file-notes/route.ts` (GET list, POST add, PATCH edit/complete, DELETE) | file-notes | API returns correct data with worktree scoping, filters work | Per AC-34, ADR-0008 |
| 1.8 | Create server actions `apps/web/app/actions/notes-actions.ts` (addNote, editNote, completeNote, deleteNotes) | file-notes | Actions use `requireAuth()`, return Result types, delegate to service layer | Security pattern |
| 1.9 | Create `docs/domains/file-notes/domain.md` + update registry.md | file-notes | Domain registered with slug `file-notes`, type `business` | Domain creation workflow |

### Acceptance Criteria (Phase 1)
- [x] AC-34: All note data persists in `.chainglass/data/notes.jsonl`
- [x] AC-35: Notes use a `linkType` field supporting "file", "workflow", "agent-run"
- [x] AC-36: Each link type has its own `targetMeta` shape
- [x] AC-37: Adding a new link type requires no schema migration
- [x] AC-38: API routes support filtering by link type

### Risks (Phase 1)
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Simple rewrite approach for edits | Low | Low | Atomic rename (write-to-temp-then-rename) prevents corruption. Notes volume modest (10s–100s). |
| packages/shared build order | Low | Low | Run `pnpm --filter @chainglass/shared build` before web typecheck (PL-12) |

---

### Phase 2: File Notes Web UI

**Objective**: Build the overlay panel, note modal, indicator dot, sidebar button, and SDK commands for File Notes.
**Domain**: file-notes
**Delivers**:
- Notes overlay (provider, panel, grouped-by-file list)
- Note modal (add/edit with "To" selector)
- NoteCard component with actions (Go to, Complete, Reply)
- BulkDeleteDialog with type-to-confirm YEES
- NoteIndicatorDot component
- Sidebar button + SDK command
- Overlay wrapper in workspace layout
**Depends on**: Phase 1
**Key risks**: Overlay mutual exclusion must follow isOpeningRef guard pattern (PL-08).

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2.1 | Create `hooks/use-notes-overlay.tsx` — overlay provider with `overlay:close-all` mutual exclusion, `notes:toggle` event listener | file-notes | Opening notes closes other overlays, Escape closes notes, isOpeningRef guard prevents self-close | Per PL-08 |
| 2.2 | Create `components/notes-overlay-panel.tsx` — fixed-position panel anchored to overlay anchor, z-index 44 | file-notes | Panel renders at correct position, shows loading/empty/populated states, closes on Escape | Per AC-23 |
| 2.3 | Create `components/note-card.tsx` — renders note with header (author, time, addressee, line), markdown content, actions (Go to, Complete, Reply) | file-notes | Card shows all metadata, Go to link navigates to file+line, Complete toggles status | Per AC-18, AC-19, AC-24 |
| 2.4 | Create `components/note-modal.tsx` — Dialog for add/edit note with markdown textarea and "To" selector (Anyone/Human/Agent) | file-notes | Modal saves note via server action, pre-fills target from context, "To" selector works | Per AC-15, AC-16, AC-17 |
| 2.5 | Create `components/bulk-delete-dialog.tsx` — type-to-confirm dialog requiring "YEES" | file-notes | Delete button disabled until "YEES" typed, supports per-file and all-notes modes | Per AC-26 |
| 2.6 | Create `components/note-indicator-dot.tsx` — 6px blue dot component | file-notes | Renders when hasNotes is true, hidden when false | Per AC-21 |
| 2.7 | Create notes-overlay-wrapper.tsx + mount in workspace layout.tsx | file-notes | Provider + panel wired, overlay renders when toggled | Per finding 08 |
| 2.8 | Add "Notes" sidebar button dispatching `notes:toggle` CustomEvent | file-notes | Button visible when in worktree, click toggles overlay | Per AC-23 |
| 2.9 | Create SDK contribution + register (toggle command, Ctrl+Shift+L keybinding) | file-notes | SDK command toggles notes overlay | Keyboard shortcut |
| 2.10 | Notes overlay supports filtering by status, addressee, and link type | file-notes | Filter dropdown in header, list updates on filter change | Per AC-25 |

### Acceptance Criteria (Phase 2)
- [x] AC-15: Users can add a markdown note to any file via keyboard shortcut
- [x] AC-16: Notes can optionally target a specific line number
- [x] AC-17: Notes can optionally be addressed "to human" or "to agent"
- [x] AC-18: Notes display author, time, addressee, and line reference
- [x] AC-19: Notes can be marked as complete
- [x] AC-20: Notes support replies (flat threading)
- [x] AC-21: File tree shows indicator dot next to files with open notes (component created, wiring in Phase 7)
- [x] AC-23: Notes button in sidebar opens notes overlay
- [x] AC-24: Each note has "Go to" link navigating to file+line
- [x] AC-25: Notes overlay supports filtering
- [x] AC-26: Bulk delete guarded by "YEES" confirmation

---

### Phase 3: File Notes CLI

**Objective**: Add `cg notes` CLI commands for listing, adding, completing, and querying notes.
**Domain**: file-notes
**Delivers**:
- `cg notes list` (all notes, with filters)
- `cg notes list --file <path>` (per-file)
- `cg notes files` (files with notes)
- `cg notes add <file> --content "..." [--line N] [--to human|agent]`
- `cg notes complete <id>`
- `cg notes list --json` (machine-readable output)
**Depends on**: Phase 1 (INoteService interface + JSONL reader/writer)
**Key risks**: CLI DI container must resolve INoteService. Per finding 03.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 3.1 | Create `apps/cli/src/commands/notes.command.ts` with `registerNotesCommand(program)` | file-notes | All subcommands registered: list, files, add, complete | Follow workflow.command.ts pattern |
| 3.2 | Implement `cg notes list` with filters (--file, --status, --to, --link-type, --json) | file-notes | Lists notes with paths, line numbers, content preview, status. JSON mode outputs array. | Per AC-28, AC-29, AC-33 |
| 3.3 | Implement `cg notes files` listing all files with notes | file-notes | Shows file paths with note counts | Per AC-30 |
| 3.4 | Implement `cg notes add` with --content, --line, --to flags | file-notes | Creates note in JSONL, prints confirmation | Per AC-31 |
| 3.5 | Implement `cg notes complete <id>` | file-notes | Marks note complete, prints confirmation | Per AC-32 |
| 3.6 | Register INoteService in CLI DI container + add tests | file-notes | DI resolves service, tests cover all subcommands | Constitution P2 |

### Acceptance Criteria (Phase 3)
- [x] AC-28: `cg notes list` shows all notes
- [x] AC-29: `cg notes list --file <path>` filters to specific file
- [x] AC-30: `cg notes files` lists files with notes
- [x] AC-31: `cg notes add` creates a note
- [x] AC-32: `cg notes complete <id>` marks complete
- [x] AC-33: `cg notes list --json` outputs JSON

---

### Phase 4: PR View Data Layer

**Objective**: Build the data infrastructure for PR View — reviewed state persistence, git branch service, per-file diff stats, and diff aggregation.
**Domain**: pr-view (NEW)
**Delivers**:
- PRViewFile and PRViewFileState types
- Reviewed state JSONL writer/reader with content hash tracking
- Git branch service (getCurrentBranch, getMergeBase)
- Per-file diff stats service (git diff --numstat parser)
- Diff aggregator (fetch all diffs for changed files)
- Domain scaffold (feature folder, domain.md)
**Depends on**: None (parallel with Phases 1-3)
**Key risks**: Content hash computation must be fast for 50+ files. Per spec risk table.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 4.1 | Create feature folder `apps/web/src/features/071-pr-view/` + `types.ts` with PRViewFile, PRViewFileState, ComparisonMode | pr-view | Types compile, ComparisonMode is `'working' \| 'branch'` | Per AC-14a |
| 4.2 | Create `lib/pr-view-state.ts` — JSONL writer/reader for reviewed state with contentHash per file | pr-view | Reviewed status persists, contentHash stored alongside | Per AC-12 |
| 4.3 | Create `lib/git-branch-service.ts` — getCurrentBranch(cwd), getMergeBase(cwd, base) using git rev-parse + git merge-base | pr-view | Returns current branch name and merge-base SHA | Per finding 04 |
| 4.4 | Create `lib/per-file-diff-stats.ts` — parse `git diff [base...] --numstat` into `Map<filePath, { insertions, deletions }>` | pr-view | Returns per-file stats for both Working and Branch modes | Per finding 05, AC-04 |
| 4.5 | Create `lib/diff-aggregator.ts` — fetch changed files + per-file diffs + per-file stats in parallel | pr-view | Returns PRViewFile[] with diffData, stats, status for all changed files | Consumes file-browser working-changes service (finding 06) |
| 4.6 | Create server actions `apps/web/app/actions/pr-view-actions.ts` (fetchPRViewData, saveReviewedState) | pr-view | Actions use requireAuth(), delegate to service layer | Security pattern |
| 4.7 | Create API route `apps/web/app/api/pr-view/route.ts` (GET changed files + diffs, POST reviewed state) | pr-view | API returns aggregated diff data, saves reviewed state | Per AC-12 |
| 4.8 | Create `docs/domains/pr-view/domain.md` + update registry.md | pr-view | Domain registered with slug `pr-view`, type `business` | Domain creation workflow |
| 4.9 | Write unit tests for git-branch-service, per-file-diff-stats, pr-view-state (TDD) | pr-view | All services tested with real git repos (no mocks) | Constitution P3, QT-08 |

### Acceptance Criteria (Phase 4)
- [x] AC-12: Viewed state persists across page refreshes
- [x] AC-14a: Two comparison modes supported (Working + Branch)

### Risks (Phase 4)
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Performance with 50+ files | Medium | High | Parallel diff fetching, lazy content hash computation |
| git merge-base failure on detached HEAD | Low | Medium | Fallback to HEAD comparison with warning |

---

### Phase 5: PR View Overlay

**Objective**: Build the overlay panel with header, file list, collapsible diff sections, sidebar/explorer buttons, and SDK commands.
**Domain**: pr-view
**Delivers**:
- PR View overlay (provider, panel with two-column layout)
- Header with branch name, mode toggle, stats, progress
- Left file list with status badges, +/- counts, viewed checkboxes
- Collapsible diff sections wrapping DiffViewer
- Expand All / Collapse All controls
- Scroll sync (file list ↔ diff area)
- Sidebar button + SDK command
- Overlay wrapper in workspace layout
**Depends on**: Phase 4
**Key risks**: Multiple DiffViewer instances safe per finding 07. Lazy-mount for performance.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 5.1 | Create `hooks/use-pr-view-overlay.tsx` — overlay provider with `overlay:close-all`, `pr-view:toggle` event listener | pr-view | Opening closes other overlays, Escape closes, isOpeningRef guard | Per PL-08 |
| 5.2 | Create `components/pr-view-overlay-panel.tsx` — fixed-position panel, z-index 44, two-column layout (220px file list + flex-1 diff area) | pr-view | Panel renders at overlay anchor position, shows loading/empty/populated states | Per AC-01 |
| 5.3 | Create `components/pr-view-header.tsx` — branch name, Working/Branch toggle, file count, +/- stats, viewed progress bar, Expand All/Collapse All, close button | pr-view | All stats display correctly, mode toggle is functional placeholder (wired Phase 6) | Per AC-03, AC-09 |
| 5.4 | Create `components/pr-view-file-list.tsx` — flat list with status badges (M/A/D/R), +/- counts, viewed checkboxes, click-to-scroll | pr-view | Files render with correct badges and stats, click scrolls to diff section | Per AC-04, AC-06 |
| 5.5 | Create `components/pr-view-diff-section.tsx` — collapsible per-file section wrapping DiffViewer with sticky header, viewed checkbox, "Previously viewed" banner | pr-view | Diff renders in split mode, collapse/expand works, viewed checkbox toggles state | Per AC-05, AC-07 |
| 5.6 | Create `components/pr-view-diff-area.tsx` — scrollable container with IntersectionObserver for scroll sync | pr-view | Scrolling highlights active file in file list | Per AC-06 |
| 5.7 | Create pr-view-overlay-wrapper.tsx + mount in workspace layout.tsx | pr-view | Provider + panel wired, overlay renders when toggled | Per finding 08 |
| 5.8 | Add "PR View" sidebar button dispatching `pr-view:toggle` CustomEvent (git worktrees only) | pr-view | Button visible only when git worktree active, click toggles overlay | Per AC-01, AC-14 |
| 5.9 | Create SDK contribution + register (toggle command, Ctrl+Shift+P keybinding) | pr-view | SDK command toggles PR View overlay | Keyboard shortcut |

### Acceptance Criteria (Phase 5)
- [x] AC-01: PR View button opens overlay
- [x] AC-02: Opening PR View closes other overlays
- [x] AC-03: Header shows branch name, mode toggle, stats, progress
- [x] AC-04: File list shows status badges, +/- counts, viewed checkboxes
- [x] AC-05: Each file shows collapsible diff section
- [x] AC-06: Clicking file scrolls to diff
- [x] AC-07: Checking viewed collapses diff section
- [x] AC-09: Expand All / Collapse All work
- [x] AC-11: State persists across overlay close/reopen
- [x] AC-13: Escape closes overlay
- [x] AC-14: Only appears when git worktree exists

---

### Phase 6: PR View Live Updates + Branch Mode

**Objective**: Wire SSE-driven live updates, reviewed auto-invalidation via content hash, and Working/Branch comparison mode toggle.
**Domain**: pr-view
**Delivers**:
- Working mode: `git diff` (unstaged/uncommitted vs HEAD)
- Branch mode: `git diff main...HEAD` (current branch vs main)
- Mode toggle in header that refreshes file list + diffs
- SSE subscription for live file change detection
- Content hash tracking: reviewed status auto-resets when file changes
- "Previously viewed" indicator when reviewed file changes
**Depends on**: Phase 5
**Key risks**: Content hash computation performance. SSE event filtering.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 6.1 | Wire Working/Branch mode toggle in PR View header — mode change refetches all data from diff aggregator with correct git diff args | pr-view | Switching mode shows different file lists and diffs; Working shows unstaged, Branch shows branch diff | Per AC-14a, AC-14b |
| 6.2 | Implement content hash tracking — compute `git hash-object <file>` on review, compare on overlay open | pr-view | Reviewed status auto-resets when file content changes | Per AC-08 |
| 6.3 | Implement "Previously viewed" indicator — banner on diff section when reviewed file has changed | pr-view | Banner appears below file header, file unchecked in file list | Per AC-08 |
| 6.4 | Subscribe to useFileChanges SSE — refresh diff data when files change on disk | pr-view | New files appear, removed files disappear, changed diffs update | Per AC-10 |
| 6.5 | Add 10s cache for diff data — reopening overlay within 10s shows cached data immediately | pr-view | Fast overlay reopen, stale data refreshes in background | Per PL-09 |
| 6.6 | Write tests for content hash invalidation and mode switching | pr-view | Hash comparison logic tested, mode toggle produces correct git commands | TDD |

### Acceptance Criteria (Phase 6)
- [x] AC-08: Viewed file changes on disk → auto-resets with "Previously viewed"
- [x] AC-10: PR View updates live when files change
- [x] AC-14a: Working + Branch modes both functional
- [x] AC-14b: Toggle switches modes and updates display

---

### Phase 7: Cross-Domain Integration

**Objective**: Wire File Notes indicators into FileTree and PR View, add notes filter toggle, and connect BrowserClient.
**Domain**: file-browser (modify), pr-view, file-notes
**Delivers**:
- NoteIndicatorDot in FileTree next to files with notes
- NoteIndicatorDot in PR View file list
- "Has notes" toggle filter in tree mode
- BrowserClient wiring (note file paths provider, filter state)
- FileTree context menu "Add Note" item
**Depends on**: Phase 2 (Notes UI), Phase 5 (PR View overlay)
**Key risks**: FileTree prop threading needs care (PL-05, PL-06). BrowserClient complexity (PL-07, PL-15).

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 7.1 | Add `noteFilePaths: Set<string>` prop to FileTree + render NoteIndicatorDot per file | file-browser | Blue dot appears next to files with notes | Per AC-21 |
| 7.2 | Add "Add Note" context menu item in FileTree for files | file-browser | Context menu item opens note modal with file pre-filled | Per AC-15 |
| 7.3 | Add "has notes" toggle filter in BrowserClient (like existing "changed" filter) | file-browser | Toggle filters tree to show only files with notes | Per AC-27, OQ-5 |
| 7.4 | Wire BrowserClient to fetch noteFilePaths from API and pass to FileTree | file-browser | Note indicators appear for correct files, update when notes change | Integration wiring |
| 7.5 | Add NoteIndicatorDot to PR View file list for files with notes | pr-view | Blue dot appears in PR View file list next to noted files | Per AC-22 |
| 7.6 | Deleted file detection — notes overlay shows "deleted" indicator for files no longer in worktree | file-notes | Deleted files' notes show indicator, remain visible | Per OQ-2 |

### Acceptance Criteria (Phase 7)
- [x] AC-21: File tree shows indicator dot
- [x] AC-22: PR View file list shows indicator dot
- [x] AC-27: Tree can be filtered to show only files with notes

---

### Phase 8: Documentation + Polish

**Objective**: Create domain docs, how-to guides, update registry and domain-map, add explorer panel buttons, final quality pass.
**Domain**: all
**Delivers**:
- `docs/domains/file-notes/domain.md` finalized with full contracts + composition
- `docs/domains/pr-view/domain.md` finalized
- `docs/domains/registry.md` updated with 2 new rows
- `docs/domains/domain-map.md` updated with 2 new nodes + contract arrows
- `docs/how/file-notes.md` — usage guide
- `docs/how/pr-view.md` — usage guide
- Explorer panel toggle buttons for PR View + Notes
- README CLI section updated with `cg notes` commands
**Depends on**: Phase 7
**Key risks**: None.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 8.1 | Finalize `docs/domains/file-notes/domain.md` with full contracts, composition, source tree, dependencies | file-notes | Domain doc matches implementation | Standard domain format |
| 8.2 | Finalize `docs/domains/pr-view/domain.md` with full contracts, composition, source tree, dependencies | pr-view | Domain doc matches implementation | Standard domain format |
| 8.3 | Update `docs/domains/registry.md` — add file-notes and pr-view rows | — | Registry has 2 new entries | |
| 8.4 | Update `docs/domains/domain-map.md` — add domain nodes + contract dependency arrows | — | Domain map shows new domains with correct relationships | |
| 8.5 | Create `docs/how/file-notes.md` — architecture, link types, JSONL schema, CLI examples | file-notes | Guide covers all user scenarios | Per documentation strategy |
| 8.6 | Create `docs/how/pr-view.md` — usage, comparison modes, reviewed tracking, shortcuts | pr-view | Guide covers both Working and Branch modes | Per documentation strategy |
| 8.7 | Add PR View + Notes toggle buttons to ExplorerPanel header | _platform/panel-layout | Buttons visible in explorer bar, dispatch toggle events | Per workshop UI spec |
| 8.8 | Update README.md CLI section with `cg notes` command reference | — | README documents all notes subcommands with examples | Per documentation strategy |
| 8.9 | Run `just fft` — full quality gate (lint, format, typecheck, test) | — | All checks pass | Pre-merge gate |

### Acceptance Criteria (Phase 8)
- [x] Domain docs created and accurate
- [x] Registry and domain-map updated
- [x] How-to guides exist
- [x] Explorer panel buttons work
- [x] `just fft` passes
