import type { State } from '../../schemas/state.schema.js';
import type { NodeEvent } from './node-event.schema.js';

// ── Handler Type ─────────────────────────────────────────

/**
 * An event handler receives the full state (mutable), the target node ID,
 * and the event record (mutable). Handlers mutate state and event in-place.
 * raiseEvent() persists state after the handler returns.
 */
export type EventHandler = (state: State, nodeId: string, event: NodeEvent) => void;

// ── Helper ───────────────────────────────────────────────

function markHandled(event: NodeEvent): void {
  event.status = 'handled';
  event.handled_at = new Date().toISOString();
}

// ── Handlers ─────────────────────────────────────────────

function handleNodeAccepted(state: State, nodeId: string, event: NodeEvent): void {
  const nodes = state.nodes as NonNullable<typeof state.nodes>;
  nodes[nodeId].status = 'agent-accepted';
  markHandled(event);
}

function handleNodeCompleted(state: State, nodeId: string, event: NodeEvent): void {
  const nodes = state.nodes as NonNullable<typeof state.nodes>;
  nodes[nodeId].status = 'complete';
  nodes[nodeId].completed_at = new Date().toISOString();
  markHandled(event);
}

function handleNodeError(state: State, nodeId: string, event: NodeEvent): void {
  const nodes = state.nodes as NonNullable<typeof state.nodes>;
  const payload = event.payload as { code: string; message: string; details?: unknown };
  nodes[nodeId].status = 'blocked-error';
  nodes[nodeId].error = {
    code: payload.code,
    message: payload.message,
    details: payload.details,
  };
  markHandled(event);
}

function handleQuestionAsk(state: State, nodeId: string, _event: NodeEvent): void {
  const nodes = state.nodes as NonNullable<typeof state.nodes>;
  nodes[nodeId].status = 'waiting-question';
  nodes[nodeId].pending_question_id = _event.event_id;
  // question:ask stays 'new' — deferred processing. External action required.
}

function handleQuestionAnswer(state: State, nodeId: string, event: NodeEvent): void {
  const nodes = state.nodes as NonNullable<typeof state.nodes>;
  const payload = event.payload as { question_event_id: string };
  const nodeEvents = nodes[nodeId].events ?? [];

  // Find and mark the original ask event as handled
  const askEvent = nodeEvents.find(
    (e) => e.event_type === 'question:ask' && e.event_id === payload.question_event_id
  );
  if (askEvent) {
    markHandled(askEvent);
    askEvent.handler_notes = `answered by ${event.source} via ${event.event_id}`;
  }

  // Clear pending_question_id
  nodes[nodeId].pending_question_id = undefined;

  // Mark the answer event as handled
  markHandled(event);
  // Node status does NOT change on answer — ONBAS detects answer on next walk
}

function handleProgressUpdate(_state: State, _nodeId: string, event: NodeEvent): void {
  // No state change — progress events are informational only
  markHandled(event);
}

// ── Factory ──────────────────────────────────────────────

/**
 * Create the handler map — one handler per event type.
 * Handlers mutate state in-place (pre-persist).
 */
export function createEventHandlers(): Map<string, EventHandler> {
  const handlers = new Map<string, EventHandler>();
  handlers.set('node:accepted', handleNodeAccepted);
  handlers.set('node:completed', handleNodeCompleted);
  handlers.set('node:error', handleNodeError);
  handlers.set('question:ask', handleQuestionAsk);
  handlers.set('question:answer', handleQuestionAnswer);
  handlers.set('progress:update', handleProgressUpdate);
  return handlers;
}
