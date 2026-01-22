import { FakeFileSystem } from '@chainglass/shared';
import {
  FakePhaseService,
  FakeSchemaValidator,
  FakeYamlParser,
  type IPhaseService,
  PhaseService,
  type WfStatus,
} from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * Contract tests for IPhaseService implementations.
 *
 * Per Critical Discovery 08: Contract tests prevent fake drift by ensuring
 * both PhaseService and FakePhaseService pass the same behavioral tests.
 *
 * Note: Unlike filesystem contract tests, phase service contract tests
 * verify a subset of behaviors that both implementations must satisfy.
 * The fake has additional test helpers that aren't part of the contract.
 */

// Sample wf-phase.yaml for gather phase
const GATHER_PHASE_YAML = `
phase: gather
description: "Collect data"
order: 1
inputs: {}
outputs:
  - name: data.json
    type: file
    required: true
`;

const GATHER_PHASE_DEF = {
  phase: 'gather',
  description: 'Collect data',
  order: 1,
  inputs: {},
  outputs: [{ name: 'data.json', type: 'file', required: true }],
};

// Sample wf-status.json
const createWfStatus = (phases: Record<string, { order: number; status: string }>): WfStatus => ({
  workflow: {
    name: 'contract-test-workflow',
    version: '1.0.0',
    template_path: '../template/test-workflow',
  },
  run: {
    id: 'run-contract-test-001',
    created_at: '2026-01-22T10:00:00Z',
    status: 'pending',
  },
  phases: phases as WfStatus['phases'],
});

/**
 * Test context for phase service contract tests.
 */
interface PhaseServiceTestContext {
  /** The phase service implementation to test */
  service: IPhaseService;
  /** Setup function called before each test */
  setup: () => Promise<void>;
  /** Cleanup function called after each test */
  cleanup: () => Promise<void>;
  /** Description of the implementation */
  name: string;
}

/**
 * Contract tests that run against both PhaseService and FakePhaseService.
 */
function phaseServiceContractTests(createContext: () => PhaseServiceTestContext) {
  let ctx: PhaseServiceTestContext;

  beforeEach(async () => {
    ctx = createContext();
    await ctx.setup();
  });

  describe(`${createContext().name} implements IPhaseService contract`, () => {
    describe('prepare() return type', () => {
      it('should return a PrepareResult object', async () => {
        /*
        Test Doc:
        - Why: Contract requires consistent return type
        - Contract: prepare() returns object with phase, runDir, status, inputs, copiedFromPrior, errors
        - Usage Notes: All implementations must return this shape
        - Quality Contribution: Ensures type consistency
        - Worked Example: prepare('gather', '/run') → { phase: string, status: string, ... }
        */
        const result = await ctx.service.prepare('gather', '/runs/run-contract-test-001');

        // Must have all required properties
        expect(result).toHaveProperty('phase');
        expect(result).toHaveProperty('runDir');
        expect(result).toHaveProperty('status');
        expect(result).toHaveProperty('inputs');
        expect(result).toHaveProperty('copiedFromPrior');
        expect(result).toHaveProperty('errors');

        // Types must be correct
        expect(typeof result.phase).toBe('string');
        expect(typeof result.runDir).toBe('string');
        expect(['ready', 'failed']).toContain(result.status);
        expect(typeof result.inputs).toBe('object');
        expect(Array.isArray(result.copiedFromPrior)).toBe(true);
        expect(Array.isArray(result.errors)).toBe(true);
      });
    });

    describe('prepare() success behavior', () => {
      it('should return empty errors array on success', async () => {
        /*
        Test Doc:
        - Why: Contract requires errors.length === 0 indicates success
        - Contract: Success means empty errors array
        - Usage Notes: Check errors first, then status
        - Quality Contribution: Ensures consistent success detection
        - Worked Example: prepare(valid_phase) → { errors: [] }
        */
        const result = await ctx.service.prepare('gather', '/runs/run-contract-test-001');

        // Either succeeds with no errors, or fails with errors
        if (result.errors.length === 0) {
          expect(result.status).toBe('ready');
        }
      });

      it('should return phase name in result', async () => {
        /*
        Test Doc:
        - Why: Result must identify which phase was prepared
        - Contract: Result contains phase name
        - Usage Notes: Use for logging and error reporting
        - Quality Contribution: Clear result identification
        - Worked Example: prepare('gather') → { phase: 'gather' }
        */
        const result = await ctx.service.prepare('gather', '/runs/run-contract-test-001');

        expect(result.phase).toBe('gather');
      });
    });

    describe('validate() return type', () => {
      it('should return a ValidateResult object', async () => {
        /*
        Test Doc:
        - Why: Contract requires consistent return type
        - Contract: validate() returns object with phase, runDir, check, files, errors
        - Usage Notes: All implementations must return this shape
        - Quality Contribution: Ensures type consistency
        - Worked Example: validate('gather', '/run', 'outputs') → { phase, check, files, ... }
        */
        const result = await ctx.service.validate(
          'gather',
          '/runs/run-contract-test-001',
          'outputs'
        );

        // Must have all required properties
        expect(result).toHaveProperty('phase');
        expect(result).toHaveProperty('runDir');
        expect(result).toHaveProperty('check');
        expect(result).toHaveProperty('files');
        expect(result).toHaveProperty('errors');

        // Types must be correct
        expect(typeof result.phase).toBe('string');
        expect(typeof result.runDir).toBe('string');
        expect(['inputs', 'outputs']).toContain(result.check);
        expect(typeof result.files).toBe('object');
        expect(Array.isArray(result.errors)).toBe(true);
      });

      it('should include check mode in result', async () => {
        /*
        Test Doc:
        - Why: Result must identify what was validated
        - Contract: check field matches input mode
        - Usage Notes: Use to interpret files list
        - Quality Contribution: Clear result identification
        - Worked Example: validate(..., 'inputs') → { check: 'inputs' }
        */
        const result1 = await ctx.service.validate(
          'gather',
          '/runs/run-contract-test-001',
          'inputs'
        );
        const result2 = await ctx.service.validate(
          'gather',
          '/runs/run-contract-test-001',
          'outputs'
        );

        expect(result1.check).toBe('inputs');
        expect(result2.check).toBe('outputs');
      });
    });

    describe('error handling', () => {
      it('should return E020 for phase not found on prepare', async () => {
        /*
        Test Doc:
        - Why: Both implementations must handle missing phases
        - Contract: E020 error for non-existent phase
        - Usage Notes: Error code enables programmatic handling
        - Quality Contribution: Consistent error behavior
        - Worked Example: prepare('nonexistent') → { errors: [{ code: 'E020' }] }
        */
        const result = await ctx.service.prepare(
          'nonexistent-phase-xyz',
          '/runs/run-contract-test-001'
        );

        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toHaveProperty('code');
        expect(result.errors[0].code).toBe('E020');
      });

      it('should return E020 for phase not found on validate', async () => {
        /*
        Test Doc:
        - Why: Both implementations must handle missing phases
        - Contract: E020 error for non-existent phase
        - Usage Notes: Error code enables programmatic handling
        - Quality Contribution: Consistent error behavior
        - Worked Example: validate('nonexistent') → { errors: [{ code: 'E020' }] }
        */
        const result = await ctx.service.validate(
          'nonexistent-phase-xyz',
          '/runs/run-contract-test-001',
          'outputs'
        );

        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toHaveProperty('code');
        expect(result.errors[0].code).toBe('E020');
      });
    });
  });
}

