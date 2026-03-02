/**
 * IWorkUnitStateService — Centralized work unit status registry.
 *
 * Tracks status for all work unit types (agents, workflow nodes, pods).
 * Publishes status changes via CentralEventNotifier → SSE → GlobalStateSystem.
 * Persists to JSON for server restart survival.
 *
 * NOTE: This is NOT IWorkUnitService (positional-graph workflow orchestration).
 * IWorkUnitStateService is a status aggregator — it does NOT own Q&A mechanics.
 * Question lifecycle is handled by WorkflowEvents (Plan 061). This service
 * only observes status like 'waiting_input' via the AgentWorkUnitBridge.
 *
 * State paths: `work-unit-state:{id}:status`, `work-unit-state:{id}:intent`,
 * `work-unit-state:{id}:name`
 *
 * @example
 * ```ts
 * // Register an agent as a work unit
 * service.register({
 *   id: 'agent-abc',
 *   name: 'Code Review Agent',
 *   creator: { type: 'agent', label: 'Claude Code' },
 *   sourceRef: { graphSlug: 'my-graph', nodeId: 'node-1' },
 * });
 *
 * // Update status when agent starts working
 * service.updateStatus('agent-abc', { status: 'working', intent: 'Reviewing PR #42' });
 *
 * // Look up by source reference (used by observer callbacks)
 * const entry = service.getUnitBySourceRef('my-graph', 'node-1');
 *
 * // Clean up stale entries
 * service.tidyUp();
 * ```
 */

import type {
  RegisterWorkUnitInput,
  UpdateWorkUnitInput,
  WorkUnitEntry,
  WorkUnitFilter,
} from '../work-unit-state/types.js';

export interface IWorkUnitStateService {
  /**
   * Register a new work unit in the registry.
   * Emits a 'registered' SSE event and persists to JSON.
   * Calls tidyUp() as part of registration housekeeping.
   */
  register(input: RegisterWorkUnitInput): void;

  /**
   * Remove a work unit from the registry.
   * Emits a 'removed' SSE event and persists to JSON.
   */
  unregister(id: string): void;

  /**
   * Update a work unit's status and optional intent.
   * Emits a 'status-changed' SSE event and persists to JSON.
   * No-op if the work unit is not registered.
   */
  updateStatus(id: string, input: UpdateWorkUnitInput): void;

  /**
   * Get a single work unit by ID. Returns undefined if not found.
   */
  getUnit(id: string): WorkUnitEntry | undefined;

  /**
   * Get all work units, optionally filtered.
   */
  getUnits(filter?: WorkUnitFilter): WorkUnitEntry[];

  /**
   * Look up a work unit by its source reference (graphSlug + nodeId).
   * Returns undefined if no work unit has that source ref.
   *
   * Used by AgentWorkUnitBridge to map WorkflowEvents observer
   * callbacks (which arrive with graphSlug + nodeId) back to
   * work unit entries.
   */
  getUnitBySourceRef(graphSlug: string, nodeId: string): WorkUnitEntry | undefined;

  /**
   * Remove stale entries: entries with lastActivityAt > 24h ago
   * whose status is NOT 'working' or 'waiting_input'.
   *
   * Called automatically on startup hydration and register().
   * Public for future housekeeping orchestrators.
   */
  tidyUp(): void;
}
