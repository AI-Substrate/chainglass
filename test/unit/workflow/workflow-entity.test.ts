/**
 * Tests for Workflow entity class.
 *
 * Per Phase 1: Entity Interfaces & Pure Data Classes - TDD RED first.
 * Per DYK-02: Factory pattern enforces XOR invariant (isCurrent XOR isCheckpoint XOR isRun).
 * Per DYK-03: toJSON() uses camelCase keys, undefined→null, Date→ISO string.
 *
 * The Workflow entity is the unified model - same structure for current, checkpoint, and run sources.
 */

import { Workflow } from '@chainglass/workflow';
import { describe, expect, it } from 'vitest';

// ==================== T006: Workflow entity (current mode) ====================

describe('Workflow entity (current mode)', () => {
  describe('createCurrent() factory', () => {
    it('should create a Workflow from current/ with isCurrent=true', () => {
      /*
      Test Doc:
      - Why: current/ is the editable working copy before checkpointing
      - Contract: createCurrent() returns Workflow with isCurrent=true
      - Usage Notes: Use for loading editable templates
      - Quality Contribution: Ensures correct source type identification
      - Worked Example: Workflow.createCurrent({...}) → workflow.isCurrent === true
      */
      const workflow = Workflow.createCurrent({
        slug: 'hello-wf',
        workflowDir: '/home/user/.chainglass/workflows/hello-wf/current',
        version: '1.0.0',
        description: 'A test workflow',
        phases: [],
      });

      expect(workflow.isCurrent).toBe(true);
      expect(workflow.isCheckpoint).toBe(false);
      expect(workflow.isRun).toBe(false);
    });

    it('should have checkpoint and run set to null (not undefined)', () => {
      /*
      Test Doc:
      - Why: JSON serialization requires explicit null for missing optional fields
      - Contract: checkpoint and run are null when source is current/
      - Usage Notes: Per DYK-03, undefined→null in toJSON()
      - Quality Contribution: Ensures consistent JSON output
      - Worked Example: workflow.checkpoint === null, workflow.run === null
      */
      const workflow = Workflow.createCurrent({
        slug: 'hello-wf',
        workflowDir: '/home/user/.chainglass/workflows/hello-wf/current',
        version: '1.0.0',
        phases: [],
      });

      expect(workflow.checkpoint).toBeNull();
      expect(workflow.run).toBeNull();
    });

    it('should have readonly properties', () => {
      const workflow = Workflow.createCurrent({
        slug: 'hello-wf',
        workflowDir: '/path',
        version: '1.0.0',
        phases: [],
      });

      expect(workflow.slug).toBe('hello-wf');
      expect(workflow.workflowDir).toBe('/path');
      expect(workflow.version).toBe('1.0.0');
    });

    it('should have source getter returning "current"', () => {
      const workflow = Workflow.createCurrent({
        slug: 'hello-wf',
        workflowDir: '/path',
        version: '1.0.0',
        phases: [],
      });

      expect(workflow.source).toBe('current');
    });
  });

  describe('toJSON() (current mode)', () => {
    it('should serialize with camelCase keys', () => {
      const workflow = Workflow.createCurrent({
        slug: 'hello-wf',
        workflowDir: '/path',
        version: '1.0.0',
        description: 'Test',
        phases: [],
      });

      const json = workflow.toJSON();

      expect(json.slug).toBe('hello-wf');
      expect(json.workflowDir).toBe('/path');
      expect(json.version).toBe('1.0.0');
      expect(json.description).toBe('Test');
      expect(json.isCurrent).toBe(true);
      expect(json.isCheckpoint).toBe(false);
      expect(json.isRun).toBe(false);
    });

    it('should serialize null for missing optional fields (not undefined)', () => {
      const workflow = Workflow.createCurrent({
        slug: 'hello-wf',
        workflowDir: '/path',
        version: '1.0.0',
        phases: [],
      });

      const json = workflow.toJSON();

      // Per DYK-03: undefined→null
      expect(json.description).toBeNull();
      expect(json.checkpoint).toBeNull();
      expect(json.run).toBeNull();
    });
  });
});

// ==================== T007: Workflow entity (checkpoint mode) ====================

