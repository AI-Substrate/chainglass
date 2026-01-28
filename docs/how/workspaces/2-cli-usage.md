# CLI Command Reference

Complete reference for workspace and sample CLI commands.

## Workspace Commands

### `cg workspace add <name> <path>`

Register a folder as a workspace.

```bash
# Basic usage
cg workspace add "My Project" /path/to/project

# With JSON output
cg workspace add "My Project" /path/to/project --json

# Allow registering a git worktree (normally rejected)
cg workspace add "Feature Branch" /path/to/worktree --allow-worktree
```

**Options:**
| Flag | Description |
|------|-------------|
| `--json` | Output as JSON |
| `--allow-worktree` | Allow adding a git worktree (normally main repos only) |

**Exit codes:**
- `0`: Success
- `1`: Path doesn't exist or slug collision

---

### `cg workspace list`

List all registered workspaces.

```bash
# Table output (default)
cg workspace list

# JSON output
cg workspace list --json
```

**Options:**
| Flag | Description |
|------|-------------|
| `--json` | Output as JSON |

---

### `cg workspace info <slug>`

Show workspace details including detected worktrees.

```bash
# Show details
cg workspace info my-project

# JSON output
cg workspace info my-project --json
```

**Options:**
| Flag | Description |
|------|-------------|
| `--json` | Output as JSON |

**Output includes:**
- Workspace name, slug, path
- Created timestamp
- Detected git worktrees (if any)

---

### `cg workspace remove <slug>`

Unregister a workspace. Does not delete any files.

```bash
# Requires --force
cg workspace remove my-project --force

# JSON output
cg workspace remove my-project --force --json
```

**Options:**
| Flag | Description |
|------|-------------|
| `--force` | Required for destructive operation |
| `--json` | Output as JSON |

---

## Sample Commands

Sample commands operate on the current workspace context (detected from cwd) or can override with `--workspace-path`.

### `cg sample add <name>`

Create a new sample in the current workspace.

```bash
# Basic usage (from inside a workspace)
cg sample add "My Sample"

# With content
cg sample add "My Sample" --content "Sample content here"

# Override workspace context
cg sample add "My Sample" --workspace-path /path/to/workspace

# JSON output
cg sample add "My Sample" --json
```

**Options:**
| Flag | Description |
|------|-------------|
| `--content <text>` | Initial sample content |
| `--workspace-path <path>` | Override workspace detection |
| `--json` | Output as JSON |

---

### `cg sample list`

List samples in the current worktree.

```bash
# Table output (default)
cg sample list

# JSON output
cg sample list --json

# Override workspace context
cg sample list --workspace-path /path/to/workspace
```

**Options:**
| Flag | Description |
|------|-------------|
| `--workspace-path <path>` | Override workspace detection |
| `--json` | Output as JSON |

---

### `cg sample info <slug>`

Show sample details.

```bash
# Show details
cg sample info my-sample

# JSON output
cg sample info my-sample --json
```

**Options:**
| Flag | Description |
|------|-------------|
| `--workspace-path <path>` | Override workspace detection |
| `--json` | Output as JSON |

---

### `cg sample delete <slug>`

Delete a sample file.

```bash
# Requires --force
cg sample delete my-sample --force

# JSON output
cg sample delete my-sample --force --json
```

**Options:**
| Flag | Description |
|------|-------------|
| `--force` | Required for destructive operation |
| `--workspace-path <path>` | Override workspace detection |
| `--json` | Output as JSON |

---

## Context Resolution

Sample commands automatically detect workspace context from your current directory:

1. Walk up from cwd to find a registered workspace
2. Use the worktree path you're in (main or git worktree)
3. Data stored in `<worktree>/.chainglass/data/samples/`

Override with `--workspace-path` when running from outside a workspace.

## Error Codes

| Code | Description |
|------|-------------|
| E074 | Workspace not found |
| E075 | Workspace already exists |
| E076 | Invalid workspace path |
| E077 | Workspace slug collision |
| E078 | Invalid workspace name |
| E082 | Sample not found |
| E083 | Sample already exists |
| E084 | Invalid sample name |

## Next Steps

- [Web UI](./3-web-ui.md) - Web interface navigation
- [Adding Domains](./4-adding-domains.md) - Developer guide for new domains
