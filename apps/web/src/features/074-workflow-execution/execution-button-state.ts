/**
 * Execution button state derivation — pure function.
 *
 * Maps ManagerExecutionStatus + actionPending → button visibility/enablement
 * per Workshop 001 state machine table.
 *
 * Plan 074: Phase 4 — UI Execution Controls
 */

import type { ActionPending } from './hooks/use-workflow-execution';
import type { ManagerExecutionStatus } from './workflow-execution-manager.types';

// ── Types ───────────────────────────────────────────────────────────

export interface ButtonVisibility {
  readonly visible: boolean;
  readonly enabled: boolean;
  readonly label?: string;
}

export interface ExecutionButtonState {
  readonly run: ButtonVisibility;
  readonly stop: ButtonVisibility;
  readonly restart: ButtonVisibility;
}

// ── Derivation ──────────────────────────────────────────────────────

/**
 * Derive button visibility and enablement from execution status.
 *
 * Workshop 001 state machine:
 * | Status    | Run              | Stop             | Restart          |
 * |-----------|------------------|------------------|------------------|
 * | idle      | ▶ Run (enabled)  | hidden           | hidden           |
 * | starting  | disabled+spinner | hidden           | hidden           |
 * | running   | hidden           | ⏹ Stop (enabled) | hidden           |
 * | stopping  | hidden           | disabled+spinner | hidden           |
 * | stopped   | ▶ Resume (en)    | hidden           | ↺ Restart (en)   |
 * | completed | hidden           | hidden           | ↺ Restart (en)   |
 * | failed    | ▶ Retry (en)     | hidden           | ↺ Restart (en)   |
 *
 * P4-DYK #2: If hydrating, hide all buttons (prevents stale clicks).
 * P4-DYK #3: actionPending disables the active button (gated on response).
 */
export function deriveButtonState(
  status: ManagerExecutionStatus,
  actionPending: ActionPending,
  hydrating: boolean
): ExecutionButtonState {
  // During hydration, hide everything (P4-DYK #2)
  if (hydrating) {
    return {
      run: { visible: false, enabled: false },
      stop: { visible: false, enabled: false },
      restart: { visible: false, enabled: false },
    };
  }

  switch (status) {
    case 'idle':
      return {
        run: { visible: true, enabled: actionPending === null, label: 'Run' },
        stop: { visible: false, enabled: false },
        restart: { visible: false, enabled: false },
      };

    case 'starting':
      return {
        run: { visible: true, enabled: false, label: 'Run' },
        stop: { visible: false, enabled: false },
        restart: { visible: false, enabled: false },
      };

    case 'running':
      return {
        run: { visible: false, enabled: false },
        stop: { visible: true, enabled: actionPending === null },
        restart: { visible: false, enabled: false },
      };

    case 'stopping':
      return {
        run: { visible: false, enabled: false },
        stop: { visible: true, enabled: false },
        restart: { visible: false, enabled: false },
      };

    case 'stopped':
      return {
        run: { visible: true, enabled: actionPending === null, label: 'Resume' },
        stop: { visible: false, enabled: false },
        restart: { visible: true, enabled: actionPending === null },
      };

    case 'completed':
      return {
        run: { visible: false, enabled: false },
        stop: { visible: false, enabled: false },
        restart: { visible: true, enabled: actionPending === null },
      };

    case 'failed':
      return {
        run: { visible: true, enabled: actionPending === null, label: 'Retry' },
        stop: { visible: false, enabled: false },
        restart: { visible: true, enabled: actionPending === null },
      };

    default:
      return {
        run: { visible: true, enabled: true, label: 'Run' },
        stop: { visible: false, enabled: false },
        restart: { visible: false, enabled: false },
      };
  }
}
