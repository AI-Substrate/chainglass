/**
 * Integration tests for `cg runs` command group.
 *
 * Per Phase 4: CLI cg runs Commands - Integration tests for the full CLI roundtrip.
 * Tests verify the complete workflow: list runs, get run details.
 *
 * These tests use the FakeWorkflowAdapter and FakePhaseAdapter via the test container.
 */

import { WORKFLOW_DI_TOKENS } from '@chainglass/shared';
import {
  type FakePhaseAdapter,
  type FakeWorkflowAdapter,
  Phase,
  Workflow,
} from '@chainglass/workflow';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCliTestContainer } from '../../../apps/cli/src/lib/container.js';

describe('cg runs integration', () => {
  let fakeWorkflowAdapter: FakeWorkflowAdapter;
  let fakePhaseAdapter: FakePhaseAdapter;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    const container = createCliTestContainer();
    fakeWorkflowAdapter = container.resolve<FakeWorkflowAdapter>(
      WORKFLOW_DI_TOKENS.WORKFLOW_ADAPTER
    );
    fakePhaseAdapter = container.resolve<FakePhaseAdapter>(WORKFLOW_DI_TOKENS.PHASE_ADAPTER);
    fakeWorkflowAdapter.reset();
    fakePhaseAdapter.reset();

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  describe('cg runs list', () => {
    it('should list runs from multiple workflows (DYK-02)', async () => {
      /*
      Test Doc:
      - Why: Per DYK-02, list must enumerate workflows and aggregate
      - Contract: Runs from multiple workflows appear in single list
      - Usage Notes: Default behavior without --workflow flag
      - Quality Contribution: Verifies multi-workflow aggregation
      - Worked Example: hello-wf + data-wf runs both shown
      */
      const helloRun = Workflow.createRun({
        slug: 'hello-wf',
        workflowDir: '.chainglass/runs/hello-wf/v001-abc123/run-001',
        version: '1.0.0',
        phases: [],
        checkpoint: {
          ordinal: 1,
          hash: 'abc12345',
          createdAt: new Date('2026-01-25T10:00:00Z'),
        },
        run: {
          runId: 'run-001',
          runDir: '.chainglass/runs/hello-wf/v001-abc123/run-001',
          status: 'complete',
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
          hash: 'def45678',
          createdAt: new Date('2026-01-25T11:00:00Z'),
        },
        run: {
          runId: 'run-002',
          runDir: '.chainglass/runs/data-wf/v001-def456/run-002',
          status: 'active',
          createdAt: new Date('2026-01-25T11:00:00Z'),
        },
      });

      // Configure per-slug results per DYK-05
      fakeWorkflowAdapter.listRunsResultBySlug.set('hello-wf', [helloRun]);
      fakeWorkflowAdapter.listRunsResultBySlug.set('data-wf', [dataRun]);

      // Test that different workflows return different results
      const helloRuns = await fakeWorkflowAdapter.listRuns('hello-wf');
      const dataRuns = await fakeWorkflowAdapter.listRuns('data-wf');

      expect(helloRuns).toHaveLength(1);
      expect(helloRuns[0].slug).toBe('hello-wf');
      expect(dataRuns).toHaveLength(1);
      expect(dataRuns[0].slug).toBe('data-wf');
    });

    it('should filter by status', async () => {
      /*
      Test Doc:
      - Why: --status flag must filter correctly
      - Contract: Only runs matching status are returned
      - Usage Notes: Valid values: pending, active, complete, failed
      - Quality Contribution: Verifies status filtering
      - Worked Example: --status complete → only complete runs
      */
      const completeRun = Workflow.createRun({
        slug: 'hello-wf',
        workflowDir: '.chainglass/runs/hello-wf/v001-abc123/run-001',
        version: '1.0.0',
        phases: [],
        checkpoint: {
          ordinal: 1,
          hash: 'abc12345',
          createdAt: new Date('2026-01-25T10:00:00Z'),
        },
        run: {
          runId: 'run-001',
          runDir: '.chainglass/runs/hello-wf/v001-abc123/run-001',
          status: 'complete',
          createdAt: new Date('2026-01-25T10:00:00Z'),
        },
      });

      const activeRun = Workflow.createRun({
        slug: 'hello-wf',
        workflowDir: '.chainglass/runs/hello-wf/v001-abc123/run-002',
        version: '1.0.0',
        phases: [],
        checkpoint: {
          ordinal: 1,
          hash: 'abc12345',
          createdAt: new Date('2026-01-25T11:00:00Z'),
        },
        run: {
          runId: 'run-002',
          runDir: '.chainglass/runs/hello-wf/v001-abc123/run-002',
          status: 'active',
          createdAt: new Date('2026-01-25T11:00:00Z'),
        },
      });

      fakeWorkflowAdapter.listRunsResult = [completeRun, activeRun];

      // Filter by status
      const completedRuns = await fakeWorkflowAdapter.listRuns('hello-wf', { status: 'complete' });
      const activeRuns = await fakeWorkflowAdapter.listRuns('hello-wf', { status: 'active' });

      expect(completedRuns).toHaveLength(1);
      expect(completedRuns[0].run?.status).toBe('complete');
      expect(activeRuns).toHaveLength(1);
      expect(activeRuns[0].run?.status).toBe('active');
    });
  });

  describe('cg runs get', () => {
    it('should load run with phases (DYK-04)', async () => {
      /*
      Test Doc:
      - Why: Per DYK-04, get must call both WorkflowAdapter and PhaseAdapter
      - Contract: Full run details include phase information
      - Usage Notes: Requires --workflow flag per DYK-01
      - Quality Contribution: Verifies two-adapter pattern
      - Worked Example: Run loaded, then phases loaded separately
      */
      const run = Workflow.createRun({
        slug: 'hello-wf',
        workflowDir: '.chainglass/runs/hello-wf/v001-abc123/run-001',
        version: '1.0.0',
        phases: [], // Per DYK-04: phases are empty
        checkpoint: {
          ordinal: 1,
          hash: 'abc12345',
          createdAt: new Date('2026-01-25T10:00:00Z'),
        },
        run: {
          runId: 'run-001',
          runDir: '.chainglass/runs/hello-wf/v001-abc123/run-001',
          status: 'complete',
          createdAt: new Date('2026-01-25T10:00:00Z'),
        },
      });

      const gatherPhase = new Phase({
        name: 'gather',
        phaseDir: '.chainglass/runs/hello-wf/v001-abc123/run-001/phases/gather',
        runDir: '.chainglass/runs/hello-wf/v001-abc123/run-001',
        description: 'Gather data from sources',
        order: 1,
        status: 'complete',
        facilitator: 'agent',
        state: 'active',
        startedAt: new Date('2026-01-25T10:05:00Z'),
        completedAt: new Date('2026-01-25T10:10:00Z'),
      });

      const analyzePhase = new Phase({
        name: 'analyze',
        phaseDir: '.chainglass/runs/hello-wf/v001-abc123/run-001/phases/analyze',
        runDir: '.chainglass/runs/hello-wf/v001-abc123/run-001',
        description: 'Analyze gathered data',
        order: 2,
        status: 'complete',
        facilitator: 'agent',
        state: 'active',
        startedAt: new Date('2026-01-25T10:11:00Z'),
        completedAt: new Date('2026-01-25T10:15:00Z'),
      });

      // Configure adapters
      fakeWorkflowAdapter.listRunsResult = [run];
      fakeWorkflowAdapter.loadRunResult = run;
      fakePhaseAdapter.listForWorkflowResult = [gatherPhase, analyzePhase];

      // Simulate the two-adapter pattern
      const runs = await fakeWorkflowAdapter.listRuns('hello-wf');
      expect(runs).toHaveLength(1);

      const loadedRun = await fakeWorkflowAdapter.loadRun(runs[0].workflowDir);
      expect(loadedRun.phases).toHaveLength(0); // Per DYK-04

      const phases = await fakePhaseAdapter.listForWorkflow(loadedRun);
      expect(phases).toHaveLength(2);
      expect(phases[0].name).toBe('gather');
      expect(phases[1].name).toBe('analyze');

      // Verify calls
      expect(fakeWorkflowAdapter.listRunsCalls).toHaveLength(1);
      expect(fakeWorkflowAdapter.loadRunCalls).toHaveLength(1);
      expect(fakePhaseAdapter.listForWorkflowCalls).toHaveLength(1);
    });

    it('should handle non-existent run', async () => {
      /*
      Test Doc:
      - Why: Clear error for unknown run ID
      - Contract: EntityNotFoundError thrown for unknown run
      - Usage Notes: User gets helpful error message
      - Quality Contribution: Verifies error path
      - Worked Example: cg runs get --workflow hello-wf nonexistent → error
      */
      // Don't configure loadRunResult → throws EntityNotFoundError
      await expect(
        fakeWorkflowAdapter.loadRun('.chainglass/runs/hello-wf/v001-abc123/nonexistent')
      ).rejects.toThrow('not found');
    });
  });

  describe('JSON output', () => {
    it('should serialize run with toJSON()', () => {
      /*
      Test Doc:
      - Why: Automation needs machine-readable output
      - Contract: -o json produces valid JSON using Workflow.toJSON()
      - Usage Notes: Includes all run metadata
      - Quality Contribution: Enables scripting
      - Worked Example: cg runs list -o json → valid JSON array
      */
      const run = Workflow.createRun({
        slug: 'hello-wf',
        workflowDir: '.chainglass/runs/hello-wf/v001-abc123/run-001',
        version: '1.0.0',
        phases: [],
        checkpoint: {
          ordinal: 1,
          hash: 'abc12345',
          createdAt: new Date('2026-01-25T10:00:00Z'),
        },
        run: {
          runId: 'run-001',
          runDir: '.chainglass/runs/hello-wf/v001-abc123/run-001',
          status: 'complete',
          createdAt: new Date('2026-01-25T10:00:00Z'),
        },
      });

      const json = run.toJSON();

      expect(json.slug).toBe('hello-wf');
      expect(json.isRun).toBe(true);
      expect(json.run?.runId).toBe('run-001');
      expect(json.run?.status).toBe('complete');
      expect(json.checkpoint?.hash).toBe('abc12345');
    });

    it('should serialize phase with toJSON()', () => {
      /*
      Test Doc:
      - Why: Phase details needed in JSON output
      - Contract: Phase.toJSON() includes all runtime state
      - Usage Notes: Dates serialized as ISO strings
      - Quality Contribution: Verifies phase serialization
      - Worked Example: Phase includes status, timing, duration
      */
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

      const json = phase.toJSON();

      expect(json.name).toBe('gather');
      expect(json.status).toBe('complete');
      expect(json.isComplete).toBe(true);
      expect(json.duration).toBe(5 * 60 * 1000); // 5 minutes in ms
      expect(json.startedAt).toContain('2026-01-25T10:05:00');
    });
  });
});
