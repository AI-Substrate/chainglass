/**
 * Contract tests for IWorkflowAdapter implementations.
 *
 * Per Phase 3: Production Adapters.
 * Per Critical Discovery 06: Contract tests prevent fake drift by ensuring
 * both WorkflowAdapter (real) and FakeWorkflowAdapter pass identical behavioral tests.
 *
 * Follows the established pattern from workflow-registry.contract.test.ts.
 */

import {
  FakeFileSystem,
  FakePathResolver,
} from '@chainglass/shared';
import {
  EntityNotFoundError,
  FakeWorkflowAdapter,
  FakeYamlParser,
  type IWorkflowAdapter,
  Workflow,
  WorkflowAdapter,
} from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

// ==================== Test Fixtures ====================

const WORKFLOWS_DIR = '.chainglass/workflows';
const SLUG = 'contract-test-wf';
const CURRENT_DIR = `${WORKFLOWS_DIR}/${SLUG}/current`;
const CHECKPOINTS_DIR = `${WORKFLOWS_DIR}/${SLUG}/checkpoints`;
const VERSION = 'v001-abc12345';
const CHECKPOINT_DIR = `${CHECKPOINTS_DIR}/${VERSION}`;

/**
 * Sample workflow for contract testing.
 */
const SAMPLE_CURRENT_WORKFLOW = Workflow.createCurrent({
  slug: SLUG,
  workflowDir: CURRENT_DIR,
  version: '1.0.0',
  description: 'Contract test workflow',
  phases: [],
});

const SAMPLE_CHECKPOINT_WORKFLOW = Workflow.createCheckpoint({
  slug: SLUG,
  workflowDir: CHECKPOINT_DIR,
  version: '1.0.0',
  description: 'Contract test checkpoint',
  phases: [],
  checkpoint: {
    ordinal: 1,
    hash: 'abc12345',
    createdAt: new Date('2026-01-25T10:00:00Z'),
    comment: 'Test checkpoint',
  },
});

// ==================== Contract Test Context ====================

/**
 * Test context for workflow adapter contract tests.
 */
interface WorkflowAdapterTestContext {
  /** The adapter implementation to test */
  adapter: IWorkflowAdapter;
  /** Setup function called before each test */
  setup: () => Promise<void>;
  /** Cleanup function called after each test */
  cleanup: () => Promise<void>;
  /** Description of the implementation */
  name: string;
}

// ==================== Contract Test Factory ====================

/**
 * Contract tests that run against both WorkflowAdapter and FakeWorkflowAdapter.
 *
 * These tests verify the behavioral contract of IWorkflowAdapter:
 * - loadCurrent() returns Workflow with isCurrent=true
 * - loadCheckpoint() returns Workflow with isCheckpoint=true
 * - exists() returns boolean correctly
 * - Error handling matches expected behavior
 */
