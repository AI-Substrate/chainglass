'use client';

/**
 * WorkflowSSEConnector — Bridges SSE workflow-execution events to GlobalState.
 *
 * Lightweight alternative to GlobalStateConnector for pages that don't have
 * FileChangeProvider (e.g., workflow editor). Registers only the
 * workflow-execution domain and mounts the ServerEventRoute bridge.
 *
 * Plan 076 FX003: Fix SSE → GlobalState path on workflow page.
 */

import { useState } from 'react';

import { ServerEventRoute } from '@/lib/state/server-event-route';
import { useStateSystem } from '@/lib/state/state-provider';
import { workflowExecutionRoute } from '@/lib/state/workflow-execution-route';

export function WorkflowSSEConnector(): React.JSX.Element {
  const state = useStateSystem();

  useState(() => {
    const registered = new Set(state.listDomains().map((d) => d.domain));
    if (!registered.has(workflowExecutionRoute.stateDomain)) {
      state.registerDomain({
        domain: workflowExecutionRoute.stateDomain,
        description: `Server-routed domain: ${workflowExecutionRoute.stateDomain} (SSE channel: ${workflowExecutionRoute.channel})`,
        multiInstance: workflowExecutionRoute.multiInstance,
        properties: workflowExecutionRoute.properties,
      });
    }
  });

  return <ServerEventRoute route={workflowExecutionRoute} />;
}
