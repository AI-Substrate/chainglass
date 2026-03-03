'use client';

import dynamic from 'next/dynamic';
import { Component, type ReactNode } from 'react';
import { TerminalOverlayProvider } from '../../../../src/features/064-terminal/hooks/use-terminal-overlay';

// Dynamic import — TerminalOverlayPanel imports TerminalInner which uses xterm.js (needs browser)
const TerminalOverlayPanel = dynamic(
  () =>
    import('../../../../src/features/064-terminal/components/terminal-overlay-panel').then(
      (m) => m.TerminalOverlayPanel,
    ),
  { ssr: false },
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
}

export function TerminalOverlayWrapper({ children }: TerminalOverlayWrapperProps) {
  return (
    <TerminalOverlayProvider>
      {children}
      <TerminalOverlayErrorBoundary>
        <TerminalOverlayPanel />
      </TerminalOverlayErrorBoundary>
    </TerminalOverlayProvider>
  );
}
