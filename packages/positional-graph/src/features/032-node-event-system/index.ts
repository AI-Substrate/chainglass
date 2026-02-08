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

export { EventStampSchema } from './event-stamp.schema.js';
export type { EventStamp } from './event-stamp.schema.js';

// Payload schemas
export {
  NodeAcceptedPayloadSchema,
  NodeCompletedPayloadSchema,
  NodeErrorPayloadSchema,
  ProgressUpdatePayloadSchema,
  QuestionAnswerPayloadSchema,
  QuestionAskPayloadSchema,
} from './event-payloads.schema.js';
export type {
  NodeAcceptedPayload,
  NodeCompletedPayload,
  NodeErrorPayload,
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
export type {
  EventHandlerContextTag,
  INodeEventService,
  RaiseResult,
} from './node-event-service.interface.js';
export type { HandlerContext, EventHandler } from './handler-context.interface.js';

// Registry
export { NodeEventRegistry } from './node-event-registry.js';
export { FakeNodeEventRegistry } from './fake-node-event-registry.js';
export type { ValidationHistoryEntry } from './fake-node-event-registry.js';

// Registration
export { registerCoreEventTypes } from './core-event-types.js';

// Utilities
export { generateEventId } from './event-id.js';

// Helpers
export { canNodeDoWork, isNodeActive } from './event-helpers.js';

// Event handlers
export { createEventHandlerRegistry } from './event-handlers.js';

// Event handler registry (Phase 5)
export { EventHandlerRegistry } from './event-handler-registry.js';
export type { EventHandlerRegistration } from './event-handler-registry.js';

// Node event service (Phase 5)
export { NodeEventService } from './node-event-service.js';
export type { NodeEventServiceDeps } from './node-event-service.js';
export { FakeNodeEventService } from './fake-node-event-service.js';
export type {
  HandleEventsHistoryEntry,
  RaiseHistoryEntry,
  StampHistoryEntry,
} from './fake-node-event-service.js';

// Core write path
export { raiseEvent } from './raise-event.js';
export type { RaiseEventDeps, RaiseEventResult } from './raise-event.js';

// Error factories
export {
  eventAlreadyAnsweredError,
  eventPayloadValidationError,
  eventQuestionNotFoundError,
  eventSourceNotAllowedError,
  eventStateTransitionError,
  eventTypeNotFoundError,
} from './event-errors.js';
