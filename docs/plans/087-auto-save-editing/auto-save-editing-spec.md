# Auto-Save for File Editing (rich + preview modes)

**Mode**: Simple

📚 Specification incorporates findings from `research-dossier.md` and the authoritative design decisions in `workshops/001-draft-storage-model-and-lifecycle.md`.

---

## Research Context

Research (`research-dossier.md`) established that this feature is **~90% reuse**:

- `useAutoSave` debounce/status/`flush()` hook already exists (`_platform/hooks/use-auto-save.ts`, proven in the 058 workunit editor).
- Atomic write `writeFile(tmp) → rename(tmp, target)` is proven in three services.
- `saveFile(slug, worktreePath, filePath, content, expectedMtime?, force?)` already does conflict-aware text save with a fail-closed `resolvePath()` security check.
- Both editors (rich = `markdown-wysiwyg-editor.tsx`, preview/source = `code-editor.tsx`) and their load/save wiring exist.

The **one divergence**: today's autosave (058) writes straight to the target. This feature requires autosave to write to a **draft** and only touch the target on an **explicit** save.

Workshop 001 (Contract Ready) settled the two riskiest decisions: **where drafts live** and the **draft lifecycle / crash-recovery semantics**. Those decisions are authoritative for this spec and the architect.

---

## Summary

**What**: While a user edits a file in either the rich (WYSIWYG) or preview (source) editor, periodically auto-save their in-progress content to a **draft store — never the target file**. On an explicit save, atomically write the target and delete the draft. On load, if a draft exists for that file and differs from disk, offer to **restore** it into the editor only (the target is not written until the user explicitly saves).

**Why**: Protect users from losing in-progress edits on crash / tab-close / navigation, without ever silently mutating their target files or tripping the file watcher.

---

## Goals

- Auto-save in-progress editor content at idle intervals while editing in **both** rich and preview modes.
- Auto-save writes only to a draft location, **never** the target file.
- On explicit save: atomically write the target (existing `saveFile`), then delete the draft.
- On load: if a draft exists and differs from disk, prompt **Restore / Discard**; Restore loads the draft into the editor only (no target write).
- A restore can never silently clobber external edits — the existing `saveFile` mtime conflict guard is the backstop at the next explicit save.
- Drafts never trigger the file-watcher tree-refresh loop.
- Surface autosave status in the editor toolbar (reuse `SaveIndicator`).

## Non-Goals

- No change to the explicit-save path itself (`saveFile`, atomic write, mtime conflict dialog) — reused unchanged.
- No client-only (`sessionStorage`/`localStorage`) draft store in v1 (rejected in workshop D1-C).
- No cross-device draft sync beyond what server-side storage naturally provides.
- No autosave for binary or oversized files (reuse existing `isBinary` / 5MB / 200KB-rich gates).
- No promotion to a shared `packages/shared` `IDraftService` in v1 (workshop Q4 — file-browser service only).
- No live diff/merge UI for restore beyond the existing 3-way conflict dialog at save time.

---

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| `file-browser` | existing | **modify** | Owns load/select, `FileViewerPanel`, the restore-on-load decision + draft persistence service (`draft-file-actions.ts`) and the `saveDraft`/`readDraft`/`deleteDraft` server actions. |
| `_platform/viewer` | existing | **consume** | Lends the `useAutoSave` hook + the two editors. **Must not import file-browser** (086 T019 guard). Autosave `saveFn` is injected by file-browser. |
| `_platform/file-ops` | existing | **consume** | Atomic-write + `IFileSystem` / `IPathResolver` substrate, reused unchanged by the draft service. |

No NEW domains. The draft service lives in `file-browser` (workshop Q4 RESOLVED): only file-browser consumes it, and routing the new service there preserves the `viewer ↛ file-browser` dependency rule (the viewer only lends `useAutoSave`).

---

## Testing Strategy

