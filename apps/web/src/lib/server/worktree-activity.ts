/**
 * Cross-worktree activity summary: per registered worktree, whether its agents are asking,
 * failing or working. Reads each worktree's work-unit-state.json directly from disk
 * (DYK-P4-01: does NOT go through IWorkUnitStateService).
 *
 * Every registered worktree is summarised server-side. The client used to send every worktree
 * path in the query string, which with 50+ workspaces outgrew Node's header limit (431).
 *
 * Plan 059 Phase 4 — T001
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface WorktreeActivitySummary {
  worktreePath: string;
  hasQuestions: boolean;
  hasErrors: boolean;
  hasWorking: boolean;
  agentCount: number;
}

/** The slice of `IWorkspaceService` this reads: the registry and each workspace's worktrees. */
export interface WorktreeRegistry {
  list(): Promise<ReadonlyArray<{ slug: string }>>;
  getInfo(slug: string): Promise<{ worktrees?: ReadonlyArray<{ path: string }> } | null>;
}

interface WorkUnitEntry {
  id: string;
  status: string;
  creator: { type: string; label: string };
}

const DATA_FILE = path.join('.chainglass', 'data', 'work-unit-state.json');

async function readWorktreeState(worktreePath: string): Promise<WorkUnitEntry[]> {
  try {
    const raw = await fs.promises.readFile(path.join(worktreePath, DATA_FILE), 'utf-8');
    const data: { entries?: unknown } = JSON.parse(raw);
    return Array.isArray(data.entries) ? data.entries : [];
  } catch {
    return [];
  }
}

function summarize(worktreePath: string, entries: WorkUnitEntry[]): WorktreeActivitySummary {
  const agentEntries = entries.filter((e) => e.creator?.type === 'agent');
  return {
    worktreePath,
    hasQuestions: agentEntries.some((e) => e.status === 'waiting_input'),
    hasErrors: agentEntries.some((e) => e.status === 'error'),
    hasWorking: agentEntries.some((e) => e.status === 'working'),
    agentCount: agentEntries.length,
  };
}

/** One summary per registered worktree; a workspace that fails to resolve is skipped. */
export async function listWorktreeActivity(
  registry: WorktreeRegistry
): Promise<WorktreeActivitySummary[]> {
  const workspaces = await registry.list();
  const worktreePaths = new Set<string>();
  await Promise.all(
    workspaces.map(async (ws) => {
      try {
        for (const wt of (await registry.getInfo(ws.slug))?.worktrees ?? []) {
          worktreePaths.add(wt.path);
        }
      } catch {
        // Skip workspaces that fail to resolve
      }
    })
  );
  return Promise.all(
    [...worktreePaths].map(async (worktreePath) =>
      summarize(worktreePath, await readWorktreeState(worktreePath))
    )
  );
}
