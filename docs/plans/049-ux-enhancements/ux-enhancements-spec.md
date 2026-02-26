# UX Enhancements

**Mode**: Simple

📚 This specification incorporates findings from [research-dossier.md](./research-dossier.md)

> This is a multi-feature spec. Each section below is an independent, low-hanging-fruit UX improvement that can be implemented and shipped separately.

---

## Feature 1: File Change Statistics in FILES Header

### Summary

**WHAT**: Show the number of changed files and total inserted/deleted lines in the LeftPanel header ("FILES") at all times, so users have at-a-glance awareness of workspace modification state without switching to the changes view.

**WHY**: The FILES header is permanently visible but currently displays only a static label. Users managing AI agent fleets need instant awareness of how much has changed in the workspace — "3 files changed, +42 −18 lines" tells them at a glance whether an agent made a small tweak or a large refactor. This reduces context-switching cost and supports the "calm over busy" UX philosophy.

### Goals

- Users see the count of uncommitted changed files in the FILES header at all times (when in a git workspace)
- Users see the total inserted and deleted line counts alongside the file count
- Statistics update immediately when files change in the worktree (via live file events, no manual refresh required)
- Statistics are compact and unobtrusive — they complement the "FILES" title without cluttering the header
- Non-git workspaces show no statistics (graceful degradation)

### Non-Goals

- Per-file line counts in the header (that level of detail belongs in the changes view)
- Staged vs unstaged breakdown in the header (too granular for a glance)
- Statistics for committed changes or git log history
- Clickable stats that navigate somewhere (the stats are informational only)
- Statistics in the ExplorerPanel top bar (only in the LeftPanel header)

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| `file-browser` | existing | **modify** | Add diff stats service, extend `usePanelState` to compute and expose stats |
| `_platform/panel-layout` | existing | **modify** | Extend `PanelHeader` to accept and render optional stats metadata |
| `_platform/events` | existing | **consume** | Existing `useFileChanges('*')` → `handleRefreshChanges()` wiring triggers stats refresh (no changes to domain) |

### Complexity

- **Score**: CS-2 (small)
- **Breakdown**: S=1, I=0, D=0, N=0, F=0, T=1
  - Surface Area (S=1): Touches PanelHeader, LeftPanel, usePanelState, new diff-stats service, BrowserClient wiring — multiple files but within two known domains
  - Integration (I=0): Internal only — git CLI already used extensively
  - Data/State (D=0): No schema changes, no migrations. New state is ephemeral (derived from git output)
  - Novelty (N=0): Well-specified from research. Patterns established in plans 041, 043, 045
  - Non-Functional (F=0): Standard — no new security, performance, or compliance concerns
  - Testing/Rollout (T=1): New diff-stats service needs unit tests. PanelHeader extension needs test updates.
- **Confidence**: 0.95
- **Assumptions**:
  - `git diff --numstat` output is stable and machine-parseable
  - `changedFiles` count from existing `git diff --name-only` is sufficient for file count (no need for `git status` count)
  - The existing `handleRefreshChanges()` call in the `allChanges` effect (browser-client.tsx:184) is the right place to also refresh diff stats
- **Dependencies**: None external — all git commands are standard
- **Risks**: 
  - `git diff --numstat` on a large repo with many changes could be slow — mitigated by debounced event trigger (500ms) and async state update
  - Binary files show `-` in numstat output — parser must handle gracefully
- **Phases**: Single phase — this is a small, self-contained enhancement

### Acceptance Criteria

1. When a git workspace is open in the browser page, the FILES header displays the count of uncommitted changed files (e.g., `FILES · 3 changed`).
2. Alongside the changed file count, the header displays total inserted and deleted line counts using green/red coloring (e.g., `+42 −18`).
3. When no files are changed, the stats area is hidden — the header shows only "FILES" with no additional text.
4. When files change in the worktree (detected by the live file events system via `useFileChanges`), the statistics update automatically within ~1 second without any manual action.
5. In non-git workspaces, no statistics are shown (same as current behavior — just "FILES" title).
6. The stats display is compact — uses `text-xs` sizing, muted foreground for "changed", green-500 for insertions, red-500 for deletions — consistent with established badge color schema (PL-08).
7. Binary files in `git diff --numstat` output (which show `-` for lines) are counted as changed files but contribute 0 to insertion/deletion totals.
8. The diff stats service handles edge cases gracefully: empty output (no changes), binary files, renamed files, and repos with no commits.

### Risks & Assumptions

- **Risk**: `git diff --numstat` adds a git subprocess call per refresh cycle. **Mitigation**: It piggybacks on the existing refresh triggered by `handleRefreshChanges()` — no additional event subscriptions needed. The 500ms debounce on `useFileChanges('*')` prevents rapid-fire calls.
- **Assumption**: The existing `allChanges` → `handleRefreshChanges()` wiring (browser-client.tsx:184) is sufficient — diff stats refresh alongside changed files.
- **Assumption**: Total insertions/deletions (summed across all files) is the right granularity for the header.

### Open Questions

None — all resolved in clarification session.

### Workshop Opportunities

None needed — the design is simple and well-constrained by existing patterns.

### Documentation Strategy

- **Location**: No new documentation
- **Rationale**: CS-2 internal UX tweak. The new `getDiffStats()` service follows established git service patterns (`getChangedFiles()`, `getWorkingChanges()`). PanelHeader prop extension is self-documenting via TypeScript interfaces.

---

## Clarifications

### Session 2026-02-26

**Pre-declared by user**: Simple mode, Full TDD.

| # | Question | Answer | Spec Impact |
|---|----------|--------|-------------|
| Q1 | Workflow Mode? | **Simple** — CS-2 task, single phase, quick path. | Header already set. |
| Q2 | Testing Strategy? | **Full TDD** — red-green-refactor for parser service + component contracts. | Testing Strategy section updated from Lightweight to Full TDD. |
| Q3 | Mock Usage? | **No mocks — fakes only** (per codebase convention QT-08). | Added to Testing Strategy. |
| Q4 | Domain Review? | **Confirmed correct.** `file-browser` owns data + computation, `panel-layout` owns display, `events` consumed unchanged. No breaking changes. | No changes needed. |
| Q5 | Documentation Strategy? | **No new documentation.** Service follows established patterns; TypeScript interfaces are self-documenting. | Documentation Strategy section added. |

### Coverage Summary

| Status | Count | Items |
|--------|-------|-------|
| Resolved | 5 | Mode (Simple), Testing (Full TDD), Mocks (Fakes only), Domains (Confirmed), Docs (None) |
| Deferred | 0 | — |
| Outstanding | 0 | — |

### Testing Strategy

- **Approach**: Full TDD
- **Rationale**: New git parser service has clear inputs/outputs ideal for red-green-refactor. PanelHeader extension is a contract change that benefits from test-first.
- **Mock Usage**: No mocks — fakes only (per codebase convention QT-08). Use existing `FakeFileSystem` patterns where applicable.
- **Focus Areas**:
  - `getDiffStats()` service — numstat parser: normal output, binary files (`-`), renames, empty output, no commits
  - PanelHeader — stats rendering: with stats, without stats, zero changes hidden
  - LeftPanel — stats passthrough from props to PanelHeader
- **Excluded**:
  - BrowserClient wiring (existing integration coverage via plan 045)
  - Event system refresh (already tested in plan 045)
  - Visual styling verification (manual via browser)

---

*Additional UX enhancement features will be added below as they are defined.*
