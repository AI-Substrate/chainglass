import { auth } from '@/auth';
import { SHARED_DI_TOKENS } from '@chainglass/shared';
import type { IAgentManagerService } from '@chainglass/shared/features/019-agent-manager-refactor/agent-manager.interface';
/**
 * Agent API Route - /api/agents/[id]
 *
 * GET endpoint for fetching a single agent with its event history.
 * DELETE endpoint for terminating and removing an agent.
 *
 * Per Plan 019 AC-09: Web can access agent events for conversation history rehydration.
 * Per Phase 5 T003a: DELETE support for agent termination.
 *
 * DYK-16: All routes call ensureInitialized() before operations (lazy init with flag guard).
 * DYK-05: Uses lazy singleton DI container via getContainer().
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getContainer } from '../../../../src/lib/bootstrap-singleton';

/** Force dynamic rendering - required for DI container access */
export const dynamic = 'force-dynamic';

/** Lazy initialization flag (per DYK-16) */
let initialized = false;

/**
 * Ensure AgentManagerService is initialized before operations.
 * Per DYK-16: Simple flag guard, no mutex needed (JS event loop handles atomicity).
 */
async function ensureInitialized(): Promise<void> {
  if (initialized) {
    return;
  }

  const container = getContainer();
  const agentManager = container.resolve<IAgentManagerService>(
    SHARED_DI_TOKENS.AGENT_MANAGER_SERVICE
  );
  await agentManager.initialize();
  initialized = true;
}

/**
 * GET /api/agents/[id] - Get single agent with events
 *
 * Returns agent instance with full event history for conversation rehydration.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    // Ensure initialization (DYK-16)
    await ensureInitialized();

    const { id } = await params;

    const container = getContainer();
    const agentManager = container.resolve<IAgentManagerService>(
      SHARED_DI_TOKENS.AGENT_MANAGER_SERVICE
    );

    // Get agent by ID
    const agent = agentManager.getAgent(id);

    // Return 404 if agent not found (per AC-04, AC-24)
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found', agentId: id }, { status: 404 });
    }

    // Get events for this agent
    const events = agent.getEvents();

    // Serialize agent instance + events to JSON
    const response = {
      id: agent.id,
      name: agent.name,
      type: agent.type,
      workspace: agent.workspace,
      status: agent.status,
      intent: agent.intent,
      sessionId: agent.sessionId,
      createdAt: agent.createdAt.toISOString(),
      updatedAt: agent.updatedAt.toISOString(),
      events: events.map((event) => ({
        ...event,
        timestamp: new Date(event.timestamp).toISOString(),
      })),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[GET /api/agents/[id]] Error fetching agent:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch agent',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/agents/[id] - Terminate and delete an agent
 *
 * Terminates any running session and removes the agent from storage.
 * Per Phase 5 T003a: DELETE route for agent cleanup.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    // Ensure initialization (DYK-16)
    await ensureInitialized();

    const { id } = await params;

    const container = getContainer();
    const agentManager = container.resolve<IAgentManagerService>(
      SHARED_DI_TOKENS.AGENT_MANAGER_SERVICE
    );

    // Terminate and delete agent
    const deleted = await agentManager.terminateAgent(id);

    // Return 404 if agent not found
    if (!deleted) {
      return NextResponse.json({ error: 'Agent not found', agentId: id }, { status: 404 });
    }

    return NextResponse.json({ success: true, agentId: id });
  } catch (error) {
    console.error('[DELETE /api/agents/[id]] Error deleting agent:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete agent',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
