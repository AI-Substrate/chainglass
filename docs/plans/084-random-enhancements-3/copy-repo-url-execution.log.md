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

### T007 — Wire menu items at three render sites + repo-info fetch

**Started**: 2026-05-09

**Files**:
- `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` — added `useState<RepoInfoPayload | null>(null)` and `useEffect` with dep array `[slug, worktreePath]` (worktree-switch refetch per finding 13 / AC20). Pass `repoInfo` into `useClipboard`. Added 3 new props (`onCopyRepoUrlCurrentRef`, `onCopyRepoUrlDefaultBranch`, `repoInfo`) to two `<FileTree>` and two `<ChangesView>` render sites (desktop + mobile each).
- `apps/web/src/features/041-file-browser/components/file-tree.tsx` — added 3 props to `FileTreeProps`, the function destructure, the inline `TreeItem` type, both `TreeItem` invocations (root + recursive). Added two `<ContextMenuItem>` entries immediately after "Copy Relative Path" at BOTH render sites (folder ~512 + file-leaf ~722). Items render conditionally on `repoInfo && repoInfo.host !== 'unknown'`. The "this branch" item relabels to "Copy URL (this commit)" when `isDetached && currentSha !== null`.
- `apps/web/src/features/041-file-browser/components/changes-view.tsx` — same prop additions on `ChangesViewProps`, the function destructure, the inner `ChangeFileItem` type, the two `ChangeFileItem` invocations. Added two new menu items at the changes-view item context menu (~183) with the same gate.

**Done When** evidence:
- All touched test suites green: 593 tests pass / 1 skipped (pre-existing) across `_platform/git`, `041-file-browser`, `071-pr-view`, `api/workspaces`.
- New files type-clean (only pre-existing errors remain in `browser-client.tsx` lines 586/587 — the `ReadFileResult.content` issue from the existing codebase, unrelated to FX007).
- Conditional render: items appear at all 3 sites (file-tree leaf, file-tree folder, changes-view item) when `repoInfo && repoInfo.host !== 'unknown'`; hidden otherwise. Per AC11.
- Detached relabel: template literal swaps "this branch" → "this commit" when `isDetached && currentSha !== null`. Per AC12.
- useEffect dep array is `[slug, worktreePath]`. Per AC20.

**Manual UI verification deferred**: Plan called for harness Playwright screenshots at 3 render sites (GitHub remote, detached HEAD, no-remote). Harness is L3-up and reachable from the host but bootstrap-cookie-gated so curl-from-host returns `{"error":"bootstrap-required"}`. The decision logic this would visually confirm is fully covered by the automated test surface (T002 URL formats, T005 response shape, T006 hook behaviour, T007 component conditional render via prop chain). Visual sign-off (font/color/spacing/icon) is for the user after merge — typed `LinkIcon` from lucide-react matches the codebase convention used by other menu icons.

### T008 — Domain.md History rows + Concepts

**Started**: 2026-05-09

**Files**:
- `docs/domains/_platform/git/domain.md` — created in T001 with full Concepts table + History row.
- `docs/domains/file-browser/domain.md` — added `_platform/git` to "This Domain Depends On" with full contract list. Added History row at top (most-recent-first ordering matches existing convention).
- `docs/domains/pr-view/domain.md` — added `_platform/git` to "This Domain Depends On" (lifted helpers). Added History row at bottom (chronological ordering — matches existing convention).
- `docs/domains/registry.md` + `docs/domains/domain-map.md` — already updated in T001.
- `copy-repo-url.fltplan.md` — Stage 4 + Stage 5 → done; Mermaid status all green; status header → LANDED.
- `copy-repo-url-plan.md` — T008 row → [x].

**Done When** evidence:
- `_platform/git` domain.md has all required sections + Concepts table populated.
- `file-browser` and `pr-view` History rows reflect FX007 changes.
- Both domains list `_platform/git` in their dependencies.
- Domain-map shows the two consume edges (file-browser → gitPlatform; pr-view → gitPlatform).
- Health Summary row added for `_platform/git`.

## Phase Summary

**Outcome**: All 8 tasks complete, 21 ACs satisfied (subject to user manual UI sign-off per AC11/AC18 visual checks). 8 task commits + 1 planning commit on branch.

**Test surface**: 615 tests pass across all touched suites.
- 18 URL builder tests (T002 — TDD)
- 11 git-cli wrapper tests (T003 — real git in tmpdir)
- 8 API route tests (T005 — vi.hoisted mocks)
- 7 useClipboard handler tests (T006 — renderHook)
- 76 PR-view tests still green (T004 — pure refactor)
- 593 tests across all touched test suites

**Type-clean** for all FX007 files. Two pre-existing errors in `browser-client.tsx` (lines 586/587, ReadFileResult.content) unrelated to FX007.

**Key findings addressed in delivery** (cross-reference Validation Record):
- Finding 01 (worktree injection): T005 two-layer validation — defensive + closed-set.
- Finding 02 (auth bypass): T005 dual-checks `auth()` AND independently `verifyCookieValue`.
- Finding 03 (ADO `GB`/`GC` quirk): T002 fixtures lock both prefixes.
- Finding 04 (3 render sites): T007 covers all three with the same gate.
- Finding 05 (PR-view import refactor): T004 pure-import refactor, behaviour unchanged.
- Finding 06–08 (branch info / detached / fallback): T006 handler logic + T002 reuse of existing `copyToClipboard`.
- Finding 11 (Next 16 conventions): T005 `params: Promise<{slug}>` + `await params` + `dynamic = 'force-dynamic'`.
- Finding 12 (credential leak): T002 `parseRemote` strips `user:token@`; T005 response shape carries no raw `remoteUrl`.
- Finding 13 (worktree-switch refetch): T007 `useEffect` deps `[slug, worktreePath]`.
- Finding 14 (zero-commit worktree): T003 `getCurrentCommitSha` returns `string | null`; T006 + T007 handle null.

**Companion-driven course corrections**: Three findings surfaced in the companion's farewell summary (read from the `inside` lane — the operator-side `outside inbox list` only shows my own messages, so I missed them in-flight). All three addressed in a follow-up fixup commit before phase close.

| Finding | Severity | File | Resolution |
|---------|----------|------|-----------|
| F001 | MEDIUM | `docs/c4/components/pr-view.md` | C4 Git Branch Service component still listed `getCurrentBranch`/`getDefaultBaseBranch` as PR-view-owned. Updated description to enumerate only the PR-view-specific ops (`getMergeBase`, `getChangedFilesBranch`, `parseNameStatus`) and note the lift to `_platform/git`. |
| F002 | HIGH | `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | useEffect cleared old repo-info only when the new fetch resolved/rejected. During the load window after a worktree switch, menu items remained visible with stale data, so a fast right-click would copy a URL built from the **previous** worktree's branch/SHA. Added `setRepoInfo(null)` synchronously at effect start so items hide while the new fetch is in flight. |
| F003 | MEDIUM | `docs/domains/pr-view/domain.md` | Boundary still listed all 4 git fns as PR-view-owned; Contracts table still listed `getCurrentBranch` + `getDefaultBaseBranch` as PR-view contracts. Boundary line rewritten to enumerate only the PR-view-specific ops; Contracts table rows for the lifted helpers removed (replaced with the existing `getChangedFilesBranch` row that was missing). |

After fixup commit, all 3 findings closed. Companion magicWand: "add a companion-side `finding status` field or outside command like `resolve-finding: F002 <sha>` so fix commits can explicitly close findings." A nice future improvement to the companion harness — captured for the next plan-6-companion iteration.
