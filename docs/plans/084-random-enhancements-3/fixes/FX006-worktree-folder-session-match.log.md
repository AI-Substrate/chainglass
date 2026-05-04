# Fix FX006: Worktree-folder session match — Execution Log

## Companion

- Slug: `code-review-companion`
- Run ID: `2026-05-04T17-38-34-103Z-9115`
- Verdict at boot: active
- Briefing sent: `01KQRYTJ74SE9VMRQ6WMG8HJ7H` (one-shot, type=briefing)
- Permission-bug workaround: companion was instructed to write reviews into chat output (write: deny on report.json — minih issue #25 not yet fixed).

## Discovery — `isCurrentWorktree` is part of the public type

Pre-implementation check revealed that `isCurrentWorktree` is part of `TerminalSession` in `apps/web/src/features/064-terminal/types.ts:19` AND is consumed by `apps/web/src/features/064-terminal/components/terminal-session-list.tsx:62` to render a "current" badge. The dossier had said "verify by checking types.ts — flag if it is" — verified, it is.

**Adapted scope**: The dossier's spirit ("replace the misnamed flag with two well-named ones") is preserved. Implementation:
- Replace `isCurrentWorktree: boolean` with `isWorktreeFolderMatch: boolean` AND `isBranchMatch: boolean` in `types.ts`.
- Update `terminal-session-list.tsx:62` to render the badge when `(session.isWorktreeFolderMatch || session.isBranchMatch)` — preserves user-visible behavior across both pre-FX006-3 wiring (branch flag is the active path) and post-FX006-3 wiring (worktree-folder flag is the active path).
- Update `terminal-session-list.test.tsx` fixtures from `isCurrentWorktree: bool` to the two new fields.
- Hook auto-pick uses `enriched.find(s => s.isWorktreeFolderMatch) ?? enriched.find(s => s.isBranchMatch) ?? enriched[0]`.

This adds ~4 small touch points beyond the dossier's listed files but stays in-domain and is the minimal change that keeps the badge semantic correct.

## FX006-1: Extract `sessionNameFromWorktreePath` helper

**Files**:
- `apps/web/src/features/064-terminal/lib/session-name-from-worktree-path.ts` — new (pure helper)
- `test/unit/web/features/064-terminal/session-name-from-worktree-path.test.ts` — new (6 tests)

**Tests**: 6/6 pass.
1. `helper.higgs-path` — `/Users/jordanknight/github/higgs-jordo` → `'higgs-jordo'`.
2. `helper.trailing-slash` — `/path/foo/` → `''` (split.pop quirk; documented in JSDoc).
3. `helper.empty` — `''`, `'/'`, whitespace, null, undefined → `''`.
4. `helper.sanitize-dots` — `'/path/with.dots'` → `'with-dots'`; spaces and colons same treatment.
5. `helper.single-segment` — `'just-a-name'` (no slashes) → `'just-a-name'`.
6. `helper.absolute-vs-relative` — leading slash makes no difference to basename.

**Commit**: `11b204f1`

**Companion ping**: sent post-commit (review-request type=task).

## FX006-2: Hook auto-pick by worktree-folder + isCurrentWorktree rename

**Files**:
- `apps/web/src/features/064-terminal/types.ts` — replace `isCurrentWorktree: boolean` with `isWorktreeFolderMatch: boolean` + `isBranchMatch: boolean`.
- `apps/web/src/features/064-terminal/hooks/use-terminal-sessions.ts` — accept optional `worktreePath`; compute both flags during enrichment; auto-pick chain `folder → branch → enriched[0]`; updated JSDoc with enumerated resolution order.
- `apps/web/src/features/064-terminal/components/terminal-session-list.tsx:62` — badge renders when `(isWorktreeFolderMatch || isBranchMatch)` so user-visible "current" indication is preserved across FX006-3 wiring boundary.
- `test/unit/web/features/064-terminal/terminal-session-list.test.tsx` — fixture migration to two flags.
- `test/unit/web/features/064-terminal/use-terminal-sessions.test.tsx` — 5 new tests (`hook.worktree-beats-branch`, `hook.branch-fallback`, `hook.no-worktree`, `hook.user-higgs-bug`, `hook.worktree-and-branch-both-match`); existing 7 untouched.

**Tests**: 12/12 hook tests pass. Full terminal suite: 184/184 pass. Typecheck: clean.

**Deviation from dossier**: dossier proposed "verify by checking types.ts — flag if it is" then suggested removal "entirely". Verification revealed `isCurrentWorktree` is in the public type AND consumed by the badge component. Adapted: kept the dossier's spirit (replace misnamed flag with two well-named ones) but expanded scope to update the badge component + its test fixture. Documented in execution log so the companion sees the wider blast radius.

**Commit**: `02d227f5`

**Companion ping**: sent post-commit.

## FX006-3: Wire `worktreePath` into both call sites

**Files**:
- `apps/web/src/features/064-terminal/components/terminal-page-client.tsx:52-55` — desktop now passes `worktreePath`.
- `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx:461-470` — mobile Terminal tab now passes `worktreePath`. Comment notes the FX006 motivation inline.

**Tests**: full terminal suite 184/184 pass; typecheck clean. The `hook.user-higgs-bug` test from FX006-2 already validated the call-shape contract; this is the second half of the wiring (the call sites supply the value).

**Pre-existing sanitize-asymmetry**: mobile sanitizes `currentBranch` via `sanitizeSessionName(worktreeBranch ?? '')`, desktop passes raw `worktreeBranch`. Documented in dossier Notes column for FX006-3 + Forward-Compat row C2; out-of-scope for FX006 because the folder-match path doesn't depend on `currentBranch` shape. Future fix candidate (call it FX007 if it lands).

**Commit**: `03f3123c`

**Companion ping**: sent post-commit.

## FX006-4: Refactor useTerminalOverlay to use shared helper

**Files**:
- `apps/web/src/features/064-terminal/hooks/use-terminal-overlay.tsx` — replaced inline `sanitizeSessionName(worktree.split('/').pop() ?? '') || null` with `sessionNameFromWorktreePath(worktree) || null`. Import swapped from `sanitizeSessionName` (now unused in this file) to `sessionNameFromWorktreePath`. Inline comment documents why the `|| null` lives at the call site.
- `test/unit/web/features/064-terminal/use-terminal-overlay.test.tsx` — new (2 tests):
  - `overlay.toggle-from-worktree`: `?worktree=/Users/.../higgs-jordo` → opens with `sessionName='higgs-jordo'`, `cwd=/Users/.../higgs-jordo`.
  - `overlay.toggle-from-worktree-trailing-slash`: trailing-slash basename → empty → `|| null` → toggleTerminal early-returns; the byte-identity guard.

**Tests**: 186/186 terminal-domain tests pass (was 173 pre-FX006 = +13: 6 helper, 5 hook, 2 overlay). Typecheck clean.

**Commit**: `c2096adb`

**Companion ping**: sent post-commit.

## Summary

| Stage | Commit | Files (net) | Tests added | Verdict |
|---|---|---|---|---|
| FX006-1: Helper | 11b204f1 | +2 (1 src, 1 test) | 6 | ✅ |
| FX006-2: Hook + flag rename | 02d227f5 | 5 modified (incl. dossier-discovered scope) | 5 | ✅ |
| FX006-3: Wire call sites | 03f3123c | 2 modified (1-line each) | 0 (covered by hook.user-higgs-bug from FX006-2) | ✅ |
| FX006-4: Overlay refactor | c2096adb | 2 (1 src modified, 1 test new) | 2 | ✅ |

**Aggregate**: 13 new tests, 186/186 terminal-domain tests passing, typecheck clean across 4 commits.

**Acceptance criteria** (from dossier):
- ✅ Mobile cold-load on higgs-jordo → `higgs-jordo` session (verified via `hook.user-higgs-bug` automated gate).
- ✅ Desktop terminal page on higgs-jordo → `higgs-jordo` session (same gate; both call sites pass `worktreePath`).
- ✅ Desktop backtick overlay → `higgs-jordo` (overlay refactor preserves byte-identity; `overlay.toggle-from-worktree` test).
- ✅ Branch=worktree-folder workspaces (e.g. `084-random-enhancements-3`): no behavior change (folder-match resolves to same session as branch-match would).
- ✅ Branch-only-named sessions: branch-match fallback kicks in (verified by `hook.branch-fallback`).
- ✅ Phantom-URL `?session=osk-data` is preserved per FX005-2 (URL = canonical override; FX006 doesn't auto-correct).
- ✅ All 7 FX005-2 tests pass unchanged.
- ✅ All 6 FX005-1 sort tests pass unchanged.
- ✅ ≥185 terminal-domain tests passing — actual: 186.

