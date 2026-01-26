/**
 * Tests for InitService.
 *
 * Per Phase 4 T003-T006: TDD RED phase - Write failing tests first.
 * Tests cover: getBundledAssetsPath, createDirectoryStructure, hydrateStarterTemplates, collision detection.
 */

import { FakeFileSystem, FakePathResolver, WORKFLOW_DI_TOKENS } from '@chainglass/shared';
import { FakeYamlParser, type IInitService } from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

// Import will work after T009 implementation
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - Implementation doesn't exist yet (TDD RED phase)
import { InitService } from '@chainglass/workflow';

describe('InitService', () => {
  let fs: FakeFileSystem;
  let pathResolver: FakePathResolver;
  let yamlParser: FakeYamlParser;
  let initService: IInitService;

  // Project root where init will be run
  const projectDir = '/home/test/my-project';

  // Simulated bundle directory (where cli.cjs lives)
  const bundleDir = '/usr/lib/node_modules/@chainglass/cli/dist';

  beforeEach(() => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
    yamlParser = new FakeYamlParser();

    // Set up simulated bundled assets structure
    // Per DYK-06: Category-based structure
    fs.setFile(
      `${bundleDir}/assets/templates/workflows/hello-workflow/wf.yaml`,
      `name: Hello Workflow
version: "1.0.0"
description: "A starter workflow template"
phases:
  gather:
    description: "Collect initial data"
    order: 1`
    );
    fs.setFile(
      `${bundleDir}/assets/templates/workflows/hello-workflow/phases/gather/commands/main.md`,
      '# Gather Phase\n\nInstructions for the agent...'
    );

    // Create service with bundle directory context
    // Per DYK-01: Uses __dirname equivalent for bundle location
    initService = new InitService(fs, pathResolver, yamlParser, bundleDir);
  });

  describe('getBundledAssetsPath (T003)', () => {
    it('should resolve to dist/assets/templates/{category}/ at runtime', async () => {
      /*
      Test Doc:
      - Why: Init needs to find bundled templates at runtime for npx distribution
      - Contract: getBundledAssetsPath('workflows') returns path to workflow templates
      - Usage Notes: Path is relative to CLI bundle directory (dist/)
      - Quality Contribution: Ensures templates are found in npm package
      - Worked Example: getBundledAssetsPath('workflows') → '/path/to/dist/assets/templates/workflows/'
      */
      // @ts-ignore - Testing internal method
      const path = initService.getBundledAssetsPath('workflows');

      expect(path).toBe(`${bundleDir}/assets/templates/workflows`);
    });

    it('should return path that contains expected template directories', async () => {
      /*
      Test Doc:
      - Why: Verify templates actually exist at the resolved path
      - Contract: Path contains hello-workflow subdirectory
      - Usage Notes: Each template is a subdirectory with wf.yaml
      - Quality Contribution: Catches missing template bundles
      - Worked Example: readDir(getBundledAssetsPath('workflows')) includes 'hello-workflow'
      */
      // @ts-ignore - Testing internal method
      const templatesPath = initService.getBundledAssetsPath('workflows');

      const contents = await fs.readDir(templatesPath);
      expect(contents).toContain('hello-workflow');
    });
  });

  describe('createDirectoryStructure (T004)', () => {
    it('should create .chainglass/workflows/ directory', async () => {
      /*
      Test Doc:
      - Why: Workflows need a location to be stored
      - Contract: init() creates .chainglass/workflows/ in project root
      - Usage Notes: Created with { recursive: true } to handle nested structure
      - Quality Contribution: Ensures project can store workflow templates
      - Worked Example: init('/project') → exists('/project/.chainglass/workflows/')
      */
      await initService.init(projectDir);

      expect(await fs.exists(`${projectDir}/.chainglass/workflows`)).toBe(true);
    });

    it('should create .chainglass/runs/ directory', async () => {
      /*
      Test Doc:
      - Why: Workflow runs need a location to be stored
      - Contract: init() creates .chainglass/runs/ in project root
      - Usage Notes: Runs are created later by compose command
      - Quality Contribution: Ensures project can execute workflows
      - Worked Example: init('/project') → exists('/project/.chainglass/runs/')
      */
      await initService.init(projectDir);

      expect(await fs.exists(`${projectDir}/.chainglass/runs`)).toBe(true);
    });

    it('should report created directories in result', async () => {
      /*
      Test Doc:
      - Why: User feedback shows what was created
      - Contract: InitResult.createdDirs contains relative paths of created directories
      - Usage Notes: Paths are relative to project root for display
      - Quality Contribution: Provides user feedback on init actions
      - Worked Example: init() returns { createdDirs: ['.chainglass/workflows', '.chainglass/runs'] }
      */
      const result = await initService.init(projectDir);

      expect(result.createdDirs).toContain('.chainglass/workflows');
      expect(result.createdDirs).toContain('.chainglass/runs');
    });

    it('should be idempotent when directories already exist', async () => {
      /*
      Test Doc:
      - Why: Re-running init should not fail or modify existing structure
      - Contract: init() succeeds without error when dirs exist
      - Usage Notes: Uses mkdir({ recursive: true }) which is idempotent
      - Quality Contribution: Safe to re-run init accidentally
      - Worked Example: init() twice → both succeed without error
      */
      // First init
      await initService.init(projectDir);

      // Second init should not throw
      const result = await initService.init(projectDir);

      expect(result.errors).toHaveLength(0);
    });
  });

  describe('hydrateStarterTemplates (T005)', () => {
    it('should copy template to workflows/<slug>/current/', async () => {
      /*
      Test Doc:
      - Why: Templates need to be in the standard workflow location
      - Contract: Template files are copied to .chainglass/workflows/<slug>/current/
      - Usage Notes: Uses IFileSystem.copyDirectory for recursive copy
      - Quality Contribution: Ensures template can be checkpointed and composed
      - Worked Example: hello-workflow template → .chainglass/workflows/hello-workflow/current/wf.yaml
      */
      await initService.init(projectDir);

      const wfYamlPath = `${projectDir}/.chainglass/workflows/hello-workflow/current/wf.yaml`;
      expect(await fs.exists(wfYamlPath)).toBe(true);

      const content = await fs.readFile(wfYamlPath);
      expect(content).toContain('name: Hello Workflow');
    });

    it('should copy nested directory structure', async () => {
      /*
      Test Doc:
      - Why: Workflow templates have nested phase/command structure
      - Contract: Entire template tree is copied, preserving structure
      - Usage Notes: phases/gather/commands/main.md should exist
      - Quality Contribution: Ensures complete workflow is copied
      - Worked Example: phases/gather/commands/main.md copied to current/phases/gather/commands/main.md
      */
      await initService.init(projectDir);

      const mainMdPath = `${projectDir}/.chainglass/workflows/hello-workflow/current/phases/gather/commands/main.md`;
      expect(await fs.exists(mainMdPath)).toBe(true);
    });

    it('should create workflow.json with slug and name from wf.yaml', async () => {
      /*
      Test Doc:
      - Why: Workflow metadata is needed for list/info commands
      - Contract: workflow.json is created with slug, name from wf.yaml, created_at timestamp
      - Usage Notes: Uses extracted generateWorkflowJson utility
      - Quality Contribution: Enables workflow management commands
      - Worked Example: workflow.json contains { slug: 'hello-workflow', name: 'Hello Workflow', ... }
      */
      // Set up YAML parser to return parsed content
      yamlParser.setParseResult(
        `${projectDir}/.chainglass/workflows/hello-workflow/current/wf.yaml`,
        { name: 'Hello Workflow', version: '1.0.0' }
      );

      await initService.init(projectDir);

      const workflowJsonPath = `${projectDir}/.chainglass/workflows/hello-workflow/workflow.json`;
      expect(await fs.exists(workflowJsonPath)).toBe(true);

      const workflowJson = JSON.parse(await fs.readFile(workflowJsonPath));
      expect(workflowJson.slug).toBe('hello-workflow');
      expect(workflowJson.name).toBe('Hello Workflow');
      expect(workflowJson.created_at).toBeDefined();
    });

    it('should report hydrated templates in result', async () => {
      /*
      Test Doc:
      - Why: User feedback shows which templates were installed
      - Contract: InitResult.hydratedTemplates contains slugs of copied templates
      - Usage Notes: Only new templates appear here, not skipped ones
      - Quality Contribution: Provides user feedback on init actions
      - Worked Example: init() returns { hydratedTemplates: ['hello-workflow'] }
      */
      const result = await initService.init(projectDir);

      expect(result.hydratedTemplates).toContain('hello-workflow');
    });
  });

  describe('collision detection (T006)', () => {
    it('should skip existing workflows by default', async () => {
      /*
      Test Doc:
      - Why: Protect user's custom workflows from being overwritten
      - Contract: Existing workflow directories are not modified (force: false default)
      - Usage Notes: Check is based on workflow directory existence
      - Quality Contribution: Non-destructive behavior protects user data
      - Worked Example: existing hello-workflow → init() skips it
      */
      // Pre-create existing workflow
      fs.setFile(
        `${projectDir}/.chainglass/workflows/hello-workflow/current/wf.yaml`,
        'name: My Custom Workflow\nversion: "2.0.0"'
      );

      await initService.init(projectDir);

      // Verify original content preserved
      const content = await fs.readFile(
        `${projectDir}/.chainglass/workflows/hello-workflow/current/wf.yaml`
      );
      expect(content).toContain('My Custom Workflow');
    });

    it('should report skipped workflows in result when no force flag', async () => {
      /*
      Test Doc:
      - Why: User should know what was skipped
      - Contract: InitResult.skippedTemplates contains slugs of existing workflows
      - Usage Notes: Only appears when workflow dir already exists
      - Quality Contribution: Transparency about init behavior
      - Worked Example: existing workflow → { skippedTemplates: ['hello-workflow'] }
      */
      // Pre-create existing workflow
      fs.setFile(
        `${projectDir}/.chainglass/workflows/hello-workflow/current/wf.yaml`,
        'name: My Custom Workflow'
      );

      const result = await initService.init(projectDir);

      expect(result.skippedTemplates).toContain('hello-workflow');
      expect(result.hydratedTemplates).not.toContain('hello-workflow');
    });

    it('should overwrite existing workflows when force=true', async () => {
      /*
      Test Doc:
      - Why: Development/testing needs to reset to bundled templates
      - Contract: With force: true, existing workflows are overwritten
      - Usage Notes: Only for development - warns users about data loss potential
      - Quality Contribution: Enables template reset for development
      - Worked Example: existing workflow + force: true → template replaced
      */
      // Pre-create existing workflow
      fs.setFile(
        `${projectDir}/.chainglass/workflows/hello-workflow/current/wf.yaml`,
        'name: My Custom Workflow'
      );

      await initService.init(projectDir, { force: true });

      // Verify content was replaced
      const content = await fs.readFile(
        `${projectDir}/.chainglass/workflows/hello-workflow/current/wf.yaml`
      );
      expect(content).toContain('Hello Workflow');
    });

    it('should report overwritten workflows in result when force=true', async () => {
      /*
      Test Doc:
      - Why: User should know what was overwritten
      - Contract: InitResult.overwrittenTemplates contains slugs of replaced workflows
      - Usage Notes: Only appears when force: true and workflow existed
      - Quality Contribution: Transparency about destructive operations
      - Worked Example: force: true → { overwrittenTemplates: ['hello-workflow'] }
      */
      // Pre-create existing workflow
      fs.setFile(
        `${projectDir}/.chainglass/workflows/hello-workflow/current/wf.yaml`,
        'name: My Custom Workflow'
      );

      const result = await initService.init(projectDir, { force: true });

      expect(result.overwrittenTemplates).toContain('hello-workflow');
      expect(result.skippedTemplates).not.toContain('hello-workflow');
    });

    it('should not include new templates in overwrittenTemplates', async () => {
      /*
      Test Doc:
      - Why: Avoid confusion between new and overwritten
      - Contract: Only actually overwritten templates appear in overwrittenTemplates
      - Usage Notes: New templates go to hydratedTemplates only
      - Quality Contribution: Accurate reporting of actions taken
      - Worked Example: fresh init with force → overwrittenTemplates is empty
      */
      const result = await initService.init(projectDir, { force: true });

      // No existing workflows, so nothing was overwritten
      expect(result.overwrittenTemplates).toHaveLength(0);
      expect(result.hydratedTemplates).toContain('hello-workflow');
    });
  });

  describe('isInitialized (T006 - DYK-07)', () => {
    it('should return false for uninitialized project', async () => {
      /*
      Test Doc:
      - Why: Other commands need to detect uninitialized projects
      - Contract: isInitialized() returns false when .chainglass structure is missing
      - Usage Notes: Checks for existence of required directories
      - Quality Contribution: Enables graceful errors from other commands
      - Worked Example: empty project → isInitialized() returns false
      */
      const result = await initService.isInitialized(projectDir);

      expect(result).toBe(false);
    });

    it('should return true for initialized project', async () => {
      /*
      Test Doc:
      - Why: Initialized projects should be recognized as such
      - Contract: isInitialized() returns true when .chainglass structure exists
      - Usage Notes: Only checks directories, not templates
      - Quality Contribution: Allows commands to proceed when initialized
      - Worked Example: after init() → isInitialized() returns true
      */
      await initService.init(projectDir);

      const result = await initService.isInitialized(projectDir);

      expect(result).toBe(true);
    });

    it('should return false if only runs/ exists', async () => {
      /*
      Test Doc:
      - Why: Partial initialization should be detected
      - Contract: Both workflows/ and runs/ must exist for initialized=true
      - Usage Notes: Corrupted/partial state is not considered initialized
      - Quality Contribution: Detects incomplete initialization
      - Worked Example: only .chainglass/runs → isInitialized() returns false
      */
      fs.setDir(`${projectDir}/.chainglass/runs`);

      const result = await initService.isInitialized(projectDir);

      expect(result).toBe(false);
    });
  });

  describe('slug validation (FIX-01 - SEC-01)', () => {
    it('should skip template directories with invalid slugs', async () => {
      /*
      Test Doc:
      - Why: Prevent path traversal attacks via malicious template directory names
      - Contract: Only template directories matching slug pattern are processed
      - Usage Notes: Invalid slugs are silently skipped (not an error)
      - Quality Contribution: Security - prevents arbitrary file write
      - Worked Example: '../escape' template → skipped, not copied
      */
      // Add malicious directory to bundled templates
      fs.setFile(`${bundleDir}/assets/templates/workflows/../../../tmp/wf.yaml`, 'name: Evil');

      const result = await initService.init(projectDir);

      // Should not process malicious directory
      expect(result.hydratedTemplates).not.toContain('../../../tmp');
      // hello-workflow should still work
      expect(result.hydratedTemplates).toContain('hello-workflow');
    });

    it('should accept valid slug patterns', async () => {
      /*
      Test Doc:
      - Why: Ensure valid slugs are not rejected
      - Contract: Slugs matching /^[a-z][a-z0-9-]*$/ are accepted
      - Usage Notes: Lowercase letters, numbers, hyphens only
      - Quality Contribution: User experience - reasonable naming conventions
      - Worked Example: 'my-workflow-2' → accepted
      */
      fs.setFile(
        `${bundleDir}/assets/templates/workflows/my-workflow-2/wf.yaml`,
        'name: My Workflow 2'
      );

      const result = await initService.init(projectDir);

      expect(result.hydratedTemplates).toContain('my-workflow-2');
    });

    it('should reject slugs starting with numbers', async () => {
      /*
      Test Doc:
      - Why: Consistent slug format (start with letter)
      - Contract: Slugs starting with numbers are rejected
      - Usage Notes: Pattern requires lowercase letter first
      - Quality Contribution: Consistency in workflow naming
      - Worked Example: '123-workflow' → skipped
      */
      fs.setFile(
        `${bundleDir}/assets/templates/workflows/123-workflow/wf.yaml`,
        'name: Numeric Start'
      );

      const result = await initService.init(projectDir);

      expect(result.hydratedTemplates).not.toContain('123-workflow');
    });

    it('should reject slugs with uppercase letters', async () => {
      /*
      Test Doc:
      - Why: Consistent lowercase slugs
      - Contract: Slugs with uppercase are rejected
      - Usage Notes: Use lowercase only for predictable paths
      - Quality Contribution: Cross-platform path compatibility
      - Worked Example: 'MyWorkflow' → skipped
      */
      fs.setFile(`${bundleDir}/assets/templates/workflows/MyWorkflow/wf.yaml`, 'name: Upper Case');

      const result = await initService.init(projectDir);

      expect(result.hydratedTemplates).not.toContain('MyWorkflow');
    });
  });

  describe('error handling (FIX-02 - SEC-02)', () => {
    it('should capture filesystem errors in result.errors', async () => {
      /*
      Test Doc:
      - Why: Graceful error handling instead of uncaught exceptions
      - Contract: Filesystem errors are captured in result.errors with actionable messages
      - Usage Notes: Errors include error code and suggested action
      - Quality Contribution: User experience - clear error messages
      - Worked Example: Permission denied → { code: 'E040', message: '...', action: '...' }
      */
      // Simulate filesystem error on directory creation
      fs.simulateError(
        `${projectDir}/.chainglass/workflows`,
        new Error('EACCES: Permission denied')
      );

      const result = await initService.init(projectDir);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].code).toBe('E040');
      expect(result.errors[0].message).toContain('Permission denied');
      expect(result.errors[0].action).toBeDefined();
    });

    it('should capture template hydration errors separately', async () => {
      /*
      Test Doc:
      - Why: Distinguish directory creation errors from template errors
      - Contract: Template hydration errors use different error code
      - Usage Notes: Allows partial success (dirs created but templates failed)
      - Quality Contribution: Debugging - specific error codes
      - Worked Example: Template copy fails → { code: 'E041', ... }
      */
      // Simulate error during template copy (after dirs are created)
      fs.simulateError(
        `${bundleDir}/assets/templates/workflows/hello-workflow`,
        new Error('ENOENT: No such file')
      );

      const result = await initService.init(projectDir);

      // Directories should be created
      expect(result.createdDirs).toContain('.chainglass/workflows');
      // But template hydration should fail
      expect(result.errors.some((e) => e.code === 'E041')).toBe(true);
    });

    it('should return early on directory creation failure', async () => {
      /*
      Test Doc:
      - Why: No point hydrating templates if directories cannot be created
      - Contract: On dir creation failure, returns immediately with error
      - Usage Notes: hydratedTemplates will be empty on early return
      - Quality Contribution: Fail fast with clear reason
      - Worked Example: mkdir fails → error returned, no template processing
      */
      // Simulate error on first directory creation
      fs.simulateError(
        `${projectDir}/.chainglass/workflows`,
        new Error('EACCES: Permission denied')
      );

      const result = await initService.init(projectDir);

      expect(result.errors.length).toBe(1);
      expect(result.hydratedTemplates).toHaveLength(0);
      expect(result.skippedTemplates).toHaveLength(0);
    });
  });

  describe('getInitializationStatus (T006 - DYK-07)', () => {
    it('should return detailed status for uninitialized project', async () => {
      /*
      Test Doc:
      - Why: Help user understand what's missing
      - Contract: getInitializationStatus() returns { initialized: false, missingDirs: [...], suggestedAction }
      - Usage Notes: missingDirs lists which directories are absent
      - Quality Contribution: Actionable error messages for users
      - Worked Example: empty project → { initialized: false, missingDirs: ['.chainglass/workflows', ...] }
      */
      const status = await initService.getInitializationStatus(projectDir);

      expect(status.initialized).toBe(false);
      expect(status.missingDirs).toContain('.chainglass/workflows');
      expect(status.missingDirs).toContain('.chainglass/runs');
      expect(status.suggestedAction).toContain('cg init');
    });

    it('should return empty missingDirs for initialized project', async () => {
      /*
      Test Doc:
      - Why: Initialized projects have no missing directories
      - Contract: getInitializationStatus() returns { initialized: true, missingDirs: [], suggestedAction: '' }
      - Usage Notes: suggestedAction is empty when nothing needs to be done
      - Quality Contribution: Confirms correct state
      - Worked Example: after init() → { initialized: true, missingDirs: [] }
      */
      await initService.init(projectDir);

      const status = await initService.getInitializationStatus(projectDir);

      expect(status.initialized).toBe(true);
      expect(status.missingDirs).toHaveLength(0);
    });
  });
});
