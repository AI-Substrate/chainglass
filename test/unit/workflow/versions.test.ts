/**
 * Tests for versions() operation on IWorkflowRegistry.
 *
 * Per Phase 2 T014: TDD - Write failing tests first.
 * Tests cover: list all checkpoints, sorted by ordinal desc, includes metadata.
 */

import { FakeFileSystem, FakeHashGenerator, FakePathResolver } from '@chainglass/shared';
import { FakeYamlParser, WorkflowRegistryService } from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

describe('WorkflowRegistryService.versions()', () => {
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

  // ==================== T014: Versions Tests ====================

  describe('versions()', () => {
    it('should return empty array when no checkpoints exist', async () => {
      /*
      Test Doc:
      - Why: Empty state is valid
      - Contract: versions() returns { versions: [] } when checkpoints/ empty
      - Usage Notes: No error, just empty list
      - Quality Contribution: Handles empty state gracefully
      - Worked Example: empty checkpoints/ → versions: []
      */
      const workflowJson = JSON.stringify({
        slug: 'test-wf',
        name: 'Test Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, workflowJson);
      fs.setDir(`${WORKFLOWS_DIR}/test-wf/checkpoints`);
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`, 'name: Test');

      // @ts-expect-error - Method doesn't exist yet (TDD RED phase)
      const result = await service.versions(WORKFLOWS_DIR, 'test-wf');

      expect(result.errors).toHaveLength(0);
      expect(result.versions).toEqual([]);
    });

    it('should list all checkpoints', async () => {
      /*
      Test Doc:
      - Why: Primary versions listing functionality
      - Contract: versions() returns all checkpoint info
      - Usage Notes: Each version has ordinal, hash, version string, createdAt
      - Quality Contribution: Enables version history viewing
      - Worked Example: v001, v002, v003 → 3 versions in list
      */
      const workflowJson = JSON.stringify({
        slug: 'test-wf',
        name: 'Test Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, workflowJson);
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/checkpoints/v001-aaa11111/wf.yaml`, 'v1');
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/checkpoints/v002-bbb22222/wf.yaml`, 'v2');
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/checkpoints/v003-ccc33333/wf.yaml`, 'v3');
      fs.setFile(
        `${WORKFLOWS_DIR}/test-wf/checkpoints/v001-aaa11111/.checkpoint.json`,
        JSON.stringify({ ordinal: 1, hash: 'aaa11111', createdAt: '2026-01-24T09:00:00Z' })
      );
      fs.setFile(
        `${WORKFLOWS_DIR}/test-wf/checkpoints/v002-bbb22222/.checkpoint.json`,
        JSON.stringify({ ordinal: 2, hash: 'bbb22222', createdAt: '2026-01-24T10:00:00Z' })
      );
      fs.setFile(
        `${WORKFLOWS_DIR}/test-wf/checkpoints/v003-ccc33333/.checkpoint.json`,
        JSON.stringify({ ordinal: 3, hash: 'ccc33333', createdAt: '2026-01-24T11:00:00Z' })
      );
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`, 'name: Test');

      // @ts-expect-error - Method doesn't exist yet (TDD RED phase)
      const result = await service.versions(WORKFLOWS_DIR, 'test-wf');

      expect(result.errors).toHaveLength(0);
      expect(result.versions).toHaveLength(3);
    });

    it('should sort versions by ordinal descending (newest first)', async () => {
      /*
      Test Doc:
      - Why: Most recent version is usually most relevant
      - Contract: versions() sorts by ordinal descending
      - Usage Notes: v003 first, v001 last
      - Quality Contribution: Better UX for version selection
      - Worked Example: v001, v003, v002 → [v003, v002, v001]
      */
      const workflowJson = JSON.stringify({
        slug: 'test-wf',
        name: 'Test Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, workflowJson);
      // Create in non-sequential order to verify sorting
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/checkpoints/v001-aaa11111/wf.yaml`, 'v1');
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/checkpoints/v003-ccc33333/wf.yaml`, 'v3');
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/checkpoints/v002-bbb22222/wf.yaml`, 'v2');
      fs.setFile(
        `${WORKFLOWS_DIR}/test-wf/checkpoints/v001-aaa11111/.checkpoint.json`,
        JSON.stringify({ ordinal: 1, hash: 'aaa11111', createdAt: '2026-01-24T09:00:00Z' })
      );
      fs.setFile(
        `${WORKFLOWS_DIR}/test-wf/checkpoints/v003-ccc33333/.checkpoint.json`,
        JSON.stringify({ ordinal: 3, hash: 'ccc33333', createdAt: '2026-01-24T11:00:00Z' })
      );
      fs.setFile(
        `${WORKFLOWS_DIR}/test-wf/checkpoints/v002-bbb22222/.checkpoint.json`,
        JSON.stringify({ ordinal: 2, hash: 'bbb22222', createdAt: '2026-01-24T10:00:00Z' })
      );
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`, 'name: Test');

      // @ts-expect-error - Method doesn't exist yet (TDD RED phase)
      const result = await service.versions(WORKFLOWS_DIR, 'test-wf');

      expect(result.errors).toHaveLength(0);
      expect(result.versions[0].ordinal).toBe(3);
      expect(result.versions[1].ordinal).toBe(2);
      expect(result.versions[2].ordinal).toBe(1);
    });

    it('should include checkpoint metadata (createdAt, comment)', async () => {
      /*
      Test Doc:
      - Why: Metadata helps users choose which version to restore
      - Contract: versions() includes createdAt and optional comment from .checkpoint.json
      - Usage Notes: Reads .checkpoint.json from each checkpoint
      - Quality Contribution: Rich version info for decision making
      - Worked Example: version with comment "Release 1" → comment included
      */
      const workflowJson = JSON.stringify({
        slug: 'test-wf',
        name: 'Test Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, workflowJson);
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/checkpoints/v001-aaa11111/wf.yaml`, 'v1');
      fs.setFile(
        `${WORKFLOWS_DIR}/test-wf/checkpoints/v001-aaa11111/.checkpoint.json`,
        JSON.stringify({
          ordinal: 1,
          hash: 'aaa11111',
          createdAt: '2026-01-24T09:00:00Z',
          comment: 'Initial release',
        })
      );
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`, 'name: Test');

      // @ts-expect-error - Method doesn't exist yet (TDD RED phase)
      const result = await service.versions(WORKFLOWS_DIR, 'test-wf');

      expect(result.errors).toHaveLength(0);
      expect(result.versions[0].createdAt).toBe('2026-01-24T09:00:00Z');
      expect(result.versions[0].comment).toBe('Initial release');
    });

    it('should error E030 when workflow not found', async () => {
      /*
      Test Doc:
      - Why: Can't list versions of non-existent workflow
      - Contract: versions() returns E030 when workflow doesn't exist
      - Usage Notes: Same error as info()
      - Quality Contribution: Consistent error handling
      - Worked Example: versions("nonexistent-wf") → E030
      */
      // No workflow directory

      // @ts-expect-error - Method doesn't exist yet (TDD RED phase)
      const result = await service.versions(WORKFLOWS_DIR, 'nonexistent-wf');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E030');
    });

    it('should return slug in result', async () => {
      /*
      Test Doc:
      - Why: Caller should know which workflow versions belong to
      - Contract: versions() result includes slug
      - Usage Notes: Useful for display and chaining operations
      - Quality Contribution: Complete result structure
      - Worked Example: versions("test-wf") → { slug: "test-wf", ... }
      */
      const workflowJson = JSON.stringify({
        slug: 'test-wf',
        name: 'Test Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, workflowJson);
      fs.setDir(`${WORKFLOWS_DIR}/test-wf/checkpoints`);
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`, 'name: Test');

      // @ts-expect-error - Method doesn't exist yet (TDD RED phase)
      const result = await service.versions(WORKFLOWS_DIR, 'test-wf');

      expect(result.errors).toHaveLength(0);
      expect(result.slug).toBe('test-wf');
    });
  });
});
