/**
 * Tests for WorkspaceContext + WorkspaceProvider.
 *
 * Phase 5: Attention System — Plan 041
 * Subtask 001: Worktree Identity & Tab Titles
 */

import {
  WorkspaceProvider,
  useWorkspaceContext,
} from '@/features/041-file-browser/hooks/use-workspace-context';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

function createWrapper(
  props?: Partial<{
    slug: string;
    name: string;
    emoji: string;
    color: string;
    worktreePreferences: Record<string, { emoji: string; color: string }>;
  }>
) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <WorkspaceProvider
        slug={props?.slug ?? 'test-ws'}
        name={props?.name ?? 'Test Workspace'}
        emoji={props?.emoji ?? '🔮'}
        color={props?.color ?? 'purple'}
        worktreePreferences={props?.worktreePreferences ?? {}}
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
    expect(result.current?.worktreeIdentity).toBeNull();
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

describe('worktreeIdentity', () => {
  it('setWorktreeIdentity sets branch and page title', () => {
    const { result } = renderHook(() => useWorkspaceContext(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current?.setWorktreeIdentity({
        worktreePath: '/path/to/wt',
        branch: '041-file-browser',
        pageTitle: 'Browser',
      });
    });

    expect(result.current?.worktreeIdentity?.branch).toBe('041-file-browser');
    expect(result.current?.worktreeIdentity?.pageTitle).toBe('Browser');
  });

  it('resolves emoji from worktreePreferences map', () => {
    const { result } = renderHook(() => useWorkspaceContext(), {
      wrapper: createWrapper({
        emoji: '🔮',
        color: 'purple',
        worktreePreferences: {
          '/path/to/wt': { emoji: '🔥', color: 'red' },
        },
      }),
    });

    act(() => {
      result.current?.setWorktreeIdentity({
        worktreePath: '/path/to/wt',
        branch: 'main',
      });
    });

    expect(result.current?.worktreeIdentity?.emoji).toBe('🔥');
    expect(result.current?.worktreeIdentity?.color).toBe('red');
  });

  it('falls back to workspace emoji when worktree has no prefs', () => {
    const { result } = renderHook(() => useWorkspaceContext(), {
      wrapper: createWrapper({ emoji: '🔮', color: 'purple' }),
    });

    act(() => {
      result.current?.setWorktreeIdentity({
        worktreePath: '/unknown/path',
        branch: 'feature',
      });
    });

    expect(result.current?.worktreeIdentity?.emoji).toBe('🔮');
    expect(result.current?.worktreeIdentity?.color).toBe('purple');
  });

  it('null clears worktree identity', () => {
    const { result } = renderHook(() => useWorkspaceContext(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current?.setWorktreeIdentity({
        worktreePath: '/path',
        branch: 'main',
        pageTitle: 'Browser',
      });
    });

    expect(result.current?.worktreeIdentity).not.toBeNull();

    act(() => {
      result.current?.setWorktreeIdentity(null);
    });

    expect(result.current?.worktreeIdentity).toBeNull();
  });

  it('falls back to workspace emoji when worktree emoji is empty', () => {
    const { result } = renderHook(() => useWorkspaceContext(), {
      wrapper: createWrapper({
        emoji: '🔮',
        worktreePreferences: {
          '/path': { emoji: '', color: '' },
        },
      }),
    });

    act(() => {
      result.current?.setWorktreeIdentity({ worktreePath: '/path', branch: 'main' });
    });

    expect(result.current?.worktreeIdentity?.emoji).toBe('🔮');
  });
});
