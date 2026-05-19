/**
 * Plan 084 split-terminal-view T009 — toggle stress test
 *
 * Mounts the smallest realistic shape — a stateful parent that drives
 * PanelShell's `rightPane` slot — and toggles it 10 times. Asserts:
 *   1. console.error is never called during the cycle (AC-08 / AC-16)
 *   2. the right pane's mount/unmount hooks run in expected pairs with
 *      no orphaned mounts at the end (no DOM / state leak)
 *
 * SCOPE NOTE: This test exercises the slot lifecycle owned by file-browser
 * (the toggle wiring) and panel-layout (the slot landing). It does NOT
 * exercise xterm cleanup discipline — that lives inside `terminal` domain
 * and is covered by Plan 064's TerminalView tests. KF-03's xterm tear-down
 * ordering manifests at the xterm layer; the slot layer just needs to
 * mount/unmount cleanly, which is what this test pins.
 *
 * The realistic xterm-tear-down evidence is the T010 harness Playwright
 * spec — which mounts the actual TerminalView in a real browser and
 * verifies clean unmount on toggle-off.
 *
 * @vitest-environment jsdom
 */

import { act, render } from '@testing-library/react';
import React, { useEffect, useState } from 'react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';

import { FakeMatchMedia } from '../../../fakes/fake-match-media';

let PanelShell: typeof import(
  '../../../../apps/web/src/features/_platform/panel-layout/components/panel-shell'
).PanelShell;

// Mount counter exposed on the test pane so the test can assert the lifecycle.
const mountEvents: Array<'mount' | 'unmount'> = [];

function StubRightPane({ id }: { id: number }) {
  useEffect(() => {
    mountEvents.push('mount');
    return () => {
      mountEvents.push('unmount');
    };
  }, []);
  return <div data-testid={`stub-pane-${id}`}>Stub Pane {id}</div>;
}

interface HarnessProps {
  toggleRef: { current: ((next: boolean) => void) | null };
}

function StressHarness({ toggleRef }: HarnessProps) {
  const [enabled, setEnabled] = useState(false);
  const [iter, setIter] = useState(0);
  toggleRef.current = (next: boolean) => {
    setEnabled(next);
    if (next) setIter((i) => i + 1);
  };
  return (
    <PanelShell
      explorer={<div>Explorer</div>}
      left={<div>Left</div>}
      main={<div>Main</div>}
      rightPane={enabled ? <StubRightPane id={iter} /> : undefined}
    />
  );
}

describe('Split terminal toggle — T009 stress test', () => {
  let fakeMatchMedia: FakeMatchMedia;
  let originalMatchMedia: typeof window.matchMedia;
  let originalInnerWidth: number;
  let errorSpy: MockInstance<(...args: unknown[]) => void>;

  beforeEach(async () => {
    originalMatchMedia = window.matchMedia;
    originalInnerWidth = window.innerWidth;
    fakeMatchMedia = new FakeMatchMedia(1440);
    (window as unknown as { matchMedia: typeof window.matchMedia }).matchMedia = (q: string) =>
      fakeMatchMedia.matchMedia(q);
    Object.defineProperty(window, 'innerWidth', {
      value: 1440,
      writable: true,
      configurable: true,
    });
    const mod = await import(
      '../../../../apps/web/src/features/_platform/panel-layout/components/panel-shell'
    );
    PanelShell = mod.PanelShell;
    mountEvents.length = 0;
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    (window as unknown as { matchMedia: typeof window.matchMedia }).matchMedia =
      originalMatchMedia;
    Object.defineProperty(window, 'innerWidth', {
      value: originalInnerWidth,
      writable: true,
      configurable: true,
    });
    errorSpy.mockRestore();
  });

  it('10× toggle on/off cycle leaves clean state (AC-08 / AC-16)', () => {
    const toggleRef: HarnessProps['toggleRef'] = { current: null };
    const { container } = render(<StressHarness toggleRef={toggleRef} />);

    expect(toggleRef.current).not.toBeNull();
    expect(container.querySelector('[data-slot="resizable-panel-group"]')).toBeNull();
    expect(mountEvents).toEqual([]);

    for (let i = 0; i < 10; i += 1) {
      act(() => {
        toggleRef.current!(true);
      });
      expect(
        container.querySelector('[data-slot="resizable-panel-group"]'),
      ).not.toBeNull();

      act(() => {
        toggleRef.current!(false);
      });
      expect(container.querySelector('[data-slot="resizable-panel-group"]')).toBeNull();
    }

    // 10 mount/unmount pairs in order
    expect(mountEvents.length).toBe(20);
    const mounts = mountEvents.filter((e) => e === 'mount').length;
    const unmounts = mountEvents.filter((e) => e === 'unmount').length;
    expect(mounts).toBe(10);
    expect(unmounts).toBe(10);

    // Final state: no DOM artifacts from the right pane
    expect(container.querySelector('[data-testid^="stub-pane-"]')).toBeNull();

    // No console.error from React lifecycle, ResizeObserver, etc.
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('toggle preserves anchor placement across cycles', () => {
    const toggleRef: HarnessProps['toggleRef'] = { current: null };
    const { container } = render(<StressHarness toggleRef={toggleRef} />);

    for (let i = 0; i < 5; i += 1) {
      act(() => toggleRef.current!(true));
      const anchorOn = container.querySelectorAll('[data-terminal-overlay-anchor]');
      expect(anchorOn.length).toBe(1);

      act(() => toggleRef.current!(false));
      const anchorOff = container.querySelectorAll('[data-terminal-overlay-anchor]');
      expect(anchorOff.length).toBe(1);
    }
  });
});
