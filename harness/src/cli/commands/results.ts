import path from 'node:path';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import type { Command } from 'commander';
import { ErrorCodes, exitWithEnvelope, formatError, formatSuccess } from '../output.js';

const HARNESS_ROOT = path.resolve(import.meta.dirname ?? '.', '../../..');
const RESULTS_DIR = path.join(HARNESS_ROOT, 'results');

export function registerResultsCommand(program: Command): void {
  program
    .command('results')
    .description('Read the latest test results and artifacts')
    .option('--type <type>', 'Result type: test or screenshots', 'test')
    .action(async (opts: { type: string }) => {
      if (!existsSync(RESULTS_DIR)) {
        exitWithEnvelope(
          formatError('results', ErrorCodes.RESULTS_NOT_FOUND, 'No results directory found'),
        );
      }

      if (opts.type === 'test') {
        const resultsFile = path.join(RESULTS_DIR, 'test-results.json');
        if (!existsSync(resultsFile)) {
          exitWithEnvelope(
            formatError('results', ErrorCodes.RESULTS_NOT_FOUND, 'No test results file found. Run `harness test` first.'),
          );
        }

        const raw = JSON.parse(readFileSync(resultsFile, 'utf-8'));
        const stats = raw.stats ?? {};
        exitWithEnvelope(
          formatSuccess('results', {
            type: 'test',
            stats: {
              expected: stats.expected ?? 0,
              unexpected: stats.unexpected ?? 0,
              flaky: stats.flaky ?? 0,
              skipped: stats.skipped ?? 0,
              duration: stats.duration ?? 0,
            },
            file: resultsFile,
          }),
        );
      }

      if (opts.type === 'screenshots') {
        const files = readdirSync(RESULTS_DIR)
          .filter((f) => f.endsWith('.png'))
          .map((f) => {
            const fullPath = path.join(RESULTS_DIR, f);
            const stat = statSync(fullPath);
            return { name: f, path: fullPath, size: stat.size, modified: stat.mtime.toISOString() };
          })
          .sort((a, b) => b.modified.localeCompare(a.modified));

        if (files.length === 0) {
          exitWithEnvelope(
            formatError('results', ErrorCodes.RESULTS_NOT_FOUND, 'No screenshots found. Run `harness screenshot` first.'),
          );
        }

        exitWithEnvelope(
          formatSuccess('results', {
            type: 'screenshots',
            count: files.length,
            files,
          }),
        );
      }

      exitWithEnvelope(
        formatError('results', ErrorCodes.INVALID_ARGS, `Unknown results type: ${opts.type}`, {
          available: ['test', 'screenshots'],
        }),
      );
    });
}
