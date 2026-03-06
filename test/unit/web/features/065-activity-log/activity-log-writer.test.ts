import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { appendActivityLogEntry } from '@/features/065-activity-log/lib/activity-log-writer';
import type { ActivityLogEntry } from '@/features/065-activity-log/types';
import { afterEach, describe, expect, it } from 'vitest';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'activity-log-writer-'));
}

function logPath(worktree: string): string {
  return path.join(worktree, '.chainglass', 'data', 'activity-log.jsonl');
}

function makeEntry(overrides?: Partial<ActivityLogEntry>): ActivityLogEntry {
  return {
    id: 'tmux:0.0',
    source: 'tmux',
    label: 'Implementing Phase 1',
    timestamp: '2026-03-05T21:22:33Z',
    ...overrides,
  };
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

describe('appendActivityLogEntry', () => {
  it('appends a valid entry as a JSONL line', () => {
    const dir = getTmpDir();
    const entry = makeEntry();
    appendActivityLogEntry(dir, entry);

    const content = fs.readFileSync(logPath(dir), 'utf-8');
    const parsed = JSON.parse(content.trim());
    expect(parsed.id).toBe('tmux:0.0');
    expect(parsed.label).toBe('Implementing Phase 1');
    expect(parsed.source).toBe('tmux');
    expect(parsed.timestamp).toBe('2026-03-05T21:22:33Z');
  });

  it('creates .chainglass/data/ directory if missing', () => {
    const dir = getTmpDir();
    expect(fs.existsSync(path.join(dir, '.chainglass', 'data'))).toBe(false);

    appendActivityLogEntry(dir, makeEntry());

    expect(fs.existsSync(path.join(dir, '.chainglass', 'data'))).toBe(true);
    expect(fs.existsSync(logPath(dir))).toBe(true);
  });

  it('skips duplicate when last entry for same id has same label', () => {
    const dir = getTmpDir();
    appendActivityLogEntry(dir, makeEntry());
    appendActivityLogEntry(dir, makeEntry({ timestamp: '2026-03-05T21:22:43Z' }));

    const lines = fs.readFileSync(logPath(dir), 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(1);
  });

  it('allows write when same id has different label', () => {
    const dir = getTmpDir();
    appendActivityLogEntry(dir, makeEntry());
    appendActivityLogEntry(
      dir,
      makeEntry({ label: 'Running tests', timestamp: '2026-03-05T21:23:00Z' })
    );

    const lines = fs.readFileSync(logPath(dir), 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1]).label).toBe('Running tests');
  });

  it('handles missing file gracefully', () => {
    const dir = getTmpDir();
    expect(() => appendActivityLogEntry(dir, makeEntry())).not.toThrow();
    expect(fs.existsSync(logPath(dir))).toBe(true);
  });

  it('skips malformed lines during dedup scan without crashing', () => {
    const dir = getTmpDir();
    const filePath = logPath(dir);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      'not valid json\n{"id":"tmux:0.0","label":"Old","source":"tmux","timestamp":"T1"}\n'
    );

    appendActivityLogEntry(dir, makeEntry({ label: 'Old' }));
    const lines = fs.readFileSync(filePath, 'utf-8').trim().split('\n');
    // Should not append because last entry for tmux:0.0 has label "Old"
    expect(lines).toHaveLength(2);
  });

  it('dedup works with interleaved pane ids', () => {
    const dir = getTmpDir();
    appendActivityLogEntry(dir, makeEntry({ id: 'tmux:0.0', label: 'Task A' }));
    appendActivityLogEntry(dir, makeEntry({ id: 'tmux:1.0', label: 'Task B' }));
    // tmux:0.0 still has label "Task A" — should skip
    appendActivityLogEntry(
      dir,
      makeEntry({ id: 'tmux:0.0', label: 'Task A', timestamp: '2026-03-05T21:23:00Z' })
    );

    const lines = fs.readFileSync(logPath(dir), 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
  });

  it('preserves meta field', () => {
    const dir = getTmpDir();
    appendActivityLogEntry(dir, makeEntry({ meta: { pane: '0.0', session: '059-fix-agents' } }));

    const content = fs.readFileSync(logPath(dir), 'utf-8');
    const parsed = JSON.parse(content.trim());
    expect(parsed.meta).toEqual({ pane: '0.0', session: '059-fix-agents' });
  });
});
