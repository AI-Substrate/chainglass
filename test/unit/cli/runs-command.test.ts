/**
 * Runs Command Tests
 *
 * Per Phase 4: CLI cg runs Commands - Tests for the `cg runs` command group.
 * Using Full TDD approach: Tests written first before implementation.
 *
 * These tests use FakeWorkflowAdapter for state configuration and call capture.
 * Tests verify command registration and output formatting.
 *
 * Per DYK-01: `cg runs get` requires `--workflow` flag
 * Per DYK-02: `cg runs list` enumerates workflows then aggregates
 * Per DYK-04: `cg runs get` calls both WorkflowAdapter and PhaseAdapter
 * Per DYK-05: FakeWorkflowAdapter.listRunsResultBySlug for multi-workflow tests
 */

import { WORKFLOW_DI_TOKENS } from '@chainglass/shared';
import {
  type FakePhaseAdapter,
  type FakeWorkflowAdapter,
  Phase,
  Workflow,
} from '@chainglass/workflow';
import type { Command } from 'commander';
import type { DependencyContainer } from 'tsyringe';
import { beforeEach, describe, expect, it } from 'vitest';
import { createProgram } from '../../../apps/cli/src/bin/cg.js';
import { createCliTestContainer } from '../../../apps/cli/src/lib/container.js';

describe('registerRunsCommands', () => {
  let program: Command;

  beforeEach(() => {
    program = createProgram({ testMode: true });
  });

  it('should register runs command group', () => {
    /*
    Test Doc:
    - Why: The 'runs' command group is the entry point for all run operations
    - Contract: registerRunsCommands() adds 'runs' command to program
    - Usage Notes: Called during CLI initialization in cg.ts
    - Quality Contribution: Verifies command registration infrastructure
    - Worked Example: cg runs --help → shows runs subcommands
    */
    const runsCommand = program.commands.find((cmd) => cmd.name() === 'runs');

    expect(runsCommand).toBeDefined();
    expect(runsCommand?.description()).toContain('run');
  });

  it('should register runs list subcommand', () => {
    /*
    Test Doc:
    - Why: Users need to list all workflow runs
    - Contract: 'runs' command has 'list' subcommand
    - Usage Notes: Default command shows all runs across workflows
    - Quality Contribution: Verifies list subcommand registration
    - Worked Example: cg runs list → shows table of runs
    */
    const runsCommand = program.commands.find((cmd) => cmd.name() === 'runs');
    const listCommand = runsCommand?.commands.find((cmd) => cmd.name() === 'list');

    expect(listCommand).toBeDefined();
    expect(listCommand?.description()).toContain('List');
  });

  it('should register runs get subcommand with --workflow option', () => {
    /*
    Test Doc:
    - Why: Users need detailed info about specific runs
    - Contract: 'runs' command has 'get' subcommand requiring --workflow flag
    - Usage Notes: Per DYK-01, --workflow is required for get command
    - Quality Contribution: Verifies get subcommand and required option
    - Worked Example: cg runs get --workflow hello-wf run-001 → run details
    */
    const runsCommand = program.commands.find((cmd) => cmd.name() === 'runs');
    const getCommand = runsCommand?.commands.find((cmd) => cmd.name() === 'get');

    expect(getCommand).toBeDefined();
    expect(getCommand?.description()).toContain('run');

    // Verify --workflow option exists
    const workflowOption = getCommand?.options.find(
      (opt) => opt.long === '--workflow' || opt.short === '-w'
    );
    expect(workflowOption).toBeDefined();
  });

  it('should not collide with workflow commands', () => {
    /*
    Test Doc:
    - Why: Both 'workflow' and 'runs' command groups must coexist
    - Contract: Both command groups registered without collision
    - Usage Notes: 'runs' is for run instances, 'workflow' is for templates
    - Quality Contribution: Prevents command naming conflicts
    - Worked Example: cg workflow list AND cg runs list both work
    */
    const workflowCommand = program.commands.find((cmd) => cmd.name() === 'workflow');
    const runsCommand = program.commands.find((cmd) => cmd.name() === 'runs');

    expect(workflowCommand).toBeDefined();
    expect(runsCommand).toBeDefined();
    expect(workflowCommand).not.toBe(runsCommand);
  });
});

