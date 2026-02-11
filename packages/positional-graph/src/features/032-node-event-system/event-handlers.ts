import { EventHandlerRegistry } from './event-handler-registry.js';
import type { HandlerContext } from './handler-context.interface.js';

// ── Handlers (HandlerContext signature) ─────────────────

function handleNodeAccepted(ctx: HandlerContext): void {
  ctx.node.status = 'agent-accepted';
  ctx.stamp('state-transition');
}

function handleNodeCompleted(ctx: HandlerContext): void {
  ctx.node.status = 'complete';
  ctx.node.completed_at = new Date().toISOString();
  ctx.stamp('state-transition');
}

function handleNodeError(ctx: HandlerContext): void {
  const payload = ctx.event.payload as { code: string; message: string; details?: unknown };
  ctx.node.status = 'blocked-error';
  ctx.node.error = {
    code: payload.code,
    message: payload.message,
    details: payload.details,
  };
  ctx.stamp('state-transition');
}

function handleQuestionAsk(ctx: HandlerContext): void {
  ctx.node.status = 'waiting-question';
  ctx.node.pending_question_id = (ctx.event.payload as { question_id: string }).question_id;
  ctx.stamp('state-transition');
}

function handleQuestionAnswer(ctx: HandlerContext): void {
  const payload = ctx.event.payload as { question_event_id: string };

  // Find the original ask event and cross-stamp it
  const askEvent = ctx.findEvents(
    (e) => e.event_type === 'question:ask' && e.event_id === payload.question_event_id
  )[0];
  if (askEvent) {
    ctx.stampEvent(askEvent, 'answer-linked');
  }

  // Record only — no status transition, no clearing pending_question_id.
  // Graph-domain decisions (restart, resume) belong to ONBAS/ODS.
  ctx.stamp('answer-recorded');
}

function handleProgressUpdate(ctx: HandlerContext): void {
  // No state change — progress events are informational only
  ctx.stamp('progress-recorded');
}

function handleNodeRestart(ctx: HandlerContext): void {
  // Convention-based contract (Workshop 10): set restart-pending so reality
  // builder maps to ready, ONBAS returns start-node, ODS executes.
  ctx.node.status = 'restart-pending';
  ctx.node.pending_question_id = undefined;
  ctx.stamp('restart-initiated');
}

// ── Registry Factory ────────────────────────────────────

/**
 * Create the EventHandlerRegistry with all 7 core handlers registered.
 * All handlers registered as context: 'both' (run in CLI and web).
 */
export function createEventHandlerRegistry(): EventHandlerRegistry {
  const registry = new EventHandlerRegistry();
  registry.on('node:accepted', handleNodeAccepted, {
    context: 'both',
    name: 'handleNodeAccepted',
  });
  registry.on('node:completed', handleNodeCompleted, {
    context: 'both',
    name: 'handleNodeCompleted',
  });
  registry.on('node:error', handleNodeError, { context: 'both', name: 'handleNodeError' });
  registry.on('question:ask', handleQuestionAsk, { context: 'both', name: 'handleQuestionAsk' });
  registry.on('question:answer', handleQuestionAnswer, {
    context: 'both',
    name: 'handleQuestionAnswer',
  });
  registry.on('progress:update', handleProgressUpdate, {
    context: 'both',
    name: 'handleProgressUpdate',
  });
  registry.on('node:restart', handleNodeRestart, {
    context: 'both',
    name: 'handleNodeRestart',
  });
  return registry;
}
