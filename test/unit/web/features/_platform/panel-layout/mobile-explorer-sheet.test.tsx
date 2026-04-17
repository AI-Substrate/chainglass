import { MobileExplorerSheet } from '@/features/_platform/panel-layout/components/mobile-explorer-sheet';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

describe('MobileExplorerSheet', () => {
  it('renders trigger icon button', () => {
    render(
      <MobileExplorerSheet open={false} onOpenChange={() => {}}>
        <div>Explorer</div>
      </MobileExplorerSheet>
    );
    const trigger = screen.getByRole('button', { name: /search/i });
    expect(trigger).toBeDefined();
  });

  it('renders custom trigger when provided', () => {
    render(
      <MobileExplorerSheet
        open={false}
        onOpenChange={() => {}}
        trigger={<button type="button">Custom</button>}
      >
        <div>Explorer</div>
      </MobileExplorerSheet>
    );
    expect(screen.getByRole('button', { name: /custom/i })).toBeDefined();
  });

  it('renders children inside sheet when open', () => {
    render(
      <MobileExplorerSheet open={true} onOpenChange={() => {}}>
        <div>Explorer Content</div>
      </MobileExplorerSheet>
    );
    expect(screen.getByText('Explorer Content')).toBeDefined();
  });

  it('calls onOpenChange when sheet closes', () => {
    const onOpenChange = vi.fn();
    render(
      <MobileExplorerSheet open={true} onOpenChange={onOpenChange}>
        <div>Explorer</div>
      </MobileExplorerSheet>
    );
    // Close via the X button (SheetContent renders one)
    const closeButton = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeButton);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
