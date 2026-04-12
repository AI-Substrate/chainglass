/**
 * MobilePanelShell Tests — TDD
 *
 * Tests for the mobile layout container that composes
 * MobileSwipeStrip + MobileView with transform-based view switching.
 *
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { MobilePanelShell } from '../../../../../../apps/web/src/features/_platform/panel-layout/components/mobile-panel-shell';

const twoViews = [
  {
    label: 'Files',
    icon: <span data-testid="icon-files">F</span>,
    content: <div data-testid="files-content">File Tree</div>,
  },
  {
    label: 'Content',
    icon: <span data-testid="icon-content">C</span>,
    content: <div data-testid="content-view">Viewer</div>,
  },
];

const singleView = [
  {
    label: 'Terminal',
    icon: <span data-testid="icon-terminal">T</span>,
    content: <div data-testid="terminal-content">Terminal</div>,
  },
];

describe('MobilePanelShell', () => {
  it('renders all view content', () => {
    render(<MobilePanelShell views={twoViews} />);
    expect(screen.getByTestId('files-content')).toBeInTheDocument();
    expect(screen.getByTestId('content-view')).toBeInTheDocument();
  });

  it('renders the swipe strip with view labels', () => {
    render(<MobilePanelShell views={twoViews} />);
    expect(screen.getByText('Files')).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('starts with first view active', () => {
    const { container } = render(<MobilePanelShell views={twoViews} />);
    const viewContainer = container.querySelector(
      '[data-testid="mobile-view-container"]'
    ) as HTMLElement;
    expect(viewContainer.style.transform).toBe('translateX(-0%)');
  });

  it('switches view on tab tap', () => {
    const { container } = render(<MobilePanelShell views={twoViews} />);
    fireEvent.click(screen.getByText('Content'));
    const viewContainer = container.querySelector(
      '[data-testid="mobile-view-container"]'
    ) as HTMLElement;
    expect(viewContainer.style.transform).toBe('translateX(-100%)');
  });

  it('applies CSS transition for smooth animation', () => {
    const { container } = render(<MobilePanelShell views={twoViews} />);
    const viewContainer = container.querySelector(
      '[data-testid="mobile-view-container"]'
    ) as HTMLElement;
    expect(viewContainer.style.transition).toContain('transform');
    expect(viewContainer.style.transition).toContain('350ms');
  });

  it('hides inactive views with visibility hidden', () => {
    const { container } = render(<MobilePanelShell views={twoViews} />);
    // First view is active, second is hidden
    const views = container.querySelectorAll('[data-testid="mobile-view-container"] > div');
    expect((views[0] as HTMLElement).style.visibility).toBe('visible');
    expect((views[1] as HTMLElement).style.visibility).toBe('hidden');
  });

  it('keeps all views mounted when switching', () => {
    render(<MobilePanelShell views={twoViews} />);
    // Switch to Content view
    fireEvent.click(screen.getByText('Content'));
    // Both views should still be in DOM
    expect(screen.getByTestId('files-content')).toBeInTheDocument();
    expect(screen.getByTestId('content-view')).toBeInTheDocument();
  });

  it('works with a single view', () => {
    render(<MobilePanelShell views={singleView} />);
    expect(screen.getByTestId('terminal-content')).toBeInTheDocument();
    // Tab label "Terminal" appears in strip button
    expect(screen.getByRole('button', { name: /Terminal/i })).toBeInTheDocument();
  });

  it('calls onViewChange callback when view switches', () => {
    const onViewChange = vi.fn();
    render(<MobilePanelShell views={twoViews} onViewChange={onViewChange} />);
    fireEvent.click(screen.getByText('Content'));
    expect(onViewChange).toHaveBeenCalledWith(1);
  });

  it('applies data-terminal-overlay-anchor to view with isTerminal flag', () => {
    const terminalViews = [
      {
        label: 'Terminal',
        icon: <span>T</span>,
        content: <div>Terminal</div>,
        isTerminal: true,
      },
    ];
    const { container } = render(<MobilePanelShell views={terminalViews} />);
    const anchor = container.querySelector('[data-terminal-overlay-anchor]');
    expect(anchor).toBeInTheDocument();
  });

  describe('lazy mount', () => {
    const lazyViews = [
      { label: 'Files', icon: <span>F</span>, content: <div data-testid="files">Files</div> },
      { label: 'Content', icon: <span>C</span>, content: <div data-testid="content">Content</div> },
      {
        label: 'Terminal',
        icon: <span>T</span>,
        content: <div data-testid="terminal">Terminal</div>,
        lazy: true,
      },
    ];

    it('renders non-lazy view content immediately', () => {
      render(<MobilePanelShell views={lazyViews} />);
      expect(screen.getByTestId('files')).toBeInTheDocument();
      expect(screen.getByTestId('content')).toBeInTheDocument();
    });

    it('does not render lazy view content before activation', () => {
      render(<MobilePanelShell views={lazyViews} />);
      expect(screen.queryByTestId('terminal')).not.toBeInTheDocument();
    });

    it('renders lazy view content after switching to it', () => {
      render(<MobilePanelShell views={lazyViews} />);
      fireEvent.click(screen.getByText('Terminal'));
      expect(screen.getByTestId('terminal')).toBeInTheDocument();
    });

    it('keeps activated lazy views mounted after switching away and back', () => {
      render(<MobilePanelShell views={lazyViews} />);
      fireEvent.click(screen.getByText('Terminal'));
      expect(screen.getByTestId('terminal')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Files/ }));
      expect(screen.getByTestId('terminal')).toBeInTheDocument();
    });

    it('activates lazy view immediately when initialActiveIndex points to it', () => {
      render(<MobilePanelShell views={lazyViews} initialActiveIndex={2} />);
      expect(screen.getByTestId('terminal')).toBeInTheDocument();
    });

    it('clamps invalid initialActiveIndex to last valid index', () => {
      const { container } = render(<MobilePanelShell views={lazyViews} initialActiveIndex={99} />);
      const viewContainer = container.querySelector(
        '[data-testid="mobile-view-container"]'
      ) as HTMLElement;
      expect(viewContainer.style.transform).toBe('translateX(-200%)');
      expect(screen.getByTestId('terminal')).toBeInTheDocument();
    });

    it('defaults to index 0 when initialActiveIndex is NaN', () => {
      const { container } = render(
        <MobilePanelShell views={lazyViews} initialActiveIndex={Number.NaN} />
      );
      const viewContainer = container.querySelector(
        '[data-testid="mobile-view-container"]'
      ) as HTMLElement;
      expect(viewContainer.style.transform).toBe('translateX(-0%)');
      expect(screen.queryByTestId('terminal')).not.toBeInTheDocument();
    });
  });
});
