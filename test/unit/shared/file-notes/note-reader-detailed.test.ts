/**
 * listFilesWithNotesDetailed — file existence metadata tests
 *
 * Why: Phase 7 FT-004 — deleted-file detection must correctly report
 *      existence for files with notes.
 * Contract: listFilesWithNotesDetailed returns { path, exists } for each
 *           unique file target with open notes.
 * Usage: Called by notes-overlay-panel to show "Deleted" badge.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { appendNote, listFilesWithNotesDetailed } from '@chainglass/shared/file-notes';

describe('listFilesWithNotesDetailed', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-detailed-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns exists: true for files that exist in the worktree', () => {
    const filePath = 'src/live.ts';
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, filePath), 'export {}');

    appendNote(tmpDir, {
      linkType: 'file',
      target: filePath,
      content: 'test note',
      author: 'human',
    });

    const result = listFilesWithNotesDetailed(tmpDir);
    expect(result).toEqual([{ path: filePath, exists: true }]);
  });

  it('returns exists: false for files that do not exist in the worktree', () => {
    const filePath = 'src/deleted.ts';

    appendNote(tmpDir, {
      linkType: 'file',
      target: filePath,
      content: 'note on deleted file',
      author: 'human',
    });

    const result = listFilesWithNotesDetailed(tmpDir);
    expect(result).toEqual([{ path: filePath, exists: false }]);
  });

  it('handles a mix of existing and deleted files', () => {
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src/live.ts'), 'export {}');

    appendNote(tmpDir, {
      linkType: 'file',
      target: 'src/live.ts',
      content: 'note on live file',
      author: 'human',
    });

    appendNote(tmpDir, {
      linkType: 'file',
      target: 'src/deleted.ts',
      content: 'note on deleted file',
      author: 'human',
    });

    const result = listFilesWithNotesDetailed(tmpDir);
    expect(result).toEqual([
      { path: 'src/deleted.ts', exists: false },
      { path: 'src/live.ts', exists: true },
    ]);
  });

  it('returns empty array when no notes exist', () => {
    const result = listFilesWithNotesDetailed(tmpDir);
    expect(result).toEqual([]);
  });

  it('only includes open notes by default', () => {
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src/open.ts'), '');

    appendNote(tmpDir, {
      linkType: 'file',
      target: 'src/open.ts',
      content: 'open note',
      author: 'human',
    });

    const notesDir = path.join(tmpDir, '.chainglass', 'data');
    const notesFile = path.join(notesDir, 'notes.jsonl');
    const completedNote = JSON.stringify({
      id: 'completed-1',
      linkType: 'file',
      target: 'src/completed.ts',
      content: 'completed note',
      status: 'complete',
      author: 'human',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    fs.appendFileSync(notesFile, `${completedNote}\n`);

    const result = listFilesWithNotesDetailed(tmpDir);
    expect(result).toEqual([{ path: 'src/open.ts', exists: true }]);
  });
});
