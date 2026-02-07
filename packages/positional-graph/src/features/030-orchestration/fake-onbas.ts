/**
 * FakeONBAS — Test double for IONBAS with configurable results and call tracking.
 * buildFakeReality — Test fixture builder for PositionalGraphReality.
 *
 * Per Workshop #5 §Testing Strategy and DYK-I5 (buildFakeReality for cross-phase reuse).
 *
 * @packageDocumentation
 */

import type { InputPack } from '../../interfaces/positional-graph-service.interface.js';
import type { IONBAS } from './onbas.types.js';
import type { OrchestrationRequest } from './orchestration-request.schema.js';
import type {
  ExecutionStatus,
  LineReality,
  NodeReality,
  PositionalGraphReality,
  QuestionReality,
} from './reality.types.js';

// ── FakeONBAS ───────────────────────────────────────

export class FakeONBAS implements IONBAS {
  private actions: OrchestrationRequest[] = [];
  private callIndex = 0;
  private readonly callHistory: PositionalGraphReality[] = [];

  /** Set a single canned response for every call. */
  setNextAction(action: OrchestrationRequest): void {
    this.actions = [action];
    this.callIndex = 0;
  }

  /** Set a queue of responses — each call consumes the next. Last repeats. */
  setActions(actions: OrchestrationRequest[]): void {
    this.actions = [...actions];
    this.callIndex = 0;
  }

  /** Get call history (each PositionalGraphReality passed in). */
  getHistory(): readonly PositionalGraphReality[] {
    return [...this.callHistory];
  }

  /** Reset all state. */
  reset(): void {
    this.actions = [];
    this.callIndex = 0;
    this.callHistory.length = 0;
  }

  getNextAction(reality: PositionalGraphReality): OrchestrationRequest {
    this.callHistory.push(reality);

    if (this.actions.length === 0) {
      return {
        type: 'no-action',
        graphSlug: reality.graphSlug,
        reason: 'graph-complete',
      };
    }

    const index = Math.min(this.callIndex, this.actions.length - 1);
    this.callIndex++;
    return this.actions[index];
  }
}

// ── buildFakeReality ────────────────────────────────

export interface FakeRealityOptions {
  graphSlug?: string;
  graphStatus?: 'pending' | 'in_progress' | 'complete' | 'failed';
  lines?: FakeLineInput[];
  nodes?: FakeNodeInput[];
  questions?: FakeQuestionInput[];
}

export interface FakeLineInput {
  lineId?: string;
  index?: number;
  label?: string;
  transition?: 'auto' | 'manual';
  transitionTriggered?: boolean;
  transitionOpen?: boolean;
  isComplete?: boolean;
  nodeIds: string[];
}

export interface FakeNodeInput {
  nodeId: string;
  lineIndex?: number;
  positionInLine?: number;
  unitSlug?: string;
  unitType?: 'agent' | 'code' | 'user-input';
  status?: ExecutionStatus;
  execution?: 'serial' | 'parallel';
  ready?: boolean;
  inputPack?: InputPack;
  pendingQuestionId?: string;
}

export interface FakeQuestionInput {
  questionId: string;
  nodeId: string;
  questionType?: 'text' | 'single' | 'multi' | 'confirm';
  text?: string;
  options?: Array<{ key: string; label: string }>;
  defaultValue?: string | boolean;
  isSurfaced?: boolean;
  isAnswered?: boolean;
  answer?: unknown;
}

/**
 * Build a minimal PositionalGraphReality for testing.
 * Fills in sensible defaults for all optional fields.
 * Per Workshop #5 §buildFakeReality Helper.
 */
