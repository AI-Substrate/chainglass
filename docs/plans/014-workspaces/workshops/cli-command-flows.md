# Workshop: CLI Command Flows

**Type**: CLI Flow
**Plan**: 014-workspaces
**Spec**: [workspaces-spec.md](../workspaces-spec.md)
**Created**: 2026-01-27
**Status**: Draft

**Related Documents**:
- [Data Files & Storage Structure Workshop](./data-files-storage-structure.md)
- [Acceptance Criteria AC-01 through AC-13, AC-22, AC-23](../workspaces-spec.md#acceptance-criteria)
- [Existing CLI Commands](../../../../apps/cli/src/commands/)

---

## Purpose

This workshop defines the **exact CLI interface** for workspace and sample commands. It specifies command syntax, argument patterns, output formats, error messages, and flag behavior. Use this as a reference during Phase 5 implementation.

## Key Questions Addressed

1. What is the exact syntax for each `cg workspace` and `cg sample` command?
2. How does context resolution work (CWD vs `-C` flag)?
3. What do console and JSON outputs look like for each command?
4. How are errors presented to users with actionable guidance?
5. What confirmation prompts exist and when do they appear?

---

## Command Summary

### Workspace Commands (`cg workspace`)

| Command | Purpose | Context |
|---------|---------|---------|
| `cg workspace add <name> <path>` | Register a folder as workspace | Global registry |
| `cg workspace list` | List all registered workspaces | Global registry |
| `cg workspace info <slug>` | Show workspace details + worktrees | Global registry |
| `cg workspace remove <slug>` | Unregister workspace (keeps files) | Global registry |

### Sample Commands (`cg sample`)

| Command | Purpose | Context |
|---------|---------|---------|
| `cg sample add <name>` | Create a new sample | Workspace context |
| `cg sample list` | List samples in current worktree | Workspace context |
| `cg sample info <slug>` | Show sample details | Workspace context |
| `cg sample delete <slug>` | Delete a sample file | Workspace context |

---

## Context Resolution

### Automatic Context (Default)

```
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: Get Current Working Directory                       │
│                                                             │
│   CWD = /home/jak/substrate/014-workspaces/src/components   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 2: Find Git Root (if git repo)                         │
│                                                             │
│   $ git rev-parse --show-toplevel                           │
│   → /home/jak/substrate/014-workspaces                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 3: Check if Worktree of Registered Workspace           │
│                                                             │
│   Registry lookup: Is 014-workspaces a worktree of any      │
│   registered workspace?                                     │
│                                                             │
│   Found: workspace "chainglass" at /home/jak/substrate/main │
│         ↳ 014-workspaces is a worktree                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ RESULT: WorkspaceContext                                    │
│                                                             │
│   slug:         "chainglass"                                │
│   name:         "Chainglass"                                │
│   mainRepoPath: "/home/jak/substrate/main"                  │
│   worktreePath: "/home/jak/substrate/014-workspaces"        │
│   dataRoot:     ".../.chainglass/data"                      │
└─────────────────────────────────────────────────────────────┘
```

### Explicit Override (`--workspace-path`)

```bash
# Override context with explicit path
$ cg sample list --workspace-path /home/jak/substrate/015-better-agents

# Works from any directory
$ cd /tmp
$ cg sample add "Test" --content "Hello" --workspace-path ~/substrate/014-workspaces
```

**Why `--workspace-path`?** Explicit and self-documenting. Clearly indicates you're providing a path to a workspace (not a slug).

**Rule**: `-C` takes an absolute or relative path and uses that as the data root. The path must be:
- A registered workspace's main path, OR
- A worktree of a registered workspace

---

## Workspace Commands

### `cg workspace add <name> <path>`

**Syntax**:
```
cg workspace add <name> <path> [options]

Arguments:
  name            Friendly display name (e.g., "Chainglass")
  path            Absolute or relative path to folder

Options:
  --allow-worktree   Allow adding a git worktree (normally rejected)
  --json             Output as JSON
```

**Flow**:
```
┌─────────────────────────────────────────────────────────────┐
│ INPUT VALIDATION                                            │
│                                                             │
│   • Resolve path to absolute                                │
│   • Check path exists (E077 if not)                         │
│   • Check not relative path traversal (E076 if ..)          │
│   • Generate slug from name (lowercase, hyphenate)          │
│   • Check slug doesn't exist (E075 if duplicate)            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ GIT CHECKS (if .git exists)                                 │
│                                                             │
│   $ git rev-parse --is-inside-work-tree                     │
│                                                             │
│   If worktree (not main):                                   │
│     ⚠ Warning: "This is a git worktree. Adding the main     │
│        repository allows managing ALL worktrees. Adding     │
│        just this worktree confines you to one branch."      │
│     → Fail unless --allow-worktree flag                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ NO .GIT CHECK                                               │
│                                                             │
│   If no .git folder:                                        │
│     ⚠ Warning: "No .git folder found. Git features          │
│        (worktree discovery) won't work."                    │
│     → Continue anyway (non-fatal)                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ SAVE TO REGISTRY                                            │
│                                                             │
│   Add to ~/.config/chainglass/workspaces.json               │
│   Fields: slug, name, path, createdAt                       │
└─────────────────────────────────────────────────────────────┘
```

**Console Output - Success**:
```
$ cg workspace add "Chainglass" /home/jak/substrate/chainglass

✓ Workspace 'chainglass' added
  Name: Chainglass
  Path: /home/jak/substrate/chainglass
```

**Console Output - Success with Warning**:
```
$ cg workspace add "Docs" /home/jak/docs

⚠ No .git folder found. Git features (worktree discovery) won't work.

✓ Workspace 'docs' added
  Name: Docs
  Path: /home/jak/docs
```

**Console Output - Worktree Warning (Rejected)**:
```
$ cg workspace add "Feature" /home/jak/substrate/014-workspaces

⚠ This path is a git worktree of /home/jak/substrate/chainglass.

  Adding the main repository instead allows the workspace to:
    • Discover and manage ALL worktrees automatically
    • Work across branches via worktree selection
    • Show unified view of all feature branches

  Adding just this worktree confines the workspace to a single branch.

✗ Workspace not added [E076]
  Use --allow-worktree to add a worktree anyway.
```

**JSON Output - Success**:
```json
{
  "success": true,
  "command": "workspace.add",
  "timestamp": "2026-01-27T10:30:00.000Z",
  "data": {
    "slug": "chainglass",
    "name": "Chainglass",
    "path": "/home/jak/substrate/chainglass",
    "createdAt": "2026-01-27T10:30:00.000Z",
    "warnings": []
  }
}
```

**JSON Output - Success with Warning**:
```json
{
  "success": true,
  "command": "workspace.add",
  "timestamp": "2026-01-27T10:30:00.000Z",
  "data": {
    "slug": "docs",
    "name": "Docs",
    "path": "/home/jak/docs",
    "createdAt": "2026-01-27T10:30:00.000Z",
    "warnings": ["No .git folder found. Git features (worktree discovery) won't work."]
  }
}
```

---

### `cg workspace list`

**Syntax**:
```
cg workspace list [options]

Options:
  --json    Output as JSON
```

**Console Output**:
```
$ cg workspace list

WORKSPACES
  chainglass     Chainglass              /home/jak/substrate/chainglass
  side-project   Side Project            /home/jak/projects/side
  docs           Documentation           /home/jak/docs

3 workspaces registered
```

**Console Output - Empty**:
```
$ cg workspace list

No workspaces registered.
  Run: cg workspace add "Name" /path/to/folder
```

**JSON Output**:
```json
{
  "success": true,
  "command": "workspace.list",
  "timestamp": "2026-01-27T10:30:00.000Z",
  "data": {
    "workspaces": [
      {
        "slug": "chainglass",
        "name": "Chainglass",
        "path": "/home/jak/substrate/chainglass",
        "createdAt": "2026-01-27T10:00:00.000Z"
      },
      {
        "slug": "side-project",
        "name": "Side Project",
        "path": "/home/jak/projects/side",
        "createdAt": "2026-01-27T10:05:00.000Z"
      }
    ],
    "count": 2
  }
}
```

---

### `cg workspace info <slug>`

**Syntax**:
```
cg workspace info <slug> [options]

Arguments:
  slug    Workspace identifier (e.g., "chainglass")

Options:
  --json    Output as JSON
```

**Console Output - Git Repo with Worktrees**:
```
$ cg workspace info chainglass

WORKSPACE: Chainglass (chainglass)
  Path:    /home/jak/substrate/chainglass
  Created: 2026-01-27 10:00:00 UTC

WORKTREES (8)
  main               /home/jak/substrate/chainglass          (main)
  002-agents         /home/jak/substrate/002-agents          (feature/002-agents)
  003-wf-basics      /home/jak/substrate/003-wf-basics       (feature/003-wf-basics)
  005-web-slick      /home/jak/substrate/005-web-slick       (feature/005-web-slick)
  007-manage-wf      /home/jak/substrate/007-manage-workflows (feature/007-manage)
  008-web-extras     /home/jak/substrate/008-web-extras      (feature/008-extras)
  013-ci             /home/jak/substrate/013-ci              (feature/013-ci)
  014-workspaces     /home/jak/substrate/014-workspaces      (feature/014-workspaces)
```

**Console Output - Non-Git Workspace**:
```
$ cg workspace info docs

WORKSPACE: Documentation (docs)
  Path:    /home/jak/docs
  Created: 2026-01-27 10:05:00 UTC

  ⚠ Not a git repository - no worktrees to display
```

**JSON Output**:
```json
{
  "success": true,
  "command": "workspace.info",
  "timestamp": "2026-01-27T10:30:00.000Z",
  "data": {
    "workspace": {
      "slug": "chainglass",
      "name": "Chainglass",
      "path": "/home/jak/substrate/chainglass",
      "createdAt": "2026-01-27T10:00:00.000Z"
    },
    "isGitRepo": true,
    "worktrees": [
      {
        "name": "main",
        "path": "/home/jak/substrate/chainglass",
        "branch": "main"
      },
      {
        "name": "014-workspaces",
        "path": "/home/jak/substrate/014-workspaces",
        "branch": "feature/014-workspaces"
      }
    ],
    "worktreeCount": 8
  }
}
```

---

### `cg workspace remove <slug>`

**Syntax**:
```
cg workspace remove <slug> [options]

Arguments:
  slug    Workspace identifier to remove

Options:
  --force    Skip confirmation prompt
  --json     Output as JSON
```

**Flow**:
```
┌─────────────────────────────────────────────────────────────┐
│ LOOKUP                                                      │
│                                                             │
│   Find workspace by slug (E074 if not found)                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ CONFIRMATION (unless --force)                               │
│                                                             │
│   Remove workspace 'chainglass'?                            │
│   Path: /home/jak/substrate/chainglass                      │
│                                                             │
│   Note: The folder and .chainglass/ data will NOT be        │
│         deleted. Only the registry entry is removed.        │
│                                                             │
│   Continue? (y/N): _                                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ REMOVE FROM REGISTRY                                        │
│                                                             │
│   Delete entry from workspaces.json                         │
│   DO NOT delete folder or .chainglass/ data                 │
└─────────────────────────────────────────────────────────────┘
```

**Console Output - Success**:
```
$ cg workspace remove chainglass

Remove workspace 'chainglass'?
  Path: /home/jak/substrate/chainglass

  Note: The folder and .chainglass/ data will NOT be deleted.

Continue? (y/N): y

✓ Workspace 'chainglass' removed from registry
  The folder at /home/jak/substrate/chainglass was not modified.
```

**Console Output - Cancelled**:
```
$ cg workspace remove chainglass

Remove workspace 'chainglass'?
  Path: /home/jak/substrate/chainglass

Continue? (y/N): n

Cancelled.
```

**Console Output - With Force**:
```
$ cg workspace remove chainglass --force

✓ Workspace 'chainglass' removed from registry
```

**JSON Output**:
```json
{
  "success": true,
  "command": "workspace.remove",
  "timestamp": "2026-01-27T10:30:00.000Z",
  "data": {
    "slug": "chainglass",
    "path": "/home/jak/substrate/chainglass",
    "message": "Workspace removed from registry. Folder not modified."
  }
}
```

---

## Sample Commands

### `cg sample add <name>`

**Syntax**:
```
cg sample add <name> [options]

Arguments:
  name    Display name for the sample (e.g., "Test Sample")

Options:
  --content <text>     Sample content (optional, default: "")
  --workspace-path <path>    Override workspace context
  --json               Output as JSON
```

**Flow**:
```
┌─────────────────────────────────────────────────────────────┐
│ RESOLVE CONTEXT                                             │
│                                                             │
│   If --workspace-path provided:                                   │
│     Use explicit path                                       │
│   Else:                                                     │
│     Detect from CWD (see Context Resolution above)          │
│                                                             │
│   Error E074 if no workspace context found                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ GENERATE SLUG                                               │
│                                                             │
│   slug = slugify(name, { strict: true, lower: true })       │
│   "Test Sample" → "test-sample"                             │
│   "" → "sample" (fallback)                                  │
│   "My Sample 2" → "my-sample-2"                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ CHECK EXISTENCE                                             │
│                                                             │
│   File: <worktree>/.chainglass/data/samples/<slug>.json     │
│   Error E083 if already exists                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ CREATE SAMPLE                                               │
│                                                             │
│   Ensure directories exist                                  │
│   Write sample JSON file with:                              │
│     slug, name, content, createdAt, updatedAt               │
└─────────────────────────────────────────────────────────────┘
```

**Console Output - Success**:
```
$ cg sample add "Test Sample" --content "Hello, world!"

✓ Sample 'test-sample' created
  File: .chainglass/data/samples/test-sample.json
  Workspace: chainglass (014-workspaces)
```

**Console Output - No Context**:
```
$ cd /tmp
$ cg sample add "Test"

✗ No workspace context found [E074]
  Current directory is not inside a registered workspace.

  Run: cg workspace list    to see registered workspaces
  Run: cg sample add "Test" --workspace-path /path/to/workspace
```

**JSON Output - Success**:
```json
{
  "success": true,
  "command": "sample.add",
  "timestamp": "2026-01-27T10:30:00.000Z",
  "data": {
    "sample": {
      "slug": "test-sample",
      "name": "Test Sample",
      "content": "Hello, world!",
      "createdAt": "2026-01-27T10:30:00.000Z",
      "updatedAt": "2026-01-27T10:30:00.000Z"
    },
    "path": "/home/jak/substrate/014-workspaces/.chainglass/data/samples/test-sample.json",
    "workspace": {
      "slug": "chainglass",
      "worktree": "014-workspaces"
    }
  }
}
```

---

### `cg sample list`

**Syntax**:
```
cg sample list [options]

Options:
  --workspace-path <path>    Override workspace context
  --json               Output as JSON
```

**Console Output - With Samples**:
```
$ cg sample list

SAMPLES in 014-workspaces (chainglass)
  test-sample      Test Sample        2026-01-27 10:30 UTC
  another-sample   Another Sample     2026-01-27 09:15 UTC
  hello-world      Hello World        2026-01-26 14:00 UTC

3 samples
```

**Console Output - Empty**:
```
$ cg sample list

No samples in 014-workspaces (chainglass).
  Run: cg sample add "Sample Name"
```

**JSON Output**:
```json
{
  "success": true,
  "command": "sample.list",
  "timestamp": "2026-01-27T10:30:00.000Z",
  "data": {
    "samples": [
      {
        "slug": "test-sample",
        "name": "Test Sample",
        "createdAt": "2026-01-27T10:30:00.000Z",
        "updatedAt": "2026-01-27T10:30:00.000Z"
      },
      {
        "slug": "another-sample",
        "name": "Another Sample",
        "createdAt": "2026-01-27T09:15:00.000Z",
        "updatedAt": "2026-01-27T09:15:00.000Z"
      }
    ],
    "count": 2,
    "workspace": {
      "slug": "chainglass",
      "worktree": "014-workspaces",
      "dataRoot": "/home/jak/substrate/014-workspaces/.chainglass/data"
    }
  }
}
```

---

### `cg sample info <slug>`

**Syntax**:
```
cg sample info <slug> [options]

Arguments:
  slug    Sample identifier (e.g., "test-sample")

Options:
  --workspace-path <path>    Override workspace context
  --json               Output as JSON
```

**Console Output**:
```
$ cg sample info test-sample

SAMPLE: Test Sample (test-sample)
  Created:  2026-01-27 10:30:00 UTC
  Updated:  2026-01-27 10:30:00 UTC
  File:     .chainglass/data/samples/test-sample.json

CONTENT:
  Hello, world!
```

**Console Output - Long Content**:
```
$ cg sample info long-sample

SAMPLE: Long Sample (long-sample)
  Created:  2026-01-27 10:30:00 UTC
  Updated:  2026-01-27 10:35:00 UTC
  File:     .chainglass/data/samples/long-sample.json

CONTENT (truncated, 2048 chars):
  This is a very long sample that has been truncated...
  [... truncated at 500 chars ...]

  Use --json for full content
```

**JSON Output**:
```json
{
  "success": true,
  "command": "sample.info",
  "timestamp": "2026-01-27T10:30:00.000Z",
  "data": {
    "sample": {
      "slug": "test-sample",
      "name": "Test Sample",
      "content": "Hello, world!",
      "createdAt": "2026-01-27T10:30:00.000Z",
      "updatedAt": "2026-01-27T10:30:00.000Z"
    },
    "path": "/home/jak/substrate/014-workspaces/.chainglass/data/samples/test-sample.json",
    "workspace": {
      "slug": "chainglass",
      "worktree": "014-workspaces"
    }
  }
}
```

---

### `cg sample delete <slug>`

**Syntax**:
```
cg sample delete <slug> [options]

Arguments:
  slug    Sample identifier to delete

Options:
  --force              Skip confirmation prompt
  --workspace-path <path>    Override workspace context
  --json               Output as JSON
```

**Console Output - With Confirmation**:
```
$ cg sample delete test-sample

Delete sample 'test-sample'?
  File: .chainglass/data/samples/test-sample.json

Continue? (y/N): y

✓ Sample 'test-sample' deleted
```

**Console Output - With Force**:
```
$ cg sample delete test-sample --force

✓ Sample 'test-sample' deleted
```

**JSON Output**:
```json
{
  "success": true,
  "command": "sample.delete",
  "timestamp": "2026-01-27T10:30:00.000Z",
  "data": {
    "slug": "test-sample",
    "path": "/home/jak/substrate/014-workspaces/.chainglass/data/samples/test-sample.json",
    "message": "Sample deleted"
  }
}
```

---

## Error Codes Reference

### Workspace Errors (E074-E081)

| Code | Name | Console Output | Action |
|------|------|----------------|--------|
| **E074** | WORKSPACE_NOT_FOUND | `✗ Workspace 'xyz' not found [E074]` | `Run: cg workspace list` |
| **E075** | WORKSPACE_EXISTS | `✗ Workspace 'my-project' already exists [E075]` | `Use a different name or remove existing` |
| **E076** | INVALID_PATH | `✗ Invalid path [E076]: Path contains '..' traversal` | `Use absolute path without traversal` |
| **E077** | PATH_NOT_FOUND | `✗ Path does not exist [E077]` | `Create the directory first` |
| **E078** | REGISTRY_CORRUPT | `✗ Workspace registry is corrupt [E078]` | `Check ~/.config/chainglass/workspaces.json` |
| **E079** | GIT_ERROR | `✗ Git operation failed [E079]: ...` | `Check git installation and repository` |
| **E080** | CONFIG_NOT_WRITABLE | `✗ Cannot write to config directory [E080]` | `Check permissions on ~/.config/chainglass/` |

### Sample Errors (E082-E089)

| Code | Name | Console Output | Action |
|------|------|----------------|--------|
| **E082** | SAMPLE_NOT_FOUND | `✗ Sample 'xyz' not found [E082]` | `Run: cg sample list` |
| **E083** | SAMPLE_EXISTS | `✗ Sample 'my-sample' already exists [E083]` | `Use a different name or delete existing` |
| **E084** | INVALID_DATA | `✗ Invalid sample data [E084]: ...` | `Check file format at path` |

### Error Output Format

**Console (Human)**:
```
✗ Workspace 'unknown' not found [E074]

  Run: cg workspace list    to see available workspaces
```

**JSON (Machine)**:
```json
{
  "success": false,
  "command": "workspace.info",
  "timestamp": "2026-01-27T10:30:00.000Z",
  "error": {
    "code": "E074",
    "message": "Workspace 'unknown' not found",
    "action": "Run: cg workspace list",
    "path": null
  }
}
```

---

## Output Adapter Integration

### Command Registration Pattern

Commands register with the output adapter system for consistent formatting:

```typescript
// Workspace commands
'workspace.add'     → AddWorkspaceResult
'workspace.list'    → ListWorkspacesResult
'workspace.info'    → WorkspaceInfoResult
'workspace.remove'  → RemoveWorkspaceResult

// Sample commands
'sample.add'        → AddSampleResult
'sample.list'       → ListSamplesResult
'sample.info'       → SampleInfoResult
'sample.delete'     → DeleteSampleResult
```

### Result Type Pattern

Following existing conventions (see `workflow-service.types.ts`):

```typescript
interface AddWorkspaceResult extends BaseResult {
  workspace?: Workspace;
  warnings?: string[];
}

interface ListWorkspacesResult extends BaseResult {
  workspaces: Workspace[];
  count: number;
}

interface WorkspaceInfoResult extends BaseResult {
  workspace?: Workspace;
  isGitRepo: boolean;
  worktrees?: WorktreeInfo[];
}

interface AddSampleResult extends BaseResult {
  sample?: Sample;
  path?: string;
  workspace?: { slug: string; worktree: string };
}
```

---

## DI Integration

### Token Requirements

Per DYK-P4-02, use separate `WORKSPACE_DI_TOKENS`:

```typescript
// packages/shared/src/di-tokens.ts
export const WORKSPACE_DI_TOKENS = {
  WORKSPACE_REGISTRY_ADAPTER: 'IWorkspaceRegistryAdapter',
  WORKSPACE_CONTEXT_RESOLVER: 'IWorkspaceContextResolver',
  GIT_WORKTREE_RESOLVER: 'IGitWorktreeResolver',
  SAMPLE_ADAPTER: 'ISampleAdapter',
  WORKSPACE_SERVICE: 'IWorkspaceService',
  SAMPLE_SERVICE: 'ISampleService',
};
```

### Container Resolution Pattern

```typescript
// apps/cli/src/commands/workspace.command.ts
function getWorkspaceService(): IWorkspaceService {
  const container = createCliProductionContainer();
  return container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );
}

function getSampleService(): ISampleService {
  const container = createCliProductionContainer();
  return container.resolve<ISampleService>(
    WORKSPACE_DI_TOKENS.SAMPLE_SERVICE
  );
}
```

---

## Quick Reference

### Workspace Commands

```bash
# Add a workspace
cg workspace add "Project Name" /path/to/folder
cg workspace add "Docs" ~/docs              # Expands ~
cg workspace add "Feature" ./worktree --allow-worktree

# List workspaces
cg workspace list
cg workspace list --json

# Show workspace info with worktrees
cg workspace info chainglass
cg workspace info chainglass --json

# Remove workspace (keeps files)
cg workspace remove my-project
cg workspace remove my-project --force
```

### Sample Commands

```bash
# Create sample (auto-detects workspace from CWD)
cg sample add "My Sample"
cg sample add "With Content" --content "Hello!"
cg sample add "Explicit" --workspace-path /path/to/workspace

# List samples
cg sample list
cg sample list --workspace-path ~/substrate/014-workspaces
cg sample list --json

# View sample details
cg sample info my-sample
cg sample info my-sample --json

# Delete sample
cg sample delete old-sample
cg sample delete old-sample --force
```

### Common Patterns

```bash
# Work in a worktree, context auto-detected
cd ~/substrate/014-workspaces
cg sample add "Feature Test"        # Saves to 014-workspaces/.chainglass/

# Work from anywhere with explicit path
cd /tmp
cg sample list --workspace-path ~/substrate/014-workspaces

# Machine-readable output for scripting
cg workspace list --json | jq '.data.workspaces[].slug'
cg sample list --json | jq '.data.samples | length'
```

---

## Open Questions

### Q1: Should `cg sample update` exist?

**OPEN**: Currently only add/delete. Update would require deciding:
- Does update change content only, or name too?
- What happens to timestamps?
- Is this Phase 5 scope or future?

**Recommendation**: Defer to future phase. Users can delete + add.

### Q2: Slug collision handling for samples

**RESOLVED**: Follow same pattern as workspaces - error E083 if slug exists. User must choose different name or delete existing.

### Q3: Content flag vs stdin for sample add

**RESOLVED**: Use `--content <text>` flag for simplicity. Future enhancement could add `--stdin` for piping content.

---

## Implementation Checklist

Phase 5 implementation should create these files:

```
apps/cli/src/commands/
├── workspace.command.ts   # cg workspace add/list/info/remove
└── sample.command.ts      # cg sample add/list/info/delete
```

Update these files:

```
apps/cli/src/bin/cg.ts                  # Register new commands
packages/shared/src/output/
├── console-output.adapter.ts           # Add workspace.* and sample.* formatters
└── json-output.adapter.ts              # Add envelope handling
```

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-27 | Initial workshop |
