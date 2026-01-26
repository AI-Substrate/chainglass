/**
 * Tests for WorkflowService with IWorkflowAdapter injection.
 *
 * Per Phase 6: Service Unification & Validation.
 * Per DYK-01: Keep Result types, add optional `workflowEntity?: Workflow` field.
 * Per DYK-02: Inject IWorkflowAdapter into WorkflowService.
 *
 * TDD approach: These tests define the expected behavior for Phase 6 refactoring.
 */

import { FakeFileSystem, FakePathResolver } from '@chainglass/shared';
import {
  FakeSchemaValidator,
  FakeWorkflowAdapter,
  FakeWorkflowRegistry,
  FakeYamlParser,
  Phase,
  Workflow,
  WorkflowService,
} from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * Test fixture for workflow YAML content.
 */
const HELLO_WORKFLOW_YAML = `
name: hello-workflow
version: "0.1.0"
description: A simple test workflow
phases:
  gather:
    description: Collect input data
    order: 1
    inputs:
      messages:
        - id: "001"
          type: "free_text"
          from: orchestrator
          required: true
    outputs:
      - name: acknowledgment.md
        type: file
        required: true
  process:
    description: Process the data
    order: 2
    inputs:
      files:
        - from: phases.gather
          name: acknowledgment.md
          required: true
    outputs:
      - name: result.json
        type: file
        required: true
`;

/**
 * Create a test Workflow entity (run).
 */
const createTestWorkflowRun = (slug = 'hello-workflow', runId = 'run-2026-01-26-001') =>
  Workflow.createRun({
    slug,
    workflowDir: `/test/runs/${slug}/v001-abc12345/${runId}`,
    version: '0.1.0',
    description: 'A simple test workflow',
    phases: [
      new Phase({
        name: 'gather',
        phaseDir: `/test/runs/${slug}/v001-abc12345/${runId}/phases/gather`,
        runDir: `/test/runs/${slug}/v001-abc12345/${runId}`,
        description: 'Collect input data',
        order: 1,
        status: 'pending',
        facilitator: 'orchestrator',
        state: 'pending',
        inputFiles: [],
        inputParameters: [],
        inputMessages: [],
        outputs: [],
        outputParameters: [],
      }),
      new Phase({
        name: 'process',
        phaseDir: `/test/runs/${slug}/v001-abc12345/${runId}/phases/process`,
        runDir: `/test/runs/${slug}/v001-abc12345/${runId}`,
        description: 'Process the data',
        order: 2,
        status: 'pending',
        facilitator: undefined,
        state: 'pending',
        inputFiles: [],
        inputParameters: [],
        inputMessages: [],
        outputs: [],
        outputParameters: [],
      }),
    ],
    checkpoint: {
      ordinal: 1,
      hash: 'abc12345',
      createdAt: new Date('2026-01-25T10:00:00Z'),
    },
    run: {
      runId,
      runDir: `/test/runs/${slug}/v001-abc12345/${runId}`,
      status: 'pending',
      createdAt: new Date('2026-01-26T12:00:00Z'),
    },
  });

