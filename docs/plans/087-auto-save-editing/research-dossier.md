# Research Report: Auto-Save for File Editing (rich + preview modes)

**Generated**: 2026-06-08
**Research Query**: "auto-save for file editing (rich + preview modes): periodic save to a temp location, atomic file update on real save then remove temp; on load, if a temp file exists offer to restore the autosave into the editor without touching the target until an explicit save"
**Mode**: Pre-Plan (associated with `docs/plans/087-auto-save-editing/`)
**FlowSpace**: Available
**Subagents**: 4 (Implementation Archaeology · Atomic-Write/FS Contracts · Prior Learnings · Domain & Risk)

---

## Executive Summary

### What we're building
Periodic auto-save while editing a file in either editor mode. Auto-save writes to a **draft/temp location — never the target file** — and the target is only updated on an **explicit save** (the existing atomic write). On **load**, if a draft exists for that file, the editor offers to **restore** it (loads the draft into the editor only; the target stays untouched until the user explicitly saves).

### The big reframe (read this first)
**Almost all the machinery already exists.** This is largely a *reuse + a thin new draft layer* feature, not a from-scratch build:
- A debounced **`useAutoSave` hook** already exists (`_platform/hooks/use-auto-save.ts`, 500ms default, `idle→saving→saved→error`, with `flush()`), proven in the 058 workunit editor.
- An **atomic write** (`writeFile(tmp) → rename(tmp, target)`) is implemented and tested in three services (`file-actions.ts`, `save-image.ts`, `upload-file.ts`).
- A **text-save server action with mtime conflict detection** already exists: `saveFile(slug, worktreePath, filePath, content, expectedMtime?, force?)`.
- The two editors (rich = `markdown-wysiwyg-editor.tsx`, preview/source = `code-editor.tsx`) and their load/save wiring (`file-viewer-panel.tsx` + `browser-client.tsx` + `use-file-navigation.ts`) are all in place.

### The one important divergence from existing patterns
The existing autosave pattern (058 workunit editor) **saves straight to the target** on every debounce. **The user's design is different**: auto-save must go to a **draft**, and the **target is only written on explicit save**. So we reuse the *timer/debounce/status* parts of `useAutoSave`, but the **save target is a new draft store**, plus a **restore-on-load** flow. That draft store is the only genuinely new thing.

### Key insights
1. **Reuse, don't reinvent** — `useAutoSave` + atomic-write + `saveFile` + mtime-conflict are all production-tested. The new surface is a *draft store* + *restore prompt* + *wiring into the two editors*.
2. **Draft storage location is the central design decision** (workshop-worthy): server-side sibling `.tmp` vs a `.chainglass/data/` sidecar vs client `sessionStorage`. Each interacts differently with the **file watcher** (Plan 085) and the **crash-recovery semantics** the user wants.
3. **"Temp file exists ⇒ probably crashed" needs a precise lifecycle.** Naively, a draft always exists mid-edit, so its mere existence ≠ crash. Recovery must compare `draft.editorMtime` vs the file's current mtime to decide restore-vs-discard, and must not silently clobber external edits.

### Quick stats
- **Reuse surface**: ~90% (hook, atomic write, server action, conflict detection, editors all exist)
- **New surface**: draft store (interface + service + server actions), restore-on-load UI, autosave wiring in 2 editors
- **Domains touched**: 3 (`_platform/viewer`, `file-browser`, `_platform/file-ops`)
- **Critical/High risks**: 5
- **Prior learnings surfaced**: 15 (from Plans 058, 083, 085, 086)

---

## How It Currently Works

### Load
User clicks a file → `use-file-navigation.ts` `handleSelect()` → `readFile(slug, worktreePath, filePath)` server action → returns `{ ok, content, mtime, language, highlightedHtml, markdownHtml }` → stored in `fileData` (mtime included) → `editContent` initialised from `content`. (`use-file-navigation.ts:98-112`, `app/actions/file-actions.ts:27-45`)

### Edit
User types → `onEditChange` updates `editContent` in React state. **No auto-save today** — purely manual. (`browser-client.tsx`, `file-viewer-panel.tsx`)

### Save (manual)
Green Save button or ⌘S → `performSave(currentContent)` → `fileNav.handleSave(content)` → `saveFile(slug, worktreePath, filePath, content, fileData.mtime)`:
- Path resolved + security-checked via `IPathResolver.resolvePath()` (fail-closed → `error: 'security'`).
- mtime guard: if `expectedMtime && !force` and on-disk mtime drifted → `{ ok:false, error:'conflict', serverMtime }`.
- Atomic write: `writeFile(`${absolutePath}.tmp`)` → `rename(tmp, absolutePath)`.
- On success returns `{ ok:true, newMtime }`; the hook re-reads the file and updates `fileData.mtime`. (`services/file-actions.ts:230-255`)

