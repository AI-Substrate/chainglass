# Research Report: Copy Git/Azure DevOps URL from Right-Click Menu

**Generated**: 2026-05-09
**Research Query**: "Add right-click options to copy the Git or Azure DevOps web URL for a file, with two variants: current branch and main."
**Mode**: Pre-Plan (likely Fix mode — see "Recommended Track")
**Location**: `docs/plans/084-random-enhancements-3/copy-repo-url-research.md`
**FlowSpace**: Available

## Executive Summary

### What's Being Asked
Extend the file-browser right-click context menu (which already offers "Copy Full Path" and "Copy Relative Path") with two new options that copy a **web URL** to the file in the hosted repo:
1. **Copy URL (current branch)** — uses the worktree's current branch name
2. **Copy URL (main)** — uses the repo's default branch (typically `main`/`master`)

The URL must adapt to the host:
- **GitHub** → `https://github.com/<org>/<repo>/blob/<branch>/<path>`
- **Azure DevOps** → `https://dev.azure.com/<org>/<project>/_git/<repo>?path=/<path>&version=GB<branch>`

### Key Insights
1. **Most plumbing already exists.** Branch info (current + default) is solved. The clipboard hook is solved. The context menu is solved. The only new server-side code is reading `git config --get remote.origin.url` for the active worktree.
2. **Three context-menu render sites need the new items** — file-tree leaf (file), file-tree folder, and changes-view item — each driven by the same `onCopy*` prop chain rooted in `browser-client.tsx`.
3. **No domain registry entry** for "git remote/url" exists — this is purely a `041-file-browser` extension. No new domain needed.
4. **This is a Fix, not a Plan.** Scope is ~3-5 files in one domain, no contract changes, no new packages.

### Quick Stats
- **Components affected**: 4 files (1 new util, 1 new API route, 1 hook, 1-2 component files)
- **Dependencies**: Pure git CLI via `execFile` (already used in sibling code)
- **Test coverage to add**: URL builder pure functions (high value), API route (medium)
- **Complexity**: CS-2 (small)
- **Domains**: `041-file-browser` only

## How It Currently Works

### Right-Click Menu Render Sites

| Site | File | Lines | Items |
|------|------|-------|-------|
| File leaf | `apps/web/src/features/041-file-browser/components/file-tree.tsx` | ~722 | Copy Full Path, Copy Relative Path, Add Note, … |
| Folder | `apps/web/src/features/041-file-browser/components/file-tree.tsx` | ~512 | Copy Full Path, Copy Relative Path, Copy Tree From Here, Rename, … |
| Changes view (PR/working) | `apps/web/src/features/041-file-browser/components/changes-view.tsx` | ~183 | Copy Full Path, Copy Relative Path, Copy Content, Download |

All three sites receive the `onCopyFullPath` / `onCopyRelativePath` callbacks as props. The callbacks are produced by `useClipboard()` and wired in `browser-client.tsx`.

### Existing Clipboard Hook
**File**: `apps/web/src/features/041-file-browser/hooks/use-clipboard.ts`

```typescript
export function useClipboard(options: UseClipboardOptions) {
  const { slug, worktreePath, readFile } = options;
  // ...
  const handleCopyFullPath = useCallback(
    (relativePath: string) => {
      copyToClipboard(`${worktreePath}/${relativePath}`);
      toast.success('Full path copied');
    },
    [worktreePath, copyToClipboard]
  );
  const handleCopyRelativePath = useCallback(/* ... */);
  // ...
}
```

The hook owns:
- `copyToClipboard(text)` — handles non-secure-context fallback via textarea
- A `toast.success(...)` UX pattern we can mirror

### Existing Branch Service (already solves half the problem)
**File**: `apps/web/src/features/071-pr-view/lib/git-branch-service.ts`

Already exposes:
```typescript
export async function getCurrentBranch(cwd: string): Promise<string>;
// Uses: git rev-parse --abbrev-ref HEAD

export async function getDefaultBaseBranch(cwd: string): Promise<string>;
// Uses: git symbolic-ref refs/remotes/origin/HEAD → "main" / "master" / etc.
// Falls back to 'main' on failure (DYK-P4-04)
```

Both use `execFile('git', [...], { cwd })` — same pattern any new git util should follow.

### Branch on the Client (already available)
**File**: `apps/web/src/features/041-file-browser/hooks/use-workspace-context.tsx`

```typescript
worktreeIdentity.branch  // current branch of the active worktree, set by browser page
```

This means **current branch is already in client state** — no extra fetch needed for the "current branch" variant.

