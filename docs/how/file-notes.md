# File Notes

Architecture, usage guide, and extension reference for the File Notes annotation system.

## Overview

File Notes is a generic annotation system where humans and agents attach markdown notes to files, workflow nodes, or agent runs. Notes persist per-worktree in `.chainglass/data/notes.jsonl` and are committed to git, building cross-worktree history through merges.

Key capabilities:
- **Markdown notes** on any file (with optional line number targeting)
- **Addressee targeting** — notes can be directed "to human" or "to agent"
- **Threading** — flat replies (one level deep) on any note
- **Completion tracking** — mark notes as complete (recording who completed)
- **Cross-domain indicators** — blue dots in the file tree and PR View file list
- **CLI access** — full note lifecycle via `cg notes` commands
- **Generic link types** — extensible to workflow nodes and agent runs

## Adding Notes

### From the File Tree (Context Menu)

Right-click any file in the tree and select **"Add Note"**. The modal opens with the file path pre-filled. Optionally specify a line number and addressee.

### From the Notes Overlay

Click the **Notes** button (StickyNote icon) in the sidebar or explorer panel, then click the **"+"** button in the overlay header. Type a file path and note content.

### From the CLI

```bash
# Add a note to a file
cg notes add src/auth/login.ts --content "Review the error handling here"

# Add a note with line number and addressee
cg notes add src/auth/login.ts --content "This needs rate limiting" --line 42 --to agent

# Add a note as an agent
cg notes add src/auth/login.ts --content "Rate limiting added" --author agent
```

## Viewing Notes

### Notes Overlay

The overlay (sidebar StickyNote button or `Ctrl+Shift+L`) shows all notes grouped by file. Each group is collapsible and shows:
- File path with note count badge
- "Deleted" badge if the file no longer exists
- Per-file delete button

Each note card shows:
- Author (human/agent), timestamp, optional line reference
- Addressee tag (blue = human, purple = agent) if specified
- Markdown content
- Action buttons: Go to, Edit, Reply, Complete

### Filtering

The overlay filter dropdown supports:
- **All** / **Open** / **Complete** — by status
- **To Human** / **To Agent** — by addressee
- **Type: File** / **Type: Workflow** / **Type: Agent Run** — by link type

### File Tree Indicators

Files with open notes show a small blue dot next to their name in the file tree. The tree can be filtered to show only files with notes using the StickyNote toggle button above the tree.

### PR View Indicators

When PR View is open, files with notes show a blue dot next to their status badge in the file list.

## Managing Notes

### Completing Notes

Click the checkmark button on a note card, or via CLI:

```bash
cg notes complete <note-id>
cg notes complete <note-id> --by agent
```

### Editing Notes

Click the edit button on a note card to modify content or addressee.

### Replying to Notes

Click the reply button to add a threaded reply (flat — one level deep).

### Bulk Delete

- **Per-file**: Click the trash icon on a file group header
- **All notes**: Click the trash icon in the overlay header

Both require typing **"YEES"** to confirm (safety gate).

## CLI Reference

```bash
# List all notes
cg notes list

# List notes for a specific file
cg notes list --file src/auth/login.ts

# List with filters
cg notes list --status open --to agent

# JSON output (for agent consumption)
cg notes list --json

# List files that have notes
cg notes files

# Add a note
cg notes add <file> --content "note text" [--line N] [--to human|agent] [--author human|agent]

# Mark as complete
cg notes complete <note-id> [--by human|agent]
```

## Architecture

### Data Model

Notes use a discriminated union keyed by `linkType`:

| Link Type | Target | Target Meta | Example |
|-----------|--------|-------------|---------|
| `file` | Relative file path | `{ line?: number }` | `src/auth/login.ts` |
| `workflow` | Workflow ID | `{ nodeId?: string }` | `wf-abc-123` |
| `agent-run` | Run ID | `{ step?: string }` | `run-xyz-456` |

### Persistence

Notes are stored as JSONL (one JSON object per line) in `.chainglass/data/notes.jsonl`. Operations:
- **New notes**: Appended to file
- **Edits/deletes**: Read-modify-rewrite with atomic rename (temp file then rename)
- **Merge-safe**: JSONL lines are independent, git merges cleanly

### Cross-Domain Events

After any note CRUD operation, a `notes:changed` CustomEvent is dispatched on `window`. Consumers (BrowserClient, PR View overlay) listen for this event to refresh their note indicator state immediately.

## Extending Link Types

To add a new link type (e.g., `deployment`):

1. Add the type to `NoteLinkType` union in `packages/shared/src/file-notes/types.ts`
2. Add `targetMeta` shape to `TargetMetaFor<T>` conditional type
3. No schema migration needed — existing JSONL data is unaffected
4. Add filtering/rendering support in the overlay and CLI as needed

## Related Documentation

- [Domain definition](../domains/file-notes/domain.md)
- [PR View guide](./pr-view.md)
- [SSE Integration](./sse-integration.md) (notes:changed event pattern)
