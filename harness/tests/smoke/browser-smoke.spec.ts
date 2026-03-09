/**
 * Smoke Playwright Tests — Browser Automation Verification
 *
 * These tests verify the Chainglass app loads correctly through the harness
 * browser (Chromium via CDP). Covers:
 *   - Page load and basic content (T006)
 *   - Multi-context parallel browsing at different viewports (T007)
 *   - Browser console output capture (T008)
 *
 * Run with: npx playwright test --config=playwright.config.ts
 * Requires: Docker container running (`just harness-dev` from repo root)
 */

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { test, expect } from '../fixtures/base-test.js';
import { HARNESS_VIEWPORTS } from '../../src/viewports/devices.js';

const RESULTS_DIR = join(import.meta.dirname, '../../results');

// ─── T006: Smoke — Page Loads ───────────────────────────────────────────────

test.describe('Smoke: Page Load', () => {
  test('app loads and returns 200', async ({ cdpPage, baseURL }) => {
    /*
    Test Doc:
    - Why: Verify the harness browser can reach the running app through the shared CDP browser.
    - Contract: Navigating to the harness base URL returns HTTP 200.
    - Usage Notes: Use the CDP-backed page fixture so the test exercises the same browser agents use.
    - Quality Contribution: Catches app boot and browser attachment failures immediately.
    - Worked Example: page.goto(http://localhost:3000) -> 200.
    */
    const response = await cdpPage.goto(baseURL!, { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
  });

  test('page contains expected HTML structure', async ({ cdpPage, baseURL }) => {
    /*
    Test Doc:
    - Why: Verify the loaded page is a real Next.js document rather than an error shell or blank response.
    - Contract: The rendered markup includes the HTML doctype and Next.js runtime markers.
    - Usage Notes: Read page.content() after navigation completes to assert document-level structure.
    - Quality Contribution: Catches accidental error pages and malformed HTML responses.
    - Worked Example: content() contains "<!DOCTYPE html" and "_next".
    */
    await cdpPage.goto(baseURL!, { waitUntil: 'domcontentloaded' });
    const html = await cdpPage.content();
    expect(html).toContain('<!DOCTYPE html');
    expect(html).toContain('_next');
  });

  test('page title is set', async ({ cdpPage, baseURL }) => {
    /*
    Test Doc:
    - Why: Verify the harness catches regressions in the app's top-level metadata.
    - Contract: The home page title contains the expected product name.
    - Usage Notes: Resolve the browser title after page navigation rather than scraping raw HTML.
    - Quality Contribution: Catches broken metadata, wrong route rendering, and blank-title regressions.
    - Worked Example: title() -> "Chainglass".
    */
    await cdpPage.goto(baseURL!, { waitUntil: 'domcontentloaded' });
    const title = await cdpPage.title();
    expect(title).toContain('Chainglass');
  });

  test('no console errors on page load', async ({ cdpPage, baseURL }) => {
    /*
    Test Doc:
    - Why: Verify the harness surfaces runtime errors that a plain HTTP health check would miss.
    - Contract: Loading the home page produces no critical console error entries.
    - Usage Notes: Wait for page load completion and inspect captured console events instead of sleeping.
    - Quality Contribution: Catches hydration issues, client-side exceptions, and missing asset failures.
    - Worked Example: navigate to "/" -> no console error messages except filtered favicon/404 noise.
    */
    const errors: string[] = [];
    cdpPage.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await cdpPage.goto(baseURL!, { waitUntil: 'load' });
    await cdpPage.waitForLoadState('networkidle');

    // Filter out known non-critical errors (e.g., favicon 404)
    const criticalErrors = errors.filter(
      (e) => !e.includes('favicon') && !e.includes('404'),
    );
    expect(criticalErrors).toEqual([]);
  });

  test('captures screenshot to results directory', async ({ cdpPage, baseURL }, testInfo) => {
    /*
    Test Doc:
    - Why: Verify each configured viewport can produce a durable screenshot artifact for review.
    - Contract: The current project viewport writes a PNG file into harness/results.
    - Usage Notes: Use the Playwright project name in the artifact path so desktop/tablet/mobile evidence is retained separately.
    - Quality Contribution: Catches screenshot pipeline regressions and preserves viewport-specific proof for AC-06.
    - Worked Example: desktop project -> harness/results/smoke-homepage-desktop.png exists.
    */
    await cdpPage.goto(baseURL!, { waitUntil: 'domcontentloaded' });

    if (!existsSync(RESULTS_DIR)) {
      mkdirSync(RESULTS_DIR, { recursive: true });
    }
    const screenshotPath = join(RESULTS_DIR, `smoke-homepage-${testInfo.project.name}.png`);
    await cdpPage.screenshot({ path: screenshotPath, fullPage: false });

    expect(existsSync(screenshotPath)).toBe(true);
  });
});

// ─── T007: Multi-Context Browsing ───────────────────────────────────────────

test.describe('Multi-Context: Parallel Viewports', () => {
  test('opens 2 contexts at different viewports simultaneously', async ({ baseURL }) => {
    /*
    Test Doc:
    - Why: Verify one shared Chromium instance can support concurrent agent browsing contexts.
    - Contract: Two contexts with different viewports can navigate in parallel and retain distinct sizes.
    - Usage Notes: Connect once via CDP, then create separate contexts instead of separate browsers.
    - Quality Contribution: Catches shared-browser instability and viewport isolation regressions.
    - Worked Example: desktop 1440x900 and mobile 375x812 both load "/" with HTTP 200.
    */
    const CDP_ENDPOINT = process.env.HARNESS_CDP_URL ?? 'http://localhost:9222';
    const versionRes = await fetch(`${CDP_ENDPOINT}/json/version`);
    const { webSocketDebuggerUrl } = (await versionRes.json()) as {
      webSocketDebuggerUrl: string;
    };

    const browser = await chromium.connectOverCDP(webSocketDebuggerUrl);

    try {
      // Desktop context
      const desktopCtx = await browser.newContext({
        viewport: {
          width: HARNESS_VIEWPORTS['desktop-lg'].width,
          height: HARNESS_VIEWPORTS['desktop-lg'].height,
        },
      });
      const desktopPage = await desktopCtx.newPage();

      // Mobile context
      const mobileCtx = await browser.newContext({
        viewport: {
          width: HARNESS_VIEWPORTS.mobile.width,
          height: HARNESS_VIEWPORTS.mobile.height,
        },
      });
      const mobilePage = await mobileCtx.newPage();

      // Navigate both simultaneously
      const [desktopRes, mobileRes] = await Promise.all([
        desktopPage.goto(baseURL!, { waitUntil: 'domcontentloaded' }),
        mobilePage.goto(baseURL!, { waitUntil: 'domcontentloaded' }),
      ]);

      expect(desktopRes?.status()).toBe(200);
      expect(mobileRes?.status()).toBe(200);

      // Verify different viewport sizes
      const desktopSize = desktopPage.viewportSize();
      const mobileSize = mobilePage.viewportSize();
      expect(desktopSize?.width).toBe(HARNESS_VIEWPORTS['desktop-lg'].width);
      expect(mobileSize?.width).toBe(HARNESS_VIEWPORTS.mobile.width);

      // Capture screenshots at both viewports
      if (!existsSync(RESULTS_DIR)) {
        mkdirSync(RESULTS_DIR, { recursive: true });
      }
      await Promise.all([
        desktopPage.screenshot({ path: join(RESULTS_DIR, 'multi-desktop.png') }),
        mobilePage.screenshot({ path: join(RESULTS_DIR, 'multi-mobile.png') }),
      ]);

      await desktopCtx.close();
      await mobileCtx.close();
    } finally {
      await browser.close();
    }
  });
});

// ─── T008: Console Output Capture ───────────────────────────────────────────

test.describe('Console: Output Capture', () => {
  test('captures console.log messages via CDP', async ({ cdpPage, baseURL }) => {
    /*
    Test Doc:
    - Why: Verify the harness can observe standard console logging from the page over CDP.
    - Contract: A console.log emitted in-page is surfaced as a Playwright console event of type log.
    - Usage Notes: Wait on the matching console event instead of sleeping after evaluate().
    - Quality Contribution: Catches broken CDP event forwarding and missing console observability.
    - Worked Example: console.log('harness-test-marker') -> console event {type:'log', text:'harness-test-marker'}.
    */
    const markerEvent = cdpPage.waitForEvent('console', {
      predicate: (msg) => msg.type() === 'log' && msg.text() === 'harness-test-marker',
    });

    await cdpPage.goto(baseURL!, { waitUntil: 'domcontentloaded' });
    await cdpPage.evaluate(() => {
      console.log('harness-test-marker');
    });

    const markerMsg = await markerEvent;
    expect(markerMsg.type()).toBe('log');
    expect(markerMsg.text()).toBe('harness-test-marker');
  });

  test('captures console.warn and console.error separately', async ({ cdpPage, baseURL }) => {
    /*
    Test Doc:
    - Why: Verify the harness preserves console severity so agents can distinguish warnings from errors.
    - Contract: console.warn and console.error arrive as separate console events with warning/error types.
    - Usage Notes: Wait for both events explicitly rather than polling arrays or sleeping.
    - Quality Contribution: Catches severity collapsing and event-loss regressions in CDP console capture.
    - Worked Example: console.warn('x') + console.error('y') -> warning event for x and error event for y.
    */
    const warnEvent = cdpPage.waitForEvent('console', {
      predicate: (msg) => msg.type() === 'warning' && msg.text() === 'harness-warn-test',
    });
    const errorEvent = cdpPage.waitForEvent('console', {
      predicate: (msg) => msg.type() === 'error' && msg.text() === 'harness-error-test',
    });

    await cdpPage.goto(baseURL!, { waitUntil: 'domcontentloaded' });

    await cdpPage.evaluate(() => {
      console.warn('harness-warn-test');
      console.error('harness-error-test');
    });

    const [warnMsg, errorMsg] = await Promise.all([warnEvent, errorEvent]);
    expect(warnMsg.type()).toBe('warning');
    expect(errorMsg.type()).toBe('error');
  });
});
