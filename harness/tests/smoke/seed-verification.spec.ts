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
    - Usage Notes: Uses cdpPage.evaluate(fetch) to avoid CORS issues.
    - Quality Contribution: Proves the registry → API path works end-to-end.
    - Worked Example: fetch('/api/workspaces') → {workspaces: [{slug: "harness-test-workspace", ...}]}
    */
    // Navigate to app first so in-page fetch works (same-origin)
    await cdpPage.goto(`http://127.0.0.1:${ports.app}/`, { waitUntil: 'domcontentloaded' });

    const workspaces = await cdpPage.evaluate(async () => {
      const res = await fetch('/api/workspaces?include=worktrees');
      return res.json();
    });

    const ws = (workspaces as { workspaces: Array<{ slug: string }> }).workspaces;
    const found = ws.find((w) => w.slug === 'harness-test-workspace');
    expect(found).toBeDefined();
  });

  test('workspace link navigable', async ({ cdpPage }) => {
    /*
    Test Doc:
    - Why: Seeded workspaces must be accessible via their URL slug.
    - Contract: /workspaces/harness-test-workspace returns 200 (not 404).
    - Usage Notes: May redirect to login on auth-enabled instances; test with auth bypass.
    - Quality Contribution: Proves workspace routing works for seeded data.
    - Worked Example: page.goto('/workspaces/harness-test-workspace') → status < 400.
    */
    const response = await cdpPage.goto('/workspaces/harness-test-workspace', {
      waitUntil: 'domcontentloaded',
    });
    expect(response?.status()).toBeLessThan(400);
  });
});
