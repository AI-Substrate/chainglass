import path from 'node:path';
import { mkdirSync } from 'node:fs';
import type { Command } from 'commander';
import { chromium } from '@playwright/test';
import { getWsEndpoint } from '../../cdp/connect.js';
import { HARNESS_VIEWPORTS, DEFAULT_VIEWPORT, type ViewportName } from '../../viewports/devices.js';
import { ErrorCodes, exitWithEnvelope, formatError, formatSuccess } from '../output.js';

const HARNESS_ROOT = path.resolve(import.meta.dirname ?? '.', '../../..');
const RESULTS_DIR = path.join(HARNESS_ROOT, 'results');

export function registerScreenshotCommand(program: Command): void {
  program
    .command('screenshot <name>')
    .description('Capture a screenshot via CDP and save to results/')
    .option('--viewport <name>', 'Viewport to use', DEFAULT_VIEWPORT)
    .option('--url <url>', 'URL to navigate to', 'http://127.0.0.1:3000')
    .action(async (name: string, opts: { viewport: string; url: string }) => {
      const viewportName = opts.viewport as ViewportName;
      if (!(viewportName in HARNESS_VIEWPORTS)) {
        exitWithEnvelope(
          formatError('screenshot', ErrorCodes.INVALID_ARGS, `Unknown viewport: ${opts.viewport}`, {
            available: Object.keys(HARNESS_VIEWPORTS),
          }),
        );
      }

      const viewport = HARNESS_VIEWPORTS[viewportName];
      let browser;

      try {
        const wsEndpoint = await getWsEndpoint();
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
        await page.goto(opts.url, { waitUntil: 'networkidle' });

        mkdirSync(RESULTS_DIR, { recursive: true });
        const filename = `${name}-${viewportName}.png`;
        const filePath = path.join(RESULTS_DIR, filename);
        await page.screenshot({ path: filePath, fullPage: false });

        await context.close();
        await browser!.close();

        exitWithEnvelope(
          formatSuccess('screenshot', {
            name,
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