describe('Workflow entity (checkpoint mode)', () => {
  describe('createCheckpoint() factory', () => {
    it('should create a Workflow from checkpoint/ with isCheckpoint=true', () => {
      /*
      Test Doc:
      - Why: checkpoints are frozen versions for reproducibility
      - Contract: createCheckpoint() returns Workflow with isCheckpoint=true
      - Usage Notes: Use for loading immutable snapshots
      - Quality Contribution: Ensures correct source type identification
      - Worked Example: Workflow.createCheckpoint({...}) → workflow.isCheckpoint === true
      */
      const createdAt = new Date('2026-01-25T10:00:00Z');
      const workflow = Workflow.createCheckpoint({
        slug: 'hello-wf',
        workflowDir: '/home/user/.chainglass/workflows/hello-wf/checkpoints/v001-abc12345',
        version: '1.0.0',
        phases: [],
        checkpoint: {
          ordinal: 1,
          hash: 'abc12345',
          createdAt,
          comment: 'Initial release',
        },
      });

      expect(workflow.isCurrent).toBe(false);
      expect(workflow.isCheckpoint).toBe(true);
      expect(workflow.isRun).toBe(false);
    });

    it('should have checkpoint metadata populated', () => {
      const createdAt = new Date('2026-01-25T10:00:00Z');
      const workflow = Workflow.createCheckpoint({
        slug: 'hello-wf',
        workflowDir: '/path/checkpoints/v001',
        version: '1.0.0',
        phases: [],
        checkpoint: {
          ordinal: 1,
          hash: 'abc12345',
          createdAt,
          comment: 'Initial release',
        },
      });

      expect(workflow.checkpoint).not.toBeNull();
      expect(workflow.checkpoint?.ordinal).toBe(1);
      expect(workflow.checkpoint?.hash).toBe('abc12345');
      expect(workflow.checkpoint?.createdAt).toEqual(createdAt);
      expect(workflow.checkpoint?.comment).toBe('Initial release');
    });

    it('should have run set to null', () => {
      const workflow = Workflow.createCheckpoint({
        slug: 'hello-wf',
        workflowDir: '/path',
        version: '1.0.0',
        phases: [],
        checkpoint: {
          ordinal: 1,
          hash: 'abc12345',
          createdAt: new Date(),
        },
      });

      expect(workflow.run).toBeNull();
    });

    it('should have source getter returning "checkpoint"', () => {
      const workflow = Workflow.createCheckpoint({
        slug: 'hello-wf',
        workflowDir: '/path',
        version: '1.0.0',
        phases: [],
        checkpoint: {
          ordinal: 1,
          hash: 'abc12345',
          createdAt: new Date(),
        },
      });

      expect(workflow.source).toBe('checkpoint');
    });
  });

  describe('toJSON() (checkpoint mode)', () => {
    it('should serialize checkpoint createdAt as ISO string', () => {
      /*
      Test Doc:
      - Why: JSON doesn't support Date objects, need ISO string
      - Contract: Date objects serialize to ISO-8601 strings
      - Usage Notes: Per DYK-03, Date→ISO string
      - Quality Contribution: Ensures web-ready serialization
      - Worked Example: createdAt → "2026-01-25T10:00:00.000Z"
      */
      const createdAt = new Date('2026-01-25T10:00:00Z');
      const workflow = Workflow.createCheckpoint({
        slug: 'hello-wf',
        workflowDir: '/path',
        version: '1.0.0',
        phases: [],
        checkpoint: {
          ordinal: 1,
          hash: 'abc12345',
          createdAt,
          comment: 'Test',
        },
      });

      const json = workflow.toJSON();

      expect(json.checkpoint).not.toBeNull();
      expect(json.checkpoint?.createdAt).toBe('2026-01-25T10:00:00.000Z');
    });

    it('should serialize optional comment as null when missing', () => {
      const workflow = Workflow.createCheckpoint({
        slug: 'hello-wf',
        workflowDir: '/path',
        version: '1.0.0',
        phases: [],
        checkpoint: {
          ordinal: 1,
          hash: 'abc12345',
          createdAt: new Date(),
        },
      });

      const json = workflow.toJSON();

      expect(json.checkpoint?.comment).toBeNull();
    });
  });
});

