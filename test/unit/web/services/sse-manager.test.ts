/**
 * SSEManager Tests - TDD RED Phase
 *
 * Tests for the Server-Sent Events connection manager.
 * Following TDD approach: write tests first, expect them to fail.
 *
 * DYK-02: Uses FakeController (not FakeWritable) to match actual
 * ReadableStreamDefaultController interface used by Next.js SSE.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeController } from '../../../fakes/fake-controller';

// This import will fail in RED phase - SSEManager doesn't exist yet
import { SSEManager, sseManager } from '../../../../apps/web/src/lib/sse-manager';

describe('SSEManager', () => {
  let manager: SSEManager;

  beforeEach(() => {
    // Create fresh instance for each test (not using singleton)
    manager = new SSEManager();
  });

  describe('connection management', () => {
    it('should add connection to channel', () => {
      /*
      Test Doc:
      - Why: Verify connection Map is populated correctly
      - Contract: addConnection(channelId, controller) adds controller to Map<channel, Set<controller>>
      - Usage Notes: Use FakeController as the controller
      - Quality Contribution: Ensures connection tracking works
      - Worked Example: addConnection('ch1', controller) → manager has controller in 'ch1' channel
      */
      const controller = new FakeController();

      manager.addConnection('workflow-1', controller as unknown as ReadableStreamDefaultController);

      expect(manager.getConnectionCount('workflow-1')).toBe(1);
    });

    it('should remove connection from channel', () => {
      /*
      Test Doc:
      - Why: Cleanup on disconnect
      - Contract: removeConnection(channelId, controller) deletes controller from Set
      - Usage Notes: Add connection, then remove; verify count is 0
      - Quality Contribution: Memory leak prevention
      - Worked Example: removeConnection('ch1', controller) → manager has 0 connections in 'ch1'
      */
      const controller = new FakeController();
      manager.addConnection('workflow-1', controller as unknown as ReadableStreamDefaultController);

      manager.removeConnection(
        'workflow-1',
        controller as unknown as ReadableStreamDefaultController
      );

      expect(manager.getConnectionCount('workflow-1')).toBe(0);
    });

    it('should cleanup channel when last connection removed', () => {
      /*
      Test Doc:
      - Why: Prevent stale Map entries
      - Contract: Removing last controller deletes channel key from Map
      - Usage Notes: Add 1 connection, remove it, check channel doesn't exist
      - Quality Contribution: Memory hygiene
      - Worked Example: Last connection removed → channel no longer in Map
      */
      const controller = new FakeController();
      manager.addConnection('workflow-1', controller as unknown as ReadableStreamDefaultController);
      manager.removeConnection(
        'workflow-1',
        controller as unknown as ReadableStreamDefaultController
      );

      expect(manager.hasChannel('workflow-1')).toBe(false);
    });
  });

  describe('broadcast', () => {
    it('should broadcast to all connections on a channel', () => {
      /*
      Test Doc:
      - Why: Core multi-client functionality
      - Contract: broadcast(channelId, eventType, data) writes to all controllers in channel
      - Usage Notes: Create 2 FakeController instances; check each received enqueue
      - Quality Contribution: Proves fan-out logic works
      - Worked Example: 2 connections on 'ch1' → broadcast → both receive formatted SSE string
      */
      const controller1 = new FakeController();
      const controller2 = new FakeController();
      manager.addConnection(
        'workflow-1',
        controller1 as unknown as ReadableStreamDefaultController
      );
      manager.addConnection(
        'workflow-1',
        controller2 as unknown as ReadableStreamDefaultController
      );

      manager.broadcast('workflow-1', 'workflow_status', { phase: 'running' });

      expect(controller1.chunks.length).toBe(1);
      expect(controller2.chunks.length).toBe(1);
      expect(controller1.getAllContent()).toContain('event: workflow_status');
      expect(controller2.getAllContent()).toContain('"phase":"running"');
    });

    it('should not broadcast to other channels', () => {
      /*
      Test Doc:
      - Why: Prevent cross-channel leakage
      - Contract: broadcast('ch1', ...) does not write to controllers in 'ch2'
      - Usage Notes: Create controllers on different channels; verify isolation
      - Quality Contribution: Security boundary validation
      - Worked Example: Connections on 'ch1' and 'ch2' → broadcast to 'ch1' → 'ch2' receives nothing
      */
      const controller1 = new FakeController();
      const controller2 = new FakeController();
      manager.addConnection(
        'workflow-1',
        controller1 as unknown as ReadableStreamDefaultController
      );
      manager.addConnection(
        'workflow-2',
        controller2 as unknown as ReadableStreamDefaultController
      );

      manager.broadcast('workflow-1', 'workflow_status', { phase: 'completed' });

      expect(controller1.chunks.length).toBe(1);
      expect(controller2.chunks.length).toBe(0);
    });

    it('should handle empty channel gracefully', () => {
      /*
      Test Doc:
      - Why: Edge case (broadcast to channel with no connections)
      - Contract: broadcast('nonexistent', ...) does not throw
      - Usage Notes: Call broadcast before any addConnection
      - Quality Contribution: Robustness
      - Worked Example: broadcast('ch999', ...) → no error, no-op
      */
      expect(() => {
        manager.broadcast('nonexistent-channel', 'heartbeat', {});
      }).not.toThrow();
    });

    it('should format SSE message correctly', () => {
      /*
      Test Doc:
      - Why: Verify protocol compliance
      - Contract: Event formatted as `event: {type}\ndata: {JSON}\n\n`
      - Usage Notes: Check exact string written to FakeController
      - Quality Contribution: SSE spec compliance
      - Worked Example: broadcast('ch1', 'heartbeat', {}) → writes correctly formatted SSE
      */
      const controller = new FakeController();
      manager.addConnection('workflow-1', controller as unknown as ReadableStreamDefaultController);

      manager.broadcast('workflow-1', 'heartbeat', { timestamp: '2026-01-23T00:00:00Z' });

      const content = controller.getAllContent();
      expect(content).toMatch(/^event: heartbeat\n/);
      expect(content).toContain('data: {');
      expect(content).toContain('"timestamp":"2026-01-23T00:00:00Z"');
      expect(content).toMatch(/\n\n$/);
    });

    it('should reject invalid event types', () => {
      /*
      Test Doc:
      - Why: Prevent SSE injection attacks via malformed event types
      - Contract: broadcast throws on event types with special characters
      - Usage Notes: Test with newlines, colons, and other SSE-sensitive chars
      - Quality Contribution: Security boundary validation
      - Worked Example: broadcast('ch', 'bad\nevent', {}) → throws Error
      */
      const controller = new FakeController();
      manager.addConnection('workflow-1', controller as unknown as ReadableStreamDefaultController);

      expect(() => {
        manager.broadcast('workflow-1', 'evil\n\ndata: injected', {});
      }).toThrow('Invalid SSE event type');

      expect(() => {
        manager.broadcast('workflow-1', 'has:colon', {});
      }).toThrow('Invalid SSE event type');
    });

    it('should accept valid alphanumeric event types', () => {
      /*
      Test Doc:
      - Why: Ensure validation doesn't block legitimate event types
      - Contract: Valid event types (alphanumeric + underscore) work normally
      - Usage Notes: Test standard event names from schema
      - Quality Contribution: Regression prevention
      - Worked Example: broadcast('ch', 'workflow_status', {}) → succeeds
      */
      const controller = new FakeController();
      manager.addConnection('workflow-1', controller as unknown as ReadableStreamDefaultController);

      expect(() => {
        manager.broadcast('workflow-1', 'workflow_status', { phase: 'running' });
      }).not.toThrow();

      expect(() => {
        manager.broadcast('workflow-1', 'task_update', { taskId: '1' });
      }).not.toThrow();

      // Also accept hyphenated event types (e.g., graph-updated)
      expect(() => {
        manager.broadcast('workflow-1', 'graph-updated', { graphSlug: 'demo' });
      }).not.toThrow();
    });
  });

  describe('singleton', () => {
    it('should export a singleton instance', () => {
      /*
      Test Doc:
      - Why: SSEManager should be a singleton for connection sharing
      - Contract: sseManager export is an instance of SSEManager
      - Usage Notes: Import sseManager; verify it's defined and correct type
      - Quality Contribution: Ensures singleton pattern is implemented (DYK-01)
      - Worked Example: sseManager instanceof SSEManager === true
      */
      expect(sseManager).toBeInstanceOf(SSEManager);
    });
  });
});
