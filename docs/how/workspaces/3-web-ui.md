# Web UI Reference

Reference for workspace web pages, worktree creation, and the bootstrap hook contract.

## Routes

| Route | Purpose |
|-------|---------|
| `/workspaces` | List all registered workspaces |
| `/workspaces/[slug]` | Workspace details with worktree selector |
| `/workspaces/[slug]/browser` | File browser for selected worktree |
| `/workspaces/[slug]/new-worktree` | Full-page worktree creation flow |
| `/workspaces/[slug]/samples` | Sample list for selected worktree |

## Worktree Selection

Use the `?worktree=` query parameter to select a specific worktree:

```
/workspaces/my-project/browser?worktree=/path/to/worktree
```

If omitted, defaults to the main workspace path.

## Creating a New Worktree

### Entry Point

The sidebar displays a **+** button next to the "Worktrees" label when the sidebar is expanded and you are inside a workspace. When the sidebar is collapsed, a **+** icon appears in the worktrees section with a tooltip. Clicking either navigates to the full-page create flow.

### Full-Page Create Flow

The `/workspaces/[slug]/new-worktree` page provides:

1. **Live preview** — as you type a name, the computed branch name and worktree path update in real-time using the same naming algorithm the server uses.
2. **Ordinal allocation** — Chainglass scans existing local branches, remote branches, and plan folders to find the next available ordinal (e.g., `070`). The ordinal is zero-padded to 3 digits and prepended to your slug.
3. **Main sync** — before creating the worktree, the system verifies the main branch is clean and fast-forwards it from origin.
4. **Creation** — runs `git worktree add` with the computed branch name and path.
5. **Bootstrap hook** — if a hook script exists (see below), it runs automatically after creation.
6. **Navigation** — on success, the browser hard-navigates to `/workspaces/[slug]/browser?worktree=<new-path>`, which remounts the sidebar with the new worktree visible.

### Naming Convention

Names follow the pattern `NNN-slug` where:

- **NNN** is the next available ordinal (scanned from branches and plan folders)
- **slug** is your input normalized to lowercase alphanumeric with hyphens
- Example: typing "my feature" when the highest existing ordinal is 069 produces `070-my-feature`

If you paste a name that already starts with a 3-digit ordinal (e.g., `070-my-feature`), the allocator uses that ordinal directly instead of computing the next one.

### Error States

| State | What Happened | What To Do |
|-------|--------------|------------|
| **Blocking error** | Branch name or worktree path already exists, or main has uncommitted changes | Fix the conflict (rename, commit, or stash in the main worktree), then try again |
| **Created with bootstrap error** | Worktree was created but the hook script failed | The worktree is usable. Check the bootstrap log output shown on screen and run the hook manually if needed |

## Bootstrap Hook

The bootstrap hook is an optional shell script that runs automatically after a new worktree is created. Use it to automate per-worktree setup tasks like installing dependencies, copying environment files, or seeding local data.

### Hook Location

```
<main-repo-path>/.chainglass/new-worktree.sh
```

The hook is always read from the **main worktree** (never from the new worktree). This means all worktrees share the same hook definition, and you can version it alongside your project.

### Requirements

- The file must be executable (`chmod +x .chainglass/new-worktree.sh`)
- It must be a valid Bash script
- It must complete within **60 seconds** (after which it is killed)

### Environment Variables

The hook receives these environment variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `CHAINGLASS_MAIN_REPO_PATH` | Absolute path to the main worktree | `/Users/me/repos/chainglass` |
| `CHAINGLASS_MAIN_BRANCH` | Name of the main branch | `main` |
| `CHAINGLASS_WORKSPACE_SLUG` | Slug of the workspace | `chainglass` |
| `CHAINGLASS_REQUESTED_NAME` | Raw name the user typed | `my feature` |
| `CHAINGLASS_NORMALIZED_SLUG` | Cleaned slug | `my-feature` |
| `CHAINGLASS_NEW_WORKTREE_ORDINAL` | Allocated ordinal number | `70` |
| `CHAINGLASS_NEW_BRANCH_NAME` | Full branch name | `070-my-feature` |
| `CHAINGLASS_NEW_WORKTREE_NAME` | Same as branch name | `070-my-feature` |
| `CHAINGLASS_NEW_WORKTREE_PATH` | Absolute path to the new worktree | `/Users/me/repos/070-my-feature` |
| `CHAINGLASS_TRIGGER` | What triggered the creation | `chainglass-web` |

### Working Directory

The hook's working directory (`cwd`) is set to the **new worktree path**. You can reference files relative to the new worktree directly.

### Failure Behavior

- Hook failure is **informational only** — the worktree is never rolled back
- The UI shows the hook's exit code and the last 200 lines of output
- The user can re-run the hook manually or fix issues themselves
- If the hook times out (>60s), it is terminated and reported as a timeout failure

### Example Hook Script

```bash
#!/usr/bin/env bash
# .chainglass/new-worktree.sh
# Post-create setup for new worktrees

set -euo pipefail

echo "Setting up worktree: $CHAINGLASS_NEW_BRANCH_NAME"
echo "  Path: $CHAINGLASS_NEW_WORKTREE_PATH"
echo "  Main: $CHAINGLASS_MAIN_REPO_PATH"

# Install dependencies
if [ -f "pnpm-lock.yaml" ]; then
  echo "Installing dependencies..."
  pnpm install --frozen-lockfile
fi

# Copy environment files from main
if [ -f "$CHAINGLASS_MAIN_REPO_PATH/apps/web/.env.local" ]; then
  echo "Copying .env.local..."
  cp "$CHAINGLASS_MAIN_REPO_PATH/apps/web/.env.local" apps/web/.env.local
fi

# Create plan folder
PLAN_DIR="docs/plans/$CHAINGLASS_NEW_BRANCH_NAME"
if [ ! -d "$PLAN_DIR" ]; then
  echo "Creating plan folder: $PLAN_DIR"
  mkdir -p "$PLAN_DIR"
fi

echo "Setup complete."
```

### Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Hook not detected | File doesn't exist or wrong path | Verify `.chainglass/new-worktree.sh` exists in the main worktree root |
| Permission denied | File not executable | Run `chmod +x .chainglass/new-worktree.sh` |
| Timeout | Script takes longer than 60 seconds | Optimize the script or move slow tasks to a separate background process |
| Non-zero exit | Script error | Check the output log shown in the UI; fix the script and re-run manually |

## Server Actions

The web UI uses Server Actions for mutations:
- `addWorkspace` / `removeWorkspace`
- `addSample` / `deleteSample`
- `createNewWorktree` — creates a new worktree from canonical main

All data reads from `~/.config/chainglass/` (workspace registry) and `<worktree>/.chainglass/data/` (domain data) for same-user deployment.
