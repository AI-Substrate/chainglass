# Draft store — design (plan 087, second half)

**Status**: proposed, ready for build
**Author**: draft-store PM, 2026-08-28
**Supersedes on path only**: workshop 001 D1 (`.chainglass/data/drafts/` → `.chainglass/drafts/`)
**Reads**: `auto-save-editing-spec.md` (11 ACs + the 2026-08-28 decision record),
`workshops/001-draft-storage-model-and-lifecycle.md` (authoritative lifecycle).

---

## 1. Q1 — RESOLVED from code: `.chainglass/drafts/` is watched by nothing

| Fact | Evidence |
|------|----------|
| The data watcher adds exactly two roots per worktree — `<wt>/.chainglass/data` and `<wt>/.chainglass/units` — and passes **no `ignored` list**, so everything below them is live. | `packages/workflow/src/features/023-central-watcher-notifications/central-watcher.service.ts:246` |
| Rescan re-derives the same two roots. Nothing anywhere adds `.chainglass` itself or `.chainglass/drafts`. | `central-watcher.service.ts:390-391` |
| The source watcher adds the worktree root with `SOURCE_WATCHER_IGNORED`, whose ignored-segment set contains `.chainglass`. | `central-watcher.service.ts:322`; `source-watcher.constants.ts:30` |
| The ignore test runs **before** emit in both watcher adapters, so no `.chainglass` path reaches an adapter from the source watcher. | `adapters/native-file-watcher.adapter.ts:95`; `adapters/polling-file-watcher.adapter.ts:275` |
| Exactly three adapters are registered on the central watcher. | `apps/web/src/features/027-central-notify-events/start-central-notifications.ts:119-126` |
| The flow watcher (089) watches only `docs/plans`. | `apps/web/src/features/089-first-class-pij/server/flow-watcher.ts:196-199` |

**So**: a write to `<wt>/.chainglass/drafts/**` produces **zero** watcher events. AC-2 holds
by construction, not by downstream filtering — which is the strongest form the AC can take.

