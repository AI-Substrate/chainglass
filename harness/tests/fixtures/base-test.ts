/**
 * Custom Playwright test fixture for CDP connection.
 *
 * Connects to the pre-running Chromium inside the Docker container via
 * connectOverCDP. Tests import { test, expect } from this file instead of
 * '@playwright/test' directly.
 *
 * The fixture:
 *  1. Fetches the WebSocket debugger URL from CDP's /json/version endpoint
 *  2. Connects via chromium.connectOverCDP()
 *  3. Creates a new browser context per test (with the project's viewport)
 *  4. Provides a fresh page to each test
 *  5. Cleans up the context after the test
 */

import { type BrowserContext, type Page, chromium, test as base } from '@playwright/test';
import { computePorts } from '../../src/ports/allocator.js';

export { expect } from '@playwright/test';

const ports = computePorts();
const CDP_ENDPOINT = process.env.HARNESS_CDP_URL ?? `http://127.0.0.1:${ports.cdp}`;

async function getWsEndpoint(): Promise<string> {
  const response = await fetch(`${CDP_ENDPOINT}/json/version`);
  if (!response.ok) {
    throw new Error(`CDP endpoint not available at ${CDP_ENDPOINT}: ${response.status}`);
  }
  const data = (await response.json()) as { webSocketDebuggerUrl: string };
  return data.webSocketDebuggerUrl;
}

export const test = base.extend<{ cdpContext: BrowserContext; cdpPage: Page }>({
  // Override the default browser fixture to connect via CDP
  cdpContext: async ({ viewport }, use) => {
    const wsEndpoint = await getWsEndpoint();
    const browser = await chromium.connectOverCDP(wsEndpoint);

    const context = await browser.newContext({
      viewport: viewport ?? { width: 1440, height: 900 },
    });

    await use(context);

    await context.close();
    await browser.close();
  },

  cdpPage: async ({ cdpContext }, use) => {
    const page = await cdpContext.newPage();
    await use(page);
    // Page is closed when context is closed
  },
});