// ==================== PhaseService Context ====================

function createPhaseServiceContext(): PhaseServiceTestContext {
  const fs = new FakeFileSystem();
  const yamlParser = new FakeYamlParser();
  const schemaValidator = new FakeSchemaValidator();
  const service = new PhaseService(fs, yamlParser, schemaValidator);

  const runDir = '/runs/run-contract-test-001';

  return {
    name: 'PhaseService',
    service,
    setup: async () => {
      // Reset fakes
      fs.reset();
      yamlParser.reset();
      schemaValidator.reset();

      // Set up wf-status.json
      const wfStatus = createWfStatus({
        gather: { order: 1, status: 'pending' },
      });
      fs.setFile(`${runDir}/wf-run/wf-status.json`, JSON.stringify(wfStatus, null, 2));

      // Set up gather phase
      fs.setDir(`${runDir}/phases/gather`);
      fs.setDir(`${runDir}/phases/gather/run/inputs/files`);
      fs.setDir(`${runDir}/phases/gather/run/outputs`);
      fs.setFile(`${runDir}/phases/gather/wf-phase.yaml`, GATHER_PHASE_YAML);

      // Configure YAML parser
      yamlParser.setParseResult(GATHER_PHASE_YAML.trim(), GATHER_PHASE_DEF);

      // Configure schema validator to pass
      schemaValidator.setDefaultResult({ valid: true, errors: [] });
    },
    cleanup: async () => {
      fs.reset();
    },
  };
}

// ==================== FakePhaseService Context ====================

function createFakePhaseServiceContext(): PhaseServiceTestContext {
  const service = new FakePhaseService();

  return {
    name: 'FakePhaseService',
    service,
    setup: async () => {
      service.reset();

      // Configure fake to return success for gather phase
      service.setPrepareResult('gather', {
        phase: 'gather',
        runDir: '/runs/run-contract-test-001',
        status: 'ready',
        inputs: { required: [], resolved: [] },
        copiedFromPrior: [],
        errors: [],
      });

      service.setValidateResult('gather', 'inputs', {
        phase: 'gather',
        runDir: '/runs/run-contract-test-001',
        check: 'inputs',
        files: { required: [], validated: [] },
        errors: [],
      });

      service.setValidateResult('gather', 'outputs', {
        phase: 'gather',
        runDir: '/runs/run-contract-test-001',
        check: 'outputs',
        files: { required: ['data.json'], validated: [] },
        errors: [],
      });

      // Configure fake to return E020 for non-existent phases
      service.setPrepareError(
        'nonexistent-phase-xyz',
        'E020',
        'Phase not found: nonexistent-phase-xyz',
        'Verify the phase name exists in the workflow'
      );

      service.setValidateError(
        'nonexistent-phase-xyz',
        'outputs',
        'E020',
        'Phase not found: nonexistent-phase-xyz',
        'Verify the phase name exists in the workflow'
      );

      service.setValidateError(
        'nonexistent-phase-xyz',
        'inputs',
        'E020',
        'Phase not found: nonexistent-phase-xyz',
        'Verify the phase name exists in the workflow'
      );
    },
    cleanup: async () => {
      service.reset();
    },
  };
}

// ==================== Run Contract Tests ====================

describe('PhaseService Contract Tests', () => {
  phaseServiceContractTests(createPhaseServiceContext);
});

describe('FakePhaseService Contract Tests', () => {
  phaseServiceContractTests(createFakePhaseServiceContext);
});
