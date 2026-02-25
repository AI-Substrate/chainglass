/**
 * Contract test factory for IWorkspaceRegistryAdapter implementations.
 *
 * Per Phase 1: Workspace Entity + Registry Adapter + Contract Tests
 * Per Critical Discovery 03: Contract tests prevent fake drift by ensuring
 * both WorkspaceRegistryAdapter (real) and FakeWorkspaceRegistryAdapter pass identical tests.
 *
 * Follows the established pattern from filesystem.contract.ts.
 */

import {
  EntityNotFoundError,
  type IWorkspaceRegistryAdapter,
  Workspace,
} from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

// ==================== Test Fixtures ====================

const SAMPLE_WORKSPACE_1 = Workspace.create({
  name: 'Test Project',
  path: '/home/user/test-project',
  slug: 'test-project',
  createdAt: new Date('2026-01-27T10:00:00Z'),
});

const SAMPLE_WORKSPACE_2 = Workspace.create({
  name: 'Another Project',
  path: '/home/user/another-project',
  slug: 'another-project',
  createdAt: new Date('2026-01-27T11:00:00Z'),
});

// ==================== Contract Test Context ====================

/**
 * Test context for workspace registry adapter contract tests.
 */
export interface WorkspaceRegistryAdapterTestContext {
  /** The adapter implementation to test */
  adapter: IWorkspaceRegistryAdapter;
  /** Setup function called before each test */
  setup: () => Promise<void>;
  /** Cleanup function called after each test */
  cleanup: () => Promise<void>;
  /** Description of the implementation */
  name: string;
}

// ==================== Contract Test Factory ====================

/**
 * Contract tests that run against both WorkspaceRegistryAdapter and FakeWorkspaceRegistryAdapter.
 *
 * These tests verify the behavioral contract of IWorkspaceRegistryAdapter:
 * - save() stores workspace and returns success
 * - load() retrieves saved workspace
 * - list() returns all saved workspaces
 * - remove() deletes workspace from registry
 * - exists() returns accurate existence status
 * - Error handling matches expected behavior
 */
