/**
 * PanelShell Responsive Branch Tests — TDD
 *
 * Tests that PanelShell renders MobilePanelShell on phone viewports
 * when mobileViews is provided, and desktop layout otherwise.
 *
 * @vitest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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
});
