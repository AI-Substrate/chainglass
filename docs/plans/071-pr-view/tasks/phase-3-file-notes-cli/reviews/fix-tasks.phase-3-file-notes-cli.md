# Fix Tasks: Phase 3: File Notes CLI

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Restrict file listings to file-linked notes only
- **Severity**: HIGH
- **File(s)**: `/Users/jordanknight/substrate/071-pr-view/packages/shared/src/file-notes/note-reader.ts`, `/Users/jordanknight/substrate/071-pr-view/packages/shared/src/fakes/fake-note-service.ts`, `/Users/jordanknight/substrate/071-pr-view/apps/cli/src/commands/notes.command.ts`, `/Users/jordanknight/substrate/071-pr-view/test/contracts/note-service.contract.ts`, `/Users/jordanknight/substrate/071-pr-view/test/unit/cli/notes-command.test.ts`, `/Users/jordanknight/substrate/071-pr-view/test/unit/web/features/071-file-notes/note-reader.test.ts`
- **Issue**: `listFilesWithNotes()` currently returns every open note target. Once workflow or agent-run notes exist, `cg notes files` and the shared file-listing APIs can report non-file targets as if they were file paths, which violates AC-30.
- **Fix**: Constrain file-listing behavior to `linkType: 'file'` in both the real and fake note-service paths, update the CLI count aggregation to use the same filter, and add mixed-link-type tests that prove workflow/agent-run notes do not appear in file listings.
- **Patch hint**:
  ```diff
  -const notes = readNotes(worktreePath, status ? { status } : undefined);
  +const notes = readNotes(worktreePath, {
  +  ...(status ? { status } : {}),
  +  linkType: 'file',
  +});
  
  -const listResult = await service.listNotes(worktreePath, { status: 'open' });
  +const listResult = await service.listNotes(worktreePath, {
  +  status: 'open',
  +  linkType: 'file',
  +});
  ```

## Medium / Low Fixes

### FT-002: Restore a runtime note-service DI seam and remove mock-based CLI tests
- **Severity**: MEDIUM
- **File(s)**: `/Users/jordanknight/substrate/071-pr-view/apps/cli/src/commands/notes.command.ts`, `/Users/jordanknight/substrate/071-pr-view/apps/cli/src/lib/container.ts`, `/Users/jordanknight/substrate/071-pr-view/packages/shared/src/di-tokens.ts`, `/Users/jordanknight/substrate/071-pr-view/test/unit/cli/notes-command.test.ts`, `/Users/jordanknight/substrate/071-pr-view/test/unit/cli/command-helpers.test.ts`
- **Issue**: The phase introduced `NOTE_SERVICE` but never exposes a runtime-resolved service seam. `notes.command.ts` constructs `JsonlNoteService` directly, leaving the token unused and forcing CLI tests into `vi.mock()` / `vi.spyOn()` despite the fake-only testing policy.
- **Fix**: Add a container-managed note-service factory/provider that accepts `worktreePath`, resolve through that seam inside `notes.command.ts`, and rewrite the CLI tests around fakes / explicit seams instead of module-level mocks and spies.
- **Patch hint**:
  ```diff
  +childContainer.register(NOTE_SERVICE_FACTORY, {
  +  useFactory: () => (worktreePath: string) => new JsonlNoteService(worktreePath),
  +});
  
  -service: new JsonlNoteService(context.worktreePath),
  +service: createNoteService(context.worktreePath),
  
  -vi.mock('@chainglass/shared/file-notes', ...)
  +const fakeNoteService = new FakeNoteService();
  +const createNoteService = () => fakeNoteService;
  ```

### FT-003: Record a verification command that actually covers the Phase 3 CLI surface
- **Severity**: MEDIUM
- **File(s)**: `/Users/jordanknight/substrate/071-pr-view/justfile`, `/Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-3-file-notes-cli/tasks.md`, `/Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-3-file-notes-cli/execution.log.md`
- **Issue**: `just test-feature 071` only runs tests whose path contains `071`, so it misses `test/unit/cli/notes-command.test.ts` and `test/contracts/note-service.contract.test.ts`. The phase evidence therefore overstates coverage.
- **Fix**: Either rename/move the tests so the plan-scoped command includes them, or document/run an explicit CLI+contract test command in the task dossier and execution log.
- **Patch hint**:
  ```diff
  - just test-feature 071
  + pnpm vitest run \\
  +   test/unit/cli/notes-command.test.ts \\
  +   test/unit/cli/command-helpers.test.ts \\
  +   test/contracts/note-service.contract.test.ts
  + pnpm vitest run \\
  +   test/unit/web/features/071-file-notes/note-reader.test.ts \\
  +   test/unit/web/features/071-file-notes/note-writer.test.ts
  ```

### FT-004: Sync file-notes architecture docs with the shipped CLI integration
- **Severity**: LOW
- **File(s)**: `/Users/jordanknight/substrate/071-pr-view/docs/domains/domain-map.md`, `/Users/jordanknight/substrate/071-pr-view/docs/c4/components/file-notes.md`
- **Issue**: The domain-map health summary still labels CLI as a future consumer, and the file-notes C4 component diagram omits the Phase 3 shared adapter / CLI command pieces.
- **Fix**: Update the health summary row and C4 component diagram so they match the current domain composition and consumer list.
- **Patch hint**:
  ```diff
  -| file-notes | ... | file-browser (future), CLI (future), pr-view (future) | ... |
  +| file-notes | ... | file-browser (future), CLI, pr-view (future) | ... |
  
  +Component(jsonlService, "JsonlNoteService", "Shared Adapter", "Wraps shared reader/writer into INoteService")
  +Component(notesCli, "Notes CLI Commands", "Commander Adapter", "Implements cg notes list/files/add/complete")
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
