/**
 * Tests for restore() operation on IWorkflowRegistry.
 *
 * Per Phase 2 T013: TDD - Write failing tests first.
 * Tests cover: success copies to current/, E030 (not found),
 * E033 (version not found), E034 (no checkpoint), nested dirs.
 */

import { FakeFileSystem, FakeHashGenerator, FakePathResolver } from '@chainglass/shared';
import { FakeYamlParser, WorkflowRegistryService } from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

describe('WorkflowRegistryService.restore()', () => {
  let service: WorkflowRegistryService;
  let fs: FakeFileSystem;
  let pathResolver: FakePathResolver;
  let yamlParser: FakeYamlParser;
  let hashGenerator: FakeHashGenerator;

  const WORKFLOWS_DIR = '.chainglass/workflows';

  beforeEach(() => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
    yamlParser = new FakeYamlParser();
    hashGenerator = new FakeHashGenerator();

    service = new WorkflowRegistryService(fs, pathResolver, yamlParser, hashGenerator);
  });

  // ==================== T013: Restore Tests ====================

  describe('restore()', () => {
    it('should copy checkpoint files to current/ directory', async () => {
      /*
      Test Doc:
      - Why: Core restore functionality
      - Contract: restore() copies all checkpoint files to current/
      - Usage Notes: Replaces current/ contents entirely
      - Quality Contribution: Validates primary use case works
      - Worked Example: restore v001 → current/ matches v001 checkpoint
      */
      const workflowJson = JSON.stringify({
        slug: 'test-wf',
        name: 'Test Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, workflowJson);
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/checkpoints/v001-abc12345/wf.yaml`, 'name: Version 1');
      fs.setFile(
        `${WORKFLOWS_DIR}/test-wf/checkpoints/v001-abc12345/.checkpoint.json`,
        JSON.stringify({ ordinal: 1, hash: 'abc12345', createdAt: '2026-01-24T10:00:00Z' })
      );
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`, 'name: Current Version');

      // @ts-expect-error - Method doesn't exist yet (TDD RED phase)
      const result = await service.restore(WORKFLOWS_DIR, 'test-wf', 'v001');

      expect(result.errors).toHaveLength(0);
      expect(result.slug).toBe('test-wf');
      expect(result.version).toBe('v001-abc12345');
      // Verify current/ was updated
      expect(fs.getFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`)).toBe('name: Version 1');
    });

    it('should copy nested directories from checkpoint to current/ (DYK-01)', async () => {
      /*
      Test Doc:
      - Why: Per DYK-01, nested dirs must be restored
      - Contract: restore() copies phases/, commands/, etc.
      - Usage Notes: Uses copyDirectoryRecursive helper
      - Quality Contribution: Ensures complete template restoration
      - Worked Example: restore v001 with phases/ → current/ has phases/
      */
      const workflowJson = JSON.stringify({
        slug: 'test-wf',
        name: 'Test Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, workflowJson);
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/checkpoints/v001-abc12345/wf.yaml`, 'name: Version 1');
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/checkpoints/v001-abc12345/phases/setup.yaml`, 'phase: setup');
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/checkpoints/v001-abc12345/commands/run.md`, '# Run');
      fs.setFile(
        `${WORKFLOWS_DIR}/test-wf/checkpoints/v001-abc12345/.checkpoint.json`,
        JSON.stringify({ ordinal: 1, hash: 'abc12345', createdAt: '2026-01-24T10:00:00Z' })
      );
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`, 'name: Old');

      // @ts-expect-error - Method doesn't exist yet (TDD RED phase)
      const result = await service.restore(WORKFLOWS_DIR, 'test-wf', 'v001');

      expect(result.errors).toHaveLength(0);
      expect(fs.getFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`)).toBe('name: Version 1');
      expect(fs.getFile(`${WORKFLOWS_DIR}/test-wf/current/phases/setup.yaml`)).toBe('phase: setup');
      expect(fs.getFile(`${WORKFLOWS_DIR}/test-wf/current/commands/run.md`)).toBe('# Run');
    });

    it('should clear current/ before copying checkpoint', async () => {
      /*
      Test Doc:
      - Why: Old files shouldn't remain after restore
      - Contract: restore() removes existing current/ files first
      - Usage Notes: Destructive operation - no undo
      - Quality Contribution: Ensures clean restore state
      - Worked Example: current/ has extra.yaml not in checkpoint → extra.yaml removed
      */
      const workflowJson = JSON.stringify({
        slug: 'test-wf',
        name: 'Test Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, workflowJson);
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/checkpoints/v001-abc12345/wf.yaml`, 'name: Version 1');
      fs.setFile(
        `${WORKFLOWS_DIR}/test-wf/checkpoints/v001-abc12345/.checkpoint.json`,
        JSON.stringify({ ordinal: 1, hash: 'abc12345', createdAt: '2026-01-24T10:00:00Z' })
      );
      // current/ has extra files
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`, 'name: Current');
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/extra-file.yaml`, 'extra: content');
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/phases/old-phase.yaml`, 'old: phase');

      // @ts-expect-error - Method doesn't exist yet (TDD RED phase)
      await service.restore(WORKFLOWS_DIR, 'test-wf', 'v001');

      // Extra files should be gone
      expect(fs.getFile(`${WORKFLOWS_DIR}/test-wf/current/extra-file.yaml`)).toBeUndefined();
      expect(fs.getFile(`${WORKFLOWS_DIR}/test-wf/current/phases/old-phase.yaml`)).toBeUndefined();
      // Restored file should be there
      expect(fs.getFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`)).toBe('name: Version 1');
    });

    it('should accept full version string or ordinal only', async () => {
      /*
      Test Doc:
      - Why: User convenience - can specify "v001" or "v001-abc12345"
      - Contract: restore() accepts ordinal (v001) or full version (v001-abc12345)
      - Usage Notes: Ordinal lookup finds matching checkpoint
      - Quality Contribution: Flexible input handling
      - Worked Example: restore("v001") or restore("v001-abc12345") both work
      */
      const workflowJson = JSON.stringify({
        slug: 'test-wf',
        name: 'Test Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, workflowJson);
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/checkpoints/v001-abc12345/wf.yaml`, 'name: Version 1');
      fs.setFile(
        `${WORKFLOWS_DIR}/test-wf/checkpoints/v001-abc12345/.checkpoint.json`,
        JSON.stringify({ ordinal: 1, hash: 'abc12345', createdAt: '2026-01-24T10:00:00Z' })
      );
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`, 'name: Current');

      // Using just ordinal
      // @ts-expect-error - Method doesn't exist yet (TDD RED phase)
      const result = await service.restore(WORKFLOWS_DIR, 'test-wf', 'v001');

      expect(result.errors).toHaveLength(0);
      expect(result.version).toBe('v001-abc12345');
    });

    it('should error E030 when workflow not found', async () => {
      /*
      Test Doc:
      - Why: Can't restore non-existent workflow
      - Contract: restore() returns E030 when workflow doesn't exist
      - Usage Notes: Error includes actionable guidance
      - Quality Contribution: Clear error for typos in slug
      - Worked Example: restore("nonexistent-wf", "v001") → E030
      */
      // No workflow directory

      // @ts-expect-error - Method doesn't exist yet (TDD RED phase)
      const result = await service.restore(WORKFLOWS_DIR, 'nonexistent-wf', 'v001');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E030');
    });

    it('should error E033 when version not found', async () => {
      /*
      Test Doc:
      - Why: Can't restore to non-existent version
      - Contract: restore() returns E033 when version doesn't exist
      - Usage Notes: Error includes available versions hint
      - Quality Contribution: Clear error for wrong version
      - Worked Example: restore("test-wf", "v999") → E033
      */
      const workflowJson = JSON.stringify({
        slug: 'test-wf',
        name: 'Test Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, workflowJson);
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/checkpoints/v001-abc12345/wf.yaml`, 'name: Version 1');
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`, 'name: Current');

      // @ts-expect-error - Method doesn't exist yet (TDD RED phase)
      const result = await service.restore(WORKFLOWS_DIR, 'test-wf', 'v999');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E033');
    });

    it('should error E034 when no checkpoints exist', async () => {
      /*
      Test Doc:
      - Why: Nothing to restore if no checkpoints
      - Contract: restore() returns E034 when checkpoints/ is empty
      - Usage Notes: Suggests creating checkpoint first
      - Quality Contribution: Clear error for new workflows
      - Worked Example: restore on workflow with no checkpoints → E034
      */
      const workflowJson = JSON.stringify({
        slug: 'test-wf',
        name: 'Test Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, workflowJson);
      fs.setDir(`${WORKFLOWS_DIR}/test-wf/checkpoints`); // Empty
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`, 'name: Current');

      // @ts-expect-error - Method doesn't exist yet (TDD RED phase)
      const result = await service.restore(WORKFLOWS_DIR, 'test-wf', 'v001');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E034');
    });
  });
});
