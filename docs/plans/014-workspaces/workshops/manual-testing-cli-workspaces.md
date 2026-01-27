# Workshop: Manual CLI Testing for Workspaces and Worktrees

**Type**: CLI Flow
**Plan**: 014-workspaces
**Spec**: [../../workspaces-spec.md](../../workspaces-spec.md)
**Created**: 2026-01-27
**Status**: Approved

**Related Documents**:
- [Workspaces Plan](../../workspaces-plan.md)
- [Phase 5 Tasks (CLI Commands)](../tasks/phase-5-cli-commands/tasks.md)

---

## Purpose

Validate that the CLI workspace and sample commands work correctly with:
1. Real filesystem storage (global registry + per-worktree data)
2. Git worktree detection and context resolution
3. CWD-based context resolution (no `--workspace-path` override needed when inside a workspace)

## Key Questions Addressed

- Does the global registry persist at `~/.config/chainglass/workspaces.json`?
- Does per-worktree sample data persist at `<worktree>/.chainglass/data/samples/`?
- Can CLI detect which workspace/worktree you're in from CWD?
- Do worktrees get listed and can samples be stored independently in each?

---

## Manual Test Results (2026-01-27)

### ✅ All Tests Passed

| # | Test | Result | Notes |
|---|------|--------|-------|
| 1 | `workspace add` | ✅ Pass | Creates entry in ~/.config/chainglass/workspaces.json |
| 2 | `workspace list` | ✅ Pass | Shows registered workspaces |
| 3 | `workspace info` | ✅ Pass | Shows git worktrees when present |
| 4 | `sample add` (main) | ✅ Pass | Creates file in main worktree's .chainglass/data/samples/ |
| 5 | `sample list` (main) | ✅ Pass | Shows samples from main worktree only |
| 6 | `sample add` (linked) | ✅ Pass | Creates file in linked worktree's .chainglass/data/samples/ |
| 7 | `sample list` (linked) | ✅ Pass | Shows samples from linked worktree only (separate from main) |
| 8 | CWD context resolution | ✅ Pass | CLI auto-detects workspace from CWD |
| 9 | Linked worktree detection | ✅ Pass | CLI recognizes linked worktrees as part of workspace |
| 10 | `sample delete --force` | ✅ Pass | Removes sample file |
| 11 | `workspace remove --force` | ✅ Pass | Removes registry entry, keeps files |

### Bugs Fixed During Testing

1. **Tilde expansion bug**: Registry was being written to `./~/.config/chainglass/` instead of `~/.config/chainglass/`. Fixed by expanding `~` to `$HOME` in `WorkspaceRegistryAdapter`.

2. **Worktree detection missing**: `WorkspaceContextResolver` wasn't using `GitWorktreeResolver` to detect linked worktrees. Fixed by adding `IGitWorktreeResolver` dependency and checking worktrees in `resolveFromPath()`.

---

## Key Concepts

### Workspace vs Worktree

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        WORKSPACE (Registered Folder)                        │
│                                                                             │
│  A workspace is a folder registered in the global registry.                 │
│  It can be any folder - doesn't have to be a git repo.                      │
│                                                                             │
│  Stored in: ~/.config/chainglass/workspaces.json                            │
│                                                                             │
│  {                                                                          │
│    "workspaces": [                                                          │
│      { "slug": "vibe-kanban", "name": "Vibe Kanban",                        │
│        "path": "/home/jak/github/vibe-kanban", "createdAt": "..." }         │
│    ]                                                                        │
│  }                                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        WORKTREE (Git Checkout)                              │
│                                                                             │
│  If the workspace is a git repo, it can have multiple worktrees.            │
│  Each worktree is a separate checkout of the same repository.               │
│                                                                             │
│  Main worktree:     /home/jak/github/vibe-kanban (branch: main)             │
│  Linked worktree:   /home/jak/github/vibe-kanban-feature (branch: feature)  │
│                                                                             │
│  Detected via: git worktree list --porcelain                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                   PER-WORKTREE DATA (Samples, etc.)                         │
│                                                                             │
│  Each worktree has its own .chainglass/data/ directory.                     │
│  Data created in one worktree is independent of others.                     │
│  Data travels with git (can be committed and merged).                       │
│                                                                             │
│  Main worktree data:                                                        │
│    /home/jak/github/vibe-kanban/.chainglass/data/samples/my-sample.json     │
│                                                                             │
│  Linked worktree data:                                                      │
│    /home/jak/github/vibe-kanban-feature/.chainglass/data/samples/test.json  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Context Resolution

