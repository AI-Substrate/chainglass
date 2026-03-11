/**
 * Harness Integration Test: CDP Connection
 *
 * Full TDD — this test was written before Chromium was launched in the container.
 * Validates: CDP endpoint on :9222 responds, browser connects, page loads, screenshot captured.
 * Does NOT run in `just fft`.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { describe, expect, it } from 'vitest';

const CDP_ENDPOINT = process.env.HARNESS_CDP_URL ?? 'http://localhost:9222';
const APP_URL = process.env.HARNESS_APP_URL ?? 'http://localhost:3000';
const RESULTS_DIR = join(import.meta.dirname, '../../results');

describe('Harness: CDP Integration', () => {
  it('CDP endpoint responds with version info', async () => {
    /*
    Test Doc:
    - Why: Verify the host-facing CDP endpoint is alive before deeper browser checks run.
    - Contract: GET /json/version returns 200 with Browser and webSocketDebuggerUrl fields.
    - Usage Notes: Query the published host port (`:9222`), not Chromium's internal loopback-only port.
    - Quality Contribution: Catches broken CDP exposure and proxy regressions before Playwright connection attempts.
    - Worked Example: GET http://localhost:9222/json/version -> {"Browser":"Chrome/...","webSocketDebuggerUrl":"ws://..."}.
    */
    const response = await fetch(`${CDP_ENDPOINT}/json/version`);
    expect(response.status).toBe(200);
    const data = (await response.json()) as { Browser: string; webSocketDebuggerUrl: string };
    expect(data.Browser).toBeDefined();
    expect(data.webSocketDebuggerUrl).toBeDefined();
  }, 10_000);

  it('CDP lists available targets', async () => {
    /*
    Test Doc:
    - Why: Verify the harness exposes the standard CDP target listing endpoint expected by browser tooling.
    - Contract: GET /json/list returns 200 and a JSON array of targets.
    - Usage Notes: This should stay lightweight and not depend on a pre-opened page target.
    - Quality Contribution: Catches partially-working CDP setups where version responds but target enumeration fails.
    - Worked Example: GET http://localhost:9222/json/list -> [] or [{"type":"page",...}].
    */
    const response = await fetch(`${CDP_ENDPOINT}/json/list`);
    expect(response.status).toBe(200);
    const targets = (await response.json()) as Array<{ type: string }>;
    expect(Array.isArray(targets)).toBe(true);
  }, 10_000);

  it('Playwright connects via CDP and opens a page', async () => {
    /*
    Test Doc:
    - Why: Prove the host can attach to the shared browser and browse the running app end-to-end.
    - Contract: connectOverCDP(wsEndpoint) succeeds and a new page can load the app with HTTP 200.
    - Usage Notes: Fetch the websocket endpoint from /json/version rather than hard-coding it.
    - Quality Contribution: Catches regressions in proxying, browser startup, and shared-context Playwright wiring.
    - Worked Example: connectOverCDP(...) -> page.goto(http://localhost:3000) -> 200.
    */
    const versionRes = await fetch(`${CDP_ENDPOINT}/json/version`);
    const { webSocketDebuggerUrl } = (await versionRes.json()) as {
      webSocketDebuggerUrl: string;
    };

    const browser = await chromium.connectOverCDP(webSocketDebuggerUrl);
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();

      const response = await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
      expect(response?.status()).toBe(200);

      await context.close();
    } finally {
      await browser.close();
    }
  }, 30_000);

  it('captures screenshot to results directory', async () => {
    /*
    Test Doc:
    - Why: Verify the harness can produce durable visual evidence from the shared CDP browser.
    - Contract: A connected CDP page can save a PNG into harness/results and the file exists afterward.
    - Usage Notes: Results are written under harness/results so the artifact survives the test process.
    - Quality Contribution: Catches filesystem, screenshot, and viewport regressions that plain HTTP checks miss.
    - Worked Example: page.screenshot(...) -> harness/results/cdp-integration-test.png exists.
    */
    const versionRes = await fetch(`${CDP_ENDPOINT}/json/version`);
    const { webSocketDebuggerUrl } = (await versionRes.json()) as {
      webSocketDebuggerUrl: string;
    };

    const browser = await chromium.connectOverCDP(webSocketDebuggerUrl);
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });

      if (!existsSync(RESULTS_DIR)) {
        mkdirSync(RESULTS_DIR, { recursive: true });
      }
      const screenshotPath = join(RESULTS_DIR, 'cdp-integration-test.png');
      await page.screenshot({ path: screenshotPath, fullPage: false });

      expect(existsSync(screenshotPath)).toBe(true);

      await context.close();
    } finally {
      await browser.close();
    }
  }, 30_000);
});
