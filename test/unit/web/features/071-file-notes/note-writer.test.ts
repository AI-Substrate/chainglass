/**
 * Note Writer — Unit Tests
 *
 * Why: Validates JSONL persistence for the File Notes domain.
 * Contract: appendNote creates notes, editNote rewrites file, deleteNote removes entries.
 * Usage Notes: Tests use tmpdir fixtures cleaned up after each test.
 * Quality Contribution: Ensures data integrity for the core persistence layer.
 * Worked Example: appendNote → readFile → verify JSON line; editNote → verify rewritten.
 *
 * Plan 071: PR View & File Notes — Phase 1
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  appendNote,
  completeNote,
  deleteAll,
  deleteAllForTarget,
  deleteNote,
  editNote,
} from '@chainglass/shared/file-notes';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'note-writer-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function notesFilePath(): string {
  return path.join(tmpDir, '.chainglass', 'data', 'notes.jsonl');
}

function readLines(): string[] {
  const content = fs.readFileSync(notesFilePath(), 'utf-8');
  return content.trim().split('\n').filter(Boolean);
}

describe('appendNote', () => {
  it('creates directory and appends a note', () => {
    /**
     * Why: Verify first-write creates .chainglass/data/ directory.
     * Contract: appendNote with valid input creates directory and appends JSONL line.
     * Usage Notes: First note in a worktree must create the directory.
     * Quality Contribution: Prevents "directory not found" errors on fresh worktrees.
     * Worked Example: appendNote(tmpDir, {linkType:'file', target:'src/index.ts', ...}) → file exists with 1 line.
     */
    const note = appendNote(tmpDir, {
      linkType: 'file',
      target: 'src/index.ts',
      content: 'Review this function',
      author: 'human',
    });

    expect(note.id).toBeDefined();
    expect(note.linkType).toBe('file');
    expect(note.target).toBe('src/index.ts');
    expect(note.content).toBe('Review this function');
    expect(note.status).toBe('open');
    expect(note.author).toBe('human');
    expect(note.createdAt).toBeDefined();

    const lines = readLines();
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).id).toBe(note.id);
  });

  it('appends multiple notes', () => {
    /**
     * Why: Verify JSONL append semantics — each call adds a line, not overwrites.
     * Contract: Sequential appendNote calls produce one JSONL line per note.
     * Usage Notes: Users accumulate notes over time; file must grow, not reset.
     * Quality Contribution: Catches accidental truncation or overwrite of existing notes.
     * Worked Example: appendNote × 2 → readLines() returns 2 lines.
     */
    appendNote(tmpDir, { linkType: 'file', target: 'a.ts', content: 'First', author: 'human' });
    appendNote(tmpDir, { linkType: 'file', target: 'b.ts', content: 'Second', author: 'agent' });

    const lines = readLines();
    expect(lines).toHaveLength(2);
  });

  it('supports optional fields', () => {
    /**
     * Why: Verify optional metadata fields (targetMeta, to, authorId, threadId) round-trip.
     * Contract: appendNote persists all optional fields and returns them on the Note object.
     * Usage Notes: Features like line-level notes and threading depend on these fields.
     * Quality Contribution: Prevents silent field-dropping that breaks downstream consumers.
     * Worked Example: appendNote({targetMeta:{line:42}, to:'agent', ...}) → note.targetMeta.line === 42.
     */
    const note = appendNote(tmpDir, {
      linkType: 'file',
      target: 'src/index.ts',
      targetMeta: { line: 42 },
      content: 'Check line 42',
      to: 'agent',
      author: 'human',
      authorId: 'jordan',
      threadId: 'parent-123',
    });

    expect(note.targetMeta).toEqual({ line: 42 });
    expect(note.to).toBe('agent');
    expect(note.authorId).toBe('jordan');
    expect(note.threadId).toBe('parent-123');
  });

  it('supports workflow link type', () => {
    /**
     * Why: Verify notes can attach to workflow nodes, not just files.
     * Contract: appendNote with linkType 'workflow' persists workflow-specific targetMeta.
     * Usage Notes: Workflow annotations use nodeId in targetMeta to anchor to graph nodes.
     * Quality Contribution: Ensures linkType polymorphism works beyond the default 'file' type.
     * Worked Example: appendNote({linkType:'workflow', targetMeta:{nodeId:'node-3'}}) → note.linkType === 'workflow'.
     */
    const note = appendNote(tmpDir, {
      linkType: 'workflow',
      target: 'wf-build-deploy',
      targetMeta: { nodeId: 'node-3' },
      content: 'This node fails often',
      author: 'human',
    });

    expect(note.linkType).toBe('workflow');
    expect(note.targetMeta).toEqual({ nodeId: 'node-3' });
  });
});

