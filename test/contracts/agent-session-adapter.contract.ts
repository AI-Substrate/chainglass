/**
 * Contract test factory for IAgentSessionAdapter implementations.
 *
 * Per Plan 018: Agent Workspace Data Model Migration (Phase 1)
 * Per Critical Discovery 09: Contract tests prevent fake drift by ensuring
 * both AgentSessionAdapter (real) and FakeAgentSessionAdapter pass identical tests.
 *
 * Follows the established pattern from sample-adapter.contract.ts.
 */

import {
  AgentSession,
  type IAgentSessionAdapter,
  type WorkspaceContext,
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

const SESSION_1 = AgentSession.create({
  id: 'test-session-1',
  type: 'claude',
  status: 'active',
  createdAt: new Date('2026-01-27T10:00:00Z'),
  updatedAt: new Date('2026-01-27T10:00:00Z'),
});

const SESSION_2 = AgentSession.create({
  id: 'test-session-2',
  type: 'copilot',
  status: 'completed',
  createdAt: new Date('2026-01-27T11:00:00Z'),
  updatedAt: new Date('2026-01-27T11:00:00Z'),
});

const SESSION_3 = AgentSession.create({
  id: 'test-session-3',
  type: 'claude',
  status: 'terminated',
  createdAt: new Date('2026-01-27T09:00:00Z'),
  updatedAt: new Date('2026-01-27T12:00:00Z'),
});

// ==================== Contract Test Context ====================

/**
 * Test context for agent session adapter contract tests.
 */
export interface AgentSessionAdapterTestContext {
  /** The adapter implementation to test */
  adapter: IAgentSessionAdapter;
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
 * Contract tests that run against both AgentSessionAdapter and FakeAgentSessionAdapter.
 *
 * These tests verify the behavioral contract of IAgentSessionAdapter:
 * - save() stores session and returns success
 * - load() retrieves saved session
 * - list() returns all saved sessions ordered by createdAt descending
 * - remove() deletes session from storage
 * - exists() returns accurate existence status
 * - Error handling matches expected behavior
 */
export function agentSessionAdapterContractTests(
  createContext: () => AgentSessionAdapterTestContext
) {
  let ctx: AgentSessionAdapterTestContext;

  beforeEach(async () => {
    ctx = createContext();
    await ctx.setup();
  });

  describe(`${createContext().name} implements IAgentSessionAdapter contract`, () => {
    describe('save() contract', () => {
      it('should save a new session and return ok=true with created=true', async () => {
        /*
        Test Doc:
        - Why: Contract requires save returns success status for new sessions
        - Contract: save(ctx, session) → { ok: true, created: true } for new session
        - Quality Contribution: Ensures consistent return type
        */
        const result = await ctx.adapter.save(ctx.ctx, SESSION_1);

        expect(result.ok).toBe(true);
        expect(result.created).toBe(true);
        expect(result.errorCode).toBeUndefined();
      });

      it('should update existing session and return created=false', async () => {
        /*
        Test Doc:
        - Why: Contract requires save can update existing sessions
        - Contract: save() returns created=false for existing session
        - Quality Contribution: Differentiates create vs update
        */
        // First save
        await ctx.adapter.save(ctx.ctx, SESSION_1);

        // Update (same ID)
        const updatedSession = AgentSession.create({
          id: SESSION_1.id,
          type: SESSION_1.type,
          status: 'completed',
          createdAt: SESSION_1.createdAt,
        });
        const result = await ctx.adapter.save(ctx.ctx, updatedSession);

        expect(result.ok).toBe(true);
        expect(result.created).toBe(false);
      });

      it('should return session with updated timestamp', async () => {
        /*
        Test Doc:
        - Why: Per DYK-P3-02, adapter owns updatedAt - overwrites on every save
        - Contract: save() returns session with fresh updatedAt timestamp
        - Quality Contribution: Ensures timestamp management
        */
        const oldTimestamp = new Date('2020-01-01T00:00:00Z');
        const session = AgentSession.create({
          id: 'old-session',
          type: 'claude',
          status: 'active',
          createdAt: oldTimestamp,
          updatedAt: oldTimestamp,
        });

        const result = await ctx.adapter.save(ctx.ctx, session);

        expect(result.ok).toBe(true);
        expect(result.session).toBeDefined();
        // updatedAt should be refreshed (not the old timestamp)
        if (result.session) {
          expect(result.session.updatedAt.getTime()).toBeGreaterThan(oldTimestamp.getTime());
        }
      });
    });

    describe('load() contract', () => {
      it('should return saved session', async () => {
        /*
        Test Doc:
        - Why: Contract requires load returns saved data
        - Contract: load(ctx, id) → AgentSession with matching id
        - Quality Contribution: Ensures data integrity
        */
        await ctx.adapter.save(ctx.ctx, SESSION_1);

        const loaded = await ctx.adapter.load(ctx.ctx, SESSION_1.id);

        expect(loaded).toBeInstanceOf(AgentSession);
        expect(loaded.id).toBe(SESSION_1.id);
        expect(loaded.type).toBe(SESSION_1.type);
        expect(loaded.status).toBe(SESSION_1.status);
      });

      it('should throw EntityNotFoundError for missing session', async () => {
        /*
        Test Doc:
        - Why: Contract requires error for missing session
        - Contract: load(ctx, missing) throws EntityNotFoundError
        - Quality Contribution: Consistent error handling
        */
        await expect(ctx.adapter.load(ctx.ctx, 'nonexistent')).rejects.toThrow();
      });
    });

    describe('list() contract', () => {
      it('should return empty array when no sessions', async () => {
        /*
        Test Doc:
        - Why: Contract requires empty array for empty storage
        - Contract: list(ctx) → [] when no sessions
        - Quality Contribution: Prevents null handling issues
        */
        const sessions = await ctx.adapter.list(ctx.ctx);

        expect(Array.isArray(sessions)).toBe(true);
        expect(sessions).toHaveLength(0);
      });

      it('should return all saved sessions', async () => {
        /*
        Test Doc:
        - Why: Contract requires list returns all sessions
        - Contract: list(ctx) → AgentSession[] with all saved sessions
        - Quality Contribution: Ensures complete enumeration
        */
        await ctx.adapter.save(ctx.ctx, SESSION_1);
        await ctx.adapter.save(ctx.ctx, SESSION_2);

        const sessions = await ctx.adapter.list(ctx.ctx);

        expect(sessions).toHaveLength(2);
        expect(sessions.every((s) => s instanceof AgentSession)).toBe(true);

        const ids = sessions.map((s) => s.id);
        expect(ids).toContain(SESSION_1.id);
        expect(ids).toContain(SESSION_2.id);
      });

      it('should return sessions ordered by createdAt descending (newest first)', async () => {
        /*
        Test Doc:
        - Why: Per AC-05, sessions should be ordered by createdAt (newest first)
        - Contract: list(ctx) → AgentSession[] ordered by createdAt DESC
        - Quality Contribution: Consistent ordering for UI
        */
        // Save in non-chronological order
        await ctx.adapter.save(ctx.ctx, SESSION_2); // 11:00
        await ctx.adapter.save(ctx.ctx, SESSION_3); // 09:00
        await ctx.adapter.save(ctx.ctx, SESSION_1); // 10:00

        const sessions = await ctx.adapter.list(ctx.ctx);

        expect(sessions).toHaveLength(3);
        // Expect newest first: SESSION_2 (11:00) > SESSION_1 (10:00) > SESSION_3 (09:00)
        expect(sessions[0].id).toBe(SESSION_2.id);
        expect(sessions[1].id).toBe(SESSION_1.id);
        expect(sessions[2].id).toBe(SESSION_3.id);
      });
    });

    describe('remove() contract', () => {
      it('should remove saved session', async () => {
        /*
        Test Doc:
        - Why: Contract requires remove deletes session
        - Contract: remove(ctx, id) removes session from storage
        - Quality Contribution: Ensures cleanup works
        */
        await ctx.adapter.save(ctx.ctx, SESSION_1);

        const result = await ctx.adapter.remove(ctx.ctx, SESSION_1.id);

        expect(result.ok).toBe(true);

        // Verify removal
        const exists = await ctx.adapter.exists(ctx.ctx, SESSION_1.id);
        expect(exists).toBe(false);
      });

      it('should return E090 for missing session', async () => {
        /*
        Test Doc:
        - Why: Contract requires error for missing session
        - Contract: remove(ctx, missing) returns E090
        - Quality Contribution: Consistent error handling
        */
        const result = await ctx.adapter.remove(ctx.ctx, 'nonexistent');

        expect(result.ok).toBe(false);
        expect(result.errorCode).toBe('E090');
      });
    });

    describe('exists() contract', () => {
      it('should return true for saved session', async () => {
        /*
        Test Doc:
        - Why: Contract requires accurate existence check
        - Contract: exists(ctx, id) → true when session exists
        - Quality Contribution: Enables pre-check before operations
        */
        await ctx.adapter.save(ctx.ctx, SESSION_1);

        const exists = await ctx.adapter.exists(ctx.ctx, SESSION_1.id);

        expect(exists).toBe(true);
      });

      it('should return false for missing session', async () => {
        /*
        Test Doc:
        - Why: Contract requires accurate non-existence check
        - Contract: exists(ctx, missing) → false
        - Quality Contribution: Enables pre-check before operations
        */
        const exists = await ctx.adapter.exists(ctx.ctx, 'nonexistent');

        expect(exists).toBe(false);
      });
    });

    describe('workspace isolation contract', () => {
      it('should isolate sessions between workspaces', async () => {
        /*
        Test Doc:
        - Why: Sessions in one workspace should not appear in another
        - Contract: Sessions are scoped to worktreePath
        - Quality Contribution: Prevents cross-workspace data leakage
        */
        const ctx1 = ctx.createContext({ worktreePath: '/workspace-1' });
        const ctx2 = ctx.createContext({ worktreePath: '/workspace-2' });

        // Save to workspace 1
        await ctx.adapter.save(ctx1, SESSION_1);

        // Should not appear in workspace 2
        const exists = await ctx.adapter.exists(ctx2, SESSION_1.id);
        expect(exists).toBe(false);

        const sessions2 = await ctx.adapter.list(ctx2);
        expect(sessions2).toHaveLength(0);

        // Should appear in workspace 1
        const sessions1 = await ctx.adapter.list(ctx1);
        expect(sessions1).toHaveLength(1);
      });
    });
  });
}
