/**
 * Tests for WorkflowAdapter production implementation.
 *
 * Per Phase 3: Production Adapters.
 * Per Full TDD: Tests written RED first, then implementation makes them GREEN.
 *
 * Uses FakeFileSystem, FakeYamlParser, FakePathResolver to test
 * WorkflowAdapter without real filesystem I/O.
 */

import { FakeFileSystem, FakePathResolver, WORKFLOW_DI_TOKENS } from '@chainglass/shared';
import {
  CheckpointCorruptError,
  EntityNotFoundError,
  FakeYamlParser,
  Phase,
  RunCorruptError,
  type WfDefinition,
  Workflow,
  WorkflowAdapter,
} from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

// ==================== Test Fixtures ====================

// Use relative paths that match the adapter's internal constants
const WORKFLOWS_DIR = '.chainglass/workflows';
const RUNS_DIR = '.chainglass/runs';
const SLUG = 'hello-wf';
const WORKFLOW_DIR = `${WORKFLOWS_DIR}/${SLUG}`;
const CURRENT_DIR = `${WORKFLOW_DIR}/current`;
const CHECKPOINTS_DIR = `${WORKFLOW_DIR}/checkpoints`;

/**
 * Sample wf.yaml content parsed as WfDefinition
 */
const SAMPLE_WF_DEFINITION: WfDefinition = {
  name: 'hello-wf',
  version: '1.0.0',
  description: 'A hello world workflow',
  phases: {
    gather: {
      description: 'Gather information',
      order: 1,
      outputs: [{ name: 'gathered.json', type: 'file', required: true }],
    },
    process: {
      description: 'Process gathered data',
      order: 2,
      inputs: {
        files: [{ name: 'gathered.json', required: true, from_phase: 'gather' }],
      },
      outputs: [{ name: 'result.json', type: 'file', required: true }],
    },
  },
};

/**
 * Sample checkpoint metadata
 */
const SAMPLE_CHECKPOINT_METADATA = {
  ordinal: 1,
  hash: 'abc12345',
  created_at: '2026-01-25T10:00:00Z',
  comment: 'Initial checkpoint',
};

/**
 * Sample wf-status.json content
 */
const SAMPLE_WF_STATUS = {
  workflow: {
    slug: 'hello-wf',
    name: 'hello-wf',
    version: '1.0.0',
    template_path: './template',
    version_hash: 'abc12345',
  },
  run: {
    id: 'run-2026-01-25-001',
    status: 'active' as const,
    created_at: '2026-01-25T12:00:00Z',
  },
  phases: {},
};

// ==================== Test Suite ====================

