import {
  FakeFileSystem,
  FakePathResolver,
  type WorkflowSummary,
} from '@chainglass/shared';
import {
  FakeWorkflowRegistry,
  FakeYamlParser,
  type IWorkflowRegistry,
  WorkflowRegistryErrorCodes,
  WorkflowRegistryService,
} from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * Contract tests for IWorkflowRegistry implementations.
 *
 * Per Critical Discovery 08: Contract tests prevent fake drift by ensuring
 * both WorkflowRegistryService and FakeWorkflowRegistry pass the same behavioral tests.
 *
 * Note: The FakeWorkflowRegistry requires explicit setup via setListResult/setInfoResult
 * to match expected behaviors, unlike the real service which reads from filesystem.
 */

// Sample workflow.json content
const SAMPLE_WORKFLOW_JSON = JSON.stringify({
  slug: 'contract-test-wf',
  name: 'Contract Test Workflow',
  description: 'A workflow for contract testing',
  created_at: '2026-01-24T10:00:00Z',
  tags: ['test'],
});

const WORKFLOWS_DIR = '.chainglass/workflows';

/**
 * Test context for workflow registry contract tests.
 */
interface WorkflowRegistryTestContext {
  /** The workflow registry implementation to test */
  registry: IWorkflowRegistry;
  /** Setup function called before each test */
  setup: () => Promise<void>;
  /** Cleanup function called after each test */
  cleanup: () => Promise<void>;
  /** Description of the implementation */
  name: string;
}

/**
 * Contract tests that run against both WorkflowRegistryService and FakeWorkflowRegistry.
 */
function workflowRegistryContractTests(createContext: () => WorkflowRegistryTestContext) {
  let ctx: WorkflowRegistryTestContext;

  beforeEach(async () => {
    ctx = createContext();
    await ctx.setup();
  });

  describe(`${createContext().name} implements IWorkflowRegistry contract`, () => {
    describe('list() return type', () => {
      it('should return a ListResult object', async () => {
        /*
        Test Doc:
        - Why: Contract requires consistent return type
        - Contract: list() returns object with workflows and errors arrays
        - Usage Notes: All implementations must return this shape
        - Quality Contribution: Ensures type consistency
        - Worked Example: list(dir) → { workflows: [], errors: [] }
        */
        const result = await ctx.registry.list(WORKFLOWS_DIR);

        expect(result).toHaveProperty('workflows');
        expect(result).toHaveProperty('errors');
        expect(Array.isArray(result.workflows)).toBe(true);
        expect(Array.isArray(result.errors)).toBe(true);
      });

      it('should return workflows with correct shape', async () => {
        /*
        Test Doc:
        - Why: Contract requires WorkflowSummary shape for listed workflows
        - Contract: Each workflow has slug, name, checkpointCount
        - Usage Notes: Description is optional
        - Quality Contribution: Ensures workflow data consistency
        - Worked Example: list() → { workflows: [{ slug: 'x', name: 'X', checkpointCount: 0 }] }
        */
        const result = await ctx.registry.list(WORKFLOWS_DIR);

        if (result.errors.length === 0 && result.workflows.length > 0) {
          for (const workflow of result.workflows) {
            expect(workflow).toHaveProperty('slug');
            expect(workflow).toHaveProperty('name');
            expect(workflow).toHaveProperty('checkpointCount');
            expect(typeof workflow.slug).toBe('string');
            expect(typeof workflow.name).toBe('string');
            expect(typeof workflow.checkpointCount).toBe('number');
          }
        }
      });
    });

    describe('info() return type', () => {
      it('should return an InfoResult object', async () => {
        /*
        Test Doc:
        - Why: Contract requires consistent return type
        - Contract: info() returns object with workflow (optional) and errors
        - Usage Notes: workflow is undefined when errors.length > 0
        - Quality Contribution: Ensures type consistency
        - Worked Example: info(dir, slug) → { workflow?: {...}, errors: [] }
        */
        const result = await ctx.registry.info(WORKFLOWS_DIR, 'contract-test-wf');

        expect(result).toHaveProperty('errors');
        expect(Array.isArray(result.errors)).toBe(true);
        // workflow may be defined or undefined depending on setup
      });

      it('should return error with code property on failure', async () => {
        /*
        Test Doc:
        - Why: Contract requires actionable error codes
        - Contract: Errors have code, message, and optionally action
        - Usage Notes: Use error codes for programmatic handling
        - Quality Contribution: Ensures agent-friendly errors
        - Worked Example: info(dir, 'nonexistent') → { errors: [{ code: 'E030', message: '...' }] }
        */
        const result = await ctx.registry.info(WORKFLOWS_DIR, 'nonexistent-workflow-xyz');

        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toHaveProperty('code');
        expect(result.errors[0]).toHaveProperty('message');
        expect(result.errors[0].code).toBe(WorkflowRegistryErrorCodes.WORKFLOW_NOT_FOUND);
      });
    });

    describe('getCheckpointDir()', () => {
      it('should return correct path format', async () => {
        /*
        Test Doc:
        - Why: Contract requires consistent checkpoint path construction
        - Contract: getCheckpointDir(dir, slug) returns dir/slug/checkpoints
        - Usage Notes: Path is synchronous, no filesystem access
        - Quality Contribution: Ensures consistent checkpoint location
        - Worked Example: getCheckpointDir('.chainglass/workflows', 'hello') → '.chainglass/workflows/hello/checkpoints'
        */
        const result = ctx.registry.getCheckpointDir(WORKFLOWS_DIR, 'hello-wf');

        expect(result).toContain(WORKFLOWS_DIR);
        expect(result).toContain('hello-wf');
        expect(result).toContain('checkpoints');
      });
    });
  });
}