When you run `cg sample add "My Sample"`:

1. CLI calls `WorkspaceService.resolveContext(process.cwd())`
2. Service walks up directory tree from CWD
3. Finds registered workspace whose path is ancestor of CWD
4. Detects if CWD is in a git worktree
5. Returns `WorkspaceContext` with:
   - `workspaceSlug`: URL-safe identifier
   - `workspacePath`: Root of registered workspace
   - `worktreePath`: Current worktree (may differ from workspacePath)
   - `worktreeBranch`: Current git branch
   - `isMainWorktree`: True if in main checkout

**Key Point**: When you're inside a worktree, the CLI automatically uses that worktree's path for sample storage. No `--workspace-path` flag needed.

---

## Test Environment Setup

### Test Subject: vibe-kanban

```
/home/jak/github/vibe-kanban/          # Main git repo (branch: main)
└── .chainglass/                       # Will be created
    └── data/
        └── samples/                   # Sample JSON files here
```

### Create a Worktree for Testing

```bash
# We'll create a linked worktree in ~/github/vibe-kanban-test
cd ~/github/vibe-kanban
git worktree add ../vibe-kanban-test -b test-worktree

# After this:
# /home/jak/github/vibe-kanban/       (main branch)
# /home/jak/github/vibe-kanban-test/  (test-worktree branch)
```

---

## Manual Test Procedure

### Phase 1: Workspace Registration

```bash
# Ensure clean slate
rm -f ~/.config/chainglass/workspaces.json
```

#### Test 1.1: Register a workspace

```bash
$ cg workspace add "Vibe Kanban" /home/jak/github/vibe-kanban

Expected output:
┌─────────────────────────────────────┐
│ ✓ Workspace added                   │
│   Slug: vibe-kanban                 │
│   Name: Vibe Kanban                 │
│   Path: /home/jak/github/vibe-kanban│
└─────────────────────────────────────┘
```

#### Test 1.2: Verify registry file created

```bash
$ cat ~/.config/chainglass/workspaces.json

Expected:
{
  "workspaces": [
    {
      "slug": "vibe-kanban",
      "name": "Vibe Kanban",
      "path": "/home/jak/github/vibe-kanban",
      "createdAt": "2026-01-27T..."
    }
  ]
}
```

#### Test 1.3: List workspaces

```bash
$ cg workspace list

Expected:
┌──────────────┬─────────────────────────────────────┐
│ Workspaces (1)                                     │
├──────────────┼─────────────────────────────────────┤
│ vibe-kanban  │ /home/jak/github/vibe-kanban        │
└──────────────┴─────────────────────────────────────┘
```

#### Test 1.4: Get workspace info (shows worktrees)

```bash
$ cg workspace info vibe-kanban

Expected (before creating linked worktree):
┌─────────────────────────────────────────────────────┐
│ Workspace: vibe-kanban                              │
│ Path: /home/jak/github/vibe-kanban                  │
│ Git Repository: Yes                                 │
│                                                     │
│ Worktrees (1):                                      │
│   • vibe-kanban (main)                              │
└─────────────────────────────────────────────────────┘
```

---

### Phase 2: Git Worktree Setup

```bash
# Create linked worktree for testing
$ cd ~/github/vibe-kanban
$ git worktree add ../vibe-kanban-test -b test-worktree

Preparing worktree (new branch 'test-worktree')
HEAD is now at 5e11838 <commit message>
```

#### Test 2.1: Verify worktree shows in workspace info

```bash
$ cg workspace info vibe-kanban

Expected (after creating linked worktree):
┌─────────────────────────────────────────────────────┐
│ Workspace: vibe-kanban                              │
│ Path: /home/jak/github/vibe-kanban                  │
│ Git Repository: Yes                                 │
│                                                     │
│ Worktrees (2):                                      │
│   • vibe-kanban (main)                              │
│   • vibe-kanban-test (test-worktree)                │
└─────────────────────────────────────────────────────┘
```

