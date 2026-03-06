import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readActivityLog } from '@/features/065-activity-log/lib/activity-log-reader';
import { afterEach, describe, expect, it } from 'vitest';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'activity-log-reader-'));
}

function logPath(worktree: string): string {
  return path.join(worktree, '.chainglass', 'data', 'activity-log.jsonl');
}

function writeLines(worktree: string, lines: string[]): void {
  const filePath = logPath(worktree);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`);
}

function makeLineJson(overrides?: Record<string, unknown>): string {
  return JSON.stringify({
    id: 'tmux:0.0',
    source: 'tmux',
    label: 'Task A',
    timestamp: '2026-03-05T21:00:00Z',
    ...overrides,
  });
}

const tmpDirs: string[] = [];
function getTmpDir(): string {
  const dir = makeTmpDir();
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

describe('readActivityLog', () => {
  it('reads valid entries from JSONL file (newest first)', () => {
    const dir = getTmpDir();
    writeLines(dir, [
      makeLineJson({ label: 'Task A', timestamp: '2026-03-05T21:00:00Z' }),
      makeLineJson({ label: 'Task B', timestamp: '2026-03-05T21:01:00Z' }),
    ]);

    const entries = readActivityLog(dir);
    expect(entries).toHaveLength(2);
    expect(entries[0].label).toBe('Task B');
    expect(entries[1].label).toBe('Task A');
  });

  it('skips malformed lines without crashing', () => {
    const dir = getTmpDir();
    writeLines(dir, ['not json at all', makeLineJson({ label: 'Valid' }), '{"incomplete']);

    const entries = readActivityLog(dir);
    expect(entries).toHaveLength(1);
    expect(entries[0].label).toBe('Valid');
  });

  it('respects limit option (returns last N entries, newest first)', () => {
    const dir = getTmpDir();
    const lines = Array.from({ length: 10 }, (_, i) =>
      makeLineJson({ label: `Task ${i}`, timestamp: `2026-03-05T21:0${i}:00Z` })
    );
    writeLines(dir, lines);

    const entries = readActivityLog(dir, { limit: 3 });
    expect(entries).toHaveLength(3);
    expect(entries[0].label).toBe('Task 9');
    expect(entries[2].label).toBe('Task 7');
  });

  it('filters by since timestamp', () => {
    const dir = getTmpDir();
    writeLines(dir, [
      makeLineJson({ label: 'Old', timestamp: '2026-03-05T19:00:00Z' }),
      makeLineJson({ label: 'New', timestamp: '2026-03-05T21:00:00Z' }),
    ]);

    const entries = readActivityLog(dir, { since: '2026-03-05T20:00:00Z' });
    expect(entries).toHaveLength(1);
    expect(entries[0].label).toBe('New');
  });

  it('filters by source type', () => {
    const dir = getTmpDir();
    writeLines(dir, [
      makeLineJson({ source: 'tmux', label: 'Tmux task' }),
      makeLineJson({ source: 'agent', label: 'Agent task', id: 'agent:1' }),
    ]);

    const entries = readActivityLog(dir, { source: 'agent' });
    expect(entries).toHaveLength(1);
    expect(entries[0].label).toBe('Agent task');
  });

  it('returns empty array for missing file', () => {
    const dir = getTmpDir();
    const entries = readActivityLog(dir);
    expect(entries).toEqual([]);
  });

  it('returns empty array for empty file', () => {
    const dir = getTmpDir();
    const filePath = logPath(dir);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '');

    const entries = readActivityLog(dir);
    expect(entries).toEqual([]);
  });

  it('skips entries missing required fields', () => {
    const dir = getTmpDir();
    writeLines(dir, [
      JSON.stringify({ id: 'x', source: 'y' }), // missing label + timestamp
      makeLineJson({ label: 'Valid' }),
    ]);

    const entries = readActivityLog(dir);
    expect(entries).toHaveLength(1);
    expect(entries[0].label).toBe('Valid');
  });

  it('preserves meta field in returned entries', () => {
    const dir = getTmpDir();
    writeLines(dir, [makeLineJson({ meta: { pane: '0.0', session: 'test' } })]);

    const entries = readActivityLog(dir);
    expect(entries[0].meta).toEqual({ pane: '0.0', session: 'test' });
  });

  it('applies default limit of 200 entries', () => {
    const dir = getTmpDir();
    const lines = Array.from({ length: 250 }, (_, i) =>
      makeLineJson({
        label: `Task ${i}`,
        timestamp: `2026-03-05T${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`,
      })
    );
    writeLines(dir, lines);

    const entries = readActivityLog(dir);
    expect(entries).toHaveLength(200);
    expect(entries[0].label).toBe('Task 249');
  });
});