- **Approach**: Hybrid.
  - **TDD** for the draft store + lifecycle: `draftPathFor`, `saveDraftFile`/`readDraftFile`/`deleteDraftFile`, the redundant-draft suppression and lifecycle transitions — pure logic, tested with `FakeFileSystem` + fake path resolver (mirrors `save-image.ts` tests).
  - **Lightweight / browser-harness** for the restore prompt UI, the autosave wiring into the two editors, and the "no `file-changes` event fires on autosave" check (Playwright + CDP).
- **Rationale**: the genuinely-new, failure-prone logic (path derivation, crash-recovery branches, conflict backstop) is unit-testable in isolation; the React/editor wiring is best verified through the running app.
- **Focus Areas**: draft path derivation + sandbox inheritance; restore decision tree (every branch); "temp exists ⇒ crashed" ordering; draft deleted only on explicit-save success or discard (never on conflict); watcher-quiet drafts.
- **Excluded**: re-testing `saveFile` / atomic write / mtime conflict (already covered by 083/086).
- **Mock Usage**: Targeted — `FakeFileSystem` + fake `IPathResolver` for the draft store; real data/fixtures elsewhere; no mocking of business logic.

## Documentation Strategy

- **Location**: `docs/how/` — a short guide covering autosave/draft/restore behavior, the draft storage location, crash-recovery semantics, and the conflict backstop.
- **Rationale**: this is user-visible behavior with non-obvious crash-recovery semantics worth one durable explainer; the spec + workshop carry the design rationale.

---

## Complexity

- **Score**: CS-3 (medium)
- **Breakdown**: S=1, I=2, D=1, N=1, F=1, T=1 (P=7 → CS-3)
  - S (Surface Area)=1: a new service + 3 server actions + wiring into 2 editors + one modal.
  - I (Integration)=2: touches viewer hook, file-browser load/save wiring, the watcher, and the existing conflict path.
  - D (Data/State)=1: one small JSON record per file; lifecycle is well-defined.
  - N (Novelty)=1: the draft store is new, but the patterns (atomic write, sidecar under `.chainglass`, DI service) are all established.
  - F (Non-Functional)=1: watcher-quietness + security fail-closed are the constraints, both with known patterns.
  - T (Testing/Rollout)=1: Hybrid; FakeFileSystem unit + browser harness.
- **Confidence**: 0.85 (workshop pre-settled the hard decisions; residual unknown is the data-watcher scope — see Open Questions Q1).
- **Assumptions**: workshop 001's contracts hold; `useAutoSave`, `saveFile`, atomic write, both editors remain as researched.
- **Dependencies**: `_platform/viewer` (`useAutoSave`, editors), `_platform/file-ops` (`IFileSystem`, `IPathResolver`, atomic write), the source/data watchers (085/023).
- **Risks**: see Risks & Assumptions.
- **Phases**: Simple — single implementation phase. Indicative task clusters: (1) draft service + server actions (TDD), (2) autosave wiring into both editors via `useAutoSave` with a draft `saveFn`, (3) restore-on-load prompt + decision tree, (4) explicit-save → `deleteDraft` + session-start sweep, (5) docs/how guide.

---

## Acceptance Criteria

