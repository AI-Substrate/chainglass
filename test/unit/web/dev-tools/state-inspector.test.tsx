/**
 * Plan 056: State Inspector Tests
 *
 * Tests for StateChangeLog hook and inspector hook behavior
 * using FakeGlobalStateSystem via StateContext injection.
 */

import { act, renderHook } from '@testing-library/react';
import React, { type ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import { FakeGlobalStateSystem } from '@chainglass/shared/fakes';
import type { IStateService } from '@chainglass/shared/state';
import { useStateChangeLog } from '../../../../apps/web/src/features/_platform/dev-tools/hooks/use-state-change-log';
import { StateChangeLog } from '../../../../apps/web/src/lib/state/state-change-log';
import {
  StateChangeLogContext,
  StateContext,
} from '../../../../apps/web/src/lib/state/state-provider';

function registerTestDomain(svc: IStateService): void {
  svc.registerDomain({
    domain: 'test-domain',
    description: 'Test domain',
    multiInstance: true,
    properties: [
      { key: 'status', description: 'Status', typeHint: 'string' },
      { key: 'count', description: 'Count', typeHint: 'number' },
    ],
  });
}

describe('useStateChangeLog', () => {
  let fake: FakeGlobalStateSystem;
  let log: StateChangeLog;

  beforeEach(() => {
    fake = new FakeGlobalStateSystem();
    log = new StateChangeLog(100);
    registerTestDomain(fake);
    // Wire the log to the fake system — mirrors what GlobalStateProvider does
    fake.subscribe('*', (change) => log.append(change));
  });

  function wrapper({ children }: { children: ReactNode }) {
    return React.createElement(
      StateContext.Provider,
      { value: fake },
      React.createElement(StateChangeLogContext.Provider, { value: log }, children)
    );
  }

  it('returns empty array when no changes logged', () => {
    /**
     * Why: Initial state should be empty.
     * Contract: useStateChangeLog returns [] before any publishes.
     * Usage Notes: No flash of stale data.
     * Quality Contribution: Verifies initial render.
     * Worked Example: renderHook → empty array
     */
    const { result } = renderHook(() => useStateChangeLog(), { wrapper });
    expect(result.current).toHaveLength(0);
  });

  it('returns logged changes after publish', () => {
    /**
     * Why: Published changes should appear in the log.
     * Contract: After publish, useStateChangeLog returns the change.
     * Usage Notes: Hook re-renders on new events via log.subscribe.
     * Quality Contribution: Proves the boot → log → hook pipeline.
     * Worked Example: publish → hook returns 1 entry
     */
    const { result } = renderHook(() => useStateChangeLog(), { wrapper });

    act(() => {
      fake.publish('test-domain:inst-1:status', 'running');
    });

    expect(result.current).toHaveLength(1);
    expect(result.current[0].path).toBe('test-domain:inst-1:status');
    expect(result.current[0].value).toBe('running');
  });

  it('filters by pattern', () => {
    /**
     * Why: Pattern filtering scopes the log to specific domains.
     * Contract: useStateChangeLog('test-domain:**') only returns matching entries.
     * Usage Notes: Used by domain filter chips in the inspector.
     * Quality Contribution: Proves pattern-scoped log reading.
     * Worked Example: publish 2 domains → filter → only 1 returned
     */
    const { result } = renderHook(() => useStateChangeLog('test-domain:**'), {
      wrapper,
    });

    act(() => {
      fake.publish('test-domain:inst-1:status', 'running');
    });

    expect(result.current).toHaveLength(1);
  });

  it('limits results', () => {
    /**
     * Why: Limit prevents overwhelming the UI with too many entries.
     * Contract: useStateChangeLog(undefined, 2) returns at most 2 entries.
     * Usage Notes: Used for compact views or preview panels.
     * Quality Contribution: Proves limit parameter works.
     * Worked Example: publish 3 → limit 2 → returns last 2
     */
    const { result } = renderHook(() => useStateChangeLog(undefined, 2), {
      wrapper,
    });

    act(() => {
      fake.publish('test-domain:inst-1:status', 'a');
      fake.publish('test-domain:inst-1:status', 'b');
      fake.publish('test-domain:inst-1:status', 'c');
    });

    expect(result.current).toHaveLength(2);
    expect(result.current[0].value).toBe('b');
    expect(result.current[1].value).toBe('c');
  });

  it('includes previousValue in change entries', () => {
    /**
     * Why: Detail panel needs previousValue for diff display (AC-19).
     * Contract: StateChange entries include previousValue from the state system.
     * Usage Notes: Only events have previousValue, not StateEntry.
     * Quality Contribution: Verifies full StateChange data flows through.
     * Worked Example: publish twice → second entry has previousValue
     */
    const { result } = renderHook(() => useStateChangeLog(), { wrapper });

    act(() => {
      fake.publish('test-domain:inst-1:status', 'idle');
      fake.publish('test-domain:inst-1:status', 'running');
    });

    expect(result.current).toHaveLength(2);
    expect(result.current[1].previousValue).toBe('idle');
    expect(result.current[1].value).toBe('running');
  });
});
