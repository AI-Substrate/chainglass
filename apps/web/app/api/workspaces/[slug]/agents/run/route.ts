/**
 * Agent Run API Route - /api/workspaces/[slug]/agents/run
 *
 * POST handler that invokes AgentService with SSE streaming.
 * Broadcasts events to per-session SSE channel for real-time updates.
 *
 * Part of Plan 018: Agent Workspace Data Model Migration (Phase 2)
 * Migrated from /api/agents/run to workspace-scoped URL.
 *
 * Per DYK-01: SSE connection must be established BEFORE this endpoint is called
 * to avoid missing events (no buffering in SSEManager).
 *
 * Per DYK-05: Uses lazy singleton DI container via getContainer().
 *
 * Phase 3 Pattern (Notification-Fetch):
 * 1. Persist event to storage FIRST (source of truth)
 * 2. Broadcast notification (not full payload)
 * 3. Client fetches state via REST on notification
 */

import {
  type AgentEvent,
  type AgentService,
  type AgentStoredEvent,
  WORKSPACE_DI_TOKENS,
  validateSessionId,
} from '@chainglass/shared';
import type { IAgentEventAdapter, IWorkspaceService, WorkspaceContext } from '@chainglass/workflow';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { getContainer } from '../../../../../../src/lib/bootstrap-singleton';
import { DI_TOKENS } from '../../../../../../src/lib/di-container';
import { sseManager } from '../../../../../../src/lib/sse-manager';

/** Force dynamic rendering - required for DI container access */
export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{
    slug: string;
  }>;
}

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
  /** Optional worktree path (defaults to main worktree) */
  worktreePath: z.string().optional(),
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
 * @param params - Route params containing workspace slug
 * @returns JSON response with agent result
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const { slug } = await params;

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
    const isZodError = error instanceof Error && error.name === 'ZodError' && 'issues' in error;
    const message = isZodError
      ? (error as unknown as z.ZodError).issues.map((e) => e.message).join(', ')
      : 'Invalid request body';

    return Response.json({ error: message }, { status: 400 });
  }

  const { prompt, agentType, sessionId, channel, agentSessionId, worktreePath } = body;

  // SEC-001: Validate sessionId to prevent path traversal attacks
  try {
    validateSessionId(sessionId);
  } catch {
    return Response.json({ error: 'Invalid session ID' }, { status: 400 });
  }

  // Get container and resolve services
  const container = getContainer();
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );
  const agentService = container.resolve<AgentService>(DI_TOKENS.AGENT_SERVICE);
  const eventAdapter = container.resolve<IAgentEventAdapter>(
    WORKSPACE_DI_TOKENS.AGENT_EVENT_ADAPTER
  );

  // Resolve workspace context from URL params
  let context: WorkspaceContext | null;
  try {
    context = await workspaceService.resolveContextFromParams(slug, worktreePath);
  } catch (error) {
    console.error(`[/api/workspaces/${slug}/agents/run] Failed to resolve workspace:`, error);
    return Response.json({ error: 'Failed to resolve workspace' }, { status: 500 });
  }

  if (!context) {
    return Response.json({ error: 'Workspace not found' }, { status: 404 });
  }

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
    // Use worktree path as CWD so agent operates in workspace context
    const cwd = context.worktreePath;
    console.log(
      `[/api/workspaces/${slug}/agents/run] Starting agent: type=${agentType}, channel=${channel}, cwd=${cwd}`
    );

    // Accumulate text_delta content to synthesize message event if SDK doesn't emit one
    let accumulatedContent = '';
    let receivedMessageEvent = false;

    const result = await agentService.run({
      prompt,
      agentType,
      sessionId: agentSessionId, // Pass adapter session ID for resumption
      cwd,
      onEvent: (event) => {
        console.log(`[/api/workspaces/${slug}/agents/run] Event: ${event.type}`);

        // Track text_delta content for fallback message synthesis
        if (event.type === 'text_delta') {
          const deltaData = event.data as { content?: string };
          if (deltaData.content) {
            accumulatedContent += deltaData.content;
          }
        }

        // Track if we receive a proper message event
        if (event.type === 'message') {
          receivedMessageEvent = true;
        }

        // Phase 3: Persist storable events before broadcast
        // Per DYK-06: On storage failure, log warning and continue
        const storableTypes = ['tool_call', 'tool_result', 'thinking', 'message'];
        if (storableTypes.includes(event.type)) {
          // Type guard ensures event is storable type
          const storableEvent = event as AgentStoredEvent;
          // Fire-and-forget with error handling (onEvent is sync)
          eventAdapter
            .append(context as WorkspaceContext, sessionId, storableEvent)
            .then((result) => {
              if (result.ok && result.event) {
                console.log(
                  `[/api/workspaces/${slug}/agents/run] Stored event: ${result.event.id}`
                );
              }
              // Phase 3: Broadcast lightweight notification AFTER storage
              // Per notification-fetch pattern: SSE hints, REST fetches full state
              sseManager.broadcast(channel, 'session_updated', {
                timestamp: new Date().toISOString(),
                data: { sessionId },
              });
            })
            .catch((err) => {
              // Per DYK-06: Log warning, still broadcast notification
              console.warn(
                `[/api/workspaces/${slug}/agents/run] Failed to store event: ${err.message}`
              );
              // Still notify - client can fetch from storage which may have the event
              sseManager.broadcast(channel, 'session_updated', {
                timestamp: new Date().toISOString(),
                data: { sessionId },
              });
            });
        } else {
          // Non-storable events (text_delta, usage, session_status): broadcast as-is
          broadcastAgentEvent(channel, sessionId, event);
        }
      },
    });

    console.log(
      `[/api/workspaces/${slug}/agents/run] Completed: status=${result.status}, sessionId=${result.sessionId}`
    );

    // Synthesize message event if SDK didn't emit one (Copilot emits text_delta but not message)
    if (!receivedMessageEvent && accumulatedContent.trim()) {
      console.log(
        `[/api/workspaces/${slug}/agents/run] Synthesizing message event from ${accumulatedContent.length} chars of text_delta`
      );
      const syntheticMessage: AgentStoredEvent = {
        type: 'message',
        timestamp: new Date().toISOString(),
        data: {
          content: accumulatedContent,
        },
      };
      try {
        const storeResult = await eventAdapter.append(
          context as WorkspaceContext,
          sessionId,
          syntheticMessage
        );
        if (storeResult.ok && storeResult.event) {
          console.log(
            `[/api/workspaces/${slug}/agents/run] Stored synthetic message: ${storeResult.event.id}`
          );
        }
        // Notify client of new event
        sseManager.broadcast(channel, 'session_updated', {
          timestamp: new Date().toISOString(),
          data: { sessionId },
        });
      } catch (err) {
        console.warn(
          `[/api/workspaces/${slug}/agents/run] Failed to store synthetic message:`,
          err
        );
      }
    }

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
    console.error(`[/api/workspaces/${slug}/agents/run] Agent execution failed:`, error);

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
