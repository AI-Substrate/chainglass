/**
 * Tests for IWorkflowRegistry.info() operation.
 *
 * Per Phase 1 T004: TDD - Write failing tests first.
 * Tests cover: found with checkpoints, found no checkpoints, not found (E030),
 * malformed workflow.json.
 */

import {
  FakeFileSystem,
  FakePathResolver,
} from '@chainglass/shared';
import {
  FakeYamlParser,
  FakeSchemaValidator,
  WorkflowRegistryErrorCodes,
  // WorkflowRegistryService will be imported when T009 implements it
} from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - Service doesn't exist yet (TDD RED phase)
import { WorkflowRegistryService } from '@chainglass/workflow';

describe('WorkflowRegistryService.info()', () => {
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

  describe('found with checkpoints', () => {
    it('should return workflow info with version history', async () => {
      /*
      Test Doc:
      - Why: info() must return complete workflow details including checkpoints
      - Contract: info() returns WorkflowInfo with all metadata and versions array
      - Usage Notes: versions are sorted by ordinal descending (newest first)
      - Quality Contribution: Verifies full workflow introspection
      - Worked Example: hello-wf/ with v001, v002 → { workflow: { versions: [v002, v001] } }
      */
      const workflowJson = JSON.stringify({
        slug: 'hello-wf',
        name: 'Hello Workflow',
        description: 'A test workflow',
        created_at: '2026-01-24T10:00:00Z',
        updated_at: '2026-01-24T12:00:00Z',
        tags: ['starter', 'test'],
        author: 'Test Author',
      });

      fs.setFile(`${WORKFLOWS_DIR}/hello-wf/workflow.json`, workflowJson);
      fs.setDir(`${WORKFLOWS_DIR}/hello-wf/checkpoints/v001-abc12345`);
      fs.setDir(`${WORKFLOWS_DIR}/hello-wf/checkpoints/v002-def67890`);
      // Add checkpoint manifest files
      fs.setFile(
        `${WORKFLOWS_DIR}/hello-wf/checkpoints/v001-abc12345/.checkpoint.json`,
        JSON.stringify({
          ordinal: 1,
          hash: 'abc12345',
          createdAt: '2026-01-24T10:30:00Z',
          comment: 'Initial version',
        })
      );
      fs.setFile(
        `${WORKFLOWS_DIR}/hello-wf/checkpoints/v002-def67890/.checkpoint.json`,
        JSON.stringify({
          ordinal: 2,
          hash: 'def67890',
          createdAt: '2026-01-24T11:00:00Z',
          comment: 'Added validation',
        })
      );

      const result = await service.info(WORKFLOWS_DIR, 'hello-wf');

      expect(result.errors).toHaveLength(0);
      expect(result.workflow).toBeDefined();
      expect(result.workflow!.slug).toBe('hello-wf');
      expect(result.workflow!.name).toBe('Hello Workflow');
      expect(result.workflow!.description).toBe('A test workflow');
      expect(result.workflow!.createdAt).toBe('2026-01-24T10:00:00Z');
      expect(result.workflow!.updatedAt).toBe('2026-01-24T12:00:00Z');
      expect(result.workflow!.tags).toEqual(['starter', 'test']);
      expect(result.workflow!.author).toBe('Test Author');
      expect(result.workflow!.checkpointCount).toBe(2);

      // Versions sorted by ordinal descending (newest first)
      expect(result.workflow!.versions).toHaveLength(2);
      expect(result.workflow!.versions[0].ordinal).toBe(2);
      expect(result.workflow!.versions[0].hash).toBe('def67890');
      expect(result.workflow!.versions[0].version).toBe('v002-def67890');
      expect(result.workflow!.versions[0].comment).toBe('Added validation');
      expect(result.workflow!.versions[1].ordinal).toBe(1);
      expect(result.workflow!.versions[1].hash).toBe('abc12345');
      expect(result.workflow!.versions[1].version).toBe('v001-abc12345');
    });
  });

  describe('found no checkpoints', () => {
    it('should return workflow info with empty versions array', async () => {
      /*
      Test Doc:
      - Why: Workflow with no checkpoints is valid (newly created)
      - Contract: info() returns WorkflowInfo with versions: []
      - Usage Notes: checkpointCount will be 0
      - Quality Contribution: Ensures new workflows are visible
      - Worked Example: new-wf/ with no checkpoints → { workflow: { versions: [], checkpointCount: 0 } }
      */
      const workflowJson = JSON.stringify({
        slug: 'new-wf',
        name: 'New Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });

      fs.setFile(`${WORKFLOWS_DIR}/new-wf/workflow.json`, workflowJson);
      fs.setDir(`${WORKFLOWS_DIR}/new-wf/checkpoints`); // Empty checkpoints dir

      const result = await service.info(WORKFLOWS_DIR, 'new-wf');

      expect(result.errors).toHaveLength(0);
      expect(result.workflow).toBeDefined();
      expect(result.workflow!.slug).toBe('new-wf');
      expect(result.workflow!.name).toBe('New Workflow');
      expect(result.workflow!.checkpointCount).toBe(0);
      expect(result.workflow!.versions).toEqual([]);
    });
  });

  describe('not found', () => {
    it('should return E030 error when workflow does not exist', async () => {
      /*
      Test Doc:
      - Why: Non-existent workflows must return clear error
      - Contract: info() returns E030 WORKFLOW_NOT_FOUND with actionable message
      - Usage Notes: Error includes suggested action to create the workflow
      - Quality Contribution: Clear error messages for agents
      - Worked Example: info('nonexistent') → { errors: [{ code: 'E030', message: '...' }] }
      */
      // No workflow directory exists

      const result = await service.info(WORKFLOWS_DIR, 'nonexistent-wf');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe(WorkflowRegistryErrorCodes.WORKFLOW_NOT_FOUND);
      expect(result.errors[0].message).toContain('nonexistent-wf');
      expect(result.errors[0].action).toBeDefined();
      expect(result.workflow).toBeUndefined();
    });

    it('should return E030 when directory exists but workflow.json is missing', async () => {
      /*
      Test Doc:
      - Why: Directory without workflow.json is not a valid workflow
      - Contract: info() returns E030 (or E036) for missing workflow.json
      - Usage Notes: This differs from list() which just skips such directories
      - Quality Contribution: Explicit error for targeted queries
      - Worked Example: info('incomplete-wf') where workflow.json missing → E030/E036
      */
      fs.setDir(`${WORKFLOWS_DIR}/incomplete-wf`);
      fs.setDir(`${WORKFLOWS_DIR}/incomplete-wf/checkpoints`);
      // No workflow.json

      const result = await service.info(WORKFLOWS_DIR, 'incomplete-wf');

      expect(result.errors).toHaveLength(1);
      // Could be E030 (not found) or E036 (invalid template)
      expect(['E030', 'E036']).toContain(result.errors[0].code);
      expect(result.workflow).toBeUndefined();
    });
  });

  describe('malformed workflow.json', () => {
    it('should return E036 error for invalid JSON', async () => {
      /*
      Test Doc:
      - Why: Invalid JSON must be reported as configuration error
      - Contract: info() returns E036 INVALID_TEMPLATE for parse errors
      - Usage Notes: Actionable message helps user fix the JSON
      - Quality Contribution: Clear error for malformed config
      - Worked Example: info('bad-wf') with invalid JSON → E036
      */
      fs.setFile(`${WORKFLOWS_DIR}/bad-wf/workflow.json`, '{ invalid json }');
      fs.setDir(`${WORKFLOWS_DIR}/bad-wf/checkpoints`);

      const result = await service.info(WORKFLOWS_DIR, 'bad-wf');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe(WorkflowRegistryErrorCodes.INVALID_TEMPLATE);
      expect(result.errors[0].message).toContain('bad-wf');
      expect(result.workflow).toBeUndefined();
    });

    it('should return E036 error for schema validation failure', async () => {
      /*
      Test Doc:
      - Why: Schema-invalid workflow.json must be reported clearly
      - Contract: info() returns E036 for missing required fields
      - Usage Notes: Error message indicates which field is missing
      - Quality Contribution: Helps user fix incomplete metadata
      - Worked Example: info('incomplete-wf') missing name → E036
      */
      // Missing required 'name' field
      const incompleteJson = JSON.stringify({
        slug: 'incomplete-wf',
        created_at: '2026-01-24T10:00:00Z',
      });

      fs.setFile(`${WORKFLOWS_DIR}/incomplete-wf/workflow.json`, incompleteJson);
      fs.setDir(`${WORKFLOWS_DIR}/incomplete-wf/checkpoints`);

      const result = await service.info(WORKFLOWS_DIR, 'incomplete-wf');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe(WorkflowRegistryErrorCodes.INVALID_TEMPLATE);
      expect(result.workflow).toBeUndefined();
    });
  });
});
