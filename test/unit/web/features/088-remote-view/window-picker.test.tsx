/**
 * Plan 088 Phase 3 — T003: WindowPicker pure component.
 *
 * Why: the picker is pure/deterministic (no canvas/WebCodecs), so it sits OUTSIDE the
 *   Hybrid GPU deviation and is cheaply unit-testable — its state branching (loading /
 *   error / empty / grid) and the attach callback are the AC-1 contract a regression
 *   could silently break (the smoke covers the live path, this covers the logic).
 * Contract: given windows → one attach-able card per window emitting onAttach(windowId);
 *   loading/error/empty render their dedicated states; the error state's Retry calls onRefresh.
 * Usage Notes: data is injected (the real source is useRemoteViewWindows in Phase 3, the
 *   route in Phase 5) — the picker never fetches, so it's testable with plain props.
 * Quality Contribution: locks AC-1's window-list UX so a refactor of the data path can't
 *   regress the picker's rendering or the attach wiring.
 * Worked Example: click card testid `remote-view-window-34202` → onAttach(34202).
 */

import { WindowPicker } from '@/features/088-remote-view/components/window-picker';
import type { WindowDescriptor } from '@/features/088-remote-view/protocol/messages';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const WINDOWS: WindowDescriptor[] = [
  { id: 34202, app: 'Godot', title: 'spike-target', pixelWidth: 800, pixelHeight: 656, scale: 2 },
  { id: 9001, app: 'Simulator', title: 'iPhone 15', pixelWidth: 1170, pixelHeight: 2532, scale: 3 },
];

describe('WindowPicker', () => {
  it('renders a card per window and emits onAttach(windowId) on click', async () => {
    const onAttach = vi.fn();
    render(
      <WindowPicker
        windows={WINDOWS}
        loading={false}
        error={null}
        onAttach={onAttach}
        onRefresh={vi.fn()}
      />
    );
    expect(screen.getByText('Godot')).not.toBeNull();
    expect(screen.getByText('iPhone 15')).not.toBeNull();
    expect(screen.getByText('800×656')).not.toBeNull();

    await userEvent.click(screen.getByTestId('remote-view-window-34202'));
    expect(onAttach).toHaveBeenCalledWith(34202);
    expect(onAttach).toHaveBeenCalledTimes(1);
  });

  it('renders loading, empty, and error states (error Retry calls onRefresh)', async () => {
    const onRefresh = vi.fn();
    const { rerender } = render(
      <WindowPicker
        windows={[]}
        loading={true}
        error={null}
        onAttach={vi.fn()}
        onRefresh={vi.fn()}
      />
    );
    expect(screen.queryByTestId('remote-view-window-picker-loading')).not.toBeNull();

    rerender(
      <WindowPicker
        windows={[]}
        loading={false}
        error={null}
        onAttach={vi.fn()}
        onRefresh={vi.fn()}
      />
    );
    expect(screen.queryByTestId('remote-view-window-picker-empty')).not.toBeNull();

    rerender(
      <WindowPicker
        windows={[]}
        loading={false}
        error="boom"
        onAttach={vi.fn()}
        onRefresh={onRefresh}
      />
    );
    expect(screen.queryByTestId('remote-view-window-picker-error')).not.toBeNull();
    await userEvent.click(screen.getByText('Retry'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
