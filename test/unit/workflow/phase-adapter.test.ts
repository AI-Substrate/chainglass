/**
 * Tests for PhaseAdapter production implementation.
 *
 * Per Phase 3: Production Adapters.
 * Per Full TDD: Tests written RED first, then implementation makes them GREEN.
 *
 * Uses FakeFileSystem, FakeYamlParser, FakePathResolver to test
 * PhaseAdapter without real filesystem I/O.
 */

import { FakeFileSystem, FakePathResolver } from '@chainglass/shared';
import {
  EntityNotFoundError,
  FakeYamlParser,
  Phase,
  PhaseAdapter,
  type PhaseDefinition,
  Workflow,
} from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

// ==================== Test Fixtures ====================

const WORKFLOW_DIR = '/home/user/.chainglass/workflows/hello-wf/current';
const RUN_DIR = '/home/user/.chainglass/runs/hello-wf/v001-abc12345/run-2026-01-25-001';
const PHASE_NAME = 'gather';
const PHASE_DIR = `${WORKFLOW_DIR}/${PHASE_NAME}`;
const RUN_PHASE_DIR = `${RUN_DIR}/${PHASE_NAME}`;

/**
 * Sample wf-phase.yaml content
 */
const SAMPLE_WF_PHASE = `
description: Gather information from sources
order: 1
outputs:
  - name: gathered.json
    type: file
    required: true
`;

/**
 * Sample wf-data/wf-phase.json content (runtime state)
 */
const SAMPLE_WF_PHASE_JSON = {
  status: 'complete',
  facilitator: 'agent',
  state: 'executing',
  started_at: '2026-01-25T12:00:00Z',
  completed_at: '2026-01-25T12:30:00Z',
  outputs: [{ name: 'gathered.json', exists: true, valid: true }],
};

/**
 * Create a sample current Workflow for testing
 */
function createSampleWorkflow(): Workflow {
  return Workflow.createCurrent({
    slug: 'hello-wf',
    workflowDir: WORKFLOW_DIR,
    version: '1.0.0',
    description: 'Test workflow',
    phases: [],
  });
}

/**
 * Create a sample run Workflow for testing
 */
function createRunWorkflow(): Workflow {
  return Workflow.createRun({
    slug: 'hello-wf',
    workflowDir: RUN_DIR,
    version: '1.0.0',
    description: 'Test workflow run',
    phases: [],
    checkpoint: {
      ordinal: 1,
      hash: 'abc12345',
      createdAt: new Date('2026-01-25T10:00:00Z'),
    },
    run: {
      runId: 'run-2026-01-25-001',
      runDir: RUN_DIR,
      status: 'active',
      createdAt: new Date('2026-01-25T12:00:00Z'),
    },
  });
}

// ==================== Test Suite ====================

