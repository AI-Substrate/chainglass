/**
 * Contract test factory for IAgentEventAdapter implementations.
 *
 * Per Plan 018: Agent Workspace Data Model Migration (Phase 2)
 * Per Critical Discovery 09: Contract tests prevent fake drift by ensuring
 * both AgentEventAdapter (real) and FakeAgentEventAdapter pass identical tests.
 *
 * Follows the established pattern from agent-session-adapter.contract.ts.
 */

import type {
  AgentStoredEvent,
  IAgentEventAdapter,
  StoredAgentEvent,
  WorkspaceContext,
} from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

// ==================== Test Fixtures ====================

/**
 * Create a default WorkspaceContext for testing.
 */
export function createDefaultContext(overrides?: Partial<WorkspaceContext>): WorkspaceContext {
  return {
    workspaceSlug: 'test-workspace',
    workspaceName: 'Test Workspace',
    workspacePath: '/home/user/test-workspace',
    worktreePath: '/home/user/test-workspace',
    worktreeBranch: 'main',
    isMainWorktree: true,
    hasGit: true,
    ...overrides,
  };
}

const EVENT_1: AgentStoredEvent = {
  type: 'tool_call',
  timestamp: '2026-01-28T10:00:00.000Z',
  data: {
    toolName: 'Bash',
    input: { command: 'ls' },
    toolCallId: 'toolu_123',
  },
};

const EVENT_2: AgentStoredEvent = {
  type: 'tool_result',
  timestamp: '2026-01-28T10:00:01.000Z',
  data: {
    toolCallId: 'toolu_123',
    output: 'file.txt\n',
    isError: false,
  },
};

const EVENT_3: AgentStoredEvent = {
  type: 'thinking',
  timestamp: '2026-01-28T10:00:02.000Z',
  data: {
    content: 'Analyzing the output...',
  },
};

// ==================== Contract Test Context ====================

/**
 * Test context for agent event adapter contract tests.
 */
export interface AgentEventAdapterTestContext {
  /** The adapter implementation to test */
  adapter: IAgentEventAdapter;
  /** Default workspace context for simple tests */
  ctx: WorkspaceContext;
  /** Create a new context with optional overrides (for isolation tests) */
  createContext: (overrides?: Partial<WorkspaceContext>) => WorkspaceContext;
  /** Setup function called before each test */
  setup: () => Promise<void>;
  /** Cleanup function called after each test */
  cleanup: () => Promise<void>;
  /** Description of the implementation */
  name: string;
}

// ==================== Contract Test Factory ====================

/**
 * Contract tests that run against both AgentEventAdapter and FakeAgentEventAdapter.
 *
 * These tests verify the behavioral contract of IAgentEventAdapter:
 * - append() stores event with generated ID and returns success
 * - getAll() returns all stored events in chronological order
 * - getSince() returns events after specified ID
 * - archive() moves events to archived location
 * - exists() returns accurate existence status
 * - Error handling matches expected behavior
 */
