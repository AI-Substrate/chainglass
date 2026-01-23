/**
 * TypeScript types matching wf-phase.schema.json
 * Schema for phase state tracking (wf-data/wf-phase.json)
 */

/**
 * Who currently has control of the phase
 */
export type Facilitator = 'agent' | 'orchestrator';

/**
 * Current phase state
 */
export type PhaseState =
  | 'pending'
  | 'ready'
  | 'active'
  | 'blocked'
  | 'accepted'
  | 'complete'
  | 'failed';

/**
 * Types of actions that can be logged in status history
 */
export type ActionType =
  | 'prepare'
  | 'input'
  | 'handover'
  | 'accept'
  | 'preflight'
  | 'question'
  | 'error'
  | 'answer'
  | 'finalize';

/**
 * Entry in the status history log
 */
export interface StatusEntry {
  /** ISO-8601 timestamp of the action */
  timestamp: string;
  /** Actor who performed the action */
  from: Facilitator;
  /** Type of action performed */
  action: ActionType;
  /** Message ID reference (for input, question, answer actions) */
  message_id?: string;
  /** Human-readable description of the action */
  comment?: string;
  /** Optional payload data for the action */
  data?: Record<string, unknown>;
}

/**
 * Phase state tracking (wf-data/wf-phase.json)
 */
export interface WfPhaseState {
  /** Phase name (e.g., 'gather', 'process', 'report') */
  phase: string;
  /** Current control holder */
  facilitator: Facilitator;
  /** Current phase state */
  state: PhaseState;
  /** Append-only history of all interactions */
  status: StatusEntry[];
}
