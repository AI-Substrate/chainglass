/**
 * Shared workspace URL params used by ALL workspace-scoped pages.
 *
 * Domain: _platform/workspace-url
 * Plan: 041-file-browser Phase 2
 *
 * The workspace slug comes from the route path [slug], not search params.
 * The worktree path is the one universal search param shared across
 * all workspace pages (agents, samples, browser, workflows, etc).
 */

import { parseAsString } from 'nuqs';
import { createSearchParamsCache } from 'nuqs/server';

export const workspaceParams = {
  worktree: parseAsString.withDefault(''),
};

export const workspaceParamsCache = createSearchParamsCache(workspaceParams);