export function buildFakeReality(options: FakeRealityOptions = {}): PositionalGraphReality {
  const graphSlug = options.graphSlug ?? 'test-graph';

  const nodes: NodeReality[] = (options.nodes ?? []).map((n, i) => ({
    nodeId: n.nodeId,
    lineIndex: n.lineIndex ?? 0,
    positionInLine: n.positionInLine ?? i,
    unitSlug: n.unitSlug ?? `unit-${n.nodeId}`,
    unitType: n.unitType ?? 'agent',
    status: n.status ?? 'pending',
    execution: n.execution ?? 'serial',
    ready: n.ready ?? n.status === 'ready',
    readyDetail: {
      precedingLinesComplete: true,
      transitionOpen: true,
      serialNeighborComplete: true,
      inputsAvailable: true,
      unitFound: true,
    },
    inputPack: n.inputPack ?? { ok: true, inputs: {} },
    pendingQuestionId: n.pendingQuestionId,
  }));

  const nodeMap = new Map(nodes.map((n) => [n.nodeId, n]));

  const lines: LineReality[] = options.lines
    ? options.lines.map((l, i) => ({
        lineId: l.lineId ?? `line-${String(i).padStart(3, '0')}`,
        index: l.index ?? i,
        label: l.label,
        transition: l.transition ?? 'auto',
        transitionTriggered: l.transitionTriggered ?? false,
        isComplete:
          l.isComplete ??
          l.nodeIds.every((id) => {
            const n = nodeMap.get(id);
            return n?.status === 'complete';
          }),
        isEmpty: l.nodeIds.length === 0,
        canRun: true,
        precedingLinesComplete: true,
        transitionOpen: l.transitionOpen ?? true,
        nodeIds: l.nodeIds,
      }))
    : [
        {
          lineId: 'line-000',
          index: 0,
          transition: 'auto' as const,
          transitionTriggered: false,
          isComplete: nodes.every((n) => n.status === 'complete'),
          isEmpty: nodes.length === 0,
          canRun: true,
          precedingLinesComplete: true,
          transitionOpen: true,
          nodeIds: nodes.map((n) => n.nodeId),
        },
      ];

  const questions: QuestionReality[] = (options.questions ?? []).map((q) => ({
    questionId: q.questionId,
    nodeId: q.nodeId,
    questionType: q.questionType ?? 'text',
    text: q.text ?? 'Default question?',
    options: q.options,
    defaultValue: q.defaultValue,
    askedAt: '2026-02-05T10:00:00Z',
    surfacedAt: q.isSurfaced ? '2026-02-05T10:01:00Z' : undefined,
    isSurfaced: q.isSurfaced ?? false,
    answer: q.answer,
    answeredAt: q.isAnswered ? '2026-02-05T10:02:00Z' : undefined,
    isAnswered: q.isAnswered ?? false,
  }));

  const completedNodeIds = nodes.filter((n) => n.status === 'complete').map((n) => n.nodeId);
  const readyNodeIds = nodes.filter((n) => n.status === 'ready').map((n) => n.nodeId);
  const runningNodeIds = nodes
    .filter((n) => n.status === 'starting' || n.status === 'agent-accepted')
    .map((n) => n.nodeId);
  const waitingQuestionNodeIds = nodes
    .filter((n) => n.status === 'waiting-question')
    .map((n) => n.nodeId);
  const blockedNodeIds = nodes.filter((n) => n.status === 'blocked-error').map((n) => n.nodeId);

  const graphStatus =
    options.graphStatus ??
    (nodes.length > 0 && nodes.every((n) => n.status === 'complete')
      ? 'complete'
      : nodes.some((n) => n.status !== 'pending')
        ? 'in_progress'
        : 'pending');

  return {
    graphSlug,
    version: '1.0.0',
    snapshotAt: '2026-02-05T10:00:00Z',
    graphStatus,
    lines,
    nodes: nodeMap,
    questions,
    podSessions: new Map(),

    currentLineIndex: lines.findIndex((l) => !l.isComplete),
    readyNodeIds,
    runningNodeIds,
    waitingQuestionNodeIds,
    blockedNodeIds,
    completedNodeIds,
    pendingQuestions: questions.filter((q) => !q.isAnswered),
    isComplete: graphStatus === 'complete',
    isFailed: graphStatus === 'failed',
    totalNodes: nodes.length,
    completedCount: completedNodeIds.length,
  };
}
