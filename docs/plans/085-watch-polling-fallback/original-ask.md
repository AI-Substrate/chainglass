# Original ask — watch-polling-fallback
**Captured**: 2026-06-04T00:47:46Z  ·  **By**: /the-flow

> Chain Glass runs on Windows Subsystem for Linux (WSL), but the workspace points to a
> Windows filesystem mount (`/mnt/c/...`, drvfs/9P). The file-change-notify subsystem
> doesn't detect changed files across that boundary — inotify events don't propagate from
> the Windows host into the Linux guest. We want a polling fallback.
>
> Simplest version of this where we just force it on with an env var — otherwise it's not
> detected etc. This is a super edge case; I rarely use it in this modality.

## Context from prior investigation

- Watcher is Node native `fs.watch({ recursive: true })` (inotify on Linux) in
  `packages/workflow/src/adapters/native-file-watcher.adapter.ts`. It silently receives no
  events on a drvfs/9P mount.
- `FileWatcherOptions` already declares `usePolling` / `interval` but the native adapter
  **ignores them** — no polling engine exists (chokidar was removed in Plan 060).
- `CentralWatcherService` creates one `IFileWatcher` per worktree via
  `NativeFileWatcherFactory` (clean DI seam to switch implementations).
- `SOURCE_WATCHER_IGNORED` (`source-watcher.constants.ts`) is the existing ignore list to
  reuse so polling never walks `node_modules`/`.git`/`.next`.

## Scope decision (from the user)

- **Minimal, env-forced only.** No auto-detection (`/proc/mounts`, WSL heuristics) in this
  pass — that's a deferred follow-up. A single env flag forces polling on; default behavior
  (native `fs.watch`) is unchanged.
- Fixed-interval recursive poller (no adaptive interval) is acceptable for v1.