### External-change detection
`useFileChanges` watches the file's mtime over SSE. If changed externally while dirty → blue banner; if not dirty → silent refresh. A 2s post-save suppression timer prevents the editor's own save from self-triggering the banner. (`browser-client.tsx:611-667`)

---

## Key Findings (merged, prioritized)

| # | Impact | Finding | Action for 087 |
|---|--------|---------|----------------|
| KF-01 | Critical | `useAutoSave` hook exists (debounce + status + `flush`), used by 058 workunit editor. Saves **directly to target**, not a draft. | Reuse the timer/status/flush; redirect `saveFn` to a **draft** write, not `saveFile`. |
| KF-02 | Critical | Atomic write `writeFile(tmp)→rename(tmp,target)` is proven in 3 services; `IFileSystem` exposes `writeFile/rename/stat/unlink/exists` + `FakeFileSystem` supports them. | Reuse verbatim for the real (explicit) save; draft writes can use the same atomic pattern. |
| KF-03 | Critical | `saveFile(...expectedMtime,force)` server action already does conflict-aware text save. | Explicit save path is **done** — 087 leaves it intact. Wire restore/draft *around* it. |
| KF-04 | High | Draft writes into the watched tree will trigger the file-watcher (Plan 085) → tree flicker / refresh loop. Recent-feed already filters `.tmp` via `TMP_FILE_RE`. | Store drafts where the watcher won't fire (e.g. `.chainglass/data/…`) or extend ignore/filter rules. **Workshop.** |
| KF-05 | High | "Draft exists ⇒ crashed" is ambiguous — a draft exists during *every* normal edit. | Recovery must compare `draft.editorMtime` vs current file mtime; define precise create/remove lifecycle. **Workshop.** |
| KF-06 | High | Editor state can leak across file switches (086 F005/F008) — selecting file B while editing A reused component state. | Key the editor/draft hook by `filePath`; reset on path change. |
| KF-07 | Med | mtime baseline must be captured at **load**, not first keystroke; autosave success must refresh the in-memory `expectedMtime`. | Thread mtime through the draft+restore flow; update it on explicit save. |
| KF-08 | Med | Rich (WYSIWYG) mode must emit **full assembled content** (frontmatter + body), not just Tiptap body. The `onChange` already assembles via `joinFrontMatter`. | Feed autosave from the assembled `onChange` value, identical to manual save. |
| KF-09 | Med | Binary/large files: editing already gated (`isBinary`, `MAX_FILE_SIZE = 5MB`, 083's 200KB rich-mode cap). | Disable autosave for binary/oversized files; mirror existing gates. |
| KF-10 | Med | Server actions must `requireAuth()` + re-validate path via `resolvePath()` (086 F003/F004 security findings). | Any new draft server action must fail-closed on auth + path. |
| KF-11 | Low | `SaveIndicator` component (058) renders `useAutoSave` status. | Reuse in the editor toolbar for autosave status. |
| KF-12 | Low | Cache-bust gotcha (086 PL-05): same-path save served stale bytes; fixed with `&_v=` key. | Relevant only if a preview re-reads the same URL after restore/save. |

---

## Prior Learnings (institutional knowledge)

✓ 15 relevant learnings surfaced across Plans 058, 083, 085, 086. Highlights:

- **PL (083/086) — Save pipeline & atomic write**: `onSave → saveFile(…expectedMtime) → resolve+conflict-check → tmp+rename → {ok,newMtime}|{conflict}`. Reuse unchanged.
- **PL (058) — `useAutoSave` 500ms debounce hook** already exists and is the blueprint; don't reinvent.
- **PL (085) — Watcher feedback risk**: Plan 085 added file-watch polling; `SOURCE_WATCHER_IGNORED` excludes heavy dirs. Draft writes in-tree will trigger watch events → isolate drafts. **This is the sharpest cross-plan interaction.**
- **PL (086 PL-05) — Stale-after-save cache bust**: same-path writes can serve cached bytes; fix with a version query param.
- **PL (086 OH-002 / F005-F008) — React state leak across files**: key inline editors by `filePath`, reset state on change — directly applies to a per-file draft hook.
- **PL (086 F003/F004) — Server-action security**: validate `mode`/path fail-closed; trusted root via `workspaceService.getInfo(slug)`.
- **PL (083/086 infra) — Container gotchas**: named `cg_node_modules` volume needs `docker exec … pnpm install` after a dep add; OrbStack fs-sync lag causes phantom turbopack 500s — settle after edits; avoid multi-line JSDoc in object literals (turbopack parser).
- **PL (086 OH-005 / F015) — Process**: don't flip completion markers before the review loop closes.

---

## Domain Context

Domain system active (`docs/domains/registry.md`). The feature spans three domains; the **viewer ↛ file-browser** dependency rule (enforced by 086's T019 guard test) constrains placement.

| Domain | Role in 087 | Notes |
|--------|-------------|-------|
| `_platform/viewer` (infra) | Owns the editors + the `useAutoSave` orchestration hook | May provide hooks/UI; **must not import file-browser**. |
| `file-browser` (business) | Owns load/select, `FileViewerPanel`, the restore-on-load decision + wiring | Consumes viewer hooks + a draft service. |
| `_platform/file-ops` (infra) | Natural home for a **draft persistence contract** (`IDraftService`) + atomic draft write/read/delete | Or house draft persistence as a file-browser service if no other consumer needs it. **Decision point.** |

Analogy worth noting: `file-notes` already persists per-file sidecar data via a `*.jsonl` under `.chainglass/data/` with an `INoteService` contract — a close template for a draft store if we go sidecar-based.

**Potential contract**: `IDraftService { saveDraft, readDraft, deleteDraft, listDrafts }` in `packages/shared` (CLI/web/agent reuse) — or a leaner file-browser-only `draft-actions.ts`. Pin this in the spec/workshop.

---

## Risks

| # | Severity | Risk | Mitigation |
|---|----------|------|------------|
| RK-01 | Critical | Concurrent/external edits: autosave draft can hold stale content; forcing a save loses external changes | On explicit save keep the mtime conflict guard; restore prompt must warn when `draftMtime` ≠ file mtime; never auto-restore over a changed file |
| RK-02 | Critical | Draft writes trigger the file-watcher → tree flicker / refresh loop | Store drafts outside the watched set (`.chainglass/data/…`) and/or extend watcher-ignore + recent-feed filter; test "no `file-changes` event on autosave" |
| RK-03 | High | Restore overwrites unsaved/external edits silently | Compare `draft.editorMtime` vs current mtime; offer discard/keep (optionally diff); load into editor only — never write target until explicit save (this is the user's explicit requirement) |
| RK-04 | High | Binary & large files churn disk / corrupt drafts | Gate autosave on `!isBinary && size < cap`; reuse existing 5MB / 200KB gates; show a banner when disabled |
| RK-05 | High | Path/security & auth at the draft server action | `requireAuth()` + `resolvePath()` fail-closed before any draft write (086 F003/F004 pattern) |
| RK-06 | Med | Orphaned temp/draft files accumulate after crashes | Atomic rename avoids partial target writes; add a session-start cleanup of stale drafts (age threshold) |
| RK-07 | Med | Restore modal timing/focus (pops up after user starts typing) | Resolve draft check before enabling the edit surface; explicit Restore/Discard/Cancel with focus trap |

---

## Agent Harness Status

- **Engineering substrate**: present — `justfile` + `package.json` (dev server, Playwright/CDP browser harness, vitest). Boot/health via `just harness-health` / `just harness-verify` (per prior plans).
- **Governance doc**: legacy `docs/project-rules/harness.md` present (no canonical `engineering-harness.md`). *Note only — not modified by this read-only research.* Consider migrating the filename in a future effort.
- **Implication for 087**: the browser harness (Playwright + CDP) is the right sensor for restore-prompt + autosave-timer behaviour; unit/integration via vitest + `FakeFileSystem` for the draft store and atomic writes. No new harness work required.

---

## Workshop Opportunities

Two design tensions are worth a `/plan-2c` workshop before architecting:

1. **WO-1 — Draft storage model & location.** Server-side per-file sibling `.tmp`/`.draft` vs a central `.chainglass/data/drafts.jsonl` sidecar (file-notes style) vs client `sessionStorage`. Drives the watcher-interaction (RK-02), crash-recovery semantics (KF-05), cross-device behaviour, and whether we need `IDraftService` in `packages/shared`. **The pivotal decision.**
2. **WO-2 — Draft lifecycle & crash-recovery semantics.** Exact create/update/delete points, how "temp exists ⇒ crashed" is disambiguated via `editorMtime` vs file mtime, and the restore-vs-discard-vs-conflict decision tree (interacts with the existing mtime-conflict + external-change banner).

(Conflict/concurrency UX largely reuses 086's 3-way conflict dialog; can be folded into WO-2.)

---

## External Research Opportunities

**None required.** Every dependency is internal and already implemented (atomic write, FS interface, `useAutoSave`, conflict detection, editors). No framework/library gap surfaced that reading more code can't answer.

---

## Next Steps

- **Recommended**: proceed to **`/plan-1b`** to write the spec (the ask is well-formed; the spec's clarification batch can settle the draft-location question, or split it into a `/plan-2c` workshop if it stays contentious).
- Optional: **`/plan-2c`** workshop on WO-1 (draft storage model) first if you want that decision locked before the spec commits to a shape.

---

**Research complete.** Report: `docs/plans/087-auto-save-editing/research-dossier.md`
