import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createProgram } from '../../../apps/cli/src/bin/cg.js';

/**
 * Integration tests for `cg wf compose` command.
 *
 * These tests verify the complete CLI workflow for compose:
 * - AC-06: Help shows compose subcommand
 * - AC-07: Compose creates run folder with correct structure
 * - AC-07a: JSON output returns valid envelope
 * - AC-08: wf-status.json contains correct metadata
 * - AC-09: Each phase folder has wf-phase.yaml
 */
describe('cg wf compose', () => {
  let tempDir: string;
  let templatesDir: string;
  let runsDir: string;
  let originalCwd: string;
  let capturedOutput: string;

  /**
   * Copy directory recursively.
   */
  function copyDir(src: string, dest: string): void {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        copyDir(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  beforeEach(() => {
    // Create temp directories
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-compose-test-'));
    templatesDir = path.join(tempDir, '.chainglass', 'templates');
    runsDir = path.join(tempDir, '.chainglass', 'runs');
    fs.mkdirSync(templatesDir, { recursive: true });
    fs.mkdirSync(runsDir, { recursive: true });

    // Copy exemplar template to test templates directory
    const exemplarPath = path.resolve(
      __dirname,
      '../../../dev/examples/wf/template/hello-workflow'
    );
    copyDir(exemplarPath, path.join(templatesDir, 'hello-workflow'));

    // Change to temp directory for relative path resolution
    originalCwd = process.cwd();
    process.chdir(tempDir);

    // Capture output
    capturedOutput = '';
  });

  afterEach(() => {
    // Restore CWD
    process.chdir(originalCwd);

    // Clean up temp directories
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('help', () => {
    it('cg wf compose --help shows compose command options (AC-06)', async () => {
      /*
      Test Doc:
      - Why: Users must be able to discover the compose command via help
      - Contract: `cg wf compose --help` shows compose-specific options
      - Usage Notes: Uses testMode to capture help output without exiting
      - Quality Contribution: Critical path - discoverability of core command
      - Worked Example: Run `cg wf compose --help` → output contains '--json' and '--runs-dir'
      */
      const program = createProgram({ testMode: true });
      let helpOutput = '';

      // Configure to capture help output
      program.configureOutput({
        writeOut: (str) => {
          helpOutput += str;
        },
        writeErr: () => {},
      });

      try {
        await program.parseAsync(['node', 'cg', 'wf', 'compose', '--help']);
      } catch (e: unknown) {
        // Commander throws on --help in testMode
        if ((e as { code?: string }).code !== 'commander.helpDisplayed') {
          throw e;
        }
      }

      // Compose help should show its options
      expect(helpOutput).toMatch(/--json|json/i);
      expect(helpOutput).toMatch(/--runs-dir|runs/i);
    });
  });

  describe('compose execution', () => {
    it('cg wf compose creates run folder from template (AC-07)', async () => {
      /*
      Test Doc:
      - Why: Core compose functionality creates complete run folder
      - Contract: Running compose with template slug creates dated run folder with phases
      - Usage Notes: Uses real filesystem for integration testing
      - Quality Contribution: Critical path - main compose workflow
      - Worked Example: `cg wf compose hello-workflow` creates `.chainglass/runs/run-YYYY-MM-DD-001/`
      */
      const program = createProgram({ testMode: true });

      // Mock console.log to capture output
      const originalLog = console.log;
      let output = '';
      console.log = (msg: string) => {
        output += msg;
      };

      try {
        await program.parseAsync([
          'node',
          'cg',
          'wf',
          'compose',
          '.chainglass/templates/hello-workflow',
          '--runs-dir',
          '.chainglass/runs',
        ]);
      } finally {
        console.log = originalLog;
      }

      // Find the created run folder
      const runEntries = fs.readdirSync(runsDir);
      const runFolders = runEntries.filter((e) => e.startsWith('run-'));
      expect(runFolders.length).toBe(1);

      const runDir = path.join(runsDir, runFolders[0]);

      // Verify run folder structure
      expect(fs.existsSync(path.join(runDir, 'wf.yaml'))).toBe(true);
      expect(fs.existsSync(path.join(runDir, 'wf-run', 'wf-status.json'))).toBe(true);
      expect(fs.existsSync(path.join(runDir, 'phases', 'gather'))).toBe(true);
      expect(fs.existsSync(path.join(runDir, 'phases', 'process'))).toBe(true);
      expect(fs.existsSync(path.join(runDir, 'phases', 'report'))).toBe(true);
    });

    it('cg wf compose --json returns valid envelope (AC-07a)', async () => {
      /*
      Test Doc:
      - Why: JSON output enables programmatic consumption by orchestrators
      - Contract: --json flag produces valid JSON with CommandResponse envelope
      - Usage Notes: Envelope has success, command, timestamp, data fields
      - Quality Contribution: Critical path - machine-readable output
      - Worked Example: `cg wf compose --json` → { success: true, command: 'wf.compose', data: { runDir: '...' } }
      */
      const program = createProgram({ testMode: true });

      // Mock console.log to capture output
      const originalLog = console.log;
      let output = '';
      console.log = (msg: string) => {
        output += msg;
      };

      try {
        await program.parseAsync([
          'node',
          'cg',
          'wf',
          'compose',
          '.chainglass/templates/hello-workflow',
          '--runs-dir',
          '.chainglass/runs',
          '--json',
        ]);
      } finally {
        console.log = originalLog;
      }

      // Parse JSON output
      const response = JSON.parse(output);

      expect(response.success).toBe(true);
      expect(response.command).toBe('wf.compose');
      expect(response.timestamp).toBeDefined();
      expect(response.data).toBeDefined();
      expect(response.data.runDir).toMatch(/run-\d{4}-\d{2}-\d{2}-\d{3}/);
      expect(response.data.phases).toBeInstanceOf(Array);
      expect(response.data.phases.length).toBe(3);
    });

    it('wf-status.json contains correct metadata (AC-08)', async () => {
      /*
      Test Doc:
      - Why: wf-status.json tracks run state for orchestrators
      - Contract: Status file has workflow name, run metadata, and phase states
      - Usage Notes: All phases start as 'pending'
      - Quality Contribution: Opaque behavior - internal state file format
      - Worked Example: wf-status.json contains { workflow: { name: '...' }, phases: [{ status: 'pending' }] }
      */
      const program = createProgram({ testMode: true });

      // Mock console.log to capture output
      const originalLog = console.log;
      console.log = () => {};

      try {
        await program.parseAsync([
          'node',
          'cg',
          'wf',
          'compose',
          '.chainglass/templates/hello-workflow',
          '--runs-dir',
          '.chainglass/runs',
        ]);
      } finally {
        console.log = originalLog;
      }

      // Find the created run folder
      const runFolders = fs.readdirSync(runsDir).filter((e) => e.startsWith('run-'));
      const runDir = path.join(runsDir, runFolders[0]);

      // Read and parse wf-status.json
      const statusPath = path.join(runDir, 'wf-run', 'wf-status.json');
      const statusContent = fs.readFileSync(statusPath, 'utf-8');
      const status = JSON.parse(statusContent);

      // Verify structure - phases is Record<string, WfStatusPhase>, not an array
      expect(status.workflow).toBeDefined();
      expect(status.workflow.name).toBe('hello-workflow');
      expect(status.run).toBeDefined();
      expect(status.run.status).toBe('pending');
      expect(status.phases).toBeDefined();
      expect(typeof status.phases).toBe('object');

      // Should have 3 phases: gather, process, report
      const phaseNames = Object.keys(status.phases);
      expect(phaseNames).toContain('gather');
      expect(phaseNames).toContain('process');
      expect(phaseNames).toContain('report');

      // All phases should be pending
      for (const phaseName of phaseNames) {
        expect(status.phases[phaseName].status).toBe('pending');
      }
    });

    it('each phase folder has wf-phase.yaml (AC-09)', async () => {
      /*
      Test Doc:
      - Why: Each phase needs its own phase definition for execution
      - Contract: Every phase folder contains wf-phase.yaml extracted from root wf.yaml
      - Usage Notes: wf-phase.yaml has phase-specific config (inputs, outputs, etc.)
      - Quality Contribution: Critical path - phase structure
      - Worked Example: phases/gather/wf-phase.yaml exists and has `name: gather`
      */
      const program = createProgram({ testMode: true });

      // Mock console.log to capture output
      const originalLog = console.log;
      console.log = () => {};

      try {
        await program.parseAsync([
          'node',
          'cg',
          'wf',
          'compose',
          '.chainglass/templates/hello-workflow',
          '--runs-dir',
          '.chainglass/runs',
        ]);
      } finally {
        console.log = originalLog;
      }

      // Find the created run folder
      const runFolders = fs.readdirSync(runsDir).filter((e) => e.startsWith('run-'));
      const runDir = path.join(runsDir, runFolders[0]);

      // Check each phase has wf-phase.yaml
      const phases = ['gather', 'process', 'report'];
      for (const phaseName of phases) {
        const phaseYamlPath = path.join(runDir, 'phases', phaseName, 'wf-phase.yaml');
        expect(fs.existsSync(phaseYamlPath), `${phaseName}/wf-phase.yaml should exist`).toBe(true);

        // Verify it contains the phase name (uses 'phase:' key per wf-phase.schema.json)
        const content = fs.readFileSync(phaseYamlPath, 'utf-8');
        expect(content).toContain(`phase: ${phaseName}`);
      }
    });

    it('each phase folder has commands directory with main.md', async () => {
      /*
      Test Doc:
      - Why: Agent instructions are delivered via commands directory
      - Contract: Each phase has commands/ with main.md copied from template
      - Usage Notes: main.md contains phase-specific agent instructions
      - Quality Contribution: Critical path - agent instruction delivery
      - Worked Example: phases/gather/commands/main.md exists
      */
      const program = createProgram({ testMode: true });

      // Mock console.log to capture output
      const originalLog = console.log;
      console.log = () => {};

      try {
        await program.parseAsync([
          'node',
          'cg',
          'wf',
          'compose',
          '.chainglass/templates/hello-workflow',
          '--runs-dir',
          '.chainglass/runs',
        ]);
      } finally {
        console.log = originalLog;
      }

      // Find the created run folder
      const runFolders = fs.readdirSync(runsDir).filter((e) => e.startsWith('run-'));
      const runDir = path.join(runsDir, runFolders[0]);

      // Check each phase has commands/main.md
      const phases = ['gather', 'process', 'report'];
      for (const phaseName of phases) {
        const mainMdPath = path.join(runDir, 'phases', phaseName, 'commands', 'main.md');
        expect(fs.existsSync(mainMdPath), `${phaseName}/commands/main.md should exist`).toBe(true);
      }
    });

    it('each phase folder has schemas directory with core schemas', async () => {
      /*
      Test Doc:
      - Why: Schema validation requires schemas to be present in each phase
      - Contract: Each phase has schemas/ with core schemas (wf.schema.json, etc.)
      - Usage Notes: DYK-01: Schemas are embedded as TS modules and written at compose time
      - Quality Contribution: Opaque behavior - schema distribution
      - Worked Example: phases/gather/schemas/wf.schema.json exists
      */
      const program = createProgram({ testMode: true });

      // Mock console.log to capture output
      const originalLog = console.log;
      console.log = () => {};

      try {
        await program.parseAsync([
          'node',
          'cg',
          'wf',
          'compose',
          '.chainglass/templates/hello-workflow',
          '--runs-dir',
          '.chainglass/runs',
        ]);
      } finally {
        console.log = originalLog;
      }

      // Find the created run folder
      const runFolders = fs.readdirSync(runsDir).filter((e) => e.startsWith('run-'));
      const runDir = path.join(runsDir, runFolders[0]);

      // Check first phase has core schemas
      const schemasDir = path.join(runDir, 'phases', 'gather', 'schemas');
      expect(fs.existsSync(path.join(schemasDir, 'wf.schema.json'))).toBe(true);
      expect(fs.existsSync(path.join(schemasDir, 'wf-phase.schema.json'))).toBe(true);
      expect(fs.existsSync(path.join(schemasDir, 'message.schema.json'))).toBe(true);
    });

    it('run folder uses date-ordinal naming', async () => {
      /*
      Test Doc:
      - Why: Run folders are named with date and ordinal for chronological ordering
      - Contract: Run folder name follows pattern run-YYYY-MM-DD-NNN
      - Usage Notes: DYK-03: Ordinal is date-scoped, found via regex filter
      - Quality Contribution: Edge case - naming convention
      - Worked Example: First run of 2026-01-22 → run-2026-01-22-001
      */
      const program = createProgram({ testMode: true });

      // Mock console.log to capture output
      const originalLog = console.log;
      console.log = () => {};

      try {
        await program.parseAsync([
          'node',
          'cg',
          'wf',
          'compose',
          '.chainglass/templates/hello-workflow',
          '--runs-dir',
          '.chainglass/runs',
        ]);
      } finally {
        console.log = originalLog;
      }

      // Find the created run folder
      const runFolders = fs.readdirSync(runsDir).filter((e) => e.startsWith('run-'));
      expect(runFolders.length).toBe(1);

      // Verify naming pattern
      const runFolderName = runFolders[0];
      expect(runFolderName).toMatch(/^run-\d{4}-\d{2}-\d{2}-\d{3}$/);

      // First run of the day should be -001
      expect(runFolderName).toMatch(/-001$/);
    });

    it('second compose on same day increments ordinal', async () => {
      /*
      Test Doc:
      - Why: Multiple runs on same day get unique ordinals
      - Contract: Second run increments ordinal (001 → 002)
      - Usage Notes: DYK-03: Ordinal discovery handles gaps by finding max+1
      - Quality Contribution: Edge case - ordinal increment
      - Worked Example: Two composes → run-2026-01-22-001, run-2026-01-22-002
      */
      const program1 = createProgram({ testMode: true });
      const program2 = createProgram({ testMode: true });

      // Mock console.log to suppress output
      const originalLog = console.log;
      console.log = () => {};

      try {
        // First compose
        await program1.parseAsync([
          'node',
          'cg',
          'wf',
          'compose',
          '.chainglass/templates/hello-workflow',
          '--runs-dir',
          '.chainglass/runs',
        ]);

        // Second compose
        await program2.parseAsync([
          'node',
          'cg',
          'wf',
          'compose',
          '.chainglass/templates/hello-workflow',
          '--runs-dir',
          '.chainglass/runs',
        ]);
      } finally {
        console.log = originalLog;
      }

      // Find the created run folders
      const runFolders = fs.readdirSync(runsDir).filter((e) => e.startsWith('run-'));
      expect(runFolders.length).toBe(2);

      // Sort to get consistent order
      runFolders.sort();

      // First should end with -001, second with -002
      expect(runFolders[0]).toMatch(/-001$/);
      expect(runFolders[1]).toMatch(/-002$/);
    });
  });

  describe('error handling', () => {
    it('returns E020 error for non-existent template', async () => {
      /*
      Test Doc:
      - Why: Clear error when template not found
      - Contract: Non-existent template returns error with code E020
      - Usage Notes: Error message should suggest possible causes
      - Quality Contribution: Edge case - error handling
      - Worked Example: `cg wf compose non-existent --json` → { success: false, errors: [{ code: 'E020' }] }
      */
      const program = createProgram({ testMode: true });

      // Mock console.log to capture output
      const originalLog = console.log;
      let output = '';
      console.log = (msg: string) => {
        output += msg;
      };

      // Mock process.exit to prevent test from exiting
      const originalExit = process.exit;
      let exitCode: number | undefined;
      process.exit = ((code?: number) => {
        exitCode = code;
      }) as typeof process.exit;

      try {
        await program.parseAsync([
          'node',
          'cg',
          'wf',
          'compose',
          'non-existent-template',
          '--runs-dir',
          '.chainglass/runs',
          '--json',
        ]);
      } finally {
        console.log = originalLog;
        process.exit = originalExit;
      }

      // Parse JSON output - error responses have 'error' object (not 'errors' array)
      const response = JSON.parse(output);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error.code).toBe('E020');
      expect(exitCode).toBe(1);
    });
  });
});
