/**
 * PanelShell Responsive Branch Tests — TDD
 *
 * Tests that PanelShell renders MobilePanelShell on phone viewports
 * when mobileViews is provided, and desktop layout otherwise.
 *
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeMatchMedia } from '../../../../../../test/fakes/fake-match-media';

// We need dynamic import to reset module-level cache in useResponsive
let PanelShell: typeof import(
  '../../../../../../apps/web/src/features/_platform/panel-layout/components/panel-shell'
).PanelShell;

describe('PanelShell responsive branch', () => {
  let fakeMatchMedia: FakeMatchMedia;
  let originalMatchMedia: typeof window.matchMedia;
  let originalInnerWidth: number;

  function setViewportWidth(width: number) {
    Object.defineProperty(window, 'innerWidth', {
      value: width,
      writable: true,
      configurable: true,
    });
    fakeMatchMedia.setViewportWidth(width);
  }

  beforeEach(async () => {
    originalMatchMedia = window.matchMedia;
    originalInnerWidth = window.innerWidth;
    fakeMatchMedia = new FakeMatchMedia(1024);
    (window as unknown as { matchMedia: typeof window.matchMedia }).matchMedia = (query: string) =>
      fakeMatchMedia.matchMedia(query);
    // Dynamic import to get fresh module state
    const mod = await import(
      '../../../../../../apps/web/src/features/_platform/panel-layout/components/panel-shell'
    );
    PanelShell = mod.PanelShell;
  });

  afterEach(() => {
    (window as unknown as { matchMedia: typeof window.matchMedia }).matchMedia = originalMatchMedia;
    Object.defineProperty(window, 'innerWidth', {
      value: originalInnerWidth,
      writable: true,
      configurable: true,
    });
  });

  const mobileViews = [
    { label: 'Files', icon: <span>F</span>, content: <div data-testid="mobile-files">Files</div> },
    {
      label: 'Content',
      icon: <span>C</span>,
      content: <div data-testid="mobile-content">Content</div>,
    },
    {
      label: 'Terminal',
      icon: <span>T</span>,
      content: <div data-testid="mobile-terminal">Terminal</div>,
      lazy: true,
    },
  ];

  it('renders desktop layout at 1024px regardless of mobileViews', () => {
    setViewportWidth(1024);
    render(
      <PanelShell
        explorer={<div data-testid="explorer">Explorer</div>}
        left={<div data-testid="left">Left</div>}
        main={<div data-testid="main">Main</div>}
        mobileViews={mobileViews}
      />
    );
    expect(screen.getByTestId('explorer')).toBeInTheDocument();
    expect(screen.getByTestId('left')).toBeInTheDocument();
    expect(screen.getByTestId('main')).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-files')).not.toBeInTheDocument();
  });

  it('renders MobilePanelShell at 375px when mobileViews provided', () => {
    setViewportWidth(375);
    render(
      <PanelShell
        explorer={<div data-testid="explorer">Explorer</div>}
        left={<div data-testid="left">Left</div>}
        main={<div data-testid="main">Main</div>}
        mobileViews={mobileViews}
      />
    );
    expect(screen.getByTestId('mobile-files')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-content')).toBeInTheDocument();
    // Terminal is lazy — not mounted until activated
    expect(screen.queryByTestId('mobile-terminal')).not.toBeInTheDocument();
  });

  it('PanelShell passes initialMobileActiveIndex through', () => {
    setViewportWidth(375);
    render(
      <PanelShell
        explorer={<div>Explorer</div>}
        left={<div>Left</div>}
        main={<div>Main</div>}
        mobileViews={mobileViews}
        initialMobileActiveIndex={2}
      />
    );
    const container = screen.getByTestId('mobile-view-container');
    expect(container.style.transform).toBe('translateX(-200vw)');
  });

  it('PanelShell calls onMobileViewChange', () => {
    setViewportWidth(375);
    const spy = vi.fn();
    render(
      <PanelShell
        explorer={<div>Explorer</div>}
        left={<div>Left</div>}
        main={<div>Main</div>}
        mobileViews={mobileViews}
        onMobileViewChange={spy}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Content/ }));
    expect(spy).toHaveBeenCalledWith(1);
  });

  it('lazy terminal view not mounted until activated', () => {
    setViewportWidth(375);
    render(
      <PanelShell
        explorer={<div>Explorer</div>}
        left={<div>Left</div>}
        main={<div>Main</div>}
        mobileViews={mobileViews}
      />
    );
    // Terminal (index 2) is lazy and not the initial view — should not be in DOM
    expect(screen.queryByTestId('mobile-terminal')).not.toBeInTheDocument();
    // Non-lazy views are mounted
    expect(screen.getByTestId('mobile-files')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-content')).toBeInTheDocument();
  });

  it('renders desktop layout at 375px when mobileViews NOT provided', () => {
    setViewportWidth(375);
    render(
      <PanelShell
        explorer={<div data-testid="explorer">Explorer</div>}
        left={<div data-testid="left">Left</div>}
        main={<div data-testid="main">Main</div>}
      />
    );
    expect(screen.getByTestId('explorer')).toBeInTheDocument();
    expect(screen.getByTestId('left')).toBeInTheDocument();
    expect(screen.getByTestId('main')).toBeInTheDocument();
  });

  it('renders desktop layout at tablet width (768px)', () => {
    setViewportWidth(768);
    render(
      <PanelShell
        explorer={<div data-testid="explorer">Explorer</div>}
        left={<div data-testid="left">Left</div>}
        main={<div data-testid="main">Main</div>}
        mobileViews={mobileViews}
      />
    );
    expect(screen.getByTestId('explorer')).toBeInTheDocument();
    expect(screen.getByTestId('left')).toBeInTheDocument();
  });

  it('PanelShell forwards mobileActiveIndex for controlled mode', () => {
    setViewportWidth(375);
    render(
      <PanelShell
        explorer={<div>Explorer</div>}
        left={<div>Left</div>}
        main={<div>Main</div>}
        mobileViews={mobileViews}
        mobileActiveIndex={1}
      />
    );
    const container = screen.getByTestId('mobile-view-container');
    expect(container.style.transform).toBe('translateX(-100vw)');
  });

  it('PanelShell forwards mobileRightAction', () => {
    setViewportWidth(375);
    render(
      <PanelShell
        explorer={<div>Explorer</div>}
        left={<div>Left</div>}
        main={<div>Main</div>}
        mobileViews={mobileViews}
        mobileRightAction={
          <button type="button" data-testid="search-btn">
            Search
          </button>
        }
      />
    );
    expect(screen.getByTestId('search-btn')).toBeInTheDocument();
  });
});
