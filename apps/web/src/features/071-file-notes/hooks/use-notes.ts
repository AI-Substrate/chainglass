'use client';

/**
 * useNotes — Data-fetching hook for the File Notes domain.
 *
 * Fetches notes via server actions, provides 10s cache to avoid
 * redundant fetches on rapid overlay toggle (DYK-04 pattern from
 * activity-log), filter state, thread-aware grouping by file, and
 * a Set of file paths with open notes for tree indicators.
 *
 * Plan 071: PR View & File Notes — Phase 2, T001
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { fetchFilesWithNotes, fetchNotes } from '../../../../app/actions/notes-actions';
import type { Note, NoteAddressee, NoteFilter, NoteLinkType, NoteStatus } from '../types';

const CACHE_STALENESS_MS = 10_000; // 10 seconds

export type NoteFilterOption =
  | 'all'
  | 'open'
  | 'complete'
  | 'to-human'
  | 'to-agent'
  | 'type-file'
  | 'type-workflow'
  | 'type-agent-run';

export interface NoteThread {
  root: Note;
  replies: Note[];
}

export interface UseNotesResult {
  /** Raw flat list of notes (newest-first from API) */
  notes: Note[];
  /** Set of file targets that have open notes — for tree indicators */
  noteFilePaths: Set<string>;
  /** Notes grouped by file target with thread structure */
  groupedByFile: Map<string, NoteThread[]>;
  /** Loading state */
  loading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Force re-fetch (bypasses cache) */
  refresh: () => void;
  /** Current filter selection */
  filter: NoteFilterOption;
  /** Update filter selection */
  setFilter: (filter: NoteFilterOption) => void;
  /** Open note count */
  openCount: number;
  /** Complete note count */
  completeCount: number;
}

/** Convert UI filter option to NoteFilter for server action */
function filterOptionToNoteFilter(option: NoteFilterOption): NoteFilter | undefined {
  switch (option) {
    case 'all':
      return undefined;
    case 'open':
      return { status: 'open' as NoteStatus };
    case 'complete':
      return { status: 'complete' as NoteStatus };
    case 'to-human':
      return { to: 'human' as NoteAddressee };
    case 'to-agent':
      return { to: 'agent' as NoteAddressee };
    case 'type-file':
      return { linkType: 'file' as NoteLinkType };
    case 'type-workflow':
      return { linkType: 'workflow' as NoteLinkType };
    case 'type-agent-run':
      return { linkType: 'agent-run' as NoteLinkType };
  }
}

/**
 * Group notes by file target with thread structure.
 *
 * Algorithm:
 * 1. Partition notes into roots (no threadId) and replies (have threadId)
 * 2. Group all notes by target (file path)
 * 3. Within each file group, build { root, replies[] } by matching reply.threadId to root.id
 * 4. Sort roots newest-first, replies chronologically (oldest-first = conversation order)
 * 5. Orphan replies (parent missing) appear as standalone roots
 */
function buildGroupedByFile(notes: Note[]): Map<string, NoteThread[]> {
  const grouped = new Map<string, NoteThread[]>();

  // Group all notes by target
  const byTarget = new Map<string, Note[]>();
  for (const note of notes) {
    const target = note.target;
    if (!byTarget.has(target)) byTarget.set(target, []);
    byTarget.get(target)?.push(note);
  }

  // Sort targets alphabetically for consistent display
  const sortedTargets = Array.from(byTarget.keys()).sort();

  for (const target of sortedTargets) {
    const targetNotes = byTarget.get(target);
    if (!targetNotes) continue;

    // Partition into roots and replies
    const roots: Note[] = [];
    const replies: Note[] = [];
    for (const note of targetNotes) {
      if (note.threadId) {
        replies.push(note);
      } else {
        roots.push(note);
      }
    }

    // Build a set of root IDs for quick lookup
    const rootIds = new Set(roots.map((r) => r.id));

    // Build threads
    const threads: NoteThread[] = [];

    // Collect replies by parent threadId
    const repliesByParent = new Map<string, Note[]>();
    const orphanReplies: Note[] = [];
    for (const reply of replies) {
      const parentId = reply.threadId;
      if (parentId && rootIds.has(parentId)) {
        const existing = repliesByParent.get(parentId);
        if (existing) {
          existing.push(reply);
        } else {
          repliesByParent.set(parentId, [reply]);
        }
      } else {
        orphanReplies.push(reply);
      }
    }

    // Roots are already newest-first from API; build threads
    for (const root of roots) {
      const rootReplies = repliesByParent.get(root.id) ?? [];
      // Sort replies chronologically (oldest first = conversation order)
      rootReplies.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      threads.push({ root, replies: rootReplies });
    }

    // Orphan replies become standalone roots
    for (const orphan of orphanReplies) {
      threads.push({ root: orphan, replies: [] });
    }

    grouped.set(target, threads);
  }

  return grouped;
}

