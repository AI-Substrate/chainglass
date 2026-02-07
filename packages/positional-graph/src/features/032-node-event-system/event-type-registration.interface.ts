import type { z } from 'zod';

import type { EventSource } from './event-source.schema.js';

/**
 * Metadata for a registered event type.
 *
 * Each registration maps a type name (e.g. 'question:ask') to its
 * Zod payload schema, allowed sources, and behavioral metadata.
 */
export interface EventTypeRegistration<T extends z.ZodType = z.ZodType> {
  /** Event type identifier, e.g. 'question:ask' */
  readonly type: string;

  /** Display name for CLI listing */
  readonly displayName: string;

  /** Short description for agents */
  readonly description: string;

  /** Zod schema for the event payload */
  readonly payloadSchema: T;

  /** Which sources can raise this event */
  readonly allowedSources: readonly EventSource[];

  /** Whether the agent/executor should stop after raising this event */
  readonly stopsExecution: boolean;

  /** Domain grouping for CLI display (e.g. 'node', 'question') */
  readonly domain: string;
}
