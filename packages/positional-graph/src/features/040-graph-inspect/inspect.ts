/**
 * Plan 040: Graph Inspect CLI — inspectGraph implementation.
 *
 * Composes existing service reads into a unified InspectResult.
 * Pure composition — no new data access patterns.
 *
 * @packageDocumentation
 */

import type { WorkspaceContext } from '@chainglass/workflow';
import type { IPositionalGraphService } from '../../interfaces/index.js';
import type {
  InspectNodeEvent,
  InspectNodeResult,
  InspectOrchestratorSettings,
  InspectResult,
} from './inspect.types.js';

export async function buildInspectResult(
  service: IPositionalGraphService,
  ctx: WorkspaceContext,
  graphSlug: string
): Promise<InspectResult> {
  const status = await service.getStatus(ctx, graphSlug);
  const state = await service.loadGraphState(ctx, graphSlug);

  const nodes: InspectNodeResult[] = [];

  for (const line of status.lines) {
    for (const nodeStatus of line.nodes) {
      // Gather outputs
      let outputs: Record<string, unknown> = {};
      let outputCount = 0;
      const outputErrors: Array<{ code: string; message: string }> = [];
      try {
        const canEndResult = await service.canEnd(ctx, graphSlug, nodeStatus.nodeId);
        const savedNames = canEndResult.savedOutputs ?? [];
        outputCount = savedNames.length;

        const outputEntries = await Promise.all(
          savedNames.map(async (name) => {
            const data = await service.getOutputData(ctx, graphSlug, nodeStatus.nodeId, name);
            return [name, data.value] as const;
          })
        );
        outputs = Object.fromEntries(outputEntries.filter(([, v]) => v !== undefined));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        outputErrors.push({ code: 'OUTPUT_READ_FAILED', message: msg });
      }

      // Gather events from state — map full event objects for formatter display
      const nodeState = state.nodes?.[nodeStatus.nodeId];
      const rawEvents = nodeState?.events ?? [];
      const eventCount = rawEvents.length;
      const events: InspectNodeEvent[] = rawEvents.map((e) => ({
        eventId: e.event_id,
        type: e.event_type,
        actor: e.source as string,
        timestamp: e.created_at,
        status: e.status,
        stamps: Object.fromEntries(
          Object.entries(e.stamps ?? {}).map(([k, v]) => [
            k,
            { stampedAt: v.stamped_at, action: v.action },
          ])
        ),
      }));

      // Build orchestratorSettings from NodeStatusResult fields
      const orchestratorSettings: InspectOrchestratorSettings = {
        execution: nodeStatus.execution,
        ...(nodeStatus.noContext ? { noContext: true } : {}),
        ...(nodeStatus.contextFrom ? { contextFrom: nodeStatus.contextFrom } : {}),
      };

      // Gather questions
      const questions = (state.questions ?? [])
        .filter((q) => q.node_id === nodeStatus.nodeId)
        .map((q) => ({
          questionId: q.question_id,
          text: q.text,
          questionType: q.type ?? 'text',
          answered: !!q.answered_at,
          answer: q.answer != null ? String(q.answer) : undefined,
        }));

      // Build input map from nodeStatus.inputPack
      const inputs: Record<string, { fromNode: string; fromOutput: string; available: boolean }> =
        {};
      if (nodeStatus.inputPack?.inputs) {
        for (const [inputName, entry] of Object.entries(nodeStatus.inputPack.inputs)) {
          if (entry.status === 'available' && entry.detail.sources.length > 0) {
            const src = entry.detail.sources[0];
            inputs[inputName] = {
              fromNode: src.sourceNodeId,
              fromOutput: src.sourceOutput,
              available: true,
            };
          } else if (entry.status === 'waiting' && entry.detail.available.length > 0) {
            const src = entry.detail.available[0];
            inputs[inputName] = {
              fromNode: src.sourceNodeId,
              fromOutput: src.sourceOutput,
              available: false,
            };
          }
        }
      }

      // Compute duration
      const startedAt = nodeState?.started_at;
      const completedAt = nodeState?.completed_at;
      let durationMs: number | undefined;
      if (startedAt && completedAt) {
        durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();
      }

      // Extract error from state (node:error event stores code/message in node state)
      const stateError = nodeState?.error;
      const error = stateError
        ? {
            code: stateError.code,
            message: stateError.message,
            occurredAt: nodeState?.started_at ?? '',
          }
        : undefined;

      nodes.push({
        nodeId: nodeStatus.nodeId,
        unitSlug: nodeStatus.unitSlug,
        unitType: (nodeStatus.unitType as 'agent' | 'code' | 'user-input') ?? 'unknown',
        lineIndex: line.index,
        position: nodeStatus.position,
        execution: nodeStatus.execution,
        status: nodeStatus.status,
        startedAt,
        completedAt,
        durationMs,
        inputs,
        outputs,
        outputCount,
        eventCount,
        events,
        orchestratorSettings,
        fileMetadata: {},
        questions,
        error,
      });
    }
  }

  const failedNodes = nodes.filter((n) => n.status === 'blocked-error').length;
  const allErrors = nodes.flatMap((n) =>
    n.status === 'blocked-error' && n.error
      ? [{ code: n.error.code, message: `${n.nodeId}: ${n.error.message}` }]
      : []
  );

  return {
    graphSlug,
    graphStatus: status.status,
    updatedAt: state.updated_at ?? new Date().toISOString(),
    totalNodes: status.totalNodes,
    completedNodes: status.completedNodes,
    failedNodes,
    nodes,
    errors: allErrors,
  };
}
