/**
 * PR View State — JSONL persistence for reviewed-file tracking
 *
 * Writer/reader for `.chainglass/data/pr-view-state.jsonl`.
 * Each line is a JSON-encoded PRViewFileState.
 * Uses atomic rename pattern from file-notes.
 *
 * Plan 071: PR View & File Notes — Phase 4
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PRViewFileState } from '../types';
import { PR_VIEW_STATE_DIR, PR_VIEW_STATE_FILE } from '../types';

function getFilePath(worktreePath: string): string {
  return path.join(worktreePath, PR_VIEW_STATE_DIR, PR_VIEW_STATE_FILE);
}

function ensureDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

/**
 * Load all reviewed state entries from the JSONL file.
 * Returns empty array if file doesn't exist.
 * Skips malformed lines gracefully.
 */
export function loadReviewedState(worktreePath: string): PRViewFileState[] {
  const filePath = getFilePath(worktreePath);
  if (!fs.existsSync(filePath)) return [];

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const states: PRViewFileState[] = [];
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        const state: PRViewFileState = JSON.parse(line);
        if (state.filePath && typeof state.reviewed === 'boolean') {
          states.push(state);
        }
      } catch {
        // skip malformed line
      }
    }
    return states;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

/**
 * Save reviewed state entries to the JSONL file.
 * Uses atomic rename pattern (write .tmp → rename).
 * When activeFiles is provided, prunes entries not in the active set
 * to prevent unbounded growth from stale branch entries (DYK-P4-05).
 */
export function saveReviewedState(
  worktreePath: string,
  states: PRViewFileState[],
  activeFiles?: Set<string>
): void {
  const filePath = getFilePath(worktreePath);
  ensureDir(filePath);

  const filtered = activeFiles ? states.filter((s) => activeFiles.has(s.filePath)) : states;

  const tmpPath = `${filePath}.tmp`;
  const content = filtered.map((s) => JSON.stringify(s)).join('\n');
  fs.writeFileSync(tmpPath, content ? `${content}\n` : '');
  fs.renameSync(tmpPath, filePath);
}

/**
 * Mark a single file as reviewed with its current content hash.
 * Creates or updates the entry for the given file path.
 */
export function markFileReviewed(
  worktreePath: string,
  filePath: string,
  contentHash: string,
  activeFiles?: Set<string>
): void {
  const states = loadReviewedState(worktreePath);
  const now = new Date().toISOString();

  const idx = states.findIndex((s) => s.filePath === filePath);
  const entry: PRViewFileState = {
    filePath,
    reviewed: true,
    reviewedAt: now,
    reviewedContentHash: contentHash,
  };

  if (idx >= 0) {
    states[idx] = entry;
  } else {
    states.push(entry);
  }

  saveReviewedState(worktreePath, states, activeFiles);
}

/**
 * Unmark a single file as reviewed.
 */
export function unmarkFileReviewed(worktreePath: string, filePath: string): void {
  const states = loadReviewedState(worktreePath);
  const idx = states.findIndex((s) => s.filePath === filePath);
  if (idx >= 0) {
    states.splice(idx, 1);
    saveReviewedState(worktreePath, states);
  }
}

/**
 * Clear all reviewed state for the worktree.
 */
export function clearReviewedState(worktreePath: string): void {
  const filePath = getFilePath(worktreePath);
  if (fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '');
  }
}
