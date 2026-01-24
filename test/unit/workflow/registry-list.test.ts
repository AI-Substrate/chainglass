/**
 * Tests for IWorkflowRegistry.list() operation.
 *
 * Per Phase 1 T003: TDD - Write failing tests first.
 * Tests cover: empty registry, single workflow, multiple workflows,
 * missing workflow.json, malformed workflow.json.
 */

import { FakeFileSystem, FakePathResolver } from '@chainglass/shared';
import {
  FakeSchemaValidator,
  FakeYamlParser,
  // WorkflowRegistryService will be imported when T009 implements it
} from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - Service doesn't exist yet (TDD RED phase)
import { WorkflowRegistryService } from '@chainglass/workflow';

describe('WorkflowRegistryService.list()', () => {
  let service: WorkflowRegistryService;
  let fs: FakeFileSystem;
  let pathResolver: FakePathResolver;
  let yamlParser: FakeYamlParser;
  let schemaValidator: FakeSchemaValidator;

  const WORKFLOWS_DIR = '.chainglass/workflows';

  beforeEach(() => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
    yamlParser = new FakeYamlParser();
    schemaValidator = new FakeSchemaValidator();

    // Configure schema validator to pass by default
    schemaValidator.setDefaultResult({ valid: true, errors: [] });

    service = new WorkflowRegistryService(fs, pathResolver, yamlParser);
  });

  describe('empty registry', () => {
    it('should return empty array when workflows directory does not exist', async () => {
      /*
      Test Doc:
      - Why: Empty registry is a valid initial state
      - Contract: list() returns { errors: [], workflows: [] } when dir doesn't exist
      - Usage Notes: Create workflows dir first if needed for other operations
      - Quality Contribution: Prevents null/undefined errors in empty state
      - Worked Example: list('.chainglass/workflows') with no dir → { errors: [], workflows: [] }
      */
      // No setup - workflows directory doesn't exist

      const result = await service.list(WORKFLOWS_DIR);

      expect(result.errors).toHaveLength(0);
      expect(result.workflows).toEqual([]);
    });

    it('should return empty array when workflows directory is empty', async () => {
      /*
      Test Doc:
      - Why: Empty but existing directory should behave same as non-existent
      - Contract: list() returns { errors: [], workflows: [] } when dir is empty
      - Usage Notes: Safe to call even with no workflows configured
      - Quality Contribution: Ensures consistent empty state handling
      - Worked Example: list('.chainglass/workflows') with empty dir → { errors: [], workflows: [] }
      */
      fs.setDir(WORKFLOWS_DIR);

      const result = await service.list(WORKFLOWS_DIR);

      expect(result.errors).toHaveLength(0);
      expect(result.workflows).toEqual([]);
    });
  });

  describe('single workflow', () => {
    it('should list a single workflow with metadata', async () => {
      /*
      Test Doc:
      - Why: Basic listing functionality for single workflow
      - Contract: list() returns workflow summary from workflow.json
      - Usage Notes: workflow.json must contain slug, name; description is optional
      - Quality Contribution: Verifies metadata extraction works correctly
      - Worked Example: hello-wf/ with workflow.json → { workflows: [{ slug: 'hello-wf', name: 'Hello', ... }] }
      */
      const workflowJson = JSON.stringify({
        slug: 'hello-wf',
        name: 'Hello Workflow',
        description: 'A hello workflow',
        created_at: '2026-01-24T10:00:00Z',
        tags: ['starter'],
      });

      fs.setFile(`${WORKFLOWS_DIR}/hello-wf/workflow.json`, workflowJson);
      fs.setDir(`${WORKFLOWS_DIR}/hello-wf/checkpoints`);

      const result = await service.list(WORKFLOWS_DIR);

      expect(result.errors).toHaveLength(0);
      expect(result.workflows).toHaveLength(1);
      expect(result.workflows[0]).toEqual({
        slug: 'hello-wf',
        name: 'Hello Workflow',
        description: 'A hello workflow',
        checkpointCount: 0,
      });
    });

    it('should count checkpoints in the checkpoints directory', async () => {
      /*
      Test Doc:
      - Why: Checkpoint count is key metadata for workflow overview
      - Contract: checkpointCount equals number of v### directories in checkpoints/
      - Usage Notes: Only counts directories matching v###-* pattern
      - Quality Contribution: Ensures checkpoint visibility in list view
      - Worked Example: checkpoints/ with v001-abc, v002-def → checkpointCount: 2
      */
      const workflowJson = JSON.stringify({
        slug: 'hello-wf',
        name: 'Hello Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });

      fs.setFile(`${WORKFLOWS_DIR}/hello-wf/workflow.json`, workflowJson);
      fs.setDir(`${WORKFLOWS_DIR}/hello-wf/checkpoints/v001-abc12345`);
      fs.setDir(`${WORKFLOWS_DIR}/hello-wf/checkpoints/v002-def67890`);
      // Add a file to checkpoint to make it non-empty
      fs.setFile(`${WORKFLOWS_DIR}/hello-wf/checkpoints/v001-abc12345/wf.yaml`, 'name: Hello');
      fs.setFile(`${WORKFLOWS_DIR}/hello-wf/checkpoints/v002-def67890/wf.yaml`, 'name: Hello');

      const result = await service.list(WORKFLOWS_DIR);

      expect(result.errors).toHaveLength(0);
      expect(result.workflows[0].checkpointCount).toBe(2);
    });
  });

  describe('multiple workflows', () => {
    it('should list multiple workflows sorted by name', async () => {
      /*
      Test Doc:
      - Why: Multiple workflows should be returned in predictable order
      - Contract: list() returns all workflows, sorted by slug
      - Usage Notes: Sorting by slug provides consistent output
      - Quality Contribution: Ensures predictable listing for users
      - Worked Example: analysis-wf/, hello-wf/ → sorted by slug
      */
      const helloJson = JSON.stringify({
        slug: 'hello-wf',
        name: 'Hello Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });
      const analysisJson = JSON.stringify({
        slug: 'analysis-wf',
        name: 'Analysis Workflow',
        created_at: '2026-01-24T11:00:00Z',
      });

      fs.setFile(`${WORKFLOWS_DIR}/hello-wf/workflow.json`, helloJson);
      fs.setFile(`${WORKFLOWS_DIR}/analysis-wf/workflow.json`, analysisJson);
      fs.setDir(`${WORKFLOWS_DIR}/hello-wf/checkpoints`);
      fs.setDir(`${WORKFLOWS_DIR}/analysis-wf/checkpoints`);

      const result = await service.list(WORKFLOWS_DIR);

      expect(result.errors).toHaveLength(0);
      expect(result.workflows).toHaveLength(2);
      // Sorted by slug
      expect(result.workflows[0].slug).toBe('analysis-wf');
      expect(result.workflows[1].slug).toBe('hello-wf');
    });
  });

  describe('missing workflow.json', () => {
    it('should skip directories without workflow.json', async () => {
      /*
      Test Doc:
      - Why: Not all subdirectories may be valid workflows
      - Contract: list() excludes directories without workflow.json
      - Usage Notes: Missing workflow.json means it's not a valid workflow
      - Quality Contribution: Graceful handling of incomplete/invalid directories
      - Worked Example: valid-wf/ (has workflow.json), invalid-wf/ (no workflow.json) → only valid-wf listed
      */
      const validJson = JSON.stringify({
        slug: 'valid-wf',
        name: 'Valid Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });

      fs.setFile(`${WORKFLOWS_DIR}/valid-wf/workflow.json`, validJson);
      fs.setDir(`${WORKFLOWS_DIR}/valid-wf/checkpoints`);
      fs.setDir(`${WORKFLOWS_DIR}/invalid-wf`); // No workflow.json

      const result = await service.list(WORKFLOWS_DIR);

      expect(result.errors).toHaveLength(0);
      expect(result.workflows).toHaveLength(1);
      expect(result.workflows[0].slug).toBe('valid-wf');
    });
  });

  describe('path security', () => {
    it('should use IPathResolver for path composition', async () => {
      /*
      Test Doc:
      - Why: Verify pathResolver is used for secure path composition
      - Contract: Service calls pathResolver.join() for all path operations
      - Usage Notes: Required to maintain path security abstraction
      - Quality Contribution: Ensures IPathResolver injection is not wasted
      - Worked Example: list() should call pathResolver.join(dir, entry) for each workflow
      */
      const workflowJson = JSON.stringify({
        slug: 'test-wf',
        name: 'Test Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });

      fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, workflowJson);
      fs.setDir(`${WORKFLOWS_DIR}/test-wf/checkpoints`);

      await service.list(WORKFLOWS_DIR);

      // Verify pathResolver.join() was called (FakePathResolver tracks calls)
      expect(pathResolver.getJoinCalls().length).toBeGreaterThan(0);
    });
  });

  describe('malformed workflow.json', () => {
    it('should skip workflows with invalid JSON and continue listing others', async () => {
      /*
      Test Doc:
      - Why: One bad workflow shouldn't prevent listing others
      - Contract: list() skips invalid workflow.json, continues with valid ones
      - Usage Notes: Invalid workflows are silently skipped (no error in result)
      - Quality Contribution: Resilient to partial corruption
      - Worked Example: good-wf/ (valid), bad-wf/ (invalid JSON) → only good-wf listed
      */
      const validJson = JSON.stringify({
        slug: 'good-wf',
        name: 'Good Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });

      fs.setFile(`${WORKFLOWS_DIR}/good-wf/workflow.json`, validJson);
      fs.setFile(`${WORKFLOWS_DIR}/bad-wf/workflow.json`, '{ invalid json }');
      fs.setDir(`${WORKFLOWS_DIR}/good-wf/checkpoints`);
      fs.setDir(`${WORKFLOWS_DIR}/bad-wf/checkpoints`);

      const result = await service.list(WORKFLOWS_DIR);

      // Bad workflow is skipped, no errors reported in result
      expect(result.errors).toHaveLength(0);
      expect(result.workflows).toHaveLength(1);
      expect(result.workflows[0].slug).toBe('good-wf');
    });

    it('should skip workflows with invalid schema and continue listing others', async () => {
      /*
      Test Doc:
      - Why: Schema violations shouldn't break the listing
      - Contract: list() skips workflow.json that fails schema validation
      - Usage Notes: Missing required fields = invalid workflow
      - Quality Contribution: Resilient to incomplete metadata
      - Worked Example: good-wf/ (valid), incomplete-wf/ (missing name) → only good-wf listed
      */
      const validJson = JSON.stringify({
        slug: 'good-wf',
        name: 'Good Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });
      // Missing required 'name' field
      const incompleteJson = JSON.stringify({
        slug: 'incomplete-wf',
        created_at: '2026-01-24T10:00:00Z',
      });

      fs.setFile(`${WORKFLOWS_DIR}/good-wf/workflow.json`, validJson);
      fs.setFile(`${WORKFLOWS_DIR}/incomplete-wf/workflow.json`, incompleteJson);
      fs.setDir(`${WORKFLOWS_DIR}/good-wf/checkpoints`);
      fs.setDir(`${WORKFLOWS_DIR}/incomplete-wf/checkpoints`);

      const result = await service.list(WORKFLOWS_DIR);

      // Incomplete workflow is skipped
      expect(result.errors).toHaveLength(0);
      expect(result.workflows).toHaveLength(1);
      expect(result.workflows[0].slug).toBe('good-wf');
    });
  });
});