export function workspaceRegistryAdapterContractTests(
  createContext: () => WorkspaceRegistryAdapterTestContext
) {
  let ctx: WorkspaceRegistryAdapterTestContext;

  beforeEach(async () => {
    ctx = createContext();
    await ctx.setup();
  });

  describe(`${createContext().name} implements IWorkspaceRegistryAdapter contract`, () => {
    describe('save() contract', () => {
      it('should save a workspace and return ok=true', async () => {
        /*
        Test Doc:
        - Why: Contract requires save returns success status
        - Contract: save(workspace) → { ok: true } on success
        - Quality Contribution: Ensures consistent return type
        */
        const result = await ctx.adapter.save(SAMPLE_WORKSPACE_1);

        expect(result.ok).toBe(true);
        expect(result.errorCode).toBeUndefined();
      });

      it('should reject duplicate slug with E075', async () => {
        /*
        Test Doc:
        - Why: Contract requires duplicate detection
        - Contract: save() returns E075 for duplicate slug
        - Quality Contribution: Prevents registry corruption
        */
        // Save first workspace
        await ctx.adapter.save(SAMPLE_WORKSPACE_1);

        // Try to save duplicate
        const result = await ctx.adapter.save(SAMPLE_WORKSPACE_1);

        expect(result.ok).toBe(false);
        expect(result.errorCode).toBe('E075');
      });
    });

    describe('load() contract', () => {
      it('should return saved workspace', async () => {
        /*
        Test Doc:
        - Why: Contract requires load returns saved data
        - Contract: load(slug) → Workspace with matching slug
        - Quality Contribution: Ensures data integrity
        */
        await ctx.adapter.save(SAMPLE_WORKSPACE_1);

        const loaded = await ctx.adapter.load(SAMPLE_WORKSPACE_1.slug);

        expect(loaded).toBeInstanceOf(Workspace);
        expect(loaded.slug).toBe(SAMPLE_WORKSPACE_1.slug);
        expect(loaded.name).toBe(SAMPLE_WORKSPACE_1.name);
        expect(loaded.path).toBe(SAMPLE_WORKSPACE_1.path);
      });

      it('should throw EntityNotFoundError for missing workspace', async () => {
        /*
        Test Doc:
        - Why: Contract requires error for missing workspace
        - Contract: load(missing) throws EntityNotFoundError
        - Quality Contribution: Consistent error handling
        */
        await expect(ctx.adapter.load('nonexistent')).rejects.toThrow(EntityNotFoundError);
      });
    });

    describe('list() contract', () => {
      it('should return empty array when no workspaces', async () => {
        /*
        Test Doc:
        - Why: Contract requires empty array for empty registry
        - Contract: list() → [] when no workspaces
        - Quality Contribution: Prevents null handling issues
        */
        const workspaces = await ctx.adapter.list();

        expect(Array.isArray(workspaces)).toBe(true);
        expect(workspaces).toHaveLength(0);
      });

      it('should return all saved workspaces', async () => {
        /*
        Test Doc:
        - Why: Contract requires list returns all workspaces
        - Contract: list() → Workspace[] with all saved workspaces
        - Quality Contribution: Ensures complete enumeration
        */
        await ctx.adapter.save(SAMPLE_WORKSPACE_1);
        await ctx.adapter.save(SAMPLE_WORKSPACE_2);

        const workspaces = await ctx.adapter.list();

        expect(workspaces).toHaveLength(2);
        expect(workspaces.every((w) => w instanceof Workspace)).toBe(true);

        const slugs = workspaces.map((w) => w.slug);
        expect(slugs).toContain(SAMPLE_WORKSPACE_1.slug);
        expect(slugs).toContain(SAMPLE_WORKSPACE_2.slug);
      });
    });

    describe('remove() contract', () => {
      it('should remove saved workspace', async () => {
        /*
        Test Doc:
        - Why: Contract requires remove deletes workspace
        - Contract: remove(slug) removes workspace from registry
        - Quality Contribution: Ensures cleanup works
        */
        await ctx.adapter.save(SAMPLE_WORKSPACE_1);

        const result = await ctx.adapter.remove(SAMPLE_WORKSPACE_1.slug);

        expect(result.ok).toBe(true);

        // Verify removal
        const exists = await ctx.adapter.exists(SAMPLE_WORKSPACE_1.slug);
        expect(exists).toBe(false);
      });

      it('should return E074 for missing workspace', async () => {
        /*
        Test Doc:
        - Why: Contract requires error for missing workspace
        - Contract: remove(missing) returns E074
        - Quality Contribution: Consistent error handling
        */
        const result = await ctx.adapter.remove('nonexistent');

        expect(result.ok).toBe(false);
        expect(result.errorCode).toBe('E074');
      });
    });

    describe('update() contract', () => {
      it('should update an existing workspace and return ok=true', async () => {
        /*
        Test Doc:
        - Why: Contract requires update returns success status
        - Contract: update(workspace) → { ok: true } on success
        - Quality Contribution: Ensures consistent return type
        */
        await ctx.adapter.save(SAMPLE_WORKSPACE_1);
        const updated = SAMPLE_WORKSPACE_1.withPreferences({ emoji: '🔮', color: 'purple' });
        const result = await ctx.adapter.update(updated);

        expect(result.ok).toBe(true);
      });

      it('should persist updated preferences through load', async () => {
        /*
        Test Doc:
        - Why: Contract requires update persists data
        - Contract: update() → load() returns updated workspace
        - Quality Contribution: Ensures data integrity through update cycle
        */
        await ctx.adapter.save(SAMPLE_WORKSPACE_1);
        const updated = SAMPLE_WORKSPACE_1.withPreferences({
          emoji: '🦊',
          color: 'orange',
          starred: true,
          sortOrder: 7,
        });
        await ctx.adapter.update(updated);

        const loaded = await ctx.adapter.load(SAMPLE_WORKSPACE_1.slug);
        expect(loaded.preferences.emoji).toBe('🦊');
        expect(loaded.preferences.color).toBe('orange');
        expect(loaded.preferences.starred).toBe(true);
        expect(loaded.preferences.sortOrder).toBe(7);
      });

      it('should return error for non-existent workspace', async () => {
        /*
        Test Doc:
        - Why: Contract requires error for missing workspace
        - Contract: update(missing) returns { ok: false, errorCode: 'E074' }
        - Quality Contribution: Consistent error handling
        */
        const result = await ctx.adapter.update(SAMPLE_WORKSPACE_1);

        expect(result.ok).toBe(false);
        expect(result.errorCode).toBe('E074');
      });

      it('should preserve other workspaces when updating one', async () => {
        /*
        Test Doc:
        - Why: Update must not corrupt other entries
        - Contract: update(ws1) does not affect ws2
        - Quality Contribution: Data isolation between workspaces
        */
        await ctx.adapter.save(SAMPLE_WORKSPACE_1);
        await ctx.adapter.save(SAMPLE_WORKSPACE_2);

        const updated = SAMPLE_WORKSPACE_1.withPreferences({ emoji: '🔥' });
        await ctx.adapter.update(updated);

        const other = await ctx.adapter.load(SAMPLE_WORKSPACE_2.slug);
        expect(other.slug).toBe(SAMPLE_WORKSPACE_2.slug);
        expect(other.name).toBe(SAMPLE_WORKSPACE_2.name);
      });
    });

    describe('exists() contract', () => {
      it('should return true for saved workspace', async () => {
        /*
        Test Doc:
        - Why: Contract requires accurate existence check
        - Contract: exists(slug) → true when workspace exists
        - Quality Contribution: Enables pre-check before operations
        */
        await ctx.adapter.save(SAMPLE_WORKSPACE_1);

        const exists = await ctx.adapter.exists(SAMPLE_WORKSPACE_1.slug);

        expect(exists).toBe(true);
      });

      it('should return false for missing workspace', async () => {
        /*
        Test Doc:
        - Why: Contract requires accurate non-existence check
        - Contract: exists(missing) → false
        - Quality Contribution: Enables pre-check before operations
        */
        const exists = await ctx.adapter.exists('nonexistent');

        expect(exists).toBe(false);
      });
    });
  });
}
