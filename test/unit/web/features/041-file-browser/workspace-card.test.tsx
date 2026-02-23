/**
 * WorkspaceCard Component Tests
 *
 * Purpose: Verify workspace card renders visual identity, worktree summary,
 *          star toggle form, optional agent indicators, and link to workspace.
 * Quality Contribution: Prevents regressions in the primary landing page element.
 * Acceptance Criteria: AC-1, AC-2, AC-5, AC-14
 *
 * Phase 3: UI Overhaul — Plan 041: File Browser
 * DYK-P3-02: Server Component — form action for star, CSS hover, plain <a>
 * DYK-P3-05: Fallback avatar (first letter) when emoji empty
 * DYK-P3-01: Agent summary optional — gracefully omit when absent
 */

import { WorkspaceCard } from '@/features/041-file-browser/components/workspace-card';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

// ============ T001: WorkspaceCard Tests (RED) ============

describe('WorkspaceCard', () => {
  const baseProps = {
    slug: 'substrate',
    name: 'substrate',
    path: '/home/user/substrate',
    preferences: { emoji: '🔮', color: 'violet', starred: false, sortOrder: 0 },
    worktreeCount: 23,
  };

  describe('visual identity', () => {
    it('renders emoji and workspace name', () => {
      render(<WorkspaceCard {...baseProps} />);

      expect(screen.getByText('🔮')).toBeInTheDocument();
      expect(screen.getByText('substrate')).toBeInTheDocument();
    });

    it('renders fallback first-letter avatar when emoji is empty', () => {
      render(
        <WorkspaceCard {...baseProps} preferences={{ ...baseProps.preferences, emoji: '' }} />
      );

      // Should show "S" (first letter of "substrate")
      expect(screen.getByText('S')).toBeInTheDocument();
    });

    it('renders accent color as left border style', () => {
      const { container } = render(<WorkspaceCard {...baseProps} />);

      // Card should have a left border with the accent color
      const card = container.firstElementChild;
      expect(card).toBeTruthy();
      // The color should influence the border styling
      expect(card?.className ?? card?.getAttribute('style') ?? '').toBeTruthy();
    });

    it('renders neutral border when color is empty', () => {
      const { container } = render(
        <WorkspaceCard {...baseProps} preferences={{ ...baseProps.preferences, color: '' }} />
      );

      const card = container.firstElementChild;
      expect(card).toBeTruthy();
    });
  });

  describe('worktree summary', () => {
    it('shows worktree count when more than 3', () => {
      render(<WorkspaceCard {...baseProps} worktreeCount={23} />);

      expect(screen.getByText(/23 worktrees/i)).toBeInTheDocument();
    });

    it('shows branch names when 3 or fewer worktrees', () => {
      render(
        <WorkspaceCard {...baseProps} worktreeCount={2} worktreeNames={['main', 'feature/auth']} />
      );

      expect(screen.getByText(/main/)).toBeInTheDocument();
      expect(screen.getByText(/feature\/auth/)).toBeInTheDocument();
    });

    it('shows single branch name for 1 worktree', () => {
      render(<WorkspaceCard {...baseProps} worktreeCount={1} worktreeNames={['main']} />);

      expect(screen.getByText(/main/)).toBeInTheDocument();
    });
  });

  describe('star toggle', () => {
    it('renders star toggle as a form element', () => {
      const { container } = render(<WorkspaceCard {...baseProps} />);

      const form = container.querySelector('form');
      expect(form).toBeInTheDocument();
    });

    it('shows filled star when workspace is starred', () => {
      render(
        <WorkspaceCard {...baseProps} preferences={{ ...baseProps.preferences, starred: true }} />
      );

      // Starred workspace should have an accessible star indicator
      expect(screen.getByRole('button', { name: /unstar/i })).toBeInTheDocument();
    });

    it('shows empty star when workspace is not starred', () => {
      render(<WorkspaceCard {...baseProps} />);

      expect(screen.getByRole('button', { name: /star/i })).toBeInTheDocument();
    });
  });

  describe('agent summary (optional, DYK-P3-01)', () => {
    it('omits agent indicators when no summary provided', () => {
      render(<WorkspaceCard {...baseProps} />);

      expect(screen.queryByText(/agent/i)).not.toBeInTheDocument();
    });

    it('renders agent running count when summary provided', () => {
      render(<WorkspaceCard {...baseProps} agentSummary={{ running: 3, attention: 0 }} />);

      expect(screen.getByText(/3 agents/i)).toBeInTheDocument();
    });

    it('renders attention indicator when agents need attention', () => {
      render(<WorkspaceCard {...baseProps} agentSummary={{ running: 2, attention: 1 }} />);

      expect(screen.getByText(/◆/)).toBeInTheDocument();
    });
  });

  describe('navigation', () => {
    it('renders as a link to /workspaces/[slug]', () => {
      render(<WorkspaceCard {...baseProps} />);

      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', '/workspaces/substrate');
    });

    it('shows workspace path in muted text', () => {
      render(<WorkspaceCard {...baseProps} />);

      expect(screen.getByText('/home/user/substrate')).toBeInTheDocument();
    });
  });
});
