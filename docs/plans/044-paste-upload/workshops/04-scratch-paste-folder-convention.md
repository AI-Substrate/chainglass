# Workshop: Scratch/Paste Folder Convention

**Type**: Storage Design
**Plan**: 044-paste-upload
**Research**: [research-dossier.md](../research-dossier.md)
**Created**: 2026-02-24T07:00:54Z
**Status**: Draft

**Related Documents**:
- [ADR-0008: Workspace Split Storage Data Model](../../../../docs/adr/adr-0008-workspace-split-storage-data-model.md)
- [Binary Upload Server Actions](./01-binary-upload-server-actions.md)

**Domain Context**:
- **Primary Domain**: file-browser (owns the paste/upload UX and folder location)
- **Related Domains**: _platform/file-ops (owns filesystem operations)

---

## Purpose

Define the complete convention for the `scratch/paste/` folder — where it lives, how files are named, how it interacts with git, and what cleanup looks like. This is a working reference for implementation.

## Key Questions Addressed

- Where does `scratch/paste/` live relative to the worktree?
- How are uploaded files named (timestamp format, collision handling)?
- Should the folder be .gitignored?
- What cleanup strategy, if any?
- How does this appear in the file browser tree?

---

## Folder Location

### Convention

```
<worktree>/
├── src/
├── docs/
├── scratch/                    ← Development scratch area
│   └── paste/                  ← Uploaded/pasted files land here
│       ├── 20260224T070054.png
│       ├── 20260224T070112.jpg
│       └── 20260224T070230.pdf
├── .gitignore
└── ...
```

**Why `scratch/paste/`**:
- `scratch/` is already a recognized convention in this codebase (TAD workflow uses `test/scratch/` for ephemeral explorations)
- `paste/` sub-directory keeps uploads separate from other scratch work
- Top-level `scratch/` (not hidden, not nested under `.chainglass/`) because these are user-created content the user may want to see, reference, and share

**Why not `.chainglass/paste/`**:
- `.chainglass/` is for tool-managed data (agent runs, workflow state, workspace config)
- Uploaded files are user content, not tool state
- Users should see these files easily in the file tree

**Why not a custom configurable path**:
- Convention over configuration — one location, easy to remember
- Can always be changed later if needed

---

## File Naming

### Format

```
<ISO-8601-timestamp>.<extension>
```

### Timestamp Format

```
YYYYMMDDTHHMMSS
```

Examples:
- `20260224T070054.png` (screenshot pasted at 07:00:54 UTC)
- `20260224T070112.jpg` (photo dragged at 07:01:12 UTC)
- `20260224T070230.pdf` (PDF selected at 07:02:30 UTC)

### Implementation

```typescript
function generateUploadFilename(originalName: string, mimeType: string): string {
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/[-:]/g, '')  // Remove dashes and colons
    .replace(/\.\d{3}Z$/, '')  // Remove milliseconds and Z
    .slice(0, 15);  // "20260224T070054"

  const ext = extensionFromFilename(originalName)
    || extensionFromMimeType(mimeType)
    || 'bin';

  return `${timestamp}.${ext}`;
}
```

### Collision Handling

Two files uploaded in the same second get a numeric suffix:

```
20260224T070054.png      ← First file
20260224T070054-1.png    ← Second file, same second
20260224T070054-2.png    ← Third file, same second
```

```typescript
async function resolveUniqueFilename(
  dir: string,
  baseName: string,
  fileSystem: IFileSystem
): Promise<string> {
  const dot = baseName.lastIndexOf('.');
  const stem = baseName.slice(0, dot);
  const ext = baseName.slice(dot);

  let candidate = baseName;
  let counter = 1;

  while (await fileSystem.exists(`${dir}/${candidate}`)) {
    candidate = `${stem}-${counter}${ext}`;
    counter++;
  }

  return candidate;
}
```

**Why not milliseconds**: ISO timestamps with milliseconds (`20260224T070054123`) are harder to read and still don't guarantee uniqueness in batch uploads. The `-N` suffix is clearer.

---

## Git Behavior

### .gitignore

The `scratch/` directory should be gitignored. It's ephemeral content — screenshots for a PR description, quick file transfers, etc.

```gitignore
# Already in .gitignore (line 147):
scratch/*
```

✅ **Already handled**: The project's `.gitignore` already has `scratch/*` on line 147 (used by TAD workflow). No changes needed.

### Implications

| Scenario | Behavior |
|----------|----------|
| `git status` | `scratch/paste/` files don't appear |
| `git add .` | Scratch files not staged |
| Branch switching | Scratch files persist (untracked, not cleaned) |
| `git clean -fd` | **Would delete scratch files** — user should know this |
| File browser "Changed" filter | Scratch files won't appear (not tracked by git) |
| File browser tree view | Scratch files **will appear** (tree reads filesystem, not git index) |