### What's Missing
**Git remote URL is not exposed anywhere.** A grep for `remote.origin.url`, `getRemoteUrl`, `dev.azure.com`, etc., across `apps/web` and `packages/*` finds zero occurrences. The git adapter (`packages/workflow/src/adapters/git-worktree-manager.adapter.ts`) only uses `origin/main` for fetch/pull operations — not for retrieving the URL.

So we need:
1. A small server-side util that runs `git config --get remote.origin.url` for a worktree
2. A pure helper that parses that URL and builds a web URL given `(repoUrl, branch, relativePath)`

### Repo Type Coverage
The user names two hosts. URL shapes the helper must handle:

**GitHub**
- SSH: `git@github.com:org/repo.git` → strip `.git`, derive `https://github.com/org/repo/blob/<branch>/<path>`
- HTTPS: `https://github.com/org/repo.git` → same target shape
- (Others: GitLab, Bitbucket — out of scope for this fix; helper should return `null` for unknown hosts so the UI can hide/disable the items.)

**Azure DevOps**
- HTTPS modern: `https://dev.azure.com/<org>/<project>/_git/<repo>` → `https://dev.azure.com/<org>/<project>/_git/<repo>?path=/<path>&version=GB<branch>`
- HTTPS legacy: `https://<org>.visualstudio.com/<project>/_git/<repo>` (older tenants)
- SSH: `git@ssh.dev.azure.com:v3/<org>/<project>/<repo>` → translate to dev.azure.com HTTPS form
- Note ADO uses `?version=GB<branch>` (GB = "git branch") for branch refs and URL-encodes the path with leading `/`.

## Recommended Track: Fix (FX007)

This work is well-scoped to a single domain with no contract changes — **fix mode is the right tool**:

```bash
/plan-5-v2-phase-tasks-and-brief --fix "Copy GitHub/Azure DevOps URL from right-click menu" --plan "<plan-path>"
```

(FX001-FX006 used; next ordinal is **FX007**.)

### Sketch of the Fix

**New files**
1. `apps/web/src/features/041-file-browser/lib/git-remote-service.ts`
   - `getRemoteUrl(cwd: string): Promise<string | null>` — wraps `git config --get remote.origin.url`
2. `apps/web/src/features/041-file-browser/lib/build-repo-url.ts` (pure)
   - `parseRemote(url): { host: 'github' | 'azure-devops'; org; project?; repo } | null`
   - `buildFileUrl(remote, branch, relativePath): string | null`
   - Unit-tested heavily — this is the only logic worth TDD-ing.
3. `apps/web/app/api/workspaces/[slug]/repo-info/route.ts`
   - `GET ?worktree=...` → returns `{ remoteUrl, currentBranch, defaultBranch, host }` so the client doesn't fetch three things separately. Reuses `getCurrentBranch` + `getDefaultBaseBranch` + new `getRemoteUrl`.
   - Cache per worktree on the client (it changes only when branch switches; even then `defaultBranch` and `remoteUrl` are stable).

**Modified files**
4. `apps/web/src/features/041-file-browser/hooks/use-clipboard.ts`
   - Add `handleCopyRepoUrlCurrentBranch(relativePath)` and `handleCopyRepoUrlMainBranch(relativePath)`
   - Hook accepts the new repo-info object (or a `repoInfo: () => RepoInfo | null` getter)
5. `apps/web/src/features/041-file-browser/components/file-tree.tsx`
   - Two new `<ContextMenuItem>` entries at both render sites; conditionally rendered iff `repoInfo?.host !== null`
6. `apps/web/src/features/041-file-browser/components/changes-view.tsx`
   - Same two items in its menu
7. `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx`
   - Fetch the new endpoint, pass props down

### UI Decision (for spec)
Two equally good options — pick one in clarify:
- **Flat**: 4 items at top of menu — Copy Full Path, Copy Relative Path, Copy URL (this branch), Copy URL (main)
- **Submenu**: One "Copy Path" submenu containing all four, plus a divider before existing actions

Recommend **flat** for parity with existing UX and one-click discoverability on touch (mobile already uses these menus).

### Edge Cases to Spec
- No remote configured → omit both URL items (or show disabled with tooltip "No git remote")
- Detached HEAD → "current branch" item shows as `Copy URL (HEAD)` and uses the SHA instead of branch name; OR omit. Recommend SHA fallback so URLs still resolve.
- Default branch can't be detected (`origin/HEAD` not set) → fall back to `main` (matches `getDefaultBaseBranch` existing behavior)
- Unknown host (GitLab, Bitbucket, custom) → omit URL items; toast `"Unknown remote host: <host>"` only if user picks them via keyboard shortcut (not applicable here)
- Path traversal / weird filenames → URL-encode each segment (`encodeURIComponent` per segment, preserving `/`)

