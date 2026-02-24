/**
 * Tests for useFileChanges hook.
 *
 * Per Plan 045: Live File Events - Phase 2 (T006/T007)
 * Uses FakeFileChangeHub injected via context.
 */

import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeFileChangeHub } from '../../../../../apps/web/src/features/045-live-file-events/fake-file-change-hub';
import type { FileChange } from '../../../../../apps/web/src/features/045-live-file-events/file-change.types';
import { useFileChanges } from '../../../../../apps/web/src/features/045-live-file-events/use-file-changes';

// We need to access the context to inject our fake hub.
// Import the provider's context indirectly by wrapping with the real provider
// but using a test helper that injects the fake.

// Since FileChangeProvider creates its own hub, we need a way to inject
// our fake. We'll create a minimal test wrapper using the context directly.
import { FileChangeProvider } from '../../../../../apps/web/src/features/045-live-file-events/file-change-provider';

// We can't easily inject a FakeFileChangeHub into FileChangeProvider (it creates its own).
// Instead, test through the real provider with a FakeEventSource to control SSE messages.
// OR: export the context and use it in tests. Since the context isn't exported,
// we'll test through the provider with controlled SSE.

// However, for unit testing the hook in isolation, let's create a test wrapper
// that provides a fake hub directly via the context.

// We need access to the context. Let's use a test-only approach:
// Create a wrapper component that provides the fake hub via React.createElement.

// Actually, the cleanest approach: test useFileChanges through FileChangeProvider
// with a fake EventSource. This tests the integration properly.

import {
  type FakeEventSource,
  createFakeEventSourceFactory,
} from '../../../../../test/fakes/fake-event-source';

