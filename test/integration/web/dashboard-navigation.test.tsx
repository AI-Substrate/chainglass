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

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

  function renderWithProviders(children: React.ReactNode) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return render(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>);
  }

  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    mockPathname = '/';
    vi.clearAllMocks();

    // Mock fetch to prevent URL parse warnings from useWorktreeActivity/WorkspaceNav
    originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ workspaces: [] }),
    }) as unknown as typeof fetch;

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
    global.fetch = originalFetch;
    window.matchMedia = originalMatchMedia;
  });

  it('should show Dev section with navigation to Workflow page', () => {
    /*
    Test Doc:
    - Why: Validate sidebar restructure maintains access to dev pages
    - Contract: The shell loads with the sidebar COMPACT (defaultOpen={false} — the icon rail hides
      the Dev section entirely); expanding via the toggle reveals it.
    - Usage Notes: The compact-by-default decision is DashboardShell's, deliberately: users expand
      via the PanelLeft toggle. Asserting Dev on first render was the pre-compact contract and went
      red the day the default flipped.
    - Quality Contribution: Catches navigation regression after restructure
    - Worked Example: no Dev label on load; visible after one toggle click
    */
    renderWithProviders(
      <DashboardShell>
        <div>Home Content</div>
      </DashboardShell>
    );

    // Compact rail hides the Dev section entirely — by design.
    expect(screen.queryByText(/dev/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /toggle sidebar/i }));

    // Expanded: the Dev section label is reachable again.
    expect(screen.getByText(/dev/i)).toBeInTheDocument();
  });

  it('should maintain layout consistency across pages', () => {
    /*
    Test Doc:
    - Why: Ensures DashboardShell wraps all pages; header/sidebar present everywhere
    - Contract: Sidebar and main content area render on all routes
    - Usage Notes: Sidebar loads compact, so structure assertions expand it first.
    - Quality Contribution: Catches layout regressions when adding new pages
    - Worked Example: Navigate '/' → sidebar present with toggle and theme
    */
    renderWithProviders(
      <DashboardShell>
        <div>Page Content for /</div>
      </DashboardShell>
    );

    // Sidebar should be present
    const sidebar = screen.getByRole('complementary');
    expect(sidebar).toBeInTheDocument();

    // Page content should be present
    expect(screen.getByText('Page Content for /')).toBeInTheDocument();

    // Expand the compact rail; the Dev section is hidden there by design.
    fireEvent.click(screen.getByRole('button', { name: /toggle sidebar/i }));
    expect(screen.getByText(/dev/i)).toBeInTheDocument();

    // Theme toggle should be present
    expect(screen.getByRole('button', { name: /toggle theme/i })).toBeInTheDocument();
  });

  it('should preserve sidebar expanded state during navigation', () => {
    /*
    Test Doc:
    - Why: User preference should persist during route changes
    - Contract: The user's toggle survives navigation. The shell now loads COMPACT, so the
      persisted preference under test is the expansion — the inverse of the pre-compact version
      of this test, same property.
    - Usage Notes: The Dev label is the expansion oracle: it renders only in the expanded sidebar,
      so its persistence proves the state's without reaching into width classes.
    - Quality Contribution: Ensures UX consistency during navigation
    - Worked Example: expand, navigate to /workflow, Dev label still visible
    */
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <DashboardShell>
          <div>Home Content</div>
        </DashboardShell>
      </QueryClientProvider>
    );

    // Expand the sidebar (loads compact by default)
    fireEvent.click(screen.getByRole('button', { name: /toggle sidebar/i }));
    expect(screen.getByText(/dev/i)).toBeInTheDocument();

    // Navigate to workflow page
    mockPathname = '/workflow';
    rerender(
      <QueryClientProvider client={queryClient}>
        <DashboardShell>
          <div>Workflow Content</div>
        </DashboardShell>
      </QueryClientProvider>
    );

    // Sidebar should still be expanded
    expect(screen.getByText(/dev/i)).toBeInTheDocument();
  });
});
