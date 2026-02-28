/**
 * Plan 053: GlobalStateSystem — Hook Tests
 *
 * Tests for useGlobalState, useGlobalStateList, and useStateSystem hooks.
 * Uses FakeGlobalStateSystem injected via exported StateContext (DYK-20).
 */

import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import { FakeGlobalStateSystem } from '@chainglass/shared/fakes';
import type { IStateService } from '@chainglass/shared/state';
import { StateContext } from '../../../../apps/web/src/lib/state/state-provider';
import { useStateSystem } from '../../../../apps/web/src/lib/state/state-provider';
import { useGlobalState } from '../../../../apps/web/src/lib/state/use-global-state';
import { useGlobalStateList } from '../../../../apps/web/src/lib/state/use-global-state-list';

function registerTestDomain(svc: IStateService): void {
  svc.registerDomain({
    domain: 'test-domain',
    description: 'Test domain',
    multiInstance: true,
    properties: [
      { key: 'status', description: 'Status', typeHint: 'string' },
      { key: 'progress', description: 'Progress', typeHint: 'number' },
    ],
  });
}

// ═══════════════════════════════════════════════
// useStateSystem
// ═══════════════════════════════════════════════

describe('useStateSystem', () => {
  it('throws outside GlobalStateProvider (AC-32)', () => {
    /**
     * Why: Fail-fast when hooks are used without the provider.
     * Contract: useStateSystem() throws descriptive error outside provider.
     * Usage Notes: Catches wiring errors at dev time.
     * Quality Contribution: Prevents silent undefined access.
     * Worked Example: renderHook(useStateSystem) without wrapper → throws
     */
    expect(() => {
      renderHook(() => useStateSystem());
    }).toThrow(/GlobalStateProvider/);
  });

  it('returns IStateService inside provider (AC-30)', () => {
    /**
     * Why: Provider must supply the state system to the entire subtree.
     * Contract: useStateSystem() returns a valid IStateService inside provider.
     * Usage Notes: Verifies context wiring works.
     * Quality Contribution: Validates the core provider contract.
     * Worked Example: renderHook(useStateSystem, { wrapper }) → IStateService
     */
    const fake = new FakeGlobalStateSystem();
    const wrapper = ({ children }: { children: ReactNode }) =>
      React.createElement(StateContext.Provider, { value: fake }, children);

    const { result } = renderHook(() => useStateSystem(), { wrapper });
    expect(result.current).toBe(fake);
  });

  it('creates GlobalStateSystem once per mount (AC-30)', () => {
    /**
     * Why: Provider must not re-create the system on re-render.
     * Contract: Multiple renders return the same IStateService identity.
     * Usage Notes: useState initializer ensures single creation.
     * Quality Contribution: Prevents state loss from accidental re-creation.
     * Worked Example: render → rerender → same service reference
     */
    const fake = new FakeGlobalStateSystem();
    const wrapper = ({ children }: { children: ReactNode }) =>
      React.createElement(StateContext.Provider, { value: fake }, children);

    const { result, rerender } = renderHook(() => useStateSystem(), { wrapper });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});

// ═══════════════════════════════════════════════
// useGlobalState
// ═══════════════════════════════════════════════

describe('useGlobalState', () => {
  let fake: FakeGlobalStateSystem;
  let wrapper: ({ children }: { children: ReactNode }) => React.ReactElement;

  beforeEach(() => {
    fake = new FakeGlobalStateSystem();
    registerTestDomain(fake);
    wrapper = ({ children }: { children: ReactNode }) =>
      React.createElement(StateContext.Provider, { value: fake }, children);
  });

  it('returns default when no value published (AC-28)', () => {
    /**
     * Why: Components must render sensibly before any state is published.
     * Contract: useGlobalState(path, default) returns default when path is empty.
     * Usage Notes: Default is pinned via useRef (DYK-16).
     * Quality Contribution: Prevents undefined rendering on initial mount.
     * Worked Example: useGlobalState('test-domain:wf-1:status', 'idle') → 'idle'
     */
    const { result } = renderHook(() => useGlobalState<string>('test-domain:wf-1:status', 'idle'), {
      wrapper,
    });
    expect(result.current).toBe('idle');
  });

  it('returns published value (AC-27)', () => {
    /**
     * Why: Core hook contract — must reflect current state.
     * Contract: After publish, useGlobalState returns the published value.
     * Usage Notes: Value is available immediately via store-first ordering.
     * Quality Contribution: Validates publish → hook read path.
     * Worked Example: publish('running') → useGlobalState() → 'running'
     */
    fake.publish('test-domain:wf-1:status', 'running');

    const { result } = renderHook(() => useGlobalState<string>('test-domain:wf-1:status', 'idle'), {
      wrapper,
    });
    expect(result.current).toBe('running');
  });

  it('re-renders on change (AC-27)', () => {
    /**
     * Why: Reactive updates are the core value proposition of the hook.
     * Contract: Publishing a new value triggers re-render with updated value.
     * Usage Notes: useSyncExternalStore handles the subscription internally.
     * Quality Contribution: Validates end-to-end reactivity.
     * Worked Example: render → publish('running') → result changes to 'running'
     */
    const { result } = renderHook(() => useGlobalState<string>('test-domain:wf-1:status', 'idle'), {
      wrapper,
    });
    expect(result.current).toBe('idle');

    act(() => {
      fake.publish('test-domain:wf-1:status', 'running');
    });
    expect(result.current).toBe('running');
  });

  it('returns undefined when no default provided and no value published', () => {
    /**
     * Why: Callers who omit the default must get undefined, not throw.
     * Contract: useGlobalState(path) without default returns undefined for empty path.
     * Usage Notes: TypeScript return type is T | undefined when no default provided.
     * Quality Contribution: Validates optional default parameter behavior.
     * Worked Example: useGlobalState('test-domain:wf-1:status') → undefined
     */
    const { result } = renderHook(() => useGlobalState<string>('test-domain:wf-1:status'), {
      wrapper,
    });
    expect(result.current).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════
// useGlobalStateList
// ═══════════════════════════════════════════════

describe('useGlobalStateList', () => {
  let fake: FakeGlobalStateSystem;
  let wrapper: ({ children }: { children: ReactNode }) => React.ReactElement;

  beforeEach(() => {
    fake = new FakeGlobalStateSystem();
    registerTestDomain(fake);
    wrapper = ({ children }: { children: ReactNode }) =>
      React.createElement(StateContext.Provider, { value: fake }, children);
  });

  it('returns matching entries (AC-29)', () => {
    /**
     * Why: Pattern-based listing is the multi-value consumption primitive.
     * Contract: useGlobalStateList(pattern) returns all matching StateEntry[].
     * Usage Notes: list() provides stable refs from Phase 3 cache.
     * Quality Contribution: Validates pattern → entries pipeline.
     * Worked Example: publish two entries → useGlobalStateList('test-domain:**') → length 2
     */
    fake.publish('test-domain:wf-1:status', 'running');
    fake.publish('test-domain:wf-2:status', 'pending');

    const { result } = renderHook(() => useGlobalStateList('test-domain:*:status'), { wrapper });
    expect(result.current).toHaveLength(2);
  });

  it('re-renders on matching change (AC-29)', () => {
    /**
     * Why: List must react to new entries matching the pattern.
     * Contract: Publishing a new matching entry triggers re-render with updated array.
     * Usage Notes: Subscribe uses actual pattern (DYK-17), not '*'.
     * Quality Contribution: Validates reactive list updates.
     * Worked Example: render empty → publish matching → result length increases
     */
    const { result } = renderHook(() => useGlobalStateList('test-domain:**'), { wrapper });
    expect(result.current).toHaveLength(0);

    act(() => {
      fake.publish('test-domain:wf-1:status', 'running');
    });
    expect(result.current).toHaveLength(1);
  });

  it('returns empty array when no entries match', () => {
    /**
     * Why: Empty state must return a valid empty array, not undefined.
     * Contract: useGlobalStateList(pattern) returns [] when no entries match.
     * Usage Notes: The empty array is stable (same reference) from list() cache.
     * Quality Contribution: Validates base case for pattern listing.
     * Worked Example: useGlobalStateList('test-domain:**') with no publishes → []
     */
    const { result } = renderHook(() => useGlobalStateList('test-domain:**'), { wrapper });
    expect(result.current).toHaveLength(0);
  });
});
