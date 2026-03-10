# Fix Tasks: Phase 2: File Notes Web UI

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Correct unfiltered note totals
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/hooks/use-notes.ts, /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/components/notes-overlay-panel.tsx
- **Issue**: `openCount` / `completeCount` come from the filtered note list, so the header and delete-all dialog show incorrect totals whenever a filter is active.
- **Fix**: Keep filtered display data separate from unfiltered totals. Fetch/store aggregate counts (or an unfiltered note list) independently and use those values in the panel header and delete-all dialog.
- **Patch hint**:
  ```diff
  - const [notesResult, filesResult] = await Promise.all([
  -   fetchNotes(worktreePath, noteFilter),
  -   fetchFilesWithNotes(worktreePath),
  - ]);
  + const [filteredResult, totalsResult, filesResult] = await Promise.all([
  +   fetchNotes(worktreePath, noteFilter),
  +   fetchNotes(worktreePath, undefined),
  +   fetchFilesWithNotes(worktreePath),
  + ]);
  ...
  - const openCount = useMemo(() => notes.filter((n) => n.status === 'open').length, [notes]);
  - const completeCount = useMemo(() => notes.filter((n) => n.status === 'complete').length, [notes]);
  + const openCount = useMemo(() => allNotes.filter((n) => n.status === 'open').length, [allNotes]);
  + const completeCount = useMemo(() => allNotes.filter((n) => n.status === 'complete').length, [allNotes]);
  ```

### FT-002: Restore SDK boundary ownership
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/071-pr-view/apps/web/src/lib/sdk/sdk-bootstrap.ts, /Users/jordanknight/substrate/071-pr-view/apps/web/src/lib/sdk/sdk-domain-registrations.ts, /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/sdk/register.ts, /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/sdk/contribution.ts
- **Issue**: `_platform/sdk` infrastructure directly registers `notes.toggleOverlay`, which should be composed from the business domain/app level instead of bootstrap.
- **Fix**: Move the notes command/keybinding into file-notes-owned registration files and wire them through `registerAllDomains()` or equivalent app-level composition.
- **Patch hint**:
  ```diff
  - // Notes overlay toggle (Plan 071 Phase 2)
  - commands.register({ id: 'notes.toggleOverlay', ... domain: 'file-notes', ... });
  - keybindings.register({ key: '$mod+Shift+KeyL', command: 'notes.toggleOverlay' });
  + // bootstrapSDK stays infrastructure-only; business commands are composed elsewhere
  ```
  ```diff
  + import { registerFileNotesSDK } from '@/features/071-file-notes/sdk/register';
  
    export function registerAllDomains(sdk: IUSDK): void {
      registerFileBrowserSDK(sdk);
      registerEventsSDK(sdk);
  +   registerFileNotesSDK(sdk);
    }
  ```

### FT-003: Add lightweight verification with concrete evidence
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-2-file-notes-web-ui/execution.log.md, /Users/jordanknight/substrate/071-pr-view/test/unit/web/features/071-file-notes/, /Users/jordanknight/substrate/071-pr-view/test/integration/
- **Issue**: The phase includes no scoped UI validation or concrete outputs for the overlay, modal, reply, completion, filter, or YEES delete flows.
- **Fix**: Add targeted UI verification (Vitest/RTL or clearly documented manual smoke checks) and capture actual command output / observations in `execution.log.md`.
- **Patch hint**:
  ```diff
  + pnpm vitest run test/unit/web/features/071-file-notes/notes-overlay-panel.test.tsx
  + pnpm vitest run test/unit/web/features/071-file-notes/note-modal.test.tsx
  + # Record pass/fail snippets and the observed overlay/modal/delete behavior in execution.log.md
  ```

## Medium / Low Fixes

### FT-004: Complete or defer link-type filtering explicitly
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/hooks/use-notes.ts, /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/components/notes-overlay-panel.tsx, /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-plan.md, /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-spec.md
- **Issue**: AC-25 and Phase 2 task text require link-type filtering, but the implementation only ships status/addressee filters.
- **Fix**: Either add `file/workflow/agent-run` filter options end-to-end or narrow/defer the acceptance-criteria language so the phase matches what shipped.
- **Patch hint**:
  ```diff
  - export type NoteFilterOption = 'all' | 'open' | 'complete' | 'to-human' | 'to-agent';
  + export type NoteFilterOption =
  +   | 'all'
  +   | 'open'
  +   | 'complete'
  +   | 'to-human'
  +   | 'to-agent'
  +   | 'type-file'
  +   | 'type-workflow'
  +   | 'type-agent-run';
  ```

### FT-005: Sync domain artifacts with the shipped Phase 2 surface
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-plan.md, /Users/jordanknight/substrate/071-pr-view/docs/domains/file-notes/domain.md, /Users/jordanknight/substrate/071-pr-view/docs/domains/domain-map.md
- **Issue**: The plan's Domain Manifest, the file-notes domain doc, and the domain map all lag behind the actual Phase 2 composition.
- **Fix**: Add the missing file rows, document the true SDK integration point, and update the map node/edge/health-summary entries to include panel-layout, workspace-url, events, and sdk.
- **Patch hint**:
  ```diff
  + | `apps/web/src/features/071-file-notes/components/note-file-group.tsx` | file-notes | internal | Collapsible per-file note group |
  + | `apps/web/src/lib/sdk/sdk-bootstrap.ts` | _platform/sdk | cross-domain | Temporary notes toggle registration (or replace with domain-local sdk/register.ts) |
  ```

### FT-006: Separate server-only exports and clear Biome violations
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/index.ts, /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/hooks/use-notes.ts, /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/components/bulk-delete-dialog.tsx, /Users/jordanknight/substrate/071-pr-view/apps/web/app/(dashboard)/workspaces/[slug]/notes-overlay-wrapper.tsx
- **Issue**: The default barrel exposes server-only filesystem helpers beside client hooks/components, and the phase file set currently fails Biome.
- **Fix**: Move Node-backed exports to a server-only entrypoint, replace non-null assertions with guarded locals, remove `autoFocus`, then rerun Biome on the scoped file set.
- **Patch hint**:
  ```diff
  - export { appendNote, completeNote, deleteAll, deleteAllForTarget, deleteNote, editNote } from './lib/note-writer';
  - export { listFilesWithNotes, readNotes } from './lib/note-reader';
  + // index.ts stays client-safe
  + export * from './client';
  ```
  ```diff
  - <input ... autoFocus />
  + <input ref={inputRef} ... />
  + // focus the ref from Dialog lifecycle instead of autoFocus
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
