import { SHARED_DI_TOKENS } from '@chainglass/shared';
import type {
  CreateAgentParams,
  IAgentManagerService,
} from '@chainglass/shared/features/019-agent-manager-refactor/agent-manager.interface';
/**
 * Agent API Routes - /api/agents
 *
 * REST endpoints for agent CRUD operations via AgentManagerService.
 * Per Plan 019 AC-08: Web can list/create agents through unified API.
 *
 * DYK-16: All routes call ensureInitialized() before operations (lazy init with flag guard).
 * DYK-05: Uses lazy singleton DI container via getContainer().
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getContainer } from '../../../src/lib/bootstrap-singleton';

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
 * GET /api/agents - List all agents
 *
 * Query params:
 * - workspace: Optional workspace filter
 *
 * Returns: Array of agent instances with status/intent/events
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    // Ensure initialization (DYK-16)
    await ensureInitialized();

    const container = getContainer();
    const agentManager = container.resolve<IAgentManagerService>(
      SHARED_DI_TOKENS.AGENT_MANAGER_SERVICE
    );

    // Parse query params
    const { searchParams } = new URL(request.url);
    const workspace = searchParams.get('workspace') ?? undefined;

    // Get agents with optional filter
    const agents = agentManager.getAgents(workspace ? { workspace } : undefined);

    // Serialize agent instances to JSON
    const response = agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      type: agent.type,
      workspace: agent.workspace,
      status: agent.status,
      intent: agent.intent,
      sessionId: agent.sessionId,
      createdAt: agent.createdAt.toISOString(),
      updatedAt: agent.updatedAt.toISOString(),
    }));

    return NextResponse.json(response);
  } catch (error) {
    console.error('[GET /api/agents] Error listing agents:', error);
    return NextResponse.json(
      {
        error: 'Failed to list agents',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/agents - Create a new agent
 *
 * Body: CreateAgentParams (name, type, workspace)
 *
 * Returns: Created agent instance
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    // Ensure initialization (DYK-16)
    await ensureInitialized();

    const container = getContainer();
    const agentManager = container.resolve<IAgentManagerService>(
      SHARED_DI_TOKENS.AGENT_MANAGER_SERVICE
    );

    // Parse request body
    const body = (await request.json()) as CreateAgentParams;

    // Validate required fields
    if (!body.name || !body.type || !body.workspace) {
      return NextResponse.json(
        { error: 'Missing required fields', required: ['name', 'type', 'workspace'] },
        { status: 400 }
      );
    }

    // Validate agent type
    if (body.type !== 'claude-code' && body.type !== 'copilot') {
      return NextResponse.json(
        { error: 'Invalid agent type', validTypes: ['claude-code', 'copilot'] },
        { status: 400 }
      );
    }

    // Create agent via manager
    const agent = agentManager.createAgent({
      name: body.name,
      type: body.type,
      workspace: body.workspace,
    });

    // Serialize agent instance to JSON
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
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('[POST /api/agents] Error creating agent:', error);
    return NextResponse.json(
      {
        error: 'Failed to create agent',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
