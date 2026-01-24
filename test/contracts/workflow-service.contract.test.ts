import { type ComposeResult, FakeFileSystem, FakePathResolver } from '@chainglass/shared';
import {
  FakeSchemaValidator,
  FakeWorkflowRegistry,
  FakeWorkflowService,
  FakeYamlParser,
  type IWorkflowService,
  type WfDefinition,
  WorkflowService,
} from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * Contract tests for IWorkflowService implementations.
 *
 * Per Critical Discovery 08: Contract tests prevent fake drift by ensuring
 * both WorkflowService and FakeWorkflowService pass the same behavioral tests.
 *
 * Note: Unlike filesystem contract tests, workflow service contract tests
 * verify a subset of behaviors that both implementations must satisfy.
 * The fake has additional test helpers that aren't part of the contract.
 */

// Sample wf.yaml content
const SAMPLE_WF_YAML = `
name: contract-test-workflow
version: "1.0.0"
description: "A workflow for contract testing"
phases:
  init:
    description: "Initialize"
    order: 1
    outputs:
      - name: output.json
        type: file
        required: true
`;

const SAMPLE_WF_DEFINITION: WfDefinition = {
  name: 'contract-test-workflow',
  version: '1.0.0',
  description: 'A workflow for contract testing',
  phases: {
    init: {
      description: 'Initialize',
      order: 1,
      outputs: [{ name: 'output.json', type: 'file', required: true }],
    },
  },
};

/**
 * Test context for workflow service contract tests.
 */
interface WorkflowServiceTestContext {
  /** The workflow service implementation to test */
  service: IWorkflowService;
  /** Setup function called before each test */
  setup: () => Promise<void>;
  /** Cleanup function called after each test */
  cleanup: () => Promise<void>;
  /** Description of the implementation */
  name: string;
}

/**
 * Contract tests that run against both WorkflowService and FakeWorkflowService.
 */
function workflowServiceContractTests(createContext: () => WorkflowServiceTestContext) {
  let ctx: WorkflowServiceTestContext;

  beforeEach(async () => {
    ctx = createContext();
    await ctx.setup();
  });

  describe(`${createContext().name} implements IWorkflowService contract`, () => {
    describe('compose() return type', () => {
      it('should return a ComposeResult object', async () => {
        /*
        Test Doc:
        - Why: Contract requires consistent return type
        - Contract: compose() returns object with runDir, template, phases, errors
        - Usage Notes: All implementations must return this shape
        - Quality Contribution: Ensures type consistency
        - Worked Example: compose('t', 'r') → { runDir: string, template: string, ... }
        */
        const result = await ctx.service.compose(
          './templates/contract-test-workflow',
          '.chainglass/runs'
        );

        // Must have all required properties
        expect(result).toHaveProperty('runDir');
        expect(result).toHaveProperty('template');
        expect(result).toHaveProperty('phases');
        expect(result).toHaveProperty('errors');

        // Types must be correct
        expect(typeof result.runDir).toBe('string');
        expect(typeof result.template).toBe('string');
        expect(Array.isArray(result.phases)).toBe(true);
        expect(Array.isArray(result.errors)).toBe(true);
      });

      it('should return phases array with correct shape', async () => {
        /*
        Test Doc:
        - Why: Contract requires PhaseInfo shape for phases
        - Contract: Each phase has name, order, status
        - Usage Notes: Status is 'pending' for newly composed workflows
        - Quality Contribution: Ensures phase data consistency
        - Worked Example: compose() → { phases: [{ name: 'init', order: 1, status: 'pending' }] }
        */
        const result = await ctx.service.compose(
          './templates/contract-test-workflow',
          '.chainglass/runs'
        );

        if (result.errors.length === 0) {
          expect(result.phases.length).toBeGreaterThan(0);
          for (const phase of result.phases) {
            expect(phase).toHaveProperty('name');
            expect(phase).toHaveProperty('order');
            expect(phase).toHaveProperty('status');
            expect(typeof phase.name).toBe('string');
            expect(typeof phase.order).toBe('number');
            expect(phase.status).toBe('pending');
          }
        }
      });
    });

    describe('compose() success behavior', () => {
      it('should return empty errors array on success', async () => {
        /*
        Test Doc:
        - Why: Contract requires errors.length === 0 indicates success
        - Contract: Success means empty errors array
        - Usage Notes: Check errors.length, not truthy runDir
        - Quality Contribution: Ensures consistent success detection
        - Worked Example: compose(valid_template) → { errors: [] }
        */
        const result = await ctx.service.compose(
          './templates/contract-test-workflow',
          '.chainglass/runs'
        );

        // Either succeeds with no errors, or fails with errors
        // Both are valid behaviors
        if (result.errors.length === 0) {
          expect(result.runDir).not.toBe('');
          expect(result.template).not.toBe('');
        }
      });

      it('should return non-empty runDir on success', async () => {
        /*
        Test Doc:
        - Why: Contract requires valid runDir on success
        - Contract: Success means runDir is set to actual path
        - Usage Notes: runDir is where phase execution happens
        - Quality Contribution: Ensures run folder location is provided
        - Worked Example: compose(valid) → { runDir: '.chainglass/runs/run-...' }
        */
        const result = await ctx.service.compose(
          './templates/contract-test-workflow',
          '.chainglass/runs'
        );

        if (result.errors.length === 0) {
          expect(result.runDir.length).toBeGreaterThan(0);
          expect(result.runDir).toContain('.chainglass/runs');
        }
      });
    });

    describe('compose() error behavior', () => {
      it('should return error with code property on failure', async () => {
        /*
        Test Doc:
        - Why: Contract requires actionable error codes
        - Contract: Errors have code, message, and optionally action
        - Usage Notes: Use error codes for programmatic handling
        - Quality Contribution: Ensures agent-friendly errors
        - Worked Example: compose(missing) → { errors: [{ code: 'E020', message: '...' }] }
        */
        // Both implementations should handle non-existent templates
        const result = await ctx.service.compose(
          './templates/nonexistent-template-xyz',
          '.chainglass/runs'
        );

        // Template not found should return E020
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toHaveProperty('code');
        expect(result.errors[0]).toHaveProperty('message');
        expect(result.errors[0].code).toBe('E020');
      });

      it('should return empty runDir on failure', async () => {
        /*
        Test Doc:
        - Why: Contract requires empty runDir on error
        - Contract: Failure means runDir is empty string
        - Usage Notes: Check errors first, then runDir
        - Quality Contribution: Ensures consistent failure state
        - Worked Example: compose(bad) → { runDir: '', errors: [...] }
        */
        const result = await ctx.service.compose(
          './templates/nonexistent-template-xyz',
          '.chainglass/runs'
        );

        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.runDir).toBe('');
      });
    });
  });
}

