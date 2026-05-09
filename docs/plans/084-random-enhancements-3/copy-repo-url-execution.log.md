# Execution Log: copy-repo-url FX007

**Plan**: [copy-repo-url-plan.md](./copy-repo-url-plan.md)
**Started**: 2026-05-09
**Skill**: `/plan-6-v2-implement-phase-companion`
**Companion run**: `2026-05-09T13-11-12-883Z-35ae` (slug: code-review-companion)

---

## Pre-Phase Harness Validation

| Stage | Status | Note |
|-------|--------|------|
| Boot | ⏭ Skipped | Manual UI verification deferred to T007 (per plan); harness used only for T007 screenshots. Unit + lightweight tests for T002–T006 do not require harness. |
| Interact | n/a | — |
| Observe | n/a | — |

L3 harness available; will boot and capture screenshots in T007.

## Companion Findings Disposition

| Finding ID | ackOf | Severity | Status | Action |
|-----------|-------|----------|--------|--------|
| _(none yet)_ | | | | |

## Per-Task Log

### T001 — Create _platform/git sub-domain skeleton

**Started**: 2026-05-09

**Files created/modified**:
- `docs/domains/_platform/git/domain.md` — NEW. Sections: Purpose, Boundary, Contracts, Composition, Source Location, Concepts, Dependencies, History.
- `apps/web/src/features/_platform/git/index.ts` — NEW. Public re-exports stubbed; pulls `parseRemote`, `buildFileUrl`, types from `./lib/repo-url` (T002), CLI wrappers + `RepoInfo` from `./lib/git-cli` (T003). File compiles only after T002+T003 land — acceptable per plan (placeholder).
- `apps/web/src/features/_platform/git/lib/` — directory created (empty until T002).
- `test/unit/web/features/_platform/git/` — directory created (empty until T002).
- `docs/domains/registry.md` — added row `| Git | _platform/git | infrastructure | _platform | Plan 084 FX007 | active |`.
- `docs/domains/domain-map.md` — added `gitPlatform` node under infrastructure (orange "new" class) with full contract list; added two edges `fileBrowser --consumes--> gitPlatform` and `prView --consumes--> gitPlatform`; added Domain Health Summary row.

**Done When** evidence:
- `domain.md` exists with all required sections — ✅
- `index.ts` exists (placeholder) — ✅ (broken imports until T002/T003 — expected)
- `registry.md` has new row — ✅
- `domain-map.md` shows `_platform/git` infrastructure node + both consumer edges — ✅

### T002 — TDD URL builder (parseRemote + buildFileUrl)

**Started**: 2026-05-09

**TDD log**:
- RED: `pnpm vitest run test/unit/web/features/_platform/git/repo-url.test.ts` failed with module-not-found (`./lib/repo-url` missing).
- GREEN: created `apps/web/src/features/_platform/git/lib/repo-url.ts` with `parseRemote` + `buildFileUrl` + types. Re-ran: 18/18 tests pass.
- Stub `git-cli.ts` (T003 placeholder with throw-not-implemented bodies + `RepoInfo` type definition) added so the public surface (`index.ts`) compiles.

**Files**:
- `apps/web/src/features/_platform/git/lib/repo-url.ts` — pure URL builder. Strips embedded credentials in `parseRemote`. Per-segment encoding in `buildFileUrl` preserves slashes.
- `apps/web/src/features/_platform/git/lib/git-cli.ts` — stub. T003 fills bodies.
- `test/unit/web/features/_platform/git/repo-url.test.ts` — 18 tests across `parseRemote` (9), `buildFileUrl GitHub` (5), `buildFileUrl ADO` (4). Includes credential-strip case (Plan 084 finding 12).

**Done When** evidence: All listed plan fixtures covered. `pnpm vitest run test/unit/web/features/_platform/git/repo-url.test.ts` → 18 passed.

**Discovery**: Public surface coupling — when the test imports through `@/features/_platform/git`, the `index.ts` re-exports require BOTH `lib/repo-url.ts` and `lib/git-cli.ts` to compile. Stub for `git-cli.ts` added with `RepoInfo` type + throw-not-implemented bodies. T003 will fill the bodies.

### T003 — Implement git-cli.ts (4 wrappers + RepoInfo type)

**Started**: 2026-05-09

**Files**:
- `apps/web/src/features/_platform/git/lib/git-cli.ts` — production implementation. `getCurrentBranch` + `getDefaultBaseBranch` lifted verbatim from `apps/web/src/features/071-pr-view/lib/git-branch-service.ts` (contracts preserved: `'HEAD'` for detached, `'main'` fallback). `getRemoteUrl` reads `git config --get remote.origin.url` (returns `null` on failure). `getCurrentCommitSha` returns full 40-char SHA (validated by regex), `null` on failure / zero-commit worktree (Plan 084 finding 14).
- `test/unit/web/features/_platform/git/git-cli.test.ts` — 11 tests across 4 functions, real git in tmpdir per project convention (matches PR-view tests).

**Done When** evidence: `pnpm vitest run test/unit/web/features/_platform/git/` → 29 passed (18 repo-url + 11 git-cli).

