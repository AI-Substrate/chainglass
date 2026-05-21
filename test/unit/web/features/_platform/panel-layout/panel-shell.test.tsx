/**
 * PanelShell — rightPane Slot Branch Tests
 *
 * Covers Plan 084 split-terminal-view T003 (slot present / absent) and
 * T011 (data-terminal-overlay-anchor placement assertion).
 *
 * AC-01 / AC-15: no-slot DOM preserved.
 * AC-17: anchor attribute stays on the main slot wrapper in both branches.
 *
 * @vitest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FakeMatchMedia } from '../../../../../../test/fakes/fake-match-media';

let PanelShell: typeof import(
  '../../../../../../apps/web/src/features/_platform/panel-layout/components/panel-shell'
).PanelShell;

describe('PanelShell — rightPane slot branch', () => {
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
    fakeMatchMedia = new FakeMatchMedia(1440);
    (window as unknown as { matchMedia: typeof window.matchMedia }).matchMedia = (query: string) =>
      fakeMatchMedia.matchMedia(query);
    const mod = await import(
      '../../../../../../apps/web/src/features/_platform/panel-layout/components/panel-shell'
    );
    PanelShell = mod.PanelShell;
    setViewportWidth(1440);
  });

  afterEach(() => {
    (window as unknown as { matchMedia: typeof window.matchMedia }).matchMedia = originalMatchMedia;
    Object.defineProperty(window, 'innerWidth', {
      value: originalInnerWidth,
      writable: true,
      configurable: true,
    });
  });

  // ---------- T003: slot absent (no-slot branch parity) ----------

  it('no-slot: does NOT render a ResizablePanelGroup', () => {
    const { container } = render(
      <PanelShell
        explorer={<div data-testid="explorer">Explorer</div>}
        left={<div data-testid="left">Left</div>}
        main={<div data-testid="main">Main</div>}
      />
    );
    expect(container.querySelector('[data-slot="resizable-panel-group"]')).toBeNull();
    expect(container.querySelector('[data-slot="resizable-panel"]')).toBeNull();
    expect(container.querySelector('[data-slot="resizable-handle"]')).toBeNull();
  });

  it('no-slot: renders explorer + left + main in the existing structure', () => {
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

  // ---------- T003: slot present ----------

  it('with-slot: renders the outer ResizablePanelGroup with two panels and a handle', () => {
    const { container } = render(
      <PanelShell
        explorer={<div data-testid="explorer">Explorer</div>}
        left={<div data-testid="left">Left</div>}
        main={<div data-testid="main">Main</div>}
        rightPane={<div data-testid="right-pane">Right</div>}
      />
    );
    const group = container.querySelector('[data-slot="resizable-panel-group"]');
    expect(group).not.toBeNull();
    const panels = container.querySelectorAll('[data-slot="resizable-panel"]');
    expect(panels.length).toBe(2);
    const handle = container.querySelector('[data-slot="resizable-handle"]');
    expect(handle).not.toBeNull();
    expect(screen.getByTestId('right-pane')).toBeInTheDocument();
  });

  it('with-slot: rightPane content is inside the second ResizablePanel', () => {
    const { container } = render(
      <PanelShell
        explorer={<div>Explorer</div>}
        left={<div>Left</div>}
        main={<div>Main</div>}
        rightPane={<div data-testid="right-pane">Right</div>}
      />
    );
    const panels = container.querySelectorAll('[data-slot="resizable-panel"]');
    const rightPaneContent = screen.getByTestId('right-pane');
    expect(panels[1].contains(rightPaneContent)).toBe(true);
  });

  it('with-slot: left+main content is inside the first ResizablePanel', () => {
    const { container } = render(
      <PanelShell
        explorer={<div>Explorer</div>}
        left={<div data-testid="left">Left</div>}
        main={<div data-testid="main">Main</div>}
        rightPane={<div>Right</div>}
      />
    );
    const panels = container.querySelectorAll('[data-slot="resizable-panel"]');
    expect(panels[0].contains(screen.getByTestId('left'))).toBe(true);
    expect(panels[0].contains(screen.getByTestId('main'))).toBe(true);
  });

  // ---------- T011: anchor-attribute placement invariant (AC-17) ----------

  it('T011: data-terminal-overlay-anchor is on the main slot wrapper when slot is ABSENT', () => {
    const { container } = render(
      <PanelShell
        explorer={<div>Explorer</div>}
        left={<div data-testid="left">Left</div>}
        main={<div data-testid="main">Main</div>}
      />
    );
    const anchor = container.querySelector('[data-terminal-overlay-anchor]');
    if (!anchor) throw new Error('expected data-terminal-overlay-anchor in PanelShell render');
    expect(anchor.contains(screen.getByTestId('main'))).toBe(true);
    expect(anchor.contains(screen.getByTestId('left'))).toBe(false);
  });

  it('T011: data-terminal-overlay-anchor is on the main slot wrapper when slot is PRESENT', () => {
    const { container } = render(
      <PanelShell
        explorer={<div>Explorer</div>}
        left={<div data-testid="left">Left</div>}
        main={<div data-testid="main">Main</div>}
        rightPane={<div data-testid="right-pane">Right</div>}
      />
    );
    const anchor = container.querySelector('[data-terminal-overlay-anchor]');
    if (!anchor) throw new Error('expected data-terminal-overlay-anchor in PanelShell render');
    expect(anchor.contains(screen.getByTestId('main'))).toBe(true);
    expect(anchor.contains(screen.getByTestId('left'))).toBe(false);
    expect(anchor.contains(screen.getByTestId('right-pane'))).toBe(false);
  });

  it('T011: data-terminal-overlay-anchor exists exactly once in both branches', () => {
    const noSlot = render(
      <PanelShell explorer={<div>Explorer</div>} left={<div>Left</div>} main={<div>Main</div>} />
    );
    expect(noSlot.container.querySelectorAll('[data-terminal-overlay-anchor]').length).toBe(1);
    noSlot.unmount();

    const withSlot = render(
      <PanelShell
        explorer={<div>Explorer</div>}
        left={<div>Left</div>}
        main={<div>Main</div>}
        rightPane={<div>Right</div>}
      />
    );
    expect(withSlot.container.querySelectorAll('[data-terminal-overlay-anchor]').length).toBe(1);
  });
});
