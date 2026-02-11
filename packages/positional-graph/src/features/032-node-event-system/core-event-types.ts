import {
  NodeAcceptedPayloadSchema,
  NodeCompletedPayloadSchema,
  NodeErrorPayloadSchema,
  NodeRestartPayloadSchema,
  ProgressUpdatePayloadSchema,
  QuestionAnswerPayloadSchema,
  QuestionAskPayloadSchema,
} from './event-payloads.schema.js';
import type { INodeEventRegistry } from './node-event-registry.interface.js';

/**
 * Register the 7 core event types into a registry.
 *
 * Follows the ADR-0008 Module Registration Function pattern:
 * the function receives a registry and populates it with known entries.
 */
export function registerCoreEventTypes(registry: INodeEventRegistry): void {
  registry.register({
    type: 'node:accepted',
    displayName: 'Accept Node',
    description: 'Acknowledge the node and begin work',
    payloadSchema: NodeAcceptedPayloadSchema,
    allowedSources: ['agent', 'executor'],
    stopsExecution: false,
    domain: 'node',
  });

  registry.register({
    type: 'node:completed',
    displayName: 'Complete Node',
    description: 'Signal that work on this node is done',
    payloadSchema: NodeCompletedPayloadSchema,
    allowedSources: ['agent', 'executor'],
    stopsExecution: true,
    domain: 'node',
  });

  registry.register({
    type: 'node:error',
    displayName: 'Report Error',
    description: 'Report a structured error on this node',
    payloadSchema: NodeErrorPayloadSchema,
    allowedSources: ['agent', 'executor', 'orchestrator'],
    stopsExecution: true,
    domain: 'node',
  });

  registry.register({
    type: 'question:ask',
    displayName: 'Ask Question',
    description: 'Ask a question that needs an external answer before work can continue',
    payloadSchema: QuestionAskPayloadSchema,
    allowedSources: ['agent', 'executor'],
    stopsExecution: true,
    domain: 'question',
  });

  registry.register({
    type: 'question:answer',
    displayName: 'Answer Question',
    description: 'Provide an answer to a pending question',
    payloadSchema: QuestionAnswerPayloadSchema,
    allowedSources: ['human', 'orchestrator'],
    stopsExecution: false,
    domain: 'question',
  });

  registry.register({
    type: 'progress:update',
    displayName: 'Progress Update',
    description: 'Report informational progress (does not affect state)',
    payloadSchema: ProgressUpdatePayloadSchema,
    allowedSources: ['agent', 'executor'],
    stopsExecution: false,
    domain: 'progress',
  });

  registry.register({
    type: 'node:restart',
    displayName: 'Restart Node',
    description: 'Request node restart after question answer or error recovery',
    payloadSchema: NodeRestartPayloadSchema,
    allowedSources: ['human', 'orchestrator'],
    stopsExecution: false,
    domain: 'node',
  });
}
