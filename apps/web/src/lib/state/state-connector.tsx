'use client';

/**
 * Plan 053 Phase 5: GlobalStateConnector
 * Plan 059 Subtask 001: Extended with ServerEventRoute mounting.
 *
 * Invisible wiring component that registers state domains and mounts
 * publishers. Sits inside the provider scope for data sources and
 * bridges them to the GlobalStateSystem.
 *
 * Registration happens in useState initializer (synchronous, before children
 * render) so domains are available when publisher effects fire.
 * Fail-fast: if registration throws, the error propagates (DYK-18).
 *
 * SERVER_EVENT_ROUTES: Array of descriptors for server→state bridges.
 * Each route opens its own SSE EventSource connection.
 *
 * CONNECTION LIMIT NOTE (DYK #4):
 * HTTP/1.1 browsers cap concurrent connections per domain at ~6 (Chrome,
 * Firefox) or ~8 (Safari). Each ServerEventRoute opens one EventSource
 * connection. With N routes, that leaves (6-N) connections for REST fetches,
 * asset loading, and other SSE consumers (e.g., agent chat streams).
 *
 * Symptoms if exceeded: REST requests hang or queue, SSE connections fail
 * to establish, intermittent timeouts on API calls.
 *
 * Current routes: 0 (work-unit-state descriptor added in T004).
 * Safe ceiling: ~4 routes before investigating multiplexed SSE or HTTP/2.
 *
 * Future fix: A single multiplexed SSE endpoint that carries all channels
 * in one connection, with server-side channel filtering. This requires
 * changes to both the SSE API route and the useSSE hook.
 */

import { useState } from 'react';

import { registerWorktreeState } from '@/features/041-file-browser/state/register';
import { WorktreeStatePublisher } from '@/features/041-file-browser/state/worktree-publisher';

import { ServerEventRoute } from './server-event-route';
import type { ServerEventRouteDescriptor } from './server-event-router';
import { useStateSystem } from './state-provider';

/**
 * Server event routes — domains that bridge SSE events to GlobalStateSystem.
 * Each entry here creates one SSE connection and one invisible React component.
 * Add new route descriptors here as domains opt in (see Workshop 005).
 */
const SERVER_EVENT_ROUTES: ServerEventRouteDescriptor[] = [
  // Route descriptors added by consuming domains:
  // - T004 will add workUnitStateRoute here
  // - Phase 3 will add agentStateRoute here
];

interface GlobalStateConnectorProps {
  slug: string;
  worktreeBranch?: string;
}

export function GlobalStateConnector({ slug, worktreeBranch }: GlobalStateConnectorProps) {
  const state = useStateSystem();

  // Register domains synchronously on first render via useState initializer.
  // Must complete before children's useEffect calls publish().
  useState(() => {
    registerWorktreeState(state);
    for (const route of SERVER_EVENT_ROUTES) {
      state.registerDomain({
        domain: route.stateDomain,
        description: `Server-routed domain: ${route.stateDomain} (SSE channel: ${route.channel})`,
        multiInstance: route.multiInstance,
        properties: route.properties,
      });
    }
  });

  return (
    <>
      <WorktreeStatePublisher slug={slug} worktreeBranch={worktreeBranch} />
      {SERVER_EVENT_ROUTES.map((route) => (
        <ServerEventRoute key={route.channel} route={route} />
      ))}
    </>
  );
}
