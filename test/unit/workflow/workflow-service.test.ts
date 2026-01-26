import { type ComposeResult, FakeFileSystem, FakePathResolver } from '@chainglass/shared';
import {
  FakeSchemaValidator,
  FakeWorkflowRegistry,
  FakeYamlParser,
  type IWorkflowService,
  type WfDefinition,
  WorkflowService,
} from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * Tests for WorkflowService.compose() method.
 *
 * Per Phase 2: Compose Command - TDD approach, tests first.
 * These tests define the expected behavior of WorkflowService.compose().
 *
 * Test fixture: Uses FakeFileSystem, FakeYamlParser, FakeSchemaValidator
 * to simulate template and run directories without disk I/O.
 */

// Sample wf.yaml content for testing
const SAMPLE_WF_YAML = `
name: hello-workflow
version: "1.0.0"
description: "A test workflow"
phases:
  gather:
    description: "Collect data"
    order: 1
    outputs:
      - name: data.json
        type: file
        required: true
  process:
    description: "Process data"
    order: 2
    inputs:
      files:
        - name: data.json
          required: true
          from_phase: gather
    outputs:
      - name: result.json
        type: file
        required: true
`;

const SAMPLE_WF_DEFINITION: WfDefinition = {
  name: 'hello-workflow',
  version: '1.0.0',
  description: 'A test workflow',
  phases: {
    gather: {
      description: 'Collect data',
      order: 1,
      outputs: [{ name: 'data.json', type: 'file', required: true }],
    },
    process: {
      description: 'Process data',
      order: 2,
      inputs: {
        files: [{ name: 'data.json', required: true, from_phase: 'gather' }],
      },
      outputs: [{ name: 'result.json', type: 'file', required: true }],
    },
  },
};

