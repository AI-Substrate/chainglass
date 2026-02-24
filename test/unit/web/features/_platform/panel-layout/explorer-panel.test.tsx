/**
 * ExplorerPanel Component Tests
 *
 * Purpose: Verify the top utility bar renders path, supports edit mode,
 * dispatches handler chain on Enter, reverts on Escape, shows spinner,
 * and exposes focusInput() ref.
 *
 * Phase 1: Panel Infrastructure — Plan 043
 * DYK-03: ASCII spinner during processing
 * DYK-04: forwardRef + useImperativeHandle for focusInput()
 */

import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ExplorerPanel } from '@/features/_platform/panel-layout/components/explorer-panel';
import type {
  BarContext,
  BarHandler,
  ExplorerPanelHandle,
} from '@/features/_platform/panel-layout/types';

const makeContext = (overrides?: Partial<BarContext>): BarContext => ({
  slug: 'test-ws',
  worktreePath: '/tmp/test',
  fileExists: vi.fn().mockResolvedValue(true),
  pathExists: vi.fn().mockResolvedValue('file' as const),
  navigateToFile: vi.fn(),
  navigateToDirectory: vi.fn(),
  showError: vi.fn(),
  ...overrides,
});

describe('ExplorerPanel', () => {
  it('renders file path text', () => {
    render(
      <ExplorerPanel
        filePath="src/lib/utils.ts"
        handlers={[]}
        context={makeContext()}
        onCopy={vi.fn()}
      />
    );
    expect(screen.getByText('src/lib/utils.ts')).toBeInTheDocument();
  });

  it('shows placeholder when no file path', () => {
    render(
      <ExplorerPanel
        filePath=""
        handlers={[]}
        context={makeContext()}
        onCopy={vi.fn()}
        placeholder="Type a path..."
      />
    );
    expect(screen.getByPlaceholderText('Type a path...')).toBeInTheDocument();
  });

  it('fires onCopy when copy button clicked', async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn();

    render(
      <ExplorerPanel
        filePath="src/utils.ts"
        handlers={[]}
        context={makeContext()}
        onCopy={onCopy}
      />
    );

    await user.click(screen.getByRole('button', { name: /copy/i }));
    expect(onCopy).toHaveBeenCalled();
  });

  it('enters edit mode on path click', async () => {
    const user = userEvent.setup();

    render(
      <ExplorerPanel
        filePath="src/utils.ts"
        handlers={[]}
        context={makeContext()}
        onCopy={vi.fn()}
      />
    );

    await user.click(screen.getByText('src/utils.ts'));
    const input = screen.getByRole('textbox');
    expect(input).toHaveFocus();
    expect(input).toHaveValue('src/utils.ts');
  });

  it('runs handler chain on Enter and stops at first true', async () => {
    const user = userEvent.setup();
    const handler1: BarHandler = vi.fn().mockResolvedValue(false);
    const handler2: BarHandler = vi.fn().mockResolvedValue(true);
    const handler3: BarHandler = vi.fn().mockResolvedValue(false);
    const ctx = makeContext();

    render(
      <ExplorerPanel
        filePath=""
        handlers={[handler1, handler2, handler3]}
        context={ctx}
        onCopy={vi.fn()}
        placeholder="Type..."
      />
    );

    const input = screen.getByPlaceholderText('Type...');
    await user.clear(input);
    await user.type(input, 'src/foo.ts{enter}');

    // Wait for async handlers
    await vi.waitFor(() => {
      expect(handler1).toHaveBeenCalledWith('src/foo.ts', ctx);
      expect(handler2).toHaveBeenCalledWith('src/foo.ts', ctx);
      expect(handler3).not.toHaveBeenCalled();
    });
  });

  it('reverts on Escape', async () => {
    const user = userEvent.setup();

    render(
      <ExplorerPanel
        filePath="src/utils.ts"
        handlers={[]}
        context={makeContext()}
        onCopy={vi.fn()}
      />
    );

    await user.click(screen.getByText('src/utils.ts'));
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'changed');
    await user.keyboard('{Escape}');

    // Should revert to display mode with original path
    expect(screen.getByText('src/utils.ts')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('does nothing on Enter with empty input', async () => {
    const user = userEvent.setup();
    const handler: BarHandler = vi.fn().mockResolvedValue(true);

    render(
      <ExplorerPanel
        filePath=""
        handlers={[handler]}
        context={makeContext()}
        onCopy={vi.fn()}
        placeholder="Type..."
      />
    );

    const input = screen.getByPlaceholderText('Type...');
    await user.type(input, '{enter}');
    expect(handler).not.toHaveBeenCalled();
  });

  it('exposes focusInput() via ref', () => {
    const ref = createRef<ExplorerPanelHandle>();

    render(
      <ExplorerPanel
        ref={ref}
        filePath="src/utils.ts"
        handlers={[]}
        context={makeContext()}
        onCopy={vi.fn()}
      />
    );

    expect(ref.current).toBeTruthy();
    expect(typeof ref.current?.focusInput).toBe('function');

    // Call focusInput — should enter edit mode
    act(() => {
      ref.current?.focusInput();
    });

    const input = screen.getByRole('textbox');
    expect(input).toBeInTheDocument();
  });

  it('reverts to display mode on blur', async () => {
    const user = userEvent.setup();

    render(
      <ExplorerPanel
        filePath="src/utils.ts"
        handlers={[]}
        context={makeContext()}
        onCopy={vi.fn()}
      />
    );

    await user.click(screen.getByText('src/utils.ts'));
    expect(screen.getByRole('textbox')).toBeInTheDocument();

    // Blur the input by tabbing away
    await user.tab();

    // Should revert to display mode
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('src/utils.ts')).toBeInTheDocument();
  });

  it('shows spinner while handlers are processing', async () => {
    const user = userEvent.setup();
    // Handler that takes time (controlled promise)
    let resolveHandler!: (val: boolean) => void;
    const slowHandler: BarHandler = () =>
      new Promise((resolve) => {
        resolveHandler = resolve;
      });

    render(
      <ExplorerPanel
        filePath=""
        handlers={[slowHandler]}
        context={makeContext()}
        onCopy={vi.fn()}
        placeholder="Type..."
      />
    );

    const input = screen.getByPlaceholderText('Type...');
    await user.type(input, 'src/foo.ts{enter}');

    // Spinner should be visible (one of | / — \)
    await vi.waitFor(() => {
      expect(screen.getByText(/[|/—\\]/)).toBeInTheDocument();
    });
    // Copy button should be hidden
    expect(screen.queryByRole('button', { name: /copy/i })).not.toBeInTheDocument();

    // Resolve the handler
    await act(async () => {
      resolveHandler(true);
    });

    // Spinner gone, copy button back
    expect(screen.queryByText(/[|/—\\]/)).not.toBeInTheDocument();
  });

  it('exits edit mode when filePath updates externally', () => {
    const { rerender } = render(
      <ExplorerPanel
        filePath=""
        handlers={[]}
        context={makeContext()}
        onCopy={vi.fn()}
        placeholder="Type..."
      />
    );

    // Initially in input mode (no filePath)
    expect(screen.getByPlaceholderText('Type...')).toBeInTheDocument();

    // External filePath update
    rerender(
      <ExplorerPanel
        filePath="src/new-file.ts"
        handlers={[]}
        context={makeContext()}
        onCopy={vi.fn()}
        placeholder="Type..."
      />
    );

    // Should show the path in display mode
    expect(screen.getByText('src/new-file.ts')).toBeInTheDocument();
  });
});
