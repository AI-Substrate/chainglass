import type { ResultError } from '@chainglass/shared';

import type { State } from '../../schemas/state.schema.js';
import {
  eventAlreadyAnsweredError,
  eventPayloadValidationError,
  eventQuestionNotFoundError,
  eventSourceNotAllowedError,
  eventStateTransitionError,
  eventTypeNotFoundError,
} from './event-errors.js';
import { generateEventId } from './event-id.js';
import type { EventSource } from './event-source.schema.js';
import type { INodeEventRegistry } from './node-event-registry.interface.js';
import type { NodeEvent } from './node-event.schema.js';

// ── Dependencies ─────────────────────────────────────────

export interface RaiseEventDeps {
  readonly registry: INodeEventRegistry;
  readonly loadState: (graphSlug: string) => Promise<State>;
  readonly persistState: (graphSlug: string, state: State) => Promise<void>;
}

export interface RaiseEventResult {
  readonly ok: boolean;
  readonly event?: NodeEvent;
  readonly errors: ResultError[];
}

// ── Valid-From-States Map ────────────────────────────────
// Source: Workshop #02 §Validation Rules, §Valid States table.

const VALID_FROM_STATES: Record<string, readonly string[]> = {
  'node:accepted': ['starting'],
  'node:completed': ['agent-accepted'],
  'node:error': ['starting', 'agent-accepted'],
  'question:ask': ['agent-accepted'],
  'question:answer': ['waiting-question'],
  'progress:update': ['starting', 'agent-accepted', 'waiting-question'],
};

// ── Core Write Path ──────────────────────────────────────

export async function raiseEvent(
  deps: RaiseEventDeps,
  graphSlug: string,
  nodeId: string,
  eventType: string,
  payload: unknown,
  source: EventSource
): Promise<RaiseEventResult> {
  const { registry, loadState, persistState } = deps;

  // Step 1: Type exists?
  const registration = registry.get(eventType);
  if (!registration) {
    const available = registry.list().map((r) => r.type);
    return { ok: false, errors: [eventTypeNotFoundError(eventType, available)] };
  }

  // Step 2: Payload valid?
  const validation = registry.validatePayload(eventType, payload);
  if (!validation.ok) {
    // Map through factory function per Critical Insight #1.
    // Registry returns inline errors; we need factory-produced errors with
    // correct code, message format, and action field.
    const zodErrors = registration.payloadSchema.safeParse(payload);
    if (!zodErrors.success) {
      return {
        ok: false,
        errors: [eventPayloadValidationError(eventType, zodErrors.error.issues)],
      };
    }
    // Shouldn't reach here if validatePayload failed, but defensive
    return { ok: false, errors: validation.errors };
  }

  // Step 3: Source allowed?
  if (!registration.allowedSources.includes(source)) {
    return {
      ok: false,
      errors: [eventSourceNotAllowedError(eventType, source, registration.allowedSources)],
    };
  }

  // Step 4: Node in valid state?
  const state = await loadState(graphSlug);
  const nodeEntry = state.nodes?.[nodeId];
  const currentStatus = nodeEntry?.status ?? 'pending';

  const validStates = VALID_FROM_STATES[eventType];
  if (!validStates || !validStates.includes(currentStatus)) {
    return {
      ok: false,
      errors: [
        eventStateTransitionError(eventType, currentStatus, validStates ? [...validStates] : []),
      ],
    };
  }

  // Step 5: Question reference validation (only for question:answer)
  if (eventType === 'question:answer') {
    const answerPayload = payload as { question_event_id: string };
    const events = nodeEntry?.events ?? [];
    const askEvent = events.find(
      (e) => e.event_type === 'question:ask' && e.event_id === answerPayload.question_event_id
    );

    if (!askEvent) {
      return {
        ok: false,
        errors: [eventQuestionNotFoundError(answerPayload.question_event_id)],
      };
    }

    // Check if already answered
    const existingAnswer = events.find(
      (e) =>
        e.event_type === 'question:answer' &&
        (e.payload as { question_event_id?: string }).question_event_id ===
          answerPayload.question_event_id
    );

    if (existingAnswer) {
      return {
        ok: false,
        errors: [eventAlreadyAnsweredError(answerPayload.question_event_id)],
      };
    }
  }

  // ── Create event ───────────────────────────────────────

  const event: NodeEvent = {
    event_id: generateEventId(),
    event_type: eventType,
    source,
    payload: (payload ?? {}) as Record<string, unknown>,
    status: 'new',
    stops_execution: registration.stopsExecution,
    created_at: new Date().toISOString(),
  };

  // ── Append → Persist (record-only) ─────────────────────
  // raiseEvent is record-only: validate → create → append → persist.
  // Handler invocation moved to INodeEventService.handleEvents().

  if (!state.nodes) state.nodes = {};
  const entry = state.nodes[nodeId];
  if (entry) {
    const nodeEvents = entry.events ?? [];
    entry.events = [...nodeEvents, event];
  }
  state.updated_at = new Date().toISOString();
  await persistState(graphSlug, state);

  return { ok: true, event, errors: [] };
}