describe('WorkflowService', () => {
  let fs: FakeFileSystem;
  let yamlParser: FakeYamlParser;
  let schemaValidator: FakeSchemaValidator;
  let pathResolver: FakePathResolver;
  let registry: FakeWorkflowRegistry;
  let service: IWorkflowService;

  // Helper to set up a template in the fake filesystem
  function setupTemplate(templatePath: string, wfYaml: string = SAMPLE_WF_YAML): void {
    fs.setFile(`${templatePath}/wf.yaml`, wfYaml);
    // Set up schemas directory with core schemas
    fs.setFile(`${templatePath}/schemas/gather-data.schema.json`, '{}');
    // Set up wf.md at template root (agent execution instructions)
    fs.setFile(`${templatePath}/wf.md`, '# Workflow Instructions');
    // Set up phase commands
    fs.setFile(`${templatePath}/phases/gather/commands/main.md`, '# Gather Phase');
    fs.setFile(`${templatePath}/phases/process/commands/main.md`, '# Process Phase');
  }

  beforeEach(() => {
    fs = new FakeFileSystem();
    yamlParser = new FakeYamlParser();
    schemaValidator = new FakeSchemaValidator();
    pathResolver = new FakePathResolver();
    registry = new FakeWorkflowRegistry();

    // Configure FakeYamlParser to return the sample definition
    yamlParser.setParseResult(SAMPLE_WF_YAML.trim(), SAMPLE_WF_DEFINITION);

    // Configure FakeSchemaValidator to return valid by default
    schemaValidator.setDefaultResult({ valid: true, errors: [] });

    // Create WorkflowService with dependencies (Phase 3: includes registry)
    service = new WorkflowService(fs, yamlParser, schemaValidator, pathResolver, registry);
  });

  describe('compose()', () => {
    it('should create run folder from template', async () => {
      /*
      Test Doc:
      - Why: Core operation - compose() creates a new workflow run from a template
      - Contract: Returns ComposeResult with runDir, template name, phases array
      - Usage Notes: Template must have valid wf.yaml
      - Quality Contribution: Ensures workflow initialization works correctly
      - Worked Example: compose('./templates/hello-workflow', '.chainglass/runs') → run-2026-01-22-001/
      */
      setupTemplate('templates/hello-workflow');

      // Use path-based template (Phase 3: name-based goes to registry)
      const result = await service.compose('./templates/hello-workflow', '.chainglass/runs');

      expect(result.errors).toHaveLength(0);
      expect(result.template).toBe('hello-workflow');
      expect(result.runDir).toMatch(/^\.chainglass\/runs\/run-\d{4}-\d{2}-\d{2}-\d{3}$/);
      expect(result.phases).toHaveLength(2);
      expect(result.phases[0].name).toBe('gather');
      expect(result.phases[0].order).toBe(1);
      expect(result.phases[0].status).toBe('pending');
      expect(result.phases[1].name).toBe('process');
      expect(result.phases[1].order).toBe(2);
    });

    it('should return E020 for non-existent template', async () => {
      /*
      Test Doc:
      - Why: Error handling - agents need actionable errors when template is missing
      - Contract: Returns ComposeResult with E020 error code
      - Usage Notes: Check error.action for fix guidance
      - Quality Contribution: Enables autonomous agent error recovery
      - Worked Example: compose('./nonexistent') → { errors: [{ code: 'E020' }] }
      */
      // No template set up

      // Use path-based template (Phase 3: name-based goes to registry)
      const result = await service.compose('./nonexistent', '.chainglass/runs');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E020');
      expect(result.errors[0].message).toContain('Template not found');
      expect(result.errors[0].action).toBeDefined();
    });

    it('should return E021 for invalid wf.yaml syntax', async () => {
      /*
      Test Doc:
      - Why: Error handling - YAML parse errors need line/column info
      - Contract: Returns ComposeResult with E021 error code
      - Usage Notes: Check error.path for file location, error details for line/column
      - Quality Contribution: Enables precise error reporting for agents
      - Worked Example: compose with bad YAML → { errors: [{ code: 'E021' }] }
      */
      fs.setFile('templates/bad-yaml/wf.yaml', 'invalid: [unclosed');
      // Configure FakeYamlParser to throw for this content
      const { YamlParseError } = await import('@chainglass/workflow');
      yamlParser.setParseError(
        'invalid: [unclosed',
        new YamlParseError('Unexpected end of flow sequence', 1, 19, 'wf.yaml')
      );

      // Use path-based template (Phase 3: name-based goes to registry)
      const result = await service.compose('./templates/bad-yaml', '.chainglass/runs');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E021');
      expect(result.errors[0].message).toContain('YAML');
    });

    it('should return E022 for wf.yaml schema validation failure', async () => {
      /*
      Test Doc:
      - Why: Error handling - schema errors need expected/actual for agents
      - Contract: Returns ComposeResult with E022 error code
      - Usage Notes: Check error.expected and error.actual for details
      - Quality Contribution: Enables autonomous schema error fixes
      - Worked Example: compose with invalid schema → { errors: [{ code: 'E022' }] }
      */
      setupTemplate('templates/invalid-schema');
      // Configure FakeSchemaValidator to return error
      schemaValidator.setDefaultResult({
        valid: false,
        errors: [
          {
            code: 'E012',
            path: '/phases/gather/order',
            message: 'Must be integer, got string',
            expected: 'integer',
            actual: 'string',
          },
        ],
      });

      // Use path-based template (Phase 3: name-based goes to registry)
      const result = await service.compose('./templates/invalid-schema', '.chainglass/runs');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E022');
    });

    it('should copy core schemas to each phase', async () => {
      /*
      Test Doc:
      - Why: Each phase needs core schemas for validation
      - Contract: Core schemas (wf.schema.json, wf-phase.schema.json, message.schema.json) copied to each phase/schemas/
      - Usage Notes: Schemas are embedded as TS modules per DYK-01
      - Quality Contribution: Ensures self-contained run folder
      - Worked Example: compose → each phase has schemas/wf.schema.json
      */
      setupTemplate('templates/hello-workflow');

      const result = await service.compose('./templates/hello-workflow', '.chainglass/runs');

      expect(result.errors).toHaveLength(0);
      // Check core schemas in gather phase
      const gatherSchemaPath = `${result.runDir}/phases/gather/schemas/wf.schema.json`;
      const gatherPhaseSchemaPath = `${result.runDir}/phases/gather/schemas/wf-phase.schema.json`;
      const gatherMessageSchemaPath = `${result.runDir}/phases/gather/schemas/message.schema.json`;
      expect(await fs.exists(gatherSchemaPath)).toBe(true);
      expect(await fs.exists(gatherPhaseSchemaPath)).toBe(true);
      expect(await fs.exists(gatherMessageSchemaPath)).toBe(true);
      // Check core schemas in process phase
      const processSchemaPath = `${result.runDir}/phases/process/schemas/wf.schema.json`;
      expect(await fs.exists(processSchemaPath)).toBe(true);
    });

    it('should copy template schemas to phases', async () => {
      /*
      Test Doc:
      - Why: Template-specific schemas must be available in run folder
      - Contract: Template schemas from schemas/ directory copied to each phase
      - Usage Notes: Only schemas referenced in outputs are copied
      - Quality Contribution: Ensures run folder has all validation schemas
      - Worked Example: Template with gather-data.schema.json → phase has it
      */
      setupTemplate('templates/hello-workflow');
      fs.setFile('./templates/hello-workflow/schemas/gather-data.schema.json', '{"type":"object"}');

      const result = await service.compose('./templates/hello-workflow', '.chainglass/runs');

      expect(result.errors).toHaveLength(0);
      const templateSchemaPath = `${result.runDir}/phases/gather/schemas/gather-data.schema.json`;
      expect(await fs.exists(templateSchemaPath)).toBe(true);
    });

    it('should extract wf-phase.yaml per phase', async () => {
      /*
      Test Doc:
      - Why: Each phase needs its own config extracted from wf.yaml
      - Contract: Each phase folder has wf-phase.yaml with just that phase's definition
      - Usage Notes: wf-phase.yaml is a subset of wf.yaml for that phase
      - Quality Contribution: Enables phase-isolated validation
      - Worked Example: compose → phases/gather/wf-phase.yaml exists
      */
      setupTemplate('templates/hello-workflow');

      const result = await service.compose('./templates/hello-workflow', '.chainglass/runs');

      expect(result.errors).toHaveLength(0);
      const gatherPhasePath = `${result.runDir}/phases/gather/wf-phase.yaml`;
      const processPhasePath = `${result.runDir}/phases/process/wf-phase.yaml`;
      expect(await fs.exists(gatherPhasePath)).toBe(true);
      expect(await fs.exists(processPhasePath)).toBe(true);
    });

    it('should copy commands (main.md + wf.md)', async () => {
      /*
      Test Doc:
      - Why: Agent instructions must be in run folder
      - Contract: Each phase has commands/ with main.md and wf.md
      - Usage Notes: main.md from template phases/, wf.md from templates/
      - Quality Contribution: Ensures agent has instructions
      - Worked Example: compose → phases/gather/commands/main.md exists
      */
      setupTemplate('templates/hello-workflow');

      const result = await service.compose('./templates/hello-workflow', '.chainglass/runs');

      expect(result.errors).toHaveLength(0);
      const mainMdPath = `${result.runDir}/phases/gather/commands/main.md`;
      const wfMdPath = `${result.runDir}/phases/gather/commands/wf.md`;
      expect(await fs.exists(mainMdPath)).toBe(true);
      expect(await fs.exists(wfMdPath)).toBe(true);
    });

    it('should create wf-status.json with metadata', async () => {
      /*
      Test Doc:
      - Why: Run metadata needed for tracking workflow state
      - Contract: wf-run/wf-status.json created with phases and run info
      - Usage Notes: Contains workflow name, version, phases array
      - Quality Contribution: Enables workflow state tracking
      - Worked Example: compose → wf-run/wf-status.json with phases
      */
      setupTemplate('templates/hello-workflow');

      const result = await service.compose('./templates/hello-workflow', '.chainglass/runs');

      expect(result.errors).toHaveLength(0);
      const statusPath = `${result.runDir}/wf-run/wf-status.json`;
      expect(await fs.exists(statusPath)).toBe(true);
      const statusContent = await fs.readFile(statusPath);
      const status = JSON.parse(statusContent);
      expect(status.workflow.name).toBe('hello-workflow');
      expect(status.phases).toBeDefined();
    });

    it('should use date-ordinal naming for run folder', async () => {
      /*
      Test Doc:
      - Why: Run folders need unique, predictable naming
      - Contract: Format is run-YYYY-MM-DD-NNN where NNN is zero-padded ordinal
      - Usage Notes: Ordinal is date-scoped per DYK-03
      - Quality Contribution: Prevents naming collisions
      - Worked Example: Two composes same day → run-2026-01-22-001, run-2026-01-22-002
      */
      setupTemplate('templates/hello-workflow');

      const result1 = await service.compose('./templates/hello-workflow', '.chainglass/runs');
      const result2 = await service.compose('./templates/hello-workflow', '.chainglass/runs');

      expect(result1.errors).toHaveLength(0);
      expect(result2.errors).toHaveLength(0);
      expect(result1.runDir).toMatch(/run-\d{4}-\d{2}-\d{2}-001$/);
      expect(result2.runDir).toMatch(/run-\d{4}-\d{2}-\d{2}-002$/);
    });

    it('should resolve template name via search paths', async () => {
      /*
      Test Doc:
      - Why: Template names should be discoverable without full path
      - Contract: Search order: .chainglass/templates/, ~/.config/chainglass/templates/
      - Usage Notes: Name-only lookup when no path indicators
      - Quality Contribution: Enables simple template references
      - Worked Example: compose('hello-workflow') finds .chainglass/templates/hello-workflow/
      */
      setupTemplate('templates/hello-workflow');

      const result = await service.compose('./templates/hello-workflow', '.chainglass/runs');

      expect(result.errors).toHaveLength(0);
      expect(result.template).toBe('hello-workflow');
    });

    it('should resolve template path directly', async () => {
      /*
      Test Doc:
      - Why: Users should be able to specify exact template path
      - Contract: Path with /, ., or absolute is used directly
      - Usage Notes: Per DYK-02 KISS resolution
      - Quality Contribution: Enables custom template locations
      - Worked Example: compose('./custom/template') uses path directly
      */
      // Set up template at custom path (without leading ./)
      fs.setFile('custom/template/wf.yaml', SAMPLE_WF_YAML);
      fs.setFile('custom/template/schemas/gather-data.schema.json', '{}');
      fs.setFile('custom/template/templates/wf.md', '# Workflow Instructions');
      fs.setFile('custom/template/phases/gather/commands/main.md', '# Gather Phase');
      fs.setFile('custom/template/phases/process/commands/main.md', '# Process Phase');

      // When compose joins "./custom/template" + "wf.yaml", Node's path.join normalizes it
      // path.join('./custom/template', 'wf.yaml') => 'custom/template/wf.yaml'
      const result = await service.compose('./custom/template', '.chainglass/runs');

      expect(result.errors).toHaveLength(0);
      // Template name comes from wf.yaml, not the path
      expect(result.template).toBe('hello-workflow');
    });

    it('should expand tilde in template path', async () => {
      /*
      Test Doc:
      - Why: Users expect ~ to expand to home directory
      - Contract: Per DYK-02, tilde expanded using os.homedir()
      - Usage Notes: Must expand before path detection
      - Quality Contribution: Matches user expectations
      - Worked Example: compose('~/templates/my-workflow') expands ~
      */
      // This test validates the tilde expansion happens
      // Set up template at the actual expanded path (os.homedir())
      const os = await import('node:os');
      const expandedPath = `${os.homedir()}/templates/my-workflow`;
      setupTemplate(expandedPath);

      // Service should expand ~ to os.homedir()
      const result = await service.compose('~/templates/my-workflow', '.chainglass/runs');

      expect(result.errors).toHaveLength(0);
      // Template name comes from wf.yaml
      expect(result.template).toBe('hello-workflow');
    });

    it('should create run/inputs/files, run/inputs/data, run/outputs, run/wf-data directories', async () => {
      /*
      Test Doc:
      - Why: Phase run directories must exist for file operations
      - Contract: Each phase has run/inputs/files/, run/inputs/data/, run/outputs/, run/wf-data/
      - Usage Notes: These are created empty, populated during phase execution
      - Quality Contribution: Ensures required directory structure
      - Worked Example: compose → phases/gather/run/inputs/files/ exists
      */
      setupTemplate('templates/hello-workflow');

      const result = await service.compose('./templates/hello-workflow', '.chainglass/runs');

      expect(result.errors).toHaveLength(0);
      const gatherRunPath = `${result.runDir}/phases/gather/run`;
      expect(await fs.exists(`${gatherRunPath}/inputs/files`)).toBe(true);
      expect(await fs.exists(`${gatherRunPath}/inputs/data`)).toBe(true);
      expect(await fs.exists(`${gatherRunPath}/outputs`)).toBe(true);
      expect(await fs.exists(`${gatherRunPath}/wf-data`)).toBe(true);
    });

    it('should copy wf.yaml to run folder root', async () => {
      /*
      Test Doc:
      - Why: Run folder should be self-contained with workflow definition
      - Contract: wf.yaml copied from template to run folder root
      - Usage Notes: Original template unchanged per invariant
      - Quality Contribution: Enables run folder portability
      - Worked Example: compose → runDir/wf.yaml exists
      */
      setupTemplate('templates/hello-workflow');

      const result = await service.compose('./templates/hello-workflow', '.chainglass/runs');

      expect(result.errors).toHaveLength(0);
      const wfYamlPath = `${result.runDir}/wf.yaml`;
      expect(await fs.exists(wfYamlPath)).toBe(true);
    });

    it('should handle ordinal gaps correctly', async () => {
      /*
      Test Doc:
      - Why: Run folder ordinal should find max+1 even with gaps
      - Contract: Per DYK-03, finds highest existing ordinal and adds 1
      - Usage Notes: Handles gaps like 001, 003 (deleted 002) → next is 004
      - Quality Contribution: Prevents ordinal collisions
      - Worked Example: Existing 001, 003 → next is 004
      */
      setupTemplate('templates/hello-workflow');
      // Simulate existing run folders with gap
      const today = new Date().toISOString().split('T')[0];
      fs.setDir(`.chainglass/runs/run-${today}-001`);
      fs.setDir(`.chainglass/runs/run-${today}-003`); // Gap - 002 doesn't exist

      const result = await service.compose('./templates/hello-workflow', '.chainglass/runs');

      expect(result.errors).toHaveLength(0);
      expect(result.runDir).toMatch(/run-\d{4}-\d{2}-\d{2}-004$/);
    });

    it('should create messages directory for phases', async () => {
      /*
      Test Doc:
      - Why: Phases need messages directory for agent-orchestrator communication
      - Contract: Each phase has run/messages/ directory
      - Usage Notes: Messages are created during phase execution
      - Quality Contribution: Ensures message storage location exists
      - Worked Example: compose → phases/gather/run/messages/ exists
      */
      setupTemplate('templates/hello-workflow');

      const result = await service.compose('./templates/hello-workflow', '.chainglass/runs');

      expect(result.errors).toHaveLength(0);
      const messagesPath = `${result.runDir}/phases/gather/run/messages`;
      expect(await fs.exists(messagesPath)).toBe(true);
    });

    it('should sort phases by order in result', async () => {
      /*
      Test Doc:
      - Why: Phases should be returned in execution order
      - Contract: result.phases sorted by order property
      - Usage Notes: Even if defined in different order in YAML
      - Quality Contribution: Ensures predictable phase ordering
      - Worked Example: Phases with order 2, 1 → result has order 1, 2
      */
      setupTemplate('templates/hello-workflow');

      const result = await service.compose('./templates/hello-workflow', '.chainglass/runs');

      expect(result.errors).toHaveLength(0);
      expect(result.phases[0].order).toBe(1);
      expect(result.phases[1].order).toBe(2);
    });
  });
});