**Why not `.chainglass/data/drafts/`** (the workshop's original pick): every autosave would
fire the data watcher. The file-browser tree would still be safe — `FileChangeWatcherAdapter`
drops any path containing `/.chainglass/` (`file-change-watcher.adapter.ts:44`) — but the event
is not inert. `WorkUnitCatalogWatcherAdapter`'s regex is unanchored and extension-agnostic:

```ts
/units\/([^/]+)\/(unit\.yaml|templates\/.+)$/   // workunit-catalog-watcher.adapter.ts:23
```

A mirrored draft path such as `.chainglass/data/drafts/<any>/units/<slug>/templates/foo.md.json`
**matches**, emitting a spurious unit-catalog change event on every keystroke-pause. (The three
`WorkflowWatcherAdapter` regexes are `$`-anchored on `graph.yaml`/`node.yaml`/`state.json` and
cannot match a `.json`-suffixed draft.) Placement outside `data/` removes the whole class.

### Consequence Q1 creates, and its fix

`.chainglass/data/` **is** gitignored (`.gitignore:163`); `.chainglass/drafts/` is **not**
(`git check-ignore .chainglass/drafts/x.json` → no match). Untracked drafts would show in
`git status` and, because `directory-listing.ts` lists via `git ls-files` for git repos, could
surface in the tree. **The build must add `.chainglass/drafts/` to `.gitignore`** — one line,
same commit as the service. This is the only cost of moving out of `data/`, and it is cheaper
than the false unit-catalog events.

---

## 2. Storage contract

Path: `<worktree>/.chainglass/drafts/<worktree-relative target path>.json`
(`src/foo.md` → `.chainglass/drafts/src/foo.md.json`).

Record: `AutosaveDraft` exactly as workshop 001 defines it (`schemaVersion: 1`, `filePath`,
`content`, `editorMtime`, `savedAt`) — unchanged.

Atomic write: `writeFile(draftPath + '.tmp')` → `rename(tmp, draftPath)`. **The tmp file must sit
inside the drafts tree**, not beside the target. `saveFileAction` writes `${absolutePath}.tmp`
next to the target (`file-actions.ts:256`) and `.tmp` is not in `SOURCE_WATCHER_IGNORED` — that
existing behaviour is out of scope here, but the draft store must not copy it.

Path derivation, fail-closed, in this order:

1. `pathResolver.resolvePath(worktreePath, filePath)` → proves the **target** is in-sandbox
   (`PathSecurityError` → `error: 'security'`, no I/O).
2. Derive `rel` from the *resolved* absolute path relative to the worktree root — never from the
   raw `filePath` argument. A raw argument that normalises differently must not reach `join`.
3. `pathResolver.resolvePath(<wt>/.chainglass/drafts, rel + '.json')` → second fail-closed check,
   proves the derived draft path is inside the drafts root.

---

## 3. Server actions + service

Service `apps/web/src/features/041-file-browser/services/draft-file-actions.ts`, DI'd on
`SHARED_DI_TOKENS.FILESYSTEM` / `PATH_RESOLVER`, structured exactly like `save-image.ts`
(pure, `FakeFileSystem`-testable):

```ts
draftPathFor(worktreeRoot, relFilePath): string      // pure, the unit-test workhorse
saveDraftFile({ worktreePath, filePath, content, editorMtime, fileSystem, pathResolver })
readDraftFile({ ... })    // missing → { ok: true, draft: null }; malformed JSON → { ok:true, draft:null } + unlink
deleteDraftFile({ ... })  // ENOENT → ok
sweepDrafts({ worktreePath, olderThanMs, fileSystem, pathResolver })  // AC-11
```

Actions `apps/web/app/actions/draft-actions.ts` (`'use server'`), signatures per workshop 001.

**AC-8 needs more than the reused pattern gives.** `saveFile`/`readFile` take `slug` and ignore
it (`app/actions/file-actions.ts:47-58`): `resolvePath` only guarantees `filePath` stays inside
whatever `worktreePath` the client sent, so a tampered `worktreePath` is currently trusted. AC-8
names `worktreePath` explicitly, so the draft actions will call
`resolveValidatedWorktreePath(slug, worktreePath)`
(`app/api/workspaces/[slug]/workflows/[graphSlug]/execution/_resolve-worktree.ts:19`) and return
`error: 'security'` on `null`, after `requireAuth()` and before any I/O. Retrofitting the same
check onto `saveFile` is a real gap but **not in this plan's scope** — flagged, not smuggled in.

---

## 4. Lifecycle, as amended by the shipped navigate-away half

The 2026-08-28 decision record changes the state machine's exits. Navigate-away now writes the
**target**, so it must also clear the draft:

| From | To | Trigger | Action |
|------|----|---------|--------|
| NoDraft | DraftPresent | idle debounce (~1000 ms), dirty, `!isBinary`, under caps | `saveDraft(content, editorMtime = fileData.mtime)` |
| DraftPresent | DraftPresent | idle debounce again | atomic overwrite |
| DraftPresent | NoDraft | explicit save **or navigate-away save** returns `ok` | `deleteDraft()` |
| DraftPresent | NoDraft | Discard at the restore prompt | `deleteDraft()` |
| DraftPresent | **DraftPresent** | save returns `conflict` | **draft NOT deleted** — the invariant |
| any | NoDraft | session start, `savedAt` older than 30 days | `deleteDraft()` |

A draft therefore survives only a session that ended *without leaving* — crash or hard tab
close. That is what "reopen → no prompt" means in the decision record, and it is why the prompt
must stay: `useAutoSaveOnLeave` deliberately does not cover the unload path
(`use-auto-save-on-leave.ts:20-26`).

### The race this creates, and why `useAutoSave` needs `cancel()`

On leave the order is: target write → `deleteDraft`. A draft-debounce timer already pending when
the user leaves will fire **after** the delete and resurrect an orphan draft — which then prompts
for restore on next load, i.e. exactly the "no prompt" behaviour Jordan chose, broken.

`useAutoSave` exposes only `trigger` and `flush` (`_platform/hooks/use-auto-save.ts:14-21`);
`flush` is wrong here (it would write the draft we are about to delete). **Proposal: add a
`cancel()` to `useAutoSave`** — clears `timerRef` and `pendingValueRef`, additive, no existing
caller changes (058 keeps working untouched). Same `cancel()` is what AC-10 needs on file switch.
This is the one place the "90% reuse" claim does not hold, and it is a five-line addition to a
platform hook rather than a new debounce.

### AC-10 — no cross-file leak

The draft `saveFn` must close over the `filePath` captured **at trigger time**, not read a ref at
fire time, and the hook must `cancel()` + reset when `filePath` changes. Guard shape mirrors
`shouldFlush` in `use-auto-save-on-leave.ts:65-71`: pure, so it is testable without a DOM.

---

## 5. Integration points (exact)

| Concern | Where | Change |
|---------|-------|--------|
| Draft autosave trigger | `browser-client.tsx:730-736` (beside `useAutoSaveOnLeave`) | new `useDraftAutoSave({ filePath, content, isDirty, editorMtime, enabled })` |
| `deleteDraft` on save success | `use-file-navigation.ts:183-216` (`handleSave`, on `ok`) | single hook point — covers explicit save **and** navigate-away, since `autoSaveOnLeave.save` is `handleSaveWithSuppression` → `fileNav.handleSave` (`browser-client.tsx:709-736`) |
| Cancel pending draft before a leave-save | `browser-client.tsx:819` (`await autoSaveOnLeave.flush()`) | `cancel()` the draft timer first |
| Restore prompt on load | `use-file-navigation.ts` — **three** separate `readFileFn → setEditContent` sites (`:102`, `:126`, `:149`) plus `handleRefreshFile:220` | funnel them through one `loadFile()` that resolves `readDraft` before the edit surface goes interactive (AC-4, RK-07). Bolting `readDraft` onto three call sites is how AC-10/AC-4 regressions get built. |
| Gates | reuse `fileData.ok && !isBinary` (already the `isDirty` predicate at `browser-client.tsx:657-661`) + existing 5MB / 200KB-rich caps | AC-9 |
| Sweep | browser page server component, fire-and-forget per worktree | AC-11 |
| Status UI | `SaveIndicator` in the editor toolbar | unchanged |

---

## 6. Test plan (and how each is proven, not just passed)

TDD with `FakeFileSystem` + fake `IPathResolver`, mirroring `save-image.ts`'s tests:

1. `draftPathFor` — mirrored path, `.json` suffix, nesting.
2. Traversal: `../../etc/passwd`, absolute `filePath`, `worktreePath` not in the registry → each
   `error: 'security'` with **zero** `writeFile`/`readFile` calls on the fake.
3. `readDraft` on missing file → `draft: null`; on malformed JSON → `null` + unlink.
4. `deleteDraft` ENOENT → `ok: true`.
5. Restore decision tree — one test per branch (`no draft` / `equal` / `differs + mtime equal` /
   `differs + mtime drifted`), asserting the editor outcome **and** the `expectedMtime` baseline.
6. `conflict` does **not** delete the draft (the invariant).
7. Leave-then-debounce race: cancel before leave-save ⇒ no draft on disk afterwards.
8. Sweep: 29-day draft survives, 31-day draft is deleted.

**Mutation-verified before any "covered" claim** (brief's standing rule, and this repo has a
recorded 31-passing-tests-against-broken-behaviour case). At minimum: delete the `resolvePath`
call → test 2 must go red; invert the `conflict` branch → test 6 red; remove `cancel()` → test 7
red. A guard whose mutation leaves the suite green is not a guard.

**Verified in the running app** (dev server :3000, workspace `chainglass`), not only under vitest:
edit a file, pause, confirm the draft file appears under `.chainglass/drafts/` while the target's
mtime has not moved (AC-1); confirm the tree does not flicker and no file-changes event fires
(AC-2); kill the tab mid-edit, reopen, take the prompt (AC-7).

The repo gate is nondeterministic (`bp-0017`: 1, 2, 5, 2, 0 failures on an unchanged tree), so a
single green `just test` is **not** evidence for these; the mutation checks and the app run are.

---

## 7. Open items for Jordan (not blocking the build)

1. **Restore prompt copy + placement** — it is now a rare crash-recovery path, not routine. Modal
   with focus trap is specified; the wording is his call.
2. **`.gitignore` line** — adding `.chainglass/drafts/` is assumed; say so if drafts should be
   visible to git instead.
3. **`saveFile`'s unvalidated `worktreePath`** — real, pre-existing, deliberately out of scope
   here. Worth its own small fix.
