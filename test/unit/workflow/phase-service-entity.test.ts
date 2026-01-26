/**
 * Tests for PhaseService with IPhaseAdapter injection.
 *
 * Per Phase 6: Service Unification & Validation.
 * Per DYK-01: Keep Result types, add optional `phase?: Phase` field.
 * Per DYK-02: Inject IPhaseAdapter into PhaseService.
 *
 * TDD approach: These tests define the expected behavior for Phase 6 refactoring.
 */

import { FakeFileSystem } from '@chainglass/shared';
import {
  FakePhaseAdapter,
  FakeSchemaValidator,
  FakeYamlParser,
  Phase,
  PhaseService,
} from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * Test fixture for phase YAML content.
 */
const GATHER_PHASE_YAML = `
phase: gather
description: "Collect and acknowledge input data"
order: 1
inputs:
  messages:
    - id: "001"
      type: "free_text"
      from: "orchestrator"
      required: true
outputs:
  - name: acknowledgment.md
    type: file
    required: true
  - name: gather-data.json
    type: file
    required: true
`;

/**
 * Test fixture for phase YAML definitions (parsed object).
 */
const GATHER_PHASE_DEF = {
  phase: 'gather',
  description: 'Collect and acknowledge input data',
  order: 1,
  inputs: {
    messages: [{ id: '001', type: 'free_text', from: 'orchestrator', required: true }],
  },
  outputs: [
    { name: 'acknowledgment.md', type: 'file', required: true },
    { name: 'gather-data.json', type: 'file', required: true },
  ],
};

/**
 * Sample wf-status.json for testing.
 */
const createWfStatus = (gatherStatus = 'pending') => ({
  workflow: {
    name: 'test-workflow',
    version: '0.1.0',
    checkpoint_version: 'v001-abc12345',
  },
  run: {
    id: 'run-2026-01-26-001',
    status: 'in_progress',
    created_at: '2026-01-26T12:00:00Z',
  },
  phases: {
    gather: { status: gatherStatus, order: 1 },
    process: { status: 'pending', order: 2 },
    report: { status: 'pending', order: 3 },
  },
});

/**
 * Create a test Phase entity.
 */
const createTestPhase = (
  name = 'gather',
  status: 'pending' | 'ready' | 'active' | 'complete' = 'pending'
) =>
  new Phase({
    name,
    phaseDir: `/test/run/phases/${name}`,
    runDir: '/test/run',
    description: `Test ${name} phase`,
    order: name === 'gather' ? 1 : name === 'process' ? 2 : 3,
    status,
    facilitator: 'orchestrator',
    state: status === 'complete' ? 'complete' : 'pending',
    inputFiles: [],
    inputParameters: [],
    inputMessages: [],
    outputs: [],
    outputParameters: [],
  });

