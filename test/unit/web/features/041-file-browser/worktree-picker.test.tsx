/**
 * WorktreePicker Component Tests
 *
 * Purpose: Verify searchable worktree picker renders list, filters,
 *          sorts starred to top, and handles keyboard navigation.
 * Quality Contribution: Prevents regressions in workspace navigation —
 *          critical for 23+ worktree workspaces.
 * Acceptance Criteria: AC-9, AC-10
 *
 * Phase 3: UI Overhaul — Plan 041: File Browser
 * DYK-P3-04: Pure presentational — props in, callbacks out
 */

import { WorktreePicker } from '@/features/041-file-browser/components/worktree-picker';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

// ============ T008: WorktreePicker Tests (RED) ============

const sampleWorktrees = [
  { path: '/home/user/substrate', branch: 'main', isDetached: false },
  { path: '/home/user/substrate-041', branch: '041-file-browser', isDetached: false },
  { path: '/home/user/substrate-002', branch: '002-agents', isDetached: false },
  { path: '/home/user/substrate-033', branch: '033-real-agent-pods', isDetached: false },
];

const manyWorktrees = Array.from({ length: 23 }, (_, i) => ({
  path: `/home/user/substrate-${String(i).padStart(3, '0')}`,
  branch: `${String(i).padStart(3, '0')}-branch-${i}`,
  isDetached: false,
}));

describe('WorktreePicker', () => {
  describe('rendering', () => {
    it('renders all worktrees in the list', () => {
      render(
        <WorktreePicker
          worktrees={sampleWorktrees}
          currentWorktree="/home/user/substrate"
          onSelect={vi.fn()}
        />
      );

      expect(screen.getByText('main')).toBeInTheDocument();
      expect(screen.getByText('041-file-browser')).toBeInTheDocument();
      expect(screen.getByText('002-agents')).toBeInTheDocument();
    });

    it('shows search/filter input', () => {
      render(
        <WorktreePicker
          worktrees={sampleWorktrees}
          currentWorktree="/home/user/substrate"
          onSelect={vi.fn()}
        />
      );

      expect(screen.getByPlaceholderText(/filter/i)).toBeInTheDocument();
    });

    it('handles 23+ worktrees without performance issues', () => {
      render(
        <WorktreePicker
          worktrees={manyWorktrees}
          currentWorktree={manyWorktrees[0].path}
          onSelect={vi.fn()}
        />
      );

      // Should render all items (scrollable)
      expect(screen.getAllByRole('button').length).toBe(23);
    });
  });

  describe('filtering', () => {
    it('filters worktrees by search term', async () => {
      const user = userEvent.setup();
      render(
        <WorktreePicker
          worktrees={sampleWorktrees}
          currentWorktree="/home/user/substrate"
          onSelect={vi.fn()}
        />
      );

      const input = screen.getByPlaceholderText(/filter/i);
      await user.type(input, '041');

      expect(screen.getByText('041-file-browser')).toBeInTheDocument();
      expect(screen.queryByText('002-agents')).not.toBeInTheDocument();
    });

    it('shows all worktrees when search is empty', async () => {
      const user = userEvent.setup();
      render(
        <WorktreePicker
          worktrees={sampleWorktrees}
          currentWorktree="/home/user/substrate"
          onSelect={vi.fn()}
        />
      );

      const input = screen.getByPlaceholderText(/filter/i);
      await user.type(input, '041');
      await user.clear(input);

      expect(screen.getAllByRole('button').length).toBe(4);
    });
  });

  describe('starred sorting', () => {
    it('shows starred worktrees at the top', () => {
      render(
        <WorktreePicker
          worktrees={sampleWorktrees}
          starredPaths={['/home/user/substrate-041']}
          currentWorktree="/home/user/substrate"
          onSelect={vi.fn()}
        />
      );

      const options = screen.getAllByRole('button');
      // First option should be the starred one
      expect(options[0]).toHaveTextContent('041-file-browser');
    });
  });

  describe('selection', () => {
    it('calls onSelect when a worktree is clicked', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      render(
        <WorktreePicker
          worktrees={sampleWorktrees}
          currentWorktree="/home/user/substrate"
          onSelect={onSelect}
        />
      );

      await user.click(screen.getByText('041-file-browser'));
      expect(onSelect).toHaveBeenCalledWith('/home/user/substrate-041');
    });

    it('highlights the current worktree', () => {
      render(
        <WorktreePicker
          worktrees={sampleWorktrees}
          currentWorktree="/home/user/substrate"
          onSelect={vi.fn()}
        />
      );

      const current = screen.getByText('main').closest('button');
      expect(current).toHaveAttribute('aria-current', 'true');
    });

    it('selects worktree via Enter key on focused button', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      render(
        <WorktreePicker
          worktrees={sampleWorktrees}
          currentWorktree="/home/user/substrate"
          onSelect={onSelect}
        />
      );

      const secondItem = screen.getByText('002-agents').closest('button');
      if (secondItem) {
        secondItem.focus();
        await user.keyboard('{Enter}');
      }
      expect(onSelect).toHaveBeenCalledWith('/home/user/substrate-002');
    });
  });
});