## Critical Discoveries

### 🚨 Finding 01: Branch already in client state — don't re-fetch
**Impact**: High
**Source**: `use-workspace-context.tsx:103`
**What**: `worktreeIdentity.branch` already carries the current branch.
**Why It Matters**: We only need to fetch (a) remote URL and (b) default branch — both are stable per worktree. A single GET on browser mount is enough; no per-click fetch.
**Required Action**: Have `useClipboard` accept current branch from `worktreeIdentity` (already passed via context) and only the static repo-info from a one-shot fetch.

### 🚨 Finding 02: Default branch detection is already battle-tested
**Impact**: High
**Source**: `git-branch-service.ts:41-53` + DYK-P4-04
**What**: `getDefaultBaseBranch` parses `git symbolic-ref refs/remotes/origin/HEAD` and falls back to `main`. PR view already relies on this.
**Why It Matters**: Don't duplicate. Reuse via direct import (since both endpoints will be Node-only API routes) or factor into a shared util if cross-feature concerns arise. PR view is feature 071, file-browser is 041 — both are app-internal so direct import is fine.
**Required Action**: Either (a) import `getDefaultBaseBranch` from `071-pr-view/lib/git-branch-service.ts` directly in the new API route, or (b) lift it to `apps/web/src/lib/git/` shared util. Lifting is cleaner; pick one in the spec.

### 🚨 Finding 03: Git remote URL is genuinely missing from the codebase
**Impact**: Medium
**Source**: Whole-repo grep
**What**: No existing util reads `git config --get remote.origin.url`. Workflow adapters use `origin` only as a remote *name*, never read its URL.
**Why It Matters**: This is the only truly net-new logic. Worth a dedicated module + unit test (with `execFile` mocked or a real fixture repo).
**Required Action**: New `git-remote-service.ts` with `getRemoteUrl(cwd)`. Mirror the error-swallow pattern of `git-branch-service.ts` — return `null` on failure rather than throwing.

### 🚨 Finding 04: Three menu sites, one prop chain — touch all three
**Impact**: Medium
**Source**: `file-tree.tsx` (file leaf ~722, folder ~512), `changes-view.tsx` (~183)
**What**: Three render sites, all forwarding `onCopy*` props from `browser-client.tsx`.
**Why It Matters**: A naive change that only touches `file-tree.tsx` will leave the changes-view menu inconsistent. Make sure the fix dossier lists all three sites.
**Required Action**: Plan tasks should explicitly enumerate the three render sites in success criteria.

### 🚨 Finding 05: ADO URL format has a known quirk
**Impact**: Medium
**Source**: External knowledge (no codebase reference)
**What**: Azure DevOps file URLs use `?path=/<path>&version=GB<branch>` (the `GB` prefix is Azure-specific — "git branch"). For tags use `GT`, for commits `GC`.
**Why It Matters**: A clean copy-paste of GitHub-style `/blob/<branch>/<path>` semantics will silently produce broken Azure URLs.
**Required Action**: Pure builder helper must encode this in tests. SSH-form `git@ssh.dev.azure.com:v3/<org>/<project>/<repo>` translation also needs explicit coverage.

## Modification Considerations

### ✅ Safe to Modify
- `useClipboard` hook — adding methods, no breaking changes
- `file-tree.tsx` / `changes-view.tsx` — adding menu items below existing ones
- `browser-client.tsx` — fetches new endpoint, passes props (additive)

### ⚠️ Modify with Caution
- New API route `/api/workspaces/[slug]/repo-info` — must respect `auth()` + the new bootstrap cookie gate (see `apps/web/src/lib/local-auth.ts` / `cookie-gate.ts`). Mirror the auth pattern of `/api/workspaces/route.ts` (line 62-63) which 401s without a session.
- `getRemoteUrl` runs git on the active worktree — must validate `worktree` query param against the workspace's known worktrees (don't shell-execute on attacker-supplied paths). The existing `pr-view/route.ts` validation pattern is the template.

### 🚫 Danger Zones
- None. No contract changes, no shared package edits, no domain restructure.

### Extension Points
- The pure URL builder (`build-repo-url.ts`) is the natural place to add GitLab / Bitbucket later. Design its `parseRemote` return shape with this in mind: `{ host: 'github' | 'azure-devops' | 'unknown'; ... }` discriminated union.

## Domain Context

**Domain registry**: domain registry exists at `docs/domains/registry.md`. `file-browser` is a registered domain.
**Position**: This is a pure extension to the `file-browser` domain. No new contracts, no new cross-domain dependency.
**Domain map impact**: None.
**Action**: Update `docs/domains/file-browser/domain.md § History` after the fix lands ("FX007: copy repo URL from context menu").

