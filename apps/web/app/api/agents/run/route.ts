/**
 * Agent Run API Route - /api/agents/run
 *
 * POST handler that invokes AgentService with SSE streaming.
 * Broadcasts events to per-session SSE channel for real-time updates.
 *
 * Part of Plan 012: Multi-Agent Web UI (Phase 2: Core Chat, Subtask 001)
 *
 * Per DYK-01: SSE connection must be established BEFORE this endpoint is called
 * to avoid missing events (no buffering in SSEManager).
 *
 * Per DYK-05: Uses lazy singleton DI container via getContainer().
 */

import type { AgentEvent, AgentService } from '@chainglass/shared';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { getContainer } from '../../../../src/lib/bootstrap-singleton';
import { DI_TOKENS } from '../../../../src/lib/di-container';
import { sseManager } from '../../../../src/lib/sse-manager';

/** Force dynamic rendering - required for DI container access */
export const dynamic = 'force-dynamic';

/**
 * Request body schema for agent run requests.
 */
const AgentRunRequestSchema = z.object({
  /** The prompt to send to the agent */
  prompt: z.string().min(1, 'Prompt is required'),
  /** Agent type: 'claude-code' or 'copilot' */
  agentType: z.enum(['claude-code', 'copilot']),
  /** Client session ID (for tracking, different from agentSessionId) */
  sessionId: z.string(),
  /** SSE channel for broadcasting events (e.g., 'agent-<sessionId>') */
  channel: z.string(),
  /** Agent session ID for resumption (optional, from previous COMPLETE_RUN) */
  agentSessionId: z.string().optional(),
});

type AgentRunRequest = z.infer<typeof AgentRunRequestSchema>;

/**
 * Response body for agent run requests.
 */
interface AgentRunResponse {
  /** Agent session ID for future resumption */
  agentSessionId: string;
  /** Final output from the agent */
  output: string;
  /** Execution status */
  status: 'completed' | 'failed' | 'killed';
  /** Token usage if available */
  tokens: {
    used: number;
    total: number;
    limit: number;
  } | null;
}

/**
 * Translate AgentEvent from adapter to SSE broadcast.
 * Maps adapter event types to SSE event types defined in agent-events.schema.ts.
 *
 * Per ST002: Event translation happens here, UI receives only typed SSE events.
 */
function broadcastAgentEvent(channel: string, sessionId: string, event: AgentEvent): void {
  const timestamp = new Date().toISOString();

  switch (event.type) {
    case 'text_delta':
      sseManager.broadcast(channel, 'agent_text_delta', {
        timestamp,
        data: {
          sessionId,
          delta: event.data.content,
        },
      });
      break;

    case 'usage':
      sseManager.broadcast(channel, 'agent_usage_update', {
        timestamp,
        data: {
          sessionId,
          tokensUsed: event.data.inputTokens ?? 0,
          tokensTotal: event.data.totalTokens ?? 0,
          tokensLimit: event.data.tokenLimit,
        },
      });
      break;

    case 'session_start':
    case 'session_idle':
      sseManager.broadcast(channel, 'agent_session_status', {
        timestamp,
        data: {
          sessionId,
          status: event.type === 'session_start' ? 'running' : 'idle',
        },
      });
      break;

    case 'session_error':
      sseManager.broadcast(channel, 'agent_error', {
        timestamp,
        data: {
          sessionId,
          message: event.data.message ?? 'Unknown error',
          code: event.data.errorType,
        },
      });
      break;

    case 'message':
      // Full message events are handled by final response, not SSE
      // The streaming content is delivered via text_delta events
      break;

    case 'raw':
      // Raw events are for advanced consumers; skip in standard flow
      break;
  }
}

/**
 * POST handler for agent run requests.
 *
 * @param request - Incoming request with JSON body
 * @returns JSON response with agent result
 */
export async function POST(request: NextRequest): Promise<Response> {
  // Parse and validate request body
  let body: AgentRunRequest;
  try {
    const rawBody = await request.json();
    body = AgentRunRequestSchema.parse(rawBody);
  } catch (error) {
    // Handle JSON syntax errors (malformed JSON) - COR-001
    if (error instanceof SyntaxError) {
      return Response.json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }

    // Check for Zod validation errors (use name check for cross-module compatibility)
    const isZodError = error instanceof Error && error.name === 'ZodError' && 'errors' in error;
    const message = isZodError
      ? (error as z.ZodError).errors.map((e) => e.message).join(', ')
      : 'Invalid request body';

    return Response.json({ error: message }, { status: 400 });
  }

  const { prompt, agentType, sessionId, channel, agentSessionId } = body;

  // Get container and resolve AgentService
  const container = getContainer();
  const agentService = container.resolve<AgentService>(DI_TOKENS.AGENT_SERVICE);

  // Broadcast session start status
  sseManager.broadcast(channel, 'agent_session_status', {
    timestamp: new Date().toISOString(),
    data: {
      sessionId,
      status: 'running',
    },
  });

  try {
    // Run agent with streaming events
    // Per ADR-0006 DYK-07: Claude Code sessions are CWD-bound
    const cwd = process.cwd();
    console.log(
      `[/api/agents/run] Starting agent: type=${agentType}, channel=${channel}, cwd=${cwd}`
    );

    const result = await agentService.run({
      prompt,
      agentType,
      sessionId: agentSessionId, // Pass adapter session ID for resumption
      cwd,
      onEvent: (event) => {
        console.log(`[/api/agents/run] Event: ${event.type}`);
        broadcastAgentEvent(channel, sessionId, event);
      },
    });

    console.log(
      `[/api/agents/run] Completed: status=${result.status}, sessionId=${result.sessionId}`
    );

    // Broadcast completion status
    const completionStatus = result.status === 'completed' ? 'completed' : 'error';
    sseManager.broadcast(channel, 'agent_session_status', {
      timestamp: new Date().toISOString(),
      data: {
        sessionId,
        status: completionStatus,
      },
    });

    // Return final result with agentSessionId for resumption
    const response: AgentRunResponse = {
      agentSessionId: result.sessionId, // This is the adapter-provided session ID
      output: result.output,
      status: result.status,
      tokens: result.tokens,
    };

    return Response.json(response);
  } catch (error) {
    // Log detailed error server-side only - SEC-001
    console.error('[/api/agents/run] Agent execution failed:', error);

    // Broadcast generic error to client (no sensitive details)
    sseManager.broadcast(channel, 'agent_error', {
      timestamp: new Date().toISOString(),
      data: {
        sessionId,
        message: 'Agent execution failed. Please try again.',
      },
    });

    // Also broadcast error status
    sseManager.broadcast(channel, 'agent_session_status', {
      timestamp: new Date().toISOString(),
      data: {
        sessionId,
        status: 'error',
      },
    });

    return Response.json({ error: 'Agent execution failed' }, { status: 500 });
  }
}
