/**
 * Activity Log Writer — append-only JSONL persistence with dedup.
 *
 * Pure function — no class, no DI, no state. Callable from any Node.js context
 * (terminal sidecar, Next.js server, CLI, tests).
 *
 * Plan 065: Worktree Activity Log
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { ACTIVITY_LOG_DIR, ACTIVITY_LOG_FILE, type ActivityLogEntry } from '../types';

const DEDUP_LOOKBACK = 50;

/**
 * Append an activity log entry to the per-worktree JSONL file.
 *
 * Dedup: reads last 50 lines, skips write if the last entry for
 * the same `id` has the same `label`.
 *
 * Creates `.chainglass/data/` directory if it doesn't exist.
 */
export function appendActivityLogEntry(worktreePath: string, entry: ActivityLogEntry): void {
  const filePath = path.join(worktreePath, ACTIVITY_LOG_DIR, ACTIVITY_LOG_FILE);
  const dir = path.dirname(filePath);

  fs.mkdirSync(dir, { recursive: true });

  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.trim().split('\n').slice(-DEDUP_LOOKBACK);
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const existing = JSON.parse(lines[i]);
          if (existing.id === entry.id) {
            if (existing.label === entry.label) return; // duplicate — skip
            break; // different label — proceed to write
          }
        } catch {
          /* skip malformed */
        }
      }
    } catch {
      /* file read error — proceed to write */
    }
  }

  fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`);
}
