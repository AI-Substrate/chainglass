import type { ResultError } from '@chainglass/shared';

import type { EventTypeRegistration } from './event-type-registration.interface.js';
import type {
  INodeEventRegistry,
  PayloadValidationResult,
} from './node-event-registry.interface.js';

/**
 * Record of a validatePayload call, captured for test assertions.
 */
export interface ValidationHistoryEntry {
  readonly type: string;
  readonly payload: unknown;
  readonly result: PayloadValidationResult;
}

/**
 * Test double for INodeEventRegistry.
 *
 * Implements the full interface with the same behavior as NodeEventRegistry,
 * plus test helpers for inspection and control.
 */
export class FakeNodeEventRegistry implements INodeEventRegistry {
  private readonly types = new Map<string, EventTypeRegistration>();
  private readonly validationHistory: ValidationHistoryEntry[] = [];

  // ── INodeEventRegistry implementation ──────────────

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
      const result: PayloadValidationResult = { ok: false, errors: [error] };
      this.validationHistory.push({ type, payload, result });
      return result;
    }

    const parseResult = reg.payloadSchema.safeParse(payload);
    if (!parseResult.success) {
      const errors: ResultError[] = parseResult.error.issues.map((issue) => ({
        code: 'E191',
        message: `Invalid payload for event type '${type}': ${issue.message} at ${issue.path.join('.') || 'root'}`,
        action: `Run 'cg wf node event schema ${type}' to see the required payload schema.`,
      }));
      const result: PayloadValidationResult = { ok: false, errors };
      this.validationHistory.push({ type, payload, result });
      return result;
    }

    const result: PayloadValidationResult = { ok: true, errors: [] };
    this.validationHistory.push({ type, payload, result });
    return result;
  }

  // ── Test helpers ───────────────────────────────────

  /** Shortcut to register a type (alias for register). */
  addEventType(registration: EventTypeRegistration): void {
    this.register(registration);
  }

  /** Get the history of all validatePayload calls. */
  getValidationHistory(): readonly ValidationHistoryEntry[] {
    return this.validationHistory;
  }

  /** Clear all registrations and validation history. */
  reset(): void {
    this.types.clear();
    this.validationHistory.length = 0;
  }
}