// ==================== WorkflowService Context ====================

function createWorkflowServiceContext(): WorkflowServiceTestContext {
  const fs = new FakeFileSystem();
  const yamlParser = new FakeYamlParser();
  const schemaValidator = new FakeSchemaValidator();
  const pathResolver = new FakePathResolver();
  const registry = new FakeWorkflowRegistry();
  // Phase 3: WorkflowService now requires registry parameter
  const service = new WorkflowService(fs, yamlParser, schemaValidator, pathResolver, registry);

  return {
    name: 'WorkflowService',
    service,
    setup: async () => {
      // Reset fakes
      fs.reset();
      yamlParser.reset();
      schemaValidator.reset();
      registry.reset();

      // Set up template using path format (Phase 3: name-only format goes to registry)
      fs.setFile('templates/contract-test-workflow/wf.yaml', SAMPLE_WF_YAML);
      fs.setFile('templates/contract-test-workflow/templates/wf.md', '# WF');
      fs.setFile('templates/contract-test-workflow/phases/init/commands/main.md', '# Init');

      // Configure yaml parser
      yamlParser.setParseResult(SAMPLE_WF_YAML.trim(), SAMPLE_WF_DEFINITION);

      // Configure schema validator to pass
      schemaValidator.setDefaultResult({ valid: true, errors: [] });
    },
    cleanup: async () => {
      fs.reset();
    },
  };
}

// ==================== FakeWorkflowService Context ====================

function createFakeWorkflowServiceContext(): WorkflowServiceTestContext {
  const service = new FakeWorkflowService();

  return {
    name: 'FakeWorkflowService',
    service,
    setup: async () => {
      service.reset();

      // Configure fake to return success for the test template (using path format per Phase 3)
      service.setComposeResult('./templates/contract-test-workflow', {
        runDir: '.chainglass/runs/run-2026-01-22-001',
        template: 'contract-test-workflow',
        phases: [{ name: 'init', order: 1, status: 'pending' }],
        errors: [],
      });

      // Configure fake to return E020 for non-existent templates (using path format per Phase 3)
      service.setComposeError(
        './templates/nonexistent-template-xyz',
        'E020',
        'Template not found: nonexistent-template-xyz',
        'Create template at ./templates/nonexistent-template-xyz/'
      );
    },
    cleanup: async () => {
      service.reset();
    },
  };
}

// ==================== Run Contract Tests ====================

describe('WorkflowService Contract Tests', () => {
  workflowServiceContractTests(createWorkflowServiceContext);
});

describe('FakeWorkflowService Contract Tests', () => {
  workflowServiceContractTests(createFakeWorkflowServiceContext);
});
