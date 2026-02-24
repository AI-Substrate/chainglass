/**
 * Tests for WorkspaceContext + WorkspaceProvider.
 *
 * Phase 5: Attention System — Plan 041
 */

import {
  WorkspaceProvider,
  useWorkspaceContext,
} from '@/features/041-file-browser/hooks/use-workspace-context';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

function createWrapper(
  props?: Partial<{ slug: string; name: string; emoji: string; color: string }>
) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <WorkspaceProvider
        slug={props?.slug ?? 'test-ws'}
        name={props?.name ?? 'Test Workspace'}
        emoji={props?.emoji ?? '🔮'}
        color={props?.color ?? 'purple'}
      >
        {children}
      </WorkspaceProvider>
    );
  };
}

describe('useWorkspaceContext', () => {
  it('returns null outside provider', () => {
    const { result } = renderHook(() => useWorkspaceContext());
    expect(result.current).toBeNull();
  });

  it('returns workspace data inside provider', () => {
    const { result } = renderHook(() => useWorkspaceContext(), {
      wrapper: createWrapper(),
    });

    expect(result.current).not.toBeNull();
    expect(result.current?.slug).toBe('test-ws');
    expect(result.current?.name).toBe('Test Workspace');
    expect(result.current?.emoji).toBe('🔮');
    expect(result.current?.color).toBe('purple');
    expect(result.current?.hasChanges).toBe(false);
  });

  it('setHasChanges updates attention state', () => {
    const { result } = renderHook(() => useWorkspaceContext(), {
      wrapper: createWrapper(),
    });

    expect(result.current?.hasChanges).toBe(false);

    act(() => {
      result.current?.setHasChanges(true);
    });

    expect(result.current?.hasChanges).toBe(true);

    act(() => {
      result.current?.setHasChanges(false);
    });

    expect(result.current?.hasChanges).toBe(false);
  });

  it('uses provided emoji and name', () => {
    const { result } = renderHook(() => useWorkspaceContext(), {
      wrapper: createWrapper({ emoji: '🚀', name: 'Rocket' }),
    });

    expect(result.current?.emoji).toBe('🚀');
    expect(result.current?.name).toBe('Rocket');
  });
});
