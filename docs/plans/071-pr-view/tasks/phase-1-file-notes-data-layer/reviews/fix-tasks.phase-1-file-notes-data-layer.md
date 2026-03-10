# Fix Tasks: Phase 1: File Notes Data Layer

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Enforce link-type-specific `targetMeta`
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/071-pr-view/packages/shared/src/file-notes/types.ts; /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/types.ts
- **Issue**: `targetMeta` is not derived from `linkType`, so invalid note metadata compiles and can be persisted.
- **Fix**: Replace the permissive `NoteTargetMeta` union with a discriminated union or generic keyed by `NoteLinkType`, then update `Note`, `CreateNoteInput`, and any affected callers/tests.
- **Patch hint**:
  ```diff
  -export type NoteTargetMeta =
  -  | { line?: number }
  -  | { nodeId?: string }
  -  | { runId?: string }
  -  | Record<string, unknown>;
  -
  -export interface Note {
  -  linkType: NoteLinkType;
  -  targetMeta?: NoteTargetMeta;
  -}
  +type FileNoteMeta = { line?: number };
  +type WorkflowNoteMeta = { nodeId?: string };
  +type AgentRunNoteMeta = { runId?: string };
  +
  +type FileNote = BaseNote<'file', FileNoteMeta>;
  +type WorkflowNote = BaseNote<'workflow', WorkflowNoteMeta>;
  +type AgentRunNote = BaseNote<'agent-run', AgentRunNoteMeta>;
  +
  +export type Note = FileNote | WorkflowNote | AgentRunNote;
  ```

### FT-002: Add `INoteService` parity tests (and a real implementation/factory)
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/071-pr-view/packages/shared/src/interfaces/note-service.interface.ts; /Users/jordanknight/substrate/071-pr-view/test/contracts/note-service.contract.ts; /Users/jordanknight/substrate/071-pr-view/test/contracts/note-service.contract.test.ts
- **Issue**: Phase 1 introduces a shared interface and fake, but no contract suite proves parity against a real JSONL-backed implementation.
- **Fix**: Add a JSONL-backed `INoteService` implementation or factory wrapper around the existing reader/writer functions, then create a parameterized contract test factory and runner for both fake and real implementations.
- **Patch hint**:
  ```diff
  +export type NoteServiceFactory = () => INoteService;
  +
  +export function noteServiceContractTests(name: string, factory: NoteServiceFactory): void {
  +  describe(`INoteService Contract: ${name}`, () => {
  +    it('C01: addNote persists retrievable notes', async () => {
  +      /* Test Doc: ... */
  +    });
  +    // add edit/complete/delete/list contract cases
  +  });
  +}
  +
  +noteServiceContractTests('FakeNoteService', () => new FakeNoteService());
  +noteServiceContractTests('JsonlNoteService', () => createJsonlNoteService(tmpDir));
  ```

### FT-003: Add API route validation and TDD coverage
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/071-pr-view/apps/web/app/api/file-notes/route.ts; new test files under /Users/jordanknight/substrate/071-pr-view/test/
- **Issue**: The route is untested and accepts unchecked enum/action values.
- **Fix**: Add runtime validation for `linkType`, `status`, `to`, `author`, `completedBy`, and PATCH `action`, then add route/integration tests for GET/POST/PATCH/DELETE success and failure cases.
- **Patch hint**:
  ```diff
  +function isNoteLinkType(value: unknown): value is NoteLinkType {
  +  return value === 'file' || value === 'workflow' || value === 'agent-run';
  +}
  +
  +if (!isNoteLinkType(input.linkType) || !isNoteAuthor(input.author)) {
  +  return NextResponse.json({ error: 'Invalid note payload' }, { status: 400 });
  +}
  +
  +if (action !== 'edit' && action !== 'complete') {
  +  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  +}
  ```

### FT-004: Bring domain-map.md up to date for `file-notes`
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/071-pr-view/docs/domains/domain-map.md
- **Issue**: The new domain is missing from the Mermaid topology and Domain Health Summary.
- **Fix**: Add the `file-notes` business-domain node, a labeled dependency on `_platform/auth`, and a health-summary row listing contracts, providers, and consumers.
- **Patch hint**:
  ```diff
  +    fileNotes["📝 file-notes<br/>INoteService<br/>NoteLinkType · NoteFilter<br/>FakeNoteService<br/>GET/POST/PATCH/DELETE /api/file-notes"]:::new
  +    fileNotes -->|"auth()<br/>requireAuth()"| auth
  ...
  +| file-notes | INoteService, NoteLinkType, NoteFilter, FakeNoteService, /api/file-notes | file-browser (future), CLI (future) | auth(), requireAuth() | auth | 🟠 New |
  ```

## Medium / Low Fixes

### FT-005: Surface read failures and clarify file-list semantics
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/lib/note-reader.ts; /Users/jordanknight/substrate/071-pr-view/docs/domains/file-notes/domain.md
- **Issue**: `readNotes()` hides non-ENOENT failures, and `listFilesWithNotes()` is implicitly open-only even though the broader contract wording suggests “all files with notes”.
- **Fix**: Only swallow ENOENT / malformed-line cases, and either rename `listFilesWithNotes()` to indicate open-note semantics or add a status/all-notes variant plus aligned documentation/tests.
- **Patch hint**:
  ```diff
  -  } catch {
  -    return [];
  +  } catch (error) {
  +    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
  +      return [];
  +    }
  +    throw error;
    }
  ...
  -export function listFilesWithNotes(worktreePath: string): string[] {
  -  const notes = readNotes(worktreePath, { status: 'open' });
  +export function listFilesWithNotes(worktreePath: string, filter?: Pick<NoteFilter, 'status'>): string[] {
  +  const notes = readNotes(worktreePath, filter);
  ```

### FT-006: Add per-test Test Docs and align phase artifacts
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/071-pr-view/test/unit/web/features/071-file-notes/note-reader.test.ts; /Users/jordanknight/substrate/071-pr-view/test/unit/web/features/071-file-notes/note-writer.test.ts; /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-plan.md; /Users/jordanknight/substrate/071-pr-view/docs/domains/file-notes/domain.md
- **Issue**: The current tests do not satisfy R-TEST-002/003, and the plan/domain artifacts overstate the implemented file set and concept coverage.
- **Fix**: Add 5-field Test Doc blocks inside every `it()` case, update the Domain Manifest for the shared file-notes type move plus shared/test file additions, and add explicit concept rows for `INoteService` and the shared file-notes contract surface.
- **Patch hint**:
  ```diff
   it('reads all notes newest-first', () => {
  +  /**
  +   * Test Doc:
  +   * - Why: ...
  +   * - Contract: ...
  +   * - Usage Notes: ...
  +   * - Quality Contribution: ...
  +   * - Worked Example: ...
  +   */
      appendNote(tmpDir, { linkType: 'file', target: 'a.ts', content: 'First', author: 'human' });
   });
  ```

### FT-007: Add the missing C4 component artifact for `file-notes`
- **Severity**: LOW
- **File(s)**: /Users/jordanknight/substrate/071-pr-view/docs/c4/components/file-notes.md; /Users/jordanknight/substrate/071-pr-view/docs/c4/README.md
- **Issue**: The repo’s C4 guidance requires a new domain’s L3 component doc and README navigation link in the same PR.
- **Fix**: Add the `file-notes` C4 component file with the required cross-reference and navigation sections, then link it from `docs/c4/README.md`.
- **Patch hint**:
  ```diff
  +## Business Domains
  +
  +- [File Notes](components/file-notes.md) — Shared note contracts, JSONL persistence, API surface
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