// ==================== T008: Workflow entity (run mode) ====================

describe('Workflow entity (run mode)', () => {
  describe('createRun() factory', () => {
    it('should create a Workflow from run/ with isRun=true', () => {
      /*
      Test Doc:
      - Why: runs are executions with runtime state
      - Contract: createRun() returns Workflow with isRun=true
      - Usage Notes: Use for loading workflow executions
      - Quality Contribution: Ensures correct source type identification
      - Worked Example: Workflow.createRun({...}) → workflow.isRun === true
      */
      const createdAt = new Date('2026-01-25T10:00:00Z');
      const runCreatedAt = new Date('2026-01-25T11:00:00Z');
      const workflow = Workflow.createRun({
        slug: 'hello-wf',
        workflowDir: '/home/user/.chainglass/runs/hello-wf/v001/run-001',
        version: '1.0.0',
        phases: [],
        checkpoint: {
          ordinal: 1,
          hash: 'abc12345',
          createdAt,
        },
        run: {
          runId: 'run-001',
          runDir: '/home/user/.chainglass/runs/hello-wf/v001/run-001',
          status: 'active',
          createdAt: runCreatedAt,
        },
      });

      expect(workflow.isCurrent).toBe(false);
      expect(workflow.isCheckpoint).toBe(false);
      expect(workflow.isRun).toBe(true);
    });

    it('should have both checkpoint and run metadata populated', () => {
      const checkpointCreatedAt = new Date('2026-01-25T10:00:00Z');
      const runCreatedAt = new Date('2026-01-25T11:00:00Z');
      const workflow = Workflow.createRun({
        slug: 'hello-wf',
        workflowDir: '/path/run-001',
        version: '1.0.0',
        phases: [],
        checkpoint: {
          ordinal: 1,
          hash: 'abc12345',
          createdAt: checkpointCreatedAt,
        },
        run: {
          runId: 'run-001',
          runDir: '/path/run-001',
          status: 'active',
          createdAt: runCreatedAt,
        },
      });

      // Checkpoint metadata
      expect(workflow.checkpoint).not.toBeNull();
      expect(workflow.checkpoint?.ordinal).toBe(1);
      expect(workflow.checkpoint?.hash).toBe('abc12345');

      // Run metadata
      expect(workflow.run).not.toBeNull();
      expect(workflow.run?.runId).toBe('run-001');
      expect(workflow.run?.runDir).toBe('/path/run-001');
      expect(workflow.run?.status).toBe('active');
      expect(workflow.run?.createdAt).toEqual(runCreatedAt);
    });

    it('should have source getter returning "run"', () => {
      const workflow = Workflow.createRun({
        slug: 'hello-wf',
        workflowDir: '/path',
        version: '1.0.0',
        phases: [],
        checkpoint: {
          ordinal: 1,
          hash: 'abc12345',
          createdAt: new Date(),
        },
        run: {
          runId: 'run-001',
          runDir: '/path',
          status: 'pending',
          createdAt: new Date(),
        },
      });

      expect(workflow.source).toBe('run');
    });

    it('should accept all valid run statuses', () => {
      const statuses = ['pending', 'active', 'complete', 'failed'] as const;

      for (const status of statuses) {
        const workflow = Workflow.createRun({
          slug: 'hello-wf',
          workflowDir: '/path',
          version: '1.0.0',
          phases: [],
          checkpoint: {
            ordinal: 1,
            hash: 'abc12345',
            createdAt: new Date(),
          },
          run: {
            runId: 'run-001',
            runDir: '/path',
            status,
            createdAt: new Date(),
          },
        });

        expect(workflow.run?.status).toBe(status);
      }
    });
  });

  describe('toJSON() (run mode)', () => {
    it('should serialize run createdAt as ISO string', () => {
      const runCreatedAt = new Date('2026-01-25T11:00:00Z');
      const workflow = Workflow.createRun({
        slug: 'hello-wf',
        workflowDir: '/path',
        version: '1.0.0',
        phases: [],
        checkpoint: {
          ordinal: 1,
          hash: 'abc12345',
          createdAt: new Date(),
        },
        run: {
          runId: 'run-001',
          runDir: '/path',
          status: 'active',
          createdAt: runCreatedAt,
        },
      });

      const json = workflow.toJSON();

      expect(json.run?.createdAt).toBe('2026-01-25T11:00:00.000Z');
    });

    it('should recursively serialize phases array', () => {
      /*
      Test Doc:
      - Why: Phases need toJSON() called recursively
      - Contract: phases[] in toJSON() contains serialized phase data
      - Usage Notes: Per DYK-03, recursive serialization
      - Quality Contribution: Ensures complete workflow serialization
      - Worked Example: workflow.toJSON().phases is an array of plain objects
      */
      const workflow = Workflow.createRun({
        slug: 'hello-wf',
        workflowDir: '/path',
        version: '1.0.0',
        phases: [], // Empty for now - Phase entity tested separately
        checkpoint: {
          ordinal: 1,
          hash: 'abc12345',
          createdAt: new Date(),
        },
        run: {
          runId: 'run-001',
          runDir: '/path',
          status: 'active',
          createdAt: new Date(),
        },
      });

      const json = workflow.toJSON();

      expect(Array.isArray(json.phases)).toBe(true);
    });
  });
});

