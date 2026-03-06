/**
 * Activity Log — Roundtrip Integration Tests
 *
 * Verifies write-then-read behavioral correctness using real
 * implementations against temp directories. No fakes needed —
 * writer/reader are pure functions with a single implementation.
 *
 * DYK-04: Simplified from full contract factory — roundtrip test
 * provides same confidence without the ceremony of a fake.
 *
 * Plan 065: Worktree Activity Log
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readActivityLog } from '@/features/065-activity-log/lib/activity-log-reader';
import { appendActivityLogEntry } from '@/features/065-activity-log/lib/activity-log-writer';
import type { ActivityLogEntry } from '@/features/065-activity-log/types';
import { afterEach, describe, expect, it } from 'vitest';

function makeEntry(overrides?: Partial<ActivityLogEntry>): ActivityLogEntry {
  return {
    id: 'tmux:0.0',
    source: 'tmux',
    label: 'Task A',
    timestamp: '2026-03-05T21:00:00Z',
    ...overrides,
  };
}

const tmpDirs: string[] = [];
function getTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'activity-log-roundtrip-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

describe('Activity Log Roundtrip', () => {
  it('write-then-read returns the same entry', () => {
    const dir = getTmpDir();
    const entry = makeEntry({ meta: { pane: '0.0' } });

    appendActivityLogEntry(dir, entry);
    const result = readActivityLog(dir);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(entry);
  });

  it('dedup prevents duplicate reads', () => {
    const dir = getTmpDir();
    appendActivityLogEntry(dir, makeEntry());
    appendActivityLogEntry(dir, makeEntry({ timestamp: '2026-03-05T21:00:10Z' }));
    appendActivityLogEntry(dir, makeEntry({ timestamp: '2026-03-05T21:00:20Z' }));

    const result = readActivityLog(dir);
    expect(result).toHaveLength(1);
  });

  it('limit filtering returns most recent entries (newest first)', () => {
    const dir = getTmpDir();
    for (let i = 0; i < 10; i++) {
      appendActivityLogEntry(
        dir,
        makeEntry({
          label: `Task ${i}`,
          timestamp: `2026-03-05T21:0${i}:00Z`,
        })
      );
    }

    const result = readActivityLog(dir, { limit: 3 });
    expect(result).toHaveLength(3);
    expect(result[0].label).toBe('Task 9');
    expect(result[2].label).toBe('Task 7');
  });

  it('malformed lines are resilient — reader skips them', () => {
    const dir = getTmpDir();
    appendActivityLogEntry(dir, makeEntry({ label: 'Before' }));

    // Manually inject a corrupted line
    const filePath = path.join(dir, '.chainglass', 'data', 'activity-log.jsonl');
    fs.appendFileSync(filePath, 'corrupted{json\n');

    appendActivityLogEntry(dir, makeEntry({ label: 'After', timestamp: '2026-03-05T21:01:00Z' }));

    const result = readActivityLog(dir);
    expect(result).toHaveLength(2);
    expect(result[0].label).toBe('After');
    expect(result[1].label).toBe('Before');
  });

  it('multiple sources interleave correctly', () => {
    const dir = getTmpDir();
    appendActivityLogEntry(
      dir,
      makeEntry({
        id: 'tmux:0.0',
        source: 'tmux',
        label: 'Coding',
        timestamp: '2026-03-05T21:00:00Z',
      })
    );
    appendActivityLogEntry(
      dir,
      makeEntry({
        id: 'agent:a1',
        source: 'agent',
        label: 'Exploring',
        timestamp: '2026-03-05T21:00:05Z',
      })
    );
    appendActivityLogEntry(
      dir,
      makeEntry({
        id: 'tmux:0.0',
        source: 'tmux',
        label: 'Testing',
        timestamp: '2026-03-05T21:00:10Z',
      })
    );

    const all = readActivityLog(dir);
    expect(all).toHaveLength(3);

    const tmuxOnly = readActivityLog(dir, { source: 'tmux' });
    expect(tmuxOnly).toHaveLength(2);

    const agentOnly = readActivityLog(dir, { source: 'agent' });
    expect(agentOnly).toHaveLength(1);
  });
});
