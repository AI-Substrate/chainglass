# Copy Repo URL Implementation Plan

**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-05-09
**Spec**: [copy-repo-url-spec.md](./copy-repo-url-spec.md)
**Research**: [copy-repo-url-research.md](./copy-repo-url-research.md)
**Status**: DRAFT
**Track**: Fix → **FX007**

📚 Plan derived from clarified spec (8 questions resolved 2026-05-09) + research dossier.

## Summary

Add two right-click context-menu items in the file browser — **Copy URL (this branch)** and **Copy URL (default branch)** — that copy a host-aware web URL (GitHub or Azure DevOps) to the clipboard. The implementation creates a new `_platform/git` sub-domain hosting git CLI helpers and a pure URL builder, lifts `getCurrentBranch` / `getDefaultBaseBranch` from PR view (071) into that sub-domain, adds `getRemoteUrl`, exposes `/api/workspaces/[slug]/repo-info`, and wires the menu items into all three render sites (file-tree leaf, file-tree folder, changes-view item). Detached HEAD state is supported by switching the "this branch" item to a commit-pinned URL using the SHA.

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| `_platform/git` | **NEW** sub-domain | **create** | Cross-cutting git helpers + pure URL builder. New sub-domain under `_platform`. |
| `file-browser` | existing | **modify** | Adds menu items, clipboard handlers, repo-info fetch, new API route. |
| `pr-view` | existing | **modify** | Pure import-path refactor: imports of `getCurrentBranch` / `getDefaultBaseBranch` move from local lib to `_platform/git`. |

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `/Users/jordanknight/substrate/084-random-enhancements-3/docs/domains/_platform/git/domain.md` | `_platform/git` | contract | New domain doc — Concepts, Contracts, Composition, Boundary. |
| `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/features/_platform/git/index.ts` | `_platform/git` | contract | Public re-exports — functions: `parseRemote`, `buildFileUrl`, `getRemoteUrl`, `getCurrentBranch`, `getDefaultBaseBranch`, `getCurrentCommitSha`; types: `RepoHost`, `Remote`, `BuildOptions`, `RepoInfo`. |
| `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/features/_platform/git/lib/repo-url.ts` | `_platform/git` | contract | Pure URL builder: `parseRemote`, `buildFileUrl`, host-discriminated types. |
| `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/features/_platform/git/lib/git-cli.ts` | `_platform/git` | contract | Git CLI wrappers: `getRemoteUrl`, `getCurrentBranch`, `getDefaultBaseBranch`, `getCurrentCommitSha`. |
| `/Users/jordanknight/substrate/084-random-enhancements-3/test/unit/web/features/_platform/git/repo-url.test.ts` | `_platform/git` | internal | TDD test for URL builder. |
| `/Users/jordanknight/substrate/084-random-enhancements-3/test/unit/web/features/_platform/git/git-cli.test.ts` | `_platform/git` | internal | Lightweight tests for git wrappers (mock `execFile`). |
| `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/features/071-pr-view/lib/git-branch-service.ts` | `pr-view` | internal | After T004 retains only PR-view-specific fns: `getMergeBase`, `getChangedFilesBranch`, `parseNameStatus`, `NAME_STATUS_MAP`. `getCurrentBranch` + `getDefaultBaseBranch` are lifted out (one-time refactor — final state is internal). |
| `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/features/071-pr-view/lib/diff-aggregator.ts` | `pr-view` | internal | Update import path to `_platform/git`. |
| `/Users/jordanknight/substrate/084-random-enhancements-3/test/unit/web/features/071-pr-view/git-branch-service.test.ts` | `pr-view` | internal | Move tests for lifted fns; keep tests for PR-view-specific fns here. |
| `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/app/api/workspaces/[slug]/repo-info/route.ts` | `file-browser` | contract | New GET endpoint. Must include `export const dynamic = 'force-dynamic'` (DI container access requires it per Next 16). Signature: `export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> })` with `const { slug } = await params`. Auth gate via `auth()` AND independent bootstrap-cookie verify via `verifyCookieValue` from `@chainglass/shared/auth-bootstrap-code` (defense-in-depth, mirrors `apps/web/app/api/terminal/token/route.ts`). Defensive `worktree` validation (must `startsWith('/')`, must NOT `includes('..')`) **plus** closed-set check against `workspaceService.getInfo(slug)?.worktrees[].path`. |
| `/Users/jordanknight/substrate/084-random-enhancements-3/test/unit/web/api/workspaces/repo-info.test.ts` | `file-browser` | internal | Lightweight test for the route (auth, validation, happy-path). |
| `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/features/041-file-browser/hooks/use-clipboard.ts` | `file-browser` | internal | Extends `UseClipboardOptions` interface with `repoInfo?: RepoInfo \| null` (imported from `_platform/git`). Adds two handlers `handleCopyRepoUrlCurrentRef(relativePath)` and `handleCopyRepoUrlDefaultBranch(relativePath)`. Handlers are no-ops when `repoInfo` is null/undefined or `host === 'unknown'` or `currentSha === null` for the detached path. |
| `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/features/041-file-browser/components/file-tree.tsx` | `file-browser` | internal | Adds three new optional props (propagated to both leaf at ~722 and folder at ~512 renderers): `onCopyRepoUrlCurrentRef?: (path: string) => void`, `onCopyRepoUrlDefaultBranch?: (path: string) => void`, `repoInfo?: RepoInfo \| null`. Two new `<ContextMenuItem>` entries appear immediately AFTER "Copy Relative Path" at both render sites. Items render conditionally on `repoInfo && repoInfo.host !== 'unknown'`. The "this branch" item relabels to "Copy URL (this commit)" when `repoInfo.isDetached && repoInfo.currentSha !== null`. |
| `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/features/041-file-browser/components/changes-view.tsx` | `file-browser` | internal | Same three new props as file-tree.tsx (`onCopyRepoUrlCurrentRef?`, `onCopyRepoUrlDefaultBranch?`, `repoInfo?`). Two new menu entries at the changes-view item context-menu site (~183), positioned immediately AFTER "Copy Relative Path", same conditional render logic. |
| `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | `file-browser` | internal | Adds `useEffect` with dependency `[slug, worktreePath]` that fetches `/api/workspaces/[slug]/repo-info?worktree=<encodedWorktreePath>` and stores the typed `RepoInfo \| null` payload in component state. State seed is `null`; on fetch failure or non-200 response stays `null` (silent degradation — items hide). State is passed to `useClipboard`, `<FileTree>`, and `<ChangesView>` as `repoInfo`. |
| `/Users/jordanknight/substrate/084-random-enhancements-3/docs/domains/registry.md` | `_platform/git` | contract | Add row for new sub-domain. |
| `/Users/jordanknight/substrate/084-random-enhancements-3/docs/domains/domain-map.md` | `_platform/git` | contract | Add `_platform/git` node + edges (file-browser, pr-view consume). |
| `/Users/jordanknight/substrate/084-random-enhancements-3/docs/domains/file-browser/domain.md` | `file-browser` | contract | History row + dependency-on `_platform/git`. |
| `/Users/jordanknight/substrate/084-random-enhancements-3/docs/domains/pr-view/domain.md` | `pr-view` | contract | History row + dependency-on `_platform/git`. |

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | **Worktree-path injection risk on the new endpoint.** A naive endpoint shelling `git -C <worktree>` with attacker-supplied paths is a command-injection vector. Closed-set validation alone is insufficient — values from `getInfo` could in theory contain shell-special characters; missing-workspace cases need explicit handling. | T005: **two-layer** validation. (a) Defensive: `worktree` query param must `startsWith('/')` AND must NOT `includes('..')` — return 400 if either fails. Mirror `apps/web/app/api/pr-view/route.ts` pattern. (b) Closed-set: cross-check the validated string against `workspaceService.getInfo(slug)?.worktrees[].path`. (c) `getInfo(slug) === null` → return 400 ("workspace not found"). Pass via `cwd:` option to `execFile`, never argv. |
| 02 | Critical | **API route must independently verify bootstrap cookie — RootLayout gate is client-only.** `<BootstrapGate>` lives in RootLayout but it's a Server-Component-rendered React tree that gates the *client UI*. API routes do NOT inherit this protection. New endpoints must check the bootstrap cookie themselves (defense-in-depth, mirrors FX008/FX010 hardening). | T005: dual auth check. (a) `const session = await auth(); if (!session) return 401;` (b) Independently `const cookieValue = req.cookies.get(BOOTSTRAP_COOKIE_NAME)?.value; if (!cookieValue \|\| !verifyCookieValue(cookieValue, signingSecret)) return 401;`. Import helpers from `@chainglass/shared/auth-bootstrap-code`. Mirror `apps/web/app/api/terminal/token/route.ts:45-64` exactly. Tests cover both 401 paths. |
| 03 | High | **ADO `?path=/&version=GB...` URL quirk.** Azure DevOps uses `GB` for branch refs and `GC` for commit refs. Easy to silently produce broken URLs. | T002: full TDD on `buildFileUrl`. Tests cover `refType: 'branch'` → `GB`, `refType: 'commit'` → `GC`. Tests reference research dossier Finding 05. |
| 04 | High | **Three context-menu render sites — touch all three.** A naive change that only edits `file-tree.tsx` will leave the changes-view inconsistent. | T007: explicit success criterion enumerates all three render sites (file-tree leaf, folder, changes-view). |
| 05 | Medium | **PR-view import refactor surface is small but real.** Only one consumer (`diff-aggregator.ts`) + one test file. Moving the test file matters. | T004: split tests — keep PR-view-specific tests (`getMergeBase`, `getChangedFilesBranch`, `parseNameStatus`); move `getCurrentBranch` + `getDefaultBaseBranch` tests to `_platform/git`. |
| 06 | Medium | **Branch info already on client.** `WorkspaceContext.worktreeIdentity.branch` carries current branch. Don't re-fetch per click. | T006/T007: `useClipboard` reads current branch from context (already passed via slug/worktreePath chain) **OR** from the one-shot `/repo-info` payload. Pick the latter — `repo-info` returns canonical state including the SHA, branch, default, and host together. |
| 07 | Medium | **Detached-HEAD logic must be in `useClipboard`, not the URL builder.** `buildFileUrl` is pure — given a `refType`, it produces the URL. The decision "branch vs commit" must happen at the caller based on `repo-info.isDetached`. | T006: `handleCopyRepoUrlCurrentRef` switches on `repo-info.isDetached`: `(false, branch)` or `(true, sha)`. Pure helper stays pure. |
| 08 | Medium | **Non-secure-context clipboard fallback is already solved.** Don't roll your own `writeText`. | T006: reuse `copyToClipboard(text)` from existing hook. |
| 09 | Low | **Default-branch label adapts.** Spec resolves the label as "Copy URL (default branch)" — host-agnostic, ref-agnostic. | T007: hard-code the label string. The actual ref (`main`, `master`, etc.) is what `getDefaultBaseBranch` returns and is only visible in the resulting URL, not the menu text. |
| 10 | Low | **Legacy ADO `<org>.visualstudio.com` is out of scope.** `parseRemote` returns `host: 'unknown'` for these URLs; menu items hide. | T002: explicit unit test asserts visualstudio.com → `unknown`. |
| 11 | Critical | **Next.js 16 App Router conventions for `[slug]` routes.** `params` is a `Promise<{ slug: string }>` and must be `await`ed. Routes that resolve from the DI container must declare `export const dynamic = 'force-dynamic'` or build-time prerender will attempt to call DI before init. Existing `apps/web/app/api/workspaces/[slug]/route.ts:18-22` is the canonical template. | T005: route signature `export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> })` with `const { slug } = await params`. Add `export const dynamic = 'force-dynamic'` at top of file. Test asserts route doesn't crash on first hit. |
| 12 | High | **Remote URLs may contain credentials.** `git config --get remote.origin.url` returns whatever was committed (or set locally); `https://user:token@github.com/...` is a real pattern when cloning private repos. The raw `remoteUrl` MUST NOT be returned to the client (token leak via clipboard, screen-share, or browser-cache), and `parseRemote` must normalize it before any URL construction. | T002: `parseRemote` strips embedded credentials before parsing — explicit test for `https://user:token@github.com/org/repo.git` → `{ host: 'github', org: 'org', repo: 'repo' }`. T005: response shape **drops `remoteUrl`** entirely — client never sees the raw string. Replace `remoteUrl` with the parsed `host`, `org`, `project?`, `repo` fields the URL builder actually needs. |
| 13 | High | **Worktree switches mid-session must re-fetch repo-info.** The user can switch worktrees via the worktree picker without remounting the browser page. A single mount-time fetch leaves stale `currentBranch` / `currentSha` and produces wrong URLs. | T007: `useEffect` dependency array MUST be `[slug, worktreePath]` so the fetch re-runs on either change. State seed is `null`; while loading, items hide (silent degradation). |
| 14 | High | **`getCurrentCommitSha` may legitimately return `null` (zero-commit worktree, broken HEAD).** If the response carries a non-null `currentSha` field but the underlying value is empty, the detached-HEAD URL is malformed. | T003: `getCurrentCommitSha(cwd): Promise<string \| null>` — full 40-char SHA on success, `null` on failure. T005 response shape: `currentSha: string \| null`. T006: detached-HEAD handler additionally checks `currentSha !== null` — if null, the "this branch/commit" item is treated as host=unknown (no-op + hide). |

