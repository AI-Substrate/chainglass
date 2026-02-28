'use client';

/**
 * useWorkflowMutations — Centralizes workflow mutation calls + optimistic refresh.
 *
 * Keeps DnD handlers thin: they call hook methods, not server actions directly.
 * Each mutation updates local GraphStatusResult optimistically, then overwrites
 * with server response.
 *
 * Phase 3: Drag-and-Drop + Persistence — Plan 050
 */

import type { GraphStatusResult } from '@chainglass/positional-graph';
import { useCallback, useState } from 'react';
import {
  addLine as addLineAction,
  addNode as addNodeAction,
  moveNode as moveNodeAction,
  removeLine as removeLineAction,
  removeNode as removeNodeAction,
  setLineLabel as setLineLabelAction,
} from '../../../../app/actions/workflow-actions';

export interface UseWorkflowMutationsOptions {
  workspaceSlug: string;
  graphSlug: string;
  worktreePath?: string;
  graphStatus: GraphStatusResult;
  onStatusUpdate: (status: GraphStatusResult) => void;
}

export function useWorkflowMutations({
  workspaceSlug,
  graphSlug,
  worktreePath,
  graphStatus,
  onStatusUpdate,
}: UseWorkflowMutationsOptions) {
  const [isPending, setIsPending] = useState(false);

  const applyResult = useCallback(
    (result: { graphStatus?: GraphStatusResult; errors: unknown[] }) => {
      if (result.graphStatus) {
        onStatusUpdate(result.graphStatus);
      }
      setIsPending(false);
    },
    [onStatusUpdate]
  );

  const addNode = useCallback(
    async (lineId: string, unitSlug: string, atPosition?: number) => {
      setIsPending(true);
      const result = await addNodeAction(
        workspaceSlug,
        graphSlug,
        lineId,
        unitSlug,
        atPosition,
        worktreePath
      );
      applyResult(result);
      return result;
    },
    [workspaceSlug, graphSlug, worktreePath, applyResult]
  );

  const removeNode = useCallback(
    async (nodeId: string) => {
      setIsPending(true);
      const result = await removeNodeAction(workspaceSlug, graphSlug, nodeId, worktreePath);
      applyResult(result);
      return result;
    },
    [workspaceSlug, graphSlug, worktreePath, applyResult]
  );

  const moveNodeFn = useCallback(
    async (nodeId: string, toPosition?: number, toLineId?: string) => {
      setIsPending(true);
      const result = await moveNodeAction(
        workspaceSlug,
        graphSlug,
        nodeId,
        toPosition,
        toLineId,
        worktreePath
      );
      applyResult(result);
      return result;
    },
    [workspaceSlug, graphSlug, worktreePath, applyResult]
  );

  const addLineFn = useCallback(
    async (label?: string) => {
      setIsPending(true);
      const result = await addLineAction(workspaceSlug, graphSlug, label, worktreePath);
      applyResult(result);
      return result;
    },
    [workspaceSlug, graphSlug, worktreePath, applyResult]
  );

  const removeLineFn = useCallback(
    async (lineId: string) => {
      setIsPending(true);
      const result = await removeLineAction(workspaceSlug, graphSlug, lineId, worktreePath);
      applyResult(result);
      return result;
    },
    [workspaceSlug, graphSlug, worktreePath, applyResult]
  );

  const setLineLabelFn = useCallback(
    async (lineId: string, label: string) => {
      setIsPending(true);
      const result = await setLineLabelAction(
        workspaceSlug,
        graphSlug,
        lineId,
        label,
        worktreePath
      );
      applyResult(result);
      return result;
    },
    [workspaceSlug, graphSlug, worktreePath, applyResult]
  );

  return {
    addNode,
    removeNode,
    moveNode: moveNodeFn,
    addLine: addLineFn,
    removeLine: removeLineFn,
    setLineLabel: setLineLabelFn,
    isPending,
  };
}
