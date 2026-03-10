/**
 * Note Reader — Unit Tests
 *
 * Why: Validates JSONL reading and filtering for the File Notes domain.
 * Contract: readNotes parses JSONL, applies filters, returns newest-first.
 * Usage Notes: Tests use tmpdir fixtures with pre-written JSONL.
 * Quality Contribution: Ensures correct filtering and graceful error handling.
 * Worked Example: Write JSONL → readNotes with filter → verify filtered results.
 *
 * Plan 071: PR View & File Notes — Phase 1
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { appendNote } from '@chainglass/shared/file-notes';
import { listFilesWithNotes, readNotes } from '@chainglass/shared/file-notes';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'note-reader-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function notesFilePath(): string {
  return path.join(tmpDir, '.chainglass', 'data', 'notes.jsonl');
}

describe('readNotes', () => {
  it('returns empty array when file does not exist', () => {
    /**
     * Why: Verify graceful behavior on a fresh worktree with no notes file.
     * Contract: readNotes returns [] when the JSONL file does not exist.
     * Usage Notes: Every worktree starts without a notes file; readers must not throw.
     * Quality Contribution: Prevents ENOENT crashes on first load of the notes panel.
     * Worked Example: readNotes(emptyTmpDir) → [].
     */
    expect(readNotes(tmpDir)).toEqual([]);
  });

  it('reads all notes newest-first', () => {
    /**
     * Why: Verify default sort order is reverse-chronological (newest first).
     * Contract: readNotes without filters returns all notes ordered by createdAt descending.
     * Usage Notes: UI displays latest notes at the top; sort order must be stable.
     * Quality Contribution: Prevents confusing display order when users expect recent notes first.
     * Worked Example: append('First') then append('Second') → readNotes()[0].content === 'Second'.
     */
    appendNote(tmpDir, { linkType: 'file', target: 'a.ts', content: 'First', author: 'human' });
    appendNote(tmpDir, { linkType: 'file', target: 'b.ts', content: 'Second', author: 'human' });

    const notes = readNotes(tmpDir);
    expect(notes).toHaveLength(2);
    expect(notes[0].content).toBe('Second');
    expect(notes[1].content).toBe('First');
  });

  it('filters by linkType', () => {
    /**
     * Why: Verify linkType filter isolates file notes from workflow notes.
     * Contract: readNotes({linkType:'file'}) returns only notes with matching linkType.
     * Usage Notes: File browser and workflow views each show only their own note type.
     * Quality Contribution: Prevents workflow notes leaking into the file notes panel.
     * Worked Example: 1 file + 1 workflow note → readNotes({linkType:'file'}) → 1 result.
     */
    appendNote(tmpDir, { linkType: 'file', target: 'a.ts', content: 'File note', author: 'human' });
    appendNote(tmpDir, {
      linkType: 'workflow',
      target: 'wf-1',
      content: 'WF note',
      author: 'human',
    });

    const notes = readNotes(tmpDir, { linkType: 'file' });
    expect(notes).toHaveLength(1);
    expect(notes[0].linkType).toBe('file');
  });

  it('filters by target', () => {
    /**
     * Why: Verify target filter scopes results to a single file path.
     * Contract: readNotes({target:'a.ts'}) returns only notes attached to that target.
     * Usage Notes: File-level note panels filter by the currently viewed file.
     * Quality Contribution: Prevents notes for other files appearing in the wrong panel.
     * Worked Example: Notes on 'a.ts' and 'b.ts' → readNotes({target:'a.ts'}) → 1 result.
     */
    appendNote(tmpDir, { linkType: 'file', target: 'a.ts', content: 'A', author: 'human' });
    appendNote(tmpDir, { linkType: 'file', target: 'b.ts', content: 'B', author: 'human' });

    const notes = readNotes(tmpDir, { target: 'a.ts' });
    expect(notes).toHaveLength(1);
    expect(notes[0].target).toBe('a.ts');
  });

  it('filters by status', () => {
    /**
     * Why: Verify status filter distinguishes open from complete notes.
     * Contract: readNotes({status:'open'}) excludes completed notes.
     * Usage Notes: Default view shows open notes; completed notes are hidden unless toggled.
     * Quality Contribution: Prevents resolved notes cluttering the active notes list.
     * Worked Example: 1 complete + 1 open → readNotes({status:'open'}) → 1 result ('Also open').
     */
    const note = appendNote(tmpDir, {
      linkType: 'file',
      target: 'a.ts',
      content: 'Open',
      author: 'human',
    });
    appendNote(tmpDir, { linkType: 'file', target: 'b.ts', content: 'Also open', author: 'human' });

    // Manually mark one as complete in the JSONL
    const filePath = notesFilePath();
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n');
    const first = JSON.parse(lines[0]);
    first.status = 'complete';
    lines[0] = JSON.stringify(first);
    fs.writeFileSync(filePath, `${lines.join('\n')}\n`);

    const openNotes = readNotes(tmpDir, { status: 'open' });
    expect(openNotes).toHaveLength(1);
    expect(openNotes[0].content).toBe('Also open');
  });

  it('filters by addressee', () => {
    /**
     * Why: Verify 'to' filter isolates notes addressed to a specific actor.
     * Contract: readNotes({to:'agent'}) returns only notes where to === 'agent'.
     * Usage Notes: Agent inbox shows only notes addressed to it; human sees theirs.
     * Quality Contribution: Prevents cross-actor note leakage in filtered views.
     * Worked Example: Notes to 'human', 'agent', and unaddressed → filter to:'agent' → 1 result.
     */
    appendNote(tmpDir, {
      linkType: 'file',
      target: 'a.ts',
      content: 'To human',
      to: 'human',
      author: 'agent',
    });
    appendNote(tmpDir, {
      linkType: 'file',
      target: 'b.ts',
      content: 'To agent',
      to: 'agent',
      author: 'human',
    });
    appendNote(tmpDir, { linkType: 'file', target: 'c.ts', content: 'To anyone', author: 'human' });

    const agentNotes = readNotes(tmpDir, { to: 'agent' });
    expect(agentNotes).toHaveLength(1);
    expect(agentNotes[0].content).toBe('To agent');
  });

  it('skips malformed lines', () => {
    /**
     * Why: Verify the reader is resilient to corrupted JSONL lines.
     * Contract: readNotes silently skips unparseable lines and returns valid notes.
     * Usage Notes: Manual edits or partial writes can leave invalid JSON in the file.
     * Quality Contribution: Prevents one bad line from breaking the entire notes panel.
     * Worked Example: 'not json\n{valid}' → readNotes() → 1 valid note returned.
     */
    const filePath = notesFilePath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      'not json\n{"id":"1","linkType":"file","target":"a.ts","content":"Good","status":"open","author":"human","createdAt":"2026-01-01","updatedAt":"2026-01-01"}\n'
    );

    const notes = readNotes(tmpDir);
    expect(notes).toHaveLength(1);
    expect(notes[0].content).toBe('Good');
  });

  it('skips entries missing required fields', () => {
    /**
     * Why: Verify the reader rejects structurally valid JSON missing required Note fields.
     * Contract: readNotes skips entries without id/linkType/target/content/status and returns the rest.
     * Usage Notes: Schema evolution or manual edits may produce partial objects.
     * Quality Contribution: Prevents runtime errors from incomplete Note objects reaching UI components.
     * Worked Example: {id:'1'} + {full valid note} → readNotes() → 1 result.
     */
    const filePath = notesFilePath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      '{"id":"1"}\n{"id":"2","linkType":"file","target":"a.ts","content":"Valid","status":"open","author":"human","createdAt":"2026-01-01","updatedAt":"2026-01-01"}\n'
    );

    const notes = readNotes(tmpDir);
    expect(notes).toHaveLength(1);
  });
});