## Constitution Gate

Reviewed `docs/project-rules/constitution.md` § Principle 1 (Clean Architecture with Strict Dependency Direction). No deviations needed — `_platform/git` follows the standard infrastructure-domain shape (pure helpers + thin CLI wrappers, no business logic, no domain dependencies upward).

## Architecture Gate

Reviewed `docs/project-rules/architecture.md`. No layer violations:
- `_platform/git` is infrastructure — `file-browser` (business) and `pr-view` (business) consume its contracts, which is correct direction.
- No business → infrastructure cycles introduced.
- No new package boundary; lives under `apps/web/src/features/_platform/git/`.

## Harness Strategy

- **Current Maturity**: L3 (Boot + Browser Interaction + Structured Evidence + CLI SDK)
- **Target Maturity**: L3 (no change required)
- **Boot Command**: per `docs/project-rules/harness.md`
- **Health Check**: harness CLI's existing health endpoint
- **Interaction Model**: Browser automation via Playwright/CDP (for manual UI verification of menu sites)
- **Evidence Capture**: Screenshots of context menu showing new items at each of the three render sites
- **Pre-Phase Validation**: Run health check before starting T001; capture three screenshots in T007 evidence (file-tree leaf, folder, changes-view)

## Implementation

**Objective**: Ship FX007 — two new right-click menu items copying host-aware web URLs, backed by a new `_platform/git` sub-domain.

