# Fix FX003: `saveFile` / `readFile` trust a client-supplied `worktreePath`

**Created**: 2026-08-28
**Status**: Open — not started
**Plan**: [file-browser-plan.md](../file-browser-plan.md)
**Source**: Filed out of plan 087 (auto-save draft store) design review, at the direction of
`pij-chief-roadrunner`. Deliberately **not** fixed inside 087 — that would be scope creep — and
deliberately **not** left as a bullet in 087's design doc, because a finding with no owner and
no gate rots by default (documented precedent: plan 092's `oq-0004` died unruled).
**Domain(s)**: file-browser
**Severity**: security — live gap in shipped code, currently reachable by any authenticated user

---

## Problem

`readFile` and `saveFile` accept a `slug` argument and never use it:

```ts
// apps/web/app/actions/file-actions.ts:27-69
export async function saveFile(
  slug: string,            // ← accepted, never read
  worktreePath: string,
  filePath: string,
  ...
) {
  await requireAuth();
  ...
  return saveFileService({ worktreePath, filePath, ... });
}
```

The only path check downstream is `pathResolver.resolvePath(worktreePath, filePath)`
(`src/features/041-file-browser/services/file-actions.ts:235`). That proves `filePath` stays
inside `worktreePath` — it says nothing about whether `worktreePath` is a worktree this user's
workspace actually owns. Both values arrive from the client in the same server-action call.

**So the sandbox root is attacker-chosen.** An authenticated caller can invoke the action with
`worktreePath: '/Users/<user>/.ssh'`, `filePath: 'authorized_keys'` and the resolve check passes
— `authorized_keys` is genuinely inside `.ssh`. `requireAuth()` gates *who* calls, not *where*
they may point. `readFile` gives arbitrary read; `saveFile` gives arbitrary write, subject only
to the 5MB / binary gates.

This is not theoretical scope-widening: the repo already has the correct guard and uses it
elsewhere.

## The fix that already exists in this repo

```ts
// apps/web/app/api/workspaces/[slug]/workflows/[graphSlug]/execution/_resolve-worktree.ts:19
export async function resolveValidatedWorktreePath(
  workspaceSlug: string,
  worktreePath: string
): Promise<string | null> {
  const info = await workspaceService.getInfo(workspaceSlug);
  if (!info) return null;
  const match = info.worktrees.find((w) => w.path === worktreePath);
  return match ? match.path : null;
}
```

`workflow-execution-actions.ts:61-128` already calls it on every action, under the comment
"Validate worktreePath against known workspace worktrees (FT-002)". The file-browser actions
were simply never brought up to that bar — which is why the `slug` parameter is present but
dead: the signature anticipated the check that was never written.

## Proposed Fix

1. In `apps/web/app/actions/file-actions.ts`, after `requireAuth()` and **before** resolving DI
   or touching the filesystem, call `resolveValidatedWorktreePath(slug, worktreePath)`; on
   `null` return the action's existing security-shaped failure (`{ ok: false, error: 'security' }`
   for read/save) with no I/O performed.
2. Promote `resolveValidatedWorktreePath` out of the workflow-execution route folder to a shared
   location — it is now used by two unrelated features and lives under a four-segment API route
   path. Do **not** copy it; a second copy is the defect (`bp-0015` precedent from 092).
3. Audit the sibling actions in the same file that take `worktreePath` and reach the filesystem
   — `fetchChangedFiles`, `fetchWorkingChanges`, `fetchRecentFiles`, `fetchRecentFeedItems`,
   `fetchFileList`, `fetchDiffStats`, `uploadFile`, plus `image-actions.ts` and
   `notes-actions.ts`/`pr-view-actions.ts` (which take `worktreePath` with no `slug` at all, so
   they need a signature change first). Enumerate them in this record before fixing, so the
   sweep has a bounded, checkable list rather than an open-ended "audit everything".

## Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | FX003-1 | Enumerate every server action taking a client `worktreePath` that reaches the filesystem | file-browser | `apps/web/app/actions/*.ts` | A table in this record lists each action, whether it also takes `slug`, and whether it validates | Bounds the sweep before any edit |
| [ ] | FX003-2 | Promote `resolveValidatedWorktreePath` to a shared module | file-browser | `_resolve-worktree.ts` → shared lib; update the workflow-execution callers | One definition, two+ consumers, no copies | A second copy is the defect |
| [ ] | FX003-3 | Gate `readFile` + `saveFile` on the validated worktree | file-browser | `apps/web/app/actions/file-actions.ts:27-69` | Tampered `worktreePath` returns `error: 'security'` and performs **zero** filesystem calls | Mutation-verify: delete the check, watch the test go red |
| [ ] | FX003-4 | Gate the remaining actions from FX003-1 | file-browser | per FX003-1 table | Each listed action validates or is recorded as deliberately exempt with a reason | Actions without `slug` need a signature change + callsite updates |

## Acceptance

- [ ] `saveFile` with a `worktreePath` outside the caller's workspace returns `error: 'security'`
      and writes nothing — proven by a test asserting **zero** `writeFile` calls on a fake filesystem
- [ ] `readFile` likewise returns `error: 'security'` and reads nothing
- [ ] Deleting the validation makes those tests go red (mutation-verified, not merely green)
- [ ] `resolveValidatedWorktreePath` has exactly one definition in the repo
- [ ] Every action in the FX003-1 table is either gated or recorded as exempt with a stated reason

## Why this is filed separately from plan 087

Plan 087's new `saveDraft` / `readDraft` / `deleteDraft` actions **will** call
`resolveValidatedWorktreePath` from the outset — AC-8 names `worktreePath` explicitly, so the
draft store meets the bar on day one. Retrofitting the same check onto the pre-existing
`saveFile` / `readFile` is correct, but it is a different change with a different blast radius
(every file-browser callsite) and belongs to this domain's fix ledger, not to the autosave plan.

**Do not close this record when 087 closes.** 087 shipping means the *new* actions are safe; it
says nothing about the old ones.

## Discoveries & Learnings

| Date | Task | Type | Discovery | Resolution |
|------|------|------|-----------|------------|
| 2026-08-28 | — | Finding | The dead `slug` parameter is the fossil of the missing check: the signature was written for a validation that never landed. Anyone reading the action sees a workspace-scoped signature and reasonably assumes workspace scoping. | Filed as this record. |
