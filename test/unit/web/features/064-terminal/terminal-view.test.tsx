import { describe, expect, it } from 'vitest';

/**
 * DYK-04: jsdom can't render xterm.js (needs Canvas API).
 * TerminalView uses next/dynamic with ssr: false, which won't resolve in jsdom.
 * These tests verify the module structure and exports, not terminal rendering.
 * Real rendering verification is manual via `just dev`.
 */
describe('TerminalView module', () => {
  it('exports TerminalView as a named export', async () => {
    /*
    Test Doc:
    - Why: Ensure public contract export remains stable for domain consumers
    - Contract: Module exposes TerminalView named export as callable component
    - Usage Notes: Import module directly; avoid rendering xterm in jsdom (DYK-04)
    - Quality Contribution: Catches accidental export removals or renames
    - Worked Example: import module => mod.TerminalView is defined and typeof === 'function'
    */
    const mod = await import('@/features/064-terminal/components/terminal-view');
    expect(mod.TerminalView).toBeDefined();
    expect(typeof mod.TerminalView).toBe('function');
  });

  it('exports TerminalViewProps type (compile-time check)', () => {
    /*
    Test Doc:
    - Why: Props contract must remain valid TypeScript for all consumers
    - Contract: TerminalViewProps requires sessionName (string) and cwd (string)
    - Usage Notes: Compile-time check only — if types break, this file fails to compile
    - Quality Contribution: Guards type contract stability across refactors
    - Worked Example: Construct props object with required fields => compiles and sessionName accessible
    */
    const props: import('@/features/064-terminal/components/terminal-view').TerminalViewProps = {
      sessionName: '064-tmux',
      cwd: '/tmp',
    };
    expect(props.sessionName).toBe('064-tmux');
  });
});

describe('TerminalSkeleton', () => {
  it('renders skeleton loading state', async () => {
    /*
    Test Doc:
    - Why: Skeleton must render during dynamic import loading to prevent layout shift
    - Contract: TerminalSkeleton renders multiple Skeleton elements with data-slot="skeleton"
    - Usage Notes: Dynamic import to avoid xterm.js side effects in test environment
    - Quality Contribution: Guards Suspense fallback rendering path
    - Worked Example: render TerminalSkeleton => DOM contains multiple data-slot="skeleton" elements
    */
    const { render } = await import('@testing-library/react');
    const { TerminalSkeleton } = await import(
      '@/features/064-terminal/components/terminal-skeleton'
    );

    render(<TerminalSkeleton />);
    const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
