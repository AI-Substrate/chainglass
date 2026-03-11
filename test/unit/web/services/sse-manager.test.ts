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
      expect(controller1.getAllContent()).toContain('"type":"workflow_status"');
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
      - Contract: Event formatted as unnamed SSE with type and channel in data payload: `data: {JSON}\n\n`
      - Usage Notes: Check exact string written to FakeController
      - Quality Contribution: SSE spec compliance — unnamed events ensure EventSource.onmessage receives them
      - Worked Example: broadcast('ch1', 'heartbeat', {timestamp}) → data: {"type":"heartbeat","channel":"ch1","timestamp":...}\n\n
      */
      const controller = new FakeController();
      manager.addConnection('workflow-1', controller as unknown as ReadableStreamDefaultController);

      manager.broadcast('workflow-1', 'heartbeat', { timestamp: '2026-01-23T00:00:00Z' });

      const content = controller.getAllContent();
      expect(content).toMatch(/^data: \{/);
      expect(content).toContain('"type":"heartbeat"');
      expect(content).toContain('"channel":"workflow-1"');
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

  describe('channel tagging (Plan 072)', () => {
    it('should include channel field in broadcast payload', () => {
      /*
      Test Doc:
      - Why: Multiplexed clients need to demux events by channel
      - Contract: broadcast(channelId, eventType, data) includes channel: channelId in JSON payload
      - Usage Notes: Parse the JSON from the SSE data frame, check channel field
      - Quality Contribution: Core multiplexing contract — without this, demux is impossible
      - Worked Example: broadcast('event-popper', 'question-asked', {id:'q1'}) → payload has channel:'event-popper'
      */
      const controller = new FakeController();
      manager.addConnection(
        'event-popper',
        controller as unknown as ReadableStreamDefaultController
      );

      manager.broadcast('event-popper', 'question-asked', { questionId: 'q1' });

      const content = controller.getAllContent();
      const jsonStr = content.replace(/^data: /, '').replace(/\n\n$/, '');
      const payload = JSON.parse(jsonStr);
      expect(payload.channel).toBe('event-popper');
      expect(payload.type).toBe('question-asked');
      expect(payload.questionId).toBe('q1');
    });

    it('should include channel in primitive data payloads', () => {
      /*
      Test Doc:
      - Why: broadcast() has two payload paths (object spread vs wrapper). Both need channel.
      - Contract: When data is not an object, payload is {type, data, channel}
      - Usage Notes: Pass a string as data to hit the primitive branch
      - Quality Contribution: Covers both payload construction branches
      - Worked Example: broadcast('ch', 'ping', 'hello') → {type:'ping', data:'hello', channel:'ch'}
      */
      const controller = new FakeController();
      manager.addConnection('test-ch', controller as unknown as ReadableStreamDefaultController);

      manager.broadcast('test-ch', 'ping', 'hello');

      const content = controller.getAllContent();
      const jsonStr = content.replace(/^data: /, '').replace(/\n\n$/, '');
      const payload = JSON.parse(jsonStr);
      expect(payload.channel).toBe('test-ch');
      expect(payload.type).toBe('ping');
      expect(payload.data).toBe('hello');
    });

    it('should overwrite caller-provided channel field (authoritative)', () => {
      /*
      Test Doc:
      - Why: SSEManager is authoritative about channel identity — caller can't spoof it
      - Contract: If data already has a channel field, SSEManager overwrites it with channelId
      - Usage Notes: Pass data with channel:'wrong', verify it gets channelId instead
      - Quality Contribution: Security — prevents channel spoofing by domain services
      - Worked Example: broadcast('real-ch', 'evt', {channel:'fake'}) → payload.channel === 'real-ch'
      */
      const controller = new FakeController();
      manager.addConnection('real-ch', controller as unknown as ReadableStreamDefaultController);

      manager.broadcast('real-ch', 'test-event', { channel: 'fake-channel', value: 42 });

      const content = controller.getAllContent();
      const jsonStr = content.replace(/^data: /, '').replace(/\n\n$/, '');
      const payload = JSON.parse(jsonStr);
      expect(payload.channel).toBe('real-ch');
      expect(payload.value).toBe(42);
    });

    it('should deliver to same controller registered on multiple channels', () => {
      /*
      Test Doc:
      - Why: Core mux route pattern — one controller in multiple channel Sets
      - Contract: A controller added to channels A and B receives broadcasts from both
      - Usage Notes: Register same FakeController on two channels, broadcast to each
      - Quality Contribution: Proves the multiplexing architecture works at SSEManager level
      - Worked Example: controller in 'ch-a' and 'ch-b' → broadcast to 'ch-a' → controller gets it
      */
      const muxController = new FakeController();
      manager.addConnection(
        'file-changes',
        muxController as unknown as ReadableStreamDefaultController
      );
      manager.addConnection(
        'event-popper',
        muxController as unknown as ReadableStreamDefaultController
      );

      manager.broadcast('file-changes', 'file-changed', { path: 'README.md' });
      manager.broadcast('event-popper', 'question-asked', { questionId: 'q1' });

      const chunks = muxController.getDecodedChunks();
      expect(chunks.length).toBe(2);
      expect(chunks[0]).toContain('"channel":"file-changes"');
      expect(chunks[1]).toContain('"channel":"event-popper"');
    });
  });

  describe('removeControllerFromAllChannels (Plan 072)', () => {
    it('should remove controller from all registered channels', () => {
      /*
      Test Doc:
      - Why: Mux route disconnect must clean up all channel registrations atomically
      - Contract: removeControllerFromAllChannels(ctrl) removes it from every channel Set
      - Usage Notes: Register on 3 channels, call method, verify 0 connections on each
      - Quality Contribution: Memory leak prevention for multiplexed connections
      - Worked Example: ctrl in [a,b,c] → removeControllerFromAllChannels(ctrl) → 0 on all
      */
      const controller = new FakeController();
      const fc = controller as unknown as ReadableStreamDefaultController;
      manager.addConnection('ch-a', fc);
      manager.addConnection('ch-b', fc);
      manager.addConnection('ch-c', fc);

      manager.removeControllerFromAllChannels(fc);

      expect(manager.getConnectionCount('ch-a')).toBe(0);
      expect(manager.getConnectionCount('ch-b')).toBe(0);
      expect(manager.getConnectionCount('ch-c')).toBe(0);
    });

    it('should return array of removed channel names', () => {
      /*
      Test Doc:
      - Why: Caller needs to know which channels were cleaned up (for logging)
      - Contract: Returns string[] of channelIds the controller was removed from
      - Usage Notes: Register on 2 channels, verify returned array contains both
      - Quality Contribution: Observability — enables debug logging of cleanup
      - Worked Example: ctrl in [a,b] → removeControllerFromAllChannels(ctrl) → ['a', 'b']
      */
      const controller = new FakeController();
      const fc = controller as unknown as ReadableStreamDefaultController;
      manager.addConnection('ch-a', fc);
      manager.addConnection('ch-b', fc);

      const removed = manager.removeControllerFromAllChannels(fc);

      expect(removed).toContain('ch-a');
      expect(removed).toContain('ch-b');
      expect(removed.length).toBe(2);
    });

    it('should clean up empty channel Sets', () => {
      /*
      Test Doc:
      - Why: Empty Sets waste memory and make hasChannel() return wrong results
      - Contract: After removing the last controller, the channel is deleted from the Map
      - Usage Notes: Register sole controller on channel, remove via method, verify channel gone
      - Quality Contribution: Memory hygiene
      - Worked Example: sole ctrl in 'ch-a' → removeControllerFromAllChannels → hasChannel('ch-a') === false
      */
      const controller = new FakeController();
      const fc = controller as unknown as ReadableStreamDefaultController;
      manager.addConnection('ch-a', fc);

      manager.removeControllerFromAllChannels(fc);

      expect(manager.hasChannel('ch-a')).toBe(false);
    });

    it('should not affect other controllers on shared channels', () => {
      /*
      Test Doc:
      - Why: Removing mux controller must not remove per-channel controllers on same channel
      - Contract: Only the specified controller is removed; others stay
      - Usage Notes: Register mux ctrl + regular ctrl on same channel, remove mux, verify regular stays
      - Quality Contribution: Isolation — migration safety (old [channel] route + new mux coexist)
      - Worked Example: mux+regular on 'ch-a' → removeControllerFromAllChannels(mux) → regular stays
      */
      const muxController = new FakeController();
      const regularController = new FakeController();
      manager.addConnection('ch-a', muxController as unknown as ReadableStreamDefaultController);
      manager.addConnection(
        'ch-a',
        regularController as unknown as ReadableStreamDefaultController
      );

      manager.removeControllerFromAllChannels(
        muxController as unknown as ReadableStreamDefaultController
      );

      expect(manager.getConnectionCount('ch-a')).toBe(1);
      expect(manager.hasChannel('ch-a')).toBe(true);
    });

    it('should handle controller not in any channel gracefully', () => {
      /*
      Test Doc:
      - Why: Edge case — controller may have already been cleaned up
      - Contract: Returns empty array, does not throw
      - Usage Notes: Call with a controller that was never registered
      - Quality Contribution: Robustness — double-cleanup safety
      - Worked Example: unregistered ctrl → removeControllerFromAllChannels → [] (no error)
      */
      const controller = new FakeController();

      const removed = manager.removeControllerFromAllChannels(
        controller as unknown as ReadableStreamDefaultController
      );

      expect(removed).toEqual([]);
    });
  });
});
