# Copy Repo URL from Right-Click Menu

**Mode**: Simple

📚 This specification incorporates findings from `copy-repo-url-research.md`.

## Research Context

The right-click context menu in the file browser already offers **Copy Full Path** and **Copy Relative Path**. Users want two more options that copy a **web URL** to the file in the hosted repo, with two branch variants:
- One pointing at the **current branch** (the worktree's checked-out branch)
- One pointing at the **default branch** (typically `main` / `master`)

The URL must adapt to the host. Two hosts are in scope: **GitHub** and **Azure DevOps**. Other hosts (GitLab, Bitbucket, self-hosted) are out of scope; the menu items should be hidden when the host is unknown.

Research established that:
- **Branch info is already available**. Current branch lives on `WorkspaceContext.worktreeIdentity.branch`. Default branch detection already exists in `git-branch-service.ts` (PR view, plan 071) using `git symbolic-ref refs/remotes/origin/HEAD` with a `'main'` fallback.
- **Clipboard plumbing already exists** in `useClipboard()` with a non-secure-context textarea fallback for LAN dev access.
- **Three context-menu render sites** must be touched: file-tree leaf, file-tree folder, and changes-view item. All three already receive `onCopyFullPath` / `onCopyRelativePath` as explicit props from `browser-client.tsx`.
- **Git remote URL is genuinely missing** from the codebase — no util reads `git config --get remote.origin.url`. This is the only meaningfully new server-side logic.
- **Azure DevOps URL format has a quirk**: `?path=/<path>&version=GB<branch>` (the `GB` prefix means "git branch" — not optional).

## Summary

Extend the file-browser right-click context menu so users can copy a **clickable web URL** to any file, on either the **current branch** or the **default branch**, regardless of whether the workspace is hosted on GitHub or Azure DevOps. The URL pastes cleanly into PR descriptions, Slack messages, and code-review comments without the recipient needing access to the user's local checkout.

## Goals

- A user right-clicking any file or folder in the file tree, or any item in the changes view, sees two new menu items: **Copy URL (this branch)** and **Copy URL (main)**.
- Selecting an item copies a working web URL to the clipboard:
  - For GitHub remotes → `https://github.com/<org>/<repo>/blob/<branch>/<relative-path>`
  - For Azure DevOps remotes → `https://dev.azure.com/<org>/<project>/_git/<repo>?path=/<relative-path>&version=GB<branch>`
- The current-branch URL uses whatever branch the worktree currently has checked out.
- The default-branch URL uses the repo's actual default branch (auto-detected, with a `'main'` fallback).
- Both `https` and `ssh` remote forms are accepted on input and produced as `https` URLs on output.
- A toast confirms the copy and identifies which variant landed in the clipboard.
- When no remote is configured or the host isn't recognized, the two URL items do not appear in the menu (the user still gets Copy Full Path / Copy Relative Path as before).

## Non-Goals

- **No support for hosts other than GitHub and Azure DevOps** in this iteration. The internal helper should be designed so GitLab / Bitbucket can be added later, but they are out of scope here.
- **No deep-link line ranges** (e.g., `#L42` or ADO's `&line=42`). Files only.
- **No commit-pinned URLs**. Branch URLs only. (Detached-HEAD handling is an open question — see below.)
- **No URL preview / hover tooltip** in the menu.
- **No keyboard shortcut** for either action.
- **No history / "recently copied URLs" list.**
- **No URL shortening or proxying.** Whatever the host produces is what we copy.
- **No changes to existing Copy Full Path / Copy Relative Path semantics or wording.**

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| _platform/git | **NEW** sub-domain | **create** | New `_platform/git/` cross-cutting subdomain hosting git CLI helpers: `getRemoteUrl`, `getCurrentBranch`, `getDefaultBaseBranch`, plus the pure `parseRemote` / `buildFileUrl` URL builder. Decision per clarify Q5 — promoted to `_platform` so any future consumer (PR view, agents, deeplinking, etc.) has one source of truth. |
| file-browser | existing | **modify** | Owns the right-click context menu (file tree + changes view) and the `useClipboard` hook. Adds two new menu items, two new clipboard handlers, and one new GET API route (`/api/workspaces/[slug]/repo-info`) that consumes `_platform/git`. |
| 071-pr-view | existing | **modify** | Refactor: replace local `git-branch-service.ts` imports of `getCurrentBranch` / `getDefaultBaseBranch` with imports from the new `_platform/git`. Behavior identical; this is a pure import-path refactor. |

### New Sub-domain Sketch

#### _platform/git [NEW sub-domain]
- **Purpose**: Cross-cutting git helpers for the web app — read git CLI state (current branch, default branch, origin remote URL) and translate remote URLs into hosted-repo web URLs (GitHub, Azure DevOps). All helpers run server-side (Node only) and use `execFile('git', [...], { cwd })` for safety.
- **Boundary Owns**:
  - `getCurrentBranch(cwd)` — current branch name, returns `'HEAD'` when detached
  - `getDefaultBaseBranch(cwd)` — parses `origin/HEAD`, falls back to `'main'`
  - `getRemoteUrl(cwd)` — `git config --get remote.origin.url`, returns `null` if unset
  - `parseRemote(url)` — pure: `string -> { host: 'github' | 'azure-devops' | 'unknown'; org; project?; repo } | null`
  - `buildFileUrl(remote, ref, refType, relativePath)` — pure: produces the host-specific web URL; `refType` is `'branch'` or `'commit'`
- **Boundary Excludes**:
  - **Workflow git operations** (worktree creation, fetch, pull, merge-base) — those stay in `@chainglass/workflow`'s `git-worktree-manager.adapter.ts`. This sub-domain is **read-only state + URL translation**, not git workflow management.
  - **PR diff machinery** — `getMergeBase`, `getChangedFilesBranch`, `parseNameStatus` stay in `071-pr-view/lib/git-branch-service.ts` (they're PR-view-specific).
  - **Client-side branch tracking** — `WorkspaceContext.worktreeIdentity.branch` is a UI concern owned by `file-browser`.

## Complexity

- **Score**: CS-3 (medium) — upgraded from CS-2 after clarify Q5; helper-placement decision lifts git utils to `_platform/git`, adding cross-domain refactor surface (PR view import paths) and a new sub-domain to register.
- **Breakdown**: S=2, I=1, D=0, N=1, F=0, T=1 — Total P = 5
  - **Surface Area (S=2)**: Spans three domains (`_platform/git` create, `file-browser` modify, `071-pr-view` import refactor) plus the new API route and three context-menu render sites.
  - **Integration (I=1)**: `git` CLI via `execFile` (already standard in the codebase).
  - **Data/State (D=0)**: No schema, no migrations, no persisted state.
  - **Novelty (N=1)**: ADO `?path=/&version=GB...` quirk + detached-HEAD-as-commit-URL handling (per clarify Q6).
  - **Non-Functional (F=0)**: Standard auth gating. No perf concerns (one git call per worktree, cached on the client).
  - **Testing/Rollout (T=1)**: Pure URL-builder warrants real unit tests. API route warrants integration check. UI tested manually + happy-path component test.
- **Confidence**: 0.85
- **Assumptions**:
  - The `git` binary is on `PATH` in the environment running the Next.js server (already true — used by `git-branch-service.ts`, workflow adapter, etc.).
  - The active worktree's `origin` remote points at the same hosted repo for both branch variants. We don't try to handle multi-remote setups (e.g., `upstream` vs `origin`) — `origin` wins.
  - Path-on-disk separators are `/` (POSIX). Windows servers are not in scope.
- **Dependencies**: None external. All work is in-tree.
- **Risks**:
  - Azure DevOps URL format edge cases (legacy `<org>.visualstudio.com` tenants, SSH `vs-ssh.visualstudio.com` form) — covered by helper tests, not by integration with a real ADO repo.
  - Detached-HEAD state on the worktree (see open question Q1).
  - Forks / shared-fork workflows where `origin` points at the user's fork rather than the canonical repo — out of scope; we always copy what `origin` actually points at.
- **Phases**: Single fix (**FX007**) — one implementation pass with these task groups:
  1. Create `_platform/git` sub-domain skeleton (new `domain.md` + source dir + registry update).
  2. Pure URL builder + `parseRemote` (TDD).
  3. Move `getCurrentBranch` + `getDefaultBaseBranch` to `_platform/git`; add `getRemoteUrl`. Update `071-pr-view` imports; keep PR-view tests green.
  4. New `/api/workspaces/[slug]/repo-info` route.
  5. Extend `useClipboard` (with detached-HEAD-aware "this branch" handler); wire menu items into all three render sites; one-shot `repo-info` fetch in `browser-client.tsx`.

## Acceptance Criteria

1. **GitHub HTTPS remote**: Given a workspace whose `origin` is `https://github.com/AI-Substrate/chainglass.git` and current branch `main`, right-clicking `apps/web/src/foo.ts` and selecting **Copy URL (this branch)** copies `https://github.com/AI-Substrate/chainglass/blob/main/apps/web/src/foo.ts` to the clipboard, and a success toast appears.
2. **GitHub SSH remote**: Given the same repo configured with `git@github.com:AI-Substrate/chainglass.git` as `origin`, the same action produces the **same** HTTPS URL — the SSH form is internally translated to `https://github.com/...`.
3. **GitHub branch variant**: With current branch `feature/foo` and default branch `main`, **Copy URL (this branch)** uses `feature/foo` and **Copy URL (default branch)** uses `main`. Special characters in branch names (e.g., `feature/foo#bar`) are URL-encoded per segment.
4. **Azure DevOps HTTPS remote**: Given `origin = https://dev.azure.com/myorg/myproject/_git/myrepo`, right-clicking `src/lib/util.ts` on branch `main` produces `https://dev.azure.com/myorg/myproject/_git/myrepo?path=/src/lib/util.ts&version=GBmain`.
5. **Azure DevOps SSH remote**: Given `origin = git@ssh.dev.azure.com:v3/myorg/myproject/myrepo`, the action produces the same HTTPS URL as AC4.
6. **Azure DevOps legacy tenant**: `https://<org>.visualstudio.com/<project>/_git/<repo>` is **out of scope** for this iteration. `parseRemote` returns `host: 'unknown'` for visualstudio.com URLs, and the menu items hide. Add later if a user with a legacy tenant requests it.
7. **Default-branch detection**: When the repo's default branch is `master` (e.g., older repos), the **Copy URL (default branch)** menu item produces a URL using `master`. The menu **label adapts** to the actual default branch: it reads "Copy URL (default branch)" regardless of the underlying ref name (per clarify Q7).
8. **Default-branch fallback**: When `git symbolic-ref refs/remotes/origin/HEAD` fails (e.g., remote HEAD not set), the default-branch action falls back to `main` (matching `getDefaultBaseBranch`'s existing contract).
9. **No remote configured**: Given a workspace whose worktree has no `origin` remote, neither URL menu item appears. Copy Full Path and Copy Relative Path remain available.
10. **Unknown host**: Given `origin = git@gitlab.com:foo/bar.git`, neither URL menu item appears.
11. **All three render sites**: The new menu items appear in (a) the file-tree leaf context menu, (b) the file-tree folder context menu, (c) the changes-view item context menu — all behaving identically.
12. **Detached HEAD behavior**: When the worktree is in detached HEAD state, the "this branch" item **relabels to "Copy URL (this commit)"** and produces a commit-pinned URL: GitHub `/blob/<sha>/<path>`, ADO `?path=/<path>&version=GC<sha>`. The default-branch item is unaffected.
13. **Same-branch deduplication**: When the current branch *is* the default branch, **both URL items remain visible** and produce identical strings. Predictable menu structure beats clever deduplication.
14. **Clipboard fallback**: On non-secure contexts (LAN dev access via plain HTTP), copy still succeeds via the existing textarea fallback — no regression vs Copy Full Path / Copy Relative Path.
15. **Auth gating**: The new server endpoint that surfaces remote-info returns `401` without a session and respects the bootstrap-cookie gate, matching the auth pattern of `/api/workspaces/route.ts`.
16. **Worktree validation**: The new endpoint validates the `worktree` query parameter against the workspace's known worktrees before invoking `git`. Arbitrary paths supplied by the client are rejected with `400`.
17. **Toast wording**: A success toast appears on copy with text **"URL copied"** for the branch variant and **"URL copied"** for the default-branch variant. Generic phrasing matches the existing brevity of `"Full path copied"` / `"Relative path copied"`. The toast uses the same `sonner` `toast.success(...)` API as existing handlers.
18. **No existing-feature regressions**: Copy Full Path, Copy Relative Path, Copy Tree From Here, Copy Content, Download, Add Note, Rename, Delete continue to work unchanged. Their wording, icons, and order are unchanged.

## Risks & Assumptions

### Risks

- **R1: Azure DevOps URL format drift.** Microsoft has migrated tenants from `visualstudio.com` to `dev.azure.com` over the years; some legacy URLs still resolve via redirect, others don't. Mitigation: tests cover both modern and SSH forms; legacy `visualstudio.com` is opt-in (see open question).
- **R2: Branch names with unusual characters.** Slashes (`feature/foo`) are common; less common are `#`, `?`, `&`. The URL builder must encode each path segment correctly without over-encoding the slashes between segments. Mitigation: dedicated unit tests for branch and path edge cases.
- **R3: Worktree-path injection on the new endpoint.** A naive endpoint that takes a `worktree` query param and shells `git -C <worktree> config --get remote.origin.url` would be a command-injection vector if the param isn't validated. Mitigation: validate `worktree` against the workspace's known worktrees (a closed set), then pass via `cwd` option (not interpolated into argv) — the same pattern `git-branch-service.ts` already uses.
- **R4: `origin` ≠ canonical repo for forked workflows.** A user working on a fork would copy a URL pointing at their fork. We accept this — `origin` is the contract — and document it.
- **R5: Detached HEAD ambiguity.** Without a clarify decision, the implementation will pick a default that may not match user expectation. Mitigation: surface as open question Q1.

### Assumptions

- The `git` binary is on PATH for the Next.js server process (true today across all environments).
- Worktrees always have `origin` configured if they have any remote at all. Edge case "remote named something other than `origin`" is not supported.
- The Azure DevOps `?path=/&version=GB` URL format is stable and not expected to change in this iteration's lifetime.
- Toast UX matches the existing `sonner` patterns already used by `useClipboard`.

## Testing Strategy

- **Approach**: **Hybrid** — TDD on the pure URL builder; lightweight tests for everything else; manual verification for UI menu wiring.
- **Rationale**: The URL builder is the only piece with non-trivial branching (host detection, ref-type switching, encoding rules). It's the highest-leverage place to invest in tests, and it's pure — easy to TDD with no infrastructure. The git CLI util and API route are thin wrappers; lightweight integration tests give adequate coverage. Menu wiring is mechanical and verified by manual smoke at the three render sites.
- **Mock Usage**: **Targeted mocks for git CLI only.** Real fixtures for URL builder inputs/outputs (pure). Mock `execFile` for `getRemoteUrl` / `getCurrentBranch` / `getDefaultBaseBranch` tests so we don't initialize real git repos per test. No mocks in the API-route happy-path beyond auth/session.
- **Focus Areas**:
  - `parseRemote`: GitHub HTTPS, GitHub SSH, ADO HTTPS, ADO SSH (`vs-ssh.visualstudio.com`, `git@ssh.dev.azure.com:v3/...`), legacy `visualstudio.com` returns `unknown`, GitLab returns `unknown`, malformed input returns `null`.
  - `buildFileUrl`: branch refs and commit refs for both hosts; per-segment URL encoding; branch names containing `/`, `#`, `?`, `&`; nested paths.
  - `getRemoteUrl`: success, no-remote (returns `null`), git-not-installed (returns `null`).
  - API route `/api/workspaces/[slug]/repo-info`: `401` without session, `400` for unknown worktree, `200` happy-path with correct payload shape.
- **Excluded** (manual verification): React component rendering, menu-item visibility logic in the three render sites, toast appearance, clipboard write under non-secure contexts.

## Documentation Strategy

- **Location**: **No new documentation.** Behavior is discoverable from the right-click menu itself. Sufficient: a one-line `## History` entry in each touched domain's `domain.md` (`_platform/git`, `file-browser`, `pr-view`).
- **Rationale**: The feature is a small, self-explanatory UX addition. A README entry or `docs/how/` guide would be more friction than value.

## Resolved Decisions

The following decisions were resolved in the 2026-05-09 clarify session and have been folded into the spec above:

| ID | Topic | Resolution |
|----|-------|------------|
| Q1 | Workflow mode | **Simple / Fix (FX007)**, single implementation pass. |
| Q2 | Testing approach | **Hybrid** — TDD on URL builder, lightweight elsewhere. |
| Q3 | Mock policy | **Targeted mocks for git CLI only.** |
| Q4 | Documentation | **None** beyond domain.md History entries. |
| Q5 | Helper placement | **Lift to `_platform/git` sub-domain.** Refactor PR view (071) to import from new location. |
| Q6 | Detached HEAD | **Switch to commit URL using SHA** — relabel "this branch" item to "Copy URL (this commit)", use `/blob/<sha>/<path>` (GitHub) or `?path=/<path>&version=GC<sha>` (ADO). |
| Q7 | Menu UX | **Flat — "Copy URL (this branch)" + "Copy URL (default branch)"**; label adapts to actual default ref name where surfaced; mobile-friendly; host-agnostic wording. |
| Q8 | No-remote / unknown-host | **Hide both URL items entirely** when origin isn't configured or host is unknown. |

### Carried-Forward Decisions (not asked, applied per spec recommendations)

| Topic | Resolution | Rationale |
|-------|------------|-----------|
| Same-branch dedup | **Show both items** even when current branch == default branch. | Predictability over cleverness. |
| Toast wording | **"URL copied"** (generic). | Matches existing `"Full path copied"` brevity. |
| Legacy ADO `<org>.visualstudio.com` | **Out of scope.** `parseRemote` returns `unknown` for these URLs. | Defer until a user requests it. |

## Workshop Opportunities

None. The research dossier + this spec cover the URL formats sufficiently. Architect proceeds directly without a workshop.

## Clarifications

### Session 2026-05-09

- **Q1 — Workflow mode**: Simple / Fix (Recommended). Track as FX007, single implementation pass.
- **Q2 — Testing approach**: Hybrid (TDD on URL builder, lightweight elsewhere) (Recommended).
- **Q3 — Mock policy**: Targeted mocks for git CLI only (Recommended). Real fixtures for pure URL builder; mock `execFile` for git wrappers.
- **Q4 — Documentation**: No new documentation (Recommended). Domain.md History entries only.
- **Q5 — Helper placement**: **Lift to `_platform` domain** — promote git utils (`getCurrentBranch`, `getDefaultBaseBranch`, `getRemoteUrl`) and the pure URL builder to a new `_platform/git/` sub-domain. Refactor `071-pr-view` import paths. **Scope expansion**: this push complexity from CS-2 to CS-3, adds a domain creation step and a cross-domain import refactor.
- **Q6 — Detached HEAD**: Switch to commit URL using SHA (Recommended). Item relabels to "Copy URL (this commit)"; URL uses `/blob/<sha>/...` for GitHub, `?path=/...&version=GC<sha>` for ADO.
- **Q7 — Menu UX**: Flat — "Copy URL (this branch)" + "Copy URL (default branch)" (Recommended). Mobile-friendly; host-agnostic wording.
- **Q8 — No remote / unknown host**: Hide both URL items entirely (Recommended). Existing menu items (Copy Full Path, etc.) unaffected.

### Carried-forward (not asked, applied per spec defaults)

- **Same-branch dedup** → show both items (predictability).
- **Toast wording** → generic "URL copied" (matches existing brevity).
- **Legacy ADO `<org>.visualstudio.com`** → out of scope this iteration.

### Harness Readiness

Project harness present at **L3** (Boot + Browser Interaction + Structured Evidence + CLI SDK — see `docs/project-rules/harness.md`). Sufficient for this fix; no harness updates required. Architect should reference harness for evidence capture during implementation.
