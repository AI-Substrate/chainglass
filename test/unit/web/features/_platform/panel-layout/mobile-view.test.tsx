/**
 * MobileView Tests — TDD
 *
 * Tests for the MobileView wrapper component that shows/hides
 * views in the mobile panel shell.
 *
 * @vitest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MobileView } from '../../../../../../apps/web/src/features/_platform/panel-layout/components/mobile-view';

describe('MobileView', () => {
  it('renders children when active', () => {
    render(
      <MobileView isActive={true}>
        <div data-testid="child">Hello</div>
      </MobileView>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('keeps children mounted when inactive', () => {
    render(
      <MobileView isActive={false}>
        <div data-testid="child">Hello</div>
      </MobileView>
    );
    // Children are in DOM (mounted) but container is hidden
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('sets visibility hidden and pointer-events none when inactive', () => {
    const { container } = render(
      <MobileView isActive={false}>
        <div>Content</div>
      </MobileView>
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.visibility).toBe('hidden');
    expect(wrapper.style.pointerEvents).toBe('none');
  });

  it('sets visibility visible and pointer-events auto when active', () => {
    const { container } = render(
      <MobileView isActive={true}>
        <div>Content</div>
      </MobileView>
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.visibility).toBe('visible');
    expect(wrapper.style.pointerEvents).toBe('auto');
  });

  it('renders full width and height', () => {
    const { container } = render(
      <MobileView isActive={true}>
        <div>Content</div>
      </MobileView>
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.width).toBe('100%');
    expect(wrapper.style.height).toBe('100%');
    expect(wrapper.style.flexShrink).toBe('0');
  });

  it('applies data-terminal-overlay-anchor when isTerminal is true', () => {
    const { container } = render(
      <MobileView isActive={true} isTerminal={true}>
        <div>Terminal</div>
      </MobileView>
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.hasAttribute('data-terminal-overlay-anchor')).toBe(true);
  });

  it('does not apply data-terminal-overlay-anchor when isTerminal is false or omitted', () => {
    const { container } = render(
      <MobileView isActive={true}>
        <div>Content</div>
      </MobileView>
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.hasAttribute('data-terminal-overlay-anchor')).toBe(false);
  });
});
