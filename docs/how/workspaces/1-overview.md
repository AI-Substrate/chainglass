# Workspaces Overview

This guide explains the Chainglass workspace system for managing multiple projects and their data.

> **Note**: This is a local development tool. The web UI reads from `~/.config/chainglass/` which is owned by the user running the server.

## What is a Workspace?

A workspace is a registered folder (typically a git repository) that Chainglass tracks. Each workspace can have:

- **Multiple worktrees**: Git worktrees share a repo but have separate working directories
- **Per-worktree data**: Each worktree has its own `.chainglass/data/` directory
- **Domain-based storage**: Data organized by feature (samples, agents, workflows, etc.)

## Key Concepts

### Workspace vs Worktree

| Concept | Description |
|---------|-------------|
| **Workspace** | A registered git repository (points to the main checkout) |
| **Worktree** | A working directory - either the main checkout or a `git worktree` |
| **Registry** | Global file at `~/.config/chainglass/workspaces.json` |
| **Per-worktree data** | `.chainglass/data/` inside each worktree |

### Storage Architecture

```
~/.config/chainglass/workspaces.json    ← Global registry (which folders to track)
        │
        │ references
        ▼
/home/user/my-project/                  ← Workspace (main git repo)
├── .chainglass/data/                   ← Data for main worktree
│   └── samples/                        ← Sample domain data
│
└── ../my-project-feature/              ← Worktree (git worktree)
    └── .chainglass/data/               ← Data for this worktree
        └── samples/                    ← Separate samples per worktree
```

For detailed diagrams, see the [Data Model Dossier](../../plans/014-workspaces/data-model-dossier.md).

## Quick Start

```bash
# Register a workspace
cg workspace add "My Project" /path/to/project

# List workspaces
cg workspace list

# Show details including worktrees
cg workspace info my-project

# From inside a workspace, manage samples
cd /path/to/project
cg sample add "Example" --content "Sample content"
cg sample list
```

## Requirements

- **Git ≥2.13**: Required for worktree detection (`git worktree list --porcelain`)
- **Same-user access**: Web UI must run as the same user who owns the registry file

## Next Steps

- [CLI Usage](./2-cli-usage.md) - Complete command reference
- [Web UI](./3-web-ui.md) - Web interface navigation
- [Adding Domains](./4-adding-domains.md) - Developer guide for new domains
