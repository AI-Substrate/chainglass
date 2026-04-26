/**
 * check-route command — unified route validation via CDP.
 *
 * Navigates to a URL, optionally waits for a selector/text, captures
 * console messages and screenshots, and returns a pass/fail/degraded verdict.
 *
 * Plan 076 FX004-2 / Workshop 014.
 */

import path from 'node:path';
import { mkdirSync } from 'node:fs';
import type { Command } from 'commander';
import { chromium } from '@playwright/test';
import { getWsEndpoint } from '../../cdp/connect.js';
import { DEFAULT_TIMEOUT, DEFAULT_WAIT_UNTIL, WAIT_UNTIL_VALUES, navigateTo } from '../../cdp/navigate.js';
import type { WaitUntilValue } from '../../cdp/navigate.js';
import { normalizeUrl, resolveWorkspace, defaultWorktree } from '../../cdp/url-normalizer.js';
import { computePorts } from '../../ports/allocator.js';
import { HARNESS_VIEWPORTS, DEFAULT_VIEWPORT, type ViewportName } from '../../viewports/devices.js';
import { ErrorCodes, exitWithEnvelope, formatError, formatSuccess } from '../output.js';

const HARNESS_ROOT = path.resolve(import.meta.dirname ?? '.', '../../..');
const RESULTS_DIR = path.join(HARNESS_ROOT, 'results');

interface ConsoleMessage {
  level: string;
  text: string;
  timestamp: string;
}

interface CheckRouteResult {
  url: string;
  httpStatus: number;
  title: string;
  finalUrl: string;
  viewport: string;
  verdict: 'pass' | 'fail' | 'degraded';
  checks: {
    navigation: { ok: boolean; status: number };
    waitFor: { ok: boolean; selector?: string; text?: string } | null;
    consoleErrors: { ok: boolean; count: number; messages: ConsoleMessage[] } | null;
    consoleWarnings: { ok: boolean; count: number; messages: ConsoleMessage[] } | null;
    screenshot: { ok: boolean; path: string } | null;
  };
  durationMs: number;
}

