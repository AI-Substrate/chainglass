/**
 * Tests for SSE broadcast helper - Phase 4 (T003)
 *
 * Per ADR-0007: Notification-fetch pattern
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

// Mock the sseManager
vi.mock('@/lib/sse-manager', () => ({
  sseManager: {
    broadcast: vi.fn(),
  },
}));

import { sseManager } from '@/lib/sse-manager';
import { broadcastGraphUpdated } from '@/features/022-workgraph-ui/sse-broadcast';

describe('broadcastGraphUpdated', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should broadcast to workgraphs channel with graph-updated event', () => {
    /**
     * Purpose: Verify helper broadcasts to correct channel
     * Quality Contribution: Ensures SSE messages reach subscribers
     * Acceptance Criteria: broadcast called with 'workgraphs' channel
     */
    broadcastGraphUpdated('my-graph');

    expect(sseManager.broadcast).toHaveBeenCalledWith(
      'workgraphs',
      'graph-updated',
      { graphSlug: 'my-graph' }
    );
  });

  test('should include graphSlug in payload', () => {
    /**
     * Purpose: Verify payload format per ADR-0007
     * Quality Contribution: Clients can filter by graphSlug
     * Acceptance Criteria: payload contains exactly { graphSlug }
     */
    broadcastGraphUpdated('test-workflow');

    const call = vi.mocked(sseManager.broadcast).mock.calls[0];
    expect(call[2]).toEqual({ graphSlug: 'test-workflow' });
  });

  test('should NOT include additional data in payload (notification-fetch pattern)', () => {
    /**
     * Purpose: Enforce notification-fetch pattern per ADR-0007
     * Quality Contribution: Prevents data in SSE stream (clients fetch via REST)
     * Acceptance Criteria: No node data, state, or other fields in payload
     */
    broadcastGraphUpdated('workflow-1');

    const call = vi.mocked(sseManager.broadcast).mock.calls[0];
    const payload = call[2] as Record<string, unknown>;
    
    // Should only have graphSlug
    expect(Object.keys(payload)).toEqual(['graphSlug']);
  });
});
