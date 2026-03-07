import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import type { Command } from 'commander';
import { HARNESS_VIEWPORTS, type ViewportName } from '../../viewports/devices.js';
import { ErrorCodes, exitWithEnvelope, formatError, formatSuccess } from '../output.js';

const execFileAsync = promisify(execFile);

const HARNESS_ROOT = path.resolve(import.meta.dirname ?? '.', '../../..');
const RESULTS_DIR = path.join(HARNESS_ROOT, 'results');
const RESULTS_FILE = path.join(RESULTS_DIR, 'test-results.json');

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

      // Map suite to test path
      const suiteGlob = `tests/smoke/**/*.spec.ts`;
      const playwrightConfig = path.join(HARNESS_ROOT, 'playwright.config.ts');

      try {
        // DYK #3: Write results to file, not stdout
        const env = {
          ...process.env,
          PLAYWRIGHT_JSON_OUTPUT_NAME: RESULTS_FILE,
        };

        const args = [
          'playwright',
          'test',
          suiteGlob,
          `--config=${playwrightConfig}`,
          `--project=${viewportName}`,
          '--reporter=json',
        ];

        await execFileAsync('npx', args, {
          cwd: HARNESS_ROOT,
          env,
          timeout: 120_000,
        });
      } catch (err: unknown) {
        // Playwright exits non-zero on test failures — check results file
        const e = err as { code?: number; stderr?: string };
        if (!existsSync(RESULTS_FILE)) {
          exitWithEnvelope(
            formatError('test', ErrorCodes.TEST_FAILED, 'Playwright execution failed', {
              stderr: (e.stderr ?? '').slice(-500),
            }),
          );
        }
      }

      // Read and summarize results
      if (!existsSync(RESULTS_FILE)) {
        exitWithEnvelope(
          formatError('test', ErrorCodes.RESULTS_NOT_FOUND, 'No test results file produced'),
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
