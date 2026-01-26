/**
 * Contract tests for IPhaseAdapter implementations.
 *
 * Per Phase 3: Production Adapters.
 * Per Critical Discovery 06: Contract tests prevent fake drift by ensuring
 * both PhaseAdapter (real) and FakePhaseAdapter pass identical behavioral tests.
 *
 * Follows the established pattern from workflow-registry.contract.test.ts.
 */

import { FakeFileSystem, FakePathResolver } from '@chainglass/shared';
import {
  EntityNotFoundError,
  FakePhaseAdapter,
  FakeYamlParser,
  type IPhaseAdapter,
  Phase,
  PhaseAdapter,
  Workflow,
} from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

// ==================== Test Fixtures ====================

const WORKFLOW_DIR = '/test/.chainglass/workflows/contract-test-wf/current';
const PHASE_NAME = 'gather';
const PHASE_DIR = `${WORKFLOW_DIR}/${PHASE_NAME}`;

/**
 * Sample workflow for contract testing.
 */
const SAMPLE_WORKFLOW = Workflow.createCurrent({
  slug: 'contract-test-wf',
  workflowDir: WORKFLOW_DIR,
  version: '1.0.0',
  description: 'Contract test workflow',
  phases: [],
});

/**
 * Sample phase for contract testing.
 */
const SAMPLE_PHASE = new Phase({
  name: PHASE_NAME,
  phaseDir: PHASE_DIR,
  runDir: WORKFLOW_DIR,
  description: 'Gather information',
  order: 1,
  status: 'pending',
  facilitator: 'orchestrator',
  state: 'pending',
});

// ==================== Contract Test Context ====================

/**
 * Test context for phase adapter contract tests.
 */
interface PhaseAdapterTestContext {
  /** The adapter implementation to test */
  adapter: IPhaseAdapter;
  /** Setup function called before each test */
  setup: () => Promise<void>;
  /** Cleanup function called after each test */
  cleanup: () => Promise<void>;
  /** Description of the implementation */
  name: string;
}

// ==================== Contract Test Factory ====================

/**
 * Contract tests that run against both PhaseAdapter and FakePhaseAdapter.
 *
 * These tests verify the behavioral contract of IPhaseAdapter:
 * - loadFromPath() returns Phase entity
 * - listForWorkflow() returns Phase[] sorted by order
 * - Error handling matches expected behavior
 */
function phaseAdapterContractTests(createContext: () => PhaseAdapterTestContext) {
  let ctx: PhaseAdapterTestContext;

  beforeEach(async () => {
    ctx = createContext();
    await ctx.setup();
  });

  describe(`${createContext().name} implements IPhaseAdapter contract`, () => {
    describe('loadFromPath() contract', () => {
      it('should return Phase entity', async () => {
        /*
        Test Doc:
        - Why: Contract requires loadFromPath returns Phase
        - Contract: loadFromPath(phaseDir) → Phase
        - Quality Contribution: Ensures consistent return type
        */
        const phase = await ctx.adapter.loadFromPath(PHASE_DIR);

        expect(phase).toBeInstanceOf(Phase);
      });

      it('should return Phase with correct name', async () => {
        /*
        Test Doc:
        - Why: Contract requires name matches directory
        - Contract: loadFromPath(dir/name) → Phase.name === name
        - Quality Contribution: Ensures name extraction
        */
        const phase = await ctx.adapter.loadFromPath(PHASE_DIR);

        expect(phase.name).toBe(PHASE_NAME);
      });

      it('should return Phase with order field', async () => {
        /*
        Test Doc:
        - Why: Contract requires order field populated
        - Contract: loadFromPath() → Phase.order is number
        - Quality Contribution: Ensures order extraction
        */
        const phase = await ctx.adapter.loadFromPath(PHASE_DIR);

        expect(typeof phase.order).toBe('number');
      });

      // Note: Error handling for missing phase is implementation-specific.
      // FakePhaseAdapter returns configured results regardless of input.
      // Tested in unit tests, not contract tests.
    });

    describe('listForWorkflow() contract', () => {
      it('should return array of Phase entities', async () => {
        /*
        Test Doc:
        - Why: Contract requires array return type
        - Contract: listForWorkflow(workflow) → Phase[]
        - Quality Contribution: Ensures consistent return type
        */
        const phases = await ctx.adapter.listForWorkflow(SAMPLE_WORKFLOW);

        expect(Array.isArray(phases)).toBe(true);
        if (phases.length > 0) {
          expect(phases[0]).toBeInstanceOf(Phase);
        }
      });

      it('should return phases sorted by order', async () => {
        /*
        Test Doc:
        - Why: Contract requires sorted order
        - Contract: listForWorkflow() → sorted by Phase.order
        - Quality Contribution: Ensures consistent ordering
        */
        const phases = await ctx.adapter.listForWorkflow(SAMPLE_WORKFLOW);

        if (phases.length > 1) {
          for (let i = 1; i < phases.length; i++) {
            expect(phases[i].order).toBeGreaterThanOrEqual(phases[i - 1].order);
          }
        }
      });

      // Note: Error handling for missing workflow is implementation-specific.
      // FakePhaseAdapter returns configured results regardless of input.
      // Tested in unit tests, not contract tests.
    });
  });
}

// ==================== PhaseAdapter Context ====================

function createPhaseAdapterContext(): PhaseAdapterTestContext {
  const fs = new FakeFileSystem();
  const pathResolver = new FakePathResolver();
  const yamlParser = new FakeYamlParser();
  const adapter = new PhaseAdapter(fs, pathResolver, yamlParser);

  return {
    name: 'PhaseAdapter',
    adapter,
    setup: async () => {
      fs.reset();

      // Set up workflow directory
      fs.setDir(WORKFLOW_DIR);

      // Set up phase directory with wf-phase.yaml
      fs.setFile(
        `${PHASE_DIR}/wf-phase.yaml`,
        'description: Gather information\norder: 1\noutputs: []'
      );
    },
    cleanup: async () => {
      fs.reset();
    },
  };
}

// ==================== FakePhaseAdapter Context ====================

function createFakePhaseAdapterContext(): PhaseAdapterTestContext {
  const adapter = new FakePhaseAdapter();

  return {
    name: 'FakePhaseAdapter',
    adapter,
    setup: async () => {
      adapter.reset();

      // Configure fake responses
      adapter.loadFromPathResult = SAMPLE_PHASE;
      adapter.listForWorkflowResult = [SAMPLE_PHASE];
    },
    cleanup: async () => {
      adapter.reset();
    },
  };
}

// ==================== Run Contract Tests ====================

// T011 & T013: Run contract tests for both implementations
phaseAdapterContractTests(createPhaseAdapterContext);
phaseAdapterContractTests(createFakePhaseAdapterContext);
