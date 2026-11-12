/**
 * @vitest-environment node
 */
/**
 * Nav speed PRD item 1 — the dashboard shell renders on the server.
 *
 * `AuthProvider` used to load next-auth's SessionProvider through
 * `next/dynamic(..., { ssr: false })`. A client-only provider renders none of its
 * children on the server, so every dashboard page arrived as empty HTML and painted
 * only after all the JavaScript ran. This renders the real dashboard layout with
 * react-dom/server in a node environment (no `window`) and requires the sidebar
 * and the page content to be in the HTML.
 *
 * Sanctioned exception: `vi.mock('next/navigation')` — there is no App Router
 * context outside Next (same pattern as dashboard-sidebar.test.tsx). next-auth is
 * deliberately NOT mocked: its real SessionProvider must render on the server.
 */
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import DashboardLayout from '../../../../../apps/web/app/(dashboard)/layout';
import { Providers } from '../../../../../apps/web/src/components/providers';

vi.mock('next/navigation', () => ({
  usePathname: () => '/workspaces/demo',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ slug: 'demo' }),
}));

describe('dashboard shell server rendering', () => {
  it('server-renders the sidebar and the page inside the auth provider', () => {
    /*
    Test Doc:
    - Why: A client-only wrapper above the dashboard tree empties the server HTML of
      every dashboard page (nav speed PRD item 1).
    - Contract: DashboardLayout's server render contains the sidebar markup and its
      children's markup.
    - Usage Notes: Runs in the node environment so `typeof window === 'undefined'`, as
      during Next SSR.
    - Quality Contribution: Fails if AuthProvider (or anything else in the shell)
      becomes client-only again.
    - Worked Example: <DashboardLayout><p>page body</p></DashboardLayout> → HTML has
      data-sidebar="sidebar" and "page body".
    */
    const html = renderToString(
      <Providers>
        <DashboardLayout>
          <p data-testid="page-body">page body</p>
        </DashboardLayout>
      </Providers>
    );

    expect(html).toContain('data-sidebar="sidebar"');
    expect(html).toContain('data-testid="page-body"');
    expect(html).toContain('page body');
  });
});
