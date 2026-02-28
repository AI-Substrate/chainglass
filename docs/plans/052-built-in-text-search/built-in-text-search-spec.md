# Built-in Content Search

**Mode**: Simple

## Research Context

📚 This specification incorporates findings from `research-dossier.md` and benchmarking.

`git grep` searches file content in ~60ms across a 2,703-file monorepo — zero indexing, zero dependencies, always in sync with the working tree. It supports case-insensitive matching, regex, and file-type filtering. The existing `git-diff-action.ts` provides the proven `execFile` subprocess pattern. No new npm packages needed.

## Summary

**WHAT**: When a user types `# <query>` in the explorer bar, the app searches file CONTENT across the workspace using `git grep` via subprocess. Results show matching files with line numbers and context snippets. This is a content search — finding where code is used, not just which files exist.

**WHY**: The plain-text file search (`no prefix`) finds files by path/name. The `#` mode fills the gap: finding code INSIDE files — references, function calls, string literals, config values. `git grep` is ideal: 60ms for full content search, zero indexing, always in sync with git, already installed. FlowSpace semantic search (`$` prefix, Plan 051) becomes the premium upgrade for conceptual/AI-powered search.

## Goals

- `#` search works out of the box on any git workspace — no external tools, no setup, no indexing
- Searches file CONTENT, not just file names — find references, function calls, strings, config values
- Results show: filename, line number, and matching line context snippet
- Results appear within 300ms (git grep is ~60ms, plus debounce)
- Selecting a result navigates to the file at the matching line
- The existing keyboard navigation pattern (ArrowUp/Down, Enter, Escape) works identically to other modes

## Non-Goals

- Fuzzy matching (git grep is exact/regex — fuzzy is FlowSpace's job via `$`)
- Indexing or caching content (git grep reads directly from the git index — always fresh)
- Searching non-git files (untracked files not in git index — rare edge case)
- Replacing the plain-text file search (no prefix) — that searches file PATHS, this searches file CONTENT
- Semantic/conceptual search (that's `$` mode via FlowSpace, Plan 051)

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| _platform/panel-layout | existing | **modify** | Update `symbols` dropdown mode to render MiniSearch results instead of (or alongside) FlowSpace results |
| file-browser | existing | **modify** | New `useBuiltInSearch` hook with MiniSearch index, seeded from file-list service, updated via SSE |
| _platform/events | existing | **consume** | Use `useFileChanges('*')` for incremental index updates (no changes to events domain) |

No new domains. This is a capability enhancement within existing domains, following the exact pattern of Plan 049 Feature 2 (file search) and Plan 051 (FlowSpace search).

## Complexity

- **Score**: CS-2 (small)
- **Breakdown**: S=1, I=1, D=0, N=0, F=0, T=1
- **Confidence**: 0.90
- **Assumptions**:
  - MiniSearch handles ~10K file path documents efficiently in-memory (~2-5MB)
  - `git ls-files` provides the file list (already implemented in `file-list.ts`)
  - SSE file change events provide reliable add/remove/change notifications
  - 300ms debounce is sufficient to avoid excessive search calls
- **Dependencies**:
  - `git` CLI (already used throughout the codebase for file-list, diff, working-changes)
  - Existing `git-diff-action.ts` pattern for `execFile`
- **Risks**:
  - Git grep on very large repos could be slow (>500ms) — mitigated by debounce
  - Many matches for broad queries — mitigated by limiting to 20 files
- **Phases**:
  1. Single phase: install MiniSearch, build server-side index service, create hook, wire to `#` mode

## Acceptance Criteria

- **AC-01**: Typing `# useFileFilter` shows files containing that text within 500ms of debounce completing
- **AC-02**: Each result displays: filename, line number, and the matching line (trimmed, with query highlighted)
- **AC-03**: Results are grouped by file — multiple matches in one file show as one entry with match count
- **AC-04**: Arrow keys navigate results, Enter selects (navigates to file at matching line), Escape exits
- **AC-05**: Search is debounced (300ms) — results update as the user types after the `#` prefix
- **AC-06**: Only source files are searched by default (`.ts`, `.tsx`, `.js`, `.jsx`, `.json`, `.md`, `.yaml`, `.yml`, `.css`) — binary files excluded
- **AC-07**: Regex patterns work — `# function.*search` matches regex-capable git grep
- **AC-08**: Case-insensitive by default — `# explorerPanel` finds `ExplorerPanel`
- **AC-09**: When not in a git repository, `#` mode shows "Git repository required for content search"
- **AC-10**: Loading spinner shows while git grep is running
- **AC-11**: Quick Access hints show `#` as "Content search" — always available in git repos
- **AC-12**: If git grep returns no results, shows "No matches"
- **AC-13**: Right-click context menu on results: Copy Full Path, Copy Relative Path, Copy Content, Download
- **AC-14**: Results are limited to 20 files (git grep may find hundreds — cap display)

## Risks & Assumptions

| Risk | Impact | Mitigation |
|------|--------|------------|
| Large repos slow git grep | >500ms response | Debounce 300ms, limit results to 20 files |
| Broad queries (e.g., `# the`) flood results | Too many matches | Limit to 20 files, show match count |
| Not in a git repo | Feature unavailable | AC-09: show clear message |
| Binary files in results | Garbage output | AC-06: restrict to source file extensions |

**Assumptions**:
- `git` is available (already required by the codebase — file-list, diff, working-changes all use it)
- `git grep` output format is stable (it's been stable for 15+ years)
- Server-side `execFile` pattern is proven (same as `git-diff-action.ts`)

## Open Questions

_None — design is straightforward based on research._

## Workshop Opportunities

_None — CS-2 feature following established patterns._
