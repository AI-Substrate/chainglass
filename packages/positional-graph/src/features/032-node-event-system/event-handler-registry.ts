import type { EventHandler, HandlerContext } from './handler-context.interface.js';
import type { EventHandlerContextTag } from './node-event-service.interface.js';

/**
 * A registered handler with metadata.
 */
export interface EventHandlerRegistration {
  readonly eventType: string;
  readonly handler: EventHandler;
  readonly context: EventHandlerContextTag;
  readonly name: string;
}

/**
 * Registry for event handlers with context-based filtering.
 *
 * Handlers are registered with a context tag ('cli', 'web', or 'both').
 * `getHandlers()` returns handlers matching the requested context:
 * - context: 'both' matches ALL requests
 * - context: 'cli' matches only 'cli' requests
 * - context: 'web' matches only 'web' requests
 *
 * Registration order is preserved within each event type.
 */
export class EventHandlerRegistry {
  private readonly handlers = new Map<string, EventHandlerRegistration[]>();

  /**
   * Register a handler for an event type.
   */
  on(
    eventType: string,
    handler: EventHandler,
    options: { context: EventHandlerContextTag; name: string }
  ): void {
    const registration: EventHandlerRegistration = {
      eventType,
      handler,
      context: options.context,
      name: options.name,
    };

    const existing = this.handlers.get(eventType) ?? [];
    this.handlers.set(eventType, [...existing, registration]);
  }

  /**
   * Get handlers for an event type filtered by context.
   * Returns handlers where context is 'both' or matches the requested context.
   * Ordering is preserved from registration.
   */
  getHandlers(eventType: string, context: 'cli' | 'web'): EventHandlerRegistration[] {
    const registrations = this.handlers.get(eventType) ?? [];
    return registrations.filter((r) => r.context === 'both' || r.context === context);
  }
}

// Re-export types that consumers need
export type { EventHandler, HandlerContext };
