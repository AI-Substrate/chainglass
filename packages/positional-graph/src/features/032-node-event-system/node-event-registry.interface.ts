import type { ResultError } from '@chainglass/shared';

import type { EventTypeRegistration } from './event-type-registration.interface.js';

/**
 * Validation result from `validatePayload()`.
 */
export interface PayloadValidationResult {
  readonly ok: boolean;
  readonly errors: ResultError[];
}

/**
 * Registry for node event types.
 *
 * Provides registration, lookup, enumeration, and payload validation.
 * The registry does NOT perform state changes — it is a pure data structure.
 */
export interface INodeEventRegistry {
  /** Register a new event type. Throws on duplicate. */
  register(registration: EventTypeRegistration): void;

  /** Get a registration by type name, or undefined if not registered. */
  get(type: string): EventTypeRegistration | undefined;

  /** List all registered event types. */
  list(): EventTypeRegistration[];

  /** List registered event types filtered by domain. */
  listByDomain(domain: string): EventTypeRegistration[];

  /** Validate a payload against the registered schema for the given type. */
  validatePayload(type: string, payload: unknown): PayloadValidationResult;
}