// ==================== WorkflowRegistryService Context ====================

function createWorkflowRegistryServiceContext(): WorkflowRegistryTestContext {
  const fs = new FakeFileSystem();
  const yamlParser = new FakeYamlParser();
  const pathResolver = new FakePathResolver();
  const registry = new WorkflowRegistryService(fs, pathResolver, yamlParser);

  return {
    name: 'WorkflowRegistryService',
    registry,
    setup: async () => {
      fs.reset();
      yamlParser.reset();

      // Set up test workflow
      fs.setFile(`${WORKFLOWS_DIR}/contract-test-wf/workflow.json`, SAMPLE_WORKFLOW_JSON);
      fs.setDir(`${WORKFLOWS_DIR}/contract-test-wf/checkpoints`);
    },
    cleanup: async () => {
      fs.reset();
    },
  };
}

// ==================== FakeWorkflowRegistry Context ====================

function createFakeWorkflowRegistryContext(): WorkflowRegistryTestContext {
  const registry = new FakeWorkflowRegistry();

  const sampleWorkflowSummary: WorkflowSummary = {
    slug: 'contract-test-wf',
    name: 'Contract Test Workflow',
    description: 'A workflow for contract testing',
    checkpointCount: 0,
  };

  return {
    name: 'FakeWorkflowRegistry',
    registry,
    setup: async () => {
      registry.reset();

      // Configure fake to return success for the test workflow list
      registry.setListResult(WORKFLOWS_DIR, {
        errors: [],
        workflows: [sampleWorkflowSummary],
      });

      // Configure fake to return success for info on test workflow
      registry.setInfoResult(WORKFLOWS_DIR, 'contract-test-wf', {
        errors: [],
        workflow: {
          slug: 'contract-test-wf',
          name: 'Contract Test Workflow',
          description: 'A workflow for contract testing',
          createdAt: '2026-01-24T10:00:00Z',
          tags: ['test'],
          checkpointCount: 0,
          versions: [],
        },
      });

      // Configure fake to return E030 for non-existent workflows
      registry.setInfoError(
        WORKFLOWS_DIR,
        'nonexistent-workflow-xyz',
        WorkflowRegistryErrorCodes.WORKFLOW_NOT_FOUND,
        'Workflow not found: nonexistent-workflow-xyz',
        `Create workflow at ${WORKFLOWS_DIR}/nonexistent-workflow-xyz/`
      );
    },
    cleanup: async () => {
      registry.reset();
    },
  };
}

// ==================== Run Contract Tests ====================

describe('WorkflowRegistry Contract Tests', () => {
  workflowRegistryContractTests(createWorkflowRegistryServiceContext);
});

describe('FakeWorkflowRegistry Contract Tests', () => {
  workflowRegistryContractTests(createFakeWorkflowRegistryContext);
});
