/**
 * Builder for PositionalGraphReality.
 *
 * Composes existing service outputs (GraphStatusResult + State + pod sessions)
 * into an immutable snapshot. Never re-implements gate logic (Finding #01).
 *
 * @packageDocumentation
 */

import type { GraphStatusResult } from '../../interfaces/positional-graph-service.interface.js';
import type { State } from '../../schemas/state.schema.js';
import type {
  LineReality,
  NodeReality,
  PositionalGraphReality,
  QuestionReality,
} from './reality.types.js';

export interface BuildRealityOptions {
  statusResult: GraphStatusResult;
  state: State;
  podSessions?: Map<string, string>;
  snapshotAt?: string;
}

export function buildPositionalGraphReality(options: BuildRealityOptions): PositionalGraphReality {
  const { statusResult, state, podSessions = new Map(), snapshotAt } = options;
  const now = snapshotAt ?? new Date().toISOString();

  // Build lines
  const lines: LineReality[] = statusResult.lines.map((ls) => ({
    lineId: ls.lineId,
    index: ls.index,
    label: ls.label,
    transition: ls.transition,
    transitionTriggered: ls.transitionTriggered,
    isComplete: ls.complete,
    isEmpty: ls.empty,
    canRun: ls.canRun,
    precedingLinesComplete: ls.precedingLinesComplete,
    transitionOpen: ls.transitionOpen,
    nodeIds: ls.nodes.map((n) => n.nodeId),
  }));

  // Build nodes map
  const nodes = new Map<string, NodeReality>();
  for (const ls of statusResult.lines) {
    for (const ns of ls.nodes) {
      nodes.set(ns.nodeId, {
        nodeId: ns.nodeId,
        lineIndex: ls.index,
        positionInLine: ns.position,
        unitSlug: ns.unitSlug,
        unitType: ns.unitType,
        status: ns.status,
        execution: ns.execution,
        ready: ns.ready,
        readyDetail: {
          precedingLinesComplete: ns.readyDetail.precedingLinesComplete,
          transitionOpen: ns.readyDetail.transitionOpen,
          serialNeighborComplete: ns.readyDetail.serialNeighborComplete,
          inputsAvailable: ns.readyDetail.inputsAvailable,
          unitFound: ns.readyDetail.unitFound,
          reason: ns.readyDetail.reason,
        },
        inputPack: ns.inputPack,
        pendingQuestionId: ns.pendingQuestion?.questionId,
        error: ns.error
          ? { code: ns.error.code, message: ns.error.message, occurredAt: ns.error.occurredAt }
          : undefined,
        startedAt: ns.startedAt,
        completedAt: ns.completedAt,
      });
    }
  }

  // Build questions — DYK-I2: normalize options from string[] to { key, label }[]
  const questions: QuestionReality[] = (state.questions ?? []).map((q) => ({
    questionId: q.question_id,
    nodeId: q.node_id,
    questionType: q.type,
    text: q.text,
    options: q.options?.map((s) => ({ key: s, label: s })),
    defaultValue: q.default as string | boolean | undefined,
    askedAt: q.asked_at,
    surfacedAt: q.surfaced_at,
    isSurfaced: q.surfaced_at !== undefined && q.surfaced_at !== null,
    answer: q.answer,
    answeredAt: q.answered_at,
    isAnswered: q.answer !== undefined && q.answer !== null,
  }));

  // Convenience accessors — derived from existing GraphStatusResult
  const readyNodeIds = statusResult.readyNodes;
  const runningNodeIds = statusResult.runningNodes;
  const waitingQuestionNodeIds = statusResult.waitingQuestionNodes;
  const blockedNodeIds = statusResult.blockedNodes;
  const completedNodeIds = statusResult.completedNodeIds;
  const pendingQuestions = questions.filter((q) => !q.isAnswered);

  // DYK-I3: currentLineIndex = lines.length when all complete (past-the-end sentinel)
  const firstIncomplete = lines.findIndex((l) => !l.isComplete);
  const currentLineIndex = firstIncomplete === -1 ? lines.length : firstIncomplete;

  return {
    graphSlug: statusResult.graphSlug,
    version: statusResult.version,
    snapshotAt: now,
    graphStatus: statusResult.status,
    lines,
    nodes,
    questions,
    podSessions,

    currentLineIndex,
    readyNodeIds,
    runningNodeIds,
    waitingQuestionNodeIds,
    blockedNodeIds,
    completedNodeIds,
    pendingQuestions,
    isComplete: statusResult.status === 'complete',
    isFailed: statusResult.status === 'failed',
    totalNodes: statusResult.totalNodes,
    completedCount: statusResult.completedNodes,
  };
}
