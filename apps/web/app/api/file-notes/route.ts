/**
 * File Notes API Route — CRUD endpoints
 *
 * GET  /api/file-notes?worktree=...&linkType=...&status=...&to=...&target=...
 * POST /api/file-notes  { worktree, ...CreateNoteInput }
 * PATCH /api/file-notes { worktree, noteId, action: 'edit'|'complete', ...data }
 * DELETE /api/file-notes { worktree, noteId?, target?, scope?: 'all' }
 *
 * Plan 071: PR View & File Notes — Phase 1
 */

import { auth } from '@/auth';
import { listFilesWithNotes, readNotes } from '@chainglass/shared/file-notes';
import {
  appendNote,
  completeNote,
  deleteAll,
  deleteAllForTarget,
  deleteNote,
  editNote,
} from '@chainglass/shared/file-notes';
import type { NoteAddressee, NoteLinkType, NoteStatus } from '@chainglass/shared/file-notes';
import { isNoteAddressee, isNoteAuthor, isNoteLinkType } from '@chainglass/shared/file-notes';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function validateWorktree(worktree: string | null): Response | null {
  if (!worktree) {
    return NextResponse.json({ error: 'Missing worktree parameter' }, { status: 400 });
  }
  if (!worktree.startsWith('/')) {
    return NextResponse.json({ error: 'Invalid worktree path' }, { status: 400 });
  }
  if (worktree.includes('..')) {
    return NextResponse.json({ error: 'Path traversal not allowed' }, { status: 403 });
  }
  return null;
}

export async function GET(request: NextRequest): Promise<Response> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const worktree = searchParams.get('worktree');

  const validationError = validateWorktree(worktree);
  if (validationError) return validationError;
  const validWorktree = worktree as string;

  try {
    const mode = searchParams.get('mode');

    if (mode === 'files') {
      const files = listFilesWithNotes(validWorktree);
      return NextResponse.json(files);
    }

    const linkTypeParam = searchParams.get('linkType');
    if (linkTypeParam && !isNoteLinkType(linkTypeParam)) {
      return NextResponse.json({ error: `Invalid linkType: ${linkTypeParam}` }, { status: 400 });
    }

    const notes = readNotes(validWorktree, {
      linkType: (linkTypeParam as NoteLinkType) ?? undefined,
      target: searchParams.get('target') ?? undefined,
      status: (searchParams.get('status') as NoteStatus) ?? undefined,
      to: (searchParams.get('to') as NoteAddressee) ?? undefined,
    });

    return NextResponse.json(notes);
  } catch (error) {
    console.error('[/api/file-notes] GET error:', error);
    return NextResponse.json({ error: 'Failed to read notes' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { worktree, ...input } = body;

    const validationError = validateWorktree(worktree);
    if (validationError) return validationError;

    if (!input.linkType || !input.target || !input.content || !input.author) {
      return NextResponse.json(
        { error: 'Missing required fields: linkType, target, content, author' },
        { status: 400 }
      );
    }

    if (!isNoteLinkType(input.linkType)) {
      return NextResponse.json({ error: `Invalid linkType: ${input.linkType}` }, { status: 400 });
    }

    if (!isNoteAuthor(input.author)) {
      return NextResponse.json({ error: `Invalid author: ${input.author}` }, { status: 400 });
    }

    if (input.to && !isNoteAddressee(input.to)) {
      return NextResponse.json({ error: `Invalid to: ${input.to}` }, { status: 400 });
    }

    const note = appendNote(worktree, input);
    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    console.error('[/api/file-notes] POST error:', error);
    return NextResponse.json({ error: 'Failed to create note' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest): Promise<Response> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { worktree, noteId, action, ...data } = body;

    const validationError = validateWorktree(worktree);
    if (validationError) return validationError;

    if (!noteId) {
      return NextResponse.json({ error: 'Missing noteId' }, { status: 400 });
    }

    if (action && action !== 'edit' && action !== 'complete') {
      return NextResponse.json({ error: `Invalid action: ${action}` }, { status: 400 });
    }

    if (action === 'complete') {
      const completedBy = data.completedBy ?? 'human';
      if (!isNoteAuthor(completedBy)) {
        return NextResponse.json({ error: `Invalid completedBy: ${completedBy}` }, { status: 400 });
      }
      const note = completeNote(worktree, noteId, completedBy);
      if (!note) return NextResponse.json({ error: 'Note not found' }, { status: 404 });
      return NextResponse.json(note);
    }

    const note = editNote(worktree, noteId, data);
    if (!note) return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    return NextResponse.json(note);
  } catch (error) {
    console.error('[/api/file-notes] PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update note' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest): Promise<Response> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { worktree, noteId, target, scope } = body;

    const validationError = validateWorktree(worktree);
    if (validationError) return validationError;

    if (scope === 'all') {
      const count = deleteAll(worktree);
      return NextResponse.json({ deleted: count });
    }

    if (target) {
      const count = deleteAllForTarget(worktree, target);
      return NextResponse.json({ deleted: count });
    }

    if (noteId) {
      const success = deleteNote(worktree, noteId);
      if (!success) return NextResponse.json({ error: 'Note not found' }, { status: 404 });
      return NextResponse.json({ deleted: 1 });
    }

    return NextResponse.json({ error: 'Missing noteId, target, or scope' }, { status: 400 });
  } catch (error) {
    console.error('[/api/file-notes] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete note(s)' }, { status: 500 });
  }
}
