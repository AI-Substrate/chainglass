/**
 * GitWorktreeResolver detection cache against real git (review findings on dd9713a6e).
 *
 * The cache reuses a repository's `git worktree list` until git's metadata changes. These cases
 * are the ones a metadata stamp can miss: a linked checkout moved outside git (git then reports it
 * prunable while its metadata files are untouched), and failed reads that must not be remembered
 * after git recovers.
 */

import { renameSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  FakeLogger,
  NodeFileSystemAdapter,
  type ProcessHandle,
  type SpawnOptions,
  UnixProcessManager,
} from '@chainglass/shared';
import { GitWorktreeResolver } from '@chainglass/workflow';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { git, initRepo } from '../../helpers/git';
import { makeTmpDir, removeTmpDir } from '../../helpers/tmpdir';

/** Real process manager that can pretend git is not installed (ENOENT), as a bad PATH would. */
class SwitchableGitProcessManager extends UnixProcessManager {
  gitMissing = false;

  override async spawn(options: SpawnOptions): Promise<ProcessHandle> {
    if (this.gitMissing && options.command === 'git') {
      throw Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' });
    }
    return super.spawn(options);
  }
}

describe('GitWorktreeResolver cache with real git', () => {
  let root: string;
  let linked: string;
  let processes: SwitchableGitProcessManager;
  let resolver: GitWorktreeResolver;

  beforeEach(async () => {
    const tmp = makeTmpDir('worktree-cache');
    root = join(tmp, 'repo');
    linked = join(tmp, 'linked');
    await git(tmp, 'init', '-q', '-b', 'main', root);
    await initRepo(root);
    await git(root, 'commit', '-q', '--allow-empty', '-m', 'one');
    await git(root, 'worktree', 'add', '-q', '-b', 'feature', linked);
    processes = new SwitchableGitProcessManager(new FakeLogger());
    resolver = new GitWorktreeResolver(processes, {
      cache: { fileSystem: new NodeFileSystemAdapter() },
    });
  });

  afterEach(() => {
    removeTmpDir(join(root, '..'));
  });

  const prunable = async (path: string) =>
    (await resolver.detectWorktrees(root)).find((wt) => wt.path.endsWith(path))?.isPrunable;

  it('reports a linked checkout moved outside git as prunable, and back again', async () => {
    expect(await prunable('/linked')).toBe(false);

    renameSync(linked, `${linked}-moved`);
    expect(await prunable('/linked')).toBe(true);

    renameSync(`${linked}-moved`, linked);
    expect(await prunable('/linked')).toBe(false);
  });

  it('does not remember a failed `git worktree list` once git recovers', async () => {
    const configPath = join(root, '.git', 'config');
    const config = await readFile(configPath, 'utf8');
    await writeFile(configPath, 'broken config [\n');
    expect(await resolver.detectWorktrees(root)).toEqual([]);

    await writeFile(configPath, config);
    expect(await resolver.detectWorktrees(root)).toHaveLength(2);
  });

  it('does not remember that git was missing once it is back', async () => {
    processes.gitMissing = true;
    expect(await resolver.detectWorktrees(root)).toEqual([]);

    processes.gitMissing = false;
    expect(await resolver.detectWorktrees(root)).toHaveLength(2);
  });
});