describe('PhaseService with IPhaseAdapter injection', () => {
  let fakeFileSystem: FakeFileSystem;
  let fakeYamlParser: FakeYamlParser;
  let fakeSchemaValidator: FakeSchemaValidator;
  let fakePhaseAdapter: FakePhaseAdapter;
  let phaseService: PhaseService;

  beforeEach(() => {
    fakeFileSystem = new FakeFileSystem();
    fakeYamlParser = new FakeYamlParser();
    fakeSchemaValidator = new FakeSchemaValidator();
    fakePhaseAdapter = new FakePhaseAdapter();

    // Note: Per DYK-02, PhaseService should accept IPhaseAdapter in constructor
    // This test expects the refactored constructor signature:
    // PhaseService(fs, yamlParser, schemaValidator, phaseAdapter?)
    //
    // For now, create service with existing signature (test will fail until refactored)
    phaseService = new PhaseService(fakeFileSystem, fakeYamlParser, fakeSchemaValidator);
  });

  describe('constructor accepts optional IPhaseAdapter', () => {
    it('should create service without phaseAdapter (backward compatible)', () => {
      const service = new PhaseService(fakeFileSystem, fakeYamlParser, fakeSchemaValidator);
      expect(service).toBeDefined();
    });

    it('should create service with phaseAdapter injected', () => {
      // Per DYK-02: PhaseService accepts optional IPhaseAdapter
      const service = new PhaseService(
        fakeFileSystem,
        fakeYamlParser,
        fakeSchemaValidator,
        fakePhaseAdapter
      );
      expect(service).toBeDefined();
    });
  });

  describe('prepare() with Phase entity', () => {
    beforeEach(() => {
      // Setup file system for prepare test - use the actual YAML content
      fakeFileSystem.setFile('/test/run/phases/gather/wf-phase.yaml', GATHER_PHASE_YAML);
      fakeFileSystem.setFile('/test/run/wf-run/wf-status.json', JSON.stringify(createWfStatus()));

      // FakeYamlParser uses real YAML parsing by default, so no setup needed
    });

    it('should return PrepareResult with status', async () => {
      const result = await phaseService.prepare('gather', '/test/run');

      expect(result).toBeDefined();
      expect(result.phase).toBe('gather');
      // PrepareResult.status is 'success' | 'failed', but prepare() sets phase status to 'ready'
      // The result.status reflects the operation status, not the phase status
      expect(['success', 'ready']).toContain(result.status);
    });

    it('should include optional phase entity when adapter is injected', async () => {
      // Per DYK-02: PhaseService with IPhaseAdapter injected loads Phase entity
      const serviceWithAdapter = new PhaseService(
        fakeFileSystem,
        fakeYamlParser,
        fakeSchemaValidator,
        fakePhaseAdapter
      );

      // Configure FakePhaseAdapter to return a Phase entity
      fakePhaseAdapter.loadFromPathResult = createTestPhase('gather', 'ready');

      const result = await serviceWithAdapter.prepare('gather', '/test/run');

      // Per DYK-01: Result should have optional phaseEntity field
      expect(result.phase).toBe('gather'); // string - existing field
      expect(result.phaseEntity).toBeInstanceOf(Phase); // new optional field
      expect(result.phaseEntity?.name).toBe('gather');
      expect(result.phaseEntity?.status).toBe('ready');

      // Per DYK-02: PhaseAdapter should have been called
      expect(fakePhaseAdapter.loadFromPathCalls).toHaveLength(1);
      expect(fakePhaseAdapter.loadFromPathCalls[0].phaseDir).toBe('/test/run/phases/gather');
    });
  });

  describe('PrepareResult type extension', () => {
    it('PrepareResultWithEntity should support optional phaseEntity?: Phase field', () => {
      // Per DYK-01: The extended type adds phaseEntity?: Phase field
      // This type is used internally by PhaseService and callers in workflow package
      //
      // The base PrepareResult from @chainglass/shared remains unchanged
      // to avoid circular dependencies (shared -> workflow -> shared)

      // Create service without adapter - result won't have phaseEntity
      const serviceWithoutAdapter = new PhaseService(
        fakeFileSystem,
        fakeYamlParser,
        fakeSchemaValidator
      );
      expect(serviceWithoutAdapter).toBeDefined();

      // Create service with adapter - result will have phaseEntity when adapter returns Phase
      const serviceWithAdapter = new PhaseService(
        fakeFileSystem,
        fakeYamlParser,
        fakeSchemaValidator,
        fakePhaseAdapter
      );
      expect(serviceWithAdapter).toBeDefined();
    });
  });

  describe('validate() with Phase entity', () => {
    beforeEach(() => {
      fakeFileSystem.setFile('/test/run/phases/gather/wf-phase.yaml', GATHER_PHASE_YAML);
      fakeFileSystem.setFile(
        '/test/run/wf-run/wf-status.json',
        JSON.stringify(createWfStatus('ready'))
      );

      // Create output files for validation
      fakeFileSystem.setFile('/test/run/phases/gather/run/outputs/acknowledgment.md', '# Ack');
      fakeFileSystem.setFile('/test/run/phases/gather/run/outputs/gather-data.json', '{}');
    });

    it('should return ValidateResult', async () => {
      const result = await phaseService.validate('gather', '/test/run', 'outputs');

      expect(result).toBeDefined();
      expect(result.phase).toBe('gather');
    });

    it('should include optional phase entity when adapter is injected', async () => {
      // Per DYK-02: PhaseService with IPhaseAdapter injected loads Phase entity
      const serviceWithAdapter = new PhaseService(
        fakeFileSystem,
        fakeYamlParser,
        fakeSchemaValidator,
        fakePhaseAdapter
      );

      // Configure FakePhaseAdapter to return a Phase entity
      fakePhaseAdapter.loadFromPathResult = createTestPhase('gather', 'ready');

      const result = await serviceWithAdapter.validate('gather', '/test/run', 'outputs');

      // Per DYK-01: Result should have optional phaseEntity field
      expect(result.phase).toBe('gather');
      expect(result.phaseEntity).toBeInstanceOf(Phase);
      expect(result.phaseEntity?.name).toBe('gather');

      // Per DYK-02: PhaseAdapter should have been called
      expect(fakePhaseAdapter.loadFromPathCalls).toHaveLength(1);
      expect(fakePhaseAdapter.loadFromPathCalls[0].phaseDir).toBe('/test/run/phases/gather');
    });
  });

  describe('finalize() with Phase entity', () => {
    beforeEach(() => {
      fakeFileSystem.setFile('/test/run/phases/gather/wf-phase.yaml', GATHER_PHASE_YAML);
      fakeFileSystem.setFile(
        '/test/run/wf-run/wf-status.json',
        JSON.stringify(createWfStatus('active'))
      );

      // Create validated outputs
      fakeFileSystem.setFile('/test/run/phases/gather/run/outputs/acknowledgment.md', '# Ack');
      fakeFileSystem.setFile(
        '/test/run/phases/gather/run/outputs/gather-data.json',
        '{"items":[]}'
      );
      // Create wf-data directory for output-params.json
      fakeFileSystem.setFile('/test/run/phases/gather/run/wf-data/.placeholder', '');
    });

    it('should return FinalizeResult', async () => {
      const result = await phaseService.finalize('gather', '/test/run');

      expect(result).toBeDefined();
      expect(result.phase).toBe('gather');
    });

    it('should include optional phase entity when adapter is injected', async () => {
      // Per DYK-02: PhaseService with IPhaseAdapter injected loads Phase entity
      const serviceWithAdapter = new PhaseService(
        fakeFileSystem,
        fakeYamlParser,
        fakeSchemaValidator,
        fakePhaseAdapter
      );

      // Configure FakePhaseAdapter to return a Phase entity
      fakePhaseAdapter.loadFromPathResult = createTestPhase('gather', 'complete');

      const result = await serviceWithAdapter.finalize('gather', '/test/run');

      // Per DYK-01: Result should have optional phaseEntity field
      expect(result.phase).toBe('gather');
      expect(result.phaseEntity).toBeInstanceOf(Phase);
      expect(result.phaseEntity?.name).toBe('gather');
      expect(result.phaseEntity?.status).toBe('complete');

      // Per DYK-02: PhaseAdapter should have been called
      expect(fakePhaseAdapter.loadFromPathCalls).toHaveLength(1);
      expect(fakePhaseAdapter.loadFromPathCalls[0].phaseDir).toBe('/test/run/phases/gather');
    });
  });
});

/**
 * PhaseService phaseAdapter call patterns:
 *
 * All methods follow this sequence when IPhaseAdapter is injected:
 * 1. Service executes its core logic (copy files, validate, update status)
 * 2. If phaseAdapter is injected, call phaseAdapter.loadFromPath(phaseDir)
 * 3. Include loaded Phase entity in result.phaseEntity
 *
 * This ensures the entity reflects the post-operation state.
 *
 * Tested above:
 * - prepare(): Verified in "should include optional phase entity when adapter is injected"
 * - validate(): Verified in "should include optional phase entity when adapter is injected"
 * - finalize(): Verified in "should include optional phase entity when adapter is injected"
 */
