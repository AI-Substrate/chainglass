/**
 * Terminal URL params for the terminal page.
 *
 * Plan-scoped: 064-tmux
 * Domain: terminal (composes workspaceParams)
 *
 * @example URL:
 * /workspaces/my-proj/terminal?worktree=/path&session=064-tmux
 */

import { workspaceParams } from '@/lib/params/workspace.params';
import { parseAsString } from 'nuqs';
import { createSearchParamsCache } from 'nuqs/server';

export const terminalParams = {
  session: parseAsString.withDefault(''),
};

export const terminalPageParamsCache = createSearchParamsCache({
  ...workspaceParams,
  ...terminalParams,
});
