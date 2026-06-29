/**
 * Plan 088 Phase 6 — T005 discoverable launch affordance (DL-003).
 *
 * Remote-view was previously reachable ONLY via the command palette (`remote-view.attach`) or a
 * hand-typed `?view=remote` URL — invisible to a first-time user (DL-003). This pins the visible
 * control: an accessible, labelled icon button that fires its `onLaunch` callback on click. The
 * parent (browser-client) maps `onLaunch` → `setParams({ view: 'remote', rv: null })`; that wiring
 * is asserted at the integration layer, but the discoverable+clickable contract lives here so a
 * refactor can't silently drop the button or its accessible name back to palette-only.
 */
import { RemoteViewLaunchButton } from '@/features/088-remote-view/components/remote-view-launch-button';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

describe('RemoteViewLaunchButton (T005 — discoverable launch)', () => {
  it('renders a visible control with an accessible name (no palette/URL knowledge needed)', () => {
    render(<RemoteViewLaunchButton onLaunch={() => {}} />);
    const btn = screen.getByRole('button', { name: 'Open Remote View' });
    expect(btn).toBeInTheDocument();
    // A title tooltip so the icon-only control is self-describing on hover.
    expect(btn).toHaveAttribute('title');
  });

  it('fires onLaunch exactly once when clicked (parent → setParams view=remote, rv=null)', () => {
    const onLaunch = vi.fn();
    render(<RemoteViewLaunchButton onLaunch={onLaunch} />);
    fireEvent.click(screen.getByTestId('remote-view-launch'));
    expect(onLaunch).toHaveBeenCalledTimes(1);
  });

  it('is a real button (keyboard-focusable, not a div) so it is reachable without a mouse', () => {
    render(<RemoteViewLaunchButton onLaunch={() => {}} />);
    expect(screen.getByTestId('remote-view-launch').tagName).toBe('BUTTON');
  });
});