export function useNotes(worktreePath: string | null): UseNotesResult {
  const [notes, setNotes] = useState<Note[]>([]);
  const [allNotes, setAllNotes] = useState<Note[]>([]);
  const [noteFilePaths, setNoteFilePaths] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<NoteFilterOption>('all');

  // Cache to avoid redundant fetches (DYK-04)
  const cacheRef = useRef<{
    notes: Note[];
    allNotes: Note[];
    filePaths: Set<string>;
    timestamp: number;
    worktree: string;
    filter: NoteFilterOption;
  } | null>(null);

  const fetchRef = useRef(0); // prevent stale responses

  const doFetch = useCallback(
    async (bypassCache = false) => {
      if (!worktreePath) return;

      // Check cache
      if (!bypassCache) {
        const cache = cacheRef.current;
        if (
          cache &&
          cache.worktree === worktreePath &&
          cache.filter === filter &&
          Date.now() - cache.timestamp < CACHE_STALENESS_MS
        ) {
          setNotes(cache.notes);
          setAllNotes(cache.allNotes);
          setNoteFilePaths(cache.filePaths);
          return;
        }
      }

      const fetchId = ++fetchRef.current;
      setLoading(true);
      setError(null);

      try {
        const noteFilter = filterOptionToNoteFilter(filter);

        // Fetch filtered notes, unfiltered totals, and file paths in parallel
        const [filteredResult, totalsResult, filesResult] = await Promise.all([
          fetchNotes(worktreePath, noteFilter),
          fetchNotes(worktreePath, undefined),
          fetchFilesWithNotes(worktreePath),
        ]);

        // Stale response guard
        if (fetchId !== fetchRef.current) return;

        if (filteredResult.ok) {
          setNotes(filteredResult.data);
        } else {
          setError(filteredResult.error);
          setNotes([]);
        }

        if (totalsResult.ok) {
          setAllNotes(totalsResult.data);
        } else {
          setAllNotes([]);
        }

        if (filesResult.ok) {
          const paths = new Set<string>(filesResult.data);
          setNoteFilePaths(paths);
        } else {
          setNoteFilePaths(new Set());
        }

        // Update cache
        if (filteredResult.ok && totalsResult.ok && filesResult.ok) {
          cacheRef.current = {
            notes: filteredResult.data,
            allNotes: totalsResult.data,
            filePaths: new Set<string>(filesResult.data),
            timestamp: Date.now(),
            worktree: worktreePath,
            filter,
          };
        }
      } catch (err) {
        if (fetchId !== fetchRef.current) return;
        setError(`Failed to fetch notes: ${err}`);
        setNotes([]);
      } finally {
        if (fetchId === fetchRef.current) setLoading(false);
      }
    },
    [worktreePath, filter]
  );

  // Fetch on mount and when deps change
  useEffect(() => {
    doFetch();
  }, [doFetch]);

  const refresh = useCallback(() => doFetch(true), [doFetch]);

  // Compute grouped-by-file with thread structure
  const groupedByFile = useMemo(() => buildGroupedByFile(notes), [notes]);

  // Compute open/complete counts from UNFILTERED totals (not filtered list)
  const openCount = useMemo(() => allNotes.filter((n) => n.status === 'open').length, [allNotes]);
  const completeCount = useMemo(
    () => allNotes.filter((n) => n.status === 'complete').length,
    [allNotes]
  );

  return {
    notes,
    noteFilePaths,
    groupedByFile,
    loading,
    error,
    refresh,
    filter,
    setFilter,
    openCount,
    completeCount,
  };
}
