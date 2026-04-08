'use client';

/**
 * useWorkflowExecution — React hook for workflow execution lifecycle.
 *
 * Hydrates initial execution state on mount (P4-DYK #2), subscribes to
 * GlobalState for live SSE updates, and wraps server actions with
 * response-gated actionPending state (Phase 3 DYK #3).
 *
 * Plan 074: Phase 4 — UI Execution Controls
 */

import { useCallback, useEffect, useState } from 'react';

import { useGlobalState } from '@/lib/state/use-global-state';
import {
  getWorkflowExecutionStatus,
  restartWorkflow,
  runWorkflow,
  stopWorkflow,
} from '../../../../app/actions/workflow-execution-actions';
import type { ManagerExecutionStatus } from '../workflow-execution-manager.types';
import type { SerializableExecutionStatus } from '../workflow-execution-manager.types';

// ── Browser-safe execution key ──────────────────────────────────────
// Must produce identical output to makeExecutionKey() in
// workflow-execution-manager.types.ts which uses Buffer.from().toString('base64url').
// P4-DYK #1: Buffer is not available in 'use client' components.
// btoa() + char replacement produces the same base64url encoding for ASCII paths.

function makeExecutionKeyClient(worktreePath: string, graphSlug: string): string {
  const raw = `${worktreePath}:${graphSlug}`;
  // encodeURIComponent + unescape handles UTF-8 → binary string for btoa
  const base64 = btoa(unescape(encodeURIComponent(raw)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ── Noop path for disabled state ────────────────────────────────────
const NOOP_PATH = '__noop_workflow_execution__';

// ── Hook types ──────────────────────────────────────────────────────

export type ActionPending = 'run' | 'stop' | 'restart' | null;

export interface WorkflowExecutionState {
  /** Current execution status (merged from hydration + SSE) */
  readonly status: ManagerExecutionStatus;
  /** Number of drive iterations completed */
  readonly iterations: number;
  /** Last status message from the engine */
  readonly lastMessage: string;
  /** True until initial getStatus call completes */
  readonly hydrating: boolean;
  /** True when worktreePath is undefined — all controls disabled */
  readonly disabled: boolean;
  /** Which action is currently in flight (null if none) */
  readonly actionPending: ActionPending;
  /** Start or resume the workflow */
  readonly run: () => Promise<void>;
  /** Stop the running workflow */
  readonly stop: () => Promise<void>;
  /** Restart the workflow from scratch */
  readonly restart: () => Promise<void>;
}

export interface UseWorkflowExecutionOptions {
  workspaceSlug: string;
  worktreePath?: string;
  graphSlug: string;
}

// ── Hook ────────────────────────────────────────────────────────────

export function useWorkflowExecution({
  workspaceSlug,
  worktreePath,
  graphSlug,
}: UseWorkflowExecutionOptions): WorkflowExecutionState {
  const disabled = !worktreePath;
  const resolvedPath = worktreePath ?? '';
  const key = worktreePath ? makeExecutionKeyClient(worktreePath, graphSlug) : '';

  // GlobalState subscriptions — use NOOP_PATH when disabled to avoid subscribing to ''
  const statusPath = key ? `workflow-execution:${key}:status` : NOOP_PATH;
  const iterationsPath = key ? `workflow-execution:${key}:iterations` : NOOP_PATH;
  const lastMessagePath = key ? `workflow-execution:${key}:lastMessage` : NOOP_PATH;

  const gsStatus = useGlobalState<ManagerExecutionStatus>(statusPath);
  const gsIterations = useGlobalState<number>(iterationsPath);
  const gsLastMessage = useGlobalState<string>(lastMessagePath);

  // Local state
  const [hydrating, setHydrating] = useState(!disabled);
  const [localStatus, setLocalStatus] = useState<ManagerExecutionStatus>('idle');
  const [localIterations, setLocalIterations] = useState(0);
  const [localLastMessage, setLocalLastMessage] = useState('');
  const [actionPending, setActionPending] = useState<ActionPending>(null);

  // Hydrate initial state on mount (P4-DYK #2)
  useEffect(() => {
    if (disabled) return;
    let cancelled = false;

    getWorkflowExecutionStatus(workspaceSlug, resolvedPath, graphSlug)
      .then((result: SerializableExecutionStatus | null) => {
        if (cancelled) return;
        if (result) {
          setLocalStatus(result.status);
          setLocalIterations(result.iterations);
          setLocalLastMessage(result.lastMessage);
        }
        setHydrating(false);
      })
      .catch(() => {
        if (!cancelled) setHydrating(false);
      });

    return () => {
      cancelled = true;
    };
  }, [disabled, workspaceSlug, resolvedPath, graphSlug]);

  // Sync GlobalState → local state when SSE delivers updates
  useEffect(() => {
    if (gsStatus !== undefined) setLocalStatus(gsStatus);
  }, [gsStatus]);

  useEffect(() => {
    if (gsIterations !== undefined) setLocalIterations(gsIterations);
  }, [gsIterations]);

  useEffect(() => {
    if (gsLastMessage !== undefined) setLocalLastMessage(gsLastMessage);
  }, [gsLastMessage]);

  // ── Action wrappers (gate on response per DYK #3) ────────────────

  const run = useCallback(async () => {
    if (disabled || actionPending) return;
    setActionPending('run');
    try {
      const result = await runWorkflow(workspaceSlug, resolvedPath, graphSlug);
      if (!result.ok) {
        console.error('[useWorkflowExecution] run failed:', result.error);
      }
    } catch (err) {
      console.error('[useWorkflowExecution] run error:', err);
    } finally {
      setActionPending(null);
    }
  }, [disabled, actionPending, workspaceSlug, resolvedPath, graphSlug]);

  const stop = useCallback(async () => {
    if (disabled || actionPending) return;
    setActionPending('stop');
    try {
      const result = await stopWorkflow(workspaceSlug, resolvedPath, graphSlug);
      if (!result.ok) {
        console.error('[useWorkflowExecution] stop failed:', result.error);
      }
    } catch (err) {
      console.error('[useWorkflowExecution] stop error:', err);
    } finally {
      setActionPending(null);
    }
  }, [disabled, actionPending, workspaceSlug, resolvedPath, graphSlug]);

  const restart = useCallback(async () => {
    if (disabled || actionPending) return;
    setActionPending('restart');
    try {
      const result = await restartWorkflow(workspaceSlug, resolvedPath, graphSlug);
      if (!result.ok) {
        console.error('[useWorkflowExecution] restart failed:', result.error);
      }
    } catch (err) {
      console.error('[useWorkflowExecution] restart error:', err);
    } finally {
      setActionPending(null);
    }
  }, [disabled, actionPending, workspaceSlug, resolvedPath, graphSlug]);

  return {
    status: localStatus,
    iterations: localIterations,
    lastMessage: localLastMessage,
    hydrating,
    disabled,
    actionPending,
    run,
    stop,
    restart,
  };
}
