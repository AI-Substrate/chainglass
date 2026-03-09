/**
 * Responsive sidebar tests — verify sidebar behavior across viewports.
 *
 * DYK #3: Mobile sidebar is a Radix UI <Sheet> overlay, not CSS-hidden.
 * Tests check data-state attribute and element presence, not simple visibility.
 *
 * NOTE FOR FUTURE MOBILE UI REFACTOR:
 *   The sidebar component uses:
 *   - useSidebar() hook with openMobile/setOpenMobile state
 *   - data-sidebar="sidebar" attribute on the sidebar element
 *   - SIDEBAR_WIDTH_MOBILE = '18rem' for the Sheet width
 *   - sidebar_state cookie for persistence across sessions
 *   - Desktop: hidden md:block with fixed positioning, smooth transitions
 *   - Mobile: <Sheet> component from Radix with <SheetContent> wrapping children
 *   - Sheet uses data-state="open"/"closed" for visibility
 *   - Trigger: toggleSidebar() calls setOpenMobile on mobile, setOpen on desktop
 *   - Breakpoint: md: at 768px (Tailwind default)
 */

import { test, expect } from '../fixtures/base-test.js';

test.describe('Sidebar responsive behavior', () => {
  test('desktop: sidebar is visible in the layout', async ({ cdpPage, viewport }) => {
    /*
    Test Doc:
    - Why: Desktop users must see the sidebar for navigation.
    - Contract: At desktop viewport (≥768px), sidebar element is visible.
    - Usage Notes: Skips on mobile viewports where sidebar is a Sheet overlay.
    - Quality Contribution: Catches sidebar rendering regressions on desktop.
    - Worked Example: page.locator('[data-sidebar="sidebar"]').isVisible() → true
    */
    test.skip((viewport?.width ?? 1440) < 768, 'Desktop-only test');
    await cdpPage.goto('/', { waitUntil: 'domcontentloaded' });
    const sidebar = cdpPage.locator('[data-sidebar="sidebar"]');
    await expect(sidebar).toBeVisible();
  });

  test('mobile: sidebar is not visible by default', async ({ cdpPage, viewport }) => {
    /*
    Test Doc:
    - Why: Mobile users should see content, not the sidebar, on initial load.
    - Contract: At mobile viewport (<768px), the sidebar Sheet is closed (data-state="closed" or absent).
    - Usage Notes: Uses the Radix Sheet data-state contract, not bounding-box heuristics.
    - Quality Contribution: Catches mobile sidebar stuck-open regressions.
    - Worked Example: Sheet [data-state="open"] count === 0 on initial load.
    */
    test.skip((viewport?.width ?? 1440) >= 768, 'Mobile-only test');
    await cdpPage.goto('/', { waitUntil: 'domcontentloaded' });

    // The mobile sidebar uses a Radix Sheet overlay.
    // When closed: either no [data-state="open"] element, or data-state="closed".
    const openSheet = cdpPage.locator('[role="dialog"][data-state="open"]');
    await expect(openSheet).toHaveCount(0);
  });
});
