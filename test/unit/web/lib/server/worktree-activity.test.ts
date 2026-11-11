import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type WorktreeRegistry,
  listWorktreeActivity,
} from '../../../../../apps/web/src/lib/server/worktree-activity';

// 60 workspaces of one worktree each: more than the 54 whose path list overflowed the
// query string (431). Every third worktree has an agent asking a question.
const WORKSPACES = 60;
let root: string;
let registry: WorktreeRegistry;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'worktree-activity-'));
  const paths = new Map<string, string>();
  for (let i = 0; i < WORKSPACES; i++) {
    const worktree = join(root, `workspace-with-a-long-descriptive-name-${i}`, 'main');
    paths.set(`ws-${i}`, worktree);
    const dataDir = join(worktree, '.chainglass', 'data');
    await mkdir(dataDir, { recursive: true });
    if (i % 3 === 0) {
      await writeFile(
        join(dataDir, 'work-unit-state.json'),
        JSON.stringify({
          entries: [
            { id: 'a', status: 'waiting_input', creator: { type: 'agent', label: 'coder' } },
            { id: 'b', status: 'working', creator: { type: 'user', label: 'jordan' } },
          ],
        })
      );
    }
  }
  registry = {
    list: async () => [...paths.keys()].map((slug) => ({ slug })),
    getInfo: async (slug) => {
      if (slug === 'ws-59') throw new Error('unreadable workspace');
      const path = paths.get(slug);
      return path ? { worktrees: [{ path }] } : null;
    },
  };
});

afterAll(() => rm(root, { recursive: true, force: true }));

describe('listWorktreeActivity', () => {
  it('summarises every registered worktree, skipping a workspace that fails to resolve', async () => {
    const activities = await listWorktreeActivity(registry);

    expect(activities).toHaveLength(WORKSPACES - 1);
    const asking = activities.filter((a) => a.hasQuestions);
    expect(asking).toHaveLength(20);
    // Only agent entries count: the user's working entry is not an agent at work.
    expect(asking.every((a) => a.agentCount === 1 && !a.hasWorking)).toBe(true);
    expect(activities.find((a) => a.worktreePath.includes('-1/'))).toMatchObject({
      hasQuestions: false,
      agentCount: 0,
    });
  });
});
