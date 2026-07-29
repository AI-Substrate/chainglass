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
const PijIcon = () => <span>P</span>;

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

  it('renders pij child and exposes a selectable PIJ mode', async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();
    const modesWithPij = [...modes, { key: 'pij' as const, icon: <PijIcon />, label: 'PIJ' }];

    render(
      <LeftPanel mode="pij" onModeChange={onModeChange} modes={modesWithPij} onRefresh={vi.fn()}>
        {{
          tree: <div>Tree Content</div>,
          changes: <div>Changes Content</div>,
          pij: <div>PIJ Content</div>,
        }}
      </LeftPanel>
    );

    expect(screen.getByText('PIJ Content')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'PIJ' }));
    expect(onModeChange).toHaveBeenCalledWith('pij');
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

  it('passes subtitle to PanelHeader', () => {
    render(
      <LeftPanel
        mode="tree"
        onModeChange={vi.fn()}
        modes={modes}
        onRefresh={vi.fn()}
        subtitle={<span>3 changed +10 −5</span>}
      >
        {{ tree: <div>Tree</div>, changes: <div>Changes</div> }}
      </LeftPanel>
    );

    expect(screen.getByText('3 changed +10 −5')).toBeInTheDocument();
  });

  it('uses a PIJ-specific title and refresh without changing the default header contract', async () => {
    const user = userEvent.setup();
    const treeRefresh = vi.fn();
    const pijRefresh = vi.fn();
    const modesWithPij = [...modes, { key: 'pij' as const, icon: <PijIcon />, label: 'PIJ' }];

    const { rerender } = render(
      <LeftPanel
        mode="pij"
        onModeChange={vi.fn()}
        modes={modesWithPij}
        onRefresh={treeRefresh}
        subtitle={<span>3 changed</span>}
        modeHeaders={{
          pij: { title: 'PIJ', onRefresh: pijRefresh, refreshLabel: 'Refresh PIJ' },
        }}
      >
        {{ pij: <div>PIJ Content</div> }}
      </LeftPanel>
    );

    expect(screen.getByText('PIJ')).toBeInTheDocument();
    expect(screen.queryByText('Files')).not.toBeInTheDocument();
    expect(screen.queryByText('3 changed')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Refresh PIJ' }));
    expect(pijRefresh).toHaveBeenCalledOnce();
    expect(treeRefresh).not.toHaveBeenCalled();

    rerender(
      <LeftPanel
        mode="tree"
        onModeChange={vi.fn()}
        modes={modesWithPij}
        onRefresh={treeRefresh}
        subtitle={<span>3 changed</span>}
        modeHeaders={{
          pij: { title: 'PIJ', onRefresh: pijRefresh, refreshLabel: 'Refresh PIJ' },
        }}
      >
        {{ tree: <div>Tree Content</div> }}
      </LeftPanel>
    );

    expect(screen.getByText('Files')).toBeInTheDocument();
    expect(screen.getByText('3 changed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });

  it('keeps sessions mode on the default Files header and refresh action', () => {
    render(
      <LeftPanel
        mode="sessions"
        onModeChange={vi.fn()}
        modes={[{ key: 'sessions', icon: <span>S</span>, label: 'Sessions' }]}
        onRefresh={vi.fn()}
        subtitle={<span>2 sessions</span>}
        modeHeaders={{ pij: { title: 'PIJ' } }}
      >
        {{ sessions: <div>Session Content</div> }}
      </LeftPanel>
    );

    expect(screen.getByText('Files')).toBeInTheDocument();
    expect(screen.getByText('2 sessions')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });
});
