/**
 * Plan 059 Phase 2: WorkUnit State System — Types
 *
 * Types for the centralized work unit status registry.
 * Any work unit source (agent, workflow node, pod) can register
 * and publish status changes through IWorkUnitStateService.
 *
 * NOTE: This is NOT IWorkUnitService (positional-graph workflow orchestration).
 * IWorkUnitStateService tracks status and questions across all work unit types.
 * IWorkUnitService executes work units within workflow graphs.
 */

// ── Work Unit Status ──

/** Possible statuses for a tracked work unit. */
export type WorkUnitStatus = 'idle' | 'working' | 'waiting_input' | 'error' | 'completed';

/** What created this work unit — enables filtering by source type. */
export interface WorkUnitCreator {
  /** Source type (e.g., 'agent', 'workflow-node', 'pod') */
  type: string;
  /** Human-readable label for the creator */
  label: string;
}

/**
 * Optional reference linking a work unit back to its source in
 * a positional graph. Used by AgentWorkUnitBridge to map
 * WorkflowEvents observer callbacks back to work unit entries.
 */
export interface WorkUnitSourceRef {
  /** Positional graph slug */
  graphSlug: string;
  /** Node ID within the graph */
  nodeId: string;
}

// ── Work Unit Entry ──

/** A registered work unit in the state registry. */
export interface WorkUnitEntry {
  /** Unique identifier for this work unit */
  id: string;
  /** Human-readable name */
  name: string;
  /** Current status */
  status: WorkUnitStatus;
  /** What created this work unit */
  creator: WorkUnitCreator;
  /** Optional short description of current activity */
  intent?: string;
  /** Optional source reference for graph-based work units */
  sourceRef?: WorkUnitSourceRef;
  /** ISO timestamp of registration */
  registeredAt: string;
  /** ISO timestamp of last status change or activity */
  lastActivityAt: string;
}

// ── Filter ──

/** Filter criteria for querying work units. */
export interface WorkUnitFilter {
  /** Filter by status */
  status?: WorkUnitStatus;
  /** Filter by creator type */
  creatorType?: string;
}

// ── Registration Input ──

/** Input for registering a new work unit. */
export interface RegisterWorkUnitInput {
  /** Unique identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Initial status (defaults to 'idle' if omitted) */
  status?: WorkUnitStatus;
  /** What created this work unit */
  creator: WorkUnitCreator;
  /** Optional intent description */
  intent?: string;
  /** Optional source reference for graph-based work units */
  sourceRef?: WorkUnitSourceRef;
}

// ── Status Update Input ──

/** Input for updating a work unit's status. */
export interface UpdateWorkUnitInput {
  /** New status */
  status: WorkUnitStatus;
  /** Optional updated intent description */
  intent?: string;
}

// ── SSE Event Shapes (DYK-R-04) ──

/**
 * SSE event emitted when a work unit's status changes.
 * CentralEventNotifier.emit('work-unit-state', 'status-changed', data)
 */
export interface WorkUnitStatusEvent {
  type: 'status-changed';
  id: string;
  status: WorkUnitStatus;
  intent?: string;
  name: string;
}

/**
 * SSE event emitted when a new work unit is registered.
 * CentralEventNotifier.emit('work-unit-state', 'registered', data)
 */
export interface WorkUnitRegisteredEvent {
  type: 'registered';
  id: string;
  name: string;
  status: WorkUnitStatus;
  creatorType: string;
  creatorLabel: string;
}

/**
 * SSE event emitted when a work unit is unregistered.
 * CentralEventNotifier.emit('work-unit-state', 'removed', data)
 */
export interface WorkUnitRemovedEvent {
  type: 'removed';
  id: string;
}

/** Union of all work unit SSE event shapes. */
export type WorkUnitEvent = WorkUnitStatusEvent | WorkUnitRegisteredEvent | WorkUnitRemovedEvent;
