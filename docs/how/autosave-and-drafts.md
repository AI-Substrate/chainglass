# Autosave, drafts, and crash recovery

How the file browser protects in-progress edits, where it puts them, and what it
deliberately does not protect.

## The two triggers, and why they behave differently

| Trigger | What happens | Why |
|---|---|---|
| You stop typing (~1s idle) | The buffer is written to a **draft**. The file itself is untouched — its mtime does not move. | Pausing mid-sentence is not a decision. A half-finished thought must not land on disk. |
| You navigate away (pick another file, leave the page, hide the tab) | The **real file** is written atomically, and the draft is deleted. | Leaving is a deliberate act, so it behaves like a save. Jordan's call, 2026-08-28. Accepted consequence: an edit you did not mean to keep reaches disk, and git is the undo. |
| You save explicitly (⌘S) | The real file is written through the normal conflict-checked save, and the draft is deleted. | Unchanged from before. |

The toolbar shows **Backing up… / Backed up** while drafts are being written. That wording is
deliberate: it does *not* say "Saved", because at that moment your file has not been saved.

## Where drafts live

```
<worktree>/.chainglass/drafts/<the file's path>.json
```

So a draft of `src/foo.md` is `.chainglass/drafts/src/foo.md.json`. Each draft holds the full
editor content, the file's mtime when you opened it, and the time it was written. Drafts are
gitignored and safe to delete at any time.

**That location is load-bearing, not tidiness.** The central watcher watches
`.chainglass/data` and `.chainglass/units`; it does not watch `.chainglass/drafts`, and the
source watcher ignores everything under `.chainglass`. So a draft write produces no file-change
event, and the file tree does not flicker while you type. Moving drafts under
`.chainglass/data/` would re-arm the data watcher and fire spurious work-unit-catalog events on
every keystroke pause. See plan 087's Q1 for the evidence.

## When you get the "Unsaved changes recovered" prompt

Rarely, and only for one reason: **the previous session died without leaving.** A crash, or a
hard tab close, mid-edit. Any normal exit — switching files, leaving the page — writes the file
and clears the draft, so there is nothing left to recover.

At that point, on the next load of that file:

- **Draft matches what is on disk** → it is deleted silently. No prompt. Nothing was lost.
- **Draft differs** → you are asked to **Restore** or **Discard**, before the editor becomes
  editable.
- **Restore** loads the draft into the editor and marks it dirty. It does **not** write the
  file. Nothing reaches disk until you save.
- **Discard** deletes the draft and keeps what is on disk.

If the file also changed on disk *after* the draft was written, the prompt says so. You are
choosing between two real edits, and you should know that before choosing.

## Restoring cannot silently clobber someone else's edit

Restore only fills the editor. The next explicit save runs the existing mtime check against the
live file, so if the file moved on since you loaded it you get the normal conflict dialog rather
than a silent overwrite.

**A conflict never deletes your draft.** If a save is refused because the file changed
underneath you, the draft stays exactly where it is — your recovered work survives the dialog.
The draft is removed only on a successful save or an explicit Discard.

## What is *not* protected

- **Edits younger than the idle debounce.** If you type and the tab dies under a second later,
  the draft was never written. Nothing can be done about this without writing on every
  keystroke.
- **Binary files and files past the size caps.** They are never autosaved and never get drafts.
- **A hard tab close is not a save.** It leaves a draft (crash recovery), it does not write your
  file. There is no `beforeunload` save and there deliberately never will be: the unload path
  cannot wait for a server call, so such a handler would fire reliably and fail reliably —
  coverage that looks real and is not.

## Housekeeping

Drafts older than **30 days** are deleted when you open the browser on that worktree. Drafts
that match what is already on disk are cleared as soon as that file is opened. You can delete
`.chainglass/drafts/` by hand at any time; nothing depends on it surviving.

## Where the code is

| Piece | Path |
|---|---|
| Draft store (paths, read/write/delete/sweep) | `apps/web/src/features/041-file-browser/services/draft-file-actions.ts` |
| Server actions | `apps/web/app/actions/draft-actions.ts` |
| Idle-debounce autosave to draft | `apps/web/src/features/041-file-browser/hooks/use-draft-auto-save.ts` |
| Save-on-leave (writes the real file) | `apps/web/src/features/041-file-browser/hooks/use-auto-save-on-leave.ts` |
| Load path + restore decision | `apps/web/src/features/041-file-browser/hooks/use-file-navigation.ts` (`loadFile`) |
| Restore prompt | `apps/web/src/features/041-file-browser/components/draft-restore-dialog.tsx` |

Design rationale: `docs/plans/087-auto-save-editing/` — the spec, workshop 001 (storage model
and lifecycle), and `draft-store-design.md` (Q1 resolution and integration points).
