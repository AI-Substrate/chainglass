import { FakeFileSystem } from '@chainglass/shared';
import {
  FakeSchemaValidator,
  FakeYamlParser,
  type IPhaseService,
  PhaseService,
  type WfPhaseState,
  type WfStatus,
} from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * Tests for PhaseService.prepare() method.
 *
 * Per Phase 3: Phase Operations - TDD approach, tests first.
 * These tests define the expected behavior of PhaseService.prepare().
 *
 * Test fixture: Uses FakeFileSystem, FakeYamlParser, FakeSchemaValidator
 * to simulate run directories without disk I/O.
 */

// Sample wf-phase.yaml for gather phase (no prior phase)
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
    schema: schemas/gather-data.schema.json
output_parameters:
  - name: item_count
    source: gather-data.json
    query: "items.length"
`;

const GATHER_PHASE_DEF = {
  phase: 'gather',
  description: 'Collect and acknowledge input data',
  order: 1,
  inputs: {
    messages: [{ id: '001', type: 'free_text', from: 'orchestrator', required: true }],
  },
  outputs: [
    { name: 'acknowledgment.md', type: 'file', required: true },
    {
      name: 'gather-data.json',
      type: 'file',
      required: true,
      schema: 'schemas/gather-data.schema.json',
    },
  ],
  output_parameters: [{ name: 'item_count', source: 'gather-data.json', query: 'items.length' }],
};

// Sample wf-phase.yaml for process phase (has from_phase inputs)
const PROCESS_PHASE_YAML = `
phase: process
description: "Process and transform the gathered data"
order: 2
inputs:
  files:
    - name: acknowledgment.md
      required: true
      from_phase: gather
    - name: gather-data.json
      required: true
      from_phase: gather
  parameters:
    - name: item_count
      required: true
      from_phase: gather
outputs:
  - name: result.md
    type: file
    required: true
  - name: process-data.json
    type: file
    required: true
