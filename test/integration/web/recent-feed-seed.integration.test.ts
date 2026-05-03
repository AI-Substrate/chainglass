/**
 * Plan recent-changes-feed T013 — integration test for `getRecentFeedItems`.
 *
 * Exercises the real seed pipeline (git binary + fs.stat) end-to-end against
 * a temp git repo. No mocks — Constitution P4 + spec § Mock Usage Policy
 * binding ("at least one integration test exercises real `git log` against
 * a temp git repo").
 *
 * Coverage:
 *   - AC B1: seed orders newest-first via git log
 *   - AC B2: limit honored
 *   - AC B3: non-git workspace returns `{ ok: false, error: 'not-git' }`
 *   - kind dispatch: image/code/markdown extensions correctly classified
 *   - resilience: stat failures (e.g., file deleted between log + stat) drop
 *     the affected entry without blanking the whole seed
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  detectFeedItemKind,
  getRecentFeedItems,
} from '../../../apps/web/src/features/041-file-browser/services/recent-feed-items';

function gitExec(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
    encoding: 'utf8',
  });
}

function initRepo(cwd: string) {
  gitExec(cwd, 'init', '-q', '-b', 'main');
  gitExec(cwd, 'config', 'user.email', 'test@example.com');
  gitExec(cwd, 'config', 'user.name', 'Test');
  gitExec(cwd, 'config', 'commit.gpgsign', 'false');
}

function commitFile(cwd: string, relPath: string, contents: string, message: string) {
  const abs = join(cwd, relPath);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, contents);
  gitExec(cwd, 'add', relPath);
  gitExec(cwd, 'commit', '-q', '-m', message);
}

describe('getRecentFeedItems — real-git integration', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'recent-feed-seed-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('orders entries newest-first and enriches with size/mtime/kind (AC B1)', async () => {
    initRepo(tmp);
    commitFile(tmp, 'src/old.ts', 'export const x = 1;\n', 'add old');
    commitFile(tmp, 'docs/notes.md', '# Notes\n\nHello.\n', 'add markdown');
    commitFile(tmp, 'assets/banner.png', 'fake-png-bytes', 'add image');

    const result = await getRecentFeedItems(tmp, 50);

    expect(result.ok).toBe(true);
    if (!result.ok) return; // type narrow

    expect(result.items).toHaveLength(3);

    // git log returns newest-first — banner.png was committed last.
    expect(result.items[0]?.path).toBe('assets/banner.png');
    expect(result.items[0]?.kind).toBe('image');
    expect(result.items[0]?.size).toBeGreaterThan(0);
    expect(result.items[0]?.changedAt).toBeGreaterThan(0);
    expect(result.items[0]?.eventType).toBe('changed');
    expect(result.items[0]?.absolutePath).toBe(join(tmp, 'assets/banner.png'));
    expect(result.items[0]?.name).toBe('banner.png');

    expect(result.items[1]?.path).toBe('docs/notes.md');
    expect(result.items[1]?.kind).toBe('markdown');

    expect(result.items[2]?.path).toBe('src/old.ts');
    expect(result.items[2]?.kind).toBe('code');
  });

  it('honors the limit parameter (AC B2)', async () => {
    initRepo(tmp);
    for (let i = 0; i < 8; i++) {
      commitFile(tmp, `f${i}.txt`, `content ${i}\n`, `add f${i}`);
    }

    const result = await getRecentFeedItems(tmp, 3);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items).toHaveLength(3);
    // Newest committed first — f7, f6, f5
    expect(result.items[0]?.path).toBe('f7.txt');
    expect(result.items[1]?.path).toBe('f6.txt');
    expect(result.items[2]?.path).toBe('f5.txt');
  });

  it('returns `not-git` error for non-git workspaces (AC B3)', async () => {
    // tmp is a fresh dir with no `.git` (no initRepo call).
    writeFileSync(join(tmp, 'orphan.txt'), 'no git here');
    const result = await getRecentFeedItems(tmp, 10);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('not-git');
  });

  it('drops entries whose stat fails (file deleted between log + stat)', async () => {
    initRepo(tmp);
    commitFile(tmp, 'survivor.ts', 'export const a = 1;\n', 'add survivor');
    commitFile(tmp, 'doomed.ts', 'export const b = 2;\n', 'add doomed');

    // Manually delete `doomed.ts` after commit. git log still reports it,
    // but the stat call inside getRecentFeedItems will reject — the entry
    // should be silently dropped, the survivor remains.
    rmSync(join(tmp, 'doomed.ts'));

    const result = await getRecentFeedItems(tmp, 50);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const paths = result.items.map((i) => i.path);
    expect(paths).toContain('survivor.ts');
    expect(paths).not.toContain('doomed.ts');
  });
});

describe('detectFeedItemKind — extension dispatch', () => {
  it.each([
    ['photo.png', 'image'],
    ['screencast.mp4', 'video'],
    ['voice.mp3', 'audio'],
    ['notes.md', 'markdown'],
    ['notes.MARKDOWN', 'markdown'],
    ['module.ts', 'code'],
    ['component.tsx', 'code'],
    ['script.py', 'code'],
    ['Dockerfile', 'code'],
    ['Makefile', 'code'],
    ['archive.tar', 'binary'],
    ['data.bin', 'binary'],
    ['somefile-no-ext', 'generic'],
  ])('classifies %s as %s', (filename, expected) => {
    expect(detectFeedItemKind(filename)).toBe(expected);
  });
});
