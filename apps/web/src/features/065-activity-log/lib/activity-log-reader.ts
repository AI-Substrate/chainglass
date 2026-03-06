/**
 * Activity Log Reader — JSONL file reader with filtering.
 *
 * Pure function — no class, no DI, no state. Callable from any Node.js context.
 * Returns entries in chronological order (oldest first).
 * Consumers that need reverse chronological (e.g., overlay panel) must .reverse().
 *
 * Plan 065: Worktree Activity Log
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { ACTIVITY_LOG_DIR, ACTIVITY_LOG_FILE, type ActivityLogEntry } from '../types';

const DEFAULT_LIMIT = 200;

export interface ReadActivityLogOptions {
  /** Maximum entries to return (from the end, most recent). Default: 200. */
  limit?: number;
  /** ISO timestamp — only entries after this time. */
  since?: string;
  /** Filter by source type (e.g., "tmux", "agent"). */
  source?: string;
}

/**
 * Read activity log entries for a worktree.
 * Returns entries in chronological order (oldest first).
 * Skips malformed lines gracefully.
 */
export function readActivityLog(
  worktreePath: string,
  options?: ReadActivityLogOptions
): ActivityLogEntry[] {
  const filePath = path.join(worktreePath, ACTIVITY_LOG_DIR, ACTIVITY_LOG_FILE);

  if (!fs.existsSync(filePath)) return [];

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const entries: ActivityLogEntry[] = [];

    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (!entry.id || !entry.source || !entry.label || !entry.timestamp) continue;
        const entryTime = Date.parse(entry.timestamp);
        if (Number.isNaN(entryTime)) continue;
        if (options?.since) {
          const sinceTime = Date.parse(options.since);
          if (!Number.isNaN(sinceTime) && entryTime <= sinceTime) continue;
        }
        if (options?.source && entry.source !== options.source) continue;
        entries.push(entry);
      } catch {
        /* skip malformed line */
      }
    }

    const limit = options?.limit ?? DEFAULT_LIMIT;
    const limited = entries.length > limit ? entries.slice(-limit) : entries;
    return [...limited].reverse();
  } catch {
    return [];
  }
}