`;

const PROCESS_PHASE_DEF = {
  phase: 'process',
  description: 'Process and transform the gathered data',
  order: 2,
  inputs: {
    files: [
      { name: 'acknowledgment.md', required: true, from_phase: 'gather' },
      { name: 'gather-data.json', required: true, from_phase: 'gather' },
    ],
    parameters: [{ name: 'item_count', required: true, from_phase: 'gather' }],
  },
  outputs: [
    { name: 'result.md', type: 'file', required: true },
    { name: 'process-data.json', type: 'file', required: true },
  ],
};

// Sample wf-status.json
const createWfStatus = (phases: Record<string, { order: number; status: string }>): WfStatus => ({
  workflow: {
    name: 'hello-workflow',
    version: '1.0.0',
    template_path: '../template/hello-workflow',
  },
  run: {
    id: 'run-test-001',
    created_at: '2026-01-22T10:00:00Z',
    status: 'pending',
  },
  phases: phases as WfStatus['phases'],
});

describe('PhaseService', () => {
  let fs: FakeFileSystem;
  let yamlParser: FakeYamlParser;
  let schemaValidator: FakeSchemaValidator;
  let service: IPhaseService;

  const runDir = '/runs/run-test-001';

  // Helper to set up a run directory with phases
  function setupRunDir(gatherStatus = 'pending', processStatus = 'pending'): void {
    // Create wf-status.json
    const wfStatus = createWfStatus({
      gather: { order: 1, status: gatherStatus },
      process: { order: 2, status: processStatus },
    });
    fs.setFile(`${runDir}/wf-run/wf-status.json`, JSON.stringify(wfStatus, null, 2));

    // Create phase directories
    fs.setDir(`${runDir}/phases/gather`);
    fs.setDir(`${runDir}/phases/gather/run/inputs/files`);
    fs.setDir(`${runDir}/phases/gather/run/inputs/data`);
    fs.setDir(`${runDir}/phases/gather/run/outputs`);
    fs.setDir(`${runDir}/phases/gather/run/messages`);
    fs.setFile(`${runDir}/phases/gather/wf-phase.yaml`, GATHER_PHASE_YAML);

    fs.setDir(`${runDir}/phases/process`);
    fs.setDir(`${runDir}/phases/process/run/inputs/files`);
    fs.setDir(`${runDir}/phases/process/run/inputs/data`);
    fs.setDir(`${runDir}/phases/process/run/outputs`);
    fs.setDir(`${runDir}/phases/process/run/messages`);
    fs.setFile(`${runDir}/phases/process/wf-phase.yaml`, PROCESS_PHASE_YAML);

    // Configure YAML parser
    yamlParser.setParseResult(GATHER_PHASE_YAML.trim(), GATHER_PHASE_DEF);
    yamlParser.setParseResult(PROCESS_PHASE_YAML.trim(), PROCESS_PHASE_DEF);
  }

  // Helper to add gather phase outputs (simulating completed gather phase)
  function setupGatherOutputs(): void {
    fs.setFile(
      `${runDir}/phases/gather/run/outputs/acknowledgment.md`,
      '# Acknowledgment\nGathered data...'
    );
    fs.setFile(`${runDir}/phases/gather/run/outputs/gather-data.json`, '{"items": [1, 2, 3]}');
    // Add output-params.json to indicate finalization
    fs.setFile(
      `${runDir}/phases/gather/run/wf-data/output-params.json`,
      JSON.stringify({ item_count: 3 })
    );
  }

  beforeEach(() => {
    fs = new FakeFileSystem();
    yamlParser = new FakeYamlParser();
    schemaValidator = new FakeSchemaValidator();

    // Configure schema validator to pass by default
    schemaValidator.setDefaultResult({ valid: true, errors: [] });

    // Instantiate service with fakes
    service = new PhaseService(fs, yamlParser, schemaValidator);
  });

  describe('prepare()', () => {
    describe('first phase (no prior phase)', () => {
      it('should return PrepareResult with ready status for first phase', async () => {
        /*
        Test Doc:
        - Why: First phase has no dependencies to check
        - Contract: prepare() returns { status: 'ready', errors: [] } for valid first phase
        - Usage Notes: No from_phase inputs to copy for gather
        - Quality Contribution: Ensures basic prepare workflow works
        - Worked Example: prepare('gather', runDir) → { status: 'ready', copiedFromPrior: [] }
        */
        setupRunDir();

        const result = await service.prepare('gather', runDir);
        expect(result.status).toBe('ready');
        expect(result.errors).toHaveLength(0);
        expect(result.phase).toBe('gather');
        expect(result.runDir).toBe(runDir);
        expect(result.copiedFromPrior).toHaveLength(0);
      });

      it('should resolve inputs and list them in result', async () => {
        /*
        Test Doc:
        - Why: Result must show what inputs are available
        - Contract: inputs.required lists declared inputs, inputs.resolved shows file status
        - Usage Notes: For gather, no file inputs declared (only messages)
        - Quality Contribution: Visibility into input resolution
        - Worked Example: prepare('gather') → { inputs: { required: [], resolved: [] } }
        */
        setupRunDir();

        const result = await service.prepare('gather', runDir);
        expect(result.inputs.required).toEqual([]);
        expect(result.inputs.resolved).toEqual([]);
      });

      it('should update wf-status.json to ready status', async () => {
        /*
        Test Doc:
        - Why: Status must be persisted for orchestrator/agent coordination
        - Contract: After prepare(), phase status in wf-status.json is 'ready'
        - Usage Notes: Status transitions: pending → ready
        - Quality Contribution: State tracking correctness
        - Worked Example: After prepare('gather'), wf-status.json shows gather.status = 'ready'
        */
        setupRunDir();

        await service.prepare('gather', runDir);
        const statusContent = await fs.readFile(`${runDir}/wf-run/wf-status.json`);
        const status = JSON.parse(statusContent);
        expect(status.phases.gather.status).toBe('ready');
      });
    });

    describe('phase with from_phase inputs', () => {
      it('should copy from_phase files to inputs/files/', async () => {
        /*
        Test Doc:
        - Why: Process phase needs gather outputs as inputs
        - Contract: Files declared with from_phase are copied to inputs/files/
        - Usage Notes: Source: phases/gather/run/outputs/, Dest: phases/process/run/inputs/files/
        - Quality Contribution: Input resolution for phase chaining
        - Worked Example: prepare('process') copies acknowledgment.md and gather-data.json
        */
        setupRunDir('complete', 'pending');
        setupGatherOutputs();

        const result = await service.prepare('process', runDir);
        expect(result.copiedFromPrior).toHaveLength(2);
        expect(result.copiedFromPrior.map((c) => c.to)).toContain(
          `${runDir}/phases/process/run/inputs/files/acknowledgment.md`
        );
        expect(result.copiedFromPrior.map((c) => c.to)).toContain(
          `${runDir}/phases/process/run/inputs/files/gather-data.json`
        );
      });

      it('should always overwrite from_phase files on re-prepare (DYK Insight #4)', async () => {
        /*
        Test Doc:
        - Why: Idempotent prepare must use fresh data from prior phase
        - Contract: Even if destination file exists, overwrite with source
        - Usage Notes: Per DYK Insight #4 decision: always overwrite
        - Quality Contribution: Ensures latest data after re-prepare
        - Worked Example: Existing file in inputs/files/ is replaced on second prepare
        */
        setupRunDir('complete', 'pending');
        setupGatherOutputs();
        // Pre-existing file with different content
        fs.setFile(`${runDir}/phases/process/run/inputs/files/acknowledgment.md`, 'OLD CONTENT');

        await service.prepare('process', runDir);
        const content = await fs.readFile(
          `${runDir}/phases/process/run/inputs/files/acknowledgment.md`
        );
        expect(content).toBe('# Acknowledgment\nGathered data...');
      });

      it('should resolve parameters to inputs/params.json', async () => {
        /*
        Test Doc:
        - Why: Parameters from prior phase must be accessible
        - Contract: params.json created with resolved parameter values
        - Usage Notes: Reads from prior phase's wf-data/output-params.json
        - Quality Contribution: Parameter passing between phases
        - Worked Example: { item_count: 3 } written to inputs/params.json
        */
        setupRunDir('complete', 'pending');
        setupGatherOutputs();

        await service.prepare('process', runDir);
        const paramsContent = await fs.readFile(`${runDir}/phases/process/run/inputs/params.json`);
        const params = JSON.parse(paramsContent);
        expect(params.item_count).toBe(3);
      });

      it('should list from_phase files in inputs.required', async () => {
        /*
        Test Doc:
        - Why: Agent needs to know what files are expected
        - Contract: inputs.required contains from_phase file names
        - Usage Notes: Shows what was expected from prior phase
        - Quality Contribution: Clear input requirements
        - Worked Example: inputs.required = ['acknowledgment.md', 'gather-data.json']
        */
        setupRunDir('complete', 'pending');
        setupGatherOutputs();

        const result = await service.prepare('process', runDir);
        expect(result.inputs.required).toContain('acknowledgment.md');
        expect(result.inputs.required).toContain('gather-data.json');
      });
    });

    describe('error handling', () => {
      it('should return E001 for missing required from_phase file', async () => {
        /*
        Test Doc:
        - Why: Prior phase output missing means cannot proceed
        - Contract: Returns E001 error with path to missing file
        - Usage Notes: Check prior phase completed with all outputs
        - Quality Contribution: Clear error for missing dependency
        - Worked Example: prepare('process') when gather-data.json missing → E001
        */
        setupRunDir('complete', 'pending');
        // Only set acknowledgment, missing gather-data.json
        fs.setFile(`${runDir}/phases/gather/run/outputs/acknowledgment.md`, '# Ack');
        fs.setFile(`${runDir}/phases/gather/run/wf-data/output-params.json`, '{}');

        const result = await service.prepare('process', runDir);
        expect(result.status).toBe('failed');
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe('E001');
        expect(result.errors[0].message).toContain('gather-data.json');
      });

      it('should return E031 for prior phase not finalized', async () => {
        /*
        Test Doc:
        - Why: Cannot prepare phase if prior is still in progress
        - Contract: Returns E031 when prior phase status not 'complete'
        - Usage Notes: Prior phase must be finalized first
        - Quality Contribution: Workflow ordering enforcement
        - Worked Example: prepare('process') when gather.status='active' → E031
        */
        setupRunDir('active', 'pending'); // gather is 'active', not complete

        const result = await service.prepare('process', runDir);
        expect(result.status).toBe('failed');
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe('E031');
        expect(result.errors[0].message).toContain('gather');
      });

      it('should return E020 for phase not found', async () => {
        /*
        Test Doc:
        - Why: Invalid phase name should be caught early
        - Contract: Returns E020 when phase doesn't exist
        - Usage Notes: Check phase name spelling
        - Quality Contribution: Clear error for typos
        - Worked Example: prepare('nonexistent') → E020
        */
        setupRunDir();

        const result = await service.prepare('nonexistent', runDir);
        expect(result.status).toBe('failed');
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe('E020');
      });
    });

    describe('idempotency (AC-37)', () => {
      it('should return same success result when called twice', async () => {
        /*
        Test Doc:
        - Why: AC-37 requires idempotent prepare
        - Contract: Second call returns identical result (no state corruption)
        - Usage Notes: Safe to retry on network timeout
        - Quality Contribution: Robust agent operation
        - Worked Example: prepare('gather') twice → both return { status: 'ready' }
        */
        setupRunDir();

        const result1 = await service.prepare('gather', runDir);
        const result2 = await service.prepare('gather', runDir);
        expect(result1.status).toBe('ready');
        expect(result2.status).toBe('ready');
        expect(result1.errors).toHaveLength(0);
        expect(result2.errors).toHaveLength(0);
      });

      it('should return success for already ready phase', async () => {
        /*
        Test Doc:
        - Why: Re-preparing a ready phase should succeed
        - Contract: If phase is 'ready', return success without re-doing work
        - Usage Notes: Status >= ready means already prepared
        - Quality Contribution: Efficiency on retry
        - Worked Example: prepare('gather') when already 'ready' → success
        */
        setupRunDir('ready', 'pending');

        const result = await service.prepare('gather', runDir);
        expect(result.status).toBe('ready');
        expect(result.errors).toHaveLength(0);
      });

      it('should return success for phase beyond ready (active/complete)', async () => {
        /*
        Test Doc:
        - Why: Phase that progressed past ready doesn't need re-prepare
        - Contract: If phase is 'active' or 'complete', return success
        - Usage Notes: Prepare is no-op for phases already in progress
        - Quality Contribution: Prevents regression in phase state
        - Worked Example: prepare('gather') when 'complete' → success
        */
        setupRunDir('complete', 'pending');

        const result = await service.prepare('gather', runDir);
        expect(result.status).toBe('ready'); // Returns ready status in result
        expect(result.errors).toHaveLength(0);
      });
    });
  });

  describe('validate()', () => {
    // Helper to set up outputs
    function setupGatherOutputsWithSchema(): void {
      fs.setFile(
        `${runDir}/phases/gather/run/outputs/acknowledgment.md`,
        '# Acknowledgment\nData gathered.'
      );
      fs.setFile(
        `${runDir}/phases/gather/run/outputs/gather-data.json`,
        JSON.stringify({ items: [1, 2, 3] })
      );
      // Set up schema file
      fs.setFile(
        `${runDir}/phases/gather/schemas/gather-data.schema.json`,
        JSON.stringify({
          type: 'object',
          properties: { items: { type: 'array' } },
          required: ['items'],
        })
      );
    }

    describe('outputs mode (--check outputs)', () => {
      it('should return ValidateResult with validated outputs', async () => {
        /*
        Test Doc:
        - Why: Agent needs confirmation that outputs are valid
        - Contract: Returns { check: 'outputs', files: { validated: [...] }, errors: [] }
        - Usage Notes: All required outputs must exist and be non-empty
        - Quality Contribution: Verifies phase completion readiness
        - Worked Example: validate('gather', runDir, 'outputs') → all outputs valid
        */
        setupRunDir('active', 'pending');
        setupGatherOutputsWithSchema();

        const result = await service.validate('gather', runDir, 'outputs');
        expect(result.check).toBe('outputs');
        expect(result.errors).toHaveLength(0);
        expect(result.files.validated).toHaveLength(2);
        expect(result.files.validated.map((f) => f.name)).toContain('acknowledgment.md');
        expect(result.files.validated.map((f) => f.name)).toContain('gather-data.json');
      });

      it('should return E010 for missing required output', async () => {
        /*
        Test Doc:
        - Why: AC-12: Missing output returns E010
        - Contract: E010 error with path to missing file
        - Usage Notes: Output must be created before validation passes
        - Quality Contribution: Clear error for missing output
        - Worked Example: validate('gather') when acknowledgment.md missing → E010
        */
        setupRunDir('active', 'pending');
        // Only set one output, missing acknowledgment.md
        fs.setFile(`${runDir}/phases/gather/run/outputs/gather-data.json`, '{"items": []}');

        const result = await service.validate('gather', runDir, 'outputs');
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors.some((e) => e.code === 'E010')).toBe(true);
        expect(result.errors.some((e) => e.message.includes('acknowledgment.md'))).toBe(true);
      });

      it('should return E011 for empty output file', async () => {
        /*
        Test Doc:
        - Why: AC-13: Empty output returns E011
        - Contract: E011 error for files that exist but are empty
        - Usage Notes: Output must have content
        - Quality Contribution: Catches incomplete outputs
        - Worked Example: validate('gather') when acknowledgment.md empty → E011
        */
        setupRunDir('active', 'pending');
        fs.setFile(`${runDir}/phases/gather/run/outputs/acknowledgment.md`, '   '); // whitespace only
        fs.setFile(`${runDir}/phases/gather/run/outputs/gather-data.json`, '{"items": []}');

        const result = await service.validate('gather', runDir, 'outputs');
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors.some((e) => e.code === 'E011')).toBe(true);
      });

      it('should return E012 for schema validation failure', async () => {
        /*
        Test Doc:
        - Why: AC-14: Schema failure returns E012
        - Contract: E012 with expected/actual values
        - Usage Notes: Output must match declared schema
        - Quality Contribution: Enforces output contracts
        - Worked Example: validate('gather') when gather-data.json invalid → E012
        */
        setupRunDir('active', 'pending');
        fs.setFile(`${runDir}/phases/gather/run/outputs/acknowledgment.md`, '# Ack');
        // Invalid data - missing required 'items' field
        const invalidData = { wrong_field: true };
        fs.setFile(
          `${runDir}/phases/gather/run/outputs/gather-data.json`,
          JSON.stringify(invalidData)
        );
        // Schema requires 'items' array
        fs.setFile(
          `${runDir}/phases/gather/schemas/gather-data.schema.json`,
          JSON.stringify({
            type: 'object',
            properties: { items: { type: 'array' } },
            required: ['items'],
          })
        );
        // Configure schema validator to fail for this specific data
        schemaValidator.setInvalid(invalidData, [
          {
            code: 'E012',
            message: 'Required property "items" is missing',
            path: '/items',
            expected: 'array',
            actual: 'undefined',
            action: 'Add required "items" property',
          },
        ]);

        const result = await service.validate('gather', runDir, 'outputs');
        expect(result.errors.some((e) => e.code === 'E012')).toBe(true);
      });
    });

    describe('inputs mode (--check inputs)', () => {
      it('should validate input files exist', async () => {
        /*
        Test Doc:
        - Why: AC-15b: validate --check inputs validates input files
        - Contract: Returns validated inputs when they exist
        - Usage Notes: For phases with from_phase inputs
        - Quality Contribution: Confirms phase ready for execution
        - Worked Example: validate('process', runDir, 'inputs') → inputs valid
        */
        setupRunDir('complete', 'ready');
        // Set up process phase inputs
        fs.setFile(`${runDir}/phases/process/run/inputs/files/acknowledgment.md`, '# Ack');
        fs.setFile(`${runDir}/phases/process/run/inputs/files/gather-data.json`, '{"items": []}');

        const result = await service.validate('process', runDir, 'inputs');
        expect(result.check).toBe('inputs');
        expect(result.errors).toHaveLength(0);
        expect(result.files.validated.length).toBeGreaterThan(0);
      });

      it('should return E010 for missing input file', async () => {
        /*
        Test Doc:
        - Why: Missing input should be caught on validate inputs
        - Contract: E010 error for missing input file
        - Usage Notes: Input files must exist for valid inputs
        - Quality Contribution: Catches missing dependencies
        - Worked Example: validate('process', 'inputs') when file missing → E010
        */
        setupRunDir('complete', 'ready');
        // Only set one input file
        fs.setFile(`${runDir}/phases/process/run/inputs/files/acknowledgment.md`, '# Ack');

        const result = await service.validate('process', runDir, 'inputs');
        expect(result.errors.some((e) => e.code === 'E010')).toBe(true);
      });
    });

    describe('error handling', () => {
      it('should return E020 for phase not found', async () => {
        /*
        Test Doc:
        - Why: Invalid phase name should be caught
        - Contract: Returns E020 when phase doesn't exist
        - Usage Notes: Check phase name spelling
        - Quality Contribution: Clear error for typos
        - Worked Example: validate('nonexistent') → E020
        */
        setupRunDir();

        const result = await service.validate('nonexistent', runDir, 'outputs');
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe('E020');
      });
    });

    describe('idempotency (AC-38)', () => {
      it('should return identical results on repeated calls', async () => {
        /*
        Test Doc:
        - Why: AC-38 requires idempotent validate
        - Contract: Multiple calls return same result
        - Usage Notes: Safe to retry validation
        - Quality Contribution: Deterministic behavior
        - Worked Example: validate('gather') twice → identical results
        */
        setupRunDir('active', 'pending');
        setupGatherOutputsWithSchema();

        const result1 = await service.validate('gather', runDir, 'outputs');
        const result2 = await service.validate('gather', runDir, 'outputs');

        expect(result1.errors).toHaveLength(result2.errors.length);
        expect(result1.files.validated.length).toBe(result2.files.validated.length);
        expect(result1.check).toBe(result2.check);
      });
    });
  });

  describe('finalize()', () => {
    // Sample phase definition with output_parameters for extraction
    const GATHER_PHASE_DEF_WITH_PARAMS = {
      phase: 'gather',
      description: 'Collect and acknowledge input data',
      order: 1,
      inputs: {
        messages: [{ id: '001', type: 'free_text', from: 'orchestrator', required: true }],
      },
      outputs: [
        { name: 'acknowledgment.md', type: 'file', required: true },
        {
          name: 'gather-data.json',
          type: 'file',
          required: true,
          schema: 'schemas/gather-data.schema.json',
        },
      ],
      output_parameters: [
        { name: 'item_count', source: 'gather-data.json', query: 'count' },
        { name: 'request_type', source: 'gather-data.json', query: 'classification.type' },
      ],
    };

    // Phase with no output_parameters (terminal phase like report)
    const REPORT_PHASE_DEF = {
      phase: 'report',
      description: 'Generate final report',
      order: 3,
      inputs: {
        files: [{ name: 'result.md', required: true, from_phase: 'process' }],
      },
      outputs: [{ name: 'final-report.md', type: 'file', required: true }],
      // No output_parameters - terminal phase
    };

    const REPORT_PHASE_YAML = `