---

### Phase 3: Sample CRUD in Main Worktree

```bash
# Change to main worktree
$ cd ~/github/vibe-kanban
```

#### Test 3.1: Create sample (CWD-based context)

```bash
$ cg sample add "Main Sample" --content "This is data in the main branch"

Expected:
┌─────────────────────────────────────────────────────┐
│ ✓ Sample created                                    │
│   Slug: main-sample                                 │
│   Name: Main Sample                                 │
│   Workspace: vibe-kanban                            │
│   Worktree: vibe-kanban                             │
│   Path: /home/jak/github/vibe-kanban/.chainglass/   │
│         data/samples/main-sample.json               │
└─────────────────────────────────────────────────────┘
```

#### Test 3.2: Verify sample file created

```bash
$ cat ~/github/vibe-kanban/.chainglass/data/samples/main-sample.json

Expected:
{
  "slug": "main-sample",
  "name": "Main Sample",
  "description": "This is data in the main branch",
  "createdAt": "2026-01-27T...",
  "updatedAt": "2026-01-27T..."
}
```

#### Test 3.3: List samples (should show 1)

```bash
$ cg sample list

Expected:
┌───────────────────────────────────────────────────────┐
│ Samples in vibe-kanban / vibe-kanban (1)              │
├─────────────┬─────────────────────────────────────────┤
│ main-sample │ Main Sample                             │
└─────────────┴─────────────────────────────────────────┘
```

#### Test 3.4: Get sample info

```bash
$ cg sample info main-sample

Expected:
┌─────────────────────────────────────────────────────┐
│ Sample: main-sample                                 │
│ Name: Main Sample                                   │
│ Content: This is data in the main branch            │
│ Created: 2026-01-27T...                             │
│ Updated: 2026-01-27T...                             │
│ Workspace: vibe-kanban                              │
│ Worktree: vibe-kanban                               │
└─────────────────────────────────────────────────────┘
```

---

### Phase 4: Sample CRUD in Linked Worktree

```bash
# Change to linked worktree
$ cd ~/github/vibe-kanban-test
```

#### Test 4.1: List samples (should be empty - separate storage)

```bash
$ cg sample list

Expected:
┌───────────────────────────────────────────────────────┐
│ Samples in vibe-kanban / vibe-kanban-test (0)         │
│                                                       │
│ No samples found                                      │
└───────────────────────────────────────────────────────┘
```

**Key Validation**: The linked worktree has EMPTY sample list because each worktree has its own `.chainglass/data/` directory.

#### Test 4.2: Create sample in linked worktree

```bash
$ cg sample add "Test Sample" --content "This is data in the test branch"

Expected:
┌─────────────────────────────────────────────────────┐
│ ✓ Sample created                                    │
│   Slug: test-sample                                 │
│   Name: Test Sample                                 │
│   Workspace: vibe-kanban                            │
│   Worktree: vibe-kanban-test                        │
│   Path: /home/jak/github/vibe-kanban-test/          │
│         .chainglass/data/samples/test-sample.json   │
└─────────────────────────────────────────────────────┘
```

#### Test 4.3: Verify sample stored in correct location

```bash
$ cat ~/github/vibe-kanban-test/.chainglass/data/samples/test-sample.json

Expected:
{
  "slug": "test-sample",
  "name": "Test Sample",
  "description": "This is data in the test branch",
  ...
}

$ ls ~/github/vibe-kanban/.chainglass/data/samples/
Expected: main-sample.json (only - test-sample is NOT here)

$ ls ~/github/vibe-kanban-test/.chainglass/data/samples/
Expected: test-sample.json (only - main-sample is NOT here)
```

#### Test 4.4: List samples in linked worktree

```bash
$ cg sample list

Expected:
┌───────────────────────────────────────────────────────┐
│ Samples in vibe-kanban / vibe-kanban-test (1)         │
├─────────────┬─────────────────────────────────────────┤
│ test-sample │ Test Sample                             │
└─────────────┴─────────────────────────────────────────┘
```

---

### Phase 5: Context Override with --workspace-path

```bash
# From anywhere, use --workspace-path to target a specific worktree
$ cd /tmp
```

#### Test 5.1: List samples with explicit path

