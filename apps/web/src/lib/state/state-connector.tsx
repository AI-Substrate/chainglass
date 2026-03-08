'use client';

/**
 * Plan 053 Phase 5: GlobalStateConnector
 * Plan 059 Subtask 001: Extended with ServerEventRoute mounting.
 * Plan 072 Phase 4: GlobalState re-enabled — multiplexed SSE is active.
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
 * Each route subscribes to a channel from the MultiplexedSSEProvider
 * (Plan 072) — all channels share one EventSource connection.
 */

import type React from 'react';
import { useState } from 'react';

import { registerWorktreeState } from '@/features/041-file-browser/state/register';
import { WorktreeStatePublisher } from '@/features/041-file-browser/state/worktree-publisher';

import { ServerEventRoute } from './server-event-route';
import type { ServerEventRouteDescriptor } from './server-event-router';
import { useStateSystem } from './state-provider';
import { workUnitStateRoute } from './work-unit-state-route';

/**
 * Server event routes — domains that bridge SSE events to GlobalStateSystem.
 * Each entry mounts one invisible bridge component; all routes share the
 * single multiplexed SSE connection provided by Plan 072.
 * Add new route descriptors here as domains opt in (see Workshop 005).
 */
const SERVER_EVENT_ROUTES: ServerEventRouteDescriptor[] = [
  workUnitStateRoute,
  // Phase 3 will add agentStateRoute here
];

interface GlobalStateConnectorProps {
  slug: string;
  worktreeBranch?: string;
}

export function GlobalStateConnector({
  slug,
  worktreeBranch,
}: GlobalStateConnectorProps): React.JSX.Element {
  const state = useStateSystem();

  // Register domains synchronously on first render via useState initializer.
  // Must complete before children's useEffect calls publish().
  useState(() => {
    registerWorktreeState(state);
    const registered = new Set(state.listDomains().map((d) => d.domain));
    for (const route of SERVER_EVENT_ROUTES) {
      if (registered.has(route.stateDomain)) continue;
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
