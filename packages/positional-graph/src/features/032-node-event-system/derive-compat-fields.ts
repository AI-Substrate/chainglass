import type { State } from '../../schemas/state.schema.js';

/**
 * Recompute backward-compat fields from the node's event log.
 *
 * Called after every handler, before persist. Derives:
 * - `pending_question_id`: Latest unanswered `question:ask` event_id
 * - `error`: Latest `node:error` event's code/message/details
 *
 * Note: Graph-level `questions[]` reconstruction is deferred to Phase 5.
 */
export function deriveBackwardCompatFields(state: State, nodeId: string): void {
  const nodes = state.nodes;
  if (!nodes) return;

  const entry = nodes[nodeId];
  if (!entry) return;

  const events = entry.events ?? [];

  // ── pending_question_id ──────────────────────────────
  // Find the latest question:ask that does NOT have a matching question:answer.
  // An "answered" ask has a question:answer event with question_event_id === ask.event_id.

  const answerEventIds = new Set(
    events
      .filter((e) => e.event_type === 'question:answer')
      .map((e) => (e.payload as { question_event_id: string }).question_event_id)
  );

  // Walk backwards to find the latest unanswered ask
  let pendingQuestionId: string | undefined;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.event_type === 'question:ask' && !answerEventIds.has(e.event_id)) {
      pendingQuestionId = e.event_id;
      break;
    }
  }

  entry.pending_question_id = pendingQuestionId;

  // ── error ────────────────────────────────────────────
  // Latest node:error event → populate error field from payload.

  let latestError: { code: string; message: string; details?: unknown } | undefined;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.event_type === 'node:error') {
      const payload = e.payload as { code: string; message: string; details?: unknown };
      latestError = {
        code: payload.code,
        message: payload.message,
        details: payload.details,
      };
      break;
    }
  }

  entry.error = latestError;
}
