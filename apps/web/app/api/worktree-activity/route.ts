/**
 * GET /api/worktree-activity
 *
 * Cross-worktree activity summary endpoint.
 * Reads work-unit-state.json directly from worktree filesystem paths
 * (DYK-P4-01: does NOT modify IWorkUnitStateService interface).
 *
 * Client passes known worktree paths as query params to avoid
 * server-side re-enumeration (DYK-P4-03).
 * Server validates paths against WorkspaceService registry (DYK-P4-05).
 *
 * Plan 059 Phase 4 — T001
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IWorkspaceService } from '@chainglass/workflow';
import type { NextRequest } from 'next/server';
import { getContainer } from '../../../src/lib/bootstrap-singleton';

export const dynamic = 'force-dynamic';

interface WorkUnitEntry {
  id: string;
  status: string;
  creator: { type: string; label: string };
}

interface PersistedData {
  entries: WorkUnitEntry[];
}

export interface WorktreeActivitySummary {
  worktreePath: string;
  hasQuestions: boolean;
  hasErrors: boolean;
  hasWorking: boolean;
  agentCount: number;
}

const DATA_FILE = path.join('.chainglass', 'data', 'work-unit-state.json');

async function readWorktreeState(worktreePath: string): Promise<WorkUnitEntry[]> {
  try {
    const filePath = path.join(worktreePath, DATA_FILE);
    const raw = await fs.promises.readFile(filePath, 'utf-8').catch(() => null);
    if (!raw) return [];
    const data: PersistedData = JSON.parse(raw);
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

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const pathsParam = request.nextUrl.searchParams.get('paths');
    if (!pathsParam) {
      return Response.json({ activities: [] });
    }

    const requestedPaths = pathsParam.split(',').filter(Boolean);
    if (requestedPaths.length === 0) {
      return Response.json({ activities: [] });
    }

    // Validate paths against known workspace worktrees (DYK-P4-05)
    const container = getContainer();
    const workspaceService = container.resolve<IWorkspaceService>(
      WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
    );

    const workspaces = await workspaceService.list();
    const knownWorktreePaths = new Set<string>();

    await Promise.all(
      workspaces.map(async (ws) => {
        try {
          const info = await workspaceService.getInfo(ws.slug);
          if (info?.worktrees) {
            for (const wt of info.worktrees) {
              knownWorktreePaths.add(wt.path);
            }
          }
        } catch {
          // Skip workspaces that fail to resolve
        }
      })
    );

    const safePaths = requestedPaths.filter((p) => knownWorktreePaths.has(p));

    const activities: WorktreeActivitySummary[] = await Promise.all(
      safePaths.map(async (worktreePath) => {
        const entries = await readWorktreeState(worktreePath);
        return summarize(worktreePath, entries);
      })
    );

    return Response.json({ activities });
  } catch (error) {
    console.error('[/api/worktree-activity] Error:', error);
    return Response.json({ error: 'Failed to read worktree activity' }, { status: 500 });
  }
}