## Prior Learnings (From Previous Implementations)

Scanned `docs/plans/041-file-browser/` and `docs/plans/043-panel-layout/`:

### 📚 Prior Learning PL-01: Non-secure-context clipboard fallback already needed
**Source**: `apps/web/src/features/041-file-browser/hooks/use-clipboard.ts:26-45`
**Original Type**: workaround
**What They Found**: `navigator.clipboard.writeText` only works in secure contexts; LAN dev access over HTTP needs a textarea-based fallback.
**Action for Current Work**: Reuse `copyToClipboard(text)` directly — don't roll your own writeText.

### 📚 Prior Learning PL-02: Context menus already wired through props, not via context
**Source**: `apps/web/src/features/041-file-browser/components/file-tree.tsx`, three render sites
**Original Type**: decision
**What They Found**: Each render site receives `onCopy*` callbacks as explicit props rather than reading them via React context — this keeps the file tree component reusable and the data flow obvious.
**Action for Current Work**: Follow the same pattern. Add `onCopyRepoUrlCurrentBranch` and `onCopyRepoUrlMain` to the existing prop set on FileTreeRoot, the leaf renderer, and the folder renderer.

### 📚 Prior Learning PL-03: Default-branch detection has a known fallback pattern
**Source**: DYK-P4-04 in `git-branch-service.ts`
**Original Type**: gotcha
**What They Found**: `git symbolic-ref refs/remotes/origin/HEAD` fails when no remote is configured or remote HEAD isn't set; PR view falls back to `'main'`.
**Action for Current Work**: Match this fallback exactly. If we lift the helper to a shared util, preserve the fallback contract.

### Prior Learnings Summary

| ID | Type | Source | Key Insight | Action |
|----|------|--------|-------------|--------|
| PL-01 | workaround | use-clipboard.ts | Non-HTTPS clipboard needs textarea fallback | Reuse `copyToClipboard(text)` |
| PL-02 | decision | file-tree.tsx | Menu callbacks via props, not context | Mirror prop-drill pattern |
| PL-03 | gotcha | git-branch-service.ts | Default-branch detection has fallback contract | Preserve `'main'` fallback |

## Recommended Approach

1. **Skip plan-1b/2/3.** This is a `fix` — go directly to `/plan-5-v2-phase-tasks-and-brief --fix "Copy GitHub/Azure DevOps URL from right-click menu" --plan "<plan-path>"`.
2. **Suggested fix tasks** (5 total, CS-2):
   - FX007-1: Pure URL builder + `parseRemote` (TDD — this is the only piece worth full TDD)
   - FX007-2: `getRemoteUrl` server util + unit test
   - FX007-3: `/api/workspaces/[slug]/repo-info` route (auth-gated, validates worktree param)
   - FX007-4: Extend `useClipboard` with two new handlers + load `repoInfo` once on mount
   - FX007-5: Add menu items at all three render sites (file leaf, folder, changes view); hide when `repoInfo.host === 'unknown'`

3. **Acceptance**:
   - GitHub HTTPS + SSH remotes both produce correct `/blob/<branch>/<path>` URLs
   - Azure DevOps HTTPS + SSH remotes both produce correct `?path=/<path>&version=GB<branch>` URLs
   - Both menu items appear in all three context-menu sites
   - Items are hidden when no remote / unknown host
   - Detached HEAD: "current branch" copies a SHA-based URL (decision: confirm in spec)
   - Toast on success matches the existing pattern (e.g., `"GitHub URL copied (this branch)"`)

## External Research Opportunities

No external research is required — both URL formats are stable, well-documented, and we have all the codebase signals we need. If desired, a quick `/deepresearch` on "Azure DevOps file URL format edge cases for older `visualstudio.com` tenants" would add belt-and-braces but isn't blocking.

## Next Steps

**Recommended path** (skip the spec/plan ceremony for a fix this small):
```
/plan-5-v2-phase-tasks-and-brief --fix "Copy GitHub/Azure DevOps URL from right-click menu" --plan "/Users/jordanknight/substrate/084-random-enhancements-3/docs/plans/084-random-enhancements-3/<existing-plan>"
```

If you'd rather have a full spec first (overkill IMO):
```
/plan-1b-v2-specify --simple "Right-click context menu in the file browser already copies relative path and full path. Add two more options that copy the web URL to the file: one for the current branch, one for the default branch (main). The URL must adapt to the host — GitHub or Azure DevOps."
```

---

**Research Complete**: 2026-05-09
