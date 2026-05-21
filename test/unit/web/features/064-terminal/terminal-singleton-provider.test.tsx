/**
 * Singleton + viewport plumbing tests (FX012 — Plan 084).
 *
 * jsdom can't render xterm.js (DYK-04), so we mock `./terminal-inner` to a
 * lightweight stub that just counts mounts. We also patch `next/dynamic` so
 * `dynamic(() => import('./terminal-inner'))` resolves synchronously in tests.
 *
 * Coverage:
 *   1. Park has exactly one TerminalInner stub
 *   2. Active viewport receives the stub via appendChild
 *   3. Viewport unmount returns the stub to the park
 *   4. LIFO activation: latest active wins
 *   5. Strict-mode steady-state mount count is 1
 *   6. KF-02: stub DOM node identity survives parent re-renders
 */

import { TerminalOverlayProvider } from '@/features/064-terminal/hooks/use-terminal-overlay';
import { act, render, waitFor } from '@testing-library/react';
import { type ReactNode, StrictMode, useEffect, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// FX012 follow-up: singleton now reads sessionName/cwd from overlay state.
// Tests must wrap with TerminalOverlayProvider so those values resolve.
function withOverlay(children: ReactNode) {
  return (
    <TerminalOverlayProvider defaultSessionName="s" defaultCwd="/tmp">
      {children}
    </TerminalOverlayProvider>
  );
}

// Track stub mount count via a module-scoped variable. We assert
// steady-state count after settle — React 19 strict-mode runs
// mount→unmount→remount and the test expects count === 1 after settle.
let mountCount = 0;

vi.mock('@/features/064-terminal/components/terminal-inner', () => ({
  default: function MockTerminalInner() {
    useEffect(() => {
      mountCount += 1;
      return () => {
        mountCount -= 1;
      };
    }, []);
    return <div data-testid="mock-terminal-inner">terminal</div>;
  },
}));

// next/dynamic with ssr:false is a no-op in jsdom (DYK-04). Replace it with a
// passthrough that synchronously loads the mocked module on first render so
// the rest of the tests can assert against the DOM produced by the stub.
vi.mock('next/dynamic', () => ({
  default: <P,>(loader: () => Promise<{ default: React.ComponentType<P> }>) => {
    // Cache the resolved component at module-level so it survives
    // strict-mode's mount/unmount/remount cycle (a per-instance cache would
    // race the strict unmount and leave the cache empty on remount).
    let cached: React.ComponentType<P> | null = null;
    const loadPromise = loader().then((mod) => {
      cached = mod.default;
    });
    return function DynamicMock(props: P) {
      const [, setTick] = useState(0);
      useEffect(() => {
        let active = true;
        loadPromise.then(() => {
          if (active) setTick((t) => t + 1);
        });
        return () => {
          active = false;
        };
      }, []);
      if (!cached) return null;
      const C = cached;
      return <C {...props} />;
    };
  },
}));

beforeEach(() => {
  mountCount = 0;
});

async function flush() {
  // Let the dynamic loader's microtask settle and React commit.
  await act(async () => {
    await Promise.resolve();
  });
}

describe('TerminalSingletonProvider', () => {
  it('lazy-mount: no TerminalInner until first viewport activates', async () => {
    /*
    Test Doc:
    - Why: Pre-FX012 the OverlayPanel guarded inner mount with hasOpened; FX012 moves the gate to the singleton so workspaces the user never terminals on stay disconnected (no WS auth race against bootstrap)
    - Contract: Provider with no viewport => park is empty (no mock-terminal-inner DOM)
    - Usage Notes: Mock terminal-inner; renders provider with NO viewports
    - Quality Contribution: Locks the lazy-mount gate — regression-prevents an always-on WS connection on every workspace nav
    - Worked Example: render provider alone => park has 0 mock-terminal-inner; subsequent activation mounts it
    */
    const { TerminalSingletonProvider } = await import(
      '@/features/064-terminal/components/terminal-singleton-provider'
    );
    render(
      withOverlay(
        <TerminalSingletonProvider>
          <div data-testid="children" />
        </TerminalSingletonProvider>
      )
    );
    await flush();
    const park = document.querySelector('[data-terminal-park]');
    expect(park).not.toBeNull();
    expect(park?.querySelectorAll('[data-testid="mock-terminal-inner"]').length).toBe(0);
  });

  it('moves the xterm host into the active viewport slot', async () => {
    /*
    Test Doc:
    - Why: Singleton's appendChild must physically relocate the xterm host
    - Contract: <TerminalViewport id active /> ends up owning the mock node in its slot
    - Usage Notes: Slot is the [data-viewport-id=...] div; mock node sits directly under it
    - Quality Contribution: Locks AC-05 (≤1 xterm-screen in active slot) plumbing
    - Worked Example: provider + viewport active => slot contains mock-terminal-inner, park is empty
    */
    const { TerminalSingletonProvider } = await import(
      '@/features/064-terminal/components/terminal-singleton-provider'
    );
    const { TerminalViewport } = await import(
      '@/features/064-terminal/components/terminal-viewport'
    );
    render(
      withOverlay(
        <TerminalSingletonProvider>
          <TerminalViewport id="probe-slot" active />
        </TerminalSingletonProvider>
      )
    );
    await flush();
    const slot = document.querySelector('[data-viewport-id="probe-slot"]');
    expect(slot).not.toBeNull();
    expect(slot?.querySelector('[data-testid="mock-terminal-inner"]')).not.toBeNull();
    const park = document.querySelector('[data-terminal-park]');
    expect(park?.querySelector('[data-testid="mock-terminal-inner"]')).toBeNull();
  });

  it('returns the xterm host to the park when the viewport unmounts', async () => {
    /*
    Test Doc:
    - Why: Closing a viewport (e.g. closing the float) must park the xterm without unmounting
    - Contract: Viewport unmount triggers deactivate => host moves back into the park div
    - Usage Notes: Use rerender to drop the viewport from the tree
    - Quality Contribution: Locks AC-06 (scrollback persists across transitions)
    - Worked Example: provider+viewport then rerender without viewport => park hosts the mock again
    */
    const { TerminalSingletonProvider } = await import(
      '@/features/064-terminal/components/terminal-singleton-provider'
    );
    const { TerminalViewport } = await import(
      '@/features/064-terminal/components/terminal-viewport'
    );
    const { rerender } = render(
      withOverlay(
        <TerminalSingletonProvider>
          <TerminalViewport id="probe-slot" active />
        </TerminalSingletonProvider>
      )
    );
    await flush();
    rerender(
      withOverlay(
        <TerminalSingletonProvider>
          <div data-testid="children" />
        </TerminalSingletonProvider>
      )
    );
    await flush();
    const park = document.querySelector('[data-terminal-park]');
    expect(park?.querySelector('[data-testid="mock-terminal-inner"]')).not.toBeNull();
  });

  it('LIFO activation: latest active viewport wins', async () => {
    /*
    Test Doc:
    - Why: If multiple viewports go active concurrently, the most recent caller takes ownership
    - Contract: Two viewports both with active=true => the second-rendered one owns the host
    - Usage Notes: React renders siblings in JSX order; layout effects fire in same order
    - Quality Contribution: Locks the singleton's "latest wins" safety net (KF-04 mitigation)
    - Worked Example: render first then second viewport, both active => host inside second slot
    */
    const { TerminalSingletonProvider } = await import(
      '@/features/064-terminal/components/terminal-singleton-provider'
    );
    const { TerminalViewport } = await import(
      '@/features/064-terminal/components/terminal-viewport'
    );
    render(
      withOverlay(
        <TerminalSingletonProvider>
          <TerminalViewport id="first" active />
          <TerminalViewport id="second" active />
        </TerminalSingletonProvider>
      )
    );
    await flush();
    const second = document.querySelector('[data-viewport-id="second"]');
    const first = document.querySelector('[data-viewport-id="first"]');
    expect(second?.querySelector('[data-testid="mock-terminal-inner"]')).not.toBeNull();
    expect(first?.querySelector('[data-testid="mock-terminal-inner"]')).toBeNull();
  });

  it('React 19 strict-mode: steady-state TerminalInner mount count is 1', async () => {
    /*
    Test Doc:
    - Why: Strict-mode mounts→unmounts→remounts; net steady-state must be one instance
    - Contract: <StrictMode><Provider/></StrictMode> => mountCount === 1 after settle
    - Usage Notes: useEffect mount/unmount counter; React 19 strict double-mount in dev
    - Quality Contribution: Locks AC-12 directly
    - Worked Example: render under StrictMode and flush => counter equals 1
    */
    const { TerminalSingletonProvider } = await import(
      '@/features/064-terminal/components/terminal-singleton-provider'
    );
    const { TerminalViewport } = await import(
      '@/features/064-terminal/components/terminal-viewport'
    );
    render(
      <StrictMode>
        {withOverlay(
          <TerminalSingletonProvider>
            {/* viewport activates the lazy-mount gate */}
            <TerminalViewport id="probe" active />
          </TerminalSingletonProvider>
        )}
      </StrictMode>
    );
    await waitFor(() => {
      expect(document.querySelector('[data-testid="mock-terminal-inner"]')).not.toBeNull();
    });
    expect(mountCount).toBe(1);
  });

  it('KF-02: xterm host DOM node identity survives parent re-renders', async () => {
    /*
    Test Doc:
    - Why: After appendChild, React must NOT re-insert the host on subsequent re-renders
    - Contract: Force 3 parent re-renders; mock node ref identity stays the same
    - Usage Notes: Use a parent state to force re-renders; compare strict equality of node ref
    - Quality Contribution: Verifies the empirical hypothesis at the unit level — gate for FX012-2
    - Worked Example: rerender 3× with bumped tick => same DOM node reference in slot
    */
    const { TerminalSingletonProvider } = await import(
      '@/features/064-terminal/components/terminal-singleton-provider'
    );
    const { TerminalViewport } = await import(
      '@/features/064-terminal/components/terminal-viewport'
    );
    function Wrapper({ tick }: { tick: number }) {
      return withOverlay(
        <TerminalSingletonProvider>
          <TerminalViewport id="probe-slot" active />
          <span data-testid="tick">{tick}</span>
        </TerminalSingletonProvider>
      );
    }
    const { rerender } = render(<Wrapper tick={0} />);
    await flush();
    const initial = document.querySelector(
      '[data-viewport-id="probe-slot"] [data-testid="mock-terminal-inner"]'
    );
    expect(initial).not.toBeNull();
    rerender(<Wrapper tick={1} />);
    rerender(<Wrapper tick={2} />);
    rerender(<Wrapper tick={3} />);
    await flush();
    const after = document.querySelector(
      '[data-viewport-id="probe-slot"] [data-testid="mock-terminal-inner"]'
    );
    expect(after).toBe(initial);
  });
});