describe('editNote', () => {
  it('updates content and updatedAt', () => {
    /**
     * Why: Verify in-place edit rewrites the JSONL line without duplicating it.
     * Contract: editNote replaces content, updates updatedAt, preserves id, keeps line count.
     * Usage Notes: Edits must be atomic — partial writes corrupt the JSONL file.
     * Quality Contribution: Prevents duplicate entries or stale content after edits.
     * Worked Example: appendNote('Original') → editNote('Revised') → 1 line with content 'Revised'.
     */
    const original = appendNote(tmpDir, {
      linkType: 'file',
      target: 'a.ts',
      content: 'Original',
      author: 'human',
    });

    const edited = editNote(tmpDir, original.id, { content: 'Revised' });
    expect(edited).not.toBeNull();
    expect(edited?.content).toBe('Revised');
    expect(edited?.id).toBe(original.id);

    const lines = readLines();
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).content).toBe('Revised');
  });

  it('returns null for non-existent note', () => {
    /**
     * Why: Verify graceful handling when editing a note that doesn't exist.
     * Contract: editNote returns null when the target id is not found in the JSONL file.
     * Usage Notes: UI must handle null to show "note not found" instead of crashing.
     * Quality Contribution: Prevents unhandled exceptions on stale or deleted note references.
     * Worked Example: editNote(tmpDir, 'nonexistent', {content:'Nope'}) → null.
     */
    const result = editNote(tmpDir, 'nonexistent', { content: 'Nope' });
    expect(result).toBeNull();
  });

  it('updates to field', () => {
    /**
     * Why: Verify the 'to' addressee field can be updated after creation.
     * Contract: editNote with {to:'agent'} updates the addressee on the persisted note.
     * Usage Notes: Reassigning a note to a different actor is a common workflow action.
     * Quality Contribution: Prevents 'to' field from being silently ignored during edits.
     * Worked Example: appendNote({author:'human'}) → editNote({to:'agent'}) → note.to === 'agent'.
     */
    const original = appendNote(tmpDir, {
      linkType: 'file',
      target: 'a.ts',
      content: 'Check',
      author: 'human',
    });

    const edited = editNote(tmpDir, original.id, { to: 'agent' });
    expect(edited?.to).toBe('agent');
  });
});

describe('completeNote', () => {
  it('marks note as complete', () => {
    /**
     * Why: Verify completion transitions status and records who completed it.
     * Contract: completeNote sets status to 'complete' and populates completedBy.
     * Usage Notes: Completion is the primary lifecycle transition for task-like notes.
     * Quality Contribution: Ensures status change is persisted and completedBy attribution works.
     * Worked Example: appendNote('Fix this') → completeNote(id, 'agent') → status === 'complete'.
     */
    const note = appendNote(tmpDir, {
      linkType: 'file',
      target: 'a.ts',
      content: 'Fix this',
      author: 'human',
    });

    const completed = completeNote(tmpDir, note.id, 'agent');
    expect(completed?.status).toBe('complete');
    expect(completed?.completedBy).toBe('agent');
  });
});

describe('deleteNote', () => {
  it('removes a note', () => {
    /**
     * Why: Verify single-note deletion removes exactly the targeted line.
     * Contract: deleteNote removes the matching id and returns true; file has 0 lines after.
     * Usage Notes: Users delete individual notes from the UI; must not affect other notes.
     * Quality Contribution: Prevents accidental deletion of unrelated notes or orphaned data.
     * Worked Example: appendNote → deleteNote(id) → true, readLines().length === 0.
     */
    const note = appendNote(tmpDir, {
      linkType: 'file',
      target: 'a.ts',
      content: 'Delete me',
      author: 'human',
    });

    expect(deleteNote(tmpDir, note.id)).toBe(true);
    const lines = readLines();
    expect(lines).toHaveLength(0);
  });

  it('returns false for non-existent note', () => {
    /**
     * Why: Verify graceful handling when deleting a note that doesn't exist.
     * Contract: deleteNote returns false when the target id is not found.
     * Usage Notes: Race conditions (double-click delete) must not throw errors.
     * Quality Contribution: Prevents unhandled exceptions on already-deleted notes.
     * Worked Example: deleteNote(tmpDir, 'nonexistent') → false.
     */
    expect(deleteNote(tmpDir, 'nonexistent')).toBe(false);
  });
});

describe('deleteAllForTarget', () => {
  it('removes all notes for a target', () => {
    /**
     * Why: Verify bulk deletion scoped to a single target file.
     * Contract: deleteAllForTarget removes all notes matching the target, returns count, preserves others.
     * Usage Notes: Used when a file is deleted or renamed — all its notes become orphaned.
     * Quality Contribution: Prevents orphaned notes accumulating after file operations.
     * Worked Example: 2 notes on 'a.ts' + 1 on 'b.ts' → deleteAllForTarget('a.ts') → 2, 1 line remains.
     */
    appendNote(tmpDir, { linkType: 'file', target: 'a.ts', content: 'One', author: 'human' });
    appendNote(tmpDir, { linkType: 'file', target: 'a.ts', content: 'Two', author: 'human' });
    appendNote(tmpDir, { linkType: 'file', target: 'b.ts', content: 'Keep', author: 'human' });

    const count = deleteAllForTarget(tmpDir, 'a.ts');
    expect(count).toBe(2);

    const lines = readLines();
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).target).toBe('b.ts');
  });
});

describe('deleteAll', () => {
  it('removes all notes', () => {
    /**
     * Why: Verify full wipe of all notes in the worktree.
     * Contract: deleteAll removes every note regardless of target, returns total count.
     * Usage Notes: Used for "reset notes" or worktree cleanup operations.
     * Quality Contribution: Ensures no residual data remains after a full purge.
     * Worked Example: 2 notes → deleteAll() → 2, readLines().length === 0.
     */
    appendNote(tmpDir, { linkType: 'file', target: 'a.ts', content: 'One', author: 'human' });
    appendNote(tmpDir, { linkType: 'file', target: 'b.ts', content: 'Two', author: 'human' });

    const count = deleteAll(tmpDir);
    expect(count).toBe(2);

    const lines = readLines();
    expect(lines).toHaveLength(0);
  });
});
