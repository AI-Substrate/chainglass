/**
 * PanelHeader Component Tests
 *
 * Purpose: Verify the shared header renders title, mode buttons (icon-only with tooltip),
 * action buttons, and fires callbacks correctly.
 *
 * Phase 1: Panel Infrastructure — Plan 043
 * DYK-05: Icon-only mode buttons with tooltips
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

// We'll import once created
import { PanelHeader } from '@/features/_platform/panel-layout/components/panel-header';

const TreeIcon = () => <span data-testid="tree-icon">T</span>;
const ChangesIcon = () => <span data-testid="changes-icon">C</span>;
const RefreshIcon = () => <span data-testid="refresh-icon">R</span>;

describe('PanelHeader', () => {
  it('renders title text', () => {
    render(<PanelHeader title="Files" />);
    expect(screen.getByText('Files')).toBeInTheDocument();
  });

  it('renders mode buttons with aria-labels', () => {
    render(
      <PanelHeader
        title="Files"
        modes={[
          { key: 'tree', icon: <TreeIcon />, label: 'Tree view' },
          { key: 'changes', icon: <ChangesIcon />, label: 'Changes view' },
        ]}
        activeMode="tree"
        onModeChange={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Tree view' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Changes view' })).toBeInTheDocument();
  });

  it('highlights active mode button', () => {
    render(
      <PanelHeader
        title="Files"
        modes={[
          { key: 'tree', icon: <TreeIcon />, label: 'Tree view' },
          { key: 'changes', icon: <ChangesIcon />, label: 'Changes view' },
        ]}
        activeMode="tree"
        onModeChange={vi.fn()}
      />
    );

    const activeBtn = screen.getByRole('button', { name: 'Tree view' });
    expect(activeBtn.className).toContain('bg-accent');
  });

  it('fires onModeChange when mode button clicked', async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();

    render(
      <PanelHeader
        title="Files"
        modes={[
          { key: 'tree', icon: <TreeIcon />, label: 'Tree view' },
          { key: 'changes', icon: <ChangesIcon />, label: 'Changes view' },
        ]}
        activeMode="tree"
        onModeChange={onModeChange}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Changes view' }));
    expect(onModeChange).toHaveBeenCalledWith('changes');
  });

  it('renders action buttons and fires callbacks', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();

    render(
      <PanelHeader
        title="Files"
        actions={[{ icon: <RefreshIcon />, label: 'Refresh', onClick: onRefresh }]}
      />
    );

    const refreshBtn = screen.getByRole('button', { name: 'Refresh' });
    await user.click(refreshBtn);
    expect(onRefresh).toHaveBeenCalled();
  });

  it('renders no mode buttons when modes not provided', () => {
    render(<PanelHeader title="Files" />);
    // Only title visible, no buttons except actions
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders subtitle when provided', () => {
    render(<PanelHeader title="Files" subtitle={<span>3 changed</span>} />);
    expect(screen.getByText('3 changed')).toBeInTheDocument();
  });

  it('renders no subtitle when not provided', () => {
    render(<PanelHeader title="Files" />);
    expect(screen.queryByTestId('panel-header-subtitle')).not.toBeInTheDocument();
  });
});
