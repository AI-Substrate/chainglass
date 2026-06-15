/**
 * File browser URL params for the browser page.
 *
 * Plan-scoped: 041-file-browser
 * Domain: _platform/workspace-url (composes workspaceParams)
 *
 * @example URL:
 * /workspaces/my-proj/browser?worktree=/path&dir=src/lib&file=utils.ts&mode=source
 */

import { remoteViewParams } from '@/features/088-remote-view/params/remote-view.params';
import { workspaceParams } from '@/lib/params/workspace.params';
import { parseAsInteger, parseAsString, parseAsStringLiteral } from 'nuqs';
import { createSearchParamsCache } from 'nuqs/server';

export const fileBrowserParams = {
  /** Current directory path (relative to worktree root) */
  dir: parseAsString.withDefault(''),
  /** Selected file path (relative to worktree root) */
  file: parseAsString.withDefault(''),
  // Viewer mode. 'edit' is a legacy alias — browser-client coerces it to 'source'
  // on load. TODO: remove legacy 'edit' alias after 1 release (plan 083-md-editor / Finding 04).
  mode: parseAsStringLiteral(['source', 'rich', 'edit', 'preview', 'diff'] as const).withDefault(
    'preview'
  ),
  /** Left panel mode (Plan 043) */
  panel: parseAsStringLiteral(['tree', 'changes'] as const).withDefault('tree'),
  /** Line number to scroll to (Plan 047 Phase 6) */
  line: parseAsInteger,
  /**
   * Main-panel view selector. `null` = default (file/dir-driven); `'recent-feed'` swaps in
   * the Recent Changes Feed; `'remote'` swaps in the Remote View panel (Plan 088, Workshop 001).
   */
  view: parseAsStringLiteral(['recent-feed', 'remote'] as const),
};

/**
 * Combined server cache for workspace + file browser params.
 * Composes the remote-view `rv` param (business→business via the remote-view contract) so the
 * documented page-params set is complete; the client mirrors this in `useQueryStates` (browser-client).
 */
export const fileBrowserPageParamsCache = createSearchParamsCache({
  ...workspaceParams,
  ...fileBrowserParams,
  ...remoteViewParams,
});
