/**
 * File browser URL params for the browser page.
 *
 * Plan-scoped: 041-file-browser
 * Domain: _platform/workspace-url (composes workspaceParams)
 *
 * @example URL:
 * /workspaces/my-proj/browser?worktree=/path&dir=src/lib&file=utils.ts&mode=source
 */

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
};

/** Combined server cache for workspace + file browser params */
export const fileBrowserPageParamsCache = createSearchParamsCache({
  ...workspaceParams,
  ...fileBrowserParams,
});
