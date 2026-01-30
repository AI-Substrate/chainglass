/**
 * Unit tests for AgentSessionService.
 *
 * Per Plan 018: Agent Workspace Data Model Migration (Phase 1)
 * Per Testing Philosophy: Uses FakeAgentSessionAdapter (no mocks per R-TEST-007)
 */

import {
  AgentSession,
  AgentSessionService,
  FakeAgentSessionAdapter,
  type WorkspaceContext,
} from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

describe('AgentSessionService', () => {
  let service: AgentSessionService;
  let adapter: FakeAgentSessionAdapter;
  let ctx: WorkspaceContext;

  beforeEach(() => {
    adapter = new FakeAgentSessionAdapter();
    service = new AgentSessionService(adapter);
    ctx = {
      workspaceSlug: 'test-workspace',
      workspaceName: 'Test Workspace',
      workspacePath: '/home/user/test-workspace',
      worktreePath: '/home/user/test-workspace',
      worktreeBranch: 'main',
      isMainWorktree: true,
      hasGit: true,
    };
  });

  describe('createSession()', () => {
    it('should create a new session with generated ID', async () => {
      /*
      Test Doc:
      - Why: Users need to create new agent sessions
      - Contract: createSession(ctx, type) → { success: true, session }
      - Quality Contribution: Core functionality verification
      */
      const result = await service.createSession(ctx, 'claude');

      expect(result.success).toBe(true);
      expect(result.session).toBeDefined();
      expect(result.session?.type).toBe('claude');
      expect(result.session?.status).toBe('active');
      expect(result.session?.id).toMatch(/^\d+-[a-f0-9]{8}$/); // timestamp-uuid
      expect(result.errors).toHaveLength(0);
    });

    it('should create copilot session', async () => {
      const result = await service.createSession(ctx, 'copilot');

      expect(result.success).toBe(true);
      expect(result.session?.type).toBe('copilot');
    });

    it('should save session to adapter', async () => {
      await service.createSession(ctx, 'claude');

      expect(adapter.saveCalls).toHaveLength(1);
      const sessions = await adapter.list(ctx);
      expect(sessions).toHaveLength(1);
    });
  });

  describe('getSession()', () => {
    it('should return session when exists', async () => {
      /*
      Test Doc:
      - Why: Users need to retrieve session details
      - Contract: getSession(ctx, id) → AgentSession when exists
      - Quality Contribution: Read operation verification
      */
      const session = AgentSession.create({
        id: 'test-session',
        type: 'claude',
        status: 'active',
      });
      adapter.addSession(ctx, session);

      const result = await service.getSession(ctx, 'test-session');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('test-session');
    });

    it('should return null when session not found', async () => {
      const result = await service.getSession(ctx, 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('listSessions()', () => {
    it('should return empty array when no sessions', async () => {
      const sessions = await service.listSessions(ctx);

      expect(sessions).toEqual([]);
    });

    it('should return all sessions', async () => {
      adapter.addSession(ctx, AgentSession.create({ id: 's1', type: 'claude', status: 'active' }));
      adapter.addSession(
        ctx,
        AgentSession.create({ id: 's2', type: 'copilot', status: 'completed' })
      );

      const sessions = await service.listSessions(ctx);

      expect(sessions).toHaveLength(2);
    });
  });

  describe('deleteSession()', () => {
    it('should delete existing session', async () => {
      /*
      Test Doc:
      - Why: Users need to clean up old sessions
      - Contract: deleteSession(ctx, id) → { success: true, deletedId }
      - Quality Contribution: Deletion verification
      */
      const session = AgentSession.create({
        id: 'to-delete',
        type: 'claude',
        status: 'active',
      });
      adapter.addSession(ctx, session);

      const result = await service.deleteSession(ctx, 'to-delete');

      expect(result.success).toBe(true);
      expect(result.deletedId).toBe('to-delete');
      expect(result.errors).toHaveLength(0);
    });

    it('should return error for nonexistent session', async () => {
      const result = await service.deleteSession(ctx, 'nonexistent');

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E090');
    });
  });

  describe('updateSessionStatus()', () => {
    it('should update session status', async () => {
      /*
      Test Doc:
      - Why: Session status changes during lifecycle
      - Contract: updateSessionStatus(ctx, id, status) → { success: true, session }
      - Quality Contribution: Status transition verification
      */
      const session = AgentSession.create({
        id: 'to-update',
        type: 'claude',
        status: 'active',
      });
      adapter.addSession(ctx, session);

      const result = await service.updateSessionStatus(ctx, 'to-update', 'completed');

      expect(result.success).toBe(true);
      expect(result.session?.status).toBe('completed');
      expect(result.errors).toHaveLength(0);
    });

    it('should return error for nonexistent session', async () => {
      const result = await service.updateSessionStatus(ctx, 'nonexistent', 'completed');

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E090');
    });
  });
});
