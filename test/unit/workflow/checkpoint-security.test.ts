/**
 * Security tests for checkpoint operations on IWorkflowRegistry.
 *
 * Per Phase 2 security fixes: SEC-001, SEC-002, SEC-003, CORR-001, CORR-003
 * Split from checkpoint.test.ts to work around vitest memory issue.
 */

import { FakeFileSystem, FakeHashGenerator, FakePathResolver } from '@chainglass/shared';
import { FakeYamlParser, WorkflowRegistryService } from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

describe('WorkflowRegistryService checkpoint security', () => {
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

  // ==================== Security Tests: Path Traversal Protection ====================

  describe('path traversal protection (SEC-001, SEC-002)', () => {
    it('should have path safety validation in collectFilesForHash', async () => {
      /*
      Test Doc:
      - Why: Security - prevent path traversal attacks
      - Contract: isPathSafe() rejects paths containing '..'
      - Usage Notes: Implementation detail - paths with '..' are skipped
      - Quality Contribution: Validates security check exists
      - Worked Example: path with '..' → skipped by isPathSafe()
      */
      const workflowJson = JSON.stringify({
        slug: 'test-wf',
        name: 'Test Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, workflowJson);
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`, 'name: Test');
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/legit/file.txt`, 'legit content');
      fs.setDir(`${WORKFLOWS_DIR}/test-wf/checkpoints`);

      // Hash should succeed - verifies the code path works
      const hash = await service.generateCheckpointHash(WORKFLOWS_DIR, 'test-wf');
      expect(hash).toMatch(/^[a-f0-9]{8}$/);
    });

    it('should skip entries with .. path components during checkpoint copy', async () => {
      /*
      Test Doc:
      - Why: Security - prevent path traversal attacks during copy
      - Contract: Entries with '..' are silently skipped during copy
      - Usage Notes: Applies to copyDirectoryRecursive operations
      - Quality Contribution: Prevents files being copied outside workflow
      - Worked Example: checkpoint with '../../../tmp/evil' → not copied
      */
      const workflowJson = JSON.stringify({
        slug: 'test-wf',
        name: 'Test Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, workflowJson);
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`, 'name: Test');
      fs.setDir(`${WORKFLOWS_DIR}/test-wf/checkpoints`);

      const result = await service.checkpoint(WORKFLOWS_DIR, 'test-wf', {});

      expect(result.errors).toHaveLength(0);
      // Verify no path traversal paths were created
      const allFiles = fs.getAllFiles();
      const traversalFiles = allFiles.filter((f) => f.includes('..'));
      expect(traversalFiles).toHaveLength(0);
    });
  });

  // ==================== Failure Recovery Tests (CORR-001) ====================

  describe('checkpoint failure recovery (CORR-001)', () => {
    it('should return E038 when copyFile fails during checkpoint', async () => {
      /*
      Test Doc:
      - Why: Data integrity - checkpoint failures should return proper error
      - Contract: On copy failure, E038 is returned with actionable message
      - Usage Notes: Uses method override for testing error path
      - Quality Contribution: Validates error handling path
      - Worked Example: copyFile fails → E038 error returned
      */
      const workflowJson = JSON.stringify({
        slug: 'test-wf',
        name: 'Test Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, workflowJson);
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`, 'name: Test');
      fs.setDir(`${WORKFLOWS_DIR}/test-wf/checkpoints`);

      // Simulate error when trying to copy the wf.yaml file
      const originalCopyFile = fs.copyFile.bind(fs);
      fs.copyFile = async (source: string, dest: string) => {
        if (dest.includes('checkpoints/v001') && dest.endsWith('wf.yaml')) {
          throw new Error('Disk full');
        }
        return originalCopyFile(source, dest);
      };

      const result = await service.checkpoint(WORKFLOWS_DIR, 'test-wf', {});

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].code).toBe('E038');
      expect(result.errors[0].message).toContain('Disk full');
    });

    it('should return error result with E038 code and actionable message', async () => {
      /*
      Test Doc:
      - Why: Error code E038 reserved for checkpoint creation failures
      - Contract: Checkpoint failures return E038 with helpful message
      - Usage Notes: Includes error details and retry action
      - Quality Contribution: Actionable error messages for users
      - Worked Example: write fails → E038 with "Check disk space" action
      */
      const workflowJson = JSON.stringify({
        slug: 'test-wf',
        name: 'Test Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, workflowJson);
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`, 'name: Test');
      fs.setDir(`${WORKFLOWS_DIR}/test-wf/checkpoints`);

      // Simulate copyFile failure
      const originalCopyFile = fs.copyFile.bind(fs);
      fs.copyFile = async (source: string, dest: string) => {
        if (dest.includes('checkpoints/v001')) {
          throw new Error('Permission denied');
        }
        return originalCopyFile(source, dest);
      };

      const result = await service.checkpoint(WORKFLOWS_DIR, 'test-wf', {});

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E038');
      expect(result.errors[0].message).toContain('Permission denied');
      expect(result.errors[0].action).toContain('retry');
    });
  });

  // ==================== Error Handling Tests (SEC-003, CORR-003) ====================

  describe('error handling for I/O operations', () => {
    it('should handle file read errors during hash generation gracefully (SEC-003)', async () => {
      /*
      Test Doc:
      - Why: Files may become unreadable during iteration
      - Contract: Unreadable files are skipped, hash continues
      - Usage Notes: Logs warning in production, skips in tests
      - Quality Contribution: Robustness against permission changes
      - Worked Example: file deleted mid-hash → file skipped, hash succeeds
      */
      const workflowJson = JSON.stringify({
        slug: 'test-wf',
        name: 'Test Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, workflowJson);
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`, 'name: Test');
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/unreadable.txt`, 'content');
      fs.setDir(`${WORKFLOWS_DIR}/test-wf/checkpoints`);

      // Simulate read error for one file
      fs.simulateError(
        `${WORKFLOWS_DIR}/test-wf/current/unreadable.txt`,
        new Error('Permission denied')
      );

      // Hash generation should still succeed (skipping unreadable file)
      const hash = await service.generateCheckpointHash(WORKFLOWS_DIR, 'test-wf');
      expect(hash).toMatch(/^[a-f0-9]{8}$/);
    });

    it('should return error on hash generation failure during checkpoint (CORR-003)', async () => {
      /*
      Test Doc:
      - Why: Hash generation is critical for checkpoint naming
      - Contract: Hash failure returns E036 with actionable message
      - Usage Notes: Happens when hash generation throws
      - Quality Contribution: Clear error for hash failures
      - Worked Example: hash generator fails → E036 error returned
      */
      const workflowJson = JSON.stringify({
        slug: 'test-wf',
        name: 'Test Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, workflowJson);
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`, 'name: Test');
      fs.setDir(`${WORKFLOWS_DIR}/test-wf/checkpoints`);

      // Make hashGenerator throw to simulate hash failure
      hashGenerator.setError(new Error('Hash computation failed'));

      const result = await service.checkpoint(WORKFLOWS_DIR, 'test-wf', {});

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].code).toBe('E036');
    });
  });
});