// ==================== XOR Invariant Tests ====================

describe('Workflow XOR invariant', () => {
  it('should enforce isCurrent XOR isCheckpoint XOR isRun via factories', () => {
    /*
    Test Doc:
    - Why: Per DYK-02, factory pattern enforces XOR invariant
    - Contract: A Workflow can only be one type (current, checkpoint, or run)
    - Usage Notes: Cannot directly construct Workflow - must use factory methods
    - Quality Contribution: Prevents invalid state combinations
    - Worked Example: createCurrent() → only isCurrent=true
    */
    const current = Workflow.createCurrent({
      slug: 'test',
      workflowDir: '/path',
      version: '1.0.0',
      phases: [],
    });
    expect(current.isCurrent).toBe(true);
    expect(current.isCheckpoint).toBe(false);
    expect(current.isRun).toBe(false);

    const checkpoint = Workflow.createCheckpoint({
      slug: 'test',
      workflowDir: '/path',
      version: '1.0.0',
      phases: [],
      checkpoint: { ordinal: 1, hash: 'abc', createdAt: new Date() },
    });
    expect(checkpoint.isCurrent).toBe(false);
    expect(checkpoint.isCheckpoint).toBe(true);
    expect(checkpoint.isRun).toBe(false);

    const run = Workflow.createRun({
      slug: 'test',
      workflowDir: '/path',
      version: '1.0.0',
      phases: [],
      checkpoint: { ordinal: 1, hash: 'abc', createdAt: new Date() },
      run: { runId: 'r1', runDir: '/path', status: 'pending', createdAt: new Date() },
    });
    expect(run.isCurrent).toBe(false);
    expect(run.isCheckpoint).toBe(false);
    expect(run.isRun).toBe(true);
  });
});

// ==================== isTemplate computed property ====================

describe('Workflow isTemplate computed property', () => {
  it('should return true for current workflows', () => {
    const workflow = Workflow.createCurrent({
      slug: 'test',
      workflowDir: '/path',
      version: '1.0.0',
      phases: [],
    });

    expect(workflow.isTemplate).toBe(true);
  });

  it('should return true for checkpoint workflows', () => {
    const workflow = Workflow.createCheckpoint({
      slug: 'test',
      workflowDir: '/path',
      version: '1.0.0',
      phases: [],
      checkpoint: { ordinal: 1, hash: 'abc', createdAt: new Date() },
    });

    expect(workflow.isTemplate).toBe(true);
  });

  it('should return false for run workflows', () => {
    const workflow = Workflow.createRun({
      slug: 'test',
      workflowDir: '/path',
      version: '1.0.0',
      phases: [],
      checkpoint: { ordinal: 1, hash: 'abc', createdAt: new Date() },
      run: { runId: 'r1', runDir: '/path', status: 'pending', createdAt: new Date() },
    });

    expect(workflow.isTemplate).toBe(false);
  });
});
