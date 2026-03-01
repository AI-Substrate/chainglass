'use client';

/**
 * Plan 059 / Subtask 001: ServerEventRoute — SSE→State Bridge Component
 *
 * Invisible React component that subscribes to an SSE channel and publishes
 * received events as GlobalStateSystem state paths. Each instance is driven
 * by a ServerEventRouteDescriptor that maps event types to state updates.
 *
 * Per DYK #1: Tracks lastProcessedIndex to avoid dropping messages when
 * React batches renders from rapid SSE events. Processes ALL messages
 * since last render, not just the last one.
 *
 * Per Workshop 005: Returns null (invisible wiring component).
 */

import { useEffect, useRef } from 'react';

import type { StateEntrySource } from '@chainglass/shared/state';

import { useSSE } from '@/hooks/useSSE';

import type { ServerEvent, ServerEventRouteDescriptor } from './server-event-router';
import { useStateSystem } from './state-provider';

interface ServerEventRouteProps {
  route: ServerEventRouteDescriptor;
}

export function ServerEventRoute({ route }: ServerEventRouteProps) {
  const state = useStateSystem();
  const { messages } = useSSE<ServerEvent>(`/api/events/${route.channel}`);
  const lastProcessedIndexRef = useRef(-1);

  useEffect(() => {
    const startIndex = lastProcessedIndexRef.current + 1;
    if (startIndex >= messages.length) return;

    for (let i = startIndex; i < messages.length; i++) {
      const event = messages[i];
      const updates = route.mapEvent(event);
      if (!updates) continue;

      const source: StateEntrySource = {
        origin: 'server',
        channel: route.channel,
        eventType: event.type,
      };

      for (const update of updates) {
        if (update.remove && update.instanceId) {
          state.removeInstance(route.stateDomain, update.instanceId);
          continue;
        }

        const path = update.instanceId
          ? `${route.stateDomain}:${update.instanceId}:${update.property}`
          : `${route.stateDomain}:${update.property}`;

        state.publish(path, update.value, source);
      }
    }

    lastProcessedIndexRef.current = messages.length - 1;
  }, [messages, route, state]);

  return null;
}
