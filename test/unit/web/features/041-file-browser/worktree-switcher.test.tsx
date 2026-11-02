/**
 * WorktreeSwitcher — the explorer-bar dropdown that changes which worktree the
 * file browser shows in the same tab (the terminal stays on its own worktree).
 */

import { WorktreeSwitcher } from '@/features/041-file-browser/components/worktree-switcher';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

// Main first, then most recently updated: the order the browser page hands over.
const worktrees = [
  { path: '/repos/ai-manu', branch: 'main', isDetached: false },
  { path: '/repos/ai-manu-007', branch: '007-recent', isDetached: false },
  { path: '/repos/ai-manu-042', branch: '042-older', isDetached: false },
];

describe('WorktreeSwitcher', () => {
  it('shows the current worktree and lists the rest in the order given', async () => {
    const user = userEvent.setup();
    render(
      <WorktreeSwitcher worktrees={worktrees} currentWorktree="/repos/ai-manu" onSwitch={vi.fn()} />
    );

    await user.click(screen.getByRole('button', { name: 'Worktree: main' }));

    const names = within(screen.getByRole('dialog'))
      .getAllByRole('button')
      .map((b) => b.textContent);
    // A numeric-prefix sort would put 042 above 007; recency order must survive.
    expect(names).toEqual(['main', '007-recent', '042-older']);
  });

  it('switches to the picked worktree and ignores picking the current one', async () => {
    const user = userEvent.setup();
    const onSwitch = vi.fn();
    render(
      <WorktreeSwitcher
        worktrees={worktrees}
        currentWorktree="/repos/ai-manu"
        onSwitch={onSwitch}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Worktree: main' }));
    await user.click(screen.getByRole('button', { name: '042-older' }));
    expect(onSwitch).toHaveBeenCalledWith('/repos/ai-manu-042');

    await user.click(screen.getByRole('button', { name: 'Worktree: main' }));
    await user.click(screen.getByRole('button', { name: 'main' }));
    expect(onSwitch).toHaveBeenCalledTimes(1);
  });
});
