/**
 * Tests for compose() with checkpoint resolution.
 *
 * Per Phase 3: Compose Extension for Versioned Runs.
 * Tests cover checkpoint resolution, versioned paths, wf-status extension, and E034 error.
 */

import {
  type CheckpointInfo,
  FakeFileSystem,
  FakeHashGenerator,
  FakePathResolver,
} from '@chainglass/shared';
import {
  FakeSchemaValidator,
  FakeWorkflowRegistry,
  FakeYamlParser,
  WorkflowService,
} from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

describe('WorkflowService compose() with checkpoints', () => {
  let service: WorkflowService;
  let fs: FakeFileSystem;
  let pathResolver: FakePathResolver;
  let yamlParser: FakeYamlParser;
  let schemaValidator: FakeSchemaValidator;
  let registry: FakeWorkflowRegistry;

  const WORKFLOWS_DIR = '.chainglass/workflows';
  const RUNS_DIR = '.chainglass/runs';

  beforeEach(() => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
    yamlParser = new FakeYamlParser();
    schemaValidator = new FakeSchemaValidator();
    registry = new FakeWorkflowRegistry();

    // Create service with registry (DYK-01: required 5th constructor param)
    service = new WorkflowService(fs, yamlParser, schemaValidator, pathResolver, registry);
  });

  // ==================== T001: Checkpoint Resolution Tests ====================

  describe('checkpoint resolution (T001)', () => {
    it('T001-1: should resolve latest checkpoint when no version specified', async () => {
      /*
      Test Doc:
      - Why: Default behavior should use the latest checkpoint for compose
      - Contract: compose() without checkpoint option uses highest ordinal checkpoint
      - Usage Notes: Workflow must have at least one checkpoint
      - Quality Contribution: Ensures sensible default behavior
      - Worked Example: workflow with v001, v002 checkpoints → uses v002
      */
      // Setup workflow with two checkpoints
      const versions: CheckpointInfo[] = [
        {
          ordinal: 2,
          hash: 'def45678',
          version: 'v002-def45678',
          createdAt: '2026-01-24T11:00:00Z',
        },
        {
          ordinal: 1,
          hash: 'abc12345',
          version: 'v001-abc12345',
          createdAt: '2026-01-24T10:00:00Z',
        },
      ];
      registry.setVersions('hello-wf', versions);
      setupWorkflowWithCheckpoint(fs, yamlParser, schemaValidator, 'hello-wf', 'v002-def45678');

      const result = await service.compose('hello-wf', RUNS_DIR);

      expect(result.errors).toHaveLength(0);
      expect(result.runDir).toContain('hello-wf/v002-def45678');
    });

    it('T001-2: should resolve checkpoint by ordinal (v001)', async () => {
      /*
      Test Doc:
      - Why: Users should be able to specify just the ordinal (short form)
      - Contract: compose() with ordinal matches checkpoint starting with that ordinal
      - Usage Notes: Ordinal is 3-digit zero-padded (v001, v002, etc.)
      - Quality Contribution: Enables convenient version selection
      - Worked Example: --checkpoint v001 with v001-abc12345, v002-def45678 → uses v001-abc12345
      */
      const versions: CheckpointInfo[] = [
        {
          ordinal: 2,
          hash: 'def45678',
          version: 'v002-def45678',
          createdAt: '2026-01-24T11:00:00Z',
        },
        {
          ordinal: 1,
          hash: 'abc12345',
          version: 'v001-abc12345',
          createdAt: '2026-01-24T10:00:00Z',
        },
      ];
      registry.setVersions('hello-wf', versions);
      setupWorkflowWithCheckpoint(fs, yamlParser, schemaValidator, 'hello-wf', 'v001-abc12345');

      const result = await service.compose('hello-wf', RUNS_DIR, { checkpoint: 'v001' });

      expect(result.errors).toHaveLength(0);
      expect(result.runDir).toContain('hello-wf/v001-abc12345');
    });

    it('T001-3: should resolve checkpoint by full version (v001-abc12345)', async () => {
      /*
      Test Doc:
      - Why: Users should be able to specify the exact version for precision
      - Contract: compose() with full version matches exactly
      - Usage Notes: Full version format is v<NNN>-<8-char-hash>
      - Quality Contribution: Enables precise version selection
      - Worked Example: --checkpoint v001-abc12345 → uses v001-abc12345 exactly
      */
      const versions: CheckpointInfo[] = [
        {
          ordinal: 2,
          hash: 'def45678',
          version: 'v002-def45678',
          createdAt: '2026-01-24T11:00:00Z',
        },
        {
          ordinal: 1,
          hash: 'abc12345',
          version: 'v001-abc12345',
          createdAt: '2026-01-24T10:00:00Z',
        },
      ];
      registry.setVersions('hello-wf', versions);
      setupWorkflowWithCheckpoint(fs, yamlParser, schemaValidator, 'hello-wf', 'v001-abc12345');

      const result = await service.compose('hello-wf', RUNS_DIR, { checkpoint: 'v001-abc12345' });

      expect(result.errors).toHaveLength(0);
      expect(result.runDir).toContain('hello-wf/v001-abc12345');
    });

    it('T001-4: should return E033 when version not found', async () => {
      /*
      Test Doc:
      - Why: User should get clear error when specifying non-existent version
      - Contract: compose() returns E033 VERSION_NOT_FOUND with available versions list
      - Usage Notes: Error action guides user to list available versions
      - Quality Contribution: Actionable error messages
      - Worked Example: --checkpoint v999 when only v001, v002 exist → E033
      */
      const versions: CheckpointInfo[] = [
        {
          ordinal: 2,
          hash: 'def45678',
          version: 'v002-def45678',
          createdAt: '2026-01-24T11:00:00Z',
        },
        {
          ordinal: 1,
          hash: 'abc12345',
          version: 'v001-abc12345',
          createdAt: '2026-01-24T10:00:00Z',
        },
      ];
      registry.setVersions('hello-wf', versions);

      const result = await service.compose('hello-wf', RUNS_DIR, { checkpoint: 'v999' });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E033');
      expect(result.errors[0].message).toContain('v999');
      expect(result.errors[0].action).toContain('versions');
    });

    it('T001-5: should return E033 when ordinal prefix matches multiple checkpoints (DYK-02)', async () => {
      /*
      Test Doc:
      - Why: Defense-in-depth for hypothetical ambiguous matches
      - Contract: If ordinal matches multiple checkpoints, return E033 listing all matches
      - Usage Notes: Current format makes this structurally impossible, but guard exists
      - Quality Contribution: Future-proofing for format changes
      - Worked Example: v001 matches both v001-aaa... and v001-bbb... → E033 with list
      */
      // This is a hypothetical scenario - the current format prevents it
      // But the guard should exist for defense-in-depth
      const versions: CheckpointInfo[] = [
        {
          ordinal: 1,
          hash: 'bbbbbbb1',
          version: 'v001-bbbbbbb1',
          createdAt: '2026-01-24T11:00:00Z',
        },
        {
          ordinal: 1,
          hash: 'aaaaaaa1',
          version: 'v001-aaaaaaa1',
          createdAt: '2026-01-24T10:00:00Z',
        },
      ];
      registry.setVersions('hello-wf', versions);

      const result = await service.compose('hello-wf', RUNS_DIR, { checkpoint: 'v001' });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E033');
      expect(result.errors[0].message).toContain('ambiguous');
    });
  });

  // ==================== T002: Versioned Run Path Tests ====================

  describe('versioned run path creation (T002)', () => {
    it('T002-1: should create run at versioned path format', async () => {
      /*
      Test Doc:
      - Why: Runs must be traceable to template versions
      - Contract: Run path follows <runsDir>/<slug>/<version>/run-YYYY-MM-DD-NNN
      - Usage Notes: Replaces flat run structure from before Phase 3
      - Quality Contribution: Enables run-to-version traceability
      - Worked Example: hello-wf v001-abc12345 → runs/hello-wf/v001-abc12345/run-2026-01-24-001
      */
      const versions: CheckpointInfo[] = [
        {
          ordinal: 1,
          hash: 'abc12345',
          version: 'v001-abc12345',
          createdAt: '2026-01-24T10:00:00Z',
        },
      ];
      registry.setVersions('hello-wf', versions);
      setupWorkflowWithCheckpoint(fs, yamlParser, schemaValidator, 'hello-wf', 'v001-abc12345');

      const result = await service.compose('hello-wf', RUNS_DIR);

      expect(result.errors).toHaveLength(0);
      expect(result.runDir).toMatch(
        /\.chainglass\/runs\/hello-wf\/v001-abc12345\/run-\d{4}-\d{2}-\d{2}-\d{3}$/
      );
    });

    it('T002-2: should generate ordinal within version folder (DYK-03)', async () => {
      /*
      Test Doc:
      - Why: Ordinals scoped to version folder, not global runs dir
      - Contract: Run ordinal increments within version folder only
      - Usage Notes: Same ordinal can exist in different versions
      - Quality Contribution: Natural hierarchy, per DYK Session Insight #3
      - Worked Example: Existing run-2026-01-24-001 in v001 → new run is run-2026-01-24-002
      */
      const versions: CheckpointInfo[] = [
        {
          ordinal: 1,
          hash: 'abc12345',
          version: 'v001-abc12345',
          createdAt: '2026-01-24T10:00:00Z',
        },
      ];
      registry.setVersions('hello-wf', versions);
      setupWorkflowWithCheckpoint(fs, yamlParser, schemaValidator, 'hello-wf', 'v001-abc12345');

      // Create existing run in the version folder
      const today = new Date().toISOString().split('T')[0];
      const versionRunDir = `${RUNS_DIR}/hello-wf/v001-abc12345`;
      fs.setDir(versionRunDir);
      fs.setDir(`${versionRunDir}/run-${today}-001`);

      const result = await service.compose('hello-wf', RUNS_DIR);

      expect(result.errors).toHaveLength(0);
      expect(result.runDir).toContain(`run-${today}-002`);
    });
  });

  // ==================== T003: wf-status.json Extension Tests ====================

  describe('wf-status.json extension (T003)', () => {
    it('T003-1: should include slug in wf-status.json', async () => {
      /*
      Test Doc:
      - Why: Run should be traceable back to workflow by slug
      - Contract: wf-status.json.workflow.slug contains workflow slug
      - Usage Notes: Field is optional per DYK-04 for backward compat
      - Quality Contribution: Enables workflow identification from run
      - Worked Example: hello-wf compose → wf-status.workflow.slug = "hello-wf"
      */
      const versions: CheckpointInfo[] = [
        {
          ordinal: 1,
          hash: 'abc12345',
          version: 'v001-abc12345',
          createdAt: '2026-01-24T10:00:00Z',
        },
      ];
      registry.setVersions('hello-wf', versions);
      setupWorkflowWithCheckpoint(fs, yamlParser, schemaValidator, 'hello-wf', 'v001-abc12345');

      const result = await service.compose('hello-wf', RUNS_DIR);

      expect(result.errors).toHaveLength(0);

      const wfStatusPath = `${result.runDir}/wf-run/wf-status.json`;
      const wfStatusContent = fs.getFile(wfStatusPath);
      expect(wfStatusContent).toBeDefined();

      const wfStatus = JSON.parse(wfStatusContent as string);
      expect(wfStatus.workflow.slug).toBe('hello-wf');
    });

    it('T003-2: should include version_hash in wf-status.json', async () => {
      /*
      Test Doc:
      - Why: Run should be traceable to specific checkpoint version
      - Contract: wf-status.json.workflow.version_hash contains 8-char hash
      - Usage Notes: Hash is content-addressable, enables checkpoint lookup
      - Quality Contribution: Enables precise version traceability
      - Worked Example: v001-abc12345 compose → wf-status.workflow.version_hash = "abc12345"
      */
      const versions: CheckpointInfo[] = [
        {
          ordinal: 1,
          hash: 'abc12345',
          version: 'v001-abc12345',
          createdAt: '2026-01-24T10:00:00Z',
        },
      ];
      registry.setVersions('hello-wf', versions);
      setupWorkflowWithCheckpoint(fs, yamlParser, schemaValidator, 'hello-wf', 'v001-abc12345');

      const result = await service.compose('hello-wf', RUNS_DIR);

      expect(result.errors).toHaveLength(0);

      const wfStatusPath = `${result.runDir}/wf-run/wf-status.json`;
      const wfStatusContent = fs.getFile(wfStatusPath);
      expect(wfStatusContent).toBeDefined();
      const wfStatus = JSON.parse(wfStatusContent as string);
      expect(wfStatus.workflow.version_hash).toBe('abc12345');
    });

    it('T003-3: should include checkpoint_comment in wf-status.json when present', async () => {
      /*
      Test Doc:
      - Why: Preserve checkpoint comment for context in run
      - Contract: wf-status.json.workflow.checkpoint_comment contains comment if present
      - Usage Notes: Optional field, only present if checkpoint had comment
      - Quality Contribution: Context preservation
      - Worked Example: Checkpoint with "Initial release" → wf-status.workflow.checkpoint_comment = "Initial release"
      */
      const versions: CheckpointInfo[] = [
        {
          ordinal: 1,
          hash: 'abc12345',
          version: 'v001-abc12345',
          createdAt: '2026-01-24T10:00:00Z',
          comment: 'Initial release',
        },
      ];
      registry.setVersions('hello-wf', versions);
      setupWorkflowWithCheckpoint(fs, yamlParser, schemaValidator, 'hello-wf', 'v001-abc12345');

      const result = await service.compose('hello-wf', RUNS_DIR);

      expect(result.errors).toHaveLength(0);

      const wfStatusPath = `${result.runDir}/wf-run/wf-status.json`;
      const wfStatusContent = fs.getFile(wfStatusPath);
      expect(wfStatusContent).toBeDefined();
      const wfStatus = JSON.parse(wfStatusContent as string);
      expect(wfStatus.workflow.checkpoint_comment).toBe('Initial release');
    });

    it('T003-4: should not include checkpoint_comment when absent', async () => {
      /*
      Test Doc:
      - Why: Don't pollute wf-status with undefined fields
      - Contract: checkpoint_comment field absent when checkpoint has no comment
      - Usage Notes: Keeps wf-status clean
      - Quality Contribution: Clean JSON output
      - Worked Example: Checkpoint without comment → no checkpoint_comment field
      */
      const versions: CheckpointInfo[] = [
        {
          ordinal: 1,
          hash: 'abc12345',
          version: 'v001-abc12345',
          createdAt: '2026-01-24T10:00:00Z',
        },
      ];
      registry.setVersions('hello-wf', versions);
      setupWorkflowWithCheckpoint(fs, yamlParser, schemaValidator, 'hello-wf', 'v001-abc12345');

      const result = await service.compose('hello-wf', RUNS_DIR);

      expect(result.errors).toHaveLength(0);

      const wfStatusPath = `${result.runDir}/wf-run/wf-status.json`;
      const wfStatusContent = fs.getFile(wfStatusPath);
      expect(wfStatusContent).toBeDefined();
      const wfStatus = JSON.parse(wfStatusContent as string);
      expect(wfStatus.workflow.checkpoint_comment).toBeUndefined();
    });
  });

  // ==================== T004: E034 Error Tests ====================

  describe('E034 when no checkpoints exist (T004)', () => {
    it('T004-1: should return E034 when workflow has no checkpoints', async () => {
      /*
      Test Doc:
      - Why: Compose requires checkpoint - can't compose from current/
      - Contract: compose() returns E034 NO_CHECKPOINT when no checkpoints exist
      - Usage Notes: This is the key change in Phase 3 - checkpoints required
      - Quality Contribution: Enforces checkpoint-based workflow
      - Worked Example: workflow with only current/ → E034 error
      */
      registry.setVersions('hello-wf', []);
      setupWorkflowCurrentOnly(fs, yamlParser, schemaValidator, 'hello-wf');

      const result = await service.compose('hello-wf', RUNS_DIR);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E034');
      expect(result.errors[0].message).toContain('no checkpoints');
    });

    it('T004-2: should include actionable guidance in E034 message', async () => {
      /*
      Test Doc:
      - Why: Users need to know how to fix the error
      - Contract: E034 action contains checkpoint creation command
      - Usage Notes: Action message guides user to create checkpoint first
      - Quality Contribution: Actionable error messages
      - Worked Example: E034 action contains "cg workflow checkpoint hello-wf"
      */
      registry.setVersions('hello-wf', []);
      setupWorkflowCurrentOnly(fs, yamlParser, schemaValidator, 'hello-wf');

      const result = await service.compose('hello-wf', RUNS_DIR);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E034');
      expect(result.errors[0].action).toContain('cg workflow checkpoint');
      expect(result.errors[0].action).toContain('hello-wf');
    });
  });
});

