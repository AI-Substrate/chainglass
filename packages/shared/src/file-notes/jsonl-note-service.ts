/**
 * JSONL-backed INoteService implementation.
 *
 * Wraps the pure writer/reader functions into the INoteService interface
 * for contract test parity with FakeNoteService.
 * Shared by both web and CLI.
 *
 * Plan 071: PR View & File Notes — Phase 3 (moved from apps/web)
 */

import type { INoteService } from '../interfaces/note-service.interface.js';
import { listFilesWithNotes as listFilesWithNotesReader, readNotes } from './note-reader.js';
import {
  appendNote,
  completeNote as completeNoteWriter,
  deleteAllForTarget as deleteAllForTargetWriter,
  deleteAll as deleteAllWriter,
  deleteNote as deleteNoteWriter,
  editNote as editNoteWriter,
} from './note-writer.js';
import type { CreateNoteInput, EditNoteInput, Note, NoteFilter, NoteResult } from './types.js';

export class JsonlNoteService implements INoteService {
  constructor(private readonly worktreePath: string) {}

  async addNote(_worktreePath: string, input: CreateNoteInput): Promise<NoteResult<Note>> {
    try {
      const note = appendNote(this.worktreePath, input);
      return { ok: true, data: note };
    } catch (error) {
      return { ok: false, error: `${error}` };
    }
  }

  async editNote(
    _worktreePath: string,
    noteId: string,
    input: EditNoteInput
  ): Promise<NoteResult<Note>> {
    try {
      const note = editNoteWriter(this.worktreePath, noteId, input);
      if (!note) return { ok: false, error: 'Note not found' };
      return { ok: true, data: note };
    } catch (error) {
      return { ok: false, error: `${error}` };
    }
  }

  async completeNote(
    _worktreePath: string,
    noteId: string,
    completedBy: 'human' | 'agent'
  ): Promise<NoteResult<Note>> {
    try {
      const note = completeNoteWriter(this.worktreePath, noteId, completedBy);
      if (!note) return { ok: false, error: 'Note not found' };
      return { ok: true, data: note };
    } catch (error) {
      return { ok: false, error: `${error}` };
    }
  }

  async deleteNote(_worktreePath: string, noteId: string): Promise<NoteResult> {
    try {
      const success = deleteNoteWriter(this.worktreePath, noteId);
      if (!success) return { ok: false, error: 'Note not found' };
      return { ok: true, data: undefined };
    } catch (error) {
      return { ok: false, error: `${error}` };
    }
  }

  async listNotes(_worktreePath: string, filter?: NoteFilter): Promise<NoteResult<Note[]>> {
    try {
      const notes = readNotes(this.worktreePath, filter);
      return { ok: true, data: notes };
    } catch (error) {
      return { ok: false, error: `${error}` };
    }
  }

  async listFilesWithNotes(_worktreePath: string): Promise<NoteResult<string[]>> {
    try {
      const files = listFilesWithNotesReader(this.worktreePath);
      return { ok: true, data: files };
    } catch (error) {
      return { ok: false, error: `${error}` };
    }
  }

  async deleteAllForTarget(_worktreePath: string, target: string): Promise<NoteResult> {
    try {
      deleteAllForTargetWriter(this.worktreePath, target);
      return { ok: true, data: undefined };
    } catch (error) {
      return { ok: false, error: `${error}` };
    }
  }

  async deleteAll(_worktreePath: string): Promise<NoteResult> {
    try {
      deleteAllWriter(this.worktreePath);
      return { ok: true, data: undefined };
    } catch (error) {
      return { ok: false, error: `${error}` };
    }
  }
}