```bash
$ cg sample list --workspace-path /home/jak/github/vibe-kanban

Expected: Shows main-sample from main worktree

$ cg sample list --workspace-path /home/jak/github/vibe-kanban-test

Expected: Shows test-sample from linked worktree
```

---

### Phase 6: Cleanup

#### Test 6.1: Delete samples

```bash
$ cd ~/github/vibe-kanban-test
$ cg sample delete test-sample --force

Expected:
✓ Sample deleted: test-sample

$ cd ~/github/vibe-kanban
$ cg sample delete main-sample --force

Expected:
✓ Sample deleted: main-sample
```

#### Test 6.2: Remove workspace

```bash
$ cg workspace remove vibe-kanban --force

Expected:
┌─────────────────────────────────────────────────────┐
│ ✓ Workspace removed                                 │
│   Slug: vibe-kanban                                 │
│   Note: Folder not modified, only registry entry    │
└─────────────────────────────────────────────────────┘
```

#### Test 6.3: Remove git worktree

```bash
$ cd ~/github/vibe-kanban
$ git worktree remove ../vibe-kanban-test
$ git branch -d test-worktree

# Clean up .chainglass directories if desired
$ rm -rf ~/github/vibe-kanban/.chainglass
```

---

## Validation Checklist

| # | Test | Expected Behavior | ✓ |
|---|------|-------------------|---|
| 1 | `workspace add` | Creates entry in ~/.config/chainglass/workspaces.json | |
| 2 | `workspace list` | Shows registered workspaces | |
| 3 | `workspace info` | Shows git worktrees when present | |
| 4 | `sample add` (main) | Creates file in main worktree's .chainglass/data/samples/ | |
| 5 | `sample list` (main) | Shows samples from main worktree only | |
| 6 | `sample add` (linked) | Creates file in linked worktree's .chainglass/data/samples/ | |
| 7 | `sample list` (linked) | Shows samples from linked worktree only (separate from main) | |
| 8 | CWD context resolution | CLI auto-detects workspace from CWD | |
| 9 | `--workspace-path` override | Can target any worktree from any directory | |
| 10 | `sample delete --force` | Removes sample file | |
| 11 | `workspace remove --force` | Removes registry entry, keeps files | |

---

## Error Cases to Test

### Test E1: No workspace context

```bash
$ cd /tmp
$ cg sample list

Expected error:
✗ No workspace context found
  Current directory is not inside a registered workspace.
  Run: cg workspace list
```

### Test E2: Workspace not found

```bash
$ cg workspace info nonexistent

Expected error:
✗ Workspace 'nonexistent' not found
  Run: cg workspace list
```

### Test E3: Remove without --force

```bash
$ cg workspace remove vibe-kanban

Expected error:
✗ The --force flag is required for destructive operations
  Run: cg workspace remove vibe-kanban --force
```

---

## Quick Reference Commands

```bash
# Workspace commands
cg workspace add "Name" /path/to/folder
cg workspace list
cg workspace info <slug>
cg workspace remove <slug> --force

# Sample commands (run from inside workspace/worktree)
cg sample add "Name" --content "description"
cg sample list
cg sample info <slug>
cg sample delete <slug> --force

# Override context
cg sample list --workspace-path /path/to/worktree

# JSON output for scripting
cg workspace list --json
cg sample list --json
```

---

## Storage Paths Reference

| Data | Location |
|------|----------|
| Global workspace registry | `~/.config/chainglass/workspaces.json` |
| Per-worktree samples | `<worktree>/.chainglass/data/samples/<slug>.json` |
| Per-worktree agents (future) | `<worktree>/.chainglass/data/agents/<slug>.json` |
| Per-worktree workflows (future) | `<worktree>/.chainglass/data/workflows/<slug>.json` |

---

## Open Questions

### Q1: Should .chainglass be gitignored?

**Decision Required**: If .chainglass/data/ is committed to git, it will merge across branches. If ignored, data is local-only.

**Recommendation**: Commit it - enables team collaboration and data traveling with branches.

### Q2: What happens when workspace path is deleted?

**Current Behavior**: Workspace remains in registry but context resolution will fail.

**Recommendation**: Add `cg workspace prune` command to clean stale entries (future phase).
