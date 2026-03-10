/**
 * INoteService Contract Tests
 *
 * Why: Proves fake/real parity for the File Notes service interface.
 * Contract: Both FakeNoteService and JsonlNoteService must pass all cases.
 * Usage Notes: Factory pattern — same tests run against both implementations.
 * Quality Contribution: Ensures any consumer can swap real/fake without behavior change.
 * Worked Example: addNote → listNotes → verify note returned with correct fields.
 *
 * Plan 071: PR View & File Notes — Phase 1
 */

import type { INoteService } from '@chainglass/shared/interfaces';
import { beforeEach, describe, expect, it } from 'vitest';

export type NoteServiceFactory = () => INoteService;

const WORKTREE = '/tmp/test-worktree';

export function noteServiceContractTests(name: string, factory: NoteServiceFactory): void {
  describe(`INoteService Contract: ${name}`, () => {
    let service: INoteService;

    beforeEach(() => {
      service = factory();
    });

    it('C01: addNote creates a retrievable note', async () => {
      /**
       * Why: Foundational — add/list round-trip is the core operation.
       * Contract: addNote returns ok with note, listNotes returns it.
       * Usage Notes: Both real and fake must satisfy this.
       * Quality Contribution: Anchor contract for all other tests.
       * Worked Example: addNote({file, 'a.ts', 'Review'}) → listNotes() → [note]
       */
      const result = await service.addNote(WORKTREE, {
        linkType: 'file',
        target: 'src/index.ts',
        content: 'Review this',
        author: 'human',
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.id).toBeDefined();
      expect(result.data.linkType).toBe('file');
      expect(result.data.target).toBe('src/index.ts');
      expect(result.data.content).toBe('Review this');
      expect(result.data.status).toBe('open');

      const list = await service.listNotes(WORKTREE);
      expect(list.ok).toBe(true);
      if (!list.ok) return;
      expect(list.data.length).toBeGreaterThanOrEqual(1);
      expect(list.data.some((n) => n.id === result.data.id)).toBe(true);
    });

    it('C02: editNote updates content', async () => {
      /**
       * Why: Verifies edit capability per OQ-3 resolution.
       * Contract: editNote returns updated note with new content.
       * Usage Notes: updatedAt must change; id must stay the same.
       * Quality Contribution: Proves edit contract for both implementations.
       * Worked Example: addNote → editNote({content: 'Revised'}) → verify content changed.
       */
      const added = await service.addNote(WORKTREE, {
        linkType: 'file',
        target: 'a.ts',
        content: 'Original',
        author: 'human',
      });
      if (!added.ok) throw new Error('addNote failed');

      const edited = await service.editNote(WORKTREE, added.data.id, { content: 'Revised' });
      expect(edited.ok).toBe(true);
      if (!edited.ok) return;
      expect(edited.data.content).toBe('Revised');
      expect(edited.data.id).toBe(added.data.id);
    });

    it('C03: completeNote marks note as complete', async () => {
      /**
       * Why: Core completion workflow for human/agent collaboration.
       * Contract: completeNote sets status='complete' and completedBy.
       * Usage Notes: Completion is idempotent — completing an already-complete note is fine.
       * Quality Contribution: Ensures completion tracking works identically.
       * Worked Example: addNote → completeNote('agent') → verify status + completedBy.
       */
      const added = await service.addNote(WORKTREE, {
        linkType: 'file',
        target: 'a.ts',
        content: 'Fix this',
        author: 'human',
      });
      if (!added.ok) throw new Error('addNote failed');

      const completed = await service.completeNote(WORKTREE, added.data.id, 'agent');
      expect(completed.ok).toBe(true);
      if (!completed.ok) return;
      expect(completed.data.status).toBe('complete');
      expect(completed.data.completedBy).toBe('agent');
    });

    it('C04: deleteNote removes a note', async () => {
      /**
       * Why: Verifies note deletion.
       * Contract: deleteNote returns ok, listNotes no longer contains it.
       * Usage Notes: Deleting non-existent note returns error.
       * Quality Contribution: Proves deletion contract.
       * Worked Example: addNote → deleteNote → listNotes → empty.
       */
      const added = await service.addNote(WORKTREE, {
        linkType: 'file',
        target: 'a.ts',
        content: 'Remove me',
        author: 'human',
      });
      if (!added.ok) throw new Error('addNote failed');

      const deleted = await service.deleteNote(WORKTREE, added.data.id);
      expect(deleted.ok).toBe(true);

      const list = await service.listNotes(WORKTREE);
      if (!list.ok) throw new Error('listNotes failed');
      expect(list.data.find((n) => n.id === added.data.id)).toBeUndefined();
    });

    it('C05: listNotes filters by linkType', async () => {
      /**
       * Why: Generic link-type system must be filterable per AC-38.
       * Contract: listNotes({linkType}) returns only matching notes.
       * Usage Notes: Unspecified filter returns all.
       * Quality Contribution: Proves filter contract for generic link types.
       * Worked Example: addNote(file) + addNote(workflow) → listNotes({linkType:'file'}) → [file note only].
       */
      await service.addNote(WORKTREE, {
        linkType: 'file',
        target: 'a.ts',
        content: 'File',
        author: 'human',
      });
      await service.addNote(WORKTREE, {
        linkType: 'workflow',
        target: 'wf-1',
        content: 'WF',
        author: 'human',
      });

      const files = await service.listNotes(WORKTREE, { linkType: 'file' });
      if (!files.ok) throw new Error('listNotes failed');
      expect(files.data).toHaveLength(1);
      expect(files.data[0].linkType).toBe('file');
    });

    it('C06: listFilesWithNotes returns unique targets', async () => {
      /**
       * Why: Tree decoration needs to know which files have notes.
       * Contract: Returns sorted unique targets with open notes.
       * Usage Notes: Completed notes may be excluded by default.
       * Quality Contribution: Proves indicator data contract.
       * Worked Example: addNote(a.ts) + addNote(b.ts) + addNote(a.ts) → ['a.ts', 'b.ts'].
       */
      await service.addNote(WORKTREE, {
        linkType: 'file',
        target: 'b.ts',
        content: 'B',
        author: 'human',
      });
      await service.addNote(WORKTREE, {
        linkType: 'file',
        target: 'a.ts',
        content: 'A',
        author: 'human',
      });
      await service.addNote(WORKTREE, {
        linkType: 'file',
        target: 'b.ts',
        content: 'B2',
        author: 'human',
      });

      const files = await service.listFilesWithNotes(WORKTREE);
      if (!files.ok) throw new Error('listFilesWithNotes failed');
      expect(files.data).toEqual(['a.ts', 'b.ts']);
    });

    it('C07: deleteAll clears all notes', async () => {
      /**
       * Why: Bulk delete needed for "Clear All Notes" with YEES confirmation.
       * Contract: deleteAll removes everything, listNotes returns empty.
       * Usage Notes: Returns ok even if already empty.
       * Quality Contribution: Proves bulk delete contract.
       * Worked Example: addNote × 3 → deleteAll → listNotes → [].
       */
      await service.addNote(WORKTREE, {
        linkType: 'file',
        target: 'a.ts',
        content: 'A',
        author: 'human',
      });
      await service.addNote(WORKTREE, {
        linkType: 'file',
        target: 'b.ts',
        content: 'B',
        author: 'human',
      });

      const deleted = await service.deleteAll(WORKTREE);
      expect(deleted.ok).toBe(true);

      const list = await service.listNotes(WORKTREE);
      if (!list.ok) throw new Error('listNotes failed');
      expect(list.data).toHaveLength(0);
    });

    it('C08: editNote on non-existent returns error', async () => {
      /**
       * Why: Error handling for invalid IDs.
       * Contract: editNote with bad ID returns { ok: false }.
       * Usage Notes: Should not throw.
       * Quality Contribution: Error path parity.
       * Worked Example: editNote('nonexistent') → { ok: false }.
       */
      const result = await service.editNote(WORKTREE, 'nonexistent', { content: 'Nope' });
      expect(result.ok).toBe(false);
    });

    it('C09: listFilesWithNotes excludes workflow and agent-run notes', async () => {
      /**
       * Why: listFilesWithNotes is for file tree decoration — must not return non-file targets.
       * Contract: Only notes with linkType 'file' appear in the result.
       * Usage Notes: Workflow/agent-run notes have their own listing mechanisms.
       * Quality Contribution: Prevents cross-link-type data leaks in file listings.
       * Worked Example: add file + workflow + agent-run notes → listFilesWithNotes → only file target.
       */
      await service.addNote(WORKTREE, {
        linkType: 'file',
        target: 'src/app.ts',
        content: 'File note',
        author: 'human',
      });
      await service.addNote(WORKTREE, {
        linkType: 'workflow',
        target: 'wf-123',
        content: 'Workflow note',
        author: 'human',
      });
      await service.addNote(WORKTREE, {
        linkType: 'agent-run',
        target: 'run-456',
        content: 'Agent run note',
        author: 'agent',
      });

      const files = await service.listFilesWithNotes(WORKTREE);
      if (!files.ok) throw new Error('listFilesWithNotes failed');
      expect(files.data).toEqual(['src/app.ts']);
    });
  });
}
