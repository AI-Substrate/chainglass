/**
 * Playwright configuration for Chainglass Harness.
 *
 * Key design: Tests connect to a pre-running Chromium instance inside the Docker
 * container via CDP (Chrome DevTools Protocol) on port 9222. This is NOT the default
 * Playwright browser launcher — we use a custom fixture (base-test.ts) that calls
 * connectOverCDP. The config does NOT use connectOptions (which is for Playwright
 * Server, not CDP).
 *
 * Three viewport projects: desktop, tablet, mobile.
 * Tests run from the HOST against the containerized app on localhost:3000.
 */

import { defineConfig } from '@playwright/test';
import { HARNESS_VIEWPORTS } from './src/viewports/devices.js';

const APP_URL = process.env.HARNESS_APP_URL ?? 'http://localhost:3100';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',

  timeout: 30_000,
  expect: { timeout: 10_000 },

  // Harness tests run sequentially — single shared browser via CDP
  fullyParallel: false,
  workers: 1,

  // Output
  outputDir: './results/test-output',
  reporter: [
    ['list'],
    ['json', { outputFile: './results/test-results.json' }],
  ],

  use: {
    baseURL: APP_URL,
    // Browser connection handled by custom fixture (base-test.ts) via connectOverCDP
    // Do NOT set connectOptions here — that's for Playwright Server, not CDP
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'desktop',
      use: {
        viewport: {
          width: HARNESS_VIEWPORTS['desktop-lg'].width,
          height: HARNESS_VIEWPORTS['desktop-lg'].height,
        },
      },
    },
    {
      name: 'tablet',
      use: {
        viewport: {
          width: HARNESS_VIEWPORTS.tablet.width,
          height: HARNESS_VIEWPORTS.tablet.height,
        },
      },
    },
    {
      name: 'mobile',
      use: {
        viewport: {
          width: HARNESS_VIEWPORTS.mobile.width,
          height: HARNESS_VIEWPORTS.mobile.height,
        },
      },
    },
  ],
});
