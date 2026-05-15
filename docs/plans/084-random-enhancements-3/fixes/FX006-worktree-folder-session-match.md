# Fix FX006: Auto-pick the tmux session by worktree folder name

**Created**: 2026-05-04
**Status**: Complete
**Plan**: Standalone (regression originates in plan 064-tmux phase 3 — `useTerminalSessions` shipped with branch-name match while `useTerminalOverlay` (same domain, same plan) shipped with worktree-folder match. Surfaced by FX005's companion review and confirmed against `/Users/jordanknight/github/higgs-jordo` during user smoke-test on 2026-05-04.)
**Source**: User report ("loading higgs workspace shows the wrong tmux window") + companion-review F001 finding on FX005 (`code-review-companion` run `2026-05-04T16-16-02-885Z-9355`, msg `01KQRT7B0NJNEYY78Q5Z6N2BXQ`)
**Domain(s)**: `terminal` (modify — internal hook + new pure helper; no public-contract change)

---

## Problem

`useTerminalSessions` auto-picks the wrong tmux session for any worktree where the branch name doesn't match the session name. The hook enriches each session with a boolean `isCurrentWorktree: s.name === currentBranch` flag at `use-terminal-sessions.ts:105` — note the property is *misnamed*, it's actually a branch-match flag — and the auto-pick at `use-terminal-sessions.ts:135` does `enriched.find((s) => s.isCurrentWorktree)`, then falls through to `enriched[0]`. In this codebase, tmux sessions are named after the **worktree folder**, not the branch. Result: for `/Users/jordanknight/github/higgs-jordo` (branch `main`), the boolean flag is false for every session (no session is named `main`), the auto-pick finds nothing, and falls through to `enriched[0]` — which, after FX005-1's stable sort, deterministically lands on the oldest session by `created` timestamp (`osk-data` on the user's machine).

The fix is **already in the same domain, in a sibling hook**. `useTerminalOverlay` at `apps/web/src/features/064-terminal/hooks/use-terminal-overlay.tsx:70–72` derives the session name from the URL's `?worktree=` param via `sanitizeSessionName(worktree.split('/').pop() ?? '') || null` — i.e. the worktree folder basename. That's why pressing backtick on desktop opens the *right* terminal session for higgs-jordo: the overlay path uses the correct heuristic, and the in-tab `useTerminalSessions` path uses a different (wrong) one.

### Companion attribution (be precise)

The companion's F001 finding (`code-review-companion` run `2026-05-04T16-16-02-885Z-9355`, msg `01KQRT7B0NJNEYY78Q5Z6N2BXQ`) was specifically *"the mobile browser surface still only destructures `termSessions`/`termSelectedSession` and never wires `setSelectedSession` to a picker"* — i.e. F001 is about the **missing mobile picker UI**, not the auto-pick logic. The companion did not root-cause the auto-pick bug. The auto-pick bug was discovered by the user during a manual smoke-test against `/Users/jordanknight/github/higgs-jordo` while validating FX005, when they noticed that backtick (overlay) lands on the right session but the mobile Terminal tab does not. FX006 addresses the auto-pick bug; the missing-mobile-picker concern (F001) remains a separate, deferred concern (see Non-Goals).

Why the user only noticed it now:

- **Desktop terminal page** (`/workspaces/<slug>/terminal`) and **mobile Terminal tab** (`/workspaces/<slug>/browser?mobileView=2`) both use `useTerminalSessions` → both have always picked the wrong session for non-branch-named workspaces. On desktop, the sidebar's `<TerminalSessionList>` lets the user click the right session in seconds and FX005-2's URL persistence remembers it; the wrong-pick is invisible after a single corrective tap.
- **Backtick overlay** uses `useTerminalOverlay` → has always picked the right session.
- **Mobile Terminal tab** has neither a session list nor a backtick keybinding → no escape hatch. The wrong-pick is the entire experience.

