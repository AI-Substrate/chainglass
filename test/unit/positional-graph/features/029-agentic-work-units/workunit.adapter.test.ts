/**
 * WorkUnitAdapter Path Resolution Tests
 *
 * TDD RED Phase: Tests for WorkUnitAdapter path resolution methods.
 * Per DYK #1: WorkUnits live at `.chainglass/units/<slug>/`, NOT `.chainglass/data/units/`.
 *
 * @packageDocumentation
 */

import { FakeFileSystem, FakePathResolver } from '@chainglass/shared/fakes';
import type { WorkspaceContext } from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

// Import the adapter (will fail initially - TDD RED)
import { WorkUnitAdapter } from '../../../../../packages/positional-graph/src/features/029-agentic-work-units/workunit.adapter.js';

describe('WorkUnitAdapter', () => {
  let adapter: WorkUnitAdapter;
  let fakeFs: FakeFileSystem;
  let fakePathResolver: FakePathResolver;
  let ctx: WorkspaceContext;

  beforeEach(() => {
    fakeFs = new FakeFileSystem();
    fakePathResolver = new FakePathResolver();

    adapter = new WorkUnitAdapter(fakeFs, fakePathResolver);

    // Create a minimal WorkspaceContext for testing
    ctx = {
      workspaceSlug: 'test-workspace',
      workspaceName: 'Test Workspace',
      workspacePath: '/home/user/project',
      worktreePath: '/home/user/project',
      worktreeSlug: 'main',
      worktreeName: 'main',
      isMainWorktree: true,
    };
  });

  describe('getUnitDir()', () => {
    /**
     * Test Doc:
     * - Why: WorkUnits must be stored in `.chainglass/units/` (not `.chainglass/data/units/`)
     * - Contract: getUnitDir returns absolute path to unit's directory
     * - Usage Notes: Path includes worktreePath + .chainglass/units/<slug>
     * - Quality Contribution: Verifies correct storage path per DYK #1
     * - Worked Example: ctx.worktreePath='/home/user/project', slug='my-agent' → '/home/user/project/.chainglass/units/my-agent'
     */
    it('should return correct unit directory path', () => {
      const unitDir = adapter.getUnitDir(ctx, 'my-agent');

      expect(unitDir).toBe('/home/user/project/.chainglass/units/my-agent');
    });

    /**
     * Test Doc:
     * - Why: Different workspaces should have different unit paths
     * - Contract: Unit directory includes worktreePath
     * - Usage Notes: Supports multiple workspaces/worktrees
     * - Quality Contribution: Verifies workspace isolation
     * - Worked Example: worktreePath='/tmp/project-a' → '/tmp/project-a/.chainglass/units/<slug>'
     */
    it('should use worktreePath from context', () => {
      ctx.worktreePath = '/tmp/different-project';

      const unitDir = adapter.getUnitDir(ctx, 'test-unit');

      expect(unitDir).toBe('/tmp/different-project/.chainglass/units/test-unit');
    });

    /**
     * Test Doc:
     * - Why: Invalid slugs should be rejected to prevent security issues
     * - Contract: Throws error for invalid slug format
     * - Usage Notes: Slug must match /^[a-z][a-z0-9-]*$/
     * - Quality Contribution: Prevents directory injection attacks
     * - Worked Example: slug='invalid_slug' (has underscore) → throws
     */
    it('should throw for invalid slug format', () => {
      expect(() => adapter.getUnitDir(ctx, 'Invalid-Slug')).toThrow(/Invalid unit slug/);
      expect(() => adapter.getUnitDir(ctx, '123-starts-with-number')).toThrow(/Invalid unit slug/);
      expect(() => adapter.getUnitDir(ctx, 'has_underscore')).toThrow(/Invalid unit slug/);
      expect(() => adapter.getUnitDir(ctx, '../escape-attempt')).toThrow(/Invalid unit slug/);
    });

    /**
     * Test Doc:
     * - Why: Empty or whitespace-only slugs are invalid
     * - Contract: Throws error for empty slug
     * - Usage Notes: Caller must provide valid slug
     * - Quality Contribution: Prevents empty directory creation
     * - Worked Example: slug='' → throws
     */
    it('should throw for empty slug', () => {
      expect(() => adapter.getUnitDir(ctx, '')).toThrow(/Invalid unit slug/);
      expect(() => adapter.getUnitDir(ctx, '   ')).toThrow(/Invalid unit slug/);
    });
  });

  describe('getUnitYamlPath()', () => {
    /**
     * Test Doc:
     * - Why: Each unit has a unit.yaml definition file
     * - Contract: Returns path to unit.yaml within unit directory
     * - Usage Notes: Always appends 'unit.yaml' to unit directory
     * - Quality Contribution: Verifies yaml location convention
     * - Worked Example: slug='my-agent' → '/home/user/project/.chainglass/units/my-agent/unit.yaml'
     */
    it('should return correct unit.yaml path', () => {
      const yamlPath = adapter.getUnitYamlPath(ctx, 'my-agent');

      expect(yamlPath).toBe('/home/user/project/.chainglass/units/my-agent/unit.yaml');
    });

    /**
     * Test Doc:
     * - Why: Invalid slugs should be rejected consistently
     * - Contract: Throws same error as getUnitDir for invalid slug
     * - Usage Notes: Same validation rules apply
     * - Quality Contribution: Consistent validation across methods
     * - Worked Example: slug='../evil' → throws
     */
    it('should throw for invalid slug format', () => {
      expect(() => adapter.getUnitYamlPath(ctx, '../escape')).toThrow(/Invalid unit slug/);
    });
  });

  describe('getTemplatePath()', () => {
    /**
     * Test Doc:
     * - Why: Templates are stored relative to unit directory
     * - Contract: Returns absolute path by joining unit dir with relative path
     * - Usage Notes: Used for prompt_template and script paths
     * - Quality Contribution: Verifies template resolution
     * - Worked Example: slug='my-agent', relativePath='prompts/main.md' → '.../my-agent/prompts/main.md'
     */
    it('should return correct template path for prompts', () => {
      const templatePath = adapter.getTemplatePath(ctx, 'my-agent', 'prompts/main.md');

      expect(templatePath).toBe('/home/user/project/.chainglass/units/my-agent/prompts/main.md');
    });

    /**
     * Test Doc:
     * - Why: Code units use script paths
     * - Contract: Returns absolute path for script files
     * - Usage Notes: Works for any relative path within unit
     * - Quality Contribution: Verifies script resolution
     * - Worked Example: slug='pr-creator', relativePath='scripts/main.sh' → '.../pr-creator/scripts/main.sh'
     */
    it('should return correct template path for scripts', () => {
      const templatePath = adapter.getTemplatePath(ctx, 'pr-creator', 'scripts/main.sh');

      expect(templatePath).toBe('/home/user/project/.chainglass/units/pr-creator/scripts/main.sh');
    });

    /**
     * Test Doc:
     * - Why: Simple relative paths should work without subdirectories
     * - Contract: Returns path even for flat relative paths
     * - Usage Notes: Some units may have templates in root
     * - Quality Contribution: Verifies flexibility
     * - Worked Example: relativePath='main.md' → '.../my-agent/main.md'
     */
    it('should handle flat relative paths', () => {
      const templatePath = adapter.getTemplatePath(ctx, 'my-agent', 'main.md');

      expect(templatePath).toBe('/home/user/project/.chainglass/units/my-agent/main.md');
    });

    /**
     * Test Doc:
     * - Why: Invalid slugs should be rejected
     * - Contract: Throws error for invalid slug even with valid relative path
     * - Usage Notes: Slug validation happens first
     * - Quality Contribution: Consistent validation
     * - Worked Example: slug='../evil', relativePath='safe.md' → throws
     */
    it('should throw for invalid slug format', () => {
      expect(() => adapter.getTemplatePath(ctx, '../escape', 'prompts/main.md')).toThrow(
        /Invalid unit slug/
      );
    });
  });

  describe('listUnitSlugs()', () => {
    /**
     * Test Doc:
     * - Why: Service needs to enumerate all units
     * - Contract: Returns array of slug strings from units directory
     * - Usage Notes: Returns slugs, not full paths
     * - Quality Contribution: Verifies unit discovery
     * - Worked Example: directory has 'agent-a', 'agent-b' → ['agent-a', 'agent-b']
     */
    it('should list all unit slugs in units directory', async () => {
      // Setup: Create some unit directories
      fakeFs.setDir('/home/user/project/.chainglass/units/agent-a');
      fakeFs.setDir('/home/user/project/.chainglass/units/agent-b');
      fakeFs.setDir('/home/user/project/.chainglass/units/code-unit');

      const slugs = await adapter.listUnitSlugs(ctx);

      expect(slugs).toHaveLength(3);
      expect(slugs).toContain('agent-a');
      expect(slugs).toContain('agent-b');
      expect(slugs).toContain('code-unit');
    });

    /**
     * Test Doc:
     * - Why: Empty units directory is valid
     * - Contract: Returns empty array when no units exist
     * - Usage Notes: No error for empty directory
     * - Quality Contribution: Handles edge case
     * - Worked Example: empty .chainglass/units/ → []
     */
    it('should return empty array when no units exist', async () => {
      fakeFs.setDir('/home/user/project/.chainglass/units');

      const slugs = await adapter.listUnitSlugs(ctx);

      expect(slugs).toEqual([]);
    });

    /**
     * Test Doc:
     * - Why: Missing units directory should not throw
     * - Contract: Returns empty array when units directory doesn't exist
     * - Usage Notes: Graceful handling of missing directory
     * - Quality Contribution: Handles uninitialized workspaces
     * - Worked Example: no .chainglass/units/ → []
     */
    it('should return empty array when units directory does not exist', async () => {
      // No setup - directory doesn't exist

      const slugs = await adapter.listUnitSlugs(ctx);

      expect(slugs).toEqual([]);
    });
  });

  describe('unitExists()', () => {
    /**
     * Test Doc:
     * - Why: Need to check if a unit exists before loading
     * - Contract: Returns true if unit.yaml exists for the slug
     * - Usage Notes: Checks for unit.yaml specifically, not just directory
     * - Quality Contribution: Verifies existence check
     * - Worked Example: unit.yaml exists → true
     */
    it('should return true when unit.yaml exists', async () => {
      fakeFs.setFile(
        '/home/user/project/.chainglass/units/my-agent/unit.yaml',
        'slug: my-agent\ntype: agent'
      );

      const exists = await adapter.unitExists(ctx, 'my-agent');

      expect(exists).toBe(true);
    });

    /**
     * Test Doc:
     * - Why: Directory without unit.yaml is not a valid unit
     * - Contract: Returns false if unit.yaml doesn't exist
     * - Usage Notes: Must have unit.yaml, not just directory
     * - Quality Contribution: Prevents loading invalid units
     * - Worked Example: directory exists but no unit.yaml → false
     */
    it('should return false when unit.yaml does not exist', async () => {
      fakeFs.setDir('/home/user/project/.chainglass/units/incomplete-unit');
      // No unit.yaml file

      const exists = await adapter.unitExists(ctx, 'incomplete-unit');

      expect(exists).toBe(false);
    });

    /**
     * Test Doc:
     * - Why: Nonexistent units should return false
     * - Contract: Returns false for completely missing units
     * - Usage Notes: No error thrown
     * - Quality Contribution: Graceful missing unit handling
     * - Worked Example: slug 'nonexistent' → false
     */
    it('should return false for nonexistent unit', async () => {
      const exists = await adapter.unitExists(ctx, 'nonexistent');

      expect(exists).toBe(false);
    });

    /**
     * Test Doc:
     * - Why: Invalid slugs should throw, not return false
     * - Contract: Throws error for invalid slug format
     * - Usage Notes: Security check before filesystem access
     * - Quality Contribution: Prevents directory traversal
     * - Worked Example: slug='../etc' → throws
     */
    it('should throw for invalid slug format', async () => {
      await expect(adapter.unitExists(ctx, '../escape')).rejects.toThrow(/Invalid unit slug/);
    });
  });
});
