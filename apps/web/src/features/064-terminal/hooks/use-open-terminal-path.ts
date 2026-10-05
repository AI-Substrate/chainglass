'use client';

/**
 * Opens a clicked terminal path in the file browser of whichever workspace holds it.
 *
 * The path may live in another workspace than the one the terminal belongs to (an agent's pane
 * runs in its own repo), so the server locates it. A click folds the overlay away and navigates
 * this tab; ⌘/Ctrl-click opens a new tab and leaves the terminal where it is.
 */

import { workspaceHref } from '@/lib/workspace-url';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { locateWorkspaceFile } from '../../../../app/actions/file-actions';
import type { OpenTerminalPath } from '../lib/path-link-provider';

export function useOpenTerminalPath(beforeNavigate?: () => void): OpenTerminalPath {
  const router = useRouter();
  return useCallback<OpenTerminalPath>(
    (path, line, event) => {
      // Opened now, while the click still counts as a user gesture, so it is not blocked as a popup.
      const tab = event.metaKey || event.ctrlKey ? window.open('', '_blank') : null;
      void locateWorkspaceFile(path.absolute)
        .catch(() => null)
        .then(async (located) => {
          if (!located) {
            tab?.close();
            const { toast } = await import('sonner');
            toast.error(`${path.path} is not inside a chainglass workspace`);
            return;
          }
          const href = workspaceHref(
            located.slug,
            '/browser',
            path.directory
              ? { worktree: located.worktree, dir: located.file }
              : {
                  worktree: located.worktree,
                  file: located.file,
                  ...(line !== null ? { mode: 'source', line } : {}),
                }
          );
          if (tab) {
            tab.location.href = href;
            return;
          }
          beforeNavigate?.();
          router.push(href);
        });
    },
    [router, beforeNavigate]
  );
}