### Should Users Be Able to Commit Scratch Files?

**No** by default (gitignored). If a user wants to keep an uploaded file permanently, they can:
1. Move/copy it to a tracked directory
2. Or add `!scratch/paste/important-file.png` to `.gitignore`

This matches the TAD philosophy: scratch is ephemeral, promote what matters.

---

## Directory Auto-Creation

The `scratch/paste/` directory is created **on first upload**, not pre-created.

```typescript
// In the upload server action
const destDir = pathResolver.resolvePath(worktreePath, 'scratch/paste');
await fileSystem.mkdir(destDir, { recursive: true });
// recursive: true creates both scratch/ and scratch/paste/ if needed
```

**Why on-demand**:
- No empty directories cluttering new workspaces
- No `cg init` changes needed
- `mkdir({ recursive: true })` is idempotent — safe to call every upload

---

## File Browser Display

### How Scratch Files Appear in the Tree

Since the file browser uses `git ls-files` for git repos (which respects `.gitignore`), scratch files **won't appear** in the tree by default.

**Options**:

| Approach | Pros | Cons |
|----------|------|------|
| **A: Show scratch/paste/ as special node** | Always visible, clear UX | Requires custom tree logic |
| **B: Use readDir for scratch/** | Shows files without git awareness | Mixed listing modes |
| **C: Don't show in tree** (Recommended for MVP) | Zero tree changes | User must navigate manually |

**Recommendation for MVP**: Don't show in tree. The upload toast shows the file path (`scratch/paste/20260224T070054.png`). Users can copy the path. In a future iteration, add a "Recent uploads" section or a special scratch/paste tree node.

---

## Cleanup Strategy

### MVP: No Automatic Cleanup

Scratch files accumulate until the user manually deletes them. This is fine because:
- Screenshots are small (1-8MB each)
- The folder is gitignored, so it doesn't bloat the repo
- Users who care about disk space can `rm -rf scratch/paste/`

### Future: Optional Cleanup

Potential future additions (not in scope for 044):
- "Clear paste folder" button in the upload modal
- Auto-delete files older than 30 days
- Size warning when paste folder exceeds 100MB

---

## Security Considerations

| Concern | Mitigation |
|---------|------------|
| Path traversal via filename | Server ignores original filename — generates timestamp name |
| Symlink escape | `realpath()` check after write ensures file is within worktree |
| Executable uploads | Files are written as data, not made executable. No `chmod +x` |
| Large file DoS | 10MB size limit enforced in server action |
| Directory traversal in worktreePath | `IPathResolver.resolvePath()` validates path containment |

**Key security property**: The original filename is **never used as the destination filename**. The server generates a timestamp-based name, eliminating path injection attacks entirely.

---

## Cross-Worktree Behavior

Each worktree gets its own `scratch/paste/` directory:

```
/home/jak/substrate/041-file-browser/           ← main worktree
  scratch/paste/20260224T070054.png

/home/jak/substrate/wt-feature-branch/          ← git worktree
  scratch/paste/20260224T070112.jpg
```

**Why per-worktree**: The upload button is contextual to the current worktree (from URL params). Files land where the user is working. No cross-worktree pollution.

---

## Quick Reference

```bash
# Upload destination
<worktree>/scratch/paste/<timestamp>.<ext>

# Example paths
/home/jak/substrate/041-file-browser/scratch/paste/20260224T070054.png
/home/jak/substrate/041-file-browser/scratch/paste/20260224T070112.jpg

# Git status: ignored (scratch/* in .gitignore)
# Created: on first upload (mkdir recursive)
# Naming: ISO timestamp, no original filename
# Collisions: -1, -2 suffix
# Size limit: 10MB per file
# Cleanup: manual (no auto-delete)
```

---

## Open Questions

### Q1: Should we support a user-configurable paste directory?

**RESOLVED**: No. Convention over configuration. `scratch/paste/` is the standard. Users who want files elsewhere can move them after upload.

### Q2: What about non-git worktrees?

**RESOLVED**: Same behavior. `scratch/paste/` is created in the worktree root regardless of git status. The only difference is that in non-git worktrees, scratch files WILL appear in the file browser tree (since the tree falls back to `readDir` without `.gitignore` filtering).

### Q3: Should we preserve the original filename somehow?

**RESOLVED**: No — timestamp only for MVP. `20260224T070054.png` is sufficient. Users can rename files after upload if needed. Appending the original name (e.g., `20260224T070054-screenshot.png`) is a nice future enhancement but adds complexity to collision handling.
