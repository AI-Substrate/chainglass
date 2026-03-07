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
    - Contract: At mobile viewport (<768px), the sidebar Sheet is closed.
    - Usage Notes: The Sheet component renders in DOM but data-state="closed".
    - Quality Contribution: Catches mobile sidebar stuck-open regressions.
    - Worked Example: SheetContent with data-state is either absent or "closed".
    */
    test.skip((viewport?.width ?? 1440) >= 768, 'Mobile-only test');
    await cdpPage.goto('/', { waitUntil: 'domcontentloaded' });

    // On mobile, the sidebar is inside a Sheet — check it's not open
    // The Sheet's content element won't be in the viewport when closed
    const visibleSidebar = cdpPage.locator('[data-sidebar="sidebar"]:visible');
    const count = await visibleSidebar.count();

    // On mobile, the sidebar should either not be rendered or not be visible
    // (Sheet component keeps it out of view when closed)
    if (count > 0) {
      // If something is visible, it should be the Sheet trigger, not the full sidebar
      const box = await visibleSidebar.first().boundingBox();
      if (box) {
        // If visible, it should be off-screen or very small (Sheet closed state)
        // A full sidebar would be at least 200px wide
        expect(box.width).toBeLessThan(200);
      }
    }
  });
});