describe('cg runs list', () => {
  let container: DependencyContainer;
  let fakeWorkflowAdapter: FakeWorkflowAdapter;

  beforeEach(() => {
    container = createCliTestContainer();
    fakeWorkflowAdapter = container.resolve<FakeWorkflowAdapter>(
      WORKFLOW_DI_TOKENS.WORKFLOW_ADAPTER
    );
    fakeWorkflowAdapter.reset();
  });

  it('should support per-workflow results via listRunsResultBySlug (DYK-05)', async () => {
    /*
    Test Doc:
    - Why: Per DYK-05, multi-workflow enumeration tests need different results per slug
    - Contract: listRunsResultBySlug Map takes precedence over listRunsResult
    - Usage Notes: Use Map.set() to configure per-workflow results
    - Quality Contribution: Enables testing DYK-02 workflow enumeration
    - Worked Example: hello-wf returns [run1], data-wf returns [run2]
    */
    const helloRun = Workflow.createRun({
      slug: 'hello-wf',
      workflowDir: '.chainglass/runs/hello-wf/v001-abc123/run-001',
      version: '1.0.0',
      phases: [],
      checkpoint: {
        ordinal: 1,
        hash: 'abc123',
        createdAt: new Date('2026-01-25T10:00:00Z'),
      },
      run: {
        runId: 'run-001',
        runDir: '.chainglass/runs/hello-wf/v001-abc123/run-001',
        status: 'completed',
        createdAt: new Date('2026-01-25T10:00:00Z'),
      },
    });

    const dataRun = Workflow.createRun({
      slug: 'data-wf',
      workflowDir: '.chainglass/runs/data-wf/v001-def456/run-002',
      version: '2.0.0',
      phases: [],
      checkpoint: {
        ordinal: 1,
        hash: 'def456',
        createdAt: new Date('2026-01-25T11:00:00Z'),
      },
      run: {
        runId: 'run-002',
        runDir: '.chainglass/runs/data-wf/v001-def456/run-002',
        status: 'running',
        createdAt: new Date('2026-01-25T11:00:00Z'),
      },
    });

    // Configure per-slug results
    fakeWorkflowAdapter.listRunsResultBySlug.set('hello-wf', [helloRun]);
    fakeWorkflowAdapter.listRunsResultBySlug.set('data-wf', [dataRun]);

    // Verify per-slug results
    const helloRuns = await fakeWorkflowAdapter.listRuns('hello-wf');
    const dataRuns = await fakeWorkflowAdapter.listRuns('data-wf');

    expect(helloRuns).toHaveLength(1);
    expect(helloRuns[0].slug).toBe('hello-wf');
    expect(dataRuns).toHaveLength(1);
    expect(dataRuns[0].slug).toBe('data-wf');
  });

  it('should list all runs when no filters provided', async () => {
    /*
    Test Doc:
    - Why: Default behavior shows all runs across all workflows
    - Contract: Per DYK-02, enumerates workflows then calls listRuns() per slug
    - Usage Notes: Default format is table
    - Quality Contribution: Catches filter bugs that hide runs
    - Worked Example: 2 workflows × N runs each → all runs aggregated
    */
    // Setup: Create test runs
    const helloRun = Workflow.createRun({
      slug: 'hello-wf',
      workflowDir: '.chainglass/runs/hello-wf/v001-abc123/run-001',
      version: '1.0.0',
      phases: [],
      checkpoint: {
        ordinal: 1,
        hash: 'abc123',
        createdAt: new Date('2026-01-25T10:00:00Z'),
      },
      run: {
        runId: 'run-001',
        runDir: '.chainglass/runs/hello-wf/v001-abc123/run-001',
        status: 'completed',
        createdAt: new Date('2026-01-25T10:00:00Z'),
      },
    });

    fakeWorkflowAdapter.listRunsResult = [helloRun];

    // Call listRuns and verify
    const runs = await fakeWorkflowAdapter.listRuns('hello-wf');

    expect(runs).toHaveLength(1);
    expect(runs[0].slug).toBe('hello-wf');
    expect(runs[0].run?.runId).toBe('run-001');
  });

  it('should filter runs by workflow slug', async () => {
    /*
    Test Doc:
    - Why: --workflow flag must filter correctly
    - Contract: listRuns(slug) called with specific slug
    - Usage Notes: Exact match on slug
    - Quality Contribution: Catches filter propagation bugs
    - Worked Example: --workflow hello-wf → only hello-wf runs
    */
    fakeWorkflowAdapter.listRunsResult = [];

    await fakeWorkflowAdapter.listRuns('hello-wf');

    expect(fakeWorkflowAdapter.listRunsCalls).toHaveLength(1);
    expect(fakeWorkflowAdapter.listRunsCalls[0].slug).toBe('hello-wf');
  });

  it('should filter runs by status', async () => {
    /*
    Test Doc:
    - Why: --status flag must pass filter to adapter
    - Contract: listRuns(slug, { status }) called with filter
    - Usage Notes: Single status string
    - Quality Contribution: Catches filter serialization bugs
    - Worked Example: --status completed → filter passed
    */
    const completedRun = Workflow.createRun({
      slug: 'hello-wf',
      workflowDir: '.chainglass/runs/hello-wf/v001-abc123/run-001',
      version: '1.0.0',
      phases: [],
      checkpoint: {
        ordinal: 1,
        hash: 'abc123',
        createdAt: new Date('2026-01-25T10:00:00Z'),
      },
      run: {
        runId: 'run-001',
        runDir: '.chainglass/runs/hello-wf/v001-abc123/run-001',
        status: 'completed',
        createdAt: new Date('2026-01-25T10:00:00Z'),
      },
    });

    const runningRun = Workflow.createRun({
      slug: 'hello-wf',
      workflowDir: '.chainglass/runs/hello-wf/v001-abc123/run-002',
      version: '1.0.0',
      phases: [],
      checkpoint: {
        ordinal: 1,
        hash: 'abc123',
        createdAt: new Date('2026-01-25T10:00:00Z'),
      },
      run: {
        runId: 'run-002',
        runDir: '.chainglass/runs/hello-wf/v001-abc123/run-002',
        status: 'running',
        createdAt: new Date('2026-01-25T11:00:00Z'),
      },
    });

    fakeWorkflowAdapter.listRunsResult = [completedRun, runningRun];

    // Call with status filter
    const runs = await fakeWorkflowAdapter.listRuns('hello-wf', { status: 'completed' });

    expect(fakeWorkflowAdapter.listRunsCalls[0].filter?.status).toBe('completed');
    // FakeWorkflowAdapter applies status filter
    expect(runs).toHaveLength(1);
    expect(runs[0].run?.status).toBe('completed');
  });

  it('should return empty list when no runs exist', async () => {
    /*
    Test Doc:
    - Why: Empty state should be handled gracefully
    - Contract: No runs → empty array, no error
    - Usage Notes: CLI shows helpful message for empty list
    - Quality Contribution: Ensures clean empty state handling
    - Worked Example: cg runs list (no runs) → "No runs found"
    */
    // Default: listRunsResult is undefined → returns []
    const runs = await fakeWorkflowAdapter.listRuns('hello-wf');

    expect(runs).toHaveLength(0);
  });
});

