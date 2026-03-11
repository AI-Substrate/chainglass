# PR View

Usage guide for the GitHub-style change review overlay with comparison modes, reviewed tracking, and live updates.

## Overview

PR View shows all worktree changes in a single scrollable overlay with collapsible per-file diffs, status badges, and persistent reviewed-file tracking. It supports two comparison modes and updates live as files change on disk.

Key capabilities:
- **Two comparison modes** — Working (uncommitted vs HEAD) and Branch (feature branch vs main)
- **Per-file diffs** with syntax highlighting via Shiki
- **Reviewed tracking** — mark files as viewed, auto-resets when content changes
- **Live updates** — SSE-driven refresh as files change on disk
- **File list** with status badges (M/A/D/R/?), insertion/deletion counts, and note indicators

## Opening PR View

- **Explorer panel**: Click the GitPullRequest icon in the explorer panel top bar
- **Keyboard shortcut**: `Ctrl+Shift+R` (or `Cmd+Shift+R` on macOS)
- **SDK command**: `prView.toggleOverlay`

PR View is mutually exclusive with other overlays (Terminal, Activity Log, Notes). Opening one closes the others.

## Comparison Modes

### Working Mode (Default)

Shows uncommitted changes — the diff between your working tree and HEAD (`git diff` + untracked files).

Use this when you're actively editing and want to see what you've changed since the last commit.

### Branch Mode

Shows branch changes — the diff between your current branch and main (`git diff main...HEAD`).

Use this when reviewing all changes on a feature branch before merging. If you're already on main, Branch mode shows an info message explaining there are no branch-specific changes.

### Switching Modes

Click **Working** or **Branch** in the header toggle. The file list, diffs, and stats update immediately. Collapsed state resets on mode switch (different file sets between modes).

## Reviewing Files

### Mark as Viewed

Click the checkbox next to a file in the file list, or the checkbox in the diff section header. Viewed files:
- Collapse automatically
- Dim in the file list (reduced opacity)
- Show a progress indicator in the header

### Auto-Invalidation

If a viewed file changes on disk, the viewed status automatically resets and a **"Previously reviewed — file has changed"** banner appears in amber. This uses content hashing (`git hash-object`) to detect changes.

### Expand All / Collapse All

Use the header buttons to expand or collapse all file sections at once.

## File List Navigation

The left column (220px) shows all changed files. Click any file to smooth-scroll to its diff section in the right area. The active file is highlighted in the list.

Each file entry shows:
- **Status badge** — M (modified/amber), A (added/green), D (deleted/red), R (renamed/blue), ? (untracked/muted)
- **Note indicator** — blue dot if the file has notes (from File Notes)
- **+/- counts** — insertion and deletion counts
- **Viewed checkbox** — check to mark as reviewed

## Live Updates

PR View subscribes to file change events via SSE (Server-Sent Events) with a 300ms debounce. When files change:
- New files appear in the list
- Removed files disappear
- Changed diffs update
- Reviewed status auto-invalidates if content changed

The header shows a subtle refresh spinner during background updates (split loading — initial load is full-screen, subsequent refreshes are non-blocking).

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+R` | Toggle PR View overlay |
| `Escape` | Close PR View |

## Data Persistence

Reviewed-file state is stored per-worktree in `.chainglass/data/pr-view-state.jsonl`:
- Persists across overlay close/reopen
- Persists across page refreshes
- Content hash stored per reviewed file for auto-invalidation
- Shared across comparison modes (same file reviewed in both)

## Architecture

### Data Flow

```
BrowserClient → pr-view:toggle event → PRViewOverlayProvider
  → PRViewPanelContent (useFileChanges SSE subscription)
    → usePRViewData hook (fetch → cache → optimistic mutations)
      → aggregatePRViewData server action
        → git diff / git diff main...HEAD
        → per-file stats (git diff --numstat)
        → reviewed state (JSONL load + content hash check)
    → PRViewHeader (mode toggle, stats, controls)
    → PRViewFileList (status badges, note dots, viewed checkboxes)
    → PRViewDiffArea (collapsible DiffViewer sections, scroll sync)
```

### Performance

- **Single git command** for all diffs (`git diff HEAD` split by file header)
- **Lazy-mount DiffViewers** — only render when section is expanded AND visible (IntersectionObserver)
- **10-second cache** — reopening within 10s shows cached data immediately
- **Generation counter** — prevents stale responses from overwriting fresh data on rapid mode switches

## Related Documentation

- [Domain definition](../domains/pr-view/domain.md)
- [File Notes guide](./file-notes.md) (note indicators in PR View)
- [SSE Integration](./sse-integration.md) (live update infrastructure)
- [Viewer Patterns](./viewer-patterns.md) (DiffViewer)
