import path from 'node:path';
import { mkdirSync } from 'node:fs';
import type { Command } from 'commander';
import { chromium } from '@playwright/test';
import { getWsEndpoint } from '../../cdp/connect.js';
import { DEFAULT_TIMEOUT, DEFAULT_WAIT_UNTIL, WAIT_UNTIL_VALUES, navigateTo } from '../../cdp/navigate.js';
import type { WaitUntilValue } from '../../cdp/navigate.js';
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
    .option('--wait-until <strategy>', `Page load strategy: ${WAIT_UNTIL_VALUES.join(', ')}`, DEFAULT_WAIT_UNTIL)
    .option('--timeout <ms>', 'Navigation timeout in milliseconds', String(DEFAULT_TIMEOUT))
    .option('--delay <ms>', 'Post-navigation delay for React hydration', '2000')
    .action(async (name: string, opts: { viewport: string; url?: string; waitUntil: string; timeout: string; delay: string }) => {
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

      const waitUntil = opts.waitUntil as WaitUntilValue;
      if (!WAIT_UNTIL_VALUES.includes(waitUntil)) {
        exitWithEnvelope(
          formatError('screenshot', ErrorCodes.INVALID_ARGS, `Unknown wait-until strategy: ${waitUntil}`, {
            available: [...WAIT_UNTIL_VALUES],
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
        await navigateTo(page, targetUrl, { waitUntil, timeout: Number(opts.timeout), delay: Number(opts.delay) });

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