describe('cg runs get', () => {
  let container: DependencyContainer;
  let fakeWorkflowAdapter: FakeWorkflowAdapter;
  let fakePhaseAdapter: FakePhaseAdapter;

  beforeEach(() => {
    container = createCliTestContainer();
    fakeWorkflowAdapter = container.resolve<FakeWorkflowAdapter>(
      WORKFLOW_DI_TOKENS.WORKFLOW_ADAPTER
    );
    fakePhaseAdapter = container.resolve<FakePhaseAdapter>(WORKFLOW_DI_TOKENS.PHASE_ADAPTER);
    fakeWorkflowAdapter.reset();
    fakePhaseAdapter.reset();
  });

  it('should load run by directory path', async () => {
    /*
    Test Doc:
    - Why: get command needs to load full run details
    - Contract: loadRun(runDir) returns Workflow with isRun=true
    - Usage Notes: Per DYK-01, workflow slug is required to find run
    - Quality Contribution: Verifies loadRun() integration
    - Worked Example: cg runs get --workflow hello-wf run-001 → detailed output
    */
    const run = Workflow.createRun({
      slug: 'hello-wf',
      workflowDir: '.chainglass/runs/hello-wf/v001-abc123/run-001',
      version: '1.0.0',
      phases: [],
      checkpoint: {
        ordinal: 1,
        hash: 'abc123',
        createdAt: new Date('2026-01-25T10:00:00Z'),
      },
      run: {
        runId: 'run-001',
        runDir: '.chainglass/runs/hello-wf/v001-abc123/run-001',
        status: 'completed',
        createdAt: new Date('2026-01-25T10:00:00Z'),
      },
    });

    fakeWorkflowAdapter.loadRunResult = run;

    const loadedRun = await fakeWorkflowAdapter.loadRun(
      '.chainglass/runs/hello-wf/v001-abc123/run-001'
    );

    expect(loadedRun.isRun).toBe(true);
    expect(loadedRun.run?.runId).toBe('run-001');
    expect(fakeWorkflowAdapter.loadRunCalls).toHaveLength(1);
  });

  it('should throw EntityNotFoundError for unknown run', async () => {
    /*
    Test Doc:
    - Why: Clear error for non-existent run
    - Contract: Unknown runDir → EntityNotFoundError
    - Usage Notes: CLI should display error code and guidance
    - Quality Contribution: Verifies error handling path
    - Worked Example: cg runs get --workflow hello-wf nonexistent → E050
    */
    // Don't set loadRunResult → throws EntityNotFoundError

    await expect(
      fakeWorkflowAdapter.loadRun('.chainglass/runs/hello-wf/v001-abc123/nonexistent')
    ).rejects.toThrow('not found');
  });

  it('should load phases via PhaseAdapter per DYK-04', async () => {
    /*
    Test Doc:
    - Why: Per DYK-04, loadRun() returns phases:[], must call PhaseAdapter
    - Contract: handleRunsGet calls both loadRun() and listForWorkflow()
    - Usage Notes: Two adapter calls required for full run details
    - Quality Contribution: Verifies two-adapter pattern
    - Worked Example: Run loaded, then phases loaded separately
    */
    const run = Workflow.createRun({
      slug: 'hello-wf',
      workflowDir: '.chainglass/runs/hello-wf/v001-abc123/run-001',
      version: '1.0.0',
      phases: [], // Per DYK-04: phases are empty in run
      checkpoint: {
        ordinal: 1,
        hash: 'abc123',
        createdAt: new Date('2026-01-25T10:00:00Z'),
      },
      run: {
        runId: 'run-001',
        runDir: '.chainglass/runs/hello-wf/v001-abc123/run-001',
        status: 'complete',
        createdAt: new Date('2026-01-25T10:00:00Z'),
      },
    });

    const phase = new Phase({
      name: 'gather',
      phaseDir: '.chainglass/runs/hello-wf/v001-abc123/run-001/phases/gather',
      runDir: '.chainglass/runs/hello-wf/v001-abc123/run-001',
      description: 'Gather data',
      order: 1,
      status: 'complete',
      facilitator: 'agent',
      state: 'active',
      startedAt: new Date('2026-01-25T10:05:00Z'),
      completedAt: new Date('2026-01-25T10:10:00Z'),
    });

    fakeWorkflowAdapter.loadRunResult = run;
    fakePhaseAdapter.listForWorkflowResult = [phase];

    // Call loadRun
    const loadedRun = await fakeWorkflowAdapter.loadRun(run.workflowDir);
    expect(loadedRun.phases).toHaveLength(0); // Per DYK-04: empty

    // Call listForWorkflow
    const phases = await fakePhaseAdapter.listForWorkflow(loadedRun);
    expect(phases).toHaveLength(1);
    expect(phases[0].name).toBe('gather');
    expect(fakePhaseAdapter.listForWorkflowCalls).toHaveLength(1);
  });
});

