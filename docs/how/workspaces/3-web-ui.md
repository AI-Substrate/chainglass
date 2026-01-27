# Web UI Reference

Brief reference for workspace web pages.

## Routes

| Route | Purpose |
|-------|---------|
| `/workspaces` | List all registered workspaces |
| `/workspaces/[slug]` | Workspace details with worktree selector |
| `/workspaces/[slug]/samples` | Sample list for selected worktree |

## Worktree Selection

Use the `?worktree=` query parameter to select a specific worktree:

```
/workspaces/my-project/samples?worktree=/path/to/worktree
```

If omitted, defaults to the main workspace path.

## Server Actions

The web UI uses Server Actions for mutations:
- `addWorkspace` / `removeWorkspace`
- `addSample` / `deleteSample`

All data reads from `~/.config/chainglass/` (workspace registry) and `<worktree>/.chainglass/data/` (domain data) for same-user deployment.
