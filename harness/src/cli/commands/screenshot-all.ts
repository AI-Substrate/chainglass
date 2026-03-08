/**
 * Screenshot-all command — capture screenshots at multiple viewports in one call.
 *
 * Connects once via CDP, iterates over viewports, saves each screenshot,
 * and returns an array of results.
 */

import path from 'node:path';
import { mkdirSync } from 'node:fs';
import type { Command } from 'commander';
import { chromium } from '@playwright/test';
import { getWsEndpoint } from '../../cdp/connect.js';
import { computePorts } from '../../ports/allocator.js';
import { HARNESS_VIEWPORTS, type ViewportName } from '../../viewports/devices.js';
import { ErrorCodes, exitWithEnvelope, formatError, formatSuccess } from '../output.js';

const HARNESS_ROOT = path.resolve(import.meta.dirname ?? '.', '../../..');
const RESULTS_DIR = path.join(HARNESS_ROOT, 'results');

export function registerScreenshotAllCommand(program: Command): void {
  program
    .command('screenshot-all <name>')
    .description('Capture screenshots at multiple viewports in one command')
    .option('--viewports <list>', 'Comma-separated viewport names (default: all)')
    .option('--url <url>', 'URL to navigate to')
    .action(async (name: string, opts: { viewports?: string; url?: string }) => {
      const safeName = name.replace(/[^a-zA-Z0-9._-]+/g, '-');
      if (safeName !== name || safeName.includes('..')) {
        exitWithEnvelope(
          formatError('screenshot-all', ErrorCodes.INVALID_ARGS, 'Name contains invalid characters. Use only alphanumeric, dot, dash, underscore.'),
        );
      }

      // Resolve viewport list
      const allViewports = Object.keys(HARNESS_VIEWPORTS) as ViewportName[];
      let viewports: ViewportName[];
      if (opts.viewports) {
        const requested = opts.viewports.split(',').map((v) => v.trim());
        const invalid = requested.filter((v) => !(v in HARNESS_VIEWPORTS));
        if (invalid.length > 0) {
          exitWithEnvelope(
            formatError('screenshot-all', ErrorCodes.INVALID_ARGS, `Unknown viewport(s): ${invalid.join(', ')}`, {
              available: allViewports,
            }),
          );
        }
        viewports = requested as ViewportName[];
      } else {
        viewports = allViewports;
      }

      const ports = computePorts();
      const targetUrl = opts.url ?? `http://127.0.0.1:${ports.app}`;
      let browser;

      try {
        const wsEndpoint = await getWsEndpoint(`http://127.0.0.1:${ports.cdp}`);
        browser = await chromium.connectOverCDP(wsEndpoint);
      } catch {
        exitWithEnvelope(
          formatError('screenshot-all', ErrorCodes.CDP_UNAVAILABLE, 'Cannot connect to CDP'),
        );
      }

      try {
        mkdirSync(RESULTS_DIR, { recursive: true });
        const results: Array<{ name: string; viewport: string; path: string; filename: string }> = [];

        for (const viewportName of viewports) {
          const viewport = HARNESS_VIEWPORTS[viewportName];
          const context = await browser!.newContext({
            viewport: { width: viewport.width, height: viewport.height },
          });
          const page = await context.newPage();
          await page.goto(targetUrl, { waitUntil: 'networkidle' });

          const filename = `${safeName}-${viewportName}.png`;
          const filePath = path.resolve(RESULTS_DIR, filename);

          if (!filePath.startsWith(path.resolve(RESULTS_DIR) + path.sep)) {
            exitWithEnvelope(
              formatError('screenshot-all', ErrorCodes.INVALID_ARGS, 'Screenshot path escaped results directory'),
            );
          }

          await page.screenshot({ path: filePath, fullPage: false });
          await context.close();

          results.push({ name: safeName, viewport: viewportName, path: filePath, filename });
        }

        await browser!.close();

        exitWithEnvelope(
          formatSuccess('screenshot-all', {
            name: safeName,
            viewports: viewports,
            count: results.length,
            screenshots: results,
          }),
        );
      } catch (err: unknown) {
        await browser?.close();
        exitWithEnvelope(
          formatError('screenshot-all', ErrorCodes.SCREENSHOT_FAILED, 'Multi-viewport screenshot failed', {
            message: (err as Error).message,
          }),
        );
      }
    });
}