**Testing Approach**: **Hybrid** per spec — Full TDD on the pure URL builder (T002); lightweight tests on git-CLI wrappers (T003) and the API route (T005); manual UI verification on menu wiring (T007). No tests for the React component plumbing.

### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [x] | T001 | Create `_platform/git` sub-domain skeleton: `domain.md` (Purpose, Boundary, Contracts placeholders, Concepts placeholder, History), source dir `apps/web/src/features/_platform/git/{lib,index.ts}`, registry row, domain-map node + edges. | `_platform/git` | `/Users/jordanknight/substrate/084-random-enhancements-3/docs/domains/_platform/git/domain.md`, `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/features/_platform/git/index.ts`, `/Users/jordanknight/substrate/084-random-enhancements-3/docs/domains/registry.md`, `/Users/jordanknight/substrate/084-random-enhancements-3/docs/domains/domain-map.md` | `domain.md` exists with all sections; `index.ts` exists (placeholder, populated in T002/T003); registry has new row `\| Git \| _platform/git \| infrastructure \| _platform \| Plan 084 FX007 \| active \|`; domain-map shows `_platform/git` infrastructure node AND both edges `fileBrowser --consumes--> gitPlatform` and `prView --consumes--> gitPlatform`. | Use `_platform/events/domain.md` as a template. |
| [x] | T002 | **TDD**: Write `repo-url.test.ts` (RED first), then implement `repo-url.ts`, then refactor (GREEN). Mandatory test fixtures: (a) GitHub HTTPS `https://github.com/org/repo.git` → `{ host: 'github', org, repo }`; (b) GitHub SSH `git@github.com:org/repo.git` → same; (c) ADO HTTPS `https://dev.azure.com/org/project/_git/repo` → `{ host: 'azure-devops', org, project, repo }`; (d) ADO SSH `git@ssh.dev.azure.com:v3/org/project/repo` → same; (e) GitHub HTTPS WITH credentials `https://user:token@github.com/org/repo.git` → output URL must NOT contain `user:token` (credential stripping per finding 12); (f) Legacy ADO `https://org.visualstudio.com/...` → `{ host: 'unknown' }`; (g) GitLab `git@gitlab.com:org/repo.git` → `{ host: 'unknown' }`; (h) Malformed → `null`. URL builder fixtures: branch ref `feature/foo` → URL contains `/feature/foo` (slashes preserved); branch `feature/foo#bar` → URL contains `feature/foo%23bar` (`#` encoded, `/` preserved); branch `master` → URL uses `master` literal; commit ref via `refType: 'commit'` → GitHub `/blob/<sha>/`, ADO `?path=/&version=GC<sha>`; nested path `src/lib/util.ts` → slashes preserved. Types: `RepoHost = 'github' \| 'azure-devops' \| 'unknown'`, `Remote = { host; org; project?; repo }`, `BuildOptions = { ref: string; refType: 'branch' \| 'commit'; relativePath: string }`. | `_platform/git` | `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/features/_platform/git/lib/repo-url.ts`, `/Users/jordanknight/substrate/084-random-enhancements-3/test/unit/web/features/_platform/git/repo-url.test.ts` | All listed test fixtures pass. Per-segment URL encoding correct (slashes preserved across path & branch). Credential-bearing URLs never reflect creds in output. Per findings 03, 10, 12. | Pure module, no `node:*` imports. |
| [x] | T003 | Implement `git-cli.ts`. All use `execFile('git', [...], { cwd })`. Return contracts: `getRemoteUrl(cwd): Promise<string \| null>` — `null` on no-remote / failure. `getCurrentBranch(cwd): Promise<string>` — branch name on success, `'HEAD'` when detached (preserves existing PR-view contract). `getDefaultBaseBranch(cwd): Promise<string>` — actual ref name (e.g. `'master'`) on success, **falls back to `'main'`** on failure (preserves existing PR-view contract — never returns `null`). `getCurrentCommitSha(cwd): Promise<string \| null>` — full 40-char SHA on success, `null` on failure (zero-commit worktree, broken HEAD, git not installed). Lightweight tests with `execFile` mocked: each function has happy-path + failure-path. Define and export the `RepoInfo` type here too: `RepoInfo = { host: RepoHost; org: string \| null; project: string \| null; repo: string \| null; currentBranch: string; defaultBranch: string; currentSha: string \| null; isDetached: boolean }`. | `_platform/git` | `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/features/_platform/git/lib/git-cli.ts`, `/Users/jordanknight/substrate/084-random-enhancements-3/test/unit/web/features/_platform/git/git-cli.test.ts`, `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/features/_platform/git/index.ts` | Tests pass for all four functions (happy + failure). `index.ts` exports — functions: `parseRemote`, `buildFileUrl`, `getRemoteUrl`, `getCurrentBranch`, `getDefaultBaseBranch`, `getCurrentCommitSha`; types: `RepoHost`, `Remote`, `BuildOptions`, `RepoInfo`. Per finding 14. | `getCurrentBranch` 'HEAD' contract preserved verbatim from `apps/web/src/features/071-pr-view/lib/git-branch-service.ts`. |
| [x] | T004 | Refactor PR view to consume the lifted helpers. (a) Remove `getCurrentBranch` and `getDefaultBaseBranch` from `apps/web/src/features/071-pr-view/lib/git-branch-service.ts` (keep PR-view-specific fns and `NAME_STATUS_MAP`). (b) Update `diff-aggregator.ts` import path to `@/features/_platform/git` (or relative equivalent). (c) **Test-merge strategy**: T003 has already produced `git-cli.test.ts` with happy + failure tests for the two lifted functions. Compare against `test/unit/web/features/071-pr-view/git-branch-service.test.ts` — for any PR-view test that exercises a behavior NOT yet covered in `git-cli.test.ts`, port the *test* (not duplicate); for redundant tests, delete from PR-view file. Drop `getCurrentBranch` / `getDefaultBaseBranch` test blocks from the PR-view file entirely. Run full PR-view test suite — must be green. | `pr-view` | `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/features/071-pr-view/lib/git-branch-service.ts`, `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/features/071-pr-view/lib/diff-aggregator.ts`, `/Users/jordanknight/substrate/084-random-enhancements-3/test/unit/web/features/071-pr-view/git-branch-service.test.ts` | `git-branch-service.ts` retains only `getMergeBase`, `getChangedFilesBranch`, `parseNameStatus`, `NAME_STATUS_MAP`, type re-exports. `diff-aggregator.ts` imports lifted fns from `_platform/git`. PR-view test file no longer references `getCurrentBranch` / `getDefaultBaseBranch`. No duplicate test names between PR-view and `_platform/git` test files. Full PR-view test suite passes. | Per finding 05. Pure import refactor — zero behavior change. |
| [x] | T005 | Add API route `GET /api/workspaces/[slug]/repo-info?worktree=<path>`. **Mandatory boilerplate**: `export const dynamic = 'force-dynamic'` at top. Signature: `export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> })`; extract via `const { slug } = await params`. **Two-layer auth**: (1) `const session = await auth(); if (!session) return 401;` (2) Independently `const cookieValue = req.cookies.get(BOOTSTRAP_COOKIE_NAME)?.value; if (!cookieValue \|\| !verifyCookieValue(cookieValue, signingSecret)) return 401;` — import helpers from `@chainglass/shared/auth-bootstrap-code`, mirror `apps/web/app/api/terminal/token/route.ts:45-64`. **Two-layer worktree validation**: (a) defensive — `worktree` must `startsWith('/')` AND must NOT `includes('..')` else 400; (b) closed-set — must match one of `workspaceService.getInfo(slug)?.worktrees[].path` else 400; (c) `getInfo(slug) === null` → 400. Then call `Promise.all([getRemoteUrl(validatedWorktree), getCurrentBranch(validatedWorktree), getDefaultBaseBranch(validatedWorktree), getCurrentCommitSha(validatedWorktree)])`. Compute `parseRemote(remoteUrl)` to derive `host`, `org`, `project`, `repo`. **Response shape (no raw remoteUrl — credential-leak risk per finding 12)**: `{ host: RepoHost; org: string \| null; project: string \| null; repo: string \| null; currentBranch: string; defaultBranch: string; currentSha: string \| null; isDetached: boolean }` where `isDetached = currentBranch === 'HEAD'`. If `getRemoteUrl` returns null OR `parseRemote` returns null → respond 200 with `host: 'unknown'`, all repo fields `null` (client hides items). Tests cover: 401-no-session, 401-no-bootstrap-cookie, 400-missing-worktree, 400-traversal-attempt (`..`), 400-unknown-worktree-not-in-closed-set, 200-happy-path-shape, 200-host-unknown-when-no-remote. | `file-browser` | `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/app/api/workspaces/[slug]/repo-info/route.ts`, `/Users/jordanknight/substrate/084-random-enhancements-3/test/unit/web/api/workspaces/repo-info.test.ts` | All 7 test cases pass. Response shape matches `RepoInfo` type from `_platform/git`. No raw `remoteUrl` in response. Per findings 01, 02, 11, 12, 14. | Auth + DI + dynamic-export pattern from `apps/web/app/api/workspaces/route.ts:18-22`; bootstrap-cookie verify pattern from `apps/web/app/api/terminal/token/route.ts:45-64`; defensive worktree validation pattern from `apps/web/app/api/pr-view/route.ts`. |
| [x] | T006 | Extend `useClipboard` hook. **Interface change** — `UseClipboardOptions` gains `repoInfo?: RepoInfo \| null` (import `RepoInfo` from `@/features/_platform/git`). Add two handlers: `handleCopyRepoUrlCurrentRef(relativePath)` and `handleCopyRepoUrlDefaultBranch(relativePath)`. Both call `buildFileUrl(remote, options).then(url => copyToClipboard(url); toast.success('URL copied'))` where `remote = { host, org, project, repo }` is reconstructed from `repoInfo` fields. `handleCopyRepoUrlCurrentRef`: when `repoInfo.isDetached && repoInfo.currentSha !== null` use `{ ref: currentSha, refType: 'commit' }`, when `!isDetached` use `{ ref: currentBranch, refType: 'branch' }`, when `isDetached && currentSha === null` no-op. `handleCopyRepoUrlDefaultBranch`: always `{ ref: defaultBranch, refType: 'branch' }`. **Universal no-op guard**: when `!repoInfo \|\| repoInfo.host === 'unknown'`, both handlers no-op silently (visibility logic lives in T007 components, not in the hook). | `file-browser` | `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/features/041-file-browser/hooks/use-clipboard.ts` | Hook compiles with new optional `repoInfo` field. Both handlers exposed in return object. Lightweight test confirms: handler calls `copyToClipboard` + `toast.success('URL copied')` on the happy path; no-ops when `repoInfo` is null, `host === 'unknown'`, or detached + null SHA. Per findings 07, 08, 14. | Reuse existing `copyToClipboard(text)` — no new clipboard fallback code. Visibility/render gating happens in T007 (components), not here. |
| [x] | T007 | Wire menu items + repo-info fetch. **(a) `browser-client.tsx`**: add a `useState<RepoInfo \| null>(null)` and a `useEffect` with dependency array `[slug, worktreePath]` that calls `fetch(/api/workspaces/${slug}/repo-info?worktree=${encodeURIComponent(worktreePath)})`; on 200 set state from JSON; on any non-200 leave state `null` (silent degradation per finding 13). Pass `repoInfo` to `useClipboard({ ..., repoInfo })` and as a prop to `<FileTree repoInfo={repoInfo} onCopyRepoUrlCurrentRef={...} onCopyRepoUrlDefaultBranch={...} />` and the changes-view equivalent. **(b) `file-tree.tsx`**: extend FileTree props with the three new optional fields (`onCopyRepoUrlCurrentRef?: (path: string) => void`, `onCopyRepoUrlDefaultBranch?: (path: string) => void`, `repoInfo?: RepoInfo \| null`). Propagate via the existing prop chain to BOTH the file-leaf renderer (~722) AND the folder renderer (~512). At each site insert two new `<ContextMenuItem>` entries **immediately AFTER the existing "Copy Relative Path" item**: "Copy URL (this branch)" or "Copy URL (this commit)" (relabel when `repoInfo.isDetached && repoInfo.currentSha !== null`) and "Copy URL (default branch)". **Visibility gate** at each site: render the two items only when `repoInfo && repoInfo.host !== 'unknown'`. **(c) `changes-view.tsx`** (~183): same three new props, same two new menu items in the same position with the same gate. **(d) Manual smoke-test**: harness Playwright captures three screenshots — one per render site — with a GitHub-remote workspace; flip to detached HEAD and capture again to verify the relabel; flip to a no-remote workspace and capture to verify both items are hidden. | `file-browser` | `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx`, `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/features/041-file-browser/components/file-tree.tsx`, `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/features/041-file-browser/components/changes-view.tsx` | useEffect dep array is `[slug, worktreePath]` (worktree-switch refetch). Both menu items appear at all three render sites in the position immediately after "Copy Relative Path". Items hide when `repoInfo` is null OR `host === 'unknown'`. Detached-HEAD relabels "this branch" → "this commit" only when `currentSha !== null`. URL lands in clipboard with toast `"URL copied"`. Three screenshots committed as evidence (GitHub, detached, no-remote). Per findings 04, 06, 07, 09, 13. | Manual UI verification is the primary test surface (no React component tests added — accepted trade-off in spec § Testing Strategy). |
| [ ] | T008 | Update domain.md History rows for `_platform/git` (creation), `file-browser` (FX007 added repo-URL menu items + repo-info route), `pr-view` (FX007 lifted git-branch helpers to `_platform/git`). Update `_platform/git` domain.md Concepts table with one entry: "Translate git remote to web URL" → `parseRemote` + `buildFileUrl` + `getRemoteUrl`. | all 3 | `/Users/jordanknight/substrate/084-random-enhancements-3/docs/domains/_platform/git/domain.md`, `/Users/jordanknight/substrate/084-random-enhancements-3/docs/domains/file-browser/domain.md`, `/Users/jordanknight/substrate/084-random-enhancements-3/docs/domains/pr-view/domain.md`, `/Users/jordanknight/substrate/084-random-enhancements-3/docs/domains/registry.md`, `/Users/jordanknight/substrate/084-random-enhancements-3/docs/domains/domain-map.md` | Three History rows added. `_platform/git` Concepts table populated. domain-map shows `file-browser` and `pr-view` consuming `_platform/git`. | Per spec § Documentation Strategy. |