// ==================== Test Helpers ====================

/**
 * Set up a workflow with a checkpoint in the fake file system.
 */
function setupWorkflowWithCheckpoint(
  fs: FakeFileSystem,
  yamlParser: FakeYamlParser,
  schemaValidator: FakeSchemaValidator,
  slug: string,
  version: string
): void {
  const workflowsDir = '.chainglass/workflows';
  const workflowDir = `${workflowsDir}/${slug}`;
  const checkpointDir = `${workflowDir}/checkpoints/${version}`;

  // Create directory structure
  fs.setDir(workflowDir);
  fs.setDir(`${workflowDir}/current`);
  fs.setDir(`${workflowDir}/checkpoints`);
  fs.setDir(checkpointDir);
  fs.setDir(`${checkpointDir}/phases/gather/commands`);

  // workflow.json
  const workflowJson = JSON.stringify({
    slug,
    name: `${slug} Workflow`,
    description: 'Test workflow',
    created_at: '2026-01-24T10:00:00Z',
  });
  fs.setFile(`${workflowDir}/workflow.json`, workflowJson);

  // wf.yaml in checkpoint
  const wfYaml = `name: ${slug}
version: 1.0.0
phases:
  gather:
    order: 1
    description: Gather phase
    outputs: []
`;
  fs.setFile(`${checkpointDir}/wf.yaml`, wfYaml);
  fs.setFile(`${checkpointDir}/phases/gather/commands/main.md`, '# Gather Phase');

  // Configure yamlParser to parse wf.yaml correctly
  yamlParser.setParseResult(wfYaml, {
    name: slug,
    version: '1.0.0',
    phases: {
      gather: {
        order: 1,
        description: 'Gather phase',
        outputs: [],
      },
    },
  });

  // Configure schemaValidator to accept all data
  schemaValidator.setDefaultResult({ valid: true, errors: [] });
}

