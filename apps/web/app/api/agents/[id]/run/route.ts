import { SHARED_DI_TOKENS } from '@chainglass/shared';
import type { AgentRunOptions } from '@chainglass/shared/features/019-agent-manager-refactor/agent-instance.interface';
import type { IAgentManagerService } from '@chainglass/shared/features/019-agent-manager-refactor/agent-manager.interface';
/**
 * Agent Run API Route - /api/agents/[id]/run
 *
 * POST endpoint for running a prompt on an agent.
 * Per Plan 019 AC-07: Web can execute prompts on agents.
 * Per AC-07a: Double-run guard returns 409 Conflict.
 *
 * DYK-16: All routes call ensureInitialized() before operations (lazy init with flag guard).
 * DYK-05: Uses lazy singleton DI container via getContainer().
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getContainer } from '../../../../../src/lib/bootstrap-singleton';

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
 * POST /api/agents/[id]/run - Run prompt on agent
 *
 * Body: AgentRunOptions (prompt, optional cwd)
 *
 * Returns 200 on success, 409 Conflict for double-run, 404 for unknown agent
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    // Ensure initialization (DYK-16)
    await ensureInitialized();

    const { id } = await params;
    console.log(`[agent-run] POST /api/agents/${id}/run — request received`);

    const container = getContainer();
    const agentManager = container.resolve<IAgentManagerService>(
      SHARED_DI_TOKENS.AGENT_MANAGER_SERVICE
    );

    // Get agent by ID
    const agent = agentManager.getAgent(id);

    // Return 404 if agent not found (per AC-04, AC-24)
    if (!agent) {
      console.log(`[agent-run] Agent ${id} NOT FOUND`);
      return NextResponse.json({ error: 'Agent not found', agentId: id }, { status: 404 });
    }

    console.log(`[agent-run] Agent found: name="${agent.name}" type="${agent.type}" status="${agent.status}"`);

    // Parse request body
    const body = (await request.json()) as AgentRunOptions;
    console.log(`[agent-run] Prompt: "${body.prompt?.substring(0, 80)}..." cwd: ${body.cwd ?? '(none)'}`);

    // Validate required fields
    if (!body.prompt) {
      return NextResponse.json({ error: 'Missing required field: prompt' }, { status: 400 });
    }

    // Run prompt on agent
    // Per AC-07a: Double-run guard in AgentInstance will throw if already working
    try {
      console.log(`[agent-run] Calling agent.run() ...`);
      const result = await agent.run({
        prompt: body.prompt,
        cwd: body.cwd,
      });

      if (result.status === 'failed') {
        console.log(`[agent-run] agent.run() returned failed: ${result.output}`);
        return NextResponse.json(
          {
            error: result.output || 'Agent execution failed',
            agentId: id,
            status: 'failed',
          },
          { status: 502 }
        );
      }

      console.log(`[agent-run] agent.run() completed successfully`);
      return NextResponse.json({ success: true, agentId: id });
    } catch (error) {
      // Check for double-run error
      if (
        error instanceof Error &&
        (error.message.includes('already running') || error.message.includes('status is working'))
      ) {
        return NextResponse.json(
          {
            error: 'Agent is already running',
            agentId: id,
            status: agent.status,
          },
          { status: 409 } // Conflict
        );
      }
      throw error; // Re-throw other errors
    }
  } catch (error) {
    console.error('[POST /api/agents/[id]/run] Error running agent:', error);
    return NextResponse.json(
      {
        error: 'Failed to run agent',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