1. **AC-1 (autosave to draft, both modes)**: While editing a non-binary, within-size file in rich OR preview mode, after the user stops typing (idle debounce) the in-progress content is persisted to a draft at `<worktree>/.chainglass/drafts/<relative path>.json` (final location per Q1), and the **target file is unchanged** (its mtime does not move).
2. **AC-2 (no watcher loop)**: An autosave draft write produces **no** `file-changes`/tree-refresh event in the file browser (verified via the browser harness — the tree does not flicker and no source-watcher event fires for the draft path).
3. **AC-3 (explicit save clears draft)**: On an explicit save that returns `ok`, the target is atomically written (existing `saveFile`) **and** the draft for that file is deleted; the autosave status returns to a clean/saved state.
4. **AC-4 (restore on load — differs)**: Loading a file for which a draft exists whose content **differs** from disk shows a Restore / Discard prompt **before** the edit surface is interactive. Choosing **Restore** loads the draft content into the editor (editor becomes dirty) and **does not** write the target. Choosing **Discard** deletes the draft and keeps the disk content.
5. **AC-5 (redundant draft suppressed)**: Loading a file whose draft content **equals** disk content silently deletes the draft and shows no prompt.
6. **AC-6 (restore never clobbers)**: After a Restore, the next explicit save uses the live disk mtime as its baseline; if the file changed on disk since load, the existing mtime conflict dialog fires (no silent overwrite). The restore prompt also shows an advisory when the draft's `editorMtime` differs from the current file mtime.
7. **AC-7 (crash recovery)**: A draft written by a session that ends without an explicit save (tab close / crash / navigation) is offered for restore on the next load of that file — i.e. "a draft survives to next load ⇒ recover" holds.
8. **AC-8 (security fail-closed)**: `saveDraft`/`readDraft`/`deleteDraft` each `requireAuth()` and resolve the path via `resolvePath()` before any I/O; a tampered/out-of-sandbox `filePath` or `worktreePath` returns `error: 'security'` and performs no filesystem write/read. `deleteDraft` treats ENOENT as success.
9. **AC-9 (gated for binary/large)**: Autosave does not run for binary files or files over the existing size caps (reuses `isBinary` / 5MB / 200KB-rich gates); no draft is created for them.
10. **AC-10 (no cross-file leak)**: Switching from editing file A to file B flushes/resets the autosave+draft state keyed by `filePath`, so file B never autosaves file A's content (guards the 086 F005/F008 state-leak class).
11. **AC-11 (stale sweep)**: On session start, drafts whose `savedAt` is older than **30 days** are deleted (retention window resolved in Round 2 / Q3).

---

## Risks & Assumptions

| # | Severity | Risk | Mitigation |
|---|----------|------|------------|
| RK-01 | Critical | External edit under a draft → silent clobber on restore+save | Restore loads editor-only; next explicit save's mtime guard is the backstop; restore prompt advisory when `editorMtime ≠ disk mtime` (workshop restore tree). |
| RK-02 | Critical | Draft writes trigger the file-watcher → tree flicker / refresh loop | Drafts live under `.chainglass`, excluded from the **source** watcher (constants L30 / ADR-0008). **Data-watcher scope must be confirmed** (Q1); recommended placement `.chainglass/drafts/`. AC-2 verifies no event fires. |
| RK-03 | High | Restore overwrites unsaved/external edits silently | Same as RK-01 backstop; never auto-restore — always prompt; load into editor only. |
| RK-04 | High | Binary / oversized files churn disk or corrupt drafts | Gate autosave on `!isBinary && size < cap` (AC-9). |
| RK-05 | High | Path traversal / missing auth on draft server actions | `requireAuth()` + `resolvePath()` fail-closed before any draft I/O (AC-8; 086 F003/F004 pattern). |
| RK-06 | Med | Orphaned drafts accumulate after crashes | Atomic rename avoids partial targets; session-start sweep of drafts older than the retention window (AC-11). |
| RK-07 | Med | Restore modal pops after the user starts typing | Resolve `readDraft` before enabling the edit surface; modal with focus trap (AC-4). |

**Assumptions**: workshop 001's contracts (draft record, server-action signatures, restore tree) are implemented as written; the reused hook/actions/editors remain as researched.

---

## Open Questions

### Q1 — Does the `.chainglass` **data** watcher react to `…/drafts/` writes? (architect to confirm)
The **source** watcher is confirmed to ignore `.chainglass` (constants L30 / ADR-0008). A separate **data** watcher covers `.chainglass`. **Action for `/plan-3`**: confirm the data-watcher's subscription scope; if it enumerates all of `.chainglass/data`, either scope it away from `drafts/` or place drafts at **`.chainglass/drafts/`** (outside `data/`). Workshop recommendation: place drafts at `.chainglass/drafts/` and confirm no watcher subscribes there. AC-2 is the acceptance test regardless of final location.

