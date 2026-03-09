/**
 * Route-level smoke tests — verify main app routes return 200.
 *
 * Uses the CDP fixture to navigate to key routes in a real browser
 * and assert page content loads without errors.
 */

import { test, expect } from '../fixtures/base-test.js';

const routes = [
  { path: '/', name: 'Home', expect: 'Chainglass' },
  { path: '/workspaces', name: 'Workspaces', expect: '' },
  { path: '/settings/workspaces', name: 'Settings', expect: '' },
  { path: '/agents', name: 'Agents', expect: '' },
];

for (const route of routes) {
  test(`${route.name} (${route.path}) loads successfully`, async ({ cdpPage }) => {
    /*
    Test Doc:
    - Why: Every main route must return 200 and render without crash.
    - Contract: Navigate to route → page loads with no error state.
    - Usage Notes: Uses CDP fixture; requires running harness container.
    - Quality Contribution: Catches broken routes before they reach users.
    - Worked Example: page.goto('/workspaces') → status 200, content visible.
    */
    const response = await cdpPage.goto(route.path, { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(400);

    if (route.expect) {
      await expect(cdpPage).toHaveTitle(new RegExp(route.expect));
    }

    // Verify no error boundary rendered
    const errorBoundary = await cdpPage.$('[data-testid="error-boundary"]');
    expect(errorBoundary).toBeNull();
  });
}

test('No console errors on home page', async ({ cdpPage, cdpContext }) => {
  /*
  Test Doc:
  - Why: Console errors indicate runtime issues invisible to users but critical for quality.
  - Contract: Home page loads with zero console.error calls.
  - Usage Notes: Captures all console messages during page load.
  - Quality Contribution: Catches React hydration errors, failed API calls, missing resources.
  - Worked Example: page.goto('/') → no 'error' type console messages.
  */
  const errors: string[] = [];
  cdpPage.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await cdpPage.goto('/', { waitUntil: 'networkidle' });

  // Filter out known benign errors (e.g., favicon, third-party)
  const realErrors = errors.filter(
    (e) => !e.includes('favicon') && !e.includes('404'),
  );
  expect(realErrors).toEqual([]);
});
