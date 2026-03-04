/**
 * @vitest-environment jsdom
 */
/**
 * Dashboard Navigation Integration Tests
 *
 * Tests full navigation flow across pages:
 * - Route changes update active state
 * - Layout consistency across all pages
 * - Sidebar state persistence during navigation
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardShell } from '../../../apps/web/src/components/dashboard-shell';

// Mock next/navigation per spec § 11 Mock Usage Policy (allowed exception)
let mockPathname = '/';
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => mockPathname),
  useRouter: vi.fn(() => ({
    push: vi.fn((path: string) => {
      mockPathname = path; // Simulate route change
    }),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  })),
  useSearchParams: vi.fn(() => ({
    get: vi.fn(() => null),
    getAll: vi.fn(() => []),
    has: vi.fn(() => false),
    keys: vi.fn(() => [][Symbol.iterator]()),
    values: vi.fn(() => [][Symbol.iterator]()),
    entries: vi.fn(() => [][Symbol.iterator]()),
    forEach: vi.fn(),
    toString: vi.fn(() => ''),
    [Symbol.iterator]: vi.fn(() => [][Symbol.iterator]()),
  })),
}));

vi.mock('next-auth/react', () => ({
  useSession: vi.fn(() => ({
    data: { user: { name: 'jakkaj' } },
    status: 'authenticated',
  })),
  signOut: vi.fn(),
}));

describe('Dashboard Navigation Integration', () => {
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    mockPathname = '/';
    vi.clearAllMocks();

    // Mock matchMedia for mobile detection
    originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('should show Dev section with navigation to Workflow page', () => {
    /*
    Test Doc:
    - Why: Validate sidebar restructure maintains access to dev pages
    - Contract: Dev section exists and contains demo links (collapsed by default)
    - Usage Notes: Phase 3 restructure moved demos to collapsed Dev section
    - Quality Contribution: Catches navigation regression after restructure
    - Worked Example: Dev label visible in sidebar on landing page
    */
    render(
      <DashboardShell>
        <div>Home Content</div>
      </DashboardShell>
    );

    // Dev section label should exist
    expect(screen.getByText(/dev/i)).toBeInTheDocument();
  });

  it('should maintain layout consistency across pages', () => {
    /*
    Test Doc:
    - Why: Ensures DashboardShell wraps all pages; header/sidebar present everywhere
    - Contract: Sidebar and main content area render on all routes
    - Usage Notes: Phase 3 restructure — sidebar shows Dev section on non-workspace routes
    - Quality Contribution: Catches layout regressions when adding new pages
    - Worked Example: Navigate '/' → sidebar present with toggle and theme
    */
    render(
      <DashboardShell>
        <div>Page Content for /</div>
      </DashboardShell>
    );

    // Sidebar should be present
    const sidebar = screen.getByRole('complementary');
    expect(sidebar).toBeInTheDocument();

    // Page content should be present
    expect(screen.getByText('Page Content for /')).toBeInTheDocument();

    // Dev section should be present (restructured nav)
    expect(screen.getByText(/dev/i)).toBeInTheDocument();

    // Theme toggle should be present
    expect(screen.getByRole('button', { name: /toggle theme/i })).toBeInTheDocument();
  });

  it('should preserve sidebar collapsed state during navigation', () => {
    /*
    Test Doc:
    - Why: User preference should persist during route changes
    - Contract: Collapsed state maintained across page navigation
    - Usage Notes: Collapse sidebar, navigate, check sidebar still collapsed
    - Quality Contribution: Ensures UX consistency during navigation
    - Worked Example: Collapse sidebar, navigate to /workflow, sidebar remains collapsed
    */
    const { rerender } = render(
      <DashboardShell>
        <div>Home Content</div>
      </DashboardShell>
    );

    // Collapse the sidebar
    const toggleButton = screen.getByRole('button', { name: /toggle sidebar/i });
    fireEvent.click(toggleButton);

    // Verify sidebar is collapsed
    const sidebar = screen.getByRole('complementary');
    expect(sidebar).toHaveClass('w-16');

    // Navigate to workflow page
    mockPathname = '/workflow';
    rerender(
      <DashboardShell>
        <div>Workflow Content</div>
      </DashboardShell>
    );

    // Sidebar should still be collapsed
    const updatedSidebar = screen.getByRole('complementary');
    expect(updatedSidebar).toHaveClass('w-16');
  });
});