### Acceptance Criteria

- [ ] AC1 — GitHub HTTPS remote produces `https://github.com/<org>/<repo>/blob/<branch>/<path>` from "Copy URL (this branch)".
- [ ] AC2 — GitHub SSH remote (`git@github.com:org/repo.git`) translates to the same HTTPS URL as AC1.
- [ ] AC3 — Branch with `/` (`feature/foo`) is preserved in URL; `feature/foo#bar` URL-encodes the `#`.
- [ ] AC4 — ADO HTTPS remote produces `https://dev.azure.com/<org>/<project>/_git/<repo>?path=/<path>&version=GB<branch>`.
- [ ] AC5 — ADO SSH remote (`git@ssh.dev.azure.com:v3/...`) translates to the same HTTPS URL as AC4.
- [ ] AC6 — Legacy `<org>.visualstudio.com` URLs return `host: 'unknown'`; menu items hide.
- [ ] AC7 — Default-branch detection uses actual ref (`master` if that's the default); menu label remains "Copy URL (default branch)".
- [ ] AC8 — `origin/HEAD` not set → `getDefaultBaseBranch` falls back to `'main'`.
- [ ] AC9 — No `origin` remote → both URL menu items hide; existing items unaffected.
- [ ] AC10 — Unknown host (e.g. GitLab) → both URL menu items hide.
- [ ] AC11 — Both menu items appear at all three render sites: file-tree leaf, file-tree folder, changes-view item.
- [ ] AC12 — Detached HEAD with non-null SHA: "this branch" item relabels to "Copy URL (this commit)" and uses SHA + `GC` (ADO) or `/blob/<sha>/` (GitHub). When `currentSha === null` (zero-commit worktree), the "this branch / this commit" item is hidden.
- [ ] AC13 — Current branch == default branch → both items remain visible (predictability).
- [ ] AC14 — Non-secure context (HTTP) → copy still succeeds via existing textarea fallback.
- [ ] AC15 — `/api/workspaces/[slug]/repo-info` returns 401 without session AND returns 401 when bootstrap cookie is missing/invalid (independent verifications per finding 02).
- [ ] AC16 — `/api/workspaces/[slug]/repo-info` returns 400 for: missing `worktree` param, traversal attempts (`worktree` containing `..`), absolute paths not in workspace's closed worktree set, unknown workspace slug.
- [ ] AC17 — Toast text on success: `"URL copied"` (matches existing brevity).
- [ ] AC18 — No regression: each existing context-menu item (Copy Full Path, Copy Relative Path, Copy Tree, Copy Content, Download, Add Note, Rename, Delete) still appears at all three render sites and invokes its existing handler without error. Verified via screenshot comparison + manual smoke at each site.
- [ ] AC19 — Remote URLs containing credentials (e.g. `https://user:token@github.com/...`) are normalized in `parseRemote` so the produced web URL contains no credentials. The `/repo-info` response shape does NOT include the raw `remoteUrl` field (only the parsed `host`/`org`/`project`/`repo` fields the client needs).
- [ ] AC20 — Switching worktrees mid-session refetches `/repo-info`. The `useEffect` in `browser-client.tsx` has dependency array `[slug, worktreePath]`; flipping the URL `worktree` param visibly updates `currentBranch` / `currentSha` in the next copy action.
- [ ] AC21 — Route file declares `export const dynamic = 'force-dynamic'` and uses Next 16 async-`params` pattern (`{ params }: { params: Promise<{ slug: string }> }`, `await params`).

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Worktree-path injection on `/repo-info` route | Low | High | T005 uses **two-layer** validation: defensive (`startsWith('/')`, `!includes('..')`) AND closed-set match against `workspaceService.getInfo(slug)?.worktrees[].path`. Passes via `cwd:` (not argv). Mirrors `apps/web/app/api/pr-view/route.ts` pattern. |
| API auth bypass via missing bootstrap-cookie check | Low | Critical | T005 dual-checks `auth()` AND independently `verifyCookieValue` for the bootstrap cookie (RootLayout `<BootstrapGate>` is client-only and does NOT gate API routes). Mirrors `apps/web/app/api/terminal/token/route.ts:45-64`. |
| Credential leak via remoteUrl in clipboard | Medium | High | T002 `parseRemote` strips credentials from `https://user:token@host/...` before parsing. T005 response shape does NOT carry the raw `remoteUrl` — only parsed `host`/`org`/`project`/`repo`. AC19 enforces. |
| Stale `repoInfo` after worktree switch | High | Medium | T007 `useEffect` dep array is `[slug, worktreePath]` so worktree switches re-fetch automatically. AC20 enforces. |
| Zero-commit worktree → null `currentSha` produces malformed commit URL | Low | Medium | T003 `getCurrentCommitSha` returns `string \| null`. T005 response carries `currentSha: string \| null`. T006 detached handler no-ops when `currentSha === null`. T007 hides the "this branch / this commit" item in the same case. |
| Next 16 App Router pitfalls (`params` Promise, missing `dynamic` export) | Medium | High | T005 explicit boilerplate: `export const dynamic = 'force-dynamic'`, `params: Promise<{slug: string}>`, `await params`. AC21 enforces. |
| ADO URL format drift (legacy `visualstudio.com`) | Medium | Low | Out of scope per spec. `parseRemote` returns `unknown`; menu items hide. T002 tests the unknown-host path explicitly. |
| Branch names with unusual chars (`#`, `?`, `&`) | Medium | Medium | T002 tests `feature/foo#bar`-style branches. Per-segment URL encoding in `buildFileUrl`. |
| PR-view tests break during import refactor | Low | Medium | T004 explicit success criterion — full PR-view test suite green before T004 closes. Pure import path change, zero behavior change. |
| Detached-HEAD logic placed in wrong layer (URL builder vs caller) | Low | Low | Finding 07 + T006 success criterion: builder stays pure, caller decides ref-type based on `repoInfo.isDetached`. |
| Three render sites: missing one | Medium | Low | T007 success criterion enumerates all three sites + harness screenshots as evidence. |
| Forks: `origin` points at user fork, not canonical repo | Low | Low | Out of scope. Spec accepts this — copy whatever `origin` points at. Document in `_platform/git` domain.md Boundary. |

## Domain.md Update Plan

After T008 lands, the following domain docs reflect this change:

- **`_platform/git/domain.md`**: NEW. Sections: Purpose, Boundary (Owns / Excludes), Contracts (table with `parseRemote`, `buildFileUrl`, `getRemoteUrl`, `getCurrentBranch`, `getDefaultBaseBranch`, `getCurrentCommitSha`), Composition, Dependencies (no upstream domain deps; downstream: `file-browser`, `pr-view`), Concepts (one concept: "Translate git remote to web URL"), Source Location, History.
- **`file-browser/domain.md` § History**: `| FX007 | Added Copy URL menu items for GitHub/Azure DevOps + repo-info API route. Consumes _platform/git. | 2026-05-09 |`
- **`file-browser/domain.md` § Dependencies → "This Domain Depends On"**: add `_platform/git` row.
- **`pr-view/domain.md` § History**: `| FX007 | Lifted getCurrentBranch + getDefaultBaseBranch to _platform/git; PR-view-specific git fns remain. | 2026-05-09 |`
- **`pr-view/domain.md` § Dependencies → "This Domain Depends On"**: add `_platform/git` row.
- **`registry.md`**: add row `| Git | _platform/git | infrastructure | _platform | Plan 084 FX007 | active |`.
- **`domain-map.md`**: add `gitPlatform` node under infrastructure with contracts list; add edges `fileBrowser --consumes--> gitPlatform` and `prView --consumes--> gitPlatform`.

---

**Next step (Simple Mode)**: Run **/plan-6-v2-implement-phase --plan "/Users/jordanknight/substrate/084-random-enhancements-3/docs/plans/084-random-enhancements-3/copy-repo-url-plan.md"** to begin FX007 implementation.

---

## Validation Record (2026-05-09)

`/plan-4-v2-complete-the-plan` + `/validate-v2` (broad scope) ran 2026-05-09 against this plan.

### plan-4 readiness (5 validators)

| Validator | Status | HIGH | MEDIUM | LOW |
|-----------|--------|------|--------|-----|
| Structure | PASS | 0 | 0 | 0 |
| Testing Alignment | PASS | 0 | 0 | 0 |
| Domain Completeness | PASS | 0 | 0 | 0 |
| Doctrine | ISSUES | 0 | 4 | 0 |
| ADR | PASS | 0 | 0 | 0 |

**Verdict**: READY (zero HIGH). 4 MEDIUM in Doctrine documented; not blocking.

### validate-v2 (4 agents — Coherence, Risk, Completeness, Forward-Compatibility)

| Agent | Lenses Covered | Issues | Verdict |
|-------|---------------|--------|---------|
| Coherence | System Behavior, Domain Boundaries, Integration & Ripple | 3 HIGH, 4 MEDIUM, 1 LOW — all HIGH fixed | ⚠️ → ✅ |
| Risk | Hidden Assumptions, Edge Cases & Failures, Security & Privacy | 2 CRITICAL, 4 HIGH, 4 MEDIUM — all CRITICAL+HIGH fixed | ⚠️ → ✅ |
| Completeness | User Experience, Concept Documentation, Technical Constraints | 1 CRITICAL, 2 HIGH, 4 MEDIUM, 3 LOW — all CRITICAL+HIGH fixed | ⚠️ → ✅ |
| Forward-Compatibility | Forward-Compatibility, Deployment & Ops | 1 CRITICAL, 3 HIGH, 4 MEDIUM, 1 LOW — all CRITICAL+HIGH fixed | ⚠️ → ✅ |

**Lens coverage**: 11/12 (above 8-floor). Forward-Compatibility engaged (downstream consumers concrete, not standalone).

### Forward-Compatibility Matrix (post-fix)

| Consumer | Requirement | Failure Mode | Verdict | Evidence |
|----------|-------------|--------------|---------|----------|
| `/plan-6-v2-implement-phase` | Tasks self-contained, paths absolute, success criteria binary, ordering correct | contract drift | ✅ | T001-T008 all updated with explicit success criteria, ordering, and find/AC cross-references |
| `_platform/git/index.ts` (T001/T003) | Re-export all contracts including `RepoInfo` | encapsulation lockout | ✅ | T003 success criterion enumerates exact functions + types: `parseRemote`, `buildFileUrl`, `getRemoteUrl`, `getCurrentBranch`, `getDefaultBaseBranch`, `getCurrentCommitSha`, `RepoHost`, `Remote`, `BuildOptions`, `RepoInfo` |
| `diff-aggregator.ts` (T004) | Resolve lifted helpers from `_platform/git`; zero behavior change | contract drift | ✅ | T004 spells out import-path change with explicit no-behavior-change clause |
| `file-tree.tsx` props (T007) | New props `onCopyRepoUrlCurrentRef?`, `onCopyRepoUrlDefaultBranch?`, `repoInfo?` enumerated | shape mismatch | ✅ | Domain Manifest line 41 + T007 success criterion both list the three props with exact types |
| `changes-view.tsx` props (T007) | Same prop chain as file-tree | shape mismatch | ✅ | Domain Manifest line 42 + T007 mirror file-tree explicitly |
| `useClipboard` hook (T006) | `UseClipboardOptions` interface change explicit | shape mismatch | ✅ | T006 reworded with "**Interface change** — `UseClipboardOptions` gains `repoInfo?: RepoInfo \| null`" |
| `/api/.../repo-info` payload (T005) | Response shape complete, error contracts specified | shape mismatch | ✅ | T005 enumerates 7 test cases including null-remote, traversal, no-bootstrap-cookie; response shape has no raw `remoteUrl` (credential leak prevention per finding 12) |
| `browser-client.tsx` repo-info fetch (T007) | useEffect dep array specified for worktree-switch refetch | lifecycle ownership | ✅ | T007 success criterion: `[slug, worktreePath]` dep array; AC20 enforces |
| `git-branch-service.test.ts` test merge (T004) | Strategy specified, no duplicates | contract drift | ✅ | T004 spells out the merge protocol: port behaviors not yet covered, delete redundant, drop entirely from PR-view file |
| `registry.md` / `domain-map.md` (T001/T008) | Track new sub-domain + edges | contract drift | ✅ | Domain.md Update Plan + T001 success criterion both name the registry row format and the two domain-map edges verbatim |

**Outcome alignment**: The plan, with the post-validation fixes applied, now fully advances the spec's outcome — the URL builder strips credentials (no leak risk in clipboard); the API route is hardened against worktree-path injection, auth bypass, and Next 16 conventions; the `useClipboard` interface change is explicit so menu wiring won't deadlock on missing types; the worktree-switch refetch closes the stale-state gap; and `RepoInfo` is exported from `_platform/git` so all consumers can import the canonical shape — meaning a clean implementation pass will produce clickable GitHub/Azure DevOps URLs that paste into PR descriptions and Slack messages without exposing credentials or breaking on edge cases.

**Standalone?**: No — 10 downstream consumers named with concrete needs.

**Fixes applied (CRITICAL + HIGH)**:
- C1 (worktree validation two-layer) — T005 + Finding 01 + Risks
- C2 (independent bootstrap-cookie verify) — T005 + Finding 02 + Risks
- C3 (Next 16 `params` async + `dynamic` export) — T005 + Finding 11 + AC21 + Risks
- C4 (useClipboard interface change explicit) — T006 + Domain Manifest
- H1 (`getDefaultBaseBranch` returns `'main'` not null) — T003
- H2 (visibility lives in T007 components) — T006 + T007
- H3 (`index.ts` exports enumerate `RepoInfo`) — T003 + Domain Manifest
- H4 (`getCurrentCommitSha` null handling) — T003 + T005 + T006 + T007 + AC12 + Finding 14 + Risks
- H5 (URL credential strip + drop raw `remoteUrl` from response) — T002 + T005 + Finding 12 + AC19 + Risks
- H6 (useEffect dep array) — T007 + Finding 13 + AC20 + Risks
- H7 (`dynamic = 'force-dynamic'`) — T005 + Finding 11 + AC21
- H8 (T005 error contract explicit) — T005 (7 tests)
- H9 (file-tree + changes-view prop signatures) — Domain Manifest + T007

**Open (MEDIUM/LOW — user decision)**:
- Doctrine MEDIUMs (Test Doc format, "lightweight" vs full-TDD language, mock-vs-fake, Principle 7 placement question for `_platform/git`) — not addressed; matches existing project patterns.
- CS score may be revisitable (S=2 vs S=1 debate) — left at CS-3 because the cross-domain refactor surface is genuinely there.
- AC18 phrasing tightened slightly but "no regression" still relies on manual smoke-test — accepted trade-off per spec § Testing Strategy.
- AC7 label clarification — already explicit (label always "Copy URL (default branch)" regardless of underlying ref).

**Overall**: ⚠️ VALIDATED WITH FIXES — ready for `/plan-6-v2-implement-phase`.
