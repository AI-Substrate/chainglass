/**
 * Unit tests for AgentEventAdapter.
 *
 * Per Plan 018: Agent Workspace Data Model Migration (Phase 2)
 * Per Testing Philosophy: Full TDD - tests written first (RED phase)
 *
 * T002: Tests for AgentEventAdapter - workspace-scoped event storage
 *
 * These tests verify:
 * - Workspace-scoped storage paths
 * - NDJSON format for event storage
 * - Timestamp-based event ID generation
 * - Session ID validation (path traversal prevention)
 * - Malformed NDJSON line handling
 *
 * Per Discovery 02: All methods take WorkspaceContext as first parameter.
 * Per DYK-04: Malformed NDJSON lines are silently skipped.
 */

import type { AgentStoredEvent } from '@chainglass/shared';
import { FakeFileSystem, FakePathResolver, validateSessionId } from '@chainglass/shared';
import type { IAgentEventAdapter, StoredAgentEvent, WorkspaceContext } from '@chainglass/workflow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Will import AgentEventAdapter once implemented (TDD RED → GREEN)
import { AgentEventAdapter } from '@chainglass/workflow';

// ==================== Test Fixtures ====================

/**
 * Create a test WorkspaceContext.
 */
function createTestContext(overrides?: Partial<WorkspaceContext>): WorkspaceContext {
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

const TEST_EVENT_1: AgentStoredEvent = {
  type: 'tool_call',
  timestamp: '2026-01-28T10:00:00.000Z',
  data: {
    toolName: 'Bash',
    input: { command: 'ls -la' },
    toolCallId: 'toolu_123',
  },
};

const TEST_EVENT_2: AgentStoredEvent = {
  type: 'tool_result',
  timestamp: '2026-01-28T10:00:01.000Z',
  data: {
    toolCallId: 'toolu_123',
    output: 'file.txt\ndir/\n',
    isError: false,
  },
};

const TEST_EVENT_3: AgentStoredEvent = {
  type: 'thinking',
  timestamp: '2026-01-28T10:00:02.000Z',
  data: {
    content: 'I need to analyze the files in this directory...',
  },
};

// ==================== Tests ====================

describe('AgentEventAdapter', () => {
  let adapter: IAgentEventAdapter;
  let fakeFs: FakeFileSystem;
  let fakePathResolver: FakePathResolver;
  let ctx: WorkspaceContext;

  beforeEach(() => {
    fakeFs = new FakeFileSystem();
    fakePathResolver = new FakePathResolver();
    adapter = new AgentEventAdapter(fakeFs, fakePathResolver);
    ctx = createTestContext();
  });

  afterEach(() => {
    fakeFs.reset();
    vi.clearAllMocks();
  });

  describe('append() - Basic Operations', () => {
    it('should append event and return stored event with generated ID', async () => {
      /*
      Test Doc:
      - Why: Core functionality - events must be stored with IDs
      - Contract: append(ctx, sessionId, event) → { ok: true, event: StoredAgentEvent }
      - Quality Contribution: Ensures events get unique IDs
      - Worked Example: append(ctx, "session-1", toolCall) → { ok: true, event: { id: "2026-..._xxxxx", ...toolCall } }
      */
      const result = await adapter.append(ctx, 'session-1', TEST_EVENT_1);

      expect(result.ok).toBe(true);
      expect(result.event).toBeDefined();
      expect(result.event?.id).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z_[a-z0-9]{5}$/);
      expect(result.event?.type).toBe('tool_call');
      expect(result.event?.data).toEqual(TEST_EVENT_1.data);
    });

    it('should create session directory if it does not exist', async () => {
      /*
      Test Doc:
      - Why: First event for a session needs to create the directory
      - Contract: append() creates <worktreePath>/.chainglass/data/agents/<sessionId>/
      - Quality Contribution: Automatic directory creation
      */
      await adapter.append(ctx, 'new-session', TEST_EVENT_1);

      const dirExists = await fakeFs.exists(
        '/home/user/test-workspace/.chainglass/data/agents/new-session'
      );
      expect(dirExists).toBe(true);
    });

    it('should store event in NDJSON format', async () => {
      /*
      Test Doc:
      - Why: Per spec - events stored as newline-delimited JSON
      - Contract: Events appended as single JSON line with \n
      - Quality Contribution: Consistent storage format
      */
      await adapter.append(ctx, 'session-1', TEST_EVENT_1);
      await adapter.append(ctx, 'session-1', TEST_EVENT_2);

      const content = await fakeFs.readFile(
        '/home/user/test-workspace/.chainglass/data/agents/session-1/events.ndjson'
      );

      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(2);

      const event1 = JSON.parse(lines[0]) as StoredAgentEvent;
      const event2 = JSON.parse(lines[1]) as StoredAgentEvent;

      expect(event1.type).toBe('tool_call');
      expect(event2.type).toBe('tool_result');
    });
  });

  describe('append() - Event ID Generation', () => {
    it('should generate timestamp-based event IDs per DYK-01', async () => {
      /*
      Test Doc:
      - Why: Per DYK-01 - timestamp IDs avoid race conditions, are naturally ordered
      - Contract: ID format is YYYY-MM-DDTHH:mm:ss.sssZ_xxxxx
      - Quality Contribution: Deterministic ordering
      */
      const result = await adapter.append(ctx, 'session-1', TEST_EVENT_1);

      expect(result.event?.id).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z_[a-z0-9]{5}$/);
    });

    it('should generate unique IDs for consecutive appends', async () => {
      /*
      Test Doc:
      - Why: Even rapid appends should get unique IDs
      - Contract: Each append() returns a unique event ID
      - Quality Contribution: No duplicate IDs
      */
      const result1 = await adapter.append(ctx, 'session-1', TEST_EVENT_1);
      const result2 = await adapter.append(ctx, 'session-1', TEST_EVENT_2);
      const result3 = await adapter.append(ctx, 'session-1', TEST_EVENT_3);

      const ids = [result1.event?.id, result2.event?.id, result3.event?.id];
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(3);
    });
  });

  describe('append() - Session ID Validation', () => {
    it('should reject session ID with path traversal (..)', async () => {
      /*
      Test Doc:
      - Why: Per DYK-02 - prevent path traversal attacks
      - Contract: append() fails for sessionId containing ".."
      - Quality Contribution: Security - no file access outside session dir
      */
      const result = await adapter.append(ctx, '../../../etc/passwd', TEST_EVENT_1);

      expect(result.ok).toBe(false);
      expect(result.errorMessage).toContain('Invalid session ID');
    });

    it('should reject session ID with forward slash', async () => {
      /*
      Test Doc:
      - Why: Slashes could create unexpected subdirectories
      - Contract: append() fails for sessionId containing "/"
      - Quality Contribution: Consistent directory structure
      */
      const result = await adapter.append(ctx, 'session/nested', TEST_EVENT_1);

      expect(result.ok).toBe(false);
      expect(result.errorMessage).toContain('Invalid session ID');
    });

    it('should accept valid session ID with hyphens and underscores', async () => {
      /*
      Test Doc:
      - Why: Common session ID formats should work
      - Contract: append() succeeds for alphanumeric with -_
      - Quality Contribution: Flexible but safe IDs
      */
      const result = await adapter.append(ctx, 'session-abc_123', TEST_EVENT_1);

      expect(result.ok).toBe(true);
    });
  });

  describe('getAll() - Basic Operations', () => {
    it('should return empty array for non-existent session', async () => {
      /*
      Test Doc:
      - Why: Non-existent session should not error
      - Contract: getAll(ctx, missing) → []
      - Quality Contribution: Graceful handling of missing data
      */
      const events = await adapter.getAll(ctx, 'nonexistent');

      expect(events).toEqual([]);
    });

    it('should return all events in chronological order', async () => {
      /*
      Test Doc:
      - Why: Events should maintain insertion order (oldest first)
      - Contract: getAll() returns events ordered by append time
      - Quality Contribution: Predictable event ordering
      */
      await adapter.append(ctx, 'session-1', TEST_EVENT_1);
      await adapter.append(ctx, 'session-1', TEST_EVENT_2);
      await adapter.append(ctx, 'session-1', TEST_EVENT_3);

      const events = await adapter.getAll(ctx, 'session-1');

      expect(events).toHaveLength(3);
      expect(events[0].type).toBe('tool_call');
      expect(events[1].type).toBe('tool_result');
      expect(events[2].type).toBe('thinking');
    });

    it('should include generated event IDs', async () => {
      /*
      Test Doc:
      - Why: Retrieved events should have their IDs
      - Contract: getAll() returns events with id field populated
      - Quality Contribution: Complete event data
      */
      await adapter.append(ctx, 'session-1', TEST_EVENT_1);

      const events = await adapter.getAll(ctx, 'session-1');

      expect(events[0].id).toBeDefined();
      expect(events[0].id).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('getAll() - NDJSON Malformed Line Handling', () => {
    it('should skip malformed JSON lines per DYK-04', async () => {
      /*
      Test Doc:
      - Why: Per DYK-04 - corrupted lines should not break entire file read
      - Contract: Malformed lines silently skipped, valid lines returned
      - Quality Contribution: Resilience to corruption
      */
      // Manually write a file with one malformed line
      const eventsPath =
        '/home/user/test-workspace/.chainglass/data/agents/session-1/events.ndjson';
      await fakeFs.mkdir('/home/user/test-workspace/.chainglass/data/agents/session-1', {
        recursive: true,
      });

      const validEvent: StoredAgentEvent = {
        ...TEST_EVENT_1,
        id: '2026-01-28T10:00:00.000Z_abc12',
      };
      const content = `${JSON.stringify(validEvent)}\n{invalid json\n${JSON.stringify({ ...TEST_EVENT_2, id: '2026-01-28T10:00:01.000Z_def34' })}\n`;
      await fakeFs.writeFile(eventsPath, content);

      const events = await adapter.getAll(ctx, 'session-1');

      // Should have 2 valid events, skipping the malformed one
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('tool_call');
      expect(events[1].type).toBe('tool_result');
    });

    it('should handle completely empty file', async () => {
      /*
      Test Doc:
      - Why: Empty file is valid state (all events archived, etc.)
      - Contract: getAll() returns [] for empty file
      - Quality Contribution: Graceful edge case handling
      */
      const eventsPath =
        '/home/user/test-workspace/.chainglass/data/agents/session-1/events.ndjson';
      await fakeFs.mkdir('/home/user/test-workspace/.chainglass/data/agents/session-1', {
        recursive: true,
      });
      await fakeFs.writeFile(eventsPath, '');

      const events = await adapter.getAll(ctx, 'session-1');

      expect(events).toEqual([]);
    });

    it('should handle file with only empty lines', async () => {
      /*
      Test Doc:
      - Why: Whitespace-only content should not break parsing
      - Contract: getAll() returns [] for whitespace-only content
      - Quality Contribution: Whitespace resilience
      */
      const eventsPath =
        '/home/user/test-workspace/.chainglass/data/agents/session-1/events.ndjson';
      await fakeFs.mkdir('/home/user/test-workspace/.chainglass/data/agents/session-1', {
        recursive: true,
      });
      await fakeFs.writeFile(eventsPath, '\n\n  \n\n');

      const events = await adapter.getAll(ctx, 'session-1');

      expect(events).toEqual([]);
    });
  });

  describe('getSince() - Incremental Fetch', () => {
    it('should return events after specified ID', async () => {
      /*
      Test Doc:
      - Why: Per AC19 - incremental sync after page refresh
      - Contract: getSince(ctx, sessionId, sinceId) returns events AFTER sinceId
      - Quality Contribution: Efficient incremental updates
      */
      const r1 = await adapter.append(ctx, 'session-1', TEST_EVENT_1);
      const r2 = await adapter.append(ctx, 'session-1', TEST_EVENT_2);
      const r3 = await adapter.append(ctx, 'session-1', TEST_EVENT_3);

      // Get events after the first event
      const events = await adapter.getSince(ctx, 'session-1', r1.event?.id);

      expect(events).toHaveLength(2);
      expect(events[0].id).toBe(r2.event?.id);
      expect(events[1].id).toBe(r3.event?.id);
    });

    it('should return empty array if sinceId is the last event', async () => {
      /*
      Test Doc:
      - Why: No new events after the last one
      - Contract: getSince() returns [] when sinceId is last event
      - Quality Contribution: Correct boundary handling
      */
      const r1 = await adapter.append(ctx, 'session-1', TEST_EVENT_1);
      const r2 = await adapter.append(ctx, 'session-1', TEST_EVENT_2);

      const events = await adapter.getSince(ctx, 'session-1', r2.event?.id);

      expect(events).toEqual([]);
    });

    it('should throw error if sinceId not found', async () => {
      /*
      Test Doc:
      - Why: Invalid sinceId should be detected
      - Contract: getSince() throws for non-existent sinceId
      - Quality Contribution: Clear error for bad input
      */
      await adapter.append(ctx, 'session-1', TEST_EVENT_1);

      await expect(adapter.getSince(ctx, 'session-1', 'nonexistent-id')).rejects.toThrow(
        /not found/i
      );
    });
  });

  describe('exists() - Session Check', () => {
    it('should return false for non-existent session', async () => {
      /*
      Test Doc:
      - Why: Check before operations to avoid errors
      - Contract: exists(ctx, missing) → false
      - Quality Contribution: Safe pre-checks
      */
      const result = await adapter.exists(ctx, 'nonexistent');

      expect(result).toBe(false);
    });

    it('should return true for session with events', async () => {
      /*
      Test Doc:
      - Why: Session exists after first append
      - Contract: exists() returns true when events.ndjson exists
      - Quality Contribution: Accurate existence check
      */
      await adapter.append(ctx, 'session-1', TEST_EVENT_1);

      const result = await adapter.exists(ctx, 'session-1');

      expect(result).toBe(true);
    });
  });

  describe('archive() - Session Archival', () => {
    it('should move events to archived directory', async () => {
      /*
      Test Doc:
      - Why: Per AC20 - old sessions can be archived
      - Contract: archive() moves events.ndjson to archived/<sessionId>/
      - Quality Contribution: Clean session management
      */
      await adapter.append(ctx, 'session-1', TEST_EVENT_1);

      const result = await adapter.archive(ctx, 'session-1');

      expect(result.ok).toBe(true);

      // Original should be gone (deleteAfterArchive default true)
      const originalExists = await adapter.exists(ctx, 'session-1');
      expect(originalExists).toBe(false);

      // Archived should exist
      const archivedPath =
        '/home/user/test-workspace/.chainglass/data/agents/archived/session-1/events.ndjson';
      const archivedExists = await fakeFs.exists(archivedPath);
      expect(archivedExists).toBe(true);
    });

    it('should preserve original when deleteAfterArchive is false', async () => {
      /*
      Test Doc:
      - Why: Sometimes need to keep original during migration
      - Contract: archive({ deleteAfterArchive: false }) keeps original
      - Quality Contribution: Flexible archival options
      */
      await adapter.append(ctx, 'session-1', TEST_EVENT_1);

      await adapter.archive(ctx, 'session-1', { deleteAfterArchive: false });

      // Both should exist
      const originalExists = await adapter.exists(ctx, 'session-1');
      expect(originalExists).toBe(true);

      const archivedPath =
        '/home/user/test-workspace/.chainglass/data/agents/archived/session-1/events.ndjson';
      const archivedExists = await fakeFs.exists(archivedPath);
      expect(archivedExists).toBe(true);
    });
  });

  describe('Workspace Isolation', () => {
    it('should store events in workspace-specific path', async () => {
      /*
      Test Doc:
      - Why: Per ADR-0008 - events scoped to worktreePath
      - Contract: Events stored at <worktreePath>/.chainglass/data/agents/
      - Quality Contribution: Multi-workspace support
      */
      const ctxA = createTestContext({ worktreePath: '/project-a' });
      const ctxB = createTestContext({ worktreePath: '/project-b' });

      await adapter.append(ctxA, 'session-1', TEST_EVENT_1);
      await adapter.append(ctxB, 'session-1', TEST_EVENT_2);

      // Check paths are different
      const pathA = '/project-a/.chainglass/data/agents/session-1/events.ndjson';
      const pathB = '/project-b/.chainglass/data/agents/session-1/events.ndjson';

      expect(await fakeFs.exists(pathA)).toBe(true);
      expect(await fakeFs.exists(pathB)).toBe(true);

      // Events should be isolated
      const eventsA = await adapter.getAll(ctxA, 'session-1');
      const eventsB = await adapter.getAll(ctxB, 'session-1');

      expect(eventsA).toHaveLength(1);
      expect(eventsA[0].type).toBe('tool_call');

      expect(eventsB).toHaveLength(1);
      expect(eventsB[0].type).toBe('tool_result');
    });
  });
});
