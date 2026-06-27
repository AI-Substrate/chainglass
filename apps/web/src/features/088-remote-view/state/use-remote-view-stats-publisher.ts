'use client';

/**
 * Hook wrapper binding the 5s-throttled remote-view stats publisher (T007) to the
 * client GlobalState instance. The viewport's HUD sampler calls this in addition to
 * `setHud` — purely additive, the HUD plane is unchanged — so agents get a
 * `remote-view:<ses>:{latency-ms,fps}` copy (Workshop 003 Q2).
 *
 * Plan 088 Phase 5 — T007.
 */
import { useMemo } from 'react';

import { useStateSystem } from '@/lib/state/state-provider';

import {
  type RemoteViewStatsPublisher,
  createRemoteViewStatsPublisher,
} from './remote-view-stats-publisher';

export function useRemoteViewStatsPublisher(): RemoteViewStatsPublisher {
  const state = useStateSystem();
  return useMemo(() => createRemoteViewStatsPublisher(state), [state]);
}