async function runCheck(
  wsEndpoint: string,
  targetUrl: string,
  viewportName: ViewportName,
  opts: {
    waitFor?: string;
    waitForText?: string;
    consoleErrors: boolean;
    consoleWarnings: boolean;
    screenshotName?: string;
    waitUntil: WaitUntilValue;
    timeout: number;
    delay: number;
  },
): Promise<CheckRouteResult> {
  const start = Date.now();
  const viewport = HARNESS_VIEWPORTS[viewportName];

  const browser = await chromium.connectOverCDP(wsEndpoint);
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
  });
  const page = await context.newPage();

  const consoleMessages: ConsoleMessage[] = [];
  page.on('console', (msg) => {
    consoleMessages.push({
      level: msg.type(),
      text: msg.text(),
      timestamp: new Date().toISOString(),
    });
  });

  // Navigate
  let httpStatus = 0;
  try {
    const response = await page.goto(targetUrl, {
      waitUntil: opts.waitUntil,
      timeout: opts.timeout,
    });
    httpStatus = response?.status() ?? 0;
  } catch {
    httpStatus = 0;
  }

  if (opts.delay > 0) {
    await page.waitForTimeout(opts.delay);
  }

  const navigationOk = httpStatus >= 200 && httpStatus < 400;

  // Wait-for selector
  let waitForResult: CheckRouteResult['checks']['waitFor'] = null;
  if (opts.waitFor) {
    try {
      await page.waitForSelector(opts.waitFor, { state: 'visible', timeout: opts.timeout });
      waitForResult = { ok: true, selector: opts.waitFor };
    } catch {
      waitForResult = { ok: false, selector: opts.waitFor };
    }
  }

  // Wait-for text
  if (opts.waitForText) {
    try {
      await page.getByText(opts.waitForText).first().waitFor({ state: 'visible', timeout: opts.timeout });
      waitForResult = { ok: true, text: opts.waitForText };
    } catch {
      waitForResult = { ok: false, text: opts.waitForText };
    }
  }

  // Console checks
  const errors = consoleMessages.filter((m) => m.level === 'error');
  const warnings = consoleMessages.filter((m) => m.level === 'warning');

  const consoleErrorsResult: CheckRouteResult['checks']['consoleErrors'] = opts.consoleErrors
    ? { ok: errors.length === 0, count: errors.length, messages: errors }
    : null;

  const consoleWarningsResult: CheckRouteResult['checks']['consoleWarnings'] = opts.consoleWarnings
    ? { ok: warnings.length === 0, count: warnings.length, messages: warnings }
    : null;

  // Screenshot
  let screenshotResult: CheckRouteResult['checks']['screenshot'] = null;
  if (opts.screenshotName) {
    try {
      mkdirSync(RESULTS_DIR, { recursive: true });
      const filename = `${opts.screenshotName}-${viewportName}.png`;
      const filePath = path.resolve(RESULTS_DIR, filename);
      await page.screenshot({ path: filePath, fullPage: false });
      screenshotResult = { ok: true, path: filePath };
    } catch {
      screenshotResult = { ok: false, path: '' };
    }
  }

  const title = await page.title().catch(() => '');
  const finalUrl = page.url();

  await context.close();
  await browser.close();

  // Compute verdict
  let verdict: CheckRouteResult['verdict'] = 'pass';
  if (!navigationOk) verdict = 'fail';
  else if (waitForResult && !waitForResult.ok) verdict = 'fail';
  else if (consoleErrorsResult && !consoleErrorsResult.ok) verdict = 'fail';
  else if (consoleWarningsResult && !consoleWarningsResult.ok) verdict = 'degraded';

  return {
    url: targetUrl,
    httpStatus,
    title,
    finalUrl,
    viewport: viewportName,
    verdict,
    checks: {
      navigation: { ok: navigationOk, status: httpStatus },
      waitFor: waitForResult,
      consoleErrors: consoleErrorsResult,
      consoleWarnings: consoleWarningsResult,
      screenshot: screenshotResult,
    },
    durationMs: Date.now() - start,
  };
}