phase: report
description: "Generate final report"
order: 3
inputs:
  files:
    - name: result.md
      required: true
      from_phase: process
outputs:
  - name: final-report.md
    type: file
    required: true
`;

    // Helper to set up gather phase with output_parameters config
    function setupGatherForFinalize(gatherStatus = 'active'): void {
      const wfStatus = createWfStatus({
        gather: { order: 1, status: gatherStatus },
        process: { order: 2, status: 'pending' },
      });
      fs.setFile(`${runDir}/wf-run/wf-status.json`, JSON.stringify(wfStatus, null, 2));

      // Create wf-phase.yaml with output_parameters
      const gatherYaml = `
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
    schema: schemas/gather-data.schema.json
output_parameters:
  - name: item_count
    source: gather-data.json
    query: "count"
  - name: request_type
    source: gather-data.json
    query: "classification.type"
`;
      fs.setFile(`${runDir}/phases/gather/wf-phase.yaml`, gatherYaml);
      fs.setDir(`${runDir}/phases/gather/run/wf-data`);
      fs.setDir(`${runDir}/phases/gather/run/outputs`);

      // Configure YAML parser
      yamlParser.setParseResult(gatherYaml.trim(), GATHER_PHASE_DEF_WITH_PARAMS);
    }

    // Helper to set up gather outputs with extractable data
    function setupGatherOutputsForExtraction(): void {
      fs.setFile(
        `${runDir}/phases/gather/run/outputs/acknowledgment.md`,
        '# Acknowledgment\nGathered data...'
      );
      // Note: Using explicit 'count' field per DYK Insight #2 (agents write explicit values)
      fs.setFile(
        `${runDir}/phases/gather/run/outputs/gather-data.json`,
        JSON.stringify({
          count: 3,
          items: [1, 2, 3],
          classification: { type: 'processing' },
        })
      );
    }

    // Helper to set up report phase (terminal, no output_parameters)
    function setupReportForFinalize(): void {
      const wfStatus = createWfStatus({
        gather: { order: 1, status: 'complete' },
        process: { order: 2, status: 'complete' },
        report: { order: 3, status: 'active' },
      });
      fs.setFile(`${runDir}/wf-run/wf-status.json`, JSON.stringify(wfStatus, null, 2));

      fs.setFile(`${runDir}/phases/report/wf-phase.yaml`, REPORT_PHASE_YAML.trim());
      fs.setDir(`${runDir}/phases/report/run/wf-data`);
      fs.setDir(`${runDir}/phases/report/run/outputs`);
      fs.setFile(`${runDir}/phases/report/run/outputs/final-report.md`, '# Final Report\n...');

      yamlParser.setParseResult(REPORT_PHASE_YAML.trim(), REPORT_PHASE_DEF);
    }

    describe('parameter extraction', () => {
      it('should extract output_parameters from output JSON files', async () => {
        /*
        Test Doc:
        - Why: AC-18: finalize creates output-params.json with extracted values
        - Contract: Parameters are extracted using dot-notation queries
        - Usage Notes: Source file must exist and contain valid JSON
        - Quality Contribution: Enables phase-to-phase data flow
        - Worked Example: finalize('gather') → extractedParams: { item_count: 3, request_type: 'processing' }
        */
        setupGatherForFinalize();
        setupGatherOutputsForExtraction();

        const result = await service.finalize('gather', runDir);

        expect(result.errors).toHaveLength(0);
        expect(result.extractedParams).toEqual({
          item_count: 3,
          request_type: 'processing',
        });
      });

      it('should write output-params.json with extracted parameters', async () => {
        /*
        Test Doc:
        - Why: AC-18: finalize creates output-params.json
        - Contract: File written to phases/{phase}/run/wf-data/output-params.json
        - Usage Notes: Downstream phases read this file
        - Quality Contribution: Parameter persistence for phase chaining
        - Worked Example: After finalize, output-params.json contains { item_count: 3 }
        */
        setupGatherForFinalize();
        setupGatherOutputsForExtraction();

        await service.finalize('gather', runDir);

        const outputParamsContent = await fs.readFile(
          `${runDir}/phases/gather/run/wf-data/output-params.json`
        );
        const outputParams = JSON.parse(outputParamsContent);
        expect(outputParams).toEqual({
          item_count: 3,
          request_type: 'processing',
        });
      });

      it('should store null for query path that returns undefined', async () => {
        /*
        Test Doc:
        - Why: Missing query paths should not fail, just store null
        - Contract: If query returns undefined, store null (not error)
        - Usage Notes: Per DYK Insight #3: query returning undefined stores null
        - Quality Contribution: Graceful handling of optional parameters
        - Worked Example: query='missing.path' → extractedParams.missing = null
        */
        setupGatherForFinalize();
        // Output doesn't have classification.type
        fs.setFile(
          `${runDir}/phases/gather/run/outputs/gather-data.json`,
          JSON.stringify({ count: 3, items: [1, 2, 3] }) // No classification field
        );

        const result = await service.finalize('gather', runDir);

        expect(result.errors).toHaveLength(0);
        expect(result.extractedParams.item_count).toBe(3);
        expect(result.extractedParams.request_type).toBeNull();
      });
    });

    describe('state updates', () => {
      it('should update wf-status.json phase status to complete', async () => {
        /*
        Test Doc:
        - Why: Run-level status must reflect phase completion
        - Contract: phases.{phase}.status = 'complete' in wf-status.json
        - Usage Notes: Orchestrator checks this for phase progression
        - Quality Contribution: State machine correctness
        - Worked Example: After finalize('gather'), wf-status.json shows gather.status='complete'
        */
        setupGatherForFinalize();
        setupGatherOutputsForExtraction();

        await service.finalize('gather', runDir);

        const statusContent = await fs.readFile(`${runDir}/wf-run/wf-status.json`);
        const status = JSON.parse(statusContent);
        expect(status.phases.gather.status).toBe('complete');
      });

      it('should update wf-phase.json with complete state and finalize action', async () => {
        /*
        Test Doc:
        - Why: Per DYK Insight #1: Dual state file updates for data independence
        - Contract: wf-phase.json gets state='complete' and finalize action in status[]
        - Usage Notes: Phases must be self-contained from data perspective
        - Quality Contribution: Phase-local audit trail
        - Worked Example: wf-phase.json has { state: 'complete', status: [..., { action: 'finalize' }] }
        */
        setupGatherForFinalize();
        setupGatherOutputsForExtraction();
        // Set up initial wf-phase.json
        const initialPhaseState: WfPhaseState = {
          phase: 'gather',
          facilitator: 'agent',
          state: 'active',
          status: [{ timestamp: '2026-01-22T10:00:00Z', from: 'orchestrator', action: 'prepare' }],
        };
        fs.setFile(
          `${runDir}/phases/gather/run/wf-data/wf-phase.json`,
          JSON.stringify(initialPhaseState, null, 2)
        );

        await service.finalize('gather', runDir);

        const phaseStateContent = await fs.readFile(
          `${runDir}/phases/gather/run/wf-data/wf-phase.json`
        );
        const phaseState = JSON.parse(phaseStateContent) as WfPhaseState;
        expect(phaseState.state).toBe('complete');
        expect(phaseState.status.length).toBeGreaterThan(1);
        expect(phaseState.status[phaseState.status.length - 1].action).toBe('finalize');
      });

      it('should return FinalizeResult with phaseStatus complete', async () => {
        /*
        Test Doc:
        - Why: AC-18a: JSON output includes phaseStatus
        - Contract: FinalizeResult.phaseStatus = 'complete'
        - Usage Notes: Confirms phase is done
        - Quality Contribution: Clear success indication
        - Worked Example: finalize('gather') → { phaseStatus: 'complete' }
        */
        setupGatherForFinalize();
        setupGatherOutputsForExtraction();

        const result = await service.finalize('gather', runDir);

        expect(result.phaseStatus).toBe('complete');
        expect(result.phase).toBe('gather');
        expect(result.runDir).toBe(runDir);
      });
    });

    describe('terminal phase (no output_parameters)', () => {
      it('should handle phase with no output_parameters gracefully', async () => {
        /*
        Test Doc:
        - Why: Terminal phases like report have no parameters to extract
        - Contract: extractedParams is {} for phases without output_parameters
        - Usage Notes: Not an error - just no parameters
        - Quality Contribution: Supports terminal phases
        - Worked Example: finalize('report') → { extractedParams: {} }
        */
        setupReportForFinalize();

        const result = await service.finalize('report', runDir);

        expect(result.errors).toHaveLength(0);
        expect(result.extractedParams).toEqual({});
        expect(result.phaseStatus).toBe('complete');
      });
    });

    describe('error handling', () => {
      it('should return E020 for unknown phase', async () => {
        /*
        Test Doc:
        - Why: Invalid phase name should be caught early
        - Contract: Returns E020 when phase doesn't exist
        - Usage Notes: Check phase name spelling
        - Quality Contribution: Clear error for typos
        - Worked Example: finalize('nonexistent') → E020
        */
        setupGatherForFinalize();

        const result = await service.finalize('nonexistent', runDir);

        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe('E020');
        expect(result.errors[0].message).toContain('nonexistent');
      });

      it('should return E010 for missing output_parameter source file', async () => {
        /*
        Test Doc:
        - Why: Cannot extract from non-existent file
        - Contract: Returns E010 when source file missing
        - Usage Notes: Ensure outputs written before finalize
        - Quality Contribution: Clear error for missing source
        - Worked Example: finalize with missing gather-data.json → E010
        */
        setupGatherForFinalize();
        // Set up acknowledgment but NOT gather-data.json
        fs.setFile(`${runDir}/phases/gather/run/outputs/acknowledgment.md`, '# Ack');

        const result = await service.finalize('gather', runDir);

        expect(result.errors.some((e) => e.code === 'E010')).toBe(true);
        expect(result.errors.some((e) => e.message.includes('gather-data.json'))).toBe(true);
      });

      it('should return E012 for invalid JSON in source file', async () => {
        /*
        Test Doc:
        - Why: Cannot parse invalid JSON
        - Contract: Returns E012 when source file is not valid JSON
        - Usage Notes: Ensure output files are valid JSON
        - Quality Contribution: Clear error for malformed output
        - Worked Example: finalize with invalid JSON → E012
        */
        setupGatherForFinalize();
        fs.setFile(`${runDir}/phases/gather/run/outputs/acknowledgment.md`, '# Ack');
        // Invalid JSON
        fs.setFile(
          `${runDir}/phases/gather/run/outputs/gather-data.json`,
          '{ invalid json content'
        );

        const result = await service.finalize('gather', runDir);

        expect(result.errors.some((e) => e.code === 'E012')).toBe(true);
      });
    });

    describe('idempotency (AC-39)', () => {
      it('should overwrite on re-finalize (always re-extract)', async () => {
        /*
        Test Doc:
        - Why: AC-39: finalize is idempotent - always re-extract and overwrite
        - Contract: Second call does full extraction and overwrites files
        - Usage Notes: Per DYK Insight #4: just do the job, no status checks
        - Quality Contribution: Safe retry behavior
        - Worked Example: finalize twice → both succeed, files overwritten
        */
        setupGatherForFinalize('active');
        setupGatherOutputsForExtraction();

        // First finalize
        const result1 = await service.finalize('gather', runDir);
        expect(result1.errors).toHaveLength(0);
        expect(result1.phaseStatus).toBe('complete');

        // Change the output data
        fs.setFile(
          `${runDir}/phases/gather/run/outputs/gather-data.json`,
          JSON.stringify({
            count: 5, // Changed from 3
            items: [1, 2, 3, 4, 5],
            classification: { type: 'updated' },
          })
        );

        // Update wf-status.json back to active to simulate re-run scenario
        // (in reality, the previous call set it to complete, but we test re-extract behavior)
        setupGatherForFinalize('complete');
        setupGatherOutputsForExtraction();
        fs.setFile(
          `${runDir}/phases/gather/run/outputs/gather-data.json`,
          JSON.stringify({
            count: 5,
            items: [1, 2, 3, 4, 5],
            classification: { type: 'updated' },
          })
        );

        // Second finalize - should re-extract and update
        const result2 = await service.finalize('gather', runDir);
        expect(result2.errors).toHaveLength(0);
        expect(result2.extractedParams.item_count).toBe(5);
        expect(result2.extractedParams.request_type).toBe('updated');

        // Verify files were overwritten
        const outputParamsContent = await fs.readFile(
          `${runDir}/phases/gather/run/wf-data/output-params.json`
        );
        const outputParams = JSON.parse(outputParamsContent);
        expect(outputParams.item_count).toBe(5);
      });

      it('should succeed when called twice (re-entrancy)', async () => {
        /*
        Test Doc:
        - Why: AC-40: Commands retry after failure without manual cleanup
        - Contract: Second call after first success still succeeds
        - Usage Notes: No "already finalized" errors
        - Quality Contribution: Robust retry behavior
        - Worked Example: finalize('gather') twice → both return success
        */
        setupGatherForFinalize();
        setupGatherOutputsForExtraction();

        const result1 = await service.finalize('gather', runDir);
        const result2 = await service.finalize('gather', runDir);

        expect(result1.errors).toHaveLength(0);
        expect(result2.errors).toHaveLength(0);
        expect(result1.phaseStatus).toBe('complete');
        expect(result2.phaseStatus).toBe('complete');
      });
    });
  });
});
