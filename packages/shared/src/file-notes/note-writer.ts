/**
 * File Notes Writer — JSONL persistence.
 *
 * Append for new notes, read-modify-rewrite for edits/deletes.
 * Pure functions — no class, no DI, no state.
 * Shared by both web and CLI.
 *
 * Plan 071: PR View & File Notes — Phase 3 (moved from apps/web)
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CreateNoteInput, EditNoteInput, Note } from './types.js';
import { NOTES_DIR, NOTES_FILE } from './types.js';

function getFilePath(worktreePath: string): string {
  return path.join(worktreePath, NOTES_DIR, NOTES_FILE);
}

function ensureDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readAllNotes(filePath: string): Note[] {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const notes: Note[] = [];
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      notes.push(JSON.parse(line));
    } catch {
      // skip malformed
    }
  }
  return notes;
}

function writeAllNotes(filePath: string, notes: Note[]): void {
  const tmpPath = `${filePath}.tmp`;
  const content = notes.map((n) => JSON.stringify(n)).join('\n');
  fs.writeFileSync(tmpPath, content ? `${content}\n` : '');
  fs.renameSync(tmpPath, filePath);
}

/**
 * Append a new note to the JSONL file.
 * Creates .chainglass/data/ directory if it doesn't exist.
 */
export function appendNote(worktreePath: string, input: CreateNoteInput): Note {
  const filePath = getFilePath(worktreePath);
  ensureDir(filePath);

  const now = new Date().toISOString();
  const base = {
    id: crypto.randomUUID(),
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
  const note: Note = { ...base, linkType: input.linkType } as Note;

  fs.appendFileSync(filePath, `${JSON.stringify(note)}\n`);
  return note;
}

/**
 * Edit an existing note. Reads all notes, updates the matching one,
 * rewrites the file atomically (write-to-temp + rename).
 */
export function editNote(worktreePath: string, noteId: string, input: EditNoteInput): Note | null {
  const filePath = getFilePath(worktreePath);
  const notes = readAllNotes(filePath);
  const idx = notes.findIndex((n) => n.id === noteId);
  if (idx === -1) return null;

  const now = new Date().toISOString();
  if (input.content !== undefined) notes[idx].content = input.content;
  if (input.to !== undefined) notes[idx].to = input.to;
  notes[idx].updatedAt = now;

  writeAllNotes(filePath, notes);
  return notes[idx];
}

/**
 * Mark a note as complete.
 */
export function completeNote(
  worktreePath: string,
  noteId: string,
  completedBy: 'human' | 'agent'
): Note | null {
  const filePath = getFilePath(worktreePath);
  const notes = readAllNotes(filePath);
  const idx = notes.findIndex((n) => n.id === noteId);
  if (idx === -1) return null;

  notes[idx].status = 'complete';
  notes[idx].completedBy = completedBy;
  notes[idx].updatedAt = new Date().toISOString();

  writeAllNotes(filePath, notes);
  return notes[idx];
}

/**
 * Delete a single note by ID.
 */
export function deleteNote(worktreePath: string, noteId: string): boolean {
  const filePath = getFilePath(worktreePath);
  const notes = readAllNotes(filePath);
  const filtered = notes.filter((n) => n.id !== noteId);
  if (filtered.length === notes.length) return false;

  writeAllNotes(filePath, filtered);
  return true;
}

/**
 * Delete all notes for a specific target.
 */
export function deleteAllForTarget(worktreePath: string, target: string): number {
  const filePath = getFilePath(worktreePath);
  const notes = readAllNotes(filePath);
  const filtered = notes.filter((n) => n.target !== target);
  const count = notes.length - filtered.length;

  if (count > 0) writeAllNotes(filePath, filtered);
  return count;
}

/**
 * Delete all notes in the worktree.
 */
export function deleteAll(worktreePath: string): number {
  const filePath = getFilePath(worktreePath);
  const notes = readAllNotes(filePath);
  if (notes.length === 0) return 0;

  writeAllNotes(filePath, []);
  return notes.length;
}
