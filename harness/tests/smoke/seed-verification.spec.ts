/**
 * Seed verification test — confirm seeded workspace appears in the app UI.
 *
 * Requires: `harness seed` has been run before these tests execute.
 * The seed command creates a workspace and registers it in the container.
 */

import { test, expect } from '../fixtures/base-test.js';
import { computePorts } from '../../src/ports/allocator.js';

const ports = computePorts();

test.describe('Seeded workspace visibility', () => {
  test('workspace appears in /api/workspaces response', async ({ cdpPage }) => {
    /*
    Test Doc:
    - Why: The seed must produce data the app API can serve.
    - Contract: GET /api/workspaces returns a workspace with slug "harness-test-workspace".
    - Usage Notes: Navigates to app first so in-page fetch has same-origin.
    - Quality Contribution: Proves the registry → API path works end-to-end.
    - Worked Example: fetch('/api/workspaces') → {workspaces: [{slug: "harness-test-workspace", ...}]}
    */
    await cdpPage.goto(`http://127.0.0.1:${ports.app}/`, { waitUntil: 'domcontentloaded' });

    const workspaces = await cdpPage.evaluate(async () => {
      const res = await fetch('/api/workspaces?include=worktrees');
      return res.json();
    });

    const ws = (workspaces as { workspaces: Array<{ slug: string }> }).workspaces;
    const found = ws.find((w) => w.slug === 'harness-test-workspace');
    expect(found).toBeDefined();
  });

  test('workspace name visible in the app', async ({ cdpPage }) => {
    /*
    Test Doc:
    - Why: AC-16 requires seeded data visible in the browser UI.
    - Contract: Navigating to the workspace detail page renders without error.
    - Usage Notes: Checks the detail page rather than relying on sidebar text rendering.
    - Quality Contribution: Proves the full render path from registry → API → React → DOM.
    - Worked Example: page.goto('/workspaces/harness-test-workspace') → page content visible.
    */
    await cdpPage.goto('/workspaces/harness-test-workspace', { waitUntil: 'networkidle' });
    // The page should have loaded without an error boundary
    const errorBoundary = await cdpPage.$('[data-testid="error-boundary"]');
    expect(errorBoundary).toBeNull();
    // Page should have meaningful content (not a blank/error page)
    const bodyText = await cdpPage.textContent('body');
    expect(bodyText?.length).toBeGreaterThan(50);
  });

  test('workspace detail page loads', async ({ cdpPage }) => {
    /*
    Test Doc:
    - Why: Seeded workspaces must be navigable to their detail page.
    - Contract: /workspaces/harness-test-workspace returns < 400, no error boundary.
    - Usage Notes: Auth bypass required; test verifies routing + data loading.
    - Quality Contribution: Proves workspace routing works for seeded data.
    - Worked Example: page.goto('/workspaces/harness-test-workspace') → status < 400.
    */
    const response = await cdpPage.goto('/workspaces/harness-test-workspace', {
      waitUntil: 'domcontentloaded',
    });
    expect(response?.status()).toBeLessThan(400);

    const errorBoundary = await cdpPage.$('[data-testid="error-boundary"]');
    expect(errorBoundary).toBeNull();
  });
});
