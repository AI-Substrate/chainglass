/**
 * BottomTabBar Tests - TDD RED Phase
 *
 * Tests for the mobile navigation bottom tab bar component.
 * Phone-only component that provides navigation for viewports < 768px.
 *
 * Following TDD approach: write tests first, expect them to fail.
 *
 * Uses FakeMatchMedia for testing without browser dependencies.
 * Pattern copied from useResponsive.test.ts:26-59.
 *
 * @vitest-environment jsdom
 */

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeMatchMedia } from '../../../../fakes/fake-match-media';

// Component will be imported when it exists
import { BottomTabBar } from '../../../../../apps/web/src/components/navigation/bottom-tab-bar';

// Navigation items for testing - matches MOBILE_NAV_ITEMS (3 core items)
const mockTabs = [
  { id: 'home', label: 'Home', href: '/', icon: 'Home' },
  { id: 'workflow', label: 'Workflow', href: '/workflow', icon: 'GitBranch' },
  { id: 'kanban', label: 'Kanban', href: '/kanban', icon: 'LayoutDashboard' },
];

// Mock Next.js router
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/',
}));

describe('BottomTabBar', () => {
  let fakeMatchMedia: FakeMatchMedia;
  let originalMatchMedia: typeof window.matchMedia;
  let originalInnerWidth: number;

  beforeEach(() => {
    // Save original window properties
    originalMatchMedia = window.matchMedia;
    originalInnerWidth = window.innerWidth;

    // Create fake with phone viewport default
    fakeMatchMedia = new FakeMatchMedia(375);

    // Inject fake into window
    (window as any).matchMedia = (query: string) => fakeMatchMedia.matchMedia(query);

    // Mock innerWidth for snapshot functions
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375,
    });

    // Reset mocks
    mockPush.mockClear();
  });

  afterEach(() => {
    // Restore original window properties
    window.matchMedia = originalMatchMedia;
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    });
    fakeMatchMedia.clearAllListeners();
  });

  describe('phone viewport rendering (AC-43)', () => {
    it('should render tab list on phone viewport', () => {
      /*
      Test Doc:
      - Why: BottomTabBar is the primary navigation for phone users
      - Contract: Renders tablist role on viewport < 768px
      - Usage Notes: Uses useResponsive().useMobilePatterns to decide
      - Quality Contribution: Catches phone rendering failures
      - Worked Example: 375px viewport → tablist visible
      */
      render(<BottomTabBar />);

      expect(screen.getByRole('tablist')).toBeInTheDocument();
    });

    it('should render core nav items as tabs', () => {
      /*
      Test Doc:
      - Why: Phone users need access to core navigation
      - Contract: Renders 3 tabs (Home, Workflow, Kanban) from MOBILE_NAV_ITEMS
      - Usage Notes: Demo pages excluded per DYK session decision
      - Quality Contribution: Catches incorrect tab count
      - Worked Example: 3 tabs rendered with correct labels
      */
      render(<BottomTabBar />);

      const tabs = screen.getAllByRole('tab');
      expect(tabs).toHaveLength(3);

      expect(screen.getByRole('tab', { name: /home/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /workflow/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /kanban/i })).toBeInTheDocument();
    });

    it('should have ARIA tablist role for accessibility', () => {
      /*
      Test Doc:
      - Why: Screen readers need proper role for navigation
      - Contract: Container has role="tablist"
      - Usage Notes: ARIA roles are critical for accessibility
      - Quality Contribution: Catches ARIA violations
      - Worked Example: tablist role present on container
      */
      render(<BottomTabBar />);

      const tablist = screen.getByRole('tablist');
      expect(tablist).toBeInTheDocument();
    });

    it('should have ARIA tab roles on each tab', () => {
      /*
      Test Doc:
      - Why: Each tab needs proper role for screen readers
      - Contract: Each tab item has role="tab"
      - Usage Notes: Critical for navigation via assistive technology
      - Quality Contribution: Catches missing ARIA roles
      - Worked Example: All 3 tabs have role="tab"
      */
      render(<BottomTabBar />);

      const tabs = screen.getAllByRole('tab');
      tabs.forEach((tab) => {
        expect(tab).toHaveAttribute('role', 'tab');
      });
    });
  });

  describe('tablet/desktop viewport hiding (AC-44)', () => {
    it('should not render on tablet viewport (900px)', () => {
      /*
      Test Doc:
      - Why: Tablet uses sidebar, not bottom tab bar
      - Contract: No tablist rendered on viewport >= 768px
      - Usage Notes: useMobilePatterns is false for tablet
      - Quality Contribution: Catches incorrect viewport rendering
      - Worked Example: 900px viewport → no tablist
      */
      Object.defineProperty(window, 'innerWidth', { value: 900 });
      fakeMatchMedia.setViewportWidth(900);

      render(<BottomTabBar />);

      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    });

    it('should not render on desktop viewport (1200px)', () => {
      /*
      Test Doc:
      - Why: Desktop uses sidebar, not bottom tab bar
      - Contract: No tablist rendered on viewport >= 1024px
      - Usage Notes: Desktop experience is sidebar-based
      - Quality Contribution: Catches desktop viewport leaking
      - Worked Example: 1200px viewport → no tablist
      */
      Object.defineProperty(window, 'innerWidth', { value: 1200 });
      fakeMatchMedia.setViewportWidth(1200);

      render(<BottomTabBar />);

      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    });
  });

  describe('touch targets (AC-46)', () => {
    it('should have touch targets with min-h-12 class (48px minimum)', () => {
      /*
      Test Doc:
      - Why: Mobile accessibility requires 48px minimum touch targets
      - Contract: All tab buttons have min-h-12 class (Tailwind 48px)
      - Usage Notes: jsdom cannot compute styles; verify class presence
      - Quality Contribution: Catches accessibility violations
      - Worked Example: Tab buttons have min-h-12 class
      */
      render(<BottomTabBar />);

      const tabs = screen.getAllByRole('tab');
      tabs.forEach((tab) => {
        expect(tab).toHaveClass('min-h-12');
      });
    });

    it('should have touch targets with min-w-12 class (48px minimum)', () => {
      /*
      Test Doc:
      - Why: Touch targets need both width and height minimums
      - Contract: All tab buttons have min-w-12 class
      - Usage Notes: Ensures adequate horizontal tap area
      - Quality Contribution: Catches narrow touch targets
      - Worked Example: Tab buttons have min-w-12 class
      */
      render(<BottomTabBar />);

      const tabs = screen.getAllByRole('tab');
      tabs.forEach((tab) => {
        expect(tab).toHaveClass('min-w-12');
      });
    });
  });

  describe('active state indication', () => {
    it('should show active state for current tab via aria-selected', () => {
      /*
      Test Doc:
      - Why: Users need visual feedback for current location
      - Contract: Active tab has aria-selected="true"
      - Usage Notes: Matches current route via usePathname
      - Quality Contribution: Catches missing active state
      - Worked Example: Home tab (/) has aria-selected="true"
      */
      render(<BottomTabBar />);

      const homeTab = screen.getByRole('tab', { name: /home/i });
      expect(homeTab).toHaveAttribute('aria-selected', 'true');
    });

    it('should show inactive state for non-current tabs', () => {
      /*
      Test Doc:
      - Why: Inactive tabs need distinct styling
      - Contract: Non-active tabs have aria-selected="false"
      - Usage Notes: Visual distinction between active/inactive
      - Quality Contribution: Catches incorrect active state logic
      - Worked Example: Workflow tab has aria-selected="false" when on /
      */
      render(<BottomTabBar />);

      const workflowTab = screen.getByRole('tab', { name: /workflow/i });
      const kanbanTab = screen.getByRole('tab', { name: /kanban/i });

      expect(workflowTab).toHaveAttribute('aria-selected', 'false');
      expect(kanbanTab).toHaveAttribute('aria-selected', 'false');
    });

    it('should have distinct visual styling for active tab', () => {
      /*
      Test Doc:
      - Why: Active tab needs visual differentiation
      - Contract: Active tab has specific active styling class
      - Usage Notes: Verify class presence for active styling
      - Quality Contribution: Catches missing visual feedback
      - Worked Example: Active tab has text-primary or similar class
      */
      render(<BottomTabBar />);

      const homeTab = screen.getByRole('tab', { name: /home/i });
      // Check for active styling class (specific class TBD in implementation)
      expect(homeTab.className).toMatch(/text-primary|active|selected/);
    });
  });

  describe('navigation behavior', () => {
    it('should navigate on tab press', async () => {
      /*
      Test Doc:
      - Why: Tabs must trigger navigation
      - Contract: Tab press calls router.push with tab href
      - Usage Notes: Uses Next.js router for navigation
      - Quality Contribution: Catches broken navigation handlers
      - Worked Example: Press Workflow → router.push('/workflow')
      */
      const user = userEvent.setup();
      render(<BottomTabBar />);

      await user.click(screen.getByRole('tab', { name: /workflow/i }));

      expect(mockPush).toHaveBeenCalledWith('/workflow');
    });

    it('should not navigate when pressing already active tab', async () => {
      /*
      Test Doc:
      - Why: Clicking active tab shouldn't trigger navigation
      - Contract: Active tab click doesn't call router.push
      - Usage Notes: Optimization to prevent unnecessary navigation
      - Quality Contribution: Catches redundant navigation
      - Worked Example: Press Home (already active) → no navigation
      */
      const user = userEvent.setup();
      render(<BottomTabBar />);

      await user.click(screen.getByRole('tab', { name: /home/i }));

      // Should not navigate since we're already on home
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  describe('cleanup and memory', () => {
    it('should cleanup listeners on unmount', () => {
      /*
      Test Doc:
      - Why: Memory leaks occur if listeners aren't removed
      - Contract: Unmounting component removes all listeners
      - Usage Notes: Verify via FakeMatchMedia.getListenerCount()
      - Quality Contribution: Prevents memory leaks
      - Worked Example: unmount → listener count drops to 0
      */
      const { unmount } = render(<BottomTabBar />);

      unmount();

      // Verify listeners are cleaned up
      const phoneQuery = '(max-width: 767px)';
      expect(fakeMatchMedia.getListenerCount(phoneQuery)).toBe(0);
    });
  });

  describe('layout and positioning', () => {
    it('should be fixed at the bottom of the screen', () => {
      /*
      Test Doc:
      - Why: Bottom tab bar must be fixed at viewport bottom
      - Contract: Container has fixed/bottom-0 positioning classes
      - Usage Notes: Fixed positioning ensures visibility while scrolling
      - Quality Contribution: Catches positioning issues
      - Worked Example: Container has fixed and bottom-0 classes
      */
      render(<BottomTabBar />);

      const tablist = screen.getByRole('tablist');
      const container = tablist.parentElement || tablist;

      expect(container).toHaveClass('fixed');
      expect(container).toHaveClass('bottom-0');
    });

    it('should span full width', () => {
      /*
      Test Doc:
      - Why: Tab bar should span full viewport width
      - Contract: Container has w-full class
      - Usage Notes: Ensures consistent layout across devices
      - Quality Contribution: Catches layout width issues
      - Worked Example: Container has w-full class
      */
      render(<BottomTabBar />);

      const tablist = screen.getByRole('tablist');
      const container = tablist.parentElement || tablist;

      expect(container).toHaveClass('w-full');
    });
  });
});
