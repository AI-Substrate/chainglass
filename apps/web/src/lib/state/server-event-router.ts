/**
 * Plan 059 / Subtask 001: Server Event Router — Types
 *
 * Generic bridge from server-side central events (Plan 027 SSE) to
 * client-side GlobalStateSystem paths (Plan 053). Each domain provides
 * a route descriptor mapping SSE event types to state path updates.
 *
 * Per Workshop 005: ~60 lines replaces ~200 lines of bespoke per-domain wiring.
 * Extends ADR-0007: status-level values go inline in SSE; full entity data
 * still uses notification-fetch via REST.
 */

import type { StatePropertyDescriptor } from '@chainglass/shared/state';

/**
 * What arrives from SSE (Plan 027 shape).
 * The `type` field is the event type string from CentralEventNotifierService.emit().
 */
export interface ServerEvent {
  type: string;
  [key: string]: unknown;
}

/**
 * What gets published to GlobalStateSystem per event.
 * Each mapEvent call can produce multiple updates (e.g., status + intent from one event).
 */
export interface StateUpdate {
  /** Instance ID for multi-instance domains (e.g., agent ID, workflow run ID) */
  instanceId?: string;
  /** Property name — becomes the final segment of the state path */
  property: string;
  /** Value to publish at this state path */
  value: unknown;
  /** If true, removes this instance from the state system instead of publishing */
  remove?: boolean;
}

/**
 * Route descriptor: maps an SSE channel to GlobalStateSystem state paths.
 *
 * A domain opts into server→state routing by creating one of these
 * (~15 lines) and adding it to the SERVER_EVENT_ROUTES array in
 * GlobalStateConnector. The ServerEventRoute component handles the rest.
 *
 * Per DYK insight #3: `properties` uses `StatePropertyDescriptor[]` (which
 * includes description) to match `StateDomainDescriptor.properties` directly.
 */
export interface ServerEventRouteDescriptor {
  /** SSE channel to subscribe to (matches a WorkspaceDomain value) */
  channel: string;
  /** Domain name in GlobalStateSystem for state path prefixes */
  stateDomain: string;
  /** Whether this domain supports multiple concurrent instances (most do) */
  multiInstance: boolean;
  /**
   * Properties this domain publishes — used for domain registration.
   * Must include `description` field (matches StatePropertyDescriptor shape).
   */
  properties: StatePropertyDescriptor[];
  /**
   * Map an SSE event to state path updates.
   * Return null to ignore unknown event types (forward compatibility).
   * Return an empty array to acknowledge but skip the event.
   */
  mapEvent: (event: ServerEvent) => StateUpdate[] | null;
}
