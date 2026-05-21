'use client';

import dynamic from 'next/dynamic';
import { Component, type ReactNode } from 'react';
// FX012 (Plan 084): one xterm singleton, multiple viewports. Mounted here so
// it lives above /browser and /terminal and survives client-side nav.
// IMPORTANT: imported statically (NOT via dynamic+ssr:false). The provider
// wraps {children}; if the provider were ssr:false, the workspace page body
// would blank out during initial SSR + early hydration. The provider's own
// JSX is SSR-safe — the xterm-loaded `TerminalInner` is gated by an internal
// `dynamic(() => import('./terminal-inner'), { ssr: false })` so SSR never
// reaches xterm code.
import { TerminalSingletonProvider } from '../../../../src/features/064-terminal/components/terminal-singleton-provider';
import { TerminalOverlayProvider } from '../../../../src/features/064-terminal/hooks/use-terminal-overlay';

// Dynamic import — TerminalOverlayPanel imports TerminalInner which uses xterm.js (needs browser)
const TerminalOverlayPanel = dynamic(
  () =>
    import('../../../../src/features/064-terminal/components/terminal-overlay-panel').then(
      (m) => m.TerminalOverlayPanel
    ),
  { ssr: false }
);

// DYK-04: Error boundary wraps the panel (not provider) so overlay failures
// don't crash all workspace pages. Provider is pure context — safe.
class TerminalOverlayErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return null; // Silently hide overlay on error — workspace pages keep working
    }
    return this.props.children;
  }
}

interface TerminalOverlayWrapperProps {
  children: ReactNode;
  defaultSessionName?: string;
  defaultCwd?: string;
}

export function TerminalOverlayWrapper({
  children,
  defaultSessionName,
  defaultCwd,
}: TerminalOverlayWrapperProps) {
  return (
    <TerminalOverlayProvider defaultSessionName={defaultSessionName} defaultCwd={defaultCwd}>
      <TerminalSingletonProvider>
        {children}
        <TerminalOverlayErrorBoundary>
          <TerminalOverlayPanel />
        </TerminalOverlayErrorBoundary>
      </TerminalSingletonProvider>
    </TerminalOverlayProvider>
  );
}