This is a true anti-reinvention bug: two functions in the same domain doing semantically the same thing two different ways, with one being right and the other being wrong, and nothing flagged the duplication when FX005 shipped (the companion's anti-reinvention check did look for sort utilities, but missed the session-derivation duplication because the right logic was buried inline at line 67 of an unrelated hook).

## Proposed Fix

Extract the session-name-from-worktree-path derivation into a shared pure helper, use it in **both** `useTerminalSessions` and `useTerminalOverlay`, and add a new worktree-folder-match candidate to the hook's auto-pick logic ahead of the existing branch-name match. The fix is **additive** at the hook's surface (one new optional argument; existing call shapes still work) and **structurally simplifying** at the domain level (one helper, two callers, no inline duplication).

### Resolution order after the fix (`useTerminalSessions`)

1. **URL `?session=<name>`** — if the stored name still matches a live session, keep it (FX005-2; unchanged).
2. **Worktree-folder match** — `enriched.find(s => s.name === sessionNameFromWorktreePath(worktreePath))`. **NEW.** Matches the existing convention used by every chainglass-managed tmux session in this codebase.
3. **Branch-name match** — `enriched.find(s => s.name === currentBranch)`. Existing behavior; demoted to a fallback. Useful when a user manually creates a session named after their branch.
4. **`enriched[0]`** (stable-sorted by FX005-1) — last resort.

### Why an additive ordering, not a replacement

Branch-name match is kept as a fallback because:

- It's the existing behavior and removing it without warning could surprise users who have manually-named sessions.
- It's strictly cheaper to reach (string equality), so it costs effectively nothing as a 2nd-place candidate.
- If both worktree-folder and branch matches exist for the same worktree (unusual but possible), worktree-folder wins because it aligns with the auto-creation convention used by the WS sidecar (`tmux new-session -A -s <name>` is invoked with the worktree-folder name).

## Domain Impact

| Domain | Relationship | What Changes |
|--------|-------------|-------------|
| `terminal` | modify (internal) | New pure helper `sessionNameFromWorktreePath(worktreePath)` at `apps/web/src/features/064-terminal/lib/session-name-from-worktree-path.ts`. Hook signature gets optional `worktreePath` argument. Overlay's inline expression replaced with a call to the new helper. No public domain contract changed (helper is internal lib; hook return shape preserved). |

## Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [x] | FX006-1 | Extract a pure helper `sessionNameFromWorktreePath(worktreePath: string): string` that takes a workspace path (e.g. `/Users/jordanknight/github/higgs-jordo` or `/path/with/trailing/slash/`), returns `sanitizeSessionName(worktreePath.split('/').pop() ?? '')`, and returns the empty string for falsy input or paths that resolve to an empty basename. The helper does NOT include the trailing `\|\| null` from the overlay's inline expression — that conversion stays at the call site to keep the helper's contract simple (`string → string`). FX006-4 preserves the `\|\| null` semantic in the overlay refactor (see that task's spec). | `terminal` | `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/features/064-terminal/lib/session-name-from-worktree-path.ts` (new)<br/>`/Users/jordanknight/substrate/084-random-enhancements-3/test/unit/web/features/064-terminal/session-name-from-worktree-path.test.ts` (new) | (a) Helper exists, exported, JSDoc'd. (b) `helper.higgs-path`: returns `'higgs-jordo'` for `/Users/jordanknight/github/higgs-jordo`. (c) `helper.trailing-slash`: returns `''` for `/Users/jordanknight/github/higgs-jordo/` (the `split('/').pop()` of a trailing-slash path is the empty string — *this differs from a naive expectation of `'higgs-jordo'`; the overlay's existing logic exhibits the same behavior, so callers must handle the empty-string return*). (d) `helper.empty`: returns `''` for empty string, single-slash, or whitespace-only input. (e) `helper.sanitize-dots`: returns `'with-dots'` for `/path/with.dots` (no trailing slash) — sanitization consistent with `sanitizeSessionName`'s regex. (f) `helper.single-segment`: returns `'just-a-name'` for `'just-a-name'` (no slashes). (g) `helper.absolute-vs-relative`: returns `'higgs-jordo'` for both `/abs/higgs-jordo` and `relative/higgs-jordo`. ≥6 distinct test cases total. | Pure function. No React, no fetch, no DI. Lands first to make the helper available to FX006-3 and FX006-4 without test-coupling. **Note**: the helper *does not* preserve the overlay's `\|\| null` post-conversion — that's intentional. The helper returns plain string; the overlay's call site adds `\|\| null` to preserve byte-identity (see FX006-4). |
| [x] | FX006-2 | Update `useTerminalSessions` to accept an optional `worktreePath?: string` argument (object destructure: `useTerminalSessions({ currentBranch, worktreePath? })`) and rewire the auto-pick at `use-terminal-sessions.ts:135` to match worktree-folder FIRST, branch-name SECOND, `enriched[0]` LAST. **Specific structural change**: the misnamed `isCurrentWorktree` boolean enrichment at line 105 is *replaced* with two well-named flags — `isWorktreeFolderMatch: s.name === sessionNameFromWorktreePath(worktreePath ?? '')` (skipped when helper returns empty) and `isBranchMatch: s.name === currentBranch` — and the auto-pick becomes `enriched.find(s => s.isWorktreeFolderMatch) ?? enriched.find(s => s.isBranchMatch) ?? enriched[0]`. The old `isCurrentWorktree` field is removed entirely (it's not part of the public TerminalSession contract — verify by checking `types.ts`). Resolution order documented in JSDoc above the hook (template below) and inline-commented at the auto-pick site. Hook return shape preserved. | `terminal` | `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/features/064-terminal/hooks/use-terminal-sessions.ts`<br/>`/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/features/064-terminal/types.ts` (verify `TerminalSession.isCurrentWorktree` removal/rename — flag if it's part of the type)<br/>`/Users/jordanknight/substrate/084-random-enhancements-3/test/unit/web/features/064-terminal/use-terminal-sessions.test.tsx` | (a) Hook accepts `worktreePath` without breaking existing call shape (existing 7 FX005-2 tests still pass with no changes — the optional arg defaults to `undefined`). (b) `hook.worktree-beats-branch`: worktreePath=`/Users/jordanknight/github/higgs-jordo`, currentBranch=`higgs-jordo`, sessions list contains both `higgs-jordo` and an `older-session` (lower `created`) — hook picks `higgs-jordo` via worktree-folder match (not via branch match — same outcome but proves the resolution order). (c) `hook.branch-fallback`: worktreePath=`/path/no-match`, currentBranch=`main`, sessions list contains `main` but no `no-match` — hook picks `main` (worktree-match returned no result, branch-match wins). (d) `hook.no-worktree`: no worktreePath argument passed, currentBranch=`main`, sessions list contains `main` — hook picks `main` (call-shape compat — worktree-match candidate is skipped because helper returned `''`). (e) `hook.user-higgs-bug`: worktreePath=`/Users/jordanknight/github/higgs-jordo`, currentBranch=`main`, sessions list `[osk-data, 084-random-enhancements-3, higgs-jordo]` (FX005-1 stable-sort order — fixture matches the user's actual environment) — hook picks `higgs-jordo`, NOT `osk-data`, NOT `main`-via-branch (because `main` doesn't exist in the fixture). (f) `hook.worktree-and-branch-both-match`: rare case — worktreePath=`/path/foo`, currentBranch=`foo`, session `foo` exists. Both candidates would match the same session; either heuristic resolves to it; verify no double-write to URL. | Core of the fix. The five new test cases (b-f) plus the 7 existing FX005-2 cases give 12 total covering the resolution order. The five tests use explicit kebab-case names matching FX005-2's enumeration style. |
| [x] | FX006-3 | Wire `worktreePath` into both `useTerminalSessions` call sites. Both already have the value in scope (passed as a prop on the page). Note: the two call sites pass `currentBranch` differently — mobile sanitizes (`sanitizeSessionName(worktreeBranch ?? '')`), desktop passes raw (`worktreeBranch`). This asymmetry is **pre-existing** and out of scope for FX006; document it in the execution log so a follow-up fix can address it. After FX006, both call sites land on the right session via worktree-folder match (which uses the helper consistently), so the asymmetry only affects the branch-match fallback path which is no longer the primary resolution. | `terminal` | `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` (mobile Terminal tab call site, ~line 465)<br/>`/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/features/064-terminal/components/terminal-page-client.tsx` (desktop call site, ~line 52) | (a) `browser-client.tsx` call site reads `useTerminalSessions({ currentBranch: sanitizeSessionName(worktreeBranch ?? ''), worktreePath })`. (b) `terminal-page-client.tsx` call site reads `useTerminalSessions({ currentBranch: worktreeBranch, worktreePath })` (intentionally preserving the existing pre-FX006 sanitize-asymmetry — see Notes). (c) Both pages still typecheck. (d) **Automated gate (no manual-only steps for plan-6-v2)**: a new renderHook test in `use-terminal-sessions.test.tsx` named `hook.user-higgs-bug` (already specified in FX006-2(e)) is the canonical regression assertion — it fixtures the exact higgs-jordo bug and runs in jsdom; plan-6-v2 verifies completion by running `pnpm vitest run test/unit/web/features/064-terminal/use-terminal-sessions.test.tsx` and confirming all 12 tests pass. (e) **Optional Playwright assertion** (only if harness is healthy): navigate to `/workspaces/higgs-jordo/browser?mobileView=2&worktree=/Users/jordanknight/github/higgs-jordo` cold (no `?session=`), wait for `[data-testid="terminal-view"]` (or equivalent) to mount, assert the `?session=` param now reads `higgs-jordo`. If the harness is unhealthy, skip — the renderHook test in (d) is the authoritative gate. | Mechanical change. The hook's optional argument means this can land independently if needed, but should ship together with FX006-2 to actually deliver the user-visible fix. |
| [x] | FX006-4 | Refactor `useTerminalOverlay` to call the shared helper instead of inlining the same expression. **Critical for byte-identity**: the existing inline at `use-terminal-overlay.tsx:71-72` is `sanitizeSessionName(worktree.split('/').pop() ?? '') \|\| null` — note the trailing `\|\| null`. The helper returns plain `string` (per FX006-1), so the call-site replacement must preserve the `\|\| null` to keep the same null-vs-empty-string semantic the overlay's downstream `?? prev.sessionName` and `if (!resolvedSession)` checks were written against. New code: `sessionNameFromWorktreePath(worktree) \|\| null`. | `terminal` | `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/features/064-terminal/hooks/use-terminal-overlay.tsx` (lines 71-72 specifically; the `if (worktree)` block is lines 69-73) | (a) The inline `sanitizeSessionName(worktree.split('/').pop() ?? '') \|\| null` expression at line 72 is replaced with `sessionNameFromWorktreePath(worktree) \|\| null`. (b) `import { sanitizeSessionName }` is removed from this file if it's no longer used elsewhere; verified via grep across the file. (c) `import { sessionNameFromWorktreePath } from '../lib/session-name-from-worktree-path'` is added. (d) **There are no existing overlay unit tests** (verified by glob `test/unit/web/features/064-terminal/*overlay*.test.*` — empty); a new lightweight regression test is added at `test/unit/web/features/064-terminal/use-terminal-overlay.test.tsx` covering the toggle path's worktree-derivation: with `?worktree=/path/higgs-jordo` in the URL and `toggleTerminal()` called with no args, the resolved session name is `higgs-jordo`. (e) Manual smoke-test: pressing backtick on desktop while on `/workspaces/higgs-jordo/browser` still opens the `higgs-jordo` session — same as today. | Anti-reinvention closure + byte-identity preservation. The `\|\| null` is the subtle bit — without it, a trailing-slash worktree path would return `''` from the helper instead of `null`, and `''` is a falsy-but-not-nullish value that flows differently through `??` operators downstream. Low risk once the `\|\| null` is preserved. |

## Workshops Consumed

None. The original component-hierarchy decision lives in `docs/plans/064-tmux/workshops/001-terminal-ui-main-and-popout.md`; the only relevant fact (sessions are named after the worktree folder via `tmux new-session -A -s <name>`) is observable in `apps/web/src/features/064-terminal/server/tmux-session-manager.ts:104`.

## Acceptance

- [ ] Mobile cold-load `/workspaces/higgs-jordo/browser?mobileView=2&worktree=/Users/jordanknight/github/higgs-jordo` lands on the `higgs-jordo` session (not `osk-data` or any other unrelated session). Verified by inspecting the URL-bar `?session=` param after the page settles, OR via the `hook.user-higgs-bug` renderHook test (the authoritative automated gate).
- [ ] Desktop terminal page `/workspaces/higgs-jordo/terminal` lands on the `higgs-jordo` session on first mount when no `?session=` is in the URL.
- [ ] Desktop backtick overlay continues to land on `higgs-jordo` (regression check on overlay path post-refactor; verified by the new `use-terminal-overlay.test.tsx` plus manual smoke-test).
- [ ] Workspaces where the branch name DOES match a session (e.g. `084-random-enhancements-3` worktree on the `084-random-enhancements-3` branch with a session of the same name): the hook still picks correctly — branch and worktree-folder happen to be equal here, so either heuristic resolves to the same session. No regression.
- [ ] Workspaces where ONLY the branch name matches (worktree folder not represented in sessions): branch-match fallback kicks in. Existing behavior preserved.
- [ ] **Phantom-URL persistence (post-FX005-2 behavior unchanged)**: load `/workspaces/higgs-jordo/browser?session=osk-data&worktree=/Users/jordanknight/github/higgs-jordo` cold. If `osk-data` still exists as a tmux session, FX005-2's URL persistence keeps it (hook does NOT auto-correct to `higgs-jordo`). This is by design — the URL is the user's canonical override. Manual mitigation: visit the desktop terminal sidebar and click the right session, OR strip `?session=` from the URL bar. The fix dossier explicitly accepts this as out of scope; FX006 only changes the auto-pick path, not the URL-validation path.
- [ ] All existing 7 FX005-2 hook tests still pass with no modifications.
- [ ] All existing 6 FX005-1 sort tests still pass with no modifications.
- [ ] All 173 terminal-domain tests still pass + the new ones from FX006-1 (≥6) + FX006-2 (5) + FX006-4 (1) = ≥185 terminal-domain tests passing.
- [ ] Helper test file enumerates the 6+ cases with explicit kebab-case names (`helper.higgs-path`, `helper.trailing-slash`, `helper.empty`, `helper.sanitize-dots`, `helper.single-segment`, `helper.absolute-vs-relative`).
- [ ] Hook test file enumerates the 5 new cases with explicit names (`hook.worktree-beats-branch`, `hook.branch-fallback`, `hook.no-worktree`, `hook.user-higgs-bug`, `hook.worktree-and-branch-both-match`).

## Deployment & Ops

Pure code change. No database migrations. No environment variables. No feature flags or staged rollout. No public API contract changes (hook return shape preserved; helper is internal lib). Safe to deploy in a single Next.js build.

## Risk

Low. Strictly additive at the hook surface (one new optional argument, default `undefined` preserves pre-FX006 behavior in callers that don't yet pass it). The new auto-pick candidate runs *before* the existing one, but only when `worktreePath` is provided AND the derived name matches a live session — both conditions need to be true to change the pick. Behavior in the no-worktreePath case is functionally identical to FX005's resolution.

**Behavior shift documentation (be explicit)**: when both a worktree-folder-named session AND a branch-named session exist, FX006 picks the worktree-folder one (previously: branch-named). For returning users, FX005-2's URL persistence masks this — their prior selection sticks. First-time visitors (no stored URL) in a workspace where both sessions exist will see the change. This is intentional and aligns the auto-pick with the convention used by `tmux new-session -A -s <name>` invocations elsewhere in the codebase.

**Pre-FX006 phantom URLs** (e.g. `?session=osk-data` from a prior wrong-pick on a non-higgs workspace, then bookmarked or shared): FX005-2's URL persistence keeps these as long as the named session still exists. FX006 does NOT auto-correct phantom URLs — the user's URL is the canonical override. Manual mitigation: open the desktop terminal sidebar, click the right session, the new selection sticks. This is acceptable collateral.

**Worst case if the helper has a subtle bug** (e.g. mishandles a path edge case): the worktree-folder match returns a session-name string that doesn't equal any live session → no match → falls through to branch-match → enriched[0]. Helper bugs degrade gracefully to pre-FX006 behavior, not to a worse-than-FX005 state. Self-healing fail-mode.

**Silent-degradation risk if FX006-3 is partial**: if one call site is wired with `worktreePath` and the other is forgotten, the unwired site silently falls back to the pre-FX006 branch-match path (no error, just wrong session for that surface). Mitigation: FX006-3's automated gate (`hook.user-higgs-bug` test) requires both call sites to pass the test, and the call-shape grep in FX006-3 (d) catches the omission.

### Rollback

The fix touches **6 files** (3 new, 3 modified):

- New: `apps/web/src/features/064-terminal/lib/session-name-from-worktree-path.ts`
- New: `test/unit/web/features/064-terminal/session-name-from-worktree-path.test.ts`
- New: `test/unit/web/features/064-terminal/use-terminal-overlay.test.tsx`
- Modified: `apps/web/src/features/064-terminal/hooks/use-terminal-sessions.ts`
- Modified: `apps/web/src/features/064-terminal/hooks/use-terminal-overlay.tsx`
- Modified: `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` (1-line wiring)
- Modified: `apps/web/src/features/064-terminal/components/terminal-page-client.tsx` (1-line wiring)
- Modified: `test/unit/web/features/064-terminal/use-terminal-sessions.test.tsx` (5 new tests added; existing 7 untouched)
- Modified (history): `apps/web/src/features/064-terminal/domain.md` (FX006 row in History table)

**Granular rollback (each task reversible independently if paired with the previous)**:

- FX006-4 fails → revert overlay's import + inline expression (~3 lines, 1 file). FX006-1/2/3 stand.
- FX006-3 fails → remove `worktreePath` from both call sites (~1 line each, 2 files). FX006-1/2 stand but unused at call sites; behavior reverts to pre-FX006.
- FX006-2 fails → revert hook to pre-FX006 (`isCurrentWorktree` flag restored, auto-pick reverted). FX006-1 stands but unused.
- FX006-1 fails → delete the helper file + its test. No cascading effect since FX006-2/4 haven't shipped yet.

**Full rollback (revert all 4 tasks)**: `git revert` the FX006 commits. No data migration concerns.

### JSDoc template (prescribed for FX006-2)

The implementor should emit JSDoc consistent with FX005-2's style. Suggested template above the `useTerminalSessions` function:

```typescript
/**
 * tmux session list + current selection.
 *
 * Auto-pick resolution order (whichever matches first wins):
 * 1. URL `?session=<name>` — if stored and the named session still exists
 *    (FX005-2; URL persistence). Stored phantoms are cleared.
 * 2. **Worktree-folder match** — `s.name === sessionNameFromWorktreePath(worktreePath)`.
 *    Aligns with the convention used by `tmux new-session -A -s <basename>`
 *    elsewhere in the domain (FX006). Skipped when no `worktreePath` is
 *    provided (helper returns empty string).
 * 3. Branch-name match — `s.name === currentBranch`. Fallback for users who
 *    manually maintain branch-named sessions.
 * 4. `enriched[0]` — first stable-sorted session (FX005-1: created asc with
 *    name as tiebreaker). Last resort.
 *
 * History (FX006): pre-FX006 the auto-pick was a single branch-match candidate
 * via a misnamed `isCurrentWorktree` boolean; that flag is now removed and
 * replaced with `isWorktreeFolderMatch` + `isBranchMatch` to reflect what's
 * actually being computed.
 */
```

## Discoveries & Learnings

_Populated during implementation._

| Date | Task | Type | Discovery | Resolution |
|------|------|------|-----------|------------|

---

## Validation Record (2026-05-04)

| Agent | Lenses Covered | Issues | Verdict |
|-------|---------------|--------|---------|
| Source Truth | Hidden Assumptions, Domain Boundaries, Concept Documentation | 2 HIGH fixed (line numbers, hook structure), 1 MEDIUM fixed (additive vs replace clarity) | ⚠️ → ✅ |
| Cross-Reference | Integration & Ripple, Concept Documentation | 1 MEDIUM fixed (F001/FX006 conflation), 1 LOW fixed (mobile-cold-load verifiability), all PASSES (ordinal, Standalone label, FX005 lineage, workshop refs, no third copy of derivation logic) | ⚠️ → ✅ |
| Completeness | Edge Cases, Hidden Assumptions, Technical Constraints, Deployment & Ops, System Behavior | 1 HIGH fixed (`isCurrentWorktree` rename specified), 2 HIGH false-positives (call-site wiring + signature change are FX006-3/2's TASKS, not gaps), 5 MEDIUM fixed (test enumeration, overlay test added, phantom URL doc'd, behavior shift, rollback enumeration), 2 MEDIUM addressed (phantom-URL acceptance, JSDoc template), 2 LOW fixed (Deployment Notes, F001 forward-ref) | ⚠️ → ✅ |
| Forward-Compatibility | Forward-Compatibility, User Experience | 1 CRITICAL fixed (overlay byte-identity `\|\| null`), 1 HIGH fixed (FX006-3 plan-6-v2 automated gate), 1 HIGH addressed (sanitization asymmetry doc'd as out-of-scope), 1 MEDIUM addressed (silent-degradation risk doc'd) | ⚠️ → ✅ |

**Lens coverage**: 10/12 (above the 8-floor). Forward-Compatibility engaged (5 named consumers).

### Forward-Compatibility Matrix

| Consumer | Requirement | Failure Mode | Verdict | Evidence |
|----------|-------------|--------------|---------|----------|
| C1 `browser-client.tsx` (mobile) | hook call-compat + `worktreePath` in scope | shape mismatch | ✅ after fix | `worktreePath` is a prop already in scope at the hook call site (~line 465); FX006-3 (a) wires it. Hook's optional argument means existing call shape is backward compat. |
| C2 `terminal-page-client.tsx` (desktop) | same | shape mismatch + contract drift | ✅ with documented limitation | `worktreePath` available in scope; FX006-3 (b) wires it. Pre-existing sanitize-asymmetry between mobile and desktop call sites is documented as out-of-scope (the fix's worktree-folder match doesn't depend on `currentBranch`'s sanitization, so the asymmetry only affects the now-secondary branch-match fallback). Future fix can address. |
| C3 `useTerminalOverlay` refactor | byte-identical helper output | contract drift | ✅ after fix | FX006-4's spec now explicitly preserves the `\|\| null` semantic at the call site (`sessionNameFromWorktreePath(worktree) \|\| null`). Helper returns plain `string`; the `\|\| null` lives at the overlay call site to match pre-FX006 byte-identity. New `use-terminal-overlay.test.tsx` regression test added. |
| C4 plan-6-v2 invocation | tasks self-sufficient (automated gates) | test boundary | ✅ after fix | FX006-3 (d) now specifies the `hook.user-higgs-bug` renderHook test as the authoritative automated gate. Manual/Playwright steps are explicitly optional. plan-6-v2 can verify completion via `pnpm vitest run`. |
| C5 FX005 existing tests | no regression under optional arg | test boundary | ✅ | All 7 FX005-2 tests pass `currentBranch` only; optional `worktreePath` defaults to `undefined`; helper returns `''`; worktree-folder candidate skipped; falls through to branch-match (existing behavior). Test semantic shift (test names refer to "current-worktree" but test branch-fallback) is a stylistic drift, not a functional regression — accepted. |

**Outcome alignment**: The user said *"loading the higgs workspace shower the weong tmux window still"*. The artifact, as edited, advances this for the dominant case (cold-load on any worktree where a folder-named tmux session exists — including the user's exact higgs-jordo bug) by aligning the in-tab `useTerminalSessions` hook with the worktree-folder convention the rest of the terminal domain (the overlay) already uses. Pre-FX006 phantom URLs are explicitly out of scope (user manually overrides) and the no-mobile-picker concern (companion F001) is explicitly deferred — both decisions documented in the dossier so a future audit doesn't mistake them for oversights.

**Standalone?**: No — five named downstream consumers; Forward-Compatibility engaged.

### Fixes applied

- **CRITICAL** — Overlay byte-identity: FX006-4 spec now preserves `\|\| null` at the call site (helper stays `string → string`; the `\|\| null` is a one-token addition at the overlay call).
- **HIGH** — Line numbers corrected throughout: overlay's expression cited at lines 70-72 (was 65-69 / 67); hook auto-pick at lines 105 + 135 (was vague "line 42").
- **HIGH** — Hook structure characterized accurately: `isCurrentWorktree` flag is misnamed (it's a branch-match flag); FX006-2 now explicitly specifies replacing it with `isWorktreeFolderMatch` + `isBranchMatch`.
- **HIGH** — FX006-3 automated gate: the `hook.user-higgs-bug` renderHook test (FX006-2 (e)) is the authoritative gate; manual/Playwright steps optional.
- **MEDIUM** — F001 / FX006 motivation separated: companion finding was about UI, not auto-pick logic; user-discovery-during-smoke-test is the actual provenance.
- **MEDIUM** — Test enumeration: explicit kebab-case names for all 6+ helper tests and 5 hook tests.
- **MEDIUM** — Phantom URL behavior post-FX006: documented in Risk + new acceptance bullet (URL persistence is canonical override, FX006 doesn't auto-correct).
- **MEDIUM** — Behavior shift: now spelled out — when both worktree-folder and branch sessions exist, worktree-folder wins; FX005-2 URL persistence masks the change for returning users.
- **MEDIUM** — Rollback: full enumeration of 6 files (3 new, 3 modified, plus tests + domain.md history) with granular per-task rollback paths.
- **MEDIUM** — Sanitization asymmetry between mobile/desktop call sites: documented as pre-existing, out-of-scope for FX006, follow-up fix candidate.
- **LOW** — Deployment & Ops section added (mirrors FX005's pattern).
- **LOW** — JSDoc template prescribed inline.

### Open (none blocking)

- Sanitization asymmetry between `browser-client.tsx` and `terminal-page-client.tsx` is real and pre-existing; could become FX007 if the user wants it addressed. Not a regression introduced by FX006.
- F001 (mobile session-picker UI) remains a deferred concern from FX005's review; not part of FX006's scope.

**Overall**: ⚠️ VALIDATED WITH FIXES — ready for `/plan-6-v2-implement-phase --fix FX006` once the user approves.
