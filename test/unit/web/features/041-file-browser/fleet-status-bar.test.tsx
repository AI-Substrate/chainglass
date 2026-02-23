/**
 * FleetStatusBar Component Tests
 *
 * Purpose: Verify fleet status bar renders agent counts and attention indicators,
 *          hidden when idle/no data.
 * Quality Contribution: Prevents silent failures in fleet overview on landing page.
 * Acceptance Criteria: AC-3
 *
 * Phase 3: UI Overhaul — Plan 041: File Browser
 * DYK-P3-01: All props optional — gracefully returns null when absent
 */

import { FleetStatusBar } from '@/features/041-file-browser/components/fleet-status-bar';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

// ============ T003: FleetStatusBar Tests (RED) ============

describe('FleetStatusBar', () => {
  describe('visibility', () => {
    it('returns null when no props provided', () => {
      const { container } = render(<FleetStatusBar />);

      expect(container.firstChild).toBeNull();
    });

    it('returns null when all counts are zero', () => {
      const { container } = render(<FleetStatusBar runningCount={0} attentionCount={0} />);

      expect(container.firstChild).toBeNull();
    });
  });

  describe('running agents', () => {
    it('shows running agent count', () => {
      render(<FleetStatusBar runningCount={5} />);

      expect(screen.getByText(/5 agents running/i)).toBeInTheDocument();
    });

    it('shows singular for 1 agent', () => {
      render(<FleetStatusBar runningCount={1} />);

      expect(screen.getByText(/1 agent running/i)).toBeInTheDocument();
    });
  });

  describe('attention needed', () => {
    it('shows attention count with diamond indicator', () => {
      render(
        <FleetStatusBar
          runningCount={3}
          attentionCount={2}
          firstAttentionHref="/workspaces/substrate"
        />
      );

      expect(screen.getByText(/◆/)).toBeInTheDocument();
      expect(screen.getByText(/2 needs attention/i)).toBeInTheDocument();
    });

    it('renders attention text as clickable link', () => {
      render(
        <FleetStatusBar
          runningCount={1}
          attentionCount={1}
          firstAttentionHref="/workspaces/substrate"
        />
      );

      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', '/workspaces/substrate');
    });
  });
});
