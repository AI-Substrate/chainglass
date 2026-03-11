import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import type { Command } from 'commander';
import { HARNESS_VIEWPORTS, type ViewportName } from '../../viewports/devices.js';
import { ErrorCodes, exitWithEnvelope, formatError, formatSuccess } from '../output.js';

const execFileAsync = promisify(execFile);

const HARNESS_ROOT = path.resolve(import.meta.dirname ?? '.', '../../..');
const RESULTS_DIR = path.join(HARNESS_ROOT, 'results');
const RESULTS_FILE = path.join(RESULTS_DIR, 'test-results.json');

// Maps CLI suite names to test globs
const SUITE_GLOBS: Record<string, string> = {
  smoke: 'tests/smoke/**/*.spec.ts',
} as const;

// Maps viewport names to Playwright project names
const VIEWPORT_TO_PROJECT: Record<string, string> = {
  'desktop-lg': 'desktop',
  'desktop-md': 'desktop',
  tablet: 'tablet',
  mobile: 'mobile',
} as const;

export function registerTestCommand(program: Command): void {
  program
    .command('test')
    .description('Run Playwright test suites and return JSON results')
    .option('--suite <name>', 'Test suite to run', 'smoke')
    .option('--viewport <name>', 'Viewport to use', 'desktop-lg')
    .action(async (opts: { suite: string; viewport: string }) => {
      const viewportName = opts.viewport as ViewportName;
      if (!(viewportName in HARNESS_VIEWPORTS)) {
        exitWithEnvelope(
          formatError('test', ErrorCodes.INVALID_ARGS, `Unknown viewport: ${opts.viewport}`, {
            available: Object.keys(HARNESS_VIEWPORTS),
          }),
        );
      }

      const suiteGlob = SUITE_GLOBS[opts.suite];
      if (!suiteGlob) {
        exitWithEnvelope(
          formatError('test', ErrorCodes.INVALID_ARGS, `Unknown suite: ${opts.suite}`, {
            available: Object.keys(SUITE_GLOBS),
          }),
        );
      }

      const projectName = VIEWPORT_TO_PROJECT[viewportName];
      if (!projectName) {
        exitWithEnvelope(
          formatError('test', ErrorCodes.INVALID_ARGS, `No Playwright project for viewport: ${opts.viewport}`),
        );
      }

      // Delete stale results before running
      rmSync(RESULTS_FILE, { force: true });
      const commandStartMs = Date.now();

      const playwrightConfig = path.join(HARNESS_ROOT, 'playwright.config.ts');

      try {
        const env = {
          ...process.env,
          PLAYWRIGHT_JSON_OUTPUT_NAME: RESULTS_FILE,
        };

        const args = [
          'playwright',
          'test',
          suiteGlob,
          `--config=${playwrightConfig}`,
          `--project=${projectName}`,
          '--reporter=json',
        ];

        await execFileAsync('npx', args, {
          cwd: HARNESS_ROOT,
          env,
          timeout: 120_000,
        });
      } catch (err: unknown) {
        const e = err as { code?: number; stderr?: string };
        if (!existsSync(RESULTS_FILE)) {
          exitWithEnvelope(
            formatError('test', ErrorCodes.TEST_FAILED, 'Playwright execution failed', {
              stderr: (e.stderr ?? '').slice(-500),
            }),
          );
        }
      }

      // Verify fresh results exist (not stale)
      if (!existsSync(RESULTS_FILE)) {
        exitWithEnvelope(
          formatError('test', ErrorCodes.RESULTS_NOT_FOUND, 'No test results file produced'),
        );
      }

      const stat = statSync(RESULTS_FILE);
      if (stat.mtimeMs < commandStartMs) {
        exitWithEnvelope(
          formatError('test', ErrorCodes.TEST_FAILED, 'Stale test results file detected — Playwright may not have run'),
        );
      }

      const raw = JSON.parse(readFileSync(RESULTS_FILE, 'utf-8'));
      const stats = raw.stats ?? {};
      const summary = {
        suite: opts.suite,
        viewport: opts.viewport,
        expected: stats.expected ?? 0,
        unexpected: stats.unexpected ?? 0,
        flaky: stats.flaky ?? 0,
        skipped: stats.skipped ?? 0,
        duration: stats.duration ?? 0,
        resultsFile: RESULTS_FILE,
      };

      const status = summary.unexpected > 0 ? 'error' : 'ok';
      if (status === 'error') {
        exitWithEnvelope(
          formatError('test', ErrorCodes.TEST_FAILED, `${summary.unexpected} test(s) failed`, summary),
        );
      }

      exitWithEnvelope(formatSuccess('test', summary));
    });
}