describe('WorkflowService with IWorkflowAdapter injection', () => {
  let fakeFileSystem: FakeFileSystem;
  let fakeYamlParser: FakeYamlParser;
  let fakeSchemaValidator: FakeSchemaValidator;
  let fakePathResolver: FakePathResolver;
  let fakeRegistry: FakeWorkflowRegistry;
  let fakeWorkflowAdapter: FakeWorkflowAdapter;
  let workflowService: WorkflowService;

  beforeEach(() => {
    fakeFileSystem = new FakeFileSystem();
    fakeYamlParser = new FakeYamlParser();
    fakeSchemaValidator = new FakeSchemaValidator();
    fakePathResolver = new FakePathResolver();
    fakeRegistry = new FakeWorkflowRegistry();
    fakeWorkflowAdapter = new FakeWorkflowAdapter();

    // Note: Per DYK-02, WorkflowService should accept IWorkflowAdapter in constructor
    // This test expects the refactored constructor signature:
    // WorkflowService(fs, yamlParser, schemaValidator, pathResolver, registry, workflowAdapter?)
    //
    // For now, create service with existing signature (test will fail until refactored)
    workflowService = new WorkflowService(
      fakeFileSystem,
      fakeYamlParser,
      fakeSchemaValidator,
      fakePathResolver,
      fakeRegistry
    );

    // Configure FakeSchemaValidator to pass validation
    fakeSchemaValidator.setDefaultResult({ valid: true, errors: [] });
  });

  describe('constructor accepts optional IWorkflowAdapter', () => {
    it('should create service without workflowAdapter (backward compatible)', () => {
      const service = new WorkflowService(
        fakeFileSystem,
        fakeYamlParser,
        fakeSchemaValidator,
        fakePathResolver,
        fakeRegistry
      );
      expect(service).toBeDefined();
    });

    it('should create service with workflowAdapter injected', () => {
      // Per DYK-02: WorkflowService accepts optional IWorkflowAdapter
      const service = new WorkflowService(
        fakeFileSystem,
        fakeYamlParser,
        fakeSchemaValidator,
        fakePathResolver,
        fakeRegistry,
        fakeWorkflowAdapter
      );
      expect(service).toBeDefined();
    });
  });

  describe('compose() with Workflow entity', () => {
    beforeEach(() => {
      // Setup registry to return checkpoint versions using the correct API
      fakeRegistry.setVersions('hello-workflow', [
        {
          version: 'v001-abc12345',
          hash: 'abc12345',
          ordinal: 1,
          createdAt: new Date('2026-01-25T10:00:00Z'),
        },
      ]);

      // Setup file system for compose test
      // The checkpoint directory wf.yaml
      fakeFileSystem.setFile(
        '.chainglass/workflows/hello-workflow/checkpoints/v001-abc12345/wf.yaml',
        HELLO_WORKFLOW_YAML
      );
    });

    it('should return ComposeResult with runDir', async () => {
      const result = await workflowService.compose('hello-workflow', '/test/runs');

      expect(result).toBeDefined();
      expect(result.runDir).toContain('run-');
      expect(result.template).toBe('hello-workflow');
      expect(result.phases).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
    });

    it('should include optional workflow entity when adapter is injected', async () => {
      // Per DYK-02: WorkflowService with IWorkflowAdapter injected loads Workflow entity
      const serviceWithAdapter = new WorkflowService(
        fakeFileSystem,
        fakeYamlParser,
        fakeSchemaValidator,
        fakePathResolver,
        fakeRegistry,
        fakeWorkflowAdapter
      );

      // Configure FakeWorkflowAdapter to return a Workflow entity
      fakeWorkflowAdapter.loadRunResult = createTestWorkflowRun();

      const result = await serviceWithAdapter.compose('hello-workflow', '/test/runs');

      // Per DYK-01: Result should have optional workflowEntity field
      expect(result.template).toBe('hello-workflow'); // string - existing field
      expect(result.workflowEntity).toBeInstanceOf(Workflow); // new optional field
      expect(result.workflowEntity?.slug).toBe('hello-workflow');
      expect(result.workflowEntity?.isRun).toBe(true);

      // Per DYK-02: WorkflowAdapter should have been called with the created runDir
      expect(fakeWorkflowAdapter.loadRunCalls).toHaveLength(1);
      expect(fakeWorkflowAdapter.loadRunCalls[0].runDir).toContain('run-');
    });
  });

  describe('ComposeResultWithEntity type extension', () => {
    it('ComposeResultWithEntity should support optional workflowEntity?: Workflow field', () => {
      // Per DYK-01: The extended type adds workflowEntity?: Workflow field
      // This type is used internally by WorkflowService and callers in workflow package
      //
      // The base ComposeResult from @chainglass/shared remains unchanged
      // to avoid circular dependencies (shared -> workflow -> shared)

      // Create service without adapter - result won't have workflowEntity
      const serviceWithoutAdapter = new WorkflowService(
        fakeFileSystem,
        fakeYamlParser,
        fakeSchemaValidator,
        fakePathResolver,
        fakeRegistry
      );
      expect(serviceWithoutAdapter).toBeDefined();

      // Create service with adapter - result will have workflowEntity when adapter returns Workflow
      const serviceWithAdapter = new WorkflowService(
        fakeFileSystem,
        fakeYamlParser,
        fakeSchemaValidator,
        fakePathResolver,
        fakeRegistry,
        fakeWorkflowAdapter
      );
      expect(serviceWithAdapter).toBeDefined();
    });
  });

  describe('error handling with adapter', () => {
    beforeEach(() => {
      // Setup registry to return checkpoint versions using the correct API
      fakeRegistry.setVersions('hello-workflow', [
        {
          version: 'v001-abc12345',
          hash: 'abc12345',
          ordinal: 1,
          createdAt: new Date('2026-01-25T10:00:00Z'),
        },
      ]);
      fakeFileSystem.setFile(
        '.chainglass/workflows/hello-workflow/checkpoints/v001-abc12345/wf.yaml',
        HELLO_WORKFLOW_YAML
      );
    });

    it('should return valid result even if adapter fails to load entity', async () => {
      // Per DYK-01: Entity loading failure is non-fatal
      const serviceWithAdapter = new WorkflowService(
        fakeFileSystem,
        fakeYamlParser,
        fakeSchemaValidator,
        fakePathResolver,
        fakeRegistry,
        fakeWorkflowAdapter
      );

      // Don't set loadRunResult - adapter will throw EntityNotFoundError
      // But compose should still succeed (entity loading is non-fatal)

      const result = await serviceWithAdapter.compose('hello-workflow', '/test/runs');

      // Operation should succeed
      expect(result.errors).toHaveLength(0);
      expect(result.runDir).toContain('run-');
      // But workflowEntity should be undefined
      expect(result.workflowEntity).toBeUndefined();
    });
  });
});

/**
 * WorkflowService workflowAdapter call patterns:
 *
 * All methods follow this sequence when IWorkflowAdapter is injected:
 * 1. Service executes its core logic (create run directory, copy files, etc.)
 * 2. If workflowAdapter is injected, call workflowAdapter.loadRun(runDir)
 * 3. Include loaded Workflow entity in result.workflowEntity
 *
 * This ensures the entity reflects the post-operation state.
 *
 * Tested above:
 * - compose(): Verified in "should include optional workflow entity when adapter is injected"
 */
