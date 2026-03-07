import path from 'node:path';
import { mkdirSync } from 'node:fs';
import type { Command } from 'commander';
import { chromium } from '@playwright/test';
import { getWsEndpoint } from '../../cdp/connect.js';
import { computePorts } from '../../ports/allocator.js';
import { HARNESS_VIEWPORTS, DEFAULT_VIEWPORT, type ViewportName } from '../../viewports/devices.js';
import { ErrorCodes, exitWithEnvelope, formatError, formatSuccess } from '../output.js';

const HARNESS_ROOT = path.resolve(import.meta.dirname ?? '.', '../../..');
const RESULTS_DIR = path.join(HARNESS_ROOT, 'results');

export function registerScreenshotCommand(program: Command): void {
  program
    .command('screenshot <name>')
    .description('Capture a screenshot via CDP and save to results/')
    .option('--viewport <name>', 'Viewport to use', DEFAULT_VIEWPORT)
    .option('--url <url>', 'URL to navigate to')
    .action(async (name: string, opts: { viewport: string; url?: string }) => {
      // FT-003: Sanitize name to prevent path traversal
      const safeName = name.replace(/[^a-zA-Z0-9._-]+/g, '-');
      if (safeName !== name || safeName.includes('..')) {
        exitWithEnvelope(
          formatError('screenshot', ErrorCodes.INVALID_ARGS, 'Screenshot name contains invalid characters. Use only alphanumeric, dot, dash, underscore.'),
        );
      }

      const viewportName = opts.viewport as ViewportName;
      if (!(viewportName in HARNESS_VIEWPORTS)) {
        exitWithEnvelope(
          formatError('screenshot', ErrorCodes.INVALID_ARGS, `Unknown viewport: ${opts.viewport}`, {
            available: Object.keys(HARNESS_VIEWPORTS),
          }),
        );
      }

      const ports = computePorts();
      const targetUrl = opts.url ?? `http://127.0.0.1:${ports.app}`;
      const viewport = HARNESS_VIEWPORTS[viewportName];
      let browser;

      try {
        const wsEndpoint = await getWsEndpoint(`http://127.0.0.1:${ports.cdp}`);
        browser = await chromium.connectOverCDP(wsEndpoint);
      } catch {
        exitWithEnvelope(
          formatError('screenshot', ErrorCodes.CDP_UNAVAILABLE, 'Cannot connect to CDP'),
        );
      }

      try {
        const context = await browser!.newContext({
          viewport: { width: viewport.width, height: viewport.height },
        });
        const page = await context.newPage();
        await page.goto(targetUrl, { waitUntil: 'networkidle' });

        mkdirSync(RESULTS_DIR, { recursive: true });
        const filename = `${safeName}-${viewportName}.png`;
        const filePath = path.resolve(RESULTS_DIR, filename);

        // Final guard: resolved path must stay under RESULTS_DIR
        if (!filePath.startsWith(path.resolve(RESULTS_DIR) + path.sep)) {
          exitWithEnvelope(
            formatError('screenshot', ErrorCodes.INVALID_ARGS, 'Screenshot path escaped results directory'),
          );
        }

        await page.screenshot({ path: filePath, fullPage: false });

        await context.close();
        await browser!.close();

        exitWithEnvelope(
          formatSuccess('screenshot', {
            name: safeName,
            viewport: viewportName,
            path: filePath,
            filename,
          }),
        );
      } catch (err: unknown) {
        await browser?.close();
        exitWithEnvelope(
          formatError('screenshot', ErrorCodes.SCREENSHOT_FAILED, 'Screenshot capture failed', {
            message: (err as Error).message,
          }),
        );
      }
    });
}
