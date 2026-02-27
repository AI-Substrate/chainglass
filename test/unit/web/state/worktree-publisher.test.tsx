/**
 * Plan 053 Phase 5: WorktreeStatePublisher Tests
 *
 * Tests the publisher component using FakeGlobalStateSystem injected
 * via StateContext (DYK-20). Verifies state publishing for worktree
 * domain with multi-instance paths (DYK-21).
 *
 * useFileChanges is mocked to control the changes array.
 */

import { act, render } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeGlobalStateSystem } from '@chainglass/shared/fakes';
import type { IStateService } from '@chainglass/shared/state';
import { WorktreeStatePublisher } from '../../../../apps/web/src/features/041-file-browser/state/worktree-publisher';
import { StateContext } from '../../../../apps/web/src/lib/state/state-provider';

// Mock useFileChanges to control the changes array
const mockChanges: { changes: unknown[]; hasChanges: boolean; clearChanges: () => void } = {
  changes: [],
  hasChanges: false,
  clearChanges: vi.fn(),
};

vi.mock('@/features/045-live-file-events', () => ({
  useFileChanges: () => mockChanges,
}));

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
    mockChanges.changes = [];
    mockChanges.hasChanges = false;
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

  it('publishes changed-file-count of 0 when no changes (AC-39)', () => {
    /**
     * Why: Count reflects actual file changes from hub.
     * Contract: On mount with empty changes, publishes 0.
     * Usage Notes: Consumer sees 0 immediately, not undefined.
     * Quality Contribution: No flash of undefined state.
     * Worked Example: render publisher with no changes → state has 0
     */
    renderPublisher('my-workspace', 'main');

    expect(fake.get<number>('worktree:my-workspace:changed-file-count')).toBe(0);
  });

  it('publishes changed-file-count matching changes array length (DYK-25)', () => {
    /**
     * Why: File count derives from useFileChanges changes array.
     * Contract: changed-file-count equals changes.length.
     * Usage Notes: Reacts to real file change events from hub.
     * Quality Contribution: Proves the hub → state bridge works.
     * Worked Example: 3 changes → count is 3
     */
    mockChanges.changes = [{ path: 'a.ts' }, { path: 'b.ts' }, { path: 'c.ts' }];
    renderPublisher('my-workspace', 'main');

    expect(fake.get<number>('worktree:my-workspace:changed-file-count')).toBe(3);
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
});