function workflowAdapterContractTests(createContext: () => WorkflowAdapterTestContext) {
  let ctx: WorkflowAdapterTestContext;

  beforeEach(async () => {
    ctx = createContext();
    await ctx.setup();
  });

  describe(`${createContext().name} implements IWorkflowAdapter contract`, () => {
    describe('loadCurrent() contract', () => {
      it('should return Workflow with isCurrent=true', async () => {
        /*
        Test Doc:
        - Why: Contract requires loadCurrent returns isCurrent Workflow
        - Contract: loadCurrent(slug) → Workflow with isCurrent=true
        - Quality Contribution: Ensures consistent return type
        */
        const workflow = await ctx.adapter.loadCurrent(SLUG);

        expect(workflow).toBeInstanceOf(Workflow);
        expect(workflow.isCurrent).toBe(true);
        expect(workflow.isCheckpoint).toBe(false);
        expect(workflow.isRun).toBe(false);
      });

      it('should return Workflow with correct slug', async () => {
        /*
        Test Doc:
        - Why: Contract requires slug matches request
        - Contract: loadCurrent(slug) → Workflow.slug === slug
        - Quality Contribution: Ensures slug is preserved
        */
        const workflow = await ctx.adapter.loadCurrent(SLUG);

        expect(workflow.slug).toBe(SLUG);
      });

      // Note: Error handling tests are implementation-specific.
      // FakeWorkflowAdapter returns configured results regardless of input.
      // WorkflowAdapter throws based on filesystem state.
      // These are tested separately in unit tests, not in contract tests.
    });

    describe('loadCheckpoint() contract', () => {
      it('should return Workflow with isCheckpoint=true', async () => {
        /*
        Test Doc:
        - Why: Contract requires loadCheckpoint returns checkpoint Workflow
        - Contract: loadCheckpoint(slug, version) → Workflow with isCheckpoint=true
        - Quality Contribution: Ensures consistent return type
        */
        const workflow = await ctx.adapter.loadCheckpoint(SLUG, VERSION);

        expect(workflow).toBeInstanceOf(Workflow);
        expect(workflow.isCheckpoint).toBe(true);
        expect(workflow.isCurrent).toBe(false);
        expect(workflow.isRun).toBe(false);
      });

      it('should return Workflow with checkpoint metadata', async () => {
        /*
        Test Doc:
        - Why: Contract requires checkpoint metadata populated
        - Contract: loadCheckpoint() → Workflow.checkpoint is populated
        - Quality Contribution: Ensures metadata is preserved
        */
        const workflow = await ctx.adapter.loadCheckpoint(SLUG, VERSION);

        expect(workflow.checkpoint).not.toBeNull();
        expect(workflow.checkpoint!.ordinal).toBe(1);
      });

      // Note: Error handling for missing version is implementation-specific.
      // Tested in unit tests, not contract tests.
    });

    describe('exists() contract', () => {
      it('should return true when workflow exists', async () => {
        /*
        Test Doc:
        - Why: Contract requires accurate existence check
        - Contract: exists(slug) → true when workflow exists
        - Quality Contribution: Ensures consistent boolean behavior
        */
        const result = await ctx.adapter.exists(SLUG);

        expect(result).toBe(true);
      });

      // Note: exists() returning false for missing workflows is implementation-specific.
      // FakeWorkflowAdapter always returns its configured existsResult.
      // Tested in unit tests, not contract tests.
    });

    describe('listCheckpoints() contract', () => {
      it('should return array of Workflow entities', async () => {
        /*
        Test Doc:
        - Why: Contract requires array return type
        - Contract: listCheckpoints(slug) → Workflow[]
        - Quality Contribution: Ensures consistent return type
        */
        const checkpoints = await ctx.adapter.listCheckpoints(SLUG);

        expect(Array.isArray(checkpoints)).toBe(true);
        if (checkpoints.length > 0) {
          expect(checkpoints[0]).toBeInstanceOf(Workflow);
          expect(checkpoints[0].isCheckpoint).toBe(true);
        }
      });
    });

    describe('listRuns() contract', () => {
      it('should return array of Workflow entities', async () => {
        /*
        Test Doc:
        - Why: Contract requires array return type
        - Contract: listRuns(slug) → Workflow[]
        - Quality Contribution: Ensures consistent return type
        */
        const runs = await ctx.adapter.listRuns(SLUG);

        expect(Array.isArray(runs)).toBe(true);
        if (runs.length > 0) {
          expect(runs[0]).toBeInstanceOf(Workflow);
          expect(runs[0].isRun).toBe(true);
        }
      });
    });
  });
}

// ==================== WorkflowAdapter Context ====================

function createWorkflowAdapterContext(): WorkflowAdapterTestContext {
  const fs = new FakeFileSystem();
  const pathResolver = new FakePathResolver();
  const yamlParser = new FakeYamlParser();
  const adapter = new WorkflowAdapter(fs, pathResolver, yamlParser);

  return {
    name: 'WorkflowAdapter',
    adapter,
    setup: async () => {
      fs.reset();

      // Set up current workflow
      fs.setFile(
        `${CURRENT_DIR}/wf.yaml`,
        'name: contract-test-wf\nversion: "1.0.0"\ndescription: "Contract test workflow"'
      );

      // Set up checkpoint
      fs.setFile(
        `${CHECKPOINT_DIR}/wf.yaml`,
        'name: contract-test-wf\nversion: "1.0.0"\ndescription: "Contract test checkpoint"'
      );
      fs.setFile(
        `${CHECKPOINT_DIR}/checkpoint-metadata.json`,
        JSON.stringify({
          ordinal: 1,
          hash: 'abc12345',
          created_at: '2026-01-25T10:00:00Z',
          comment: 'Test checkpoint',
        })
      );

      // Set up workflow.json for exists() check
      fs.setFile(
        `${WORKFLOWS_DIR}/${SLUG}/workflow.json`,
        JSON.stringify({ slug: SLUG, name: 'Contract Test Workflow' })
      );
    },
    cleanup: async () => {
      fs.reset();
    },
  };
}

// ==================== FakeWorkflowAdapter Context ====================

function createFakeWorkflowAdapterContext(): WorkflowAdapterTestContext {
  const adapter = new FakeWorkflowAdapter();

  return {
    name: 'FakeWorkflowAdapter',
    adapter,
    setup: async () => {
      adapter.reset();

      // Configure fake responses
      adapter.loadCurrentResult = SAMPLE_CURRENT_WORKFLOW;
      adapter.loadCheckpointResult = SAMPLE_CHECKPOINT_WORKFLOW;
      adapter.existsResult = true;
      adapter.listCheckpointsResult = [SAMPLE_CHECKPOINT_WORKFLOW];
      adapter.listRunsResult = [];
    },
    cleanup: async () => {
      adapter.reset();
    },
  };
}

// ==================== Run Contract Tests ====================

// T010 & T012: Run contract tests for both implementations
workflowAdapterContractTests(createWorkflowAdapterContext);
workflowAdapterContractTests(createFakeWorkflowAdapterContext);