**Discovery — gotcha (mock failure)**: Initial attempt mocked `node:child_process.execFile` via `vi.mock`. Production code uses `promisify(execFile)`, which on real Node uses the `[util.promisify.custom]` symbol on `execFile` to return `{stdout, stderr}`. My replacement function lacked that symbol → `promisify` fell back to standard "first cb arg" wrapping → returned just `stdout` as string, broke `const { stdout } = await execFileAsync(...)` destructuring. Added the symbol to the mock — still didn't trigger (4 success-path tests stayed in the catch fallback even with correct shape). Switched to **real `git` in tmpdir** matching the existing PR-view test pattern. Equally lightweight in spirit, more robust, no mock fragility.

**Test merge (T004 prep)**: PR-view's `getCurrentBranch` and `getDefaultBaseBranch` test cases now have equivalent coverage in `git-cli.test.ts`:
- `getCurrentBranch`: branch-name happy path, detached HEAD, non-repo failure
- `getDefaultBaseBranch`: 'main' fallback, actual ref when origin/HEAD set
T004 will drop the duplicates from the PR-view file (and `parseNameStatus` / `getMergeBase` / `getChangedFilesBranch` tests stay there since those functions stay in pr-view).

### T004 — Refactor PR view to consume lifted helpers

**Started**: 2026-05-09

**Files**:
- `apps/web/src/features/071-pr-view/lib/git-branch-service.ts` — removed `getCurrentBranch` and `getDefaultBaseBranch`. Header docstring updated to point to `_platform/git`. Retains `getMergeBase`, `getChangedFilesBranch`, `parseNameStatus`, `NAME_STATUS_MAP`.
- `apps/web/src/features/071-pr-view/lib/diff-aggregator.ts` — split imports: `getCurrentBranch` + `getDefaultBaseBranch` now from `@/features/_platform/git`; `getChangedFilesBranch` + `getMergeBase` still local.
- `test/unit/web/features/071-pr-view/git-branch-service.test.ts` — removed `getCurrentBranch` and `getDefaultBaseBranch` test blocks (covered in `_platform/git/git-cli.test.ts`); kept `getMergeBase`, `getChangedFilesBranch`, `parseNameStatus`. Added a comment pointing to the new test location.

**Verification**:
- `pnpm vitest run test/unit/web/features/071-pr-view/` → 76 passed (9 files), down from previous count by exactly the 4 removed test cases.
- `pnpm exec tsc --noEmit` (apps/web) → no errors on touched files.
- `grep -rn` for old import path returned only this domain's own files (no orphan consumers).

### T005 — /api/workspaces/[slug]/repo-info route

**Started**: 2026-05-09

**Files**:
- `apps/web/app/api/workspaces/[slug]/repo-info/route.ts` — new GET handler. Order of checks: (a) `auth()` 401, (b) bootstrap-cookie verify (independent), (c) `await params`, (d) defensive worktree (`startsWith('/')` + `!includes('..')`), (e) closed-set vs `workspaceService.getInfo(slug).worktrees[].path`, (f) `Promise.all` of 4 git wrappers, (g) `parseRemote` → `RepoInfo` payload. **Response shape never carries raw `remoteUrl`** (finding 12).
- `test/unit/web/api/workspaces/repo-info.test.ts` — 8 tests (the plan's 7 + the explicit `getInfo === null` 400 case I split out for clarity). `vi.hoisted` used to declare mocks before `vi.mock` factories evaluate.

**Done When** evidence:
- 8/8 tests pass: `pnpm vitest run test/unit/web/api/workspaces/repo-info.test.ts`.
- Route compiles clean (project-wide `tsc --noEmit` has pre-existing errors elsewhere — none in this route).
- Boilerplate present: `export const dynamic = 'force-dynamic'`; `params: Promise<{slug}>`; `await params`.
- Auth: `auth()` AND `verifyCookieValue(cookieValue, code, key)` both independently checked.
- Validation: defensive (start-with-slash + no-`..`) AND closed-set match against workspace's known worktrees.
- Response shape: 8 fields per plan T005 — no `remoteUrl`.

**Discovery — gotcha (vi.hoisted)**: First attempt declared `const authMock = vi.fn()` at top level then referenced it from `vi.mock` factory. `vi.mock` is hoisted above all imports/declarations, so the factory ran when `authMock` was still in TDZ. Wrapped all mock declarations in `vi.hoisted(() => ({ ... }))` so they're available at hoist-time. This is the documented vitest pattern for mock factories that need test-controlled mocks.

### T006 — Extend useClipboard hook

**Started**: 2026-05-09

**Files**:
- `apps/web/src/features/041-file-browser/hooks/use-clipboard.ts` — `UseClipboardOptions` gains `repoInfo?: RepoInfo | null`. Two new handlers: `handleCopyRepoUrlCurrentRef`, `handleCopyRepoUrlDefaultBranch`. Both reuse existing `copyToClipboard` (no new fallback code per finding 08). Universal no-op guard: `!repoInfo || repoInfo.host === 'unknown'`. Detached-HEAD logic in current-ref handler: when `isDetached && currentSha !== null` → `{ refType: 'commit', ref: currentSha }`; when `isDetached && currentSha === null` → silent no-op (finding 14).
- `test/unit/web/features/041-file-browser/use-clipboard-repo-url.test.tsx` — 7 tests via `renderHook`. Mocks `sonner.toast` + `navigator.clipboard.writeText`. Real `buildFileUrl` (no mock) so URLs asserted are production output.

**Done When** evidence: 7/7 tests pass. Hook compiles. Two new handlers exposed in return object.

**Note**: Visibility/render gating happens in T007 components — not in the hook. Hook just no-ops; component decides whether to render the menu item.
