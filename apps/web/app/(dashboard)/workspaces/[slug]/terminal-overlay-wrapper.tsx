'use client';

import { Component, type ReactNode } from 'react';
import { TerminalOverlayPanel } from '../../../../src/features/064-terminal/components/terminal-overlay-panel';
import { TerminalOverlayProvider } from '../../../../src/features/064-terminal/hooks/use-terminal-overlay';

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
