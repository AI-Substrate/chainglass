/**
 * LeftPanel Component Tests
 *
 * Purpose: Verify the mode-switching sidebar renders the correct child
 * based on active mode, and fires onModeChange via PanelHeader.
 *
 * Phase 1: Panel Infrastructure — Plan 043
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LeftPanel } from '@/features/_platform/panel-layout/components/left-panel';

const TreeIcon = () => <span>T</span>;
const ChangesIcon = () => <span>C</span>;

const modes = [
  { key: 'tree' as const, icon: <TreeIcon />, label: 'Tree view' },
  { key: 'changes' as const, icon: <ChangesIcon />, label: 'Changes view' },
];

describe('LeftPanel', () => {
  it('renders tree child when mode is tree', () => {
    render(
      <LeftPanel mode="tree" onModeChange={vi.fn()} modes={modes} onRefresh={vi.fn()}>
        {{ tree: <div>Tree Content</div>, changes: <div>Changes Content</div> }}
      </LeftPanel>
    );

    expect(screen.getByText('Tree Content')).toBeInTheDocument();
    expect(screen.queryByText('Changes Content')).not.toBeInTheDocument();
  });

  it('renders changes child when mode is changes', () => {
    render(
      <LeftPanel mode="changes" onModeChange={vi.fn()} modes={modes} onRefresh={vi.fn()}>
        {{ tree: <div>Tree Content</div>, changes: <div>Changes Content</div> }}
      </LeftPanel>
    );

    expect(screen.getByText('Changes Content')).toBeInTheDocument();
    expect(screen.queryByText('Tree Content')).not.toBeInTheDocument();
  });

  it('fires onModeChange when mode button clicked', async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();

    render(
      <LeftPanel mode="tree" onModeChange={onModeChange} modes={modes} onRefresh={vi.fn()}>
        {{ tree: <div>Tree</div>, changes: <div>Changes</div> }}
      </LeftPanel>
    );

    await user.click(screen.getByRole('button', { name: 'Changes view' }));
    expect(onModeChange).toHaveBeenCalledWith('changes');
  });

  it('renders refresh action button', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();

    render(
      <LeftPanel mode="tree" onModeChange={vi.fn()} modes={modes} onRefresh={onRefresh}>
        {{ tree: <div>Tree</div>, changes: <div>Changes</div> }}
      </LeftPanel>
    );

    await user.click(screen.getByRole('button', { name: /refresh/i }));
    expect(onRefresh).toHaveBeenCalled();
  });

  it('renders no mode buttons when single mode', () => {
    const singleMode = [{ key: 'tree' as const, icon: <TreeIcon />, label: 'Tree view' }];

    render(
      <LeftPanel mode="tree" onModeChange={vi.fn()} modes={singleMode} onRefresh={vi.fn()}>
        {{ tree: <div>Tree</div> }}
      </LeftPanel>
    );

    // Title visible but no mode toggle (single mode = no point switching)
    expect(screen.queryByRole('button', { name: 'Tree view' })).not.toBeInTheDocument();
  });
});
