/**
 * FakeNoteService — In-memory test double for INoteService
 *
 * Used in contract tests and consumer tests.
 * Imports ONLY from @chainglass/shared interfaces and types.
 *
 * Plan 071: PR View & File Notes — Phase 1
 */

import type {
  CreateNoteInput,
  EditNoteInput,
  Note,
  NoteFilter,
  NoteResult,
} from '../file-notes/types.js';
import type { INoteService } from '../interfaces/note-service.interface.js';

let counter = 0;

export class FakeNoteService implements INoteService {
  private readonly notes = new Map<string, Note>();
  private readonly addedIds: string[] = [];
  private readonly editedIds: string[] = [];
  private readonly completedIds: string[] = [];

  async addNote(_worktreePath: string, input: CreateNoteInput): Promise<NoteResult<Note>> {
    const now = new Date().toISOString();
    const base = {
      id: `fake-${++counter}`,
      target: input.target,
      targetMeta: input.targetMeta,
      content: input.content,
      to: input.to,
      status: 'open' as const,
      author: input.author,
      authorId: input.authorId,
      threadId: input.threadId,
      createdAt: now,
      updatedAt: now,
    };
    // Construct the correct discriminated variant based on linkType
    const note: Note = { ...base, linkType: input.linkType } as Note;
    this.notes.set(note.id, note);
    this.addedIds.push(note.id);
    return { ok: true, data: note };
  }

  async editNote(
    _worktreePath: string,
    noteId: string,
    input: EditNoteInput
  ): Promise<NoteResult<Note>> {
    const note = this.notes.get(noteId);
    if (!note) return { ok: false, error: `Note ${noteId} not found` };

    if (input.content !== undefined) note.content = input.content;
    if (input.to !== undefined) note.to = input.to;
    note.updatedAt = new Date().toISOString();
    this.editedIds.push(noteId);
    return { ok: true, data: note };
  }

  async completeNote(
    _worktreePath: string,
    noteId: string,
    completedBy: 'human' | 'agent'
  ): Promise<NoteResult<Note>> {
    const note = this.notes.get(noteId);
    if (!note) return { ok: false, error: `Note ${noteId} not found` };

    note.status = 'complete';
    note.completedBy = completedBy;
    note.updatedAt = new Date().toISOString();
    this.completedIds.push(noteId);
    return { ok: true, data: note };
  }

  async deleteNote(_worktreePath: string, noteId: string): Promise<NoteResult> {
    if (!this.notes.delete(noteId)) {
      return { ok: false, error: `Note ${noteId} not found` };
    }
    return { ok: true, data: undefined };
  }

  async listNotes(_worktreePath: string, filter?: NoteFilter): Promise<NoteResult<Note[]>> {
    let notes = Array.from(this.notes.values());

    if (filter?.linkType) notes = notes.filter((n) => n.linkType === filter.linkType);
    if (filter?.target) notes = notes.filter((n) => n.target === filter.target);
    if (filter?.status) notes = notes.filter((n) => n.status === filter.status);
    if (filter?.to) notes = notes.filter((n) => n.to === filter.to);
    if (filter?.threadId) notes = notes.filter((n) => n.threadId === filter.threadId);

    return { ok: true, data: notes.reverse() };
  }

  async listFilesWithNotes(_worktreePath: string): Promise<NoteResult<string[]>> {
    const targets = new Set<string>();
    for (const note of this.notes.values()) {
      if (note.status === 'open' && note.linkType === 'file') targets.add(note.target);
    }
    return { ok: true, data: [...targets].sort() };
  }

  async deleteAllForTarget(_worktreePath: string, target: string): Promise<NoteResult> {
    for (const [id, note] of this.notes) {
      if (note.target === target) this.notes.delete(id);
    }
    return { ok: true, data: undefined };
  }

  async deleteAll(_worktreePath: string): Promise<NoteResult> {
    this.notes.clear();
    return { ok: true, data: undefined };
  }

  // ── Inspection Methods (test-only) ──

  getAdded(): readonly string[] {
    return this.addedIds;
  }

  getEdited(): readonly string[] {
    return this.editedIds;
  }

  getCompleted(): readonly string[] {
    return this.completedIds;
  }

  getAllNotes(): readonly Note[] {
    return Array.from(this.notes.values());
  }

  reset(): void {
    this.notes.clear();
    this.addedIds.length = 0;
    this.editedIds.length = 0;
    this.completedIds.length = 0;
    counter = 0;
  }
}