export function agentEventAdapterContractTests(createContext: () => AgentEventAdapterTestContext) {
  let ctx: AgentEventAdapterTestContext;

  beforeEach(async () => {
    ctx = createContext();
    await ctx.setup();
  });

  describe(`${createContext().name} implements IAgentEventAdapter contract`, () => {
    describe('append() contract', () => {
      it('should append event and return ok=true with stored event', async () => {
        /*
        Test Doc:
        - Why: Contract requires append returns success status with stored event
        - Contract: append(ctx, sessionId, event) → { ok: true, event: StoredAgentEvent }
        - Quality Contribution: Ensures consistent return type
        */
        const result = await ctx.adapter.append(ctx.ctx, 'session-1', EVENT_1);

        expect(result.ok).toBe(true);
        expect(result.event).toBeDefined();
        expect(result.errorMessage).toBeUndefined();
      });

      it('should generate timestamp-based event ID', async () => {
        /*
        Test Doc:
        - Why: Per DYK-01 - timestamp IDs for ordering
        - Contract: Event ID format: YYYY-MM-DDTHH:mm:ss.sssZ_xxxxx
        - Quality Contribution: Deterministic ordering
        */
        const result = await ctx.adapter.append(ctx.ctx, 'session-1', EVENT_1);

        expect(result.event?.id).toMatch(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z_[a-z0-9]{5}$/
        );
      });

      it('should generate unique IDs for consecutive appends', async () => {
        /*
        Test Doc:
        - Why: Rapid appends must get unique IDs
        - Contract: Each append() returns a unique event ID
        - Quality Contribution: No duplicate IDs
        */
        const r1 = await ctx.adapter.append(ctx.ctx, 'session-1', EVENT_1);
        const r2 = await ctx.adapter.append(ctx.ctx, 'session-1', EVENT_2);
        const r3 = await ctx.adapter.append(ctx.ctx, 'session-1', EVENT_3);

        const ids = [r1.event?.id, r2.event?.id, r3.event?.id];
        const uniqueIds = new Set(ids);

        expect(uniqueIds.size).toBe(3);
      });

      it('should preserve event data in stored event', async () => {
        /*
        Test Doc:
        - Why: Event data must not be modified
        - Contract: StoredAgentEvent contains original event data
        - Quality Contribution: Data integrity
        */
        const result = await ctx.adapter.append(ctx.ctx, 'session-1', EVENT_1);

        expect(result.event?.type).toBe('tool_call');
        expect(result.event?.timestamp).toBe('2026-01-28T10:00:00.000Z');
        expect(result.event?.data).toEqual(EVENT_1.data);
      });
    });

    describe('getAll() contract', () => {
      it('should return empty array for non-existent session', async () => {
        /*
        Test Doc:
        - Why: Non-existent session should not error
        - Contract: getAll(ctx, missing) → []
        - Quality Contribution: Graceful handling
        */
        const events = await ctx.adapter.getAll(ctx.ctx, 'nonexistent');

        expect(Array.isArray(events)).toBe(true);
        expect(events).toHaveLength(0);
      });

      it('should return all stored events', async () => {
        /*
        Test Doc:
        - Why: All appended events must be retrievable
        - Contract: getAll() returns all appended events
        - Quality Contribution: Data persistence
        */
        await ctx.adapter.append(ctx.ctx, 'session-1', EVENT_1);
        await ctx.adapter.append(ctx.ctx, 'session-1', EVENT_2);

        const events = await ctx.adapter.getAll(ctx.ctx, 'session-1');

        expect(events).toHaveLength(2);
      });

      it('should return events in chronological order', async () => {
        /*
        Test Doc:
        - Why: Events must be ordered for correct display
        - Contract: getAll() returns events in append order (oldest first)
        - Quality Contribution: Predictable ordering
        */
        await ctx.adapter.append(ctx.ctx, 'session-1', EVENT_1);
        await ctx.adapter.append(ctx.ctx, 'session-1', EVENT_2);
        await ctx.adapter.append(ctx.ctx, 'session-1', EVENT_3);

        const events = await ctx.adapter.getAll(ctx.ctx, 'session-1');

        expect(events[0].type).toBe('tool_call');
        expect(events[1].type).toBe('tool_result');
        expect(events[2].type).toBe('thinking');
      });
    });

    describe('getSince() contract', () => {
      it('should return events after specified ID', async () => {
        /*
        Test Doc:
        - Why: Per AC19 - incremental sync
        - Contract: getSince() returns events AFTER sinceId (exclusive)
        - Quality Contribution: Efficient updates
        */
        const r1 = await ctx.adapter.append(ctx.ctx, 'session-1', EVENT_1);
        const r2 = await ctx.adapter.append(ctx.ctx, 'session-1', EVENT_2);
        const r3 = await ctx.adapter.append(ctx.ctx, 'session-1', EVENT_3);

        const events = await ctx.adapter.getSince(ctx.ctx, 'session-1', r1.event?.id);

        expect(events).toHaveLength(2);
        expect(events[0].id).toBe(r2.event?.id);
        expect(events[1].id).toBe(r3.event?.id);
      });

      it('should return empty array if sinceId is last event', async () => {
        /*
        Test Doc:
        - Why: No new events after last one
        - Contract: getSince(lastId) returns []
        - Quality Contribution: Correct boundary
        */
        await ctx.adapter.append(ctx.ctx, 'session-1', EVENT_1);
        const r2 = await ctx.adapter.append(ctx.ctx, 'session-1', EVENT_2);

        const events = await ctx.adapter.getSince(ctx.ctx, 'session-1', r2.event?.id);

        expect(events).toEqual([]);
      });

      it('should throw error for non-existent sinceId', async () => {
        /*
        Test Doc:
        - Why: Invalid sinceId must be detected
        - Contract: getSince(invalid) throws
        - Quality Contribution: Clear errors
        */
        await ctx.adapter.append(ctx.ctx, 'session-1', EVENT_1);

        await expect(ctx.adapter.getSince(ctx.ctx, 'session-1', 'nonexistent-id')).rejects.toThrow(
          /not found/i
        );
      });
    });

    describe('exists() contract', () => {
      it('should return false for non-existent session', async () => {
        /*
        Test Doc:
        - Why: Non-existent session should return false
        - Contract: exists(ctx, missing) → false
        - Quality Contribution: Safe pre-checks
        */
        const result = await ctx.adapter.exists(ctx.ctx, 'nonexistent');

        expect(result).toBe(false);
      });

      it('should return true for session with events', async () => {
        /*
        Test Doc:
        - Why: Session exists after append
        - Contract: exists() returns true after append
        - Quality Contribution: Accurate check
        */
        await ctx.adapter.append(ctx.ctx, 'session-1', EVENT_1);

        const result = await ctx.adapter.exists(ctx.ctx, 'session-1');

        expect(result).toBe(true);
      });
    });

    describe('archive() contract', () => {
      it('should archive session and remove original by default', async () => {
        /*
        Test Doc:
        - Why: Per AC20 - sessions can be archived
        - Contract: archive() removes original (deleteAfterArchive=true default)
        - Quality Contribution: Clean session management
        */
        await ctx.adapter.append(ctx.ctx, 'session-1', EVENT_1);

        const result = await ctx.adapter.archive(ctx.ctx, 'session-1');

        expect(result.ok).toBe(true);

        // Original should be gone
        const exists = await ctx.adapter.exists(ctx.ctx, 'session-1');
        expect(exists).toBe(false);
      });

      it('should preserve original when deleteAfterArchive is false', async () => {
        /*
        Test Doc:
        - Why: Migration scenarios need to keep original
        - Contract: archive({ deleteAfterArchive: false }) keeps original
        - Quality Contribution: Flexible archival
        */
        await ctx.adapter.append(ctx.ctx, 'session-1', EVENT_1);

        await ctx.adapter.archive(ctx.ctx, 'session-1', { deleteAfterArchive: false });

        // Original should still exist
        const exists = await ctx.adapter.exists(ctx.ctx, 'session-1');
        expect(exists).toBe(true);
      });
    });

    describe('workspace isolation contract', () => {
      it('should isolate events between workspaces', async () => {
        /*
        Test Doc:
        - Why: Events in one workspace must not leak to another
        - Contract: Events scoped to worktreePath
        - Quality Contribution: Prevents data leakage
        */
        const ctx1 = ctx.createContext({ worktreePath: '/workspace-1' });
        const ctx2 = ctx.createContext({ worktreePath: '/workspace-2' });

        // Append to workspace 1
        await ctx.adapter.append(ctx1, 'session-1', EVENT_1);

        // Should not appear in workspace 2
        const existsIn2 = await ctx.adapter.exists(ctx2, 'session-1');
        expect(existsIn2).toBe(false);

        const eventsIn2 = await ctx.adapter.getAll(ctx2, 'session-1');
        expect(eventsIn2).toHaveLength(0);

        // Should appear in workspace 1
        const eventsIn1 = await ctx.adapter.getAll(ctx1, 'session-1');
        expect(eventsIn1).toHaveLength(1);
      });

      it('should allow same sessionId in different workspaces', async () => {
        /*
        Test Doc:
        - Why: Same session ID in different projects is valid
        - Contract: sessionId + worktreePath forms unique key
        - Quality Contribution: Multi-project support
        */
        const ctx1 = ctx.createContext({ worktreePath: '/workspace-1' });
        const ctx2 = ctx.createContext({ worktreePath: '/workspace-2' });

        await ctx.adapter.append(ctx1, 'session-1', EVENT_1);
        await ctx.adapter.append(ctx2, 'session-1', EVENT_2);

        const events1 = await ctx.adapter.getAll(ctx1, 'session-1');
        const events2 = await ctx.adapter.getAll(ctx2, 'session-1');

        expect(events1).toHaveLength(1);
        expect(events1[0].type).toBe('tool_call');

        expect(events2).toHaveLength(1);
        expect(events2[0].type).toBe('tool_result');
      });
    });
  });
}
