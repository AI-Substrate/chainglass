'use server';

/**
 * File Notes Server Actions
 *
 * Server actions callable from client components for note CRUD.
 * Delegates to note-writer/reader service functions.
 *
 * Plan 071: PR View & File Notes — Phase 1
 */

import { requireAuth } from '@/features/063-login/lib/require-auth';
import type {
  CreateNoteInput,
  EditNoteInput,
  Note,
  NoteFilter,
  NoteResult,
} from '@chainglass/shared/file-notes';
import {
  appendNote,
  completeNote as completeNoteWriter,
  deleteAllForTarget as deleteAllForTargetWriter,
  deleteAll as deleteAllWriter,
  deleteNote as deleteNoteWriter,
  editNote as editNoteWriter,
} from '@chainglass/shared/file-notes';
import { listFilesWithNotes, readNotes } from '@chainglass/shared/file-notes';

export async function addNote(
  worktreePath: string,
  input: CreateNoteInput
): Promise<NoteResult<Note>> {
  await requireAuth();
  try {
    const note = appendNote(worktreePath, input);
    return { ok: true, data: note };
  } catch (error) {
    return { ok: false, error: `Failed to add note: ${error}` };
  }
}

export async function editNote(
  worktreePath: string,
  noteId: string,
  input: EditNoteInput
): Promise<NoteResult<Note>> {
  await requireAuth();
  try {
    const note = editNoteWriter(worktreePath, noteId, input);
    if (!note) return { ok: false, error: 'Note not found' };
    return { ok: true, data: note };
  } catch (error) {
    return { ok: false, error: `Failed to edit note: ${error}` };
  }
}

export async function completeNote(
  worktreePath: string,
  noteId: string,
  completedBy: 'human' | 'agent'
): Promise<NoteResult<Note>> {
  await requireAuth();
  try {
    const note = completeNoteWriter(worktreePath, noteId, completedBy);
    if (!note) return { ok: false, error: 'Note not found' };
    return { ok: true, data: note };
  } catch (error) {
    return { ok: false, error: `Failed to complete note: ${error}` };
  }
}

export async function deleteNotes(
  worktreePath: string,
  options: { noteId?: string; target?: string; scope?: 'all' }
): Promise<NoteResult<{ deleted: number }>> {
  await requireAuth();
  try {
    if (options.scope === 'all') {
      const count = deleteAllWriter(worktreePath);
      return { ok: true, data: { deleted: count } };
    }
    if (options.target) {
      const count = deleteAllForTargetWriter(worktreePath, options.target);
      return { ok: true, data: { deleted: count } };
    }
    if (options.noteId) {
      const success = deleteNoteWriter(worktreePath, options.noteId);
      if (!success) return { ok: false, error: 'Note not found' };
      return { ok: true, data: { deleted: 1 } };
    }
    return { ok: false, error: 'Missing noteId, target, or scope' };
  } catch (error) {
    return { ok: false, error: `Failed to delete note(s): ${error}` };
  }
}

export async function fetchNotes(
  worktreePath: string,
  filter?: NoteFilter
): Promise<NoteResult<Note[]>> {
  await requireAuth();
  try {
    const notes = readNotes(worktreePath, filter);
    return { ok: true, data: notes };
  } catch (error) {
    return { ok: false, error: `Failed to read notes: ${error}` };
  }
}

export async function fetchFilesWithNotes(worktreePath: string): Promise<NoteResult<string[]>> {
  await requireAuth();
  try {
    const files = listFilesWithNotes(worktreePath);
    return { ok: true, data: files };
  } catch (error) {
    return { ok: false, error: `Failed to list files with notes: ${error}` };
  }
}
