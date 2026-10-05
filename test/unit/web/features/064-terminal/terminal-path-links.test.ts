import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { findPathCandidates } from '../../../../../apps/web/src/features/064-terminal/lib/terminal-paths';
import {
  currentWindowPaneCwds,
  resolveTerminalPaths,
} from '../../../../../apps/web/src/features/064-terminal/server/resolve-terminal-paths';

const paths = (text: string) => findPathCandidates(text).map((c) => [c.path, c.line]);

describe('findPathCandidates', () => {
  it('finds the paths an agent writes, with line suffixes and without sentence punctuation', () => {
    expect(
      paths(
        "Terrain's shots are in scratch/review/regrade/pairs-before-left-after-right.jpg, before on the left."
      )
    ).toEqual([['scratch/review/regrade/pairs-before-left-after-right.jpg', null]]);
    expect(paths('see apps/web/src/x.ts:42:7 and ~/notes.md.')).toEqual([
      ['apps/web/src/x.ts', 42],
      ['~/notes.md', null],
    ]);
    expect(paths('edit ./README.md or /Users/me/repo/')).toEqual([
      ['./README.md', null],
      ['/Users/me/repo/', null],
    ]);
  });

  it('leaves URLs, versions and plain words alone', () => {
    expect(paths('open https://example.com/a/b.html now')).toEqual([]);
    expect(paths('bumped next to 16.3.6 in 1h34m, and / or ./')).toEqual([]);
  });

  it('reports offsets that cover the suffix', () => {
    const [candidate] = findPathCandidates('at src/a.ts:12 ok');
    expect('at src/a.ts:12 ok'.slice(candidate.start, candidate.end)).toBe('src/a.ts:12');
  });
});

describe('resolveTerminalPaths', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terminal-paths-'));
  const left = path.join(root, 'left');
  const right = path.join(root, 'right');
  fs.mkdirSync(path.join(right, 'scratch'), { recursive: true });
  fs.mkdirSync(left);
  fs.writeFileSync(path.join(right, 'scratch', 'a.jpg'), '');
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  it('tries each pane directory in order and returns only what exists', () => {
    expect(
      resolveTerminalPaths(['scratch/a.jpg', 'scratch', 'missing.md', '~/x'], [left, right], root)
    ).toEqual([
      { path: 'scratch/a.jpg', absolute: path.join(right, 'scratch', 'a.jpg'), directory: false },
      { path: 'scratch', absolute: path.join(right, 'scratch'), directory: true },
    ]);
    expect(resolveTerminalPaths(['~/right/scratch/a.jpg'], [], root)).toEqual([
      {
        path: '~/right/scratch/a.jpg',
        absolute: path.join(right, 'scratch', 'a.jpg'),
        directory: false,
      },
    ]);
  });

  it('reads the current window panes, active pane first', () => {
    const exec = (_: string, args: string[]) => {
      expect(args.slice(0, 3)).toEqual(['list-panes', '-t', '=main:']);
      return '0\t/repo/a\n1\t/repo/b\n0\t/repo/a\n';
    };
    expect(currentWindowPaneCwds(exec, 'main')).toEqual(['/repo/b', '/repo/a']);
  });
});
