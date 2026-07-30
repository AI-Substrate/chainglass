import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  PijRailToggleBridge,
  pijRailTarget,
} from '@/features/089-first-class-pij/hooks/use-pij-rail-toggle';
import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '../../../..');

async function source(path: string): Promise<string> {
  return readFile(join(REPO_ROOT, path), 'utf8');
}

describe('pij rail toggle routing', () => {
  it('switches the browser rail while preserving the active browser query', () => {
    const navigations: string[] = [];
    render(
      <PijRailToggleBridge
        workspaceSlug="chainglass"
        pathname="/workspaces/chainglass/browser"
        search="worktree=%2Frepo-wt&file=src%2Fapp.tsx&panel=tree"
        navigate={(href) => navigations.push(href)}
      />
    );

    act(() => window.dispatchEvent(new CustomEvent('pij:toggle')));

    expect(navigations).toEqual([
      '/workspaces/chainglass/browser?worktree=%2Frepo-wt&file=src%2Fapp.tsx&panel=pij',
    ]);
  });

  it('navigates every other workspace route to the browser PIJ rail', () => {
    const navigations: string[] = [];
    render(
      <PijRailToggleBridge
        workspaceSlug="chainglass"
        pathname="/workspaces/chainglass/workflows/demo"
        search="worktree=%2Frepo-wt"
        navigate={(href) => navigations.push(href)}
      />
    );

    act(() => window.dispatchEvent(new CustomEvent('pij:toggle')));

    expect(navigations).toEqual(['/workspaces/chainglass/browser?panel=pij']);
  });

  it('is an open command, so firing it on the active PIJ rail is a no-op', () => {
    expect(
      pijRailTarget('chainglass', '/workspaces/chainglass/browser', 'worktree=%2Frepo-wt&panel=pij')
    ).toBe('/workspaces/chainglass/browser?worktree=%2Frepo-wt&panel=pij');

    const navigations: string[] = [];
    render(
      <PijRailToggleBridge
        workspaceSlug="chainglass"
        pathname="/workspaces/chainglass/browser"
        search="worktree=%2Frepo-wt&panel=pij"
        navigate={(href) => navigations.push(href)}
      />
    );

    act(() => window.dispatchEvent(new CustomEvent('pij:toggle')));

    expect(navigations).toEqual([]);
  });

  it('keeps explorer, sidebar, and SDK command on the same pij:toggle seam', async () => {
    const triggerSources = await Promise.all([
      source('apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx'),
      source('apps/web/src/components/dashboard-sidebar.tsx'),
      source('apps/web/src/features/089-first-class-pij/sdk/register.ts'),
    ]);

    for (const code of triggerSources) {
      expect([...code.matchAll(/new CustomEvent\('pij:toggle'\)/g)]).toHaveLength(1);
    }
  });
});