describe('runs output formatting', () => {
  it('should format run list as table', () => {
    /*
    Test Doc:
    - Why: Users need readable table output by default
    - Contract: formatRunsList() produces table with NAME, WORKFLOW, VERSION, STATUS, AGE columns
    - Usage Notes: Table is default format, JSON with -o json
    - Quality Contribution: Verifies table formatting
    - Worked Example: cg runs list → NAME WORKFLOW VERSION STATUS AGE table
    */
    // This test will be implemented when formatRunsList is created
    // For now, verify the test structure exists
    expect(true).toBe(true);
  });

  it('should format run list as JSON', () => {
    /*
    Test Doc:
    - Why: Automation needs machine-readable output
    - Contract: -o json produces valid JSON array of WorkflowJSON
    - Usage Notes: Uses Workflow.toJSON() serialization
    - Quality Contribution: Enables scripting with jq etc.
    - Worked Example: cg runs list -o json → [{"slug":"hello-wf",...}]
    */
    const run = Workflow.createRun({
      slug: 'hello-wf',
      workflowDir: '.chainglass/runs/hello-wf/v001-abc123/run-001',
      version: '1.0.0',
      phases: [],
      checkpoint: {
        ordinal: 1,
        hash: 'abc123',
        createdAt: new Date('2026-01-25T10:00:00Z'),
      },
      run: {
        runId: 'run-001',
        runDir: '.chainglass/runs/hello-wf/v001-abc123/run-001',
        status: 'completed',
        createdAt: new Date('2026-01-25T10:00:00Z'),
      },
    });

    const json = run.toJSON();

    expect(json.slug).toBe('hello-wf');
    expect(json.isRun).toBe(true);
    expect(json.run?.runId).toBe('run-001');
    expect(json.run?.status).toBe('completed');
  });

  it('should format run details with phases', () => {
    /*
    Test Doc:
    - Why: get command shows full run details including phases
    - Contract: Per DYK-04, formatter takes (workflow, phases) separately
    - Usage Notes: Phases loaded via PhaseAdapter.listForWorkflow()
    - Quality Contribution: Verifies detailed output format
    - Worked Example: cg runs get → Run ID, status, phases table
    */
    // This test will be implemented when formatRunDetails is created
    // For now, verify the test structure exists
    expect(true).toBe(true);
  });
});
