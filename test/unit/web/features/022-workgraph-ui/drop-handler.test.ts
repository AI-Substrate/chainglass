/**
 * Drop Handler Tests - Phase 3 (T004)
 *
 * Tests for drag-drop functionality: dropping WorkUnit from toolbox onto canvas.
 * Per DYK#1: Dropped nodes start as 'disconnected' status.
 * Per DYK#2: Uses addUnconnectedNode() for UI pattern.
 *
 * Testing approach: Full TDD - write tests first (RED), implement (GREEN), refactor.
 */

import {
  type DropHandlerContext,
  createDropHandler,
  extractDropPosition,
} from '@/features/022-workgraph-ui/drop-handler';
import { FakeWorkGraphUIInstance } from '@/features/022-workgraph-ui/fake-workgraph-ui-instance';
import {
  WORKUNIT_DRAG_TYPE,
  type WorkUnitDragData,
} from '@/features/022-workgraph-ui/workunit-toolbox';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

describe('Drop Handler', () => {
  let fakeInstance: FakeWorkGraphUIInstance;

  beforeEach(() => {
    fakeInstance = new FakeWorkGraphUIInstance({
      data: {
        slug: 'test-graph',
        worktreePath: '/test',
        nodes: [],
        edges: [],
      },
      layoutData: null,
    });
  });

  describe('extractDropPosition', () => {
    /**
     * Test: Extract drop position from React Flow event
     *
     * Purpose: Proves position extraction works correctly
     * Quality Contribution: Accurate node placement on drop
     * Acceptance Criteria: Returns correct x,y coordinates
     */
    test('should extract position from drop event with viewport transform', () => {
      // Simulate React Flow event with client coordinates and viewport
      const mockEvent = {
        clientX: 500,
        clientY: 300,
      } as DragEvent;

      const mockReactFlowBounds = {
        left: 100,
        top: 50,
        width: 800,
        height: 600,
      };

      // Viewport transform: panned 200px right, 100px down, zoom 1.5x
      const mockViewport = {
        x: 200,
        y: 100,
        zoom: 1.5,
      };

      const position = extractDropPosition(mockEvent, mockReactFlowBounds, mockViewport);

      // Position in flow coordinates:
      // clientX - bounds.left = 400 (relative to canvas)
      // (400 - viewport.x) / zoom = (400 - 200) / 1.5 = 133.33
      expect(position.x).toBeCloseTo(133.33, 0);
      // clientY - bounds.top = 250 (relative to canvas)
      // (250 - viewport.y) / zoom = (250 - 100) / 1.5 = 100
      expect(position.y).toBeCloseTo(100, 0);
    });

    /**
     * Test: Extract position with default zoom
     *
     * Purpose: Proves position extraction works at 1x zoom
     * Quality Contribution: Handles common case correctly
     */
    test('should handle default zoom of 1.0', () => {
      const mockEvent = {
        clientX: 300,
        clientY: 200,
      } as DragEvent;

      const mockReactFlowBounds = { left: 0, top: 0, width: 800, height: 600 };
      const mockViewport = { x: 0, y: 0, zoom: 1.0 };

      const position = extractDropPosition(mockEvent, mockReactFlowBounds, mockViewport);

      expect(position.x).toBe(300);
      expect(position.y).toBe(200);
    });
  });

  describe('createDropHandler', () => {
    /**
     * Test: Handler extracts unit from drag data
     *
     * Purpose: Proves drop handler correctly reads drag data
     * Quality Contribution: Ensures dropped item is identified
     * Acceptance Criteria: Handler can parse WorkUnitDragData
     */
    test('should extract unit slug from drag data', async () => {
      const handler = createDropHandler({
        instance: fakeInstance,
        getPosition: () => ({ x: 100, y: 200 }),
        onError: vi.fn(),
      });

      const dragData: WorkUnitDragData = {
        unitSlug: 'sample-agent',
        unitType: 'agent',
      };

      const mockEvent = createMockDropEvent(dragData);
      await handler(mockEvent);

      // Should have called addUnconnectedNode with correct unit
      const calls = fakeInstance.getMutationCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe('addUnconnectedNode');
      expect(calls[0].args[0]).toBe('sample-agent');
    });

    /**
     * Test: Handler calls addUnconnectedNode with position
     *
     * Purpose: Proves drop creates node at correct position
     * Quality Contribution: Node appears where user dropped it
     * Acceptance Criteria: Position passed to instance
     */
    test('should call addUnconnectedNode with drop position', async () => {
      const dropPosition = { x: 250, y: 350 };
      const handler = createDropHandler({
        instance: fakeInstance,
        getPosition: () => dropPosition,
        onError: vi.fn(),
      });

      const dragData: WorkUnitDragData = {
        unitSlug: 'sample-input',
        unitType: 'user-input',
      };

      await handler(createMockDropEvent(dragData));

      const calls = fakeInstance.getMutationCalls();
      expect(calls[0].args[1]).toEqual(dropPosition);
    });

    /**
     * Test: Handler ignores non-workunit drag data
     *
     * Purpose: Proves handler only processes correct MIME type
     * Quality Contribution: No accidental node creation from other drags
     * Acceptance Criteria: No mutation when wrong data type
     */
    test('should ignore drag data with wrong MIME type', async () => {
      const handler = createDropHandler({
        instance: fakeInstance,
        getPosition: () => ({ x: 0, y: 0 }),
        onError: vi.fn(),
      });

      const mockEvent = {
        preventDefault: vi.fn(),
        dataTransfer: {
          getData: vi.fn((type) => (type === 'text/plain' ? 'some text' : '')),
        },
      } as unknown as DragEvent;

      await handler(mockEvent);

      // Should not have called any mutation
      expect(fakeInstance.getMutationCalls()).toHaveLength(0);
    });

    /**
     * Test: Handler calls onError on failure
     *
     * Purpose: Proves error callback is invoked on failure
     * Quality Contribution: User feedback on problems
     * Acceptance Criteria: onError called with error message
     */
    test('should call onError when addUnconnectedNode fails', async () => {
      const onError = vi.fn();
      fakeInstance.setMutationResult({
        success: false,
        errors: [{ code: 'E001', message: 'Unit not found' }],
      });

      const handler = createDropHandler({
        instance: fakeInstance,
        getPosition: () => ({ x: 100, y: 100 }),
        onError,
      });

      const dragData: WorkUnitDragData = {
        unitSlug: 'nonexistent-unit',
        unitType: 'agent',
      };

      await handler(createMockDropEvent(dragData));

      expect(onError).toHaveBeenCalledWith('Unit not found');
    });

    /**
     * Test: Handler prevents default on drop
     *
     * Purpose: Proves browser default behavior is prevented
     * Quality Contribution: No unwanted browser navigation
     * Acceptance Criteria: preventDefault called
     */
    test('should prevent default on drop', async () => {
      const handler = createDropHandler({
        instance: fakeInstance,
        getPosition: () => ({ x: 0, y: 0 }),
        onError: vi.fn(),
      });

      const mockEvent = createMockDropEvent({ unitSlug: 'test', unitType: 'agent' });
      await handler(mockEvent);

      expect(mockEvent.preventDefault).toHaveBeenCalled();
    });

    /**
     * Test: Handler handles invalid JSON gracefully
     *
     * Purpose: Proves handler doesn't crash on malformed data
     * Quality Contribution: Robust error handling
     * Acceptance Criteria: No mutation, no crash
     */
    test('should handle invalid JSON in drag data gracefully', async () => {
      const onError = vi.fn();
      const handler = createDropHandler({
        instance: fakeInstance,
        getPosition: () => ({ x: 0, y: 0 }),
        onError,
      });

      const mockEvent = {
        preventDefault: vi.fn(),
        dataTransfer: {
          getData: vi.fn((type) => (type === WORKUNIT_DRAG_TYPE ? 'not valid json' : '')),
        },
      } as unknown as DragEvent;

      await handler(mockEvent);

      expect(fakeInstance.getMutationCalls()).toHaveLength(0);
      expect(onError).toHaveBeenCalled();
    });
  });
});

/**
 * Helper to create mock drop event with proper drag data.
 */
function createMockDropEvent(dragData: WorkUnitDragData): DragEvent {
  return {
    preventDefault: vi.fn(),
    dataTransfer: {
      getData: vi.fn((type) => (type === WORKUNIT_DRAG_TYPE ? JSON.stringify(dragData) : '')),
    },
  } as unknown as DragEvent;
}
