/**
 * Feature: 032 Node Event System
 *
 * Barrel export for the Node Event System types, schemas, registry, and utilities.
 *
 * @packageDocumentation
 */

// Schemas
export { EventSourceSchema } from './event-source.schema.js';
export type { EventSource } from './event-source.schema.js';

export { EventStatusSchema } from './event-status.schema.js';
export type { EventStatus } from './event-status.schema.js';

export { NodeEventSchema } from './node-event.schema.js';
export type { NodeEvent } from './node-event.schema.js';

// Payload schemas
export {
  NodeAcceptedPayloadSchema,
  NodeCompletedPayloadSchema,
  NodeErrorPayloadSchema,
  OutputSaveDataPayloadSchema,
  OutputSaveFilePayloadSchema,
  ProgressUpdatePayloadSchema,
  QuestionAnswerPayloadSchema,
  QuestionAskPayloadSchema,
} from './event-payloads.schema.js';
export type {
  NodeAcceptedPayload,
  NodeCompletedPayload,
  NodeErrorPayload,
  OutputSaveDataPayload,
  OutputSaveFilePayload,
  ProgressUpdatePayload,
  QuestionAnswerPayload,
  QuestionAskPayload,
} from './event-payloads.schema.js';

// Interfaces
export type { EventTypeRegistration } from './event-type-registration.interface.js';
export type {
  INodeEventRegistry,
  PayloadValidationResult,
} from './node-event-registry.interface.js';

// Registry
export { NodeEventRegistry } from './node-event-registry.js';
export { FakeNodeEventRegistry } from './fake-node-event-registry.js';
export type { ValidationHistoryEntry } from './fake-node-event-registry.js';

// Registration
export { registerCoreEventTypes } from './core-event-types.js';

// Utilities
export { generateEventId } from './event-id.js';

// Error factories
export {
  eventAlreadyAnsweredError,
  eventPayloadValidationError,
  eventQuestionNotFoundError,
  eventSourceNotAllowedError,
  eventStateTransitionError,
  eventTypeNotFoundError,
} from './event-errors.js';
