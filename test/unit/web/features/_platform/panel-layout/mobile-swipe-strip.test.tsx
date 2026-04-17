/**
 * MobileSwipeStrip Tests — TDD
 *
 * Tests for the segmented control with tap switching,
 * swipe detection, and sliding pill indicator.
 *
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { MobileSwipeStrip } from '../../../../../../apps/web/src/features/_platform/panel-layout/components/mobile-swipe-strip';

const mockViews = [
  { label: 'Files', icon: <span data-testid="icon-files">F</span> },
  { label: 'Content', icon: <span data-testid="icon-content">C</span> },
];

describe('MobileSwipeStrip', () => {
  it('renders all view labels', () => {
    render(<MobileSwipeStrip views={mockViews} activeIndex={0} onViewChange={() => {}} />);
    expect(screen.getByText('Files')).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('renders view icons', () => {
    render(<MobileSwipeStrip views={mockViews} activeIndex={0} onViewChange={() => {}} />);
    expect(screen.getByTestId('icon-files')).toBeInTheDocument();
    expect(screen.getByTestId('icon-content')).toBeInTheDocument();
  });

  it('calls onViewChange when a tab is tapped', () => {
    const onViewChange = vi.fn();
    render(<MobileSwipeStrip views={mockViews} activeIndex={0} onViewChange={onViewChange} />);

    fireEvent.click(screen.getByText('Content'));
    expect(onViewChange).toHaveBeenCalledWith(1);
  });

  it('does not call onViewChange when active tab is tapped', () => {
    const onViewChange = vi.fn();
    render(<MobileSwipeStrip views={mockViews} activeIndex={0} onViewChange={onViewChange} />);

    fireEvent.click(screen.getByText('Files'));
    expect(onViewChange).not.toHaveBeenCalled();
  });

  it('has 42px height', () => {
    const { container } = render(
      <MobileSwipeStrip views={mockViews} activeIndex={0} onViewChange={() => {}} />
    );
    const strip = container.firstElementChild as HTMLElement;
    expect(strip.style.height).toBe('42px');
  });

  it('renders a sliding pill indicator', () => {
    const { container } = render(
      <MobileSwipeStrip views={mockViews} activeIndex={0} onViewChange={() => {}} />
    );
    const pill = container.querySelector('[data-testid="swipe-strip-pill"]');
    expect(pill).toBeInTheDocument();
  });

  it('positions pill based on activeIndex', () => {
    const { container, rerender } = render(
      <MobileSwipeStrip views={mockViews} activeIndex={0} onViewChange={() => {}} />
    );
    const pill0 = container.querySelector('[data-testid="swipe-strip-pill"]') as HTMLElement;
    const transform0 = pill0.style.transform;

    rerender(<MobileSwipeStrip views={mockViews} activeIndex={1} onViewChange={() => {}} />);
    const pill1 = container.querySelector('[data-testid="swipe-strip-pill"]') as HTMLElement;
    const transform1 = pill1.style.transform;
    expect(transform1).not.toBe(transform0);
  });

  it('renders optional rightAction slot', () => {
    render(
      <MobileSwipeStrip
        views={mockViews}
        activeIndex={0}
        onViewChange={() => {}}
        rightAction={
          <button type="button" data-testid="search-btn">
            Search
          </button>
        }
      />
    );
    expect(screen.getByTestId('search-btn')).toBeInTheDocument();
  });

  describe('swipe detection', () => {
    it('calls onViewChange with next index on swipe left (distance > 50px)', () => {
      const onViewChange = vi.fn();
      const { container } = render(
        <MobileSwipeStrip views={mockViews} activeIndex={0} onViewChange={onViewChange} />
      );
      const strip = container.firstElementChild as HTMLElement;

      // Simulate pointer down → pointer up with > 50px left swipe
      fireEvent.pointerDown(strip, { clientX: 200, pointerId: 1 });
      fireEvent.pointerUp(strip, { clientX: 100, pointerId: 1 });

      expect(onViewChange).toHaveBeenCalledWith(1);
    });

    it('calls onViewChange with previous index on swipe right (distance > 50px)', () => {
      const onViewChange = vi.fn();
      const { container } = render(
        <MobileSwipeStrip views={mockViews} activeIndex={1} onViewChange={onViewChange} />
      );
      const strip = container.firstElementChild as HTMLElement;

      fireEvent.pointerDown(strip, { clientX: 100, pointerId: 1 });
      fireEvent.pointerUp(strip, { clientX: 200, pointerId: 1 });

      expect(onViewChange).toHaveBeenCalledWith(0);
    });

    it('does not switch past the last view', () => {
      const onViewChange = vi.fn();
      const { container } = render(
        <MobileSwipeStrip views={mockViews} activeIndex={1} onViewChange={onViewChange} />
      );
      const strip = container.firstElementChild as HTMLElement;

      fireEvent.pointerDown(strip, { clientX: 200, pointerId: 1 });
      fireEvent.pointerUp(strip, { clientX: 100, pointerId: 1 });

      expect(onViewChange).not.toHaveBeenCalled();
    });

    it('does not switch past the first view', () => {
      const onViewChange = vi.fn();
      const { container } = render(
        <MobileSwipeStrip views={mockViews} activeIndex={0} onViewChange={onViewChange} />
      );
      const strip = container.firstElementChild as HTMLElement;

      fireEvent.pointerDown(strip, { clientX: 100, pointerId: 1 });
      fireEvent.pointerUp(strip, { clientX: 200, pointerId: 1 });

      expect(onViewChange).not.toHaveBeenCalled();
    });

    it('ignores small movements (< 50px)', () => {
      const onViewChange = vi.fn();
      const { container } = render(
        <MobileSwipeStrip views={mockViews} activeIndex={0} onViewChange={onViewChange} />
      );
      const strip = container.firstElementChild as HTMLElement;

      fireEvent.pointerDown(strip, { clientX: 200, pointerId: 1 });
      fireEvent.pointerUp(strip, { clientX: 180, pointerId: 1 });

      expect(onViewChange).not.toHaveBeenCalled();
    });
  });
});
