/**
 * Plan 053 Phase 5: WorktreeStatePublisher Tests
 *
 * Tests the publisher component using FakeGlobalStateSystem injected
 * via StateContext (DYK-20). Verifies state publishing for worktree
 * domain with multi-instance paths (DYK-21).
 */

import { act, render } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeGlobalStateSystem } from '@chainglass/shared/fakes';
import type { IStateService } from '@chainglass/shared/state';
import { WorktreeStatePublisher } from '../../../../apps/web/src/features/041-file-browser/state/worktree-publisher';
import { StateContext } from '../../../../apps/web/src/lib/state/state-provider';

function registerWorktreeDomain(svc: IStateService): void {
  svc.registerDomain({
    domain: 'worktree',
    description: 'Worktree runtime state',
    multiInstance: true,
    properties: [
      { key: 'changed-file-count', description: 'Changed files', typeHint: 'number' },
      { key: 'branch', description: 'Git branch', typeHint: 'string' },
    ],
  });
}

describe('WorktreeStatePublisher', () => {
  let fake: FakeGlobalStateSystem;

  beforeEach(() => {
    fake = new FakeGlobalStateSystem();
    registerWorktreeDomain(fake);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function renderPublisher(slug: string, worktreeBranch?: string) {
    return render(
      React.createElement(
        StateContext.Provider,
        { value: fake },
        React.createElement(WorktreeStatePublisher, { slug, worktreeBranch })
      )
    );
  }

  it('publishes branch from prop on mount (AC-39, DYK-24)', () => {
    /**
     * Why: Branch comes from prop, not FileChangeHub.
     * Contract: On mount, publishes worktree:{slug}:branch with prop value.
     * Usage Notes: Branch is available immediately after mount.
     * Quality Contribution: Verifies DYK-24 resolution.
     * Worked Example: render publisher with branch 'main' → state has 'main'
     */
    renderPublisher('my-workspace', 'main');

    expect(fake.get<string>('worktree:my-workspace:branch')).toBe('main');
  });

  it('publishes empty branch when prop is undefined', () => {
    /**
     * Why: Graceful handling when branch is not available.
     * Contract: Publishes empty string for undefined worktreeBranch.
     * Usage Notes: Non-git worktrees have no branch.
     * Quality Contribution: No undefined values leak to subscribers.
     * Worked Example: render publisher without branch → state has ''
     */
    renderPublisher('my-workspace');

    expect(fake.get<string>('worktree:my-workspace:branch')).toBe('');
  });

  it('publishes initial changed-file-count of 0 on mount (AC-39)', () => {
    /**
     * Why: Count must be initialized before timer ticks.
     * Contract: On mount, publishes worktree:{slug}:changed-file-count = 0.
     * Usage Notes: Consumer sees 0 immediately, not undefined.
     * Quality Contribution: No flash of undefined state.
     * Worked Example: render publisher → state has 0
     */
    renderPublisher('my-workspace', 'main');

    expect(fake.get<number>('worktree:my-workspace:changed-file-count')).toBe(0);
  });

  it('increments changed-file-count on timer tick (TEMPORARY demo)', () => {
    /**
     * Why: Temporary demo timer verifies live state updates.
     * Contract: Every 2s, changed-file-count increments by 1.
     * Usage Notes: This test validates the demo mechanism — will change
     *   when real useFileChanges integration replaces the timer.
     * Quality Contribution: Ensures the publish loop works end-to-end.
     * Worked Example: advance 4s → count is 2
     */
    renderPublisher('my-workspace', 'main');

    expect(fake.get<number>('worktree:my-workspace:changed-file-count')).toBe(0);

    act(() => vi.advanceTimersByTime(2000));
    expect(fake.get<number>('worktree:my-workspace:changed-file-count')).toBe(1);

    act(() => vi.advanceTimersByTime(2000));
    expect(fake.get<number>('worktree:my-workspace:changed-file-count')).toBe(2);
  });

  it('uses slug as instance ID in state paths (DYK-22)', () => {
    /**
     * Why: Multi-instance paths isolate state per workspace.
     * Contract: All published paths include slug as middle segment.
     * Usage Notes: Different slugs → different state entries.
     * Quality Contribution: Verifies cross-workspace isolation.
     * Worked Example: two publishers with different slugs → independent state
     */
    renderPublisher('workspace-a', 'main');
    renderPublisher('workspace-b', 'develop');

    expect(fake.get<string>('worktree:workspace-a:branch')).toBe('main');
    expect(fake.get<string>('worktree:workspace-b:branch')).toBe('develop');
    expect(fake.get<number>('worktree:workspace-a:changed-file-count')).toBe(0);
    expect(fake.get<number>('worktree:workspace-b:changed-file-count')).toBe(0);
  });

  it('cleans up timer on unmount', () => {
    /**
     * Why: No leaked intervals after component unmount.
     * Contract: Timer stops and no further publishes occur.
     * Usage Notes: Prevents memory leaks and stale state writes.
     * Quality Contribution: Cleanup discipline.
     * Worked Example: unmount → advance time → count unchanged
     */
    const { unmount } = renderPublisher('my-workspace', 'main');

    act(() => vi.advanceTimersByTime(2000));
    expect(fake.get<number>('worktree:my-workspace:changed-file-count')).toBe(1);

    unmount();

    act(() => vi.advanceTimersByTime(4000));
    // Count should still be 1 — timer was cleaned up
    expect(fake.get<number>('worktree:my-workspace:changed-file-count')).toBe(1);
  });
});