describe('listFilesWithNotes', () => {
  it('returns sorted unique targets with open notes', () => {
    /**
     * Why: Verify file listing deduplicates and sorts targets alphabetically.
     * Contract: listFilesWithNotes returns sorted unique target paths with open notes.
     * Usage Notes: File browser badges use this to show which files have active notes.
     * Quality Contribution: Prevents duplicate entries or unstable ordering in the file list.
     * Worked Example: Notes on 'b.ts', 'a.ts', 'b.ts' → listFilesWithNotes() → ['a.ts', 'b.ts'].
     */
    appendNote(tmpDir, { linkType: 'file', target: 'b.ts', content: 'B', author: 'human' });
    appendNote(tmpDir, { linkType: 'file', target: 'a.ts', content: 'A', author: 'human' });
    appendNote(tmpDir, { linkType: 'file', target: 'b.ts', content: 'B again', author: 'human' });

    const files = listFilesWithNotes(tmpDir);
    expect(files).toEqual(['a.ts', 'b.ts']);
  });

  it('returns empty when no notes exist', () => {
    /**
     * Why: Verify file listing handles empty worktree without errors.
     * Contract: listFilesWithNotes returns [] when no notes file exists.
     * Usage Notes: Fresh worktrees have no notes; badge counts must show zero, not crash.
     * Quality Contribution: Prevents ENOENT errors in the file browser badge renderer.
     * Worked Example: listFilesWithNotes(emptyTmpDir) → [].
     */
    expect(listFilesWithNotes(tmpDir)).toEqual([]);
  });
});
