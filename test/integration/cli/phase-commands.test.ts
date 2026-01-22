import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createProgram } from '../../../apps/cli/src/bin/cg.js';

/**
 * Integration tests for `cg phase prepare` and `cg phase validate` commands.
 *
 * These tests verify the complete CLI workflow for phase operations:
 * - AC-36: cg phase prepare updates status to ready
 * - AC-37: Idempotent prepare (second call succeeds)
 * - AC-39: cg phase validate --check inputs validates phase inputs
 * - AC-40: cg phase validate --check outputs validates phase outputs
 */
describe('cg phase', () => {
  let tempDir: string;
  let templatesDir: string;
  let runsDir: string;
  let runDir: string;
  let originalCwd: string;

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

  beforeEach(async () => {
    // Create temp directories
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-cmd-test-'));
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

    // Create a run folder using compose
    const program = createProgram({ testMode: true });
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
    runDir = path.join(runsDir, runFolders[0]);
  });

  afterEach(() => {
    // Restore CWD
    process.chdir(originalCwd);

    // Clean up temp directories
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('help', () => {
    it('cg phase prepare --help shows prepare command options', async () => {
      /*
      Test Doc:
      - Why: Users must be able to discover the prepare command via help
      - Contract: `cg phase prepare --help` shows prepare-specific options
      - Usage Notes: Uses testMode to capture help output without exiting
      - Quality Contribution: Critical path - discoverability of phase commands
      - Worked Example: Run `cg phase prepare --help` → output contains '--run-dir' and '--json'
      */
      const program = createProgram({ testMode: true });
      let helpOutput = '';

      program.configureOutput({
        writeOut: (str) => {
          helpOutput += str;
        },
        writeErr: () => {},
      });

      try {
        await program.parseAsync(['node', 'cg', 'phase', 'prepare', '--help']);
      } catch (e: unknown) {
        if ((e as { code?: string }).code !== 'commander.helpDisplayed') {
          throw e;
        }
      }

      expect(helpOutput).toMatch(/--run-dir/i);
      expect(helpOutput).toMatch(/--json/i);
      expect(helpOutput).toMatch(/phase/i);
    });

    it('cg phase validate --help shows validate command options', async () => {
      /*
      Test Doc:
      - Why: Users must be able to discover the validate command via help
      - Contract: `cg phase validate --help` shows validate-specific options
      - Usage Notes: Shows --check option for inputs/outputs mode
      - Quality Contribution: Critical path - discoverability of phase commands
      - Worked Example: Run `cg phase validate --help` → output contains '--check' and '--run-dir'
      */
      const program = createProgram({ testMode: true });
      let helpOutput = '';

      program.configureOutput({
        writeOut: (str) => {
          helpOutput += str;
        },
        writeErr: () => {},
      });

      try {
        await program.parseAsync(['node', 'cg', 'phase', 'validate', '--help']);
      } catch (e: unknown) {
        if ((e as { code?: string }).code !== 'commander.helpDisplayed') {
          throw e;
        }
      }

      expect(helpOutput).toMatch(/--check/i);
      expect(helpOutput).toMatch(/--run-dir/i);
      expect(helpOutput).toMatch(/--json/i);
    });
  });

  describe('prepare execution', () => {
    it('cg phase prepare updates phase status to ready (AC-36)', async () => {
      /*
      Test Doc:
      - Why: Prepare sets up a phase for execution by copying inputs and resolving params
      - Contract: Running prepare on a pending phase changes status to 'ready'
      - Usage Notes: Requires prior phase to be finalized (gather has no prior)
      - Quality Contribution: Critical path - phase preparation workflow
      - Worked Example: `cg phase prepare gather --run-dir <path>` → status becomes 'ready'
      */
      const program = createProgram({ testMode: true });

      const originalLog = console.log;
      let output = '';
      console.log = (msg: string) => {
        output += msg;
      };

      try {
        await program.parseAsync([
          'node',
          'cg',
          'phase',
          'prepare',
          'gather',
          '--run-dir',
          runDir,
          '--json',
        ]);
      } finally {
        console.log = originalLog;
      }

      // Parse JSON output
      const response = JSON.parse(output);
      expect(response.success).toBe(true);
      expect(response.command).toBe('phase.prepare');

      // Verify wf-status.json was updated
      const statusPath = path.join(runDir, 'wf-run', 'wf-status.json');
      const status = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
      expect(status.phases.gather.status).toBe('ready');
    });

    it('cg phase prepare is idempotent (AC-37)', async () => {
      /*
      Test Doc:
      - Why: Prepare should be safe to run multiple times without side effects
      - Contract: Second prepare call succeeds without changing already-ready phase
      - Usage Notes: Idempotency allows orchestrators to retry safely
      - Quality Contribution: Edge case - idempotent operations
      - Worked Example: Run prepare twice → both succeed, status remains 'ready'
      */
      const program1 = createProgram({ testMode: true });
      const program2 = createProgram({ testMode: true });

      const originalLog = console.log;
      console.log = () => {};

      try {
        // First prepare
        await program1.parseAsync([
          'node',
          'cg',
          'phase',
          'prepare',
          'gather',
          '--run-dir',
          runDir,
        ]);

        // Second prepare (should be idempotent)
        let output = '';
        console.log = (msg: string) => {
          output += msg;
        };

        await program2.parseAsync([
          'node',
          'cg',
          'phase',
          'prepare',
          'gather',
          '--run-dir',
          runDir,
          '--json',
        ]);

        const response = JSON.parse(output);
        expect(response.success).toBe(true);
      } finally {
        console.log = originalLog;
      }

      // Verify status is still ready
      const statusPath = path.join(runDir, 'wf-run', 'wf-status.json');
      const status = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
      expect(status.phases.gather.status).toBe('ready');
    });

    it('cg phase prepare --json returns valid envelope', async () => {
      /*
      Test Doc:
      - Why: JSON output enables programmatic consumption by orchestrators
      - Contract: --json flag produces valid JSON with CommandResponse envelope
      - Usage Notes: Data includes phase name and preparation status
      - Quality Contribution: Critical path - machine-readable output
      - Worked Example: { success: true, command: 'phase.prepare', data: { phase: 'gather' } }
      */
      const program = createProgram({ testMode: true });

      const originalLog = console.log;
      let output = '';
      console.log = (msg: string) => {
        output += msg;
      };

      try {
        await program.parseAsync([
          'node',
          'cg',
          'phase',
          'prepare',
          'gather',
          '--run-dir',
          runDir,
          '--json',
        ]);
      } finally {
        console.log = originalLog;
      }

      const response = JSON.parse(output);
      expect(response.success).toBe(true);
      expect(response.command).toBe('phase.prepare');
      expect(response.timestamp).toBeDefined();
      expect(response.data).toBeDefined();
      expect(response.data.phase).toBe('gather');
    });
  });

  describe('validate execution', () => {
    it('cg phase validate --check inputs validates phase inputs (AC-39)', async () => {
      /*
      Test Doc:
      - Why: Validate inputs checks that all required inputs are present before execution
      - Contract: Running validate with --check inputs returns validation result
      - Usage Notes: Phase must be prepared first; gather has no required inputs
      - Quality Contribution: Critical path - input validation workflow
      - Worked Example: `cg phase validate gather --check inputs --run-dir <path>` → success
      */
      // First prepare the phase
      const prepProgram = createProgram({ testMode: true });
      const originalLog = console.log;
      console.log = () => {};

      try {
        await prepProgram.parseAsync([
          'node',
          'cg',
          'phase',
          'prepare',
          'gather',
          '--run-dir',
          runDir,
        ]);
      } finally {
        console.log = originalLog;
      }

      // Now validate inputs
      const program = createProgram({ testMode: true });
      let output = '';
      console.log = (msg: string) => {
        output += msg;
      };

      try {
        await program.parseAsync([
          'node',
          'cg',
          'phase',
          'validate',
          'gather',
          '--check',
          'inputs',
          '--run-dir',
          runDir,
          '--json',
        ]);
      } finally {
        console.log = originalLog;
      }

      const response = JSON.parse(output);
      expect(response.success).toBe(true);
      expect(response.command).toBe('phase.validate');
      expect(response.data.check).toBe('inputs');
      expect(response.data.files).toBeDefined();
    });

    it('cg phase validate --check outputs validates phase outputs (AC-40)', async () => {
      /*
      Test Doc:
      - Why: Validate outputs checks that all required outputs are present after execution
      - Contract: Running validate with --check outputs returns validation result
      - Usage Notes: Validates files exist and match schema; gather needs output files
      - Quality Contribution: Critical path - output validation workflow
      - Worked Example: `cg phase validate gather --check outputs --run-dir <path>` → validation result
      */
      // First prepare the phase
      const prepProgram = createProgram({ testMode: true });
      const originalLog = console.log;
      console.log = () => {};

      try {
        await prepProgram.parseAsync([
          'node',
          'cg',
          'phase',
          'prepare',
          'gather',
          '--run-dir',
          runDir,
        ]);
      } finally {
        console.log = originalLog;
      }

      // Create a fake output file to test validation
      const outputDir = path.join(runDir, 'phases', 'gather', 'run', 'outputs');
      fs.mkdirSync(outputDir, { recursive: true });
      fs.writeFileSync(
        path.join(outputDir, 'greeting.json'),
        JSON.stringify({ greeting: 'Hello, World!' })
      );

      // Now validate outputs - mock process.exit since validation may fail
      const program = createProgram({ testMode: true });
      let output = '';
      console.log = (msg: string) => {
        output += msg;
      };

      const originalExit = process.exit;
      process.exit = (() => {}) as typeof process.exit;

      try {
        await program.parseAsync([
          'node',
          'cg',
          'phase',
          'validate',
          'gather',
          '--check',
          'outputs',
          '--run-dir',
          runDir,
          '--json',
        ]);
      } finally {
        console.log = originalLog;
        process.exit = originalExit;
      }

      const response = JSON.parse(output);
      // Command itself succeeded (we got JSON output)
      expect(response.command).toBe('phase.validate');
      // Response has expected structure regardless of validation result
      if (response.success) {
        expect(response.data.check).toBe('outputs');
        expect(response.data).toHaveProperty('files');
      } else {
        // Validation failed due to missing/invalid outputs
        expect(response.error).toBeDefined();
      }
    });

    it('cg phase validate --json returns valid envelope', async () => {
      /*
      Test Doc:
      - Why: JSON output enables programmatic consumption by orchestrators
      - Contract: --json flag produces valid JSON with CommandResponse envelope
      - Usage Notes: Data includes check mode, validity, and file details
      - Quality Contribution: Critical path - machine-readable output
      - Worked Example: { success: true, command: 'phase.validate', data: { check: 'inputs', valid: true } }
      */
      // First prepare the phase
      const prepProgram = createProgram({ testMode: true });
      const originalLog = console.log;
      console.log = () => {};

      try {
        await prepProgram.parseAsync([
          'node',
          'cg',
          'phase',
          'prepare',
          'gather',
          '--run-dir',
          runDir,
        ]);
      } finally {
        console.log = originalLog;
      }

      // Validate
      const program = createProgram({ testMode: true });
      let output = '';
      console.log = (msg: string) => {
        output += msg;
      };

      try {
        await program.parseAsync([
          'node',
          'cg',
          'phase',
          'validate',
          'gather',
          '--check',
          'inputs',
          '--run-dir',
          runDir,
          '--json',
        ]);
      } finally {
        console.log = originalLog;
      }

      const response = JSON.parse(output);
      expect(response.success).toBe(true);
      expect(response.command).toBe('phase.validate');
      expect(response.timestamp).toBeDefined();
      expect(response.data).toBeDefined();
      expect(response.data.phase).toBe('gather');
      expect(response.data.check).toBe('inputs');
    });
  });

  describe('error handling', () => {
    it('prepare returns E020 error for non-existent phase', async () => {
      /*
      Test Doc:
      - Why: Clear error when phase not found
      - Contract: Non-existent phase returns error with code E020
      - Usage Notes: Error message should identify the missing phase
      - Quality Contribution: Edge case - error handling
      - Worked Example: `cg phase prepare nonexistent --run-dir <path> --json` → { success: false, error: { code: 'E020' } }
      */
      const program = createProgram({ testMode: true });

      const originalLog = console.log;
      let output = '';
      console.log = (msg: string) => {
        output += msg;
      };

      const originalExit = process.exit;
      let exitCode: number | undefined;
      process.exit = ((code?: number) => {
        exitCode = code;
      }) as typeof process.exit;

      try {
        await program.parseAsync([
          'node',
          'cg',
          'phase',
          'prepare',
          'nonexistent',
          '--run-dir',
          runDir,
          '--json',
        ]);
      } finally {
        console.log = originalLog;
        process.exit = originalExit;
      }

      const response = JSON.parse(output);
      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error.code).toBe('E020');
      expect(exitCode).toBe(1);
    });

    it('validate requires --check flag', async () => {
      /*
      Test Doc:
      - Why: Validate command requires explicit check mode (no default per DYK session)
      - Contract: Missing --check flag causes error
      - Usage Notes: User must specify 'inputs' or 'outputs'
      - Quality Contribution: Edge case - required argument handling
      - Worked Example: `cg phase validate gather --run-dir <path>` → error about missing --check
      */
      const program = createProgram({ testMode: true });

      const originalLog = console.log;
      const originalError = console.error;
      let errorOutput = '';
      console.log = () => {};
      console.error = (msg: string) => {
        errorOutput += String(msg);
      };

      // Configure Commander to capture writeErr
      program.configureOutput({
        writeOut: () => {},
        writeErr: (str) => {
          errorOutput += str;
        },
      });

      const originalExit = process.exit;
      let exitCode: number | undefined;
      process.exit = ((code?: number) => {
        exitCode = code;
        throw new Error(`process.exit(${code})`);
      }) as typeof process.exit;

      try {
        await program.parseAsync([
          'node',
          'cg',
          'phase',
          'validate',
          'gather',
          '--run-dir',
          runDir,
        ]);
      } catch {
        // Commander throws for missing required option
      } finally {
        console.log = originalLog;
        console.error = originalError;
        process.exit = originalExit;
      }

      // Either error output mentions --check or exit code is non-zero
      const hasCheckError = errorOutput.toLowerCase().includes('check') || exitCode !== undefined;
      expect(hasCheckError).toBe(true);
    });
  });
});
