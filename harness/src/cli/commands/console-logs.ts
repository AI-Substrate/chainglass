/**
 * Console logs command — capture browser console messages via CDP.
 *
 * Connects to the harness browser via CDP, navigates to a URL,
 * collects console messages, and returns them as structured JSON.
 */

import type { Command } from 'commander';
import { chromium } from '@playwright/test';
import { getWsEndpoint } from '../../cdp/connect.js';
import { computePorts } from '../../ports/allocator.js';
import { ErrorCodes, exitWithEnvelope, formatError, formatSuccess } from '../output.js';

type FilterLevel = 'all' | 'errors' | 'warnings';

interface ConsoleMessage {
  level: string;
  text: string;
  url: string;
  timestamp: string;
}

export function registerConsoleLogsCommand(program: Command): void {
  program
    .command('console-logs')
    .description('Capture browser console messages via CDP')
    .option('--filter <level>', 'Filter: all, errors, warnings', 'all')
    .option('--url <path>', 'URL path to navigate to', '/')
    .option('--wait <seconds>', 'Seconds to wait for messages after load', '5')
    .action(async (opts: { filter: string; url: string; wait: string }) => {
      const filter = opts.filter as FilterLevel;
      if (!['all', 'errors', 'warnings'].includes(filter)) {
        exitWithEnvelope(
          formatError('console-logs', ErrorCodes.INVALID_ARGS, `Unknown filter: ${filter}`, {
            available: ['all', 'errors', 'warnings'],
          }),
        );
      }

      const waitSeconds = Number.parseInt(opts.wait, 10);
      if (Number.isNaN(waitSeconds) || waitSeconds < 1 || waitSeconds > 60) {
        exitWithEnvelope(
          formatError('console-logs', ErrorCodes.INVALID_ARGS, 'Wait must be 1-60 seconds'),
        );
      }

      const ports = computePorts();
      const targetUrl = `http://127.0.0.1:${ports.app}${opts.url.startsWith('/') ? opts.url : `/${opts.url}`}`;
      let browser;

      try {
        const wsEndpoint = await getWsEndpoint(`http://127.0.0.1:${ports.cdp}`);
        browser = await chromium.connectOverCDP(wsEndpoint);
      } catch {
        exitWithEnvelope(
          formatError('console-logs', ErrorCodes.CDP_UNAVAILABLE, 'Cannot connect to CDP'),
        );
      }

      try {
        const context = await browser!.newContext();
        const page = await context.newPage();

        const messages: ConsoleMessage[] = [];
        page.on('console', (msg) => {
          messages.push({
            level: msg.type(),
            text: msg.text(),
            url: msg.location().url,
            timestamp: new Date().toISOString(),
          });
        });

        await page.goto(targetUrl, { waitUntil: 'networkidle' });

        // Wait additional time for late-arriving messages
        await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));

        await context.close();
        await browser!.close();

        // Apply filter
        const filtered = filter === 'all'
          ? messages
          : filter === 'errors'
            ? messages.filter((m) => m.level === 'error')
            : messages.filter((m) => m.level === 'warning');

        exitWithEnvelope(
          formatSuccess('console-logs', {
            url: targetUrl,
            filter,
            waitSeconds,
            total: messages.length,
            filtered: filtered.length,
            messages: filtered,
          }),
        );
      } catch (err: unknown) {
        await browser?.close();
        exitWithEnvelope(
          formatError('console-logs', ErrorCodes.CONSOLE_LOGS_FAILED, 'Console log capture failed', {
            message: (err as Error).message,
          }),
        );
      }
    });
}