### Q2 — Autosave cadence — RESOLVED
Reuse `useAutoSave` debounce (~1000 ms idle). "Regular intervals" is satisfied by debounce-on-idle; no fixed wall-clock timer needed for v1.

### Q3 — Retention window for the session-start sweep — RESOLVED
**30 days.** On session start, drafts whose `savedAt` is older than 30 days are deleted. Generous enough that an abandoned draft stays recoverable for a month; the redundant-draft suppression (draft.content === disk) also quietly clears matching drafts on load regardless of age.

---

## Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions | Status |
|-------|------|--------------|---------------|--------|
| Draft storage model & lifecycle | Storage Design + State Machine | Pivotal storage + crash-recovery decisions | Where drafts live; lifecycle; restore tree; watcher-loop avoidance | ✅ **Complete** — `workshops/001-draft-storage-model-and-lifecycle.md` (Contract Ready) |

No further workshops required; the one design tension is settled and the residual item (Q1 data-watcher scope) is an architect confirmation, not a design exploration.

---

## Clarifications

### Session 2026-06-08

**Round 1 (front-loaded):**
- **Workflow Mode**: Simple — ~90% reuse, one primary domain (file-browser), single cohesive feature; escalate later if `/plan-3` reveals more phases.
- **Testing Strategy**: Hybrid — TDD (FakeFileSystem) for the draft store/lifecycle; lightweight/browser-harness for restore UI + autosave wiring.
- **Mock Usage**: Targeted — `FakeFileSystem` + fake path resolver for the draft store; real data elsewhere; no business-logic mocking.
- **Documentation Strategy**: `docs/how/` guide on autosave/draft/restore behavior + storage location + crash-recovery semantics.

**Round 2 (sketch-dependent):**
- **Retention window (stale-draft sweep)**: 30 days — resolves Q3; drives AC-11. (No domain review needed — all target domains exist; no harness question — harness present and research-confirmed sufficient.)

---

## Decision record — 2026-08-28, and it changes AC-1

**Jordan re-asked for this feature and chose a different destination for autosave than
the original ask specified.** Asked directly ("when you navigate away, what should
happen to the file on disk?") he chose:

> navigate away → **atomic write to the real file**, draft deleted
> idle typing → draft only (crash protection)
> reopen → file just as you left it, **no prompt**

This **supersedes the original-ask constraint** *"wont update target until save"* for the
navigate-away trigger only. The idle-debounce trigger keeps the draft-only behaviour this
spec describes, so AC-1 still holds for typing; it no longer describes what happens when
the user leaves.

**Accepted consequence, stated by the option he chose:** an edit the user did not mean to
keep now reaches disk, and git is the undo.

**The restore prompt (AC-4) survives but changes character.** With navigate-away writing
the target and deleting the draft, a draft can only outlive a session that ended
*without* leaving — i.e. a crash or hard tab-close. So the prompt is now a rare
crash-recovery path rather than a routine one, which is what "no prompt" above means.

### Shipped ahead of the rest of this plan

The navigate-away half is **built and on main** (`use-auto-save-on-leave.ts`, wired in
`browser-client.tsx`). It needs no draft store, so it did not wait for Q1. Verified in
the running app: edit `a.md`, click `b.md`, and `a.md` on disk carries the edit.

**Q1 is still open and still blocks the draft half** — the `.chainglass` data-watcher
scope question is untouched by this.

**What the shipped half deliberately does NOT cover:** a hard tab close or crash
mid-edit. A `beforeunload` handler cannot await a server action, so adding one would fire
reliably and fail reliably — coverage that looks real and is not. That case is exactly
what the draft store is for, and it is why the rest of this plan still matters.