export function registerCheckRouteCommand(program: Command): void {
  program
    .command('check-route <path>')
    .description('Validate a route: navigate, check errors, capture evidence, return verdict')
    .option('--workspace <slug>', 'Workspace slug (auto-detected if omitted)')
    .option('--worktree <path>', 'Worktree path inside container')
    .option('--screenshot <name>', 'Capture screenshot with this name')
    .option('--console-errors', 'Fail if console errors present', false)
    .option('--console-warnings', 'Include warnings in check', false)
    .option('--wait-for <selector>', 'CSS selector to wait for')
    .option('--wait-for-text <text>', 'Visible text to wait for')
    .option('--viewport <name>', 'Viewport for check', DEFAULT_VIEWPORT)
    .option('--viewports <list>', 'Comma-separated viewports (runs all)')
    .option('--timeout <ms>', 'Navigation + wait timeout', String(DEFAULT_TIMEOUT))
    .option('--delay <ms>', 'Post-navigation hydration delay', '2000')
    .option('--wait-until <strategy>', `Page load strategy: ${WAIT_UNTIL_VALUES.join(', ')}`, DEFAULT_WAIT_UNTIL)
    .action(async (routePath: string, opts: {
      workspace?: string;
      worktree?: string;
      screenshot?: string;
      consoleErrors: boolean;
      consoleWarnings: boolean;
      waitFor?: string;
      waitForText?: string;
      viewport: string;
      viewports?: string;
      timeout: string;
      delay: string;
      waitUntil: string;
    }) => {
      // Validate wait-until
      const waitUntil = opts.waitUntil as WaitUntilValue;
      if (!WAIT_UNTIL_VALUES.includes(waitUntil)) {
        exitWithEnvelope(
          formatError('check-route', ErrorCodes.INVALID_ARGS, `Unknown wait-until strategy: ${waitUntil}`, {
            available: [...WAIT_UNTIL_VALUES],
          }),
        );
      }

      // Resolve viewports
      const allViewports = Object.keys(HARNESS_VIEWPORTS) as ViewportName[];
      let viewports: ViewportName[];
      if (opts.viewports) {
        const requested = opts.viewports.split(',').map((v) => v.trim());
        const invalid = requested.filter((v) => !(v in HARNESS_VIEWPORTS));
        if (invalid.length > 0) {
          exitWithEnvelope(
            formatError('check-route', ErrorCodes.INVALID_ARGS, `Unknown viewport(s): ${invalid.join(', ')}`, {
              available: allViewports,
            }),
          );
        }
        viewports = requested as ViewportName[];
      } else {
        viewports = [opts.viewport as ViewportName];
        if (!(viewports[0] in HARNESS_VIEWPORTS)) {
          exitWithEnvelope(
            formatError('check-route', ErrorCodes.INVALID_ARGS, `Unknown viewport: ${opts.viewport}`, {
              available: allViewports,
            }),
          );
        }
      }

      // Sanitize screenshot name
      if (opts.screenshot) {
        const safe = opts.screenshot.replace(/[^a-zA-Z0-9._-]+/g, '-');
        if (safe !== opts.screenshot || safe.includes('..')) {
          exitWithEnvelope(
            formatError('check-route', ErrorCodes.INVALID_ARGS, 'Screenshot name contains invalid characters'),
          );
        }
      }

      // Normalize URL
      const ports = computePorts();
      const workspace = resolveWorkspace(opts.workspace);
      const worktree = opts.worktree ?? defaultWorktree(workspace);
      const targetUrl = normalizeUrl(routePath, {
        workspace,
        worktree,
        port: ports.app,
      });

      // Get CDP endpoint
      let wsEndpoint: string;
      try {
        wsEndpoint = await getWsEndpoint(`http://127.0.0.1:${ports.cdp}`);
      } catch {
        exitWithEnvelope(
          formatError('check-route', ErrorCodes.CDP_UNAVAILABLE, 'Cannot connect to CDP'),
        );
        return;
      }

      const checkOpts = {
        waitFor: opts.waitFor,
        waitForText: opts.waitForText,
        consoleErrors: opts.consoleErrors,
        consoleWarnings: opts.consoleWarnings,
        screenshotName: opts.screenshot,
        waitUntil,
        timeout: Number(opts.timeout),
        delay: Number(opts.delay),
      };

      try {
        if (viewports.length === 1) {
          // Single viewport
          const result = await runCheck(wsEndpoint, targetUrl, viewports[0], checkOpts);

          const status = result.verdict === 'fail' ? 'error' : 'ok';
          const errorDetail = result.verdict === 'fail'
            ? {
                code: result.checks.waitFor && !result.checks.waitFor.ok
                  ? ErrorCodes.ROUTE_WAIT_FOR_TIMEOUT
                  : result.checks.consoleErrors && !result.checks.consoleErrors.ok
                    ? ErrorCodes.ROUTE_CONSOLE_ERRORS
                    : ErrorCodes.ROUTE_CHECK_FAILED,
                message: `Route check ${result.verdict}: ${targetUrl}`,
              }
            : undefined;

          exitWithEnvelope({
            command: 'check-route',
            status,
            timestamp: new Date().toISOString(),
            data: result,
            error: errorDetail,
          });
        } else {
          // Multi-viewport
          const results: CheckRouteResult[] = [];
          for (const vp of viewports) {
            const result = await runCheck(wsEndpoint, targetUrl, vp, checkOpts);
            results.push(result);
          }

          const overallVerdict = results.some((r) => r.verdict === 'fail')
            ? 'fail'
            : results.some((r) => r.verdict === 'degraded')
              ? 'degraded'
              : 'pass';

          const status = overallVerdict === 'fail' ? 'error' : 'ok';

          exitWithEnvelope({
            command: 'check-route',
            status,
            timestamp: new Date().toISOString(),
            data: { results, overallVerdict },
          });
        }
      } catch (err: unknown) {
        exitWithEnvelope(
          formatError('check-route', ErrorCodes.ROUTE_CHECK_FAILED, 'Route check failed', {
            message: (err as Error).message,
          }),
        );
      }
    });
}