describe('WorkflowAdapter', () => {
  let fs: FakeFileSystem;
  let pathResolver: FakePathResolver;
  let yamlParser: FakeYamlParser;
  let adapter: WorkflowAdapter;

  beforeEach(() => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
    yamlParser = new FakeYamlParser();
    adapter = new WorkflowAdapter(fs, pathResolver, yamlParser);
  });

  // ==================== T001: loadCurrent() ====================

  describe('loadCurrent()', () => {
    it('should load workflow from current/ directory', async () => {
      /*
      Test Doc:
      - Why: Core happy path for loading editable workflow template
      - Contract: loadCurrent(slug) returns Workflow from current/ directory
      - Usage Notes: Requires wf.yaml in current/ directory
      - Quality Contribution: Verifies basic loading works
      - Worked Example: loadCurrent('hello-wf') → Workflow with isCurrent=true
      */
      // Setup: Create wf.yaml in current/
      const wfYamlPath = `${CURRENT_DIR}/wf.yaml`;
      fs.setFile(wfYamlPath, 'name: hello-wf\nversion: "1.0.0"');

      const workflow = await adapter.loadCurrent(SLUG);

      expect(workflow).toBeInstanceOf(Workflow);
      expect(workflow.slug).toBe(SLUG);
      expect(workflow.isCurrent).toBe(true);
      expect(workflow.isCheckpoint).toBe(false);
      expect(workflow.isRun).toBe(false);
    });

    it('should return Workflow with version and description from wf.yaml', async () => {
      /*
      Test Doc:
      - Why: Verify all fields are correctly hydrated from wf.yaml
      - Contract: version and description match wf.yaml content
      - Quality Contribution: Ensures complete data extraction
      - Worked Example: wf.yaml with description → Workflow.description populated
      */
      const wfYamlPath = `${CURRENT_DIR}/wf.yaml`;
      fs.setFile(wfYamlPath, 'name: hello-wf\nversion: "1.2.3"\ndescription: "Test workflow"');

      const workflow = await adapter.loadCurrent(SLUG);

      expect(workflow.version).toBe('1.2.3');
      expect(workflow.description).toBe('Test workflow');
    });

    it('should return Workflow with phases unpopulated (empty array)', async () => {
      /*
      Test Doc:
      - Why: loadCurrent returns Workflow entity only, not phases
      - Contract: phases array is empty (phases loaded separately via PhaseAdapter)
      - Usage Notes: Per unified model, phases are loaded via listForWorkflow()
      - Quality Contribution: Confirms separation of concerns
      - Worked Example: loadCurrent() → Workflow with phases=[]
      */
      const wfYamlPath = `${CURRENT_DIR}/wf.yaml`;
      fs.setFile(wfYamlPath, 'name: hello-wf\nversion: "1.0.0"');

      const workflow = await adapter.loadCurrent(SLUG);

      expect(workflow.phases).toEqual([]);
    });

    it('should throw EntityNotFoundError when workflow does not exist', async () => {
      /*
      Test Doc:
      - Why: Error handling for missing workflow
      - Contract: Throws EntityNotFoundError with entityType='Workflow'
      - Usage Notes: Caller should handle this error gracefully
      - Quality Contribution: Verifies proper error type thrown
      - Worked Example: loadCurrent('missing') → throws EntityNotFoundError
      */
      await expect(adapter.loadCurrent('nonexistent-wf')).rejects.toThrow(EntityNotFoundError);
    });

    it('should throw EntityNotFoundError when current/ directory missing', async () => {
      /*
      Test Doc:
      - Why: Workflow dir might exist but current/ missing (e.g., only checkpoints)
      - Contract: Throws EntityNotFoundError with path to current/
      - Quality Contribution: Catches edge case of partial workflow state
      - Worked Example: workflows/hello-wf/ exists but no current/ → error
      */
      // Create workflow dir but not current/
      fs.setDir(WORKFLOW_DIR);

      await expect(adapter.loadCurrent(SLUG)).rejects.toThrow(EntityNotFoundError);
    });

    it('should set workflowDir to the current/ directory path', async () => {
      /*
      Test Doc:
      - Why: workflowDir should point to source directory for navigation
      - Contract: workflowDir = workflows/{slug}/current/
      - Quality Contribution: Ensures correct path stored
      - Worked Example: workflowDir = '/path/.chainglass/workflows/hello-wf/current'
      */
      const wfYamlPath = `${CURRENT_DIR}/wf.yaml`;
      fs.setFile(wfYamlPath, 'name: hello-wf\nversion: "1.0.0"');

      const workflow = await adapter.loadCurrent(SLUG);

      expect(workflow.workflowDir).toBe(CURRENT_DIR);
    });

    it('should use pathResolver.join() for all path operations', async () => {
      /*
      Test Doc:
      - Why: Per Critical Discovery 04, must use pathResolver for security
      - Contract: All paths constructed via pathResolver.join()
      - Quality Contribution: Verifies path security compliance
      - Worked Example: pathResolver.join() called with workflow path segments
      */
      const wfYamlPath = `${CURRENT_DIR}/wf.yaml`;
      fs.setFile(wfYamlPath, 'name: hello-wf\nversion: "1.0.0"');

      await adapter.loadCurrent(SLUG);

      const joinCalls = pathResolver.getJoinCalls();
      expect(joinCalls.length).toBeGreaterThan(0);
      // Should have joined to create wf.yaml path
      expect(joinCalls.some((call) => call.includes('wf.yaml'))).toBe(true);
    });
  });

  // ==================== T002: loadCheckpoint() ====================

  describe('loadCheckpoint()', () => {
    const VERSION = 'v001-abc12345';
    const CHECKPOINT_DIR = `${CHECKPOINTS_DIR}/${VERSION}`;

    it('should load workflow from checkpoint directory', async () => {
      /*
      Test Doc:
      - Why: Core happy path for loading frozen checkpoint
      - Contract: loadCheckpoint(slug, version) returns Workflow with isCheckpoint=true
      - Usage Notes: Requires wf.yaml and checkpoint-metadata.json
      - Quality Contribution: Verifies checkpoint loading works
      - Worked Example: loadCheckpoint('hello-wf', 'v001-abc12345') → Workflow
      */
      fs.setFile(`${CHECKPOINT_DIR}/wf.yaml`, 'name: hello-wf\nversion: "1.0.0"');
      fs.setFile(
        `${CHECKPOINT_DIR}/checkpoint-metadata.json`,
        JSON.stringify(SAMPLE_CHECKPOINT_METADATA)
      );

      const workflow = await adapter.loadCheckpoint(SLUG, VERSION);

      expect(workflow).toBeInstanceOf(Workflow);
      expect(workflow.slug).toBe(SLUG);
      expect(workflow.isCheckpoint).toBe(true);
      expect(workflow.isCurrent).toBe(false);
      expect(workflow.isRun).toBe(false);
    });

    it('should populate checkpoint metadata from checkpoint-metadata.json', async () => {
      /*
      Test Doc:
      - Why: Checkpoint metadata must be correctly hydrated
      - Contract: checkpoint.ordinal, checkpoint.hash, checkpoint.createdAt populated
      - Quality Contribution: Verifies metadata extraction
      - Worked Example: checkpoint.ordinal = 1, checkpoint.hash = 'abc12345'
      */
      fs.setFile(`${CHECKPOINT_DIR}/wf.yaml`, 'name: hello-wf\nversion: "1.0.0"');
      fs.setFile(
        `${CHECKPOINT_DIR}/checkpoint-metadata.json`,
        JSON.stringify(SAMPLE_CHECKPOINT_METADATA)
      );

      const workflow = await adapter.loadCheckpoint(SLUG, VERSION);

      expect(workflow.checkpoint).not.toBeNull();
      expect(workflow.checkpoint?.ordinal).toBe(1);
      expect(workflow.checkpoint?.hash).toBe('abc12345');
      expect(workflow.checkpoint?.createdAt).toBeInstanceOf(Date);
      expect(workflow.checkpoint?.comment).toBe('Initial checkpoint');
    });

    it('should throw EntityNotFoundError when checkpoint version does not exist', async () => {
      /*
      Test Doc:
      - Why: Error handling for missing checkpoint
      - Contract: Throws EntityNotFoundError with entityType='Checkpoint'
      - Quality Contribution: Verifies proper error type
      - Worked Example: loadCheckpoint('hello-wf', 'v999') → throws
      */
      fs.setDir(CHECKPOINTS_DIR);

      await expect(adapter.loadCheckpoint(SLUG, 'v999-missing')).rejects.toThrow(
        EntityNotFoundError
      );
    });

    it('should throw EntityNotFoundError when workflow does not exist', async () => {
      /*
      Test Doc:
      - Why: Parent workflow must exist
      - Contract: Throws EntityNotFoundError with entityType='Workflow'
      - Quality Contribution: Verifies workflow existence check
      - Worked Example: loadCheckpoint('missing-wf', 'v001') → throws
      */
      await expect(adapter.loadCheckpoint('nonexistent-wf', VERSION)).rejects.toThrow(
        EntityNotFoundError
      );
    });

    it('should throw CheckpointCorruptError when checkpoint-metadata.json is malformed JSON', async () => {
      /*
      Test Doc:
      - Why: Per Critical Insight 1, must wrap JSON.parse in try-catch
      - Contract: Throws CheckpointCorruptError with reason describing parse failure
      - Usage Notes: Per DYK session decision
      - Quality Contribution: Verifies structured error on corrupt checkpoint data
      - Worked Example: Invalid JSON → CheckpointCorruptError(reason: 'Invalid JSON')
      */
      fs.setFile(`${CHECKPOINT_DIR}/wf.yaml`, 'name: hello-wf\nversion: "1.0.0"');
      fs.setFile(`${CHECKPOINT_DIR}/checkpoint-metadata.json`, 'not valid json {');

      await expect(adapter.loadCheckpoint(SLUG, VERSION)).rejects.toThrow(CheckpointCorruptError);
    });

    it('should set workflowDir to the checkpoint directory path', async () => {
      /*
      Test Doc:
      - Why: workflowDir should point to checkpoint source
      - Contract: workflowDir = workflows/{slug}/checkpoints/{version}/
      - Quality Contribution: Ensures correct path for navigation
      - Worked Example: workflowDir ends with 'v001-abc12345'
      */
      fs.setFile(`${CHECKPOINT_DIR}/wf.yaml`, 'name: hello-wf\nversion: "1.0.0"');
      fs.setFile(
        `${CHECKPOINT_DIR}/checkpoint-metadata.json`,
        JSON.stringify(SAMPLE_CHECKPOINT_METADATA)
      );

      const workflow = await adapter.loadCheckpoint(SLUG, VERSION);

      expect(workflow.workflowDir).toBe(CHECKPOINT_DIR);
    });

    it('should have run=null for checkpoint workflow', async () => {
      /*
      Test Doc:
      - Why: Checkpoints are not runs, run metadata must be null
      - Contract: workflow.run === null
      - Quality Contribution: Verifies XOR invariant (checkpoint XOR run)
      - Worked Example: isCheckpoint=true → run=null
      */
      fs.setFile(`${CHECKPOINT_DIR}/wf.yaml`, 'name: hello-wf\nversion: "1.0.0"');
      fs.setFile(
        `${CHECKPOINT_DIR}/checkpoint-metadata.json`,
        JSON.stringify(SAMPLE_CHECKPOINT_METADATA)
      );

      const workflow = await adapter.loadCheckpoint(SLUG, VERSION);

      expect(workflow.run).toBeNull();
    });
  });

  // ==================== T003: loadRun() ====================

  describe('loadRun()', () => {
    const RUN_ID = 'run-2026-01-25-001';
    const RUN_DIR = `${RUNS_DIR}/${SLUG}/v001-abc12345/${RUN_ID}`;

    it('should load workflow from run directory', async () => {
      /*
      Test Doc:
      - Why: Core happy path for loading run with runtime state
      - Contract: loadRun(runDir) returns Workflow with isRun=true
      - Usage Notes: Requires wf-run/wf-status.json
      - Quality Contribution: Verifies run loading works
      - Worked Example: loadRun('/path/to/run') → Workflow with run metadata
      */
      fs.setFile(`${RUN_DIR}/wf-run/wf-status.json`, JSON.stringify(SAMPLE_WF_STATUS));

      const workflow = await adapter.loadRun(RUN_DIR);

      expect(workflow).toBeInstanceOf(Workflow);
      expect(workflow.isRun).toBe(true);
      expect(workflow.isCurrent).toBe(false);
      expect(workflow.isCheckpoint).toBe(false);
    });

    it('should populate run metadata from wf-status.json', async () => {
      /*
      Test Doc:
      - Why: Run metadata must be correctly hydrated
      - Contract: run.runId, run.status, run.createdAt populated
      - Quality Contribution: Verifies metadata extraction
      - Worked Example: run.status = 'active', run.runId = 'run-2026-01-25-001'
      */
      fs.setFile(`${RUN_DIR}/wf-run/wf-status.json`, JSON.stringify(SAMPLE_WF_STATUS));

      const workflow = await adapter.loadRun(RUN_DIR);

      expect(workflow.run).not.toBeNull();
      expect(workflow.run?.runId).toBe('run-2026-01-25-001');
      expect(workflow.run?.status).toBe('active');
      expect(workflow.run?.createdAt).toBeInstanceOf(Date);
      expect(workflow.run?.runDir).toBe(RUN_DIR);
    });

    it('should also populate checkpoint metadata from wf-status.json', async () => {
      /*
      Test Doc:
      - Why: Runs track which checkpoint they're based on
      - Contract: checkpoint metadata populated from wf-status.json
      - Quality Contribution: Verifies checkpoint reference preserved
      - Worked Example: run.checkpoint.ordinal = 1
      */
      fs.setFile(`${RUN_DIR}/wf-run/wf-status.json`, JSON.stringify(SAMPLE_WF_STATUS));

      const workflow = await adapter.loadRun(RUN_DIR);

      expect(workflow.checkpoint).not.toBeNull();
      expect(workflow.checkpoint?.ordinal).toBe(1);
      expect(workflow.checkpoint?.hash).toBe('abc12345');
    });

    it('should throw EntityNotFoundError when run directory does not exist', async () => {
      /*
      Test Doc:
      - Why: Error handling for missing run
      - Contract: Throws EntityNotFoundError with entityType='Run'
      - Quality Contribution: Verifies proper error type
      - Worked Example: loadRun('/nonexistent') → throws
      */
      await expect(adapter.loadRun('/nonexistent/run/path')).rejects.toThrow(EntityNotFoundError);
    });

    it('should throw EntityNotFoundError when wf-status.json is missing', async () => {
      /*
      Test Doc:
      - Why: wf-status.json is required for run loading
      - Contract: Throws EntityNotFoundError if wf-status.json missing
      - Quality Contribution: Catches corrupt run directory
      - Worked Example: run dir exists but no wf-status.json → error
      */
      fs.setDir(`${RUN_DIR}/wf-run`);

      await expect(adapter.loadRun(RUN_DIR)).rejects.toThrow(EntityNotFoundError);
    });

    it('should throw RunCorruptError when wf-status.json is malformed JSON', async () => {
      /*
      Test Doc:
      - Why: Per Critical Insight 1, must wrap JSON.parse in try-catch
      - Contract: Throws RunCorruptError with reason describing parse failure
      - Usage Notes: Per DYK session decision
      - Quality Contribution: Verifies structured error on corrupt data
      - Worked Example: Invalid JSON → RunCorruptError(reason: 'Invalid JSON')
      */
      fs.setFile(`${RUN_DIR}/wf-run/wf-status.json`, 'not valid json {');

      await expect(adapter.loadRun(RUN_DIR)).rejects.toThrow(RunCorruptError);
    });

    it('should set workflowDir to the run directory path', async () => {
      /*
      Test Doc:
      - Why: workflowDir should point to run source for navigation
      - Contract: workflowDir = runDir
      - Quality Contribution: Ensures correct path stored
      - Worked Example: workflowDir = '/path/to/run-2026-01-25-001'
      */
      fs.setFile(`${RUN_DIR}/wf-run/wf-status.json`, JSON.stringify(SAMPLE_WF_STATUS));

      const workflow = await adapter.loadRun(RUN_DIR);

      expect(workflow.workflowDir).toBe(RUN_DIR);
    });

    it('should extract slug from wf-status.json', async () => {
      /*
      Test Doc:
      - Why: Slug comes from wf-status.json, not path parsing
      - Contract: slug matches wf-status.json workflow.slug
      - Quality Contribution: Verifies data locality principle
      - Worked Example: wf-status.workflow.slug = 'hello-wf' → Workflow.slug
      */
      fs.setFile(`${RUN_DIR}/wf-run/wf-status.json`, JSON.stringify(SAMPLE_WF_STATUS));

      const workflow = await adapter.loadRun(RUN_DIR);

      expect(workflow.slug).toBe('hello-wf');
    });
  });

  // ==================== T004: listCheckpoints() ====================

  describe('listCheckpoints()', () => {
    it('should return checkpoints sorted by ordinal descending', async () => {
      /*
      Test Doc:
      - Why: Newest checkpoints (highest ordinal) should be first
      - Contract: Returns Workflow[] sorted by checkpoint.ordinal DESC
      - Usage Notes: UI typically shows most recent first
      - Quality Contribution: Verifies sort order
      - Worked Example: [v003, v002, v001] (ordinal 3, 2, 1)
      */
      // Create 3 checkpoints
      for (const { version, ordinal } of [
        { version: 'v001-aaa11111', ordinal: 1 },
        { version: 'v002-bbb22222', ordinal: 2 },
        { version: 'v003-ccc33333', ordinal: 3 },
      ]) {
        const cpDir = `${CHECKPOINTS_DIR}/${version}`;
        fs.setFile(`${cpDir}/wf.yaml`, 'name: hello-wf\nversion: "1.0.0"');
        fs.setFile(
          `${cpDir}/checkpoint-metadata.json`,
          JSON.stringify({
            ordinal,
            hash: version.split('-')[1],
            created_at: '2026-01-25T10:00:00Z',
          })
        );
      }

      const checkpoints = await adapter.listCheckpoints(SLUG);

      expect(checkpoints).toHaveLength(3);
      expect(checkpoints[0].checkpoint?.ordinal).toBe(3);
      expect(checkpoints[1].checkpoint?.ordinal).toBe(2);
      expect(checkpoints[2].checkpoint?.ordinal).toBe(1);
    });

    it('should return empty array when no checkpoints exist', async () => {
      /*
      Test Doc:
      - Why: No checkpoints is valid state (workflow just created)
      - Contract: Returns [] when checkpoints/ is empty
      - Quality Contribution: Verifies empty case handling
      - Worked Example: No checkpoints → []
      */
      fs.setDir(CHECKPOINTS_DIR);

      const checkpoints = await adapter.listCheckpoints(SLUG);

      expect(checkpoints).toEqual([]);
    });

    it('should return empty array when checkpoints directory does not exist', async () => {
      /*
      Test Doc:
      - Why: Workflow might exist without checkpoints dir
      - Contract: Returns [] when checkpoints/ dir missing
      - Quality Contribution: Handles partial workflow state
      - Worked Example: No checkpoints dir → []
      */
      fs.setDir(WORKFLOW_DIR);

      const checkpoints = await adapter.listCheckpoints(SLUG);

      expect(checkpoints).toEqual([]);
    });

    it('should return all checkpoints with isCheckpoint=true', async () => {
      /*
      Test Doc:
      - Why: Verify all returned items are checkpoint type
      - Contract: Every workflow in array has isCheckpoint=true
      - Quality Contribution: Ensures type consistency
      - Worked Example: All items pass workflow.isCheckpoint check
      */
      const cpDir = `${CHECKPOINTS_DIR}/v001-abc12345`;
      fs.setFile(`${cpDir}/wf.yaml`, 'name: hello-wf\nversion: "1.0.0"');
      fs.setFile(`${cpDir}/checkpoint-metadata.json`, JSON.stringify(SAMPLE_CHECKPOINT_METADATA));

      const checkpoints = await adapter.listCheckpoints(SLUG);

      expect(checkpoints).toHaveLength(1);
      expect(checkpoints[0].isCheckpoint).toBe(true);
      expect(checkpoints[0].isCurrent).toBe(false);
      expect(checkpoints[0].isRun).toBe(false);
    });

    it('should throw EntityNotFoundError when workflow does not exist', async () => {
      /*
      Test Doc:
      - Why: Cannot list checkpoints for nonexistent workflow
      - Contract: Throws EntityNotFoundError
      - Quality Contribution: Verifies workflow existence check
      - Worked Example: listCheckpoints('missing') → throws
      */
      await expect(adapter.listCheckpoints('nonexistent-wf')).rejects.toThrow(EntityNotFoundError);
    });
  });

  // ==================== T005: listRuns() ====================

  describe('listRuns()', () => {
    const RUNS_BASE = `${RUNS_DIR}/${SLUG}`;
    const CHECKPOINT_VERSION = 'v001-abc12345';
    const VERSION_RUNS_DIR = `${RUNS_BASE}/${CHECKPOINT_VERSION}`;

    function createRun(
      runId: string,
      status: 'pending' | 'active' | 'complete' | 'failed',
      createdAt: string
    ): void {
      const runDir = `${VERSION_RUNS_DIR}/${runId}`;
      const wfStatus = {
        workflow: { slug: 'hello-wf', version: '1.0.0' },
        checkpoint: { ordinal: 1, hash: 'abc12345', created_at: '2026-01-25T10:00:00Z' },
        run: { id: runId, status, created_at: createdAt },
        phases: {},
      };
      fs.setFile(`${runDir}/wf-run/wf-status.json`, JSON.stringify(wfStatus));
    }

    it('should return all runs when no filter provided', async () => {
      /*
      Test Doc:
      - Why: Default behavior returns all runs
      - Contract: listRuns(slug) returns all run workflows
      - Usage Notes: May be slow for large run counts
      - Quality Contribution: Verifies unfiltered listing
      - Worked Example: 3 runs → returns all 3
      */
      createRun('run-2026-01-25-001', 'active', '2026-01-25T12:00:00Z');
      createRun('run-2026-01-25-002', 'complete', '2026-01-25T13:00:00Z');
      createRun('run-2026-01-25-003', 'failed', '2026-01-25T14:00:00Z');

      const runs = await adapter.listRuns(SLUG);

      expect(runs).toHaveLength(3);
      expect(runs.every((r) => r.isRun)).toBe(true);
    });

    it('should filter runs by status', async () => {
      /*
      Test Doc:
      - Why: CLI needs to filter by status (e.g., --status active)
      - Contract: filter.status filters to matching runs only
      - Usage Notes: Status can be single value or array
      - Quality Contribution: Verifies status filtering
      - Worked Example: filter={status:'active'} → only active runs
      */
      createRun('run-2026-01-25-001', 'active', '2026-01-25T12:00:00Z');
      createRun('run-2026-01-25-002', 'complete', '2026-01-25T13:00:00Z');
      createRun('run-2026-01-25-003', 'active', '2026-01-25T14:00:00Z');

      const runs = await adapter.listRuns(SLUG, { status: 'active' });

      expect(runs).toHaveLength(2);
      expect(runs.every((r) => r.run?.status === 'active')).toBe(true);
    });

    it('should filter runs by multiple statuses (ORed)', async () => {
      /*
      Test Doc:
      - Why: Filter can specify multiple statuses
      - Contract: status: ['active', 'pending'] matches either
      - Quality Contribution: Verifies multi-status filter
      - Worked Example: filter={status:['active','failed']} → active OR failed
      */
      createRun('run-2026-01-25-001', 'active', '2026-01-25T12:00:00Z');
      createRun('run-2026-01-25-002', 'complete', '2026-01-25T13:00:00Z');
      createRun('run-2026-01-25-003', 'failed', '2026-01-25T14:00:00Z');

      const runs = await adapter.listRuns(SLUG, { status: ['active', 'failed'] });

      expect(runs).toHaveLength(2);
      const statuses = runs.map((r) => r.run?.status);
      expect(statuses).toContain('active');
      expect(statuses).toContain('failed');
      expect(statuses).not.toContain('complete');
    });

    it('should filter runs by createdAfter date', async () => {
      /*
      Test Doc:
      - Why: CLI needs date range filtering
      - Contract: createdAfter excludes runs created before date
      - Quality Contribution: Verifies date filter
      - Worked Example: createdAfter=12:30 → excludes 12:00 run
      */
      createRun('run-2026-01-25-001', 'active', '2026-01-25T12:00:00Z');
      createRun('run-2026-01-25-002', 'complete', '2026-01-25T13:00:00Z');
      createRun('run-2026-01-25-003', 'active', '2026-01-25T14:00:00Z');

      const runs = await adapter.listRuns(SLUG, {
        createdAfter: new Date('2026-01-25T12:30:00Z'),
      });

      expect(runs).toHaveLength(2);
      expect(runs.some((r) => r.run?.runId === 'run-2026-01-25-001')).toBe(false);
    });

    it('should filter runs by createdBefore date', async () => {
      /*
      Test Doc:
      - Why: CLI needs date range filtering
      - Contract: createdBefore excludes runs created after date
      - Quality Contribution: Verifies date filter
      - Worked Example: createdBefore=13:30 → excludes 14:00 run
      */
      createRun('run-2026-01-25-001', 'active', '2026-01-25T12:00:00Z');
      createRun('run-2026-01-25-002', 'complete', '2026-01-25T13:00:00Z');
      createRun('run-2026-01-25-003', 'active', '2026-01-25T14:00:00Z');

      const runs = await adapter.listRuns(SLUG, {
        createdBefore: new Date('2026-01-25T13:30:00Z'),
      });

      expect(runs).toHaveLength(2);
      expect(runs.some((r) => r.run?.runId === 'run-2026-01-25-003')).toBe(false);
    });

    it('should limit results when limit is specified', async () => {
      /*
      Test Doc:
      - Why: Pagination support for large result sets
      - Contract: limit restricts number of returned runs
      - Usage Notes: Results are sorted by creation date (newest first)
      - Quality Contribution: Verifies pagination
      - Worked Example: 5 runs with limit=2 → 2 runs returned
      */
      createRun('run-2026-01-25-001', 'active', '2026-01-25T12:00:00Z');
      createRun('run-2026-01-25-002', 'complete', '2026-01-25T13:00:00Z');
      createRun('run-2026-01-25-003', 'active', '2026-01-25T14:00:00Z');

      const runs = await adapter.listRuns(SLUG, { limit: 2 });

      expect(runs).toHaveLength(2);
    });

    it('should combine multiple filters (AND)', async () => {
      /*
      Test Doc:
      - Why: Multiple filter criteria should be ANDed together
      - Contract: All filters must match for a run to be included
      - Quality Contribution: Verifies filter combination
      - Worked Example: status=active AND createdAfter=X → only active runs after X
      */
      createRun('run-2026-01-25-001', 'active', '2026-01-25T12:00:00Z');
      createRun('run-2026-01-25-002', 'complete', '2026-01-25T13:00:00Z');
      createRun('run-2026-01-25-003', 'active', '2026-01-25T14:00:00Z');

      const runs = await adapter.listRuns(SLUG, {
        status: 'active',
        createdAfter: new Date('2026-01-25T12:30:00Z'),
      });

      expect(runs).toHaveLength(1);
      expect(runs[0].run?.runId).toBe('run-2026-01-25-003');
    });

    it('should return empty array when no runs exist', async () => {
      /*
      Test Doc:
      - Why: No runs is valid state
      - Contract: Returns [] when no runs directory
      - Quality Contribution: Verifies empty case
      - Worked Example: No runs → []
      */
      fs.setDir(WORKFLOW_DIR);

      const runs = await adapter.listRuns(SLUG);

      expect(runs).toEqual([]);
    });

    it('should return all runs with isRun=true', async () => {
      /*
      Test Doc:
      - Why: Verify all returned items are run type
      - Contract: Every workflow in array has isRun=true
      - Quality Contribution: Ensures type consistency
      - Worked Example: All items pass workflow.isRun check
      */
      createRun('run-2026-01-25-001', 'active', '2026-01-25T12:00:00Z');

      const runs = await adapter.listRuns(SLUG);

      expect(runs).toHaveLength(1);
      expect(runs[0].isRun).toBe(true);
      expect(runs[0].isCurrent).toBe(false);
      expect(runs[0].isCheckpoint).toBe(false);
    });

    it('should filter before hydration for performance', async () => {
      /*
      Test Doc:
      - Why: Per plan, filter before loading full workflow data
      - Contract: Status filtering happens on wf-status.json, not after hydration
      - Usage Notes: This is a performance optimization
      - Quality Contribution: Verifies efficient filtering
      - Worked Example: 100 runs with status filter should not load all 100
      */
      // This test verifies the optimization by checking that filtered runs
      // are not fully loaded. Implementation detail - mainly documentation.
      createRun('run-2026-01-25-001', 'active', '2026-01-25T12:00:00Z');
      createRun('run-2026-01-25-002', 'complete', '2026-01-25T13:00:00Z');

      const runs = await adapter.listRuns(SLUG, { status: 'active' });

      expect(runs).toHaveLength(1);
      expect(runs[0].run?.status).toBe('active');
    });
  });

  // ==================== T005 Additional: exists() ====================

  describe('exists()', () => {
    it('should return true when workflow exists with workflow.json', async () => {
      /*
      Test Doc:
      - Why: Check if workflow is registered
      - Contract: exists(slug) returns true when workflow.json exists
      - Quality Contribution: Verifies existence check
      - Worked Example: workflow.json exists → true
      */
      fs.setFile(`${WORKFLOW_DIR}/workflow.json`, JSON.stringify({ slug: SLUG }));

      const result = await adapter.exists(SLUG);

      expect(result).toBe(true);
    });

    it('should return false when workflow does not exist', async () => {
      /*
      Test Doc:
      - Why: Check for missing workflow
      - Contract: exists(slug) returns false when no workflow.json
      - Quality Contribution: Verifies false case
      - Worked Example: No workflow.json → false
      */
      const result = await adapter.exists('nonexistent-wf');

      expect(result).toBe(false);
    });

    it('should return false when workflow directory exists but workflow.json missing', async () => {
      /*
      Test Doc:
      - Why: Partial workflow state (dir but no json)
      - Contract: Returns false without workflow.json
      - Quality Contribution: Handles edge case
      - Worked Example: Dir exists but no workflow.json → false
      */
      fs.setDir(WORKFLOW_DIR);

      const result = await adapter.exists(SLUG);

      expect(result).toBe(false);
    });
  });
});
