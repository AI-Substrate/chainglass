/**
 * @vitest-environment jsdom
 */
/**
 * Unit tests for DashboardSidebar component
 * Tests navigation state, active item highlighting, and collapse behavior
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardSidebar } from '../../../../apps/web/src/components/dashboard-sidebar';
import { SidebarProvider } from '../../../../apps/web/src/components/ui/sidebar';

// Mock next/navigation per spec § 11 Mock Usage Policy (allowed exception)
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
  useRouter: vi.fn(() => ({
    push: vi.fn(),
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

// Test wrapper with SidebarProvider
function renderSidebar() {
  return render(
    <SidebarProvider>
      <DashboardSidebar />
    </SidebarProvider>
  );
}

describe('DashboardSidebar', () => {
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock matchMedia for mobile detection (from use-mobile hook)
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

  it('should highlight active navigation item based on current route', async () => {
    /*
    Test Doc:
    - Why: Users need visual feedback on current location in navigation
    - Contract: Active nav item matches current pathname
    - Usage Notes: Inject pathname via usePathname mock; check for active CSS class
    - Quality Contribution: Catches active state logic bugs before production
    - Worked Example: pathname='/' → Home has 'bg-accent' class
    */
    const { usePathname } = await import('next/navigation');
    vi.mocked(usePathname).mockReturnValue('/');

    renderSidebar();

    const homeLink = screen.getByRole('link', { name: /home/i });
    expect(homeLink).toHaveClass('bg-accent');
  });

  it('should toggle collapsed state when toggle button clicked', () => {
    /*
    Test Doc:
    - Why: Sidebar collapse is required for narrow screens and user preference
    - Contract: Clicking toggle button changes collapsed state
    - Usage Notes: Find toggle button by aria-label; check for collapsed CSS class
    - Quality Contribution: Ensures collapse behavior works across all screen sizes
    - Worked Example: Initial state expanded → click toggle → sidebar has 'w-16' class
    */
    renderSidebar();

    const toggleButton = screen.getByRole('button', { name: /toggle sidebar/i });
    fireEvent.click(toggleButton);

    const sidebar = screen.getByRole('complementary');
    expect(sidebar).toHaveClass('w-16'); // Collapsed width
  });

  it('should render icons only when collapsed', () => {
    /*
    Test Doc:
    - Why: Collapsed state should save horizontal space by hiding text labels
    - Contract: When collapsed, nav items show icons but not labels
    - Usage Notes: Check text content visibility or CSS class for label elements
    - Quality Contribution: Catches UI state bugs in responsive design
    - Worked Example: collapsed=true → "Workflow Visualization" text not visible
    */
    renderSidebar();

    const toggleButton = screen.getByRole('button', { name: /toggle sidebar/i });
    fireEvent.click(toggleButton);

    // In collapsed state, labels should not be in the document
    const workflowLabel = screen.queryByText(/workflow visualization/i);
    expect(workflowLabel).not.toBeInTheDocument();
  });

  it('should have correct href attributes for navigation links', () => {
    /*
    Test Doc:
    - Why: Navigation links must have correct href for Next.js routing
    - Contract: Each nav link href matches expected route path
    - Usage Notes: Check Link component href attribute, not router.push calls
    - Quality Contribution: Ensures navigation integrates with Next.js Link
    - Worked Example: Workflow link has href='/workflow'
    */
    renderSidebar();

    const homeLink = screen.getByRole('link', { name: /home/i });
    const workflowLink = screen.getByRole('link', { name: /workflow visualization/i });
    const kanbanLink = screen.getByRole('link', { name: /kanban board/i });

    expect(homeLink).toHaveAttribute('href', '/');
    expect(workflowLink).toHaveAttribute('href', '/workflow');
    expect(kanbanLink).toHaveAttribute('href', '/kanban');
  });
});
