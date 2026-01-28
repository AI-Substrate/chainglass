/**
 * Workspace Agents API Route - /api/workspaces/[slug]/agents
 *
 * GET handler that returns agent sessions for a workspace's worktree.
 * POST handler that creates a new agent session.
 *
 * Part of Plan 018: Agent Workspace Data Model Migration (Phase 3)
 *
 * Per DYK-P6-02: Use WorkspaceService.resolveContextFromParams() for context construction.
 * Per Discovery 04: Must have `export const dynamic = 'force-dynamic'` for DI container access.
 * Per Discovery 11: Always await params before accessing route parameters (Next.js 16+).
 */

import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IAgentSessionService, IWorkspaceService } from '@chainglass/workflow';
import type { NextRequest } from 'next/server';
import { getContainer } from '../../../../../src/lib/bootstrap-singleton';

/** Force dynamic rendering - required for DI container access */
export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{
    slug: string;
  }>;
}

/**
 * GET handler for agent session list.
 *
 * Query params:
 * - worktree: Path to worktree (defaults to main worktree)
 *
 * @returns JSON response with sessions array
 */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const { slug } = await params;
  const { searchParams } = new URL(request.url);
  const worktreePath = searchParams.get('worktree') ?? undefined;

  const container = getContainer();
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );
  const sessionService = container.resolve<IAgentSessionService>(
    WORKSPACE_DI_TOKENS.AGENT_SESSION_SERVICE
  );

  try {
    // Resolve context from URL params
    const context = await workspaceService.resolveContextFromParams(slug, worktreePath);

    if (!context) {
      return Response.json({ error: 'Workspace not found' }, { status: 404 });
    }

    // List sessions for the worktree
    const sessions = await sessionService.listSessions(context);

    return Response.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        type: s.type,
        status: s.status,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
      context: {
        workspaceSlug: context.workspaceSlug,
        worktreePath: context.worktreePath,
        worktreeBranch: context.worktreeBranch,
        isMainWorktree: context.isMainWorktree,
      },
    });
  } catch (error) {
    console.error(`[/api/workspaces/${slug}/agents] Error listing sessions:`, error);
    return Response.json({ error: 'Failed to list sessions' }, { status: 500 });
  }
}

/**
 * POST handler for creating a new agent session.
 *
 * Body:
 * - type: 'claude-code' | 'copilot' (required)
 *
 * Query params:
 * - worktree: Path to worktree (defaults to main worktree)
 *
 * @returns JSON response with created session
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const { slug } = await params;
  const { searchParams } = new URL(request.url);
  const worktreePath = searchParams.get('worktree') ?? undefined;

  const container = getContainer();
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );
  const sessionService = container.resolve<IAgentSessionService>(
    WORKSPACE_DI_TOKENS.AGENT_SESSION_SERVICE
  );

  try {
    // Resolve context from URL params
    const context = await workspaceService.resolveContextFromParams(slug, worktreePath);

    if (!context) {
      return Response.json({ error: 'Workspace not found' }, { status: 404 });
    }

    // Parse request body
    const body = await request.json();
    const { type } = body;

    // Validate type (must be 'claude-code' or 'copilot')
    if (!type || (type !== 'claude-code' && type !== 'copilot')) {
      return Response.json(
        { error: 'Invalid session type. Must be "claude-code" or "copilot".' },
        { status: 400 }
      );
    }

    // Create session
    const result = await sessionService.createSession(context, type);

    if (!result.success || !result.session) {
      return Response.json(
        { error: result.errors[0]?.message || 'Failed to create session' },
        { status: 500 }
      );
    }

    const session = result.session;

    return Response.json(
      {
        ok: true,
        session: {
          id: session.id,
          type: session.type,
          status: session.status,
          createdAt: session.createdAt.toISOString(),
          updatedAt: session.updatedAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(`[/api/workspaces/${slug}/agents] Error creating session:`, error);
    return Response.json({ error: 'Failed to create session' }, { status: 500 });
  }
}
