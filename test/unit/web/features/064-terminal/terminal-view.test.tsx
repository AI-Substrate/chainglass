import { describe, expect, it, vi } from 'vitest';

/**
 * DYK-04: jsdom can't render xterm.js (needs Canvas API).
 * TerminalView uses next/dynamic with ssr: false, which won't resolve in jsdom.
 * These tests verify the module structure and exports, not terminal rendering.
 * Real rendering verification is manual via `just dev`.
 */
describe('TerminalView module', () => {
  it('exports TerminalView as a named export', async () => {
    // Verify the module structure — the actual component needs browser APIs
    const mod = await import('@/features/064-terminal/components/terminal-view');
    expect(mod.TerminalView).toBeDefined();
    expect(typeof mod.TerminalView).toBe('function');
  });

  it('exports TerminalViewProps type (compile-time check)', () => {
    // This test exists to verify TypeScript compiles correctly with the exported types.
    // If types are wrong, this file won't compile → test suite fails.
    const props: import('@/features/064-terminal/components/terminal-view').TerminalViewProps = {
      sessionName: '064-tmux',
      cwd: '/tmp',
    };
    expect(props.sessionName).toBe('064-tmux');
  });
});

describe('TerminalSkeleton', () => {
  it('renders skeleton loading state', async () => {
    // Import dynamically to avoid xterm.js side effects
    const { render, screen } = await import('@testing-library/react');
    const { TerminalSkeleton } = await import(
      '@/features/064-terminal/components/terminal-skeleton'
    );

    render(<TerminalSkeleton />);
    const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