/**
 * Set up a workflow with only current/ (no checkpoints).
 */
function setupWorkflowCurrentOnly(
  fs: FakeFileSystem,
  yamlParser: FakeYamlParser,
  schemaValidator: FakeSchemaValidator,
  slug: string
): void {
  const workflowsDir = '.chainglass/workflows';
  const workflowDir = `${workflowsDir}/${slug}`;
  const currentDir = `${workflowDir}/current`;

  // Create directory structure
  fs.setDir(workflowDir);
  fs.setDir(currentDir);
  fs.setDir(`${workflowDir}/checkpoints`);
  fs.setDir(`${currentDir}/phases/gather/commands`);

  // workflow.json
  const workflowJson = JSON.stringify({
    slug,
    name: `${slug} Workflow`,
    description: 'Test workflow',
    created_at: '2026-01-24T10:00:00Z',
  });
  fs.setFile(`${workflowDir}/workflow.json`, workflowJson);

  // wf.yaml in current
  const wfYaml = `name: ${slug}
version: 1.0.0
phases:
  gather:
    order: 1
    description: Gather phase
    outputs: []
`;
  fs.setFile(`${currentDir}/wf.yaml`, wfYaml);
  fs.setFile(`${currentDir}/phases/gather/commands/main.md`, '# Gather Phase');

  // Configure yamlParser
  yamlParser.setParseResult(wfYaml, {
    name: slug,
    version: '1.0.0',
    phases: {
      gather: {
        order: 1,
        description: 'Gather phase',
        outputs: [],
      },
    },
  });

  // Configure schemaValidator
  schemaValidator.setDefaultResult({ valid: true, errors: [] });
}
