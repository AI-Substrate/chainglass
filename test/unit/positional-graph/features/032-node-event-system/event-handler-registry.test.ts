import { describe, expect, it } from 'vitest';

import type { HandlerContext } from '@chainglass/positional-graph/features/032-node-event-system';

import {
  type EventHandlerRegistration,
  EventHandlerRegistry,
} from '@chainglass/positional-graph/features/032-node-event-system/event-handler-registry';

/*
Test Doc:
- Why: EventHandlerRegistry routes events to context-filtered handlers — the dispatch backbone for handleEvents()
- Contract: on() registers handlers by event type + context tag; getHandlers() filters by context matching 'both' or exact match; ordering preserved
- Usage Notes: All Phase 5 handlers registered as 'both'. Future web-only handlers use context:'web'.
- Quality Contribution: Catches handler dispatch bugs — wrong context filter, lost ordering, missing handlers
- Worked Example: register(node:accepted, handler, {context:'both'}) + getHandlers(node:accepted, 'cli') → [handler]
*/

function noopHandler(_ctx: HandlerContext): void {
  /* test stub */
}

describe('EventHandlerRegistry', () => {
  describe('on()', () => {
    it('registers a handler for an event type', () => {
      const registry = new EventHandlerRegistry();
      registry.on('node:accepted', noopHandler, { context: 'both', name: 'handleNodeAccepted' });

      const handlers = registry.getHandlers('node:accepted', 'cli');
      expect(handlers).toHaveLength(1);
    });

    it('registers multiple handlers for the same event type', () => {
      const registry = new EventHandlerRegistry();
      registry.on('node:accepted', noopHandler, { context: 'both', name: 'handler-1' });
      registry.on('node:accepted', noopHandler, { context: 'both', name: 'handler-2' });

      const handlers = registry.getHandlers('node:accepted', 'cli');
      expect(handlers).toHaveLength(2);
    });

    it('registers handlers for different event types independently', () => {
      const registry = new EventHandlerRegistry();
      registry.on('node:accepted', noopHandler, { context: 'both', name: 'accepted' });
      registry.on('node:completed', noopHandler, { context: 'both', name: 'completed' });

      expect(registry.getHandlers('node:accepted', 'cli')).toHaveLength(1);
      expect(registry.getHandlers('node:completed', 'cli')).toHaveLength(1);
    });
  });

  describe('getHandlers() — context filtering', () => {
    it('returns handlers with context: both when querying cli', () => {
      const registry = new EventHandlerRegistry();
      registry.on('node:accepted', noopHandler, { context: 'both', name: 'both-handler' });

      const handlers = registry.getHandlers('node:accepted', 'cli');
      expect(handlers).toHaveLength(1);
    });

    it('returns handlers with context: both when querying web', () => {
      const registry = new EventHandlerRegistry();
      registry.on('node:accepted', noopHandler, { context: 'both', name: 'both-handler' });

      const handlers = registry.getHandlers('node:accepted', 'web');
      expect(handlers).toHaveLength(1);
    });

    it('returns handlers with exact context match', () => {
      const registry = new EventHandlerRegistry();
      registry.on('node:accepted', noopHandler, { context: 'cli', name: 'cli-only' });

      expect(registry.getHandlers('node:accepted', 'cli')).toHaveLength(1);
      expect(registry.getHandlers('node:accepted', 'web')).toHaveLength(0);
    });

    it('filters out non-matching context handlers', () => {
      const registry = new EventHandlerRegistry();
      registry.on('node:accepted', noopHandler, { context: 'web', name: 'web-only' });

      expect(registry.getHandlers('node:accepted', 'cli')).toHaveLength(0);
    });

    it('mixes both and context-specific handlers', () => {
      const registry = new EventHandlerRegistry();
      registry.on('node:accepted', noopHandler, { context: 'both', name: 'shared' });
      registry.on('node:accepted', noopHandler, { context: 'cli', name: 'cli-only' });
      registry.on('node:accepted', noopHandler, { context: 'web', name: 'web-only' });

      expect(registry.getHandlers('node:accepted', 'cli')).toHaveLength(2); // shared + cli-only
      expect(registry.getHandlers('node:accepted', 'web')).toHaveLength(2); // shared + web-only
    });

    it('returns empty array for unregistered event type', () => {
      const registry = new EventHandlerRegistry();
      expect(registry.getHandlers('unknown:type', 'cli')).toEqual([]);
    });
  });

  describe('ordering', () => {
    it('preserves registration order within a context', () => {
      const calls: string[] = [];
      const handler1 = (_ctx: HandlerContext) => calls.push('first');
      const handler2 = (_ctx: HandlerContext) => calls.push('second');
      const handler3 = (_ctx: HandlerContext) => calls.push('third');

      const registry = new EventHandlerRegistry();
      registry.on('node:accepted', handler1, { context: 'both', name: 'first' });
      registry.on('node:accepted', handler2, { context: 'both', name: 'second' });
      registry.on('node:accepted', handler3, { context: 'both', name: 'third' });

      const handlers = registry.getHandlers('node:accepted', 'cli');
      expect(handlers).toHaveLength(3);

      // Execute in order and verify
      for (const reg of handlers) {
        reg.handler({} as HandlerContext);
      }
      expect(calls).toEqual(['first', 'second', 'third']);
    });
  });

  describe('getHandlers() return shape', () => {
    it('returns EventHandlerRegistration objects with handler and metadata', () => {
      const registry = new EventHandlerRegistry();
      registry.on('node:accepted', noopHandler, { context: 'both', name: 'handleNodeAccepted' });

      const [reg] = registry.getHandlers('node:accepted', 'cli');
      expect(reg).toBeDefined();
      expect(reg.handler).toBe(noopHandler);
      expect(reg.name).toBe('handleNodeAccepted');
      expect(reg.context).toBe('both');
      expect(reg.eventType).toBe('node:accepted');
    });
  });
});