function makeChange(overrides: Partial<FileChange> = {}): FileChange {
  return {
    path: 'src/app.tsx',
    eventType: 'change',
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('useFileChanges', () => {
  let fakeESFactory: ReturnType<typeof createFakeEventSourceFactory>;

  beforeEach(() => {
    vi.useFakeTimers();
    fakeESFactory = createFakeEventSourceFactory();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createWrapper(worktreePath = '/repo') {
    return function Wrapper({ children }: { children: React.ReactNode }) {
      return React.createElement(
        FileChangeProvider,
        {
          worktreePath,
          eventSourceFactory: fakeESFactory.create as unknown as (url: string) => EventSource,
        },
        children
      );
    };
  }

  function simulateSSEMessage(
    fakeES: FakeEventSource,
    changes: Array<{ path: string; eventType: string; worktreePath: string; timestamp: number }>
  ) {
    const data = JSON.stringify({ type: 'file-changed', changes });
    fakeES.simulateMessage(data);
  }

  function getLastES(): FakeEventSource {
    const es = fakeESFactory.lastInstance;
    if (!es) throw new Error('No EventSource created');
    return es;
  }

  // ═══════════════════════════════════════════════════════════
  // Basic subscribe/dispatch
  // ═══════════════════════════════════════════════════════════

  it('should start with empty changes', () => {
    const { result } = renderHook(() => useFileChanges('src/app.tsx'), {
      wrapper: createWrapper(),
    });

    expect(result.current.changes).toEqual([]);
    expect(result.current.hasChanges).toBe(false);
  });

  it('should receive matching changes after debounce', () => {
    const { result } = renderHook(() => useFileChanges('src/app.tsx', { debounce: 0 }), {
      wrapper: createWrapper(),
    });

    const fakeES = getLastES();
    act(() => {
      fakeES.simulateOpen();
      simulateSSEMessage(fakeES, [
        { path: 'src/app.tsx', eventType: 'change', worktreePath: '/repo', timestamp: 1000 },
      ]);
    });

    expect(result.current.hasChanges).toBe(true);
    expect(result.current.changes).toHaveLength(1);
    expect(result.current.changes[0].path).toBe('src/app.tsx');
  });

  it('should debounce changes (default 100ms)', () => {
    const { result } = renderHook(() => useFileChanges('*'), {
      wrapper: createWrapper(),
    });

    const fakeES = getLastES();
    act(() => {
      fakeES.simulateOpen();
      simulateSSEMessage(fakeES, [
        { path: 'src/a.tsx', eventType: 'change', worktreePath: '/repo', timestamp: 1000 },
      ]);
    });

    // Not yet — debounce pending
    expect(result.current.hasChanges).toBe(false);

    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Now it should arrive
    expect(result.current.hasChanges).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════
  // Modes
  // ═══════════════════════════════════════════════════════════

  it('should replace changes in replace mode (default)', () => {
    const { result } = renderHook(() => useFileChanges('*', { debounce: 0 }), {
      wrapper: createWrapper(),
    });

    const fakeES = getLastES();
    act(() => {
      fakeES.simulateOpen();
      simulateSSEMessage(fakeES, [
        { path: 'src/a.tsx', eventType: 'add', worktreePath: '/repo', timestamp: 1000 },
      ]);
    });

    expect(result.current.changes).toHaveLength(1);

    act(() => {
      simulateSSEMessage(fakeES, [
        { path: 'src/b.tsx', eventType: 'change', worktreePath: '/repo', timestamp: 2000 },
      ]);
    });

    // Replaced — only the second batch
    expect(result.current.changes).toHaveLength(1);
    expect(result.current.changes[0].path).toBe('src/b.tsx');
  });

  it('should accumulate changes in accumulate mode', () => {
    const { result } = renderHook(() => useFileChanges('*', { debounce: 0, mode: 'accumulate' }), {
      wrapper: createWrapper(),
    });

    const fakeES = getLastES();
    act(() => {
      fakeES.simulateOpen();
      simulateSSEMessage(fakeES, [
        { path: 'src/a.tsx', eventType: 'add', worktreePath: '/repo', timestamp: 1000 },
      ]);
    });

    act(() => {
      simulateSSEMessage(fakeES, [
        { path: 'src/b.tsx', eventType: 'change', worktreePath: '/repo', timestamp: 2000 },
      ]);
    });

    // Accumulated — both batches
    expect(result.current.changes).toHaveLength(2);
  });

  // ═══════════════════════════════════════════════════════════
  // clearChanges
  // ═══════════════════════════════════════════════════════════

  it('should clear changes and reset hasChanges', () => {
    const { result } = renderHook(() => useFileChanges('*', { debounce: 0 }), {
      wrapper: createWrapper(),
    });

    const fakeES = getLastES();
    act(() => {
      fakeES.simulateOpen();
      simulateSSEMessage(fakeES, [
        { path: 'src/a.tsx', eventType: 'change', worktreePath: '/repo', timestamp: 1000 },
      ]);
    });

    expect(result.current.hasChanges).toBe(true);

    act(() => {
      result.current.clearChanges();
    });

    expect(result.current.hasChanges).toBe(false);
    expect(result.current.changes).toEqual([]);
  });

  // ═══════════════════════════════════════════════════════════
  // worktreePath filtering (DYK #1)
  // ═══════════════════════════════════════════════════════════

  it('should filter out changes from other worktrees', () => {
    const { result } = renderHook(() => useFileChanges('*', { debounce: 0 }), {
      wrapper: createWrapper('/repo'),
    });

    const fakeES = getLastES();
    act(() => {
      fakeES.simulateOpen();
      simulateSSEMessage(fakeES, [
        { path: 'src/a.tsx', eventType: 'change', worktreePath: '/repo', timestamp: 1000 },
        { path: 'src/a.tsx', eventType: 'change', worktreePath: '/other-repo', timestamp: 1001 },
      ]);
    });

    // Only /repo changes should arrive
    expect(result.current.changes).toHaveLength(1);
    expect(result.current.changes[0].path).toBe('src/a.tsx');
  });

  // ═══════════════════════════════════════════════════════════
  // Pattern filtering
  // ═══════════════════════════════════════════════════════════

  it('should only receive changes matching the pattern', () => {
    const { result } = renderHook(() => useFileChanges('src/', { debounce: 0 }), {
      wrapper: createWrapper(),
    });

    const fakeES = getLastES();
    act(() => {
      fakeES.simulateOpen();
      simulateSSEMessage(fakeES, [
        { path: 'src/app.tsx', eventType: 'change', worktreePath: '/repo', timestamp: 1000 },
        { path: 'test/app.test.tsx', eventType: 'change', worktreePath: '/repo', timestamp: 1001 },
      ]);
    });

    expect(result.current.changes).toHaveLength(1);
    expect(result.current.changes[0].path).toBe('src/app.tsx');
  });

  // ═══════════════════════════════════════════════════════════
  // Error handling
  // ═══════════════════════════════════════════════════════════

  it('should throw when used outside FileChangeProvider', () => {
    expect(() => {
      renderHook(() => useFileChanges('*'));
    }).toThrow('useFileChangeHub must be used within a FileChangeProvider');
  });

  // ═══════════════════════════════════════════════════════════
  // Cleanup
  // ═══════════════════════════════════════════════════════════

  it('should close EventSource on unmount', () => {
    const { unmount } = renderHook(() => useFileChanges('*', { debounce: 0 }), {
      wrapper: createWrapper(),
    });

    const fakeES = getLastES();
    act(() => {
      fakeES.simulateOpen();
    });

    unmount();

    expect(fakeES.readyState).toBe(2); // CLOSED
  });
});
