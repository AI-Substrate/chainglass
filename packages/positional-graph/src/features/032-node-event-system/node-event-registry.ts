import type { ResultError } from '@chainglass/shared';

import type { EventTypeRegistration } from './event-type-registration.interface.js';
import type {
  INodeEventRegistry,
  PayloadValidationResult,
} from './node-event-registry.interface.js';

/**
 * Registry for node event types.
 *
 * Stores registrations by type name and validates payloads against
 * the registered Zod schemas at runtime.
 */
export class NodeEventRegistry implements INodeEventRegistry {
  private readonly types = new Map<string, EventTypeRegistration>();

  register(registration: EventTypeRegistration): void {
    if (this.types.has(registration.type)) {
      throw new Error(`Event type '${registration.type}' already registered`);
    }
    this.types.set(registration.type, registration);
  }

  get(type: string): EventTypeRegistration | undefined {
    return this.types.get(type);
  }

  list(): EventTypeRegistration[] {
    return [...this.types.values()];
  }

  listByDomain(domain: string): EventTypeRegistration[] {
    return [...this.types.values()].filter((t) => t.domain === domain);
  }

  validatePayload(type: string, payload: unknown): PayloadValidationResult {
    const reg = this.types.get(type);
    if (!reg) {
      const available = [...this.types.keys()];
      const error: ResultError = {
        code: 'E190',
        message: `Unknown event type '${type}'. Available types: ${available.join(', ') || 'none'}`,
        action: "Run 'cg wf node event list-types' to see available event types.",
      };
      return { ok: false, errors: [error] };
    }

    const result = reg.payloadSchema.safeParse(payload);
    if (!result.success) {
      const errors: ResultError[] = result.error.issues.map((issue) => ({
        code: 'E191',
        message: `Invalid payload for event type '${type}': ${issue.message} at ${issue.path.join('.') || 'root'}`,
        action: `Run 'cg wf node event schema ${type}' to see the required payload schema.`,
      }));
      return { ok: false, errors };
    }

    return { ok: true, errors: [] };
  }
}