describe('PhaseAdapter', () => {
  let fs: FakeFileSystem;
  let pathResolver: FakePathResolver;
  let yamlParser: FakeYamlParser;
  let adapter: PhaseAdapter;

  beforeEach(() => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
    yamlParser = new FakeYamlParser();
    adapter = new PhaseAdapter(fs, pathResolver, yamlParser);
  });

  // ==================== T007: loadFromPath() ====================

  describe('loadFromPath()', () => {
    it('should load phase from wf-phase.yaml', async () => {
      /*
      Test Doc:
      - Why: Core happy path for loading phase from directory
      - Contract: loadFromPath(phaseDir) returns Phase with definition fields
      - Usage Notes: wf-phase.yaml defines phase structure
      - Quality Contribution: Verifies basic loading works
      - Worked Example: loadFromPath('/path/gather') → Phase with name='gather'
      */
      fs.setFile(`${PHASE_DIR}/wf-phase.yaml`, SAMPLE_WF_PHASE);

      const phase = await adapter.loadFromPath(PHASE_DIR);

      expect(phase).toBeInstanceOf(Phase);
      expect(phase.name).toBe(PHASE_NAME);
      expect(phase.description).toBe('Gather information from sources');
      expect(phase.order).toBe(1);
    });

    it('should set phaseDir and runDir correctly', async () => {
      /*
      Test Doc:
      - Why: Identity fields must be set for navigation
      - Contract: phaseDir matches input, runDir is computed
      - Quality Contribution: Verifies identity fields
      - Worked Example: phaseDir = input path
      */
      fs.setFile(`${PHASE_DIR}/wf-phase.yaml`, SAMPLE_WF_PHASE);

      const phase = await adapter.loadFromPath(PHASE_DIR);

      expect(phase.phaseDir).toBe(PHASE_DIR);
      // runDir for template is the parent workflow dir
      expect(phase.runDir).toBe(WORKFLOW_DIR);
    });

    it('should merge runtime state from wf-data/wf-phase.json', async () => {
      /*
      Test Doc:
      - Why: Run phases have runtime state in wf-data/
      - Contract: Runtime fields populated from wf-phase.json
      - Quality Contribution: Verifies runtime state merging
      - Worked Example: status from wf-phase.json overwrites default
      */
      fs.setFile(`${RUN_PHASE_DIR}/wf-phase.yaml`, SAMPLE_WF_PHASE);
      fs.setFile(`${RUN_PHASE_DIR}/wf-data/wf-phase.json`, JSON.stringify(SAMPLE_WF_PHASE_JSON));

      const phase = await adapter.loadFromPath(RUN_PHASE_DIR);

      expect(phase.status).toBe('complete');
      expect(phase.facilitator).toBe('agent');
      expect(phase.state).toBe('executing');
      expect(phase.startedAt).toBeInstanceOf(Date);
      expect(phase.completedAt).toBeInstanceOf(Date);
    });

    it('should work without wf-data (template phase)', async () => {
      /*
      Test Doc:
      - Why: Template phases have no wf-data directory
      - Contract: Returns Phase with default runtime values
      - Quality Contribution: Verifies template phase handling
      - Worked Example: No wf-data → status='pending', exists=false
      */
      fs.setFile(`${PHASE_DIR}/wf-phase.yaml`, SAMPLE_WF_PHASE);

      const phase = await adapter.loadFromPath(PHASE_DIR);

      expect(phase.status).toBe('pending');
      expect(phase.facilitator).toBe('orchestrator');
      expect(phase.state).toBe('pending');
      expect(phase.startedAt).toBeUndefined();
      expect(phase.completedAt).toBeUndefined();
    });

    it('should throw EntityNotFoundError when phaseDir does not exist', async () => {
      /*
      Test Doc:
      - Why: Error handling for missing phase
      - Contract: Throws EntityNotFoundError with entityType='Phase'
      - Quality Contribution: Verifies proper error type
      - Worked Example: loadFromPath('/nonexistent') → throws
      */
      await expect(adapter.loadFromPath('/nonexistent/phase')).rejects.toThrow(EntityNotFoundError);
    });

    it('should throw EntityNotFoundError when wf-phase.yaml missing', async () => {
      /*
      Test Doc:
      - Why: wf-phase.yaml is required for phase loading
      - Contract: Throws EntityNotFoundError if wf-phase.yaml missing
      - Quality Contribution: Catches corrupt phase directory
      - Worked Example: Dir exists but no wf-phase.yaml → error
      */
      fs.setDir(PHASE_DIR);

      await expect(adapter.loadFromPath(PHASE_DIR)).rejects.toThrow(EntityNotFoundError);
    });

    it('should populate output files with exists/valid flags', async () => {
      /*
      Test Doc:
      - Why: Output status comes from wf-data
      - Contract: outputs array has exists/valid from runtime state
      - Quality Contribution: Verifies output status propagation
      - Worked Example: outputs[0].exists = true if file exists
      */
      fs.setFile(`${RUN_PHASE_DIR}/wf-phase.yaml`, SAMPLE_WF_PHASE);
      fs.setFile(`${RUN_PHASE_DIR}/wf-data/wf-phase.json`, JSON.stringify(SAMPLE_WF_PHASE_JSON));

      const phase = await adapter.loadFromPath(RUN_PHASE_DIR);

      expect(phase.outputs).toHaveLength(1);
      expect(phase.outputs[0].exists).toBe(true);
      expect(phase.outputs[0].valid).toBe(true);
    });

    it('should use pathResolver.join() for all path operations', async () => {
      /*
      Test Doc:
      - Why: Per Critical Discovery 04, must use pathResolver for security
      - Contract: All paths constructed via pathResolver.join()
      - Quality Contribution: Verifies path security compliance
      - Worked Example: pathResolver.join() called
      */
      fs.setFile(`${PHASE_DIR}/wf-phase.yaml`, SAMPLE_WF_PHASE);

      await adapter.loadFromPath(PHASE_DIR);

      const joinCalls = pathResolver.getJoinCalls();
      expect(joinCalls.length).toBeGreaterThan(0);
    });

    it('should extract phase name from directory path', async () => {
      /*
      Test Doc:
      - Why: Phase name comes from directory name
      - Contract: name = basename(phaseDir)
      - Quality Contribution: Verifies name extraction
      - Worked Example: /path/gather → name='gather'
      */
      fs.setFile(`${PHASE_DIR}/wf-phase.yaml`, SAMPLE_WF_PHASE);

      const phase = await adapter.loadFromPath(PHASE_DIR);

      expect(phase.name).toBe('gather');
    });
  });

  // ==================== T008: listForWorkflow() ====================

  describe('listForWorkflow()', () => {
    it('should list phases in execution order', async () => {
      /*
      Test Doc:
      - Why: Phases must be returned in order for UI/execution
      - Contract: Returns Phase[] sorted by order field
      - Usage Notes: Per Critical Insight 5, uses defensive sort
      - Quality Contribution: Verifies sort order
      - Worked Example: [order:2, order:1, order:3] → [1, 2, 3]
      */
      // Create 3 phases with different orders
      const phases = [
        { name: 'process', order: 2 },
        { name: 'gather', order: 1 },
        { name: 'finalize', order: 3 },
      ];

      for (const { name, order } of phases) {
        const phaseDir = `${WORKFLOW_DIR}/${name}`;
        fs.setFile(
          `${phaseDir}/wf-phase.yaml`,
          `description: ${name} phase\norder: ${order}\noutputs: []`
        );
      }

      const workflow = createSampleWorkflow();
      const result = await adapter.listForWorkflow(workflow);

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('gather');
      expect(result[0].order).toBe(1);
      expect(result[1].name).toBe('process');
      expect(result[1].order).toBe(2);
      expect(result[2].name).toBe('finalize');
      expect(result[2].order).toBe(3);
    });

    it('should work for template workflow (current/)', async () => {
      /*
      Test Doc:
      - Why: Template workflows have phases without runtime state
      - Contract: Phases have status='pending', exists=false
      - Quality Contribution: Verifies template phase loading
      - Worked Example: Current workflow → phases with default values
      */
      fs.setFile(`${PHASE_DIR}/wf-phase.yaml`, SAMPLE_WF_PHASE);

      const workflow = createSampleWorkflow();
      const phases = await adapter.listForWorkflow(workflow);

      expect(phases).toHaveLength(1);
      expect(phases[0].status).toBe('pending');
    });

    it('should work for run workflow', async () => {
      /*
      Test Doc:
      - Why: Run workflows have phases with runtime state
      - Contract: Phases have runtime values from wf-data
      - Quality Contribution: Verifies run phase loading
      - Worked Example: Run workflow → phases with runtime status
      */
      fs.setFile(`${RUN_PHASE_DIR}/wf-phase.yaml`, SAMPLE_WF_PHASE);
      fs.setFile(`${RUN_PHASE_DIR}/wf-data/wf-phase.json`, JSON.stringify(SAMPLE_WF_PHASE_JSON));

      const workflow = createRunWorkflow();
      const phases = await adapter.listForWorkflow(workflow);

      expect(phases).toHaveLength(1);
      expect(phases[0].status).toBe('complete');
    });

    it('should return empty array when no phases exist', async () => {
      /*
      Test Doc:
      - Why: Workflow might have no phases yet
      - Contract: Returns [] when no phase directories
      - Quality Contribution: Handles empty case
      - Worked Example: No phase dirs → []
      */
      fs.setDir(WORKFLOW_DIR);

      const workflow = createSampleWorkflow();
      const phases = await adapter.listForWorkflow(workflow);

      expect(phases).toEqual([]);
    });

    it('should throw EntityNotFoundError when workflow directory does not exist', async () => {
      /*
      Test Doc:
      - Why: Cannot list phases for missing workflow
      - Contract: Throws EntityNotFoundError
      - Quality Contribution: Verifies workflow existence check
      - Worked Example: listForWorkflow(missing) → throws
      */
      const missingWorkflow = Workflow.createCurrent({
        slug: 'missing-wf',
        workflowDir: '/nonexistent/workflow',
        version: '1.0.0',
        phases: [],
      });

      await expect(adapter.listForWorkflow(missingWorkflow)).rejects.toThrow(EntityNotFoundError);
    });

    it('should use defensive sorting with name-based tiebreaker', async () => {
      /*
      Test Doc:
      - Why: Per Critical Insight 5, duplicate orders need stable sort
      - Contract: Same order → sort by name (localeCompare)
      - Usage Notes: Prevents non-deterministic ordering
      - Quality Contribution: Verifies stable sort
      - Worked Example: order:1 'beta', order:1 'alpha' → [alpha, beta]
      */
      // Create 2 phases with same order
      for (const name of ['beta', 'alpha']) {
        const phaseDir = `${WORKFLOW_DIR}/${name}`;
        fs.setFile(
          `${phaseDir}/wf-phase.yaml`,
          `description: ${name} phase\norder: 1\noutputs: []`
        );
      }

      const workflow = createSampleWorkflow();
      const phases = await adapter.listForWorkflow(workflow);

      expect(phases).toHaveLength(2);
      expect(phases[0].name).toBe('alpha');
      expect(phases[1].name).toBe('beta');
    });

    it('should only include directories with wf-phase.yaml', async () => {
      /*
      Test Doc:
      - Why: Non-phase directories should be ignored
      - Contract: Only dirs containing wf-phase.yaml are phases
      - Quality Contribution: Filters non-phase content
      - Worked Example: Dir without wf-phase.yaml → not in result
      */
      // Create one valid phase
      fs.setFile(`${PHASE_DIR}/wf-phase.yaml`, SAMPLE_WF_PHASE);
      // Create a non-phase directory (e.g., schemas/)
      fs.setDir(`${WORKFLOW_DIR}/schemas`);

      const workflow = createSampleWorkflow();
      const phases = await adapter.listForWorkflow(workflow);

      expect(phases).toHaveLength(1);
      expect(phases[0].name).toBe('gather');
    });

    it('should set correct runDir for each phase', async () => {
      /*
      Test Doc:
      - Why: runDir needed for Phase → parent navigation
      - Contract: runDir = workflow.workflowDir
      - Quality Contribution: Verifies navigation support
      - Worked Example: Phase.runDir = Workflow.workflowDir
      */
      fs.setFile(`${PHASE_DIR}/wf-phase.yaml`, SAMPLE_WF_PHASE);

      const workflow = createSampleWorkflow();
      const phases = await adapter.listForWorkflow(workflow);

      expect(phases[0].runDir).toBe(workflow.workflowDir);
    });
  });
});
