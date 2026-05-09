# Domain: Git

**Slug**: _platform/git
**Type**: infrastructure
**Created**: 2026-05-09
**Created By**: Plan 084 FX007 (copy-repo-url)
**Status**: active

## Purpose

Cross-cutting git helpers for the web app — read git CLI state (current branch, default branch, current commit SHA, origin remote URL) and translate remote URLs into hosted-repo web URLs (GitHub, Azure DevOps). All helpers run server-side (Node only) and use `execFile('git', [...], { cwd })` for safety. The pure URL builder (`parseRemote`, `buildFileUrl`) has no Node dependencies and can be reused anywhere.

## Boundary

### Owns

**Server-side git CLI wrappers (Node only):**
- `getCurrentBranch(cwd)` — current branch name; returns `'HEAD'` when detached (preserves PR-view contract)
- `getDefaultBaseBranch(cwd)` — parses `origin/HEAD`, falls back to `'main'` (preserves PR-view contract — never returns `null`)
- `getRemoteUrl(cwd)` — `git config --get remote.origin.url`, returns `null` if unset or git fails
- `getCurrentCommitSha(cwd)` — full 40-char SHA on success, `null` on failure (zero-commit worktree, broken HEAD, git not installed)

**Pure URL builder (no Node deps, browser-safe):**
- `parseRemote(url)` — `string -> Remote | null`. Strips embedded credentials before parsing (`https://user:token@host/...` → no creds in output). Returns `host: 'unknown'` for hosts other than GitHub and dev.azure.com.
- `buildFileUrl(remote, options)` — produces the host-specific web URL given `{ ref, refType: 'branch' | 'commit', relativePath }`. Per-segment URL encoding (slashes preserved across path & branch).

**Types:**
- `RepoHost = 'github' | 'azure-devops' | 'unknown'`
- `Remote = { host: RepoHost; org: string | null; project: string | null; repo: string | null }`
- `BuildOptions = { ref: string; refType: 'branch' | 'commit'; relativePath: string }`
- `RepoInfo = { host: RepoHost; org: string | null; project: string | null; repo: string | null; currentBranch: string; defaultBranch: string; currentSha: string | null; isDetached: boolean }` — composite payload returned by `/api/workspaces/[slug]/repo-info`.

### Does NOT Own

- **Workflow git operations** (worktree creation, fetch, pull, merge-base) — those stay in `@chainglass/workflow`'s `git-worktree-manager.adapter.ts`. This sub-domain is **read-only state + URL translation**, not git workflow management.
- **PR diff machinery** — `getMergeBase`, `getChangedFilesBranch`, `parseNameStatus` stay in `apps/web/src/features/071-pr-view/lib/git-branch-service.ts` (PR-view-specific).
- **Client-side branch tracking** — `WorkspaceContext.worktreeIdentity.branch` is a UI concern owned by `file-browser`.
- **Forks vs canonical repo** — we copy whatever `origin` actually points at. Multi-remote setups (e.g., `upstream` vs `origin`) are not supported — `origin` wins.

## Contracts (Public Interface)

| Contract | Type | Consumers | Description |
|----------|------|-----------|-------------|
| `parseRemote` | Pure function | file-browser (api/repo-info) | `string → Remote \| null`. Strips creds, host-discriminates. |
| `buildFileUrl` | Pure function | file-browser (useClipboard) | `(remote, options) → string`. Host-specific URL construction. |
| `getRemoteUrl` | Async function | file-browser (api/repo-info) | `(cwd) → Promise<string \| null>`. `git config --get remote.origin.url`. |
| `getCurrentBranch` | Async function | file-browser, pr-view | `(cwd) → Promise<string>`. Branch name or `'HEAD'` (detached). |
| `getDefaultBaseBranch` | Async function | file-browser, pr-view | `(cwd) → Promise<string>`. Default ref name; falls back to `'main'`. |
| `getCurrentCommitSha` | Async function | file-browser (api/repo-info) | `(cwd) → Promise<string \| null>`. 40-char SHA or null. |
| `RepoHost` | Type | file-browser | Discriminator union. |
| `Remote` | Type | file-browser | Parsed remote shape. |
| `BuildOptions` | Type | file-browser | URL builder input. |
| `RepoInfo` | Type | file-browser | API response shape. |

## Composition (Internal)

| Component | Role | Depends On |
|-----------|------|------------|
| `repo-url.ts` | Pure URL builder + parseRemote | — (zero deps) |
| `git-cli.ts` | Thin `execFile` wrappers | Node `child_process` |
| `index.ts` | Public re-exports | repo-url.ts, git-cli.ts |

## Source Location

| File | Role | Notes |
|------|------|-------|
| `apps/web/src/features/_platform/git/index.ts` | Public re-exports | All contracts |
| `apps/web/src/features/_platform/git/lib/repo-url.ts` | Pure URL builder | TDD-tested |
| `apps/web/src/features/_platform/git/lib/git-cli.ts` | Git CLI wrappers | Lightweight tested |
| `test/unit/web/features/_platform/git/repo-url.test.ts` | URL builder tests | TDD |
| `test/unit/web/features/_platform/git/git-cli.test.ts` | CLI wrapper tests | execFile mocked |

## Concepts

| Concept | Entry Point | What It Does |
|---------|-------------|--------------|
| Translate git remote to web URL | `parseRemote(remoteUrl)` then `buildFileUrl(remote, { ref, refType, relativePath })` | Given a git origin URL (HTTPS or SSH, GitHub or Azure DevOps), parse it into a host-discriminated `Remote`, then construct a clickable hosted web URL for any file at any branch or commit. Used by the file browser's "Copy URL" right-click menu items. |

## Dependencies

### This Domain Depends On
- Node.js `child_process.execFile` — standard library, used for `git` CLI invocation.

### Domains That Depend On This
- `file-browser` — `useClipboard` consumes `buildFileUrl`; `/api/workspaces/[slug]/repo-info` consumes all four CLI wrappers + `parseRemote`.
- `pr-view` — `diff-aggregator.ts` consumes `getCurrentBranch` + `getDefaultBaseBranch` (lifted from local `git-branch-service.ts` in FX007).

## History

| Plan | What Changed | Date |
|------|-------------|------|
| Plan 084 FX007 | Created. Lifted `getCurrentBranch` + `getDefaultBaseBranch` from `pr-view`'s local `git-branch-service.ts`. Added `getRemoteUrl`, `getCurrentCommitSha`, pure `parseRemote` + `buildFileUrl` URL builder. | 2026-05-09 |
