/**
 * File Notes Reader — JSONL file reader with filtering.
 *
 * Pure function — no class, no DI, no state.
 * Returns notes newest-first by default.
 * Shared by both web and CLI.
 *
 * Plan 071: PR View & File Notes — Phase 3 (moved from apps/web)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Note, NoteFilter } from './types.js';
import { NOTES_DIR, NOTES_FILE } from './types.js';

/**
 * Read notes from the per-worktree JSONL file with optional filtering.
 * Returns notes newest-first. Skips malformed lines gracefully.
 * Returns [] if file doesn't exist.
 */
export function readNotes(worktreePath: string, filter?: NoteFilter): Note[] {
  const filePath = path.join(worktreePath, NOTES_DIR, NOTES_FILE);

  if (!fs.existsSync(filePath)) return [];

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const notes: Note[] = [];

    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        const note: Note = JSON.parse(line);
        if (!note.id || !note.linkType || !note.target || !note.content) continue;

        if (filter?.linkType && note.linkType !== filter.linkType) continue;
        if (filter?.target && note.target !== filter.target) continue;
        if (filter?.status && note.status !== filter.status) continue;
        if (filter?.to && note.to !== filter.to) continue;
        if (filter?.threadId && note.threadId !== filter.threadId) continue;

        notes.push(note);
      } catch {
        // skip malformed line
      }
    }

    return notes.reverse();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * List unique targets (file paths, workflow IDs, etc.) that have notes.
 * Defaults to open notes only. Pass { status: undefined } for all notes.
 */
export function listFilesWithNotes(
  worktreePath: string,
  filter?: Pick<NoteFilter, 'status'>
): string[] {
  const status = filter?.status ?? 'open';
  const notes = readNotes(worktreePath, {
    ...(status ? { status } : {}),
    linkType: 'file',
  });
  const targets = new Set(notes.map((n) => n.target));
  return [...targets].sort();
}

/** File path with existence check result (DYK-05 Phase 7) */
export interface FileWithExistence {
  path: string;
  exists: boolean;
}

/**
 * List unique file targets that have notes, with existence check.
 * Returns each file path and whether it still exists in the worktree.
 * Defaults to open notes only.
 */
export function listFilesWithNotesDetailed(
  worktreePath: string,
  filter?: Pick<NoteFilter, 'status'>
): FileWithExistence[] {
  const files = listFilesWithNotes(worktreePath, filter);
  return files.map((filePath) => ({
    path: filePath,
    exists: fs.existsSync(path.join(worktreePath, filePath)),
  }));
}
